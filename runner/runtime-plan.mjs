export function serviceOrder(services) {
  const byName = new Map(services.map((service) => [service.name, service]));
  const visiting = new Set();
  const complete = new Set();
  const ordered = [];
  function visit(service) {
    if (visiting.has(service.name)) throw new Error("Service dependencies contain a cycle");
    if (complete.has(service.name)) return;
    visiting.add(service.name);
    for (const name of service.dependsOn || []) {
      if (!byName.has(name)) throw new Error("Service dependency does not exist");
      visit(byName.get(name));
    }
    visiting.delete(service.name);
    complete.add(service.name);
    ordered.push(service);
  }
  for (const service of services) visit(service);
  return ordered;
}

export function imageRegistryServer(reference) {
  const first = reference.split("/")[0];
  const server = reference.includes("/") && (first.includes(".") || first.includes(":") || first === "localhost") ? first.toLowerCase() : "docker.io";
  return ["index.docker.io", "registry-1.docker.io"].includes(server) ? "docker.io" : server;
}

export function guardEpochChanged(record, app, guard) {
  if (!app.State?.Running) return false;
  const epoch = guard.State?.StartedAt;
  if (!epoch) throw new Error("Guard startup epoch is unavailable");
  if (record.guardStartedAt) return record.guardStartedAt !== epoch;
  return Date.parse(app.State.StartedAt || "") < Date.parse(epoch);
}

export function serviceAddresses(services, subnet) {
  const match = /^(10\.\d{1,3}\.\d{1,3}\.)(\d{1,3})\/28$/.exec(subnet || "");
  if (!match || Number(match[2]) % 16 !== 0 || services.length > 8) throw new Error("Invalid isolated service address plan");
  return Object.fromEntries(services.map((service, index) => [service.name, `${match[1]}${Number(match[2]) + index + 2}`]));
}

export function serviceHostsFile(services, subnet) {
  const addresses = serviceAddresses(services, subnet);
  return `127.0.0.1 localhost\n::1 localhost ip6-localhost ip6-loopback\n${services.map((service) => `${addresses[service.name]} ${service.name}`).join("\n")}\n`;
}

export function allocateServicePorts(ports, used, { start = 20000, end = 29999, offset = 0 } = {}) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 20000 || end > 29999 || end < start) throw new Error("Hosted ports must be within 20000–29999");
  const count = end - start + 1;
  const bindings = {};
  const endpoints = [];
  let cursor = offset % count;
  for (const port of ports) {
    let selected;
    for (let attempt = 0; attempt < count; attempt++) {
      const candidate = start + (cursor++ % count);
      // Reserve both transports, so endpoint ownership stays unambiguous.
      if (!used.has(candidate)) { selected = candidate; used.add(candidate); break; }
    }
    if (selected === undefined) throw new Error("No hosted challenge ports are available");
    const key = `${port.target}/${port.protocol}`;
    (bindings[key] ||= []).push({ HostIp: "0.0.0.0", HostPort: String(selected) });
    endpoints.push({ target: port.target, port: selected, protocol: port.protocol, scheme: port.scheme, label: port.label || "" });
  }
  return { bindings, endpoints };
}

export function buildAppContainerConfig({ instance, service, imageId, guardId, mounts, labels }) {
  if (!/^sha256:[a-f0-9]{64}$/i.test(imageId)) throw new Error("An immutable image ID is required");
  return {
    Image: imageId,
    Labels: labels,
    ...(service.command ? { Cmd: service.command } : {}),
    ...(service.entrypoint ? { Entrypoint: service.entrypoint } : {}),
    Env: Object.entries(service.environment || {}).map(([key, value]) => `${key}=${value}`),
    ...(service.user ? { User: service.user } : {}),
    ...(service.workingDir ? { WorkingDir: service.workingDir } : {}),
    ...(service.healthcheck ? { Healthcheck: service.healthcheck } : {}),
    HostConfig: {
      NetworkMode: `container:${guardId}`,
      Memory: service.memoryMb * 1024 * 1024,
      MemorySwap: service.memoryMb * 1024 * 1024,
      NanoCpus: service.cpuMillicores * 1000000,
      PidsLimit: service.pidsLimit || 64,
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges:true"],
      Privileged: false,
      ReadonlyRootfs: service.readOnly === true,
      Init: true,
      RestartPolicy: { Name: "unless-stopped" },
      LogConfig: { Type: "json-file", Config: { "max-size": "20m", "max-file": "2" } },
      Mounts: mounts,
      ...(service.readOnly ? { Tmpfs: { "/tmp": "rw,nosuid,nodev,size=16777216" } } : {}),
    },
  };
}
