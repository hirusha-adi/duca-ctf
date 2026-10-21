import { prisma } from "../db";
import { isChallengeAvailable } from "../competitions";
import { getChallengePrerequisiteStatus } from "../challenge-access";
import { normalizeHostingTemplate } from "./template.mjs";
import { DEFAULT_HOSTING_SETTINGS, TERMINAL_STATES, hostingError, hostingUsage, requestInstanceAction, serializeHostedInstance, validateHostingSettings } from "./control-plane.mjs";
import { createTerminalToken } from "./secrets.mjs";

export async function getHostingSettings(db = prisma) {
  return db.hostingSettings.upsert({ where: { id: "default" }, update: {}, create: DEFAULT_HOSTING_SETTINGS });
}

export async function currentHostingUsage(db = prisma) {
  const rows = await db.hostedInstance.findMany({ where: { state: { notIn: TERMINAL_STATES } }, select: { state: true, desiredState: true, resourceMemoryMb: true, resourceCpuMillicores: true } });
  return hostingUsage(rows);
}

async function authorizeChallenge(tx, challenge, user, { admin }) {
  if (admin) return;
  if (!isChallengeAvailable(challenge, challenge.competition)) throw hostingError("This challenge is not currently available", 403);
  const access = await getChallengePrerequisiteStatus(user.id, challenge.id, tx);
  if (!access.unlocked) throw hostingError("Solve the prerequisite challenges first", 403);
}

export async function changeInstance(user, options) {
  return requestInstanceAction(prisma, { ...options, user }, { authorizeChallenge, normalizeTemplate: normalizeHostingTemplate });
}

export async function playerInstance(user, challengeId) {
  const [challenge, instance] = await Promise.all([
    prisma.challenge.findUnique({ where: { id: challengeId }, include: { competition: true } }),
    prisma.hostedInstance.findUnique({ where: { userId_challengeId: { userId: user.id, challengeId } } }),
  ]);
  if (!challenge || ((challenge.hidden || challenge.competition.hidden) && user.role !== "ADMIN" && !instance)) throw hostingError("Challenge not found", 404);
  let disabledReason = null;
  if (!challenge.hosted || !challenge.hostingEnabled) disabledReason = "Hosting is disabled for this challenge";
  else {
    try { await authorizeChallenge(prisma, challenge, user, { admin: user.role === "ADMIN" }); }
    catch (error) { disabledReason = error.message; }
  }
  return { hosted: challenge.hosted, hostingEnabled: challenge.hostingEnabled, canStart: !disabledReason, disabledReason, instance: serializeHostedInstance(instance, { admin: user.role === "ADMIN" }) };
}

export function hostedChallengeConfiguration(challenge) {
  return { id: challenge.id, title: challenge.title, hosted: challenge.hosted, hostingEnabled: challenge.hostingEnabled, hostingInternetEnabled: challenge.hostingInternetEnabled, hostingVersion: challenge.hostingVersion, template: challenge.hostingTemplate };
}

export async function getHostedChallengeConfiguration(challengeId) {
  const challenge = await prisma.challenge.findUnique({ where: { id: challengeId } });
  if (!challenge) throw hostingError("Challenge not found", 404);
  return hostedChallengeConfiguration(challenge);
}

export async function updateHostedChallengeConfiguration(user, challengeId, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw hostingError("Configuration must be an object");
  for (const field of ["hosted", "hostingEnabled", "hostingInternetEnabled"]) {
    if (input[field] !== undefined && typeof input[field] !== "boolean") throw hostingError(`${field} must be true or false`);
  }
  if (input.composeYaml !== undefined && input.template !== undefined) throw hostingError("Provide composeYaml or template, not both");
  const source = input.composeYaml ?? input.template;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('hosting:capacity'))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${challengeId}))`;
    const challenge = await tx.challenge.findUnique({ where: { id: challengeId } });
    if (!challenge) throw hostingError("Challenge not found", 404);
    const template = source !== undefined ? normalizeHostingTemplate(source, input.composeYaml !== undefined ? challenge.hostingTemplate?.files ?? {} : {}) : undefined;
    const data = Object.fromEntries(["hosted", "hostingEnabled", "hostingInternetEnabled"].filter((field) => input[field] !== undefined).map((field) => [field, input[field]]));
    if (template !== undefined) data.hostingTemplate = template;
    if (template !== undefined || (input.hostingInternetEnabled !== undefined && input.hostingInternetEnabled !== challenge.hostingInternetEnabled)) data.hostingVersion = { increment: 1 };
    const hosted = data.hosted ?? challenge.hosted;
    if (!hosted) data.hostingEnabled = false;
    if ((data.hostingEnabled ?? challenge.hostingEnabled) && !(template ?? challenge.hostingTemplate)) throw hostingError("Upload a hosting template before enabling this challenge");
    const updated = await tx.challenge.update({ where: { id: challengeId }, data });
    await tx.instanceEvent.create({ data: { actorId: user.id, action: "HOSTING_CONFIGURATION_UPDATED", message: "Challenge hosting configuration updated", metadata: { challengeId, hosted: updated.hosted, enabled: updated.hostingEnabled, templateVersion: updated.hostingVersion } } });
    return hostedChallengeConfiguration(updated);
  });
}

export async function updateHostingSettings(user, input) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('hosting:capacity'))`;
    const current = await getHostingSettings(tx);
    const data = validateHostingSettings(input, current);
    const settings = await tx.hostingSettings.update({ where: { id: "default" }, data });
    await tx.instanceEvent.create({ data: { actorId: user.id, action: "HOSTING_SETTINGS_UPDATED", message: "Hosting capacity and endpoint settings updated", metadata: data } });
    return settings;
  });
}

export async function issueInstanceTerminal(user, instanceId, service) {
  if (typeof service !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/.test(service)) throw hostingError("Select a valid service");
  return prisma.$transaction(async (tx) => {
    const instance = await tx.hostedInstance.findUnique({ where: { id: instanceId } });
    if (!instance) throw hostingError("Instance not found", 404);
    const now = new Date();
    if (instance.state !== "RUNNING" || instance.desiredState !== "RUNNING" || instance.observedGeneration !== instance.generation || instance.expiresAt <= now) throw hostingError("The instance must be running to open a terminal", 409);
    if (!instance.template.services.some((entry) => entry.name === service)) throw hostingError("Service not found", 404);
    const { id, token, tokenHash } = createTerminalToken();
    const expiresAt = new Date(Math.min(now.getTime() + 60000, instance.expiresAt.getTime()));
    await tx.instanceTerminalSession.create({ data: { id, instanceId, userId: user.id, service, generation: instance.generation, tokenHash, expiresAt } });
    await tx.instanceEvent.create({ data: { instanceId, generation: instance.generation, actorId: user.id, action: "TERMINAL_SESSION_ISSUED", message: `Admin terminal requested for ${service}`, metadata: { service } } });
    return { sessionId: id, token, expiresAt, webSocketUrl: "/instance-terminal", url: "/instance-terminal" };
  });
}
