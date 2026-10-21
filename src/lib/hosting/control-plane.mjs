import { isIP } from "node:net";

export const INSTANCE_LIFETIME_MS = 2 * 60 * 60 * 1000;
export const TERMINAL_STATES = ["EXPIRED", "DELETED"];
export const DEFAULT_HOSTING_SETTINGS = {
  id: "default", maxInstances: 500, memoryBudgetMb: 4096, cpuBudgetMillicores: 2000,
  publicHost: "", portRangeStart: 20000, portRangeEnd: 29999,
};

export function hostingError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

export function publicHost(value) {
  if (typeof value !== "string" || value.length > 253) throw hostingError("Public host must be an IP address or hostname");
  const host = value.trim();
  if (host === "") return host;
  if (!isIP(host) && !/^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(host)) {
    throw hostingError("Public host must be an IP address or hostname without a scheme or port");
  }
  return host;
}

export function validateHostingSettings(input, current = DEFAULT_HOSTING_SETTINGS) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw hostingError("Settings must be an object");
  const result = { ...current };
  const limits = { maxInstances: [1, 10000], memoryBudgetMb: [64, 1048576], cpuBudgetMillicores: [25, 1000000], portRangeStart: [20000, 29999], portRangeEnd: [20000, 29999] };
  for (const [field, [min, max]] of Object.entries(limits)) {
    if (input[field] === undefined) continue;
    if (!Number.isSafeInteger(input[field]) || input[field] < min || input[field] > max) throw hostingError(`${field} must be a whole number from ${min} to ${max}`);
    result[field] = input[field];
  }
  if (input.publicHost !== undefined) result.publicHost = publicHost(input.publicHost);
  if (result.portRangeStart > result.portRangeEnd) throw hostingError("The port range must end at or after its start");
  return Object.fromEntries(Object.keys(DEFAULT_HOSTING_SETTINGS).map((field) => [field, result[field]]));
}

export function normalizeRegistryServer(value) {
  if (typeof value !== "string" || value.length > 255) throw hostingError("Registry server must be a hostname with an optional port");
  let server = value.trim().toLowerCase().replace(/^https:\/\//, "").replace(/\/+$/, "");
  if (["index.docker.io/v1", "index.docker.io", "registry-1.docker.io"].includes(server)) server = "docker.io";
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[1-9][0-9]{0,4})?$/.test(server)) throw hostingError("Registry server must be a hostname with an optional port");
  const port = server.split(":")[1];
  if (port && Number(port) > 65535) throw hostingError("Invalid registry port");
  return server;
}

export function manifestResources(template) {
  const resources = template?.resources;
  if (!resources || !Number.isSafeInteger(resources.memoryMb) || resources.memoryMb < 1 || !Number.isSafeInteger(resources.cpuMillicores) || resources.cpuMillicores < 1) {
    throw hostingError("The hosting template has invalid resource limits");
  }
  return resources;
}

export function holdsResources(instance) {
  if (TERMINAL_STATES.includes(instance.state)) return false;
  if (instance.state === "STOPPED") return instance.desiredState === "RUNNING";
  // Stop/delete requests retain their reservation until the worker confirms
  // shutdown. A command being queued does not mean its containers have stopped.
  return true;
}

export function hostingUsage(instances) {
  return instances.reduce((usage, instance) => {
    if (TERMINAL_STATES.includes(instance.state)) return usage;
    usage.instances += 1;
    if (holdsResources(instance)) {
      usage.memoryMb += instance.resourceMemoryMb;
      usage.cpuMillicores += instance.resourceCpuMillicores;
    }
    return usage;
  }, { instances: 0, memoryMb: 0, cpuMillicores: 0 });
}

function assertCapacity(instances, settings, existing, resources) {
  const others = instances.filter((instance) => instance.id !== existing?.id);
  const usage = hostingUsage(others);
  if (usage.instances + 1 > settings.maxInstances) throw hostingError("The global instance limit has been reached. Try again after an instance expires.", 409);
  if (usage.memoryMb + resources.memoryMb > settings.memoryBudgetMb || usage.cpuMillicores + resources.cpuMillicores > settings.cpuBudgetMillicores) {
    throw hostingError("The hosting resource pool is full. Stop an instance or try again later.", 409);
  }
}

export function serializeHostedInstance(instance, { admin = false, now = new Date() } = {}) {
  if (!instance) return null;
  const ready = instance.state === "RUNNING" && instance.observedGeneration === instance.generation && new Date(instance.expiresAt) > now;
  return {
    id: instance.id, challengeId: instance.challengeId, state: instance.state,
    desiredState: instance.desiredState, generation: instance.generation,
    observedGeneration: instance.observedGeneration, templateVersion: instance.templateVersion,
    internetEnabled: instance.internetEnabled, expiresAt: instance.expiresAt,
    createdAt: instance.createdAt, updatedAt: instance.updatedAt,
    endpoints: ready ? instance.endpoints : [],
    services: (instance.template?.services || []).map((service) => ({ name: service.name })),
    resources: { memoryMb: instance.resourceMemoryMb, cpuMillicores: instance.resourceCpuMillicores },
    memoryMb: instance.resourceMemoryMb, cpuMillicores: instance.resourceCpuMillicores,
    containerCount: Array.isArray(instance.containers) ? instance.containers.filter((container) => container.appId).length : 0,
    lastError: instance.lastError ? (admin ? instance.lastError : "This instance needs attention. Contact an organizer if retrying does not help.") : null,
    ...(admin ? { userId: instance.userId, containers: instance.containers, user: instance.user, challenge: instance.challenge } : {}),
  };
}

/** All mutations reserve capacity and desired state in the same transaction. */
export async function requestInstanceAction(db, { user, challengeId, instanceId, action, now = new Date() }, { authorizeChallenge, normalizeTemplate }) {
  const admin = user.role === "ADMIN";
  const allowed = admin ? ["start", "stop", "recreate", "restart", "destroy"] : ["start", "stop", "recreate"];
  if (!allowed.includes(action)) throw hostingError("Invalid instance action");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('hosting:capacity'))`;
    let existing;
    if (instanceId) {
      if (!admin) throw hostingError("Forbidden", 403);
      existing = await tx.hostedInstance.findUnique({ where: { id: instanceId } });
      if (!existing) throw hostingError("Instance not found", 404);
      challengeId = existing.challengeId;
    }
    const ownerId = existing?.userId ?? user.id;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`hosting:instance:${ownerId}:${challengeId}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${challengeId}))`;
    existing = await tx.hostedInstance.findUnique({ where: { userId_challengeId: { userId: ownerId, challengeId } } });
    const challenge = await tx.challenge.findUnique({ where: { id: challengeId }, include: { competition: true } });
    if (!challenge) throw hostingError("Challenge not found", 404);

    let data;
    if (action === "stop" || action === "destroy") {
      if (!existing) throw hostingError("Instance not found", 404);
      if (TERMINAL_STATES.includes(existing.state)) return existing;
      const expired = new Date(existing.expiresAt) <= now;
      const deleting = action === "destroy" || expired;
      if (!deleting && existing.state === "STOPPED" && existing.desiredState === "STOPPED") return existing;
      data = { desiredState: deleting ? "DELETED" : "STOPPED", state: deleting ? "DELETING" : "STOPPING" };
    } else {
      if (!challenge.hosted || !challenge.hostingEnabled) throw hostingError("Hosting is disabled for this challenge", 409);
      await authorizeChallenge(tx, challenge, { ...user, id: ownerId }, { admin });
      if (!challenge.hostingTemplate) throw hostingError("This challenge has no hosting template", 409);
      const settings = await tx.hostingSettings.upsert({ where: { id: "default" }, update: {}, create: DEFAULT_HOSTING_SETTINGS });
      if (!settings.publicHost) throw hostingError("An administrator must configure the public hosting address first", 409);
      const live = existing && !TERMINAL_STATES.includes(existing.state);
      const expired = live && new Date(existing.expiresAt) <= now;
      if (action === "restart" && (!live || expired)) throw hostingError("Only an unexpired instance can be restarted", 409);
      if (expired && action !== "recreate") throw hostingError("This instance has expired. Wait for cleanup or recreate it for a new lease.", 409);
      if (live && action === "start" && existing.desiredState === "RUNNING" && ["QUEUED", "STARTING", "RUNNING", "RECREATING", "RESTARTING"].includes(existing.state)) return existing;
      if (existing?.desiredState === "DELETED" && !TERMINAL_STATES.includes(existing.state)) throw hostingError("Instance cleanup is still in progress. Try again shortly.", 409);

      const fresh = !live || action === "recreate";
      const template = normalizeTemplate(fresh ? challenge.hostingTemplate : existing.template);
      const resources = manifestResources(template);
      const reservation = fresh && live && holdsResources(existing)
        ? { memoryMb: Math.max(existing.resourceMemoryMb, resources.memoryMb), cpuMillicores: Math.max(existing.resourceCpuMillicores, resources.cpuMillicores) }
        : resources;
      const instances = await tx.hostedInstance.findMany({ where: { state: { notIn: TERMINAL_STATES } }, select: { id: true, state: true, desiredState: true, resourceMemoryMb: true, resourceCpuMillicores: true } });
      assertCapacity(instances, settings, existing, reservation);
      data = {
        desiredState: "RUNNING", state: action === "recreate" && live ? "RECREATING" : action === "restart" ? "RESTARTING" : "QUEUED",
        template, templateVersion: fresh ? challenge.hostingVersion : existing.templateVersion,
        internetEnabled: fresh ? challenge.hostingInternetEnabled : existing.internetEnabled,
        resourceMemoryMb: reservation.memoryMb, resourceCpuMillicores: reservation.cpuMillicores,
        ...(fresh ? { generation: existing ? existing.generation + 1 : 1, expiresAt: new Date(now.getTime() + INSTANCE_LIFETIME_MS) } : {}),
        lastError: null,
      };
    }
    const instance = existing
      ? await tx.hostedInstance.update({ where: { id: existing.id }, data })
      : await tx.hostedInstance.create({ data: { userId: ownerId, challengeId, ...data } });
    await tx.instanceEvent.create({ data: {
      instanceId: instance.id, generation: instance.generation, actorId: user.id,
      action: `INSTANCE_${action.toUpperCase()}_REQUESTED`, message: `${action} requested`,
      metadata: { previousState: existing?.state ?? null, expiresAt: new Date(instance.expiresAt).toISOString() },
    } });
    return instance;
  }, { timeout: 15000 });
}
