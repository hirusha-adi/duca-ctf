export const LABELS = Object.freeze({ managed: "duca.hosted.managed", instance: "duca.hosted.instance", generation: "duca.hosted.generation", expiresAt: "duca.hosted.expiresAt", kind: "duca.hosted.resourcekind", service: "duca.hosted.service" });
const KINDS = new Set(["app", "guard", "network", "volume"]);

export function resourceLabels(instance, kind, service) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(instance.id) || !Number.isSafeInteger(instance.generation) || instance.generation < 1 || !KINDS.has(kind)) throw new Error("Invalid managed resource scope");
  const deadline = new Date(instance.expiresAt);
  if (!Number.isFinite(deadline.getTime())) throw new Error("Invalid instance deadline");
  return { [LABELS.managed]: "true", [LABELS.instance]: instance.id, [LABELS.generation]: String(instance.generation), [LABELS.expiresAt]: deadline.toISOString(), [LABELS.kind]: kind, ...(service ? { [LABELS.service]: service } : {}) };
}

export function ownedResource(labels, { instanceId, generation, kinds } = {}) {
  if (!labels || labels[LABELS.managed] !== "true" || !/^[a-zA-Z0-9_-]{1,100}$/.test(labels[LABELS.instance] || "") || !/^[1-9]\d*$/.test(labels[LABELS.generation] || "") || !KINDS.has(labels[LABELS.kind]) || !Number.isFinite(Date.parse(labels[LABELS.expiresAt] || ""))) return false;
  if (instanceId !== undefined && labels[LABELS.instance] !== instanceId) return false;
  if (generation !== undefined && labels[LABELS.generation] !== String(generation)) return false;
  if (kinds && !kinds.includes(labels[LABELS.kind])) return false;
  return true;
}

export function resourceName(instance, suffix) {
  const base = `duca-${instance.id}-g${instance.generation}-${suffix}`;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,230}$/.test(base)) throw new Error("Invalid managed resource name");
  return base;
}

export async function findOwnedContainer(engine, instance, service, kind = "app") {
  const containers = await engine.listContainers({ [LABELS.managed]: "true", [LABELS.instance]: instance.id, [LABELS.generation]: String(instance.generation), [LABELS.service]: service, [LABELS.kind]: kind });
  const candidates = containers.filter((container) => ownedResource(container.Labels, { instanceId: instance.id, generation: instance.generation, kinds: [kind] }));
  if (candidates.length > 1) throw new Error("Multiple containers found for a single managed service");
  return candidates[0] || null;
}

export async function inspectOwnedContainer(engine, id, scope) {
  const container = await engine.inspectContainer(id);
  if (!ownedResource(container.Config?.Labels, scope)) throw new Error("Refusing to manage a container outside the hosted instance scope");
  return container;
}

export async function stopOwnedContainer(engine, id, scope) {
  await inspectOwnedContainer(engine, id, scope);
  try { await engine.request("POST", `/containers/${encodeURIComponent(id)}/stop?t=5`); } catch (error) { if (![304, 404].includes(error.status)) throw error; }
}

export async function removeGeneration(engine, instanceId, generation, { maxGeneration = Infinity } = {}) {
  const filter = { [LABELS.managed]: "true", [LABELS.instance]: instanceId, ...(generation === undefined ? {} : { [LABELS.generation]: String(generation) }) };
  const scope = { instanceId, generation };
  const containers = await engine.listContainers(filter);
  const withinGeneration = (entry) => Number(entry.Labels?.[LABELS.generation]) <= maxGeneration;
  for (const container of containers.filter((entry) => withinGeneration(entry) && ownedResource(entry.Labels, { ...scope, kinds: ["app", "guard"] })).sort((a, b) => (a.Labels[LABELS.kind] === "app" ? -1 : 1) - (b.Labels[LABELS.kind] === "app" ? -1 : 1))) {
    try {
      await inspectOwnedContainer(engine, container.Id, { ...scope, kinds: ["app", "guard"] });
      await engine.request("DELETE", `/containers/${encodeURIComponent(container.Id)}?force=1&v=1`);
    } catch (error) { if (error.status !== 404) throw error; }
  }
  for (const network of await engine.listNetworks(filter)) {
    if (!withinGeneration(network) || !ownedResource(network.Labels, { ...scope, kinds: ["network"] })) continue;
    const current = await engine.inspectNetwork(network.Id);
    if (!ownedResource(current.Labels, { ...scope, kinds: ["network"] })) throw new Error("Managed network scope changed");
    try { await engine.request("DELETE", `/networks/${encodeURIComponent(network.Id)}`); } catch (error) { if (error.status !== 404) throw error; }
  }
  for (const volume of await engine.listVolumes(filter)) {
    if (!withinGeneration(volume) || !ownedResource(volume.Labels, { ...scope, kinds: ["volume"] })) continue;
    const current = await engine.inspectVolume(volume.Name);
    if (!ownedResource(current.Labels, { ...scope, kinds: ["volume"] })) throw new Error("Managed volume scope changed");
    try { await engine.request("DELETE", `/volumes/${encodeURIComponent(volume.Name)}`); } catch (error) { if (error.status !== 404) throw error; }
  }
}
