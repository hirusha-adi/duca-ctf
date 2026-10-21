import net from "node:net";
import { createHash } from "node:crypto";

export const GUARD_IMAGE = "duca-ctf-instance-guard:latest";

export function subnetCandidate(instanceId, generation, attempt = 0, pool = process.env.HOSTED_NETWORK_CIDR || "10.210.0.0/16") {
  const match = /^(10\.\d{1,3})\.0\.0\/16$/.exec(pool);
  if (!match || Number(match[1].split(".")[1]) > 255) throw new Error("HOSTED_NETWORK_CIDR must use a private 10.x.0.0/16 pool");
  const index = (createHash("sha256").update(`${instanceId}:${generation}`).digest().readUInt16BE(0) + attempt) % 4096;
  return `${match[1]}.${Math.floor(index / 16)}.${index % 16 * 16}/28`;
}

export function buildGuardContainerConfig({ instance, service, networkName, subnet, serviceAddress, portBindings = {}, blockedAddresses = [], guardImage = GUARD_IMAGE }) {
  if (!/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}\/28$/.test(subnet)) throw new Error("Invalid instance subnet");
  if (blockedAddresses.some((address) => !net.isIP(address))) throw new Error("Blocked host addresses must be IP literals");
  if (serviceAddress !== undefined && !net.isIPv4(serviceAddress)) throw new Error("Invalid service address");
  const expiresAt = Math.floor(new Date(instance.expiresAt).getTime() / 1000);
  if (!Number.isSafeInteger(expiresAt)) throw new Error("Invalid instance expiry");
  const exposed = Object.fromEntries((service.ports || []).map((port) => [`${port.target}/${port.protocol}`, {}]));
  return {
    Image: guardImage,
    Env: [
      `DUCA_SUBNET=${subnet}`, `DUCA_INTERNET=${instance.internetEnabled ? "1" : "0"}`,
      `DUCA_EXPIRES_AT=${expiresAt}`, `DUCA_BLOCKED_IPS=${blockedAddresses.join(" ")}`,
      `DUCA_TCP_PORTS=${(service.ports || []).filter((port) => port.protocol === "tcp").map((port) => port.target).join(" ")}`,
      `DUCA_UDP_PORTS=${(service.ports || []).filter((port) => port.protocol === "udp").map((port) => port.target).join(" ")}`,
    ],
    ExposedPorts: exposed,
    Healthcheck: { Test: ["CMD", "test", "-f", "/run/duca-ready"], Interval: 1e9, Timeout: 1e9, Retries: 10 },
    HostConfig: {
      NetworkMode: networkName, PortBindings: portBindings,
      CapDrop: ["ALL"], CapAdd: ["NET_ADMIN"], SecurityOpt: ["no-new-privileges:true"],
      ReadonlyRootfs: true, Tmpfs: { "/run": "rw,nosuid,nodev,noexec,size=1m" },
      Memory: 16 * 1048576, MemorySwap: 16 * 1048576, NanoCpus: 25 * 1e6, PidsLimit: 16,
      RestartPolicy: { Name: "unless-stopped" }, LogConfig: { Type: "local", Config: { "max-size": "5m", "max-file": "2" } },
    },
    NetworkingConfig: { EndpointsConfig: { [networkName]: { Aliases: [service.name], ...(serviceAddress ? { IPAMConfig: { IPv4Address: serviceAddress } } : {}) } } },
  };
}
