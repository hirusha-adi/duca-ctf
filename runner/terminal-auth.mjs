import { parseTerminalToken, verifyTerminalSecret } from "../src/lib/hosting/secrets.mjs";

export function terminalSessionAllowed(session, now = Date.now()) {
  return !!session && !session.usedAt && new Date(session.expiresAt).getTime() > now && session.user?.role === "ADMIN" && !session.user?.disabled && session.instance?.state === "RUNNING" && session.instance.desiredState === "RUNNING" && session.instance.generation === session.generation && new Date(session.instance.expiresAt).getTime() > now;
}

export async function consumeTerminalToken(db, token) {
  const parsed = parseTerminalToken(token);
  if (!parsed) return null;
  return db.$transaction(async (tx) => {
    const session = await tx.instanceTerminalSession.findUnique({ where: { id: parsed.id }, include: { user: { select: { id: true, role: true, disabled: true } }, instance: true } });
    if (!terminalSessionAllowed(session) || !verifyTerminalSecret(parsed.secret, session.tokenHash)) return null;
    const consumed = await tx.instanceTerminalSession.updateMany({ where: { id: session.id, usedAt: null, expiresAt: { gt: new Date() }, tokenHash: session.tokenHash }, data: { usedAt: new Date() } });
    return consumed.count === 1 ? session : null;
  });
}

export function terminalTokenFromRequest(url, protocols) {
  const values = String(protocols || "").split(",").map((value) => value.trim());
  const protocolToken = values.includes("duca-terminal") ? values.find((value) => parseTerminalToken(value)) : null;
  return protocolToken || url.searchParams.get("token");
}

export function validTerminalResize(value) {
  return value?.type === "resize" && Number.isInteger(value.cols) && Number.isInteger(value.rows) && value.cols >= 1 && value.cols <= 500 && value.rows >= 1 && value.rows <= 300;
}
