import path from "node:path";
import { parseDocument, visit } from "yaml";
import yauzl from "yauzl";

export const GUARD_MEMORY_MB = 16;
export const GUARD_CPU_MILLICORES = 25;
export const MAX_BUNDLE_BYTES = 10 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 20 * 1024 * 1024;
const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };
function obj(value, label, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail(`${label} must be an object`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`Unsupported ${label} option: ${key}`);
  return value;
}
function integer(value, fallback, min, max, label) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) fail(`${label} must be between ${min} and ${max}`);
  return number;
}
function list(value, label, max = 100) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) fail(`${label} must be a list with at most ${max} entries`);
  return value;
}
function bool(value, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") fail("Boolean settings must be true or false");
  return value;
}
export function safeBundlePath(name) {
  if (typeof name !== "string" || !name || name.length > 240 || /[\\\x00-\x1f:]/.test(name) || name.startsWith("/") || name.split("/").some((part) => ["", ".", ".."].includes(part))) fail("Bundle file paths must be relative and cannot contain traversal");
  return name;
}
function targetPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.length > 240 || value.includes("\0") || value.split("/").includes("..") || value === "/") fail("Mount targets must be absolute container paths");
  return value;
}
function command(value) {
  if (value === undefined) return undefined;
  if (typeof value === "string") {
    if (value.length > 16000) fail("Command is too long");
    return ["/bin/sh", "-c", value];
  }
  if (!Array.isArray(value) || value.length > 100 || value.some((part) => typeof part !== "string" || part.length > 16000)) fail("Command must be text or a list of strings");
  return value;
}
function memory(value) {
  if (value === undefined) return 256;
  if (typeof value === "number") return integer(Math.ceil(value / 1048576), 256, 32, 4096, "Memory MiB");
  const match = /^(\d+(?:\.\d+)?)\s*([bkmg])(?:i?b)?$/i.exec(value);
  if (!match) fail("mem_limit must use a size such as 256m");
  const multiplier = { b: 1 / 1048576, k: 1 / 1024, m: 1, g: 1024 }[match[2].toLowerCase()];
  return integer(Math.ceil(Number(match[1]) * multiplier), 256, 32, 4096, "Memory MiB");
}
function duration(value, fallback, allowZero = false) {
  if (value === undefined) return fallback;
  const match = /^(\d+)(ms|s|m)$/.exec(String(value));
  if (!match) fail("Healthcheck durations must use ms, s or m");
  const ns = Number(match[1]) * { ms: 1e6, s: 1e9, m: 60e9 }[match[2]];
  return integer(ns, fallback, allowZero ? 0 : 1e6, 300e9, "Healthcheck duration");
}
function yaml(source) {
  if (Buffer.byteLength(source) > 1024 * 1024) fail("Compose YAML must be at most 1 MiB");
  const document = parseDocument(source, { uniqueKeys: true, schema: "core" });
  if (document.errors.length || document.warnings.length) fail("Compose YAML is invalid or uses unsupported tags");
  visit(document, { Alias() { fail("YAML aliases are not supported"); }, Node(_key, node) { if (node.tag) fail("Explicit YAML tags are not supported"); } });
  return document.toJS({ maxAliasCount: 0 });
}
function environment(value = {}) {
  if (Array.isArray(value)) {
    value = Object.fromEntries(value.map((item) => {
      if (typeof item !== "string" || !item.includes("=")) fail("Environment entries must contain an explicit value");
      return [item.slice(0, item.indexOf("=")), item.slice(item.indexOf("=") + 1)];
    }));
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Environment must be a mapping");
  const result = {};
  if (Object.keys(value).length > 100) fail("Too many environment variables");
  for (const [key, item] of Object.entries(value)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || !["string", "number", "boolean"].includes(typeof item) || String(item).length > 16000) fail("Environment values must be explicit scalar strings");
    if (String(item).includes("${")) fail("Host environment interpolation is not supported; provide explicit values");
    Object.defineProperty(result, key, { value: String(item), enumerable: true });
  }
  return result;
}
function ports(value) {
  return list(value, "Ports", 10).map((entry) => {
    let port;
    if (typeof entry === "string" || typeof entry === "number") {
      const match = /^(\d+)(?:\/(tcp|udp))?$/.exec(String(entry));
      if (!match) fail("Declare container ports only, for example '8080/tcp'; the platform allocates host ports");
      port = { target: Number(match[1]), protocol: match[2] || "tcp" };
    } else port = obj(entry, "port", ["target", "protocol", "app_protocol", "name"]);
    const protocol = port.protocol || "tcp";
    if (!["tcp", "udp"].includes(protocol)) fail("Port protocol must be tcp or udp");
    const target = integer(port.target, 0, 1, 65535, "Container port");
    const scheme = port.app_protocol || (protocol === "udp" ? "udp" : target === 80 || target === 8080 ? "http" : target === 443 ? "https" : "tcp");
    if (!["http", "https", "tcp", "udp"].includes(scheme) || (protocol === "udp") !== (scheme === "udp")) fail("Invalid endpoint protocol");
    if (port.name !== undefined && (typeof port.name !== "string" || port.name.length > 100)) fail("Port name must be at most 100 characters");
    return { target, protocol, scheme, label: port.name || `${scheme.toUpperCase()} ${target}` };
  });
}

export function normalizeHostingTemplate(source, inputFiles = {}) {
  if (source && typeof source === "object" && source.version === 1 && Array.isArray(source.services)) return validateNormalized(source);
  const value = typeof source === "string" ? yaml(source) : source;
  obj(value, "Compose", ["version", "services", "volumes", "configs", "name"]);
  if (!value.services || typeof value.services !== "object" || Array.isArray(value.services)) fail("Compose services are required");
  const names = Object.keys(value.services);
  if (!names.length || names.length > 8 || names.some((name) => !/^[a-z][a-z0-9_-]{0,39}$/.test(name))) fail("Use between 1 and 8 named services");
  const files = {};
  let fileBytes = 0;
  for (const [name, data] of Object.entries(inputFiles)) {
    safeBundlePath(name);
    if (typeof data !== "string" || data.length > Math.ceil(MAX_EXPANDED_BYTES / 3) * 4 || Buffer.from(data, "base64").toString("base64") !== data) fail("Invalid bundled file encoding");
    fileBytes += Buffer.byteLength(data, "base64");
    if (fileBytes > MAX_EXPANDED_BYTES) fail("Bundled configuration files exceed 20 MiB");
    Object.defineProperty(files, name, { value: data, enumerable: true, configurable: true });
  }
  const volumes = Object.keys(value.volumes || {});
  if (volumes.length > 32 || volumes.some((name) => !/^[a-zA-Z][a-zA-Z0-9_-]{0,60}$/.test(name))) fail("Invalid named volumes");
  for (const definition of Object.values(value.volumes || {})) if (definition != null && (typeof definition !== "object" || Object.keys(definition).length)) fail("Volumes must be local declarations without options");
  const configs = value.configs || {};
  for (const definition of Object.values(configs)) { obj(definition, "config", ["file"]); safeBundlePath(definition.file); if (!Object.hasOwn(files, definition.file)) fail("Config file is missing from the uploaded bundle"); }
  const services = names.map((name) => {
    const service = obj(value.services[name], `service ${name}`, ["image", "command", "entrypoint", "environment", "env_file", "ports", "expose", "volumes", "configs", "depends_on", "mem_limit", "cpus", "pids_limit", "healthcheck", "user", "working_dir", "read_only"]);
    if (typeof service.image !== "string" || service.image.length > 500 || !/^[A-Za-z0-9][A-Za-z0-9._/:@-]*$/.test(service.image) || service.image.includes("..") || service.image.includes("://")) fail("Every service requires a prebuilt registry image reference");
    let env = Object.create(null);
    for (const file of service.env_file === undefined ? [] : Array.isArray(service.env_file) ? service.env_file : [service.env_file]) {
      safeBundlePath(file);
      if (!Object.hasOwn(files, file)) fail("env_file is missing from the bundle");
      for (const line of Buffer.from(files[file], "base64").toString("utf8").split(/\r?\n/)) {
        if (!line.trim() || line.trim().startsWith("#")) continue;
        const index = line.indexOf("=");
        if (index < 1) fail("env_file entries must use NAME=value");
        env[line.slice(0, index).trim()] = line.slice(index + 1).trim();
      }
    }
    env = environment({ ...env, ...environment(service.environment) });
    const mounts = list(service.volumes, "Volumes", 20).map((mount) => {
      if (typeof mount !== "string") fail("Volume mounts must use source:/container/path[:ro] form");
      const [rawSource, target, mode, extra] = mount.split(":");
      if (extra || (mode !== undefined && mode !== "ro" && mode !== "rw")) fail("Unsupported volume mount options");
      targetPath(target);
      if (volumes.includes(rawSource)) return { type: "volume", source: rawSource, target, readOnly: mode === "ro" };
      const source = rawSource.replace(/^\.\//, "");
      safeBundlePath(source);
      if (!Object.hasOwn(files, source) || mode !== "ro") fail("Host binds are forbidden; bundled files must be mounted read-only");
      return { type: "config", source, target, readOnly: true };
    });
    for (const item of list(service.configs, "Configs", 20)) {
      const config = typeof item === "string" ? { source: item, target: `/${item}` } : obj(item, "service config", ["source", "target"]);
      if (!Object.hasOwn(configs, config.source)) fail("Unknown config source");
      mounts.push({ type: "config", source: configs[config.source].file, target: targetPath(config.target), readOnly: true });
    }
    if (mounts.some((mount) => ["/etc", "/etc/hosts", "/etc/resolv.conf", "/etc/hostname"].includes(path.posix.normalize(mount.target)))) fail("System network configuration mounts are reserved by the runner");
    if (new Set(mounts.map((mount) => mount.target)).size !== mounts.length) fail("Mount targets must be distinct");
    let dependsOn = service.depends_on || [];
    if (!Array.isArray(dependsOn)) {
      for (const definition of Object.values(dependsOn)) { obj(definition, "dependency", ["condition", "required", "restart"]); if (![undefined, "service_started", "service_healthy"].includes(definition.condition)) fail("Unsupported dependency condition"); }
      dependsOn = Object.keys(dependsOn);
    }
    if (dependsOn.some((dependency) => !names.includes(dependency) || dependency === name)) fail("Service dependencies must reference another declared service");
    let healthcheck;
    if (service.healthcheck !== undefined) {
      const health = obj(service.healthcheck, "healthcheck", ["test", "interval", "timeout", "start_period", "retries", "disable"]);
      if (!health.disable) {
        const Test = typeof health.test === "string" ? ["CMD-SHELL", health.test] : health.test;
        if (!Array.isArray(Test) || !["CMD", "CMD-SHELL"].includes(Test[0]) || Test.some((part) => typeof part !== "string") || Test.length > 100) fail("Healthcheck needs a CMD or CMD-SHELL test");
        healthcheck = { Test, Interval: duration(health.interval, 30e9), Timeout: duration(health.timeout, 5e9), StartPeriod: duration(health.start_period, 0, true), Retries: integer(health.retries, 3, 1, 10, "Healthcheck retries") };
      }
    }
    const cpuMillicores = integer(service.cpus === undefined ? 250 : Math.round(Number(service.cpus) * 1000), 250, 50, 4000, "CPU millicores");
    for (const field of ["user", "working_dir"]) if (service[field] !== undefined && (typeof service[field] !== "string" || service[field].length > 200 || service[field].includes("\0"))) fail(`Invalid ${field}`);
    return { name, image: service.image, ...(service.command !== undefined ? { command: command(service.command) } : {}), ...(service.entrypoint !== undefined ? { entrypoint: command(service.entrypoint) } : {}), environment: env, ports: ports(service.ports), memoryMb: memory(service.mem_limit), cpuMillicores, pidsLimit: integer(service.pids_limit, 64, 16, 512, "Process limit"), mounts, dependsOn, ...(healthcheck ? { healthcheck } : {}), ...(service.user !== undefined ? { user: service.user } : {}), ...(service.working_dir ? { workingDir: targetPath(service.working_dir) } : {}), readOnly: bool(service.read_only) };
  });
  if (services.reduce((count, service) => count + service.ports.length, 0) > 20) fail("At most 20 exposed ports are allowed per instance");
  const visiting = new Set(), visited = new Set();
  function walk(name) { if (visiting.has(name)) fail("Service dependencies contain a cycle"); if (visited.has(name)) return; visiting.add(name); services.find((service) => service.name === name).dependsOn.forEach(walk); visiting.delete(name); visited.add(name); }
  names.forEach(walk);
  const resources = services.reduce((total, service) => ({ memoryMb: total.memoryMb + service.memoryMb + GUARD_MEMORY_MB, cpuMillicores: total.cpuMillicores + service.cpuMillicores + GUARD_CPU_MILLICORES }), { memoryMb: 0, cpuMillicores: 0 });
  return { version: 1, services, volumes, files, resources };
}

function validateNormalized(value) {
  obj(value, "template", ["version", "services", "volumes", "files", "resources"]);
  const services = Object.create(null);
  for (const service of list(value.services, "Services", 8)) {
    obj(service, "normalized service", ["name", "image", "command", "entrypoint", "environment", "ports", "memoryMb", "cpuMillicores", "pidsLimit", "mounts", "dependsOn", "healthcheck", "user", "workingDir", "readOnly"]);
    if (typeof service.name !== "string" || !/^[a-z][a-z0-9_-]{0,39}$/.test(service.name)) fail("Invalid service name");
    if (services[service.name]) fail("Duplicate service names");
    services[service.name] = {
      image: service.image, ...(service.command ? { command: service.command } : {}), ...(service.entrypoint ? { entrypoint: service.entrypoint } : {}), environment: service.environment,
      ports: list(service.ports, "Ports", 10).map((port) => ({ target: port.target, protocol: port.protocol, app_protocol: port.scheme, name: port.label })),
      mem_limit: `${integer(service.memoryMb, 256, 32, 4096, "Memory")}m`, cpus: integer(service.cpuMillicores, 250, 50, 4000, "CPU") / 1000, pids_limit: service.pidsLimit,
      volumes: list(service.mounts, "Mounts", 40).map((mount) => { obj(mount, "mount", ["type", "source", "target", "readOnly"]); if (!["volume", "config"].includes(mount.type)) fail("Invalid mount type"); if (mount.type === "config" && mount.readOnly !== true) fail("Config mounts must be read-only"); return `${mount.type === "config" ? "./" : ""}${mount.source}:${mount.target}${mount.readOnly ? ":ro" : ":rw"}`; }),
      depends_on: service.dependsOn, ...(service.user !== undefined ? { user: service.user } : {}), ...(service.workingDir ? { working_dir: service.workingDir } : {}), read_only: service.readOnly,
      ...(service.healthcheck ? { healthcheck: { test: service.healthcheck.Test, interval: `${service.healthcheck.Interval / 1e6}ms`, timeout: `${service.healthcheck.Timeout / 1e6}ms`, start_period: `${service.healthcheck.StartPeriod / 1e6}ms`, retries: service.healthcheck.Retries } } : {}),
    };
  }
  return normalizeHostingTemplate({ services, volumes: Object.fromEntries(list(value.volumes, "Volumes", 32).map((name) => [name, {}])) }, value.files);
}

export async function parseHostingBundle(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_BUNDLE_BYTES) fail("ZIP bundles must be between 1 byte and 10 MiB");
  const files = {};
  await new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error) return reject(Object.assign(new Error("Invalid ZIP bundle"), { status: 400 }));
      let count = 0, total = 0;
      const abort = (error) => { zip.close(); reject(Object.assign(error, { status: 400 })); };
      zip.on("error", abort);
      zip.on("end", resolve);
      zip.on("entry", (entry) => {
        try {
          if (++count > 100) fail("ZIP bundles may contain at most 100 entries");
          if (entry.fileName.endsWith("/")) { safeBundlePath(entry.fileName.slice(0, -1)); zip.readEntry(); return; }
          const name = safeBundlePath(entry.fileName);
          if ((entry.externalFileAttributes >>> 16 & 0o170000) === 0o120000) fail("ZIP symlinks are forbidden");
          if (Object.hasOwn(files, name)) fail("Duplicate ZIP paths are forbidden");
          total += entry.uncompressedSize;
          if (total > MAX_EXPANDED_BYTES || entry.uncompressedSize > MAX_BUNDLE_BYTES) fail("Expanded ZIP bundle exceeds its size limit");
          zip.openReadStream(entry, (error, stream) => {
            if (error) return abort(error);
            let bytes = 0; const chunks = [];
            stream.on("data", (chunk) => { bytes += chunk.length; if (bytes > entry.uncompressedSize || bytes > MAX_BUNDLE_BYTES) stream.destroy(new Error("ZIP entry exceeds its declared size")); else chunks.push(chunk); });
            stream.on("error", abort);
            stream.on("end", () => { Object.defineProperty(files, name, { value: Buffer.concat(chunks).toString("base64"), enumerable: true, configurable: true }); zip.readEntry(); });
          });
        } catch (error) { abort(error); }
      });
      zip.readEntry();
    });
  });
  const composeNames = ["compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml"].filter((name) => Object.hasOwn(files, name));
  if (composeNames.length !== 1) fail("Bundle must contain exactly one Compose file at its root");
  const source = Buffer.from(files[composeNames[0]], "base64").toString("utf8");
  delete files[composeNames[0]];
  for (const name of Object.keys(files)) if (/^Dockerfile(?:\..*)?$/i.test(path.posix.basename(name))) delete files[name];
  return normalizeHostingTemplate(source, files);
}
