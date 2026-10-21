import http from "node:http";
import { PassThrough } from "node:stream";

export class DockerError extends Error {
  constructor(message, status = 500) { super(message); this.status = status; }
}

export class DockerEngine {
  constructor({ socketPath = process.env.DOCKER_SOCKET_PATH || "/var/run/docker.sock", version = "v1.45", timeout = 120000 } = {}) {
    if (!socketPath.startsWith("/")) throw new Error("DOCKER_SOCKET_PATH must be an absolute UNIX socket path");
    this.socketPath = socketPath;
    this.version = version;
    this.timeout = timeout;
  }

  path(pathname) { return `/${this.version}${pathname}`; }

  async request(method, pathname, body, { headers = {}, signal, timeout = this.timeout, stream = false } = {}) {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    return new Promise((resolve, reject) => {
      const request = http.request({ socketPath: this.socketPath, method, path: this.path(pathname), headers: { ...(data ? { "Content-Type": "application/json", "Content-Length": data.length } : {}), ...headers }, signal }, (response) => {
        if (stream && response.statusCode >= 200 && response.statusCode < 300) { resolve(response); return; }
        const chunks = [];
        let length = 0;
        response.on("data", (chunk) => {
          length += chunk.length;
          if (length > 32 * 1024 * 1024) { response.destroy(new Error("Docker response too large")); return; }
          chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let result;
          try { result = text ? JSON.parse(text) : null; } catch { result = text; }
          if (response.statusCode < 200 || response.statusCode >= 300) {
            // Docker pull responses can contain registry credentials in upstream details. Never expose request headers.
            reject(new DockerError(typeof result?.message === "string" ? result.message.slice(0, 1000) : `Docker operation failed (${response.statusCode})`, response.statusCode));
          } else resolve(result);
        });
      });
      request.setTimeout(timeout, () => request.destroy(new Error("Docker request timed out")));
      request.on("error", reject);
      if (data) request.write(data);
      request.end();
    });
  }

  async assertRootless() {
    const info = await this.request("GET", "/info");
    if (!(info.SecurityOptions || []).some((option) => /(^|[=,])rootless($|[,])/i.test(option))) {
      throw new Error("Hosted challenges require a rootless Docker engine");
    }
    if (!info.MemoryLimit || !info.CpuCfsQuota || String(info.CgroupVersion) !== "2") throw new Error("Hosted challenges require enforceable memory and CPU limits on cgroup v2");
    return info;
  }

  async inspectContainer(id) { return this.request("GET", `/containers/${encodeURIComponent(id)}/json`); }
  async inspectNetwork(id) { return this.request("GET", `/networks/${encodeURIComponent(id)}`); }
  async inspectVolume(id) { return this.request("GET", `/volumes/${encodeURIComponent(id)}`); }

  async listContainers(labels = {}) {
    return this.request("GET", `/containers/json?all=1&filters=${encodeURIComponent(JSON.stringify({ label: Object.entries(labels).map(([key, value]) => `${key}=${value}`) }))}`);
  }
  async listNetworks(labels = {}) {
    return this.request("GET", `/networks?filters=${encodeURIComponent(JSON.stringify({ label: Object.entries(labels).map(([key, value]) => `${key}=${value}`) }))}`);
  }
  async listVolumes(labels = {}) {
    const result = await this.request("GET", `/volumes?filters=${encodeURIComponent(JSON.stringify({ label: Object.entries(labels).map(([key, value]) => `${key}=${value}`) }))}`);
    return result.Volumes || [];
  }

  async pullImage(reference, registryAuth, { signal } = {}) {
    const headers = registryAuth ? { "X-Registry-Auth": Buffer.from(JSON.stringify(registryAuth)).toString("base64url") } : {};
    const response = await this.request("POST", `/images/create?fromImage=${encodeURIComponent(reference)}`, undefined, { headers, stream: true, signal });
    let pending = "";
    for await (const chunk of response) {
      pending += chunk.toString("utf8");
      if (pending.length > 1024 * 1024) throw new Error("Invalid Docker image pull stream");
      const lines = pending.split("\n");
      pending = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.error || event.errorDetail) throw new DockerError("Could not pull the configured challenge image", 502);
      }
    }
    if (pending.trim()) {
      const event = JSON.parse(pending);
      if (event.error || event.errorDetail) throw new DockerError("Could not pull the configured challenge image", 502);
    }
    const image = await this.request("GET", `/images/${encodeURIComponent(reference)}/json`);
    if (!/^sha256:[a-f0-9]{64}$/i.test(image.Id || "")) throw new Error("Docker did not return an immutable image ID");
    const repository = reference.split("@")[0].replace(/:[^/:]+$/, "");
    const digest = (image.RepoDigests || []).find((value) => value.startsWith(`${repository}@`)) || image.RepoDigests?.[0] || image.Id;
    return { id: image.Id, digest };
  }

  async attachExec(execId) {
    const payload = Buffer.from(JSON.stringify({ Detach: false, Tty: true }));
    return new Promise((resolve, reject) => {
      const request = http.request({ socketPath: this.socketPath, method: "POST", path: this.path(`/exec/${encodeURIComponent(execId)}/start`), headers: { "Content-Type": "application/json", "Content-Length": payload.length, Connection: "Upgrade", Upgrade: "tcp" } });
      request.setTimeout(15000, () => request.destroy(new Error("Terminal attachment timed out")));
      request.on("upgrade", (_response, socket, head) => { request.setTimeout(0); if (head.length) socket.unshift(head); resolve(socket); });
      request.on("response", (response) => { response.resume(); reject(new DockerError("Docker did not open an interactive terminal", response.statusCode)); });
      request.on("error", reject);
      request.end(payload);
    });
  }
}

// Docker logs without TTY use 8-byte headers; preserve arbitrary chunk boundaries.
export function dockerLogDecoder({ tty = false } = {}) {
  const output = new PassThrough();
  let pending = Buffer.alloc(0);
  return {
    output,
    write(chunk) {
      if (tty) return output.write(chunk);
      let writable = true;
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= 8) {
        if (![0, 1, 2].includes(pending[0]) || pending[1] || pending[2] || pending[3]) throw new Error("Invalid Docker log stream");
        const size = pending.readUInt32BE(4);
        if (size > 20 * 1024 * 1024) throw new Error("Docker log frame too large");
        if (pending.length < 8 + size) break;
        writable = output.write(pending.subarray(8, 8 + size)) && writable;
        pending = pending.subarray(8 + size);
      }
      return writable && !output.writableNeedDrain;
    },
    end() { output.end(); },
  };
}
