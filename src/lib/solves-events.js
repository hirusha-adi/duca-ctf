import { getRedis, getRedisSubscriber, isRedisEnabled } from "./redis";

const globalForSolves = globalThis;
const SOLVES_CHANNEL = "duca:solves";

function getMemoryBus() {
  if (!globalForSolves.solvesEventBus) {
    globalForSolves.solvesEventBus = new Set();
  }
  return globalForSolves.solvesEventBus;
}

function subscribeMemory(listener) {
  const listeners = getMemoryBus();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publishMemory(event) {
  for (const listener of getMemoryBus()) {
    try {
      listener(event);
    } catch (err) {
      console.error("Solves event listener error:", err);
    }
  }
}

export async function subscribeToSolves(listener) {
  if (!isRedisEnabled()) {
    return subscribeMemory(listener);
  }

  const subscriber = await getRedisSubscriber();

  const handler = (message) => {
    try {
      listener(JSON.parse(message));
    } catch (err) {
      console.error("Solves event parse error:", err);
    }
  };

  await subscriber.subscribe(SOLVES_CHANNEL, handler);
  return () => subscriber.unsubscribe(SOLVES_CHANNEL, handler);
}

export async function publishSolveEvent(event) {
  if (!isRedisEnabled()) {
    publishMemory(event);
    return;
  }

  const redis = await getRedis();
  await redis.publish(SOLVES_CHANNEL, JSON.stringify(event));
}
