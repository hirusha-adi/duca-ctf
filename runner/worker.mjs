import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { decryptRegistryPassword } from "../src/lib/hosting/secrets.mjs";
import { LABELS, resourceLabels, resourceName, ownedResource, findOwnedContainer, inspectOwnedContainer, stopOwnedContainer, removeGeneration } from "./resources.mjs";
import { allocateServicePorts, buildAppContainerConfig, guardEpochChanged, imageRegistryServer, serviceAddresses, serviceHostsFile, serviceOrder } from "./runtime-plan.mjs";
import { buildGuardContainerConfig, subnetCandidate } from "./network-policy.mjs";
import { sanitizedOperationError } from "./diagnostics.mjs";

export const TERMINAL_STATES = ["EXPIRED", "DELETED"];
const LEASE_MS = 60000;

export class StaleOperation extends Error {}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class InstanceWorker {
  constructor({ db, engine, signal, dataDir = process.env.HOSTED_DATA_DIR || "/app/data/hosted", hostDataDir = process.env.HOSTED_HOST_DATA_DIR || dataDir, guardImage = process.env.HOSTED_GUARD_IMAGE || "duca-ctf-instance-guard:latest" }) {
    this.db = db; this.engine = engine; this.signal = signal; this.dataDir = path.resolve(dataDir); this.hostDataDir = path.resolve(hostDataDir); this.guardImage = guardImage;
    this.active = new Set();
    this.operationControllers = new Map();
    this.operationSecrets = new Map();
  }

  async event(instance, action, message, level = "INFO", metadata = {}) {
    await this.db.instanceEvent.create({ data: { instanceId: instance.id, generation: instance.generation, action, message, level, metadata } }).catch(() => {});
  }

  async claim(instance) {
    const token = randomUUID();
    const claimed = await this.db.hostedInstance.updateMany({
      where: { id: instance.id, generation: instance.generation, state: instance.state, desiredState: instance.desiredState, ...(instance.updatedAt ? { updatedAt: instance.updatedAt } : {}), OR: [{ operationLeaseUntil: null }, { operationLeaseUntil: { lte: new Date() } }] },
      data: { operationToken: token, operationLeaseUntil: new Date(Date.now() + LEASE_MS) },
    });
    if (!claimed.count) return null;
    const current = await this.db.hostedInstance.findUnique({ where: { id: instance.id } });
    return current?.operationToken === token && current.generation === instance.generation ? current : null;
  }

  async assertCurrent(instance, { allowExpired = false } = {}) {
    if (this.signal?.aborted) throw new StaleOperation("Runner is stopping");
    const current = await this.db.hostedInstance.findUnique({ where: { id: instance.id } });
    if (!current || current.generation !== instance.generation || current.operationToken !== instance.operationToken || current.desiredState !== instance.desiredState || current.state !== instance.state) throw new StaleOperation("Instance operation changed");
    if (!allowExpired && new Date(current.expiresAt).getTime() <= Date.now() && current.desiredState !== "DELETED") throw new StaleOperation("Instance expired");
    return current;
  }

  async save(instance, data) {
    const result = await this.db.hostedInstance.updateMany({ where: { id: instance.id, generation: instance.generation, operationToken: instance.operationToken, desiredState: instance.desiredState, state: instance.state }, data });
    if (!result.count) throw new StaleOperation("Instance operation changed");
    Object.assign(instance, data);
  }

  async usedPorts() {
    const used = new Set();
    for (const container of await this.engine.listContainers()) {
      for (const port of container.Ports || []) if (port.PublicPort) used.add(Number(port.PublicPort));
      // Stopped instances retain endpoints and reserve their original bindings.
      const current = await this.engine.inspectContainer(container.Id);
      for (const bindings of Object.values(current.HostConfig?.PortBindings || {})) for (const binding of bindings || []) if (binding.HostPort) used.add(Number(binding.HostPort));
    }
    return used;
  }

  async ensureNetwork(instance) {
    const name = resourceName(instance, "network");
    try {
      const network = await this.engine.inspectNetwork(name);
      if (!ownedResource(network.Labels, { instanceId: instance.id, generation: instance.generation, kinds: ["network"] })) throw new Error("Managed network name is already in use");
      return { name, id: network.Id, subnet: network.IPAM?.Config?.[0]?.Subnet, gateway: network.IPAM?.Config?.[0]?.Gateway };
    } catch (error) { if (error.status !== 404) throw error; }
    for (let attempt = 0; attempt < 256; attempt++) {
      await this.assertCurrent(instance);
      const subnet = subnetCandidate(instance.id, instance.generation, attempt);
      try {
        const network = await this.engine.request("POST", "/networks/create", { Name: name, CheckDuplicate: true, Driver: "bridge", Internal: false, Attachable: false, Labels: resourceLabels(instance, "network"), IPAM: { Driver: "default", Config: [{ Subnet: subnet }] }, Options: { "com.docker.network.bridge.enable_icc": "true" } });
        const inspected = await this.engine.inspectNetwork(network.Id);
        return { name, id: network.Id, subnet, gateway: inspected.IPAM?.Config?.[0]?.Gateway };
      } catch (error) { if (!/overlap|pool.*available/i.test(error.message)) throw error; }
    }
    throw new Error("No isolated challenge subnet is available");
  }

  async ensureVolumes(instance) {
    for (const volume of instance.template.volumes || []) {
      await this.assertCurrent(instance);
      const name = resourceName(instance, `volume-${volume}`);
      try {
        const current = await this.engine.inspectVolume(name);
        if (!ownedResource(current.Labels, { instanceId: instance.id, generation: instance.generation, kinds: ["volume"] })) throw new Error("Managed volume name is already in use");
      } catch (error) {
        if (error.status !== 404) throw error;
        await this.engine.request("POST", "/volumes/create", { Name: name, Labels: resourceLabels(instance, "volume") });
      }
    }
  }

  async mounts(instance, service, network) {
    const mounts = [];
    const instanceDirectory = path.join(this.dataDir, instance.id, `g${instance.generation}`);
    const base = path.join(instanceDirectory, "files");
    const hostsFilename = path.join(instanceDirectory, "runtime", "hosts");
    await fs.mkdir(path.dirname(hostsFilename), { recursive: true, mode: 0o755 });
    const hosts = serviceHostsFile(instance.template.services, network.subnet);
    try { await fs.writeFile(hostsFilename, hosts, { flag: "wx", mode: 0o444 }); }
    catch (error) { if (error.code !== "EEXIST") throw error; if (await fs.readFile(hostsFilename, "utf8") !== hosts) throw new Error("Instance service addresses changed unexpectedly"); }
    mounts.push({ Type: "bind", Source: path.join(this.hostDataDir, path.relative(this.dataDir, hostsFilename)), Target: "/etc/hosts", ReadOnly: true, BindOptions: { Propagation: "rprivate" } });
    for (const mount of service.mounts || []) {
      if (mount.type === "volume") {
        mounts.push({ Type: "volume", Source: resourceName(instance, `volume-${mount.source}`), Target: mount.target, ReadOnly: !!mount.readOnly });
        continue;
      }
      if (mount.type !== "config" || typeof instance.template.files?.[mount.source] !== "string") throw new Error("Invalid challenge configuration mount");
      const filename = path.resolve(base, mount.source);
      if (!filename.startsWith(`${base}${path.sep}`)) throw new Error("Configuration mount escapes its instance directory");
      await fs.mkdir(path.dirname(filename), { recursive: true, mode: 0o755 });
      const content = Buffer.from(instance.template.files[mount.source], "base64");
      try { await fs.writeFile(filename, content, { flag: "wx", mode: 0o444 }); }
      catch (error) { if (error.code !== "EEXIST") throw error; const existing = await fs.readFile(filename); if (!existing.equals(content)) throw new Error("Configuration file changed unexpectedly"); }
      const hostFilename = path.join(this.hostDataDir, path.relative(this.dataDir, filename));
      mounts.push({ Type: "bind", Source: hostFilename, Target: mount.target, ReadOnly: true, BindOptions: { Propagation: "rprivate" } });
    }
    return mounts;
  }

  async registryAuth(image, instance) {
    const server = imageRegistryServer(image);
    const credential = await this.db.registryCredential.findUnique({ where: { server } });
    if (!credential) return undefined;
    const password = decryptRegistryPassword(credential.passwordEncrypted, process.env.SESSION_SECRET);
    this.operationSecrets.get(instance?.operationToken)?.add(password);
    return { username: credential.username, password, serveraddress: server === "docker.io" ? "https://index.docker.io/v1/" : server };
  }

  async checkDisk() {
    const minimum = Number(process.env.HOSTED_MIN_FREE_DISK_MB ?? 5120);
    if (!Number.isSafeInteger(minimum) || minimum < 0) throw new Error("HOSTED_MIN_FREE_DISK_MB must be a nonnegative whole number");
    await fs.mkdir(this.dataDir, { recursive: true });
    const filesystem = await fs.statfs(this.dataDir, { bigint: true });
    if (filesystem.bavail * filesystem.bsize < BigInt(minimum) * 1024n * 1024n) throw new Error("Hosted challenge storage is below its free-space watermark");
  }

  async blockedAddresses(settings, ownNetwork) {
    const addresses = new Set((process.env.HOSTED_BLOCKED_ADDRESSES || "").split(",").map((entry) => entry.trim()).filter(Boolean));
    if (isIP(ownNetwork?.gateway || "")) addresses.add(ownNetwork.gateway);
    if (ownNetwork?.subnet) {
      const octets = ownNetwork.subnet.split("/")[0].split(".").map(Number);
      if (octets.length === 4) { octets[3] += 1; addresses.add(octets.join(".")); }
    }
    for (const value of [process.env.APP_ORIGIN, settings?.publicHost]) {
      if (!value) continue;
      const hostname = isIP(value) ? value : new URL(value.includes("://") ? value : `http://${value}`).hostname.replace(/^\[|\]$/g, "");
      if (isIP(hostname)) addresses.add(hostname);
      else for (const entry of await lookup(hostname, { all: true })) addresses.add(entry.address);
    }
    for (const network of await this.engine.listNetworks()) {
      for (const configuration of network.IPAM?.Config || []) if (isIP(configuration.Gateway || "")) addresses.add(configuration.Gateway);
    }
    const info = await this.engine.request("GET", "/info");
    if (isIP(info.Swarm?.NodeAddr || "")) addresses.add(info.Swarm.NodeAddr);
    return [...addresses];
  }

  async waitHealthy(instance, id, { required = true, timeout = 60000 } = {}) {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      await this.assertCurrent(instance);
      const container = await inspectOwnedContainer(this.engine, id, { instanceId: instance.id, generation: instance.generation, kinds: ["app", "guard"] });
      if (container.State?.Running && !container.State.Restarting && (container.State.Health?.Status === "healthy" || (!required && !container.State.Health))) return container;
      if (container.State?.Health?.Status === "unhealthy") throw new Error("Challenge service failed its health check");
      await sleep(300);
    }
    throw new Error("Challenge service did not become ready");
  }

  async startOwned(instance, id) {
    await this.assertCurrent(instance);
    const container = await inspectOwnedContainer(this.engine, id, { instanceId: instance.id, generation: instance.generation, kinds: ["app", "guard"] });
    if (container.State?.Running && !container.State.Restarting && container.State.Health?.Status === "unhealthy") {
      instance.healthRestarts ||= new Set();
      if (instance.healthRestarts.has(id)) throw new Error("Unhealthy service already restarted during this operation");
      instance.healthRestarts.add(id);
      await this.checkDisk();
      await this.assertCurrent(instance);
      instance.operationPhase = `health-recovery:${container.Config.Labels[LABELS.service] || "service"}`;
      await this.event(instance, "UNHEALTHY_SERVICE_RESTART", "Restarting an unhealthy instance service or network guard.", "WARN", { service: container.Config.Labels[LABELS.service], kind: container.Config.Labels[LABELS.kind] });
      await this.engine.request("POST", `/containers/${encodeURIComponent(id)}/restart?t=5`);
      return;
    }
    if (!container.State?.Running && !container.State?.Restarting) { await this.checkDisk(); await this.engine.request("POST", `/containers/${encodeURIComponent(id)}/start`); }
  }

  async ensureGuard(instance, service, network, settings, blockedAddresses) {
    const existing = await findOwnedContainer(this.engine, instance, service.name, "guard");
    if (existing) return existing.Id;
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('hosted-port-allocation'))`;
      await this.assertCurrent(instance);
      const used = await this.usedPorts();
      const { bindings } = allocateServicePorts(service.ports || [], used, { start: settings?.portRangeStart || 20000, end: settings?.portRangeEnd || 29999, offset: Math.floor(Math.random() * 10000) });
      const serviceAddress = serviceAddresses(instance.template.services, network.subnet)[service.name];
      const config = buildGuardContainerConfig({ instance, service, networkName: network.name, subnet: network.subnet, serviceAddress, portBindings: bindings, blockedAddresses, guardImage: this.guardImage });
      config.Labels = resourceLabels(instance, "guard", service.name);
      const created = await this.engine.request("POST", `/containers/create?name=${encodeURIComponent(resourceName(instance, `guard-${service.name}`))}`, config);
      return created.Id;
    }, { timeout: 30000 });
  }

  async endpoints(instance, records, settings) {
    const endpoints = [];
    for (const record of records) {
      const guard = await inspectOwnedContainer(this.engine, record.guardId, { instanceId: instance.id, generation: instance.generation, kinds: ["guard"] });
      const service = instance.template.services.find((item) => item.name === record.service);
      for (const port of service.ports || []) {
        const bindings = guard.HostConfig?.PortBindings?.[`${port.target}/${port.protocol}`] || [];
        for (const binding of bindings) endpoints.push({ service: service.name, host: settings?.publicHost || "", port: Number(binding.HostPort), target: port.target, protocol: port.protocol, scheme: port.scheme, label: port.label || "" });
      }
    }
    return endpoints;
  }

  async cleanupOldGenerations(instance) {
    const filter = { [LABELS.managed]: "true", [LABELS.instance]: instance.id };
    const resources = [...await this.engine.listContainers(filter), ...await this.engine.listNetworks(filter), ...await this.engine.listVolumes(filter)];
    const old = new Set(resources.filter((entry) => ownedResource(entry.Labels, { instanceId: instance.id }) && Number(entry.Labels[LABELS.generation]) < instance.generation).map((entry) => Number(entry.Labels[LABELS.generation])));
    for (const generation of old) { await this.assertCurrent(instance); await removeGeneration(this.engine, instance.id, generation); await fs.rm(path.join(this.dataDir, instance.id, `g${generation}`), { recursive: true, force: true }); }
  }

  async reconcile(instance) {
    const expired = new Date(instance.expiresAt).getTime() <= Date.now();
    if (expired || instance.desiredState === "DELETED") {
      // Deletion never starts resources, and remains scoped to this instance's labels.
      await this.assertCurrent(instance, { allowExpired: true });
      instance.operationPhase = "cleanup";
      await this.event(instance, "CLEANUP_STARTED", "Removing instance containers, networks, and volumes.");
      await removeGeneration(this.engine, instance.id, undefined, { maxGeneration: instance.generation });
      const directory = path.join(this.dataDir, instance.id);
      for (const entry of await fs.readdir(directory).catch((error) => { if (error.code === "ENOENT") return []; throw error; })) {
        if (/^g[1-9]\d*$/.test(entry) && Number(entry.slice(1)) <= instance.generation) await fs.rm(path.join(directory, entry), { recursive: true, force: true });
      }
      await this.save(instance, { state: instance.desiredState === "DELETED" ? "DELETED" : "EXPIRED", observedGeneration: instance.generation, endpoints: [], containers: [], lastError: null });
      await this.event(instance, expired ? "EXPIRED" : "DELETED", expired ? "Instance reached its two-hour deadline." : "Instance resources were destroyed.");
      return;
    }
    await this.assertCurrent(instance);
    await this.cleanupOldGenerations(instance);
    if (instance.desiredState === "STOPPED") {
      instance.operationPhase = "stop";
      const resources = await this.engine.listContainers({ [LABELS.managed]: "true", [LABELS.instance]: instance.id, [LABELS.generation]: String(instance.generation) });
      for (const kind of ["app", "guard"]) for (const container of resources) {
        if (!ownedResource(container.Labels, { instanceId: instance.id, generation: instance.generation, kinds: [kind] })) continue;
        await this.assertCurrent(instance);
        await stopOwnedContainer(this.engine, container.Id, { instanceId: instance.id, generation: instance.generation, kinds: [kind] });
      }
      const changed = instance.state !== "STOPPED";
      await this.save(instance, { state: "STOPPED", observedGeneration: instance.generation, lastError: null });
      if (changed) await this.event(instance, "STOPPED", "Instance stopped; volumes and endpoints are retained until the original deadline.");
      return;
    }

    const manifest = instance.template;
    if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.services) || !manifest.services.length) throw new Error("Invalid hosted challenge template snapshot");
    const settings = await this.db.hostingSettings.findUnique({ where: { id: "default" } });
    const records = Array.isArray(instance.containers) && instance.observedGeneration === instance.generation ? [...instance.containers] : [];
    const changed = instance.state !== "RUNNING";
    const restart = instance.state === "RESTARTING";
    await this.save(instance, { state: changed ? "STARTING" : "RUNNING", resourceMemoryMb: manifest.resources.memoryMb, resourceCpuMillicores: manifest.resources.cpuMillicores });
    const network = await this.ensureNetwork(instance);
    await this.ensureVolumes(instance);
    const blocked = await this.blockedAddresses(settings, network);

    for (const service of serviceOrder(manifest.services)) {
      await this.assertCurrent(instance);
      let record = records.find((item) => item.service === service.name);
      let app = await findOwnedContainer(this.engine, instance, service.name, "app");
      if (!record?.imageId) {
        if (app) {
          const current = await inspectOwnedContainer(this.engine, app.Id, { instanceId: instance.id, generation: instance.generation, kinds: ["app"] });
          record = { service: service.name, image: service.image, imageId: current.Image, digest: current.Config?.Labels?.["duca.hosted.image-digest"] || current.Image };
        } else {
          instance.operationPhase = `pull:${service.name}`;
          await this.checkDisk();
          await this.event(instance, "IMAGE_PULL_STARTED", `Pulling the prebuilt image for ${service.name}.`, "INFO", { service: service.name, image: service.image });
          const image = await this.engine.pullImage(service.image, await this.registryAuth(service.image, instance), { signal: this.operationControllers.get(instance.operationToken)?.signal });
          record = { service: service.name, image: service.image, imageId: image.id, digest: image.digest };
          await this.event(instance, "IMAGE_PULL_FINISHED", `Pinned an immutable image for ${service.name}.`, "INFO", { service: service.name, digest: image.digest });
        }
        const existingIndex = records.findIndex((item) => item.service === service.name);
        if (existingIndex >= 0) records[existingIndex] = record; else records.push(record);
        await this.save(instance, { containers: records, observedGeneration: instance.generation });
      }
      instance.operationPhase = `guard:${service.name}`;
      const guardId = await this.ensureGuard(instance, service, network, settings, blocked);
      await this.startOwned(instance, guardId);
      const guard = await this.waitHealthy(instance, guardId);
      if (app) {
        const current = await inspectOwnedContainer(this.engine, app.Id, { instanceId: instance.id, generation: instance.generation, kinds: ["app"] });
        if (current.HostConfig?.NetworkMode !== `container:${guardId}`) {
          // A guard can be lost independently of its application. Never reuse an
          // application attached to a stale or unguarded network namespace.
          await this.assertCurrent(instance);
          await this.engine.request("DELETE", `/containers/${encodeURIComponent(app.Id)}?force=1&v=1`);
          app = null;
        } else if (guardEpochChanged(record, current, guard)) {
          await this.assertCurrent(instance);
          await stopOwnedContainer(this.engine, app.Id, { instanceId: instance.id, generation: instance.generation, kinds: ["app"] });
          await this.event(instance, "SERVICE_NETWORK_REJOIN", `Rejoining ${service.name} to its restarted network guard.`, "INFO", { service: service.name });
        }
      }
      if (!app) {
        const config = buildAppContainerConfig({ instance, service, imageId: record.imageId, guardId, mounts: await this.mounts(instance, service, network), labels: { ...resourceLabels(instance, "app", service.name), "duca.hosted.image-digest": record.digest } });
        await this.assertCurrent(instance);
        app = await this.engine.request("POST", `/containers/create?name=${encodeURIComponent(resourceName(instance, `app-${service.name}`))}`, config);
      }
      record.appId = app.Id;
      record.guardId = guardId;
      record.guardStartedAt = guard.State.StartedAt;
      await this.save(instance, { containers: records });
      instance.operationPhase = `start:${service.name}`;
      if (changed) await this.event(instance, "SERVICE_STARTING", `Starting ${service.name}.`, "INFO", { service: service.name });
      if (restart) {
        await this.checkDisk();
        await this.assertCurrent(instance);
        await inspectOwnedContainer(this.engine, app.Id, { instanceId: instance.id, generation: instance.generation, kinds: ["app"] });
        await this.engine.request("POST", `/containers/${encodeURIComponent(app.Id)}/restart?t=5`);
      } else await this.startOwned(instance, app.Id);
      await this.waitHealthy(instance, app.Id, { required: !!service.healthcheck });
      if (changed) await this.event(instance, "SERVICE_READY", `${service.name} is ready.`, "INFO", { service: service.name });
    }
    await this.assertCurrent(instance);
    await this.save(instance, { state: "RUNNING", observedGeneration: instance.generation, endpoints: await this.endpoints(instance, records, settings), containers: records, lastError: null });
    if (changed) await this.event(instance, restart ? "RESTARTED" : "RUNNING", restart ? "Instance services restarted without resetting the deadline." : "Instance services are ready.");
  }

  async process(candidate) {
    const instance = await this.claim(candidate);
    if (!instance) return;
    const controller = new AbortController();
    this.operationControllers.set(instance.operationToken, controller);
    this.operationSecrets.set(instance.operationToken, new Set());
    const stop = () => controller.abort();
    this.signal?.addEventListener("abort", stop, { once: true });
    let checking = false;
    const intentMonitor = setInterval(async () => {
      if (checking) return;
      checking = true;
      try {
        const current = await this.db.hostedInstance.findUnique({ where: { id: instance.id } });
        if (!current || current.generation !== instance.generation || current.operationToken !== instance.operationToken || current.desiredState !== instance.desiredState || (current.state === "RESTARTING" && instance.state !== "RESTARTING") || new Date(current.expiresAt).getTime() <= Date.now()) controller.abort();
      } catch { controller.abort(); }
      finally { checking = false; }
    }, 1000);
    intentMonitor.unref();
    const heartbeat = setInterval(() => {
      this.db.hostedInstance.updateMany({ where: { id: instance.id, generation: instance.generation, operationToken: instance.operationToken }, data: { operationLeaseUntil: new Date(Date.now() + LEASE_MS) } }).catch(() => {});
    }, 15000);
    heartbeat.unref();
    let retry = null;
    try { await this.reconcile(instance); }
    catch (error) {
      if (!(error instanceof StaleOperation) && !controller.signal.aborted) {
        // Only a short generic message reaches players; registry responses and container output are not persisted.
        const message = "Instance operation failed. Check the instance event history and runner availability, then retry or recreate.";
        await this.save(instance, { state: "FAILED", lastError: message }).catch(() => {});
        await this.event(instance, "OPERATION_FAILED", message, "ERROR", sanitizedOperationError(error, instance, this.operationSecrets.get(instance.operationToken)));
        retry = new Date(Date.now() + 15000);
      }
    } finally {
      clearInterval(heartbeat);
      clearInterval(intentMonitor);
      this.signal?.removeEventListener("abort", stop);
      controller.abort();
      this.operationControllers.delete(instance.operationToken);
      this.operationSecrets.delete(instance.operationToken);
      await this.db.hostedInstance.updateMany({ where: { id: instance.id, operationToken: instance.operationToken }, data: { operationToken: null, operationLeaseUntil: retry } }).catch(() => {});
    }
  }

  async run() {
    await this.engine.assertRootless();
    const concurrency = Number(process.env.HOSTED_RUNNER_CONCURRENCY || 4);
    if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 16) throw new Error("HOSTED_RUNNER_CONCURRENCY must be between 1 and 16");
    const tasks = new Set();
    const launch = (instance) => {
      this.active.add(instance.id);
      const task = this.process(instance).catch(() => {}).finally(() => { this.active.delete(instance.id); tasks.delete(task); });
      tasks.add(task);
    };
    while (!this.signal?.aborted) {
      try {
        const base = { state: { notIn: TERMINAL_STATES }, OR: [{ operationLeaseUntil: null }, { operationLeaseUntil: { lte: new Date() } }] };
        const available = { AND: [base, { NOT: { state: "STOPPED", desiredState: "STOPPED" } }] };
        // Cleanup and stop commands get their own bounded lane so slow image
        // pulls never hold every slot needed to release resources.
        const urgent = await this.db.hostedInstance.findMany({ where: { AND: [base, { OR: [{ desiredState: "DELETED" }, { desiredState: "STOPPED", state: { not: "STOPPED" } }, { expiresAt: { lte: new Date() } }] }] }, orderBy: { updatedAt: "asc" }, take: concurrency + 1 });
        for (const instance of urgent) if (!this.active.has(instance.id) && tasks.size < concurrency + 1) launch(instance);
        if (tasks.size < concurrency) {
          const instances = await this.db.hostedInstance.findMany({ where: available, orderBy: { updatedAt: "asc" }, take: concurrency * 2 });
          for (const instance of instances) {
            if (this.signal?.aborted || tasks.size >= concurrency) break;
            if (!this.active.has(instance.id)) launch(instance);
          }
        }
      } catch { console.error("Hosted runner could not reconcile instances; it will retry."); }
      await sleep(1000);
    }
    await Promise.allSettled([...tasks]);
  }
}
