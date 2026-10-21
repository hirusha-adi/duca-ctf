import { pathToFileURL } from "node:url";
import { DockerEngine } from "./docker.mjs";
import { LABELS, ownedResource, removeGeneration } from "./resources.mjs";

export async function expireManagedResources(engine, now = Date.now()) {
  const resources = [...await engine.listContainers({ [LABELS.managed]: "true" }), ...await engine.listNetworks({ [LABELS.managed]: "true" }), ...await engine.listVolumes({ [LABELS.managed]: "true" })];
  const generations = new Map();
  for (const resource of resources) {
    const labels = resource.Labels;
    if (!ownedResource(labels) || Date.parse(labels[LABELS.expiresAt]) > now) continue;
    const key = `${labels[LABELS.instance]}:${labels[LABELS.generation]}`;
    generations.set(key, { id: labels[LABELS.instance], generation: Number(labels[LABELS.generation]) });
  }
  const results = [];
  for (const instance of generations.values()) {
    try { await removeGeneration(engine, instance.id, instance.generation); results.push({ ...instance, removed: true }); }
    catch { results.push({ ...instance, removed: false }); }
  }
  return results;
}

export async function runWatchdog({ engine = new DockerEngine(), interval = Number(process.env.HOSTED_WATCHDOG_INTERVAL_MS || 5000), signal } = {}) {
  if (!Number.isSafeInteger(interval) || interval < 100 || interval > 60000) throw new Error("HOSTED_WATCHDOG_INTERVAL_MS must be between 100 and 60000");
  await engine.assertRootless();
  while (!signal?.aborted) {
    try {
      const results = await expireManagedResources(engine);
      for (const result of results) console.log(JSON.stringify({ event: result.removed ? "instance_expired" : "expiry_retry", instanceId: result.id, generation: result.generation }));
    } catch { console.error("Hosted watchdog could not scan the Docker engine; it will retry."); }
    await new Promise((resolve) => {
      const done = () => { clearTimeout(timer); signal?.removeEventListener("abort", done); resolve(); };
      const timer = setTimeout(done, interval);
      signal?.addEventListener("abort", done, { once: true });
      if (signal?.aborted) done();
    });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const controller = new AbortController();
  process.once("SIGTERM", () => controller.abort());
  process.once("SIGINT", () => controller.abort());
  runWatchdog({ signal: controller.signal }).catch(() => { console.error("Hosted watchdog failed to start. Check its rootless Docker socket."); process.exitCode = 1; });
}
