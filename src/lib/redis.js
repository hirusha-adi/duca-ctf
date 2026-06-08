import { createClient } from "redis";

const globalForRedis = globalThis;

function redisEnabled() {
  return Boolean(process.env.REDIS_URL);
}

async function connectClient(client) {
  if (!client.isOpen) {
    await client.connect();
  }
  return client;
}

export function isRedisEnabled() {
  return redisEnabled();
}

export async function getRedis() {
  if (!redisEnabled()) return null;

  if (!globalForRedis.redis) {
    const client = createClient({ url: process.env.REDIS_URL });
    client.on("error", (err) => console.error("Redis client error:", err));
    globalForRedis.redis = client;
  }

  return connectClient(globalForRedis.redis);
}

export async function getRedisSubscriber() {
  if (!redisEnabled()) return null;

  if (!globalForRedis.redisSubscriber) {
    const client = createClient({ url: process.env.REDIS_URL });
    client.on("error", (err) => console.error("Redis subscriber error:", err));
    globalForRedis.redisSubscriber = client;
  }

  return connectClient(globalForRedis.redisSubscriber);
}
