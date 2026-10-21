import test from "node:test";
import assert from "node:assert/strict";
import { normalizeHostingTemplate, parseHostingBundle, safeBundlePath } from "../src/lib/hosting/template.mjs";
import { buildGuardContainerConfig, subnetCandidate } from "../runner/network-policy.mjs";

const compose = `services:
  web:
    image: registry.example.com:5000/ctf/web:one
    environment:
      DATABASE_HOST: db
    ports:
      - target: 8000
        app_protocol: http
    depends_on: [db]
    mem_limit: 128m
    cpus: 0.25
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD: test-only
    volumes: ["data:/var/lib/postgresql/data"]
    healthcheck:
      test: [CMD, pg_isready]
      interval: 5s
volumes:
  data: {}
`;

test("multi-service templates reserve all application and network guard resources", () => {
  const manifest = normalizeHostingTemplate(compose);
  assert.equal(manifest.services.length, 2);
  assert.deepEqual(manifest.resources, { memoryMb: 416, cpuMillicores: 550 });
  assert.equal(manifest.services[0].ports[0].scheme, "http");
  assert.equal(manifest.services[1].mounts[0].type, "volume");
  assert.deepEqual(normalizeHostingTemplate(manifest), manifest);
});

test("unsafe Compose features and fixed host ports cannot cross the runner boundary", () => {
  for (const text of [
    "services: {web: {build: .}}",
    "services: {web: {image: nginx, privileged: true}}",
    "services: {web: {image: nginx, network_mode: host}}",
    "services: {web: {image: nginx, ports: ['8080:80']}}",
    "services: {web: {image: nginx, volumes: ['/var/run/docker.sock:/var/run/docker.sock']}}",
    "services: {web: {image: nginx, environment: {SECRET: '${SESSION_SECRET}'}}}",
    "services: {web: {image: nginx, volumes: ['data:/data']}}\nvolumes: {data: {external: true}}",
    "services: {web: &web {image: nginx}, another: *web}",
  ]) assert.throws(() => normalizeHostingTemplate(text));
});

test("dependency cycles and references to undeclared services are rejected", () => {
  assert.throws(() => normalizeHostingTemplate("services: {web: {image: nginx, depends_on: [missing]}}"), /dependencies/);
  assert.throws(() => normalizeHostingTemplate("services: {a: {image: nginx, depends_on: [b]}, b: {image: nginx, depends_on: [a]}}"), /cycle/);
});

test("normalized templates validate service names and keep configuration keys as own data", () => {
  const manifest = normalizeHostingTemplate(compose);
  delete manifest.services[0].name;
  assert.throws(() => normalizeHostingTemplate(manifest), /service name/);
  const files = JSON.parse('{"__proto__":"c2FmZQ=="}');
  const special = normalizeHostingTemplate("services: {constructor: {image: python, environment: ['__proto__=literal'], volumes: ['./__proto__:/config:ro']}}", files);
  assert.equal(special.files.__proto__, "c2FmZQ==");
  assert.equal(special.services[0].environment.__proto__, "literal");
  assert.deepEqual(normalizeHostingTemplate(special), special);
  assert.throws(() => normalizeHostingTemplate("services: {web: {image: python, configs: [constructor]}}"), /Unknown config/);
  assert.throws(() => normalizeHostingTemplate("services: {web: {image: python, volumes: ['state:/etc/hosts']}}\nvolumes: {state: {}}"), /reserved/);
});

test("bundle configuration mounts are readonly, contained and explicit", () => {
  const manifest = normalizeHostingTemplate("services: {web: {image: nginx, volumes: ['./site.conf:/etc/nginx/conf.d/default.conf:ro'], env_file: settings.env}}", {
    "site.conf": Buffer.from("server {}").toString("base64"), "settings.env": Buffer.from("NAME=example\n# Comment").toString("base64"),
  });
  assert.equal(manifest.services[0].environment.NAME, "example");
  assert.deepEqual(manifest.services[0].mounts[0], { type: "config", source: "site.conf", target: "/etc/nginx/conf.d/default.conf", readOnly: true });
  for (const name of ["../secret", "/etc/passwd", "C:\\secret", "nested/../../secret", "bad\0file"]) assert.throws(() => safeBundlePath(name));
});

// ZIP fixtures use stored entries so tests need no external archiver or shell.
function zip(entries) {
  const chunks = [], directory = []; let offset = 0;
  function crc(bytes) { let value = 0xffffffff; for (const byte of bytes) { value ^= byte; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (0xedb88320 & -(value & 1)); } return (value ^ 0xffffffff) >>> 0; }
  for (const [name, text] of Object.entries(entries)) {
    const filename = Buffer.from(name), bytes = Buffer.from(text), header = Buffer.alloc(30), central = Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt32LE(crc(bytes), 14); header.writeUInt32LE(bytes.length, 18); header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(filename.length, 26);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc(bytes), 16); central.writeUInt32LE(bytes.length, 20); central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    chunks.push(header, filename, bytes); directory.push(central, filename); offset += header.length + filename.length + bytes.length;
  }
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(entries).length, 8); end.writeUInt16LE(Object.keys(entries).length, 10); end.writeUInt32LE(Buffer.concat(directory).length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, ...directory, end]);
}

test("ZIP bundles import Compose and configs while Dockerfiles are never executed or retained", async () => {
  const manifest = await parseHostingBundle(zip({ "compose.yaml": "services: {web: {image: nginx, configs: [site]}}\nconfigs: {site: {file: site.conf}}", "site.conf": "server {}", Dockerfile: "RUN touch /host-never" }));
  assert.equal(manifest.services[0].mounts[0].source, "site.conf");
  assert.equal(manifest.files.Dockerfile, undefined);
  await assert.rejects(parseHostingBundle(zip({ "compose.yaml": "services: {}", "compose.yml": "services: {}" })), /exactly one/);
  await assert.rejects(parseHostingBundle(zip({ "compose.yaml": "services: {}", "../escape": "unsafe" })));
});

test("network guards receive only the policy capabilities and declared port bindings", () => {
  const manifest = normalizeHostingTemplate(compose);
  const config = buildGuardContainerConfig({ instance: { expiresAt: new Date(Date.now() + 7200000), internetEnabled: false }, service: manifest.services[0], networkName: "private-network", subnet: "10.210.0.0/28", portBindings: { "8000/tcp": [{ HostIp: "0.0.0.0", HostPort: "20000" }] }, blockedAddresses: ["203.0.113.7"] });
  assert.deepEqual(config.HostConfig.CapDrop, ["ALL"]);
  assert.deepEqual(config.HostConfig.CapAdd, ["NET_ADMIN"]);
  assert.equal(config.HostConfig.Privileged, undefined);
  assert.equal(config.HostConfig.PortBindings["8000/tcp"][0].HostIp, "0.0.0.0");
  assert.ok(config.Env.includes("DUCA_INTERNET=0"));
  assert.equal(subnetCandidate("a", 1), subnetCandidate("a", 1));
  assert.notEqual(subnetCandidate("a", 1), subnetCandidate("a", 1, 1));
});
