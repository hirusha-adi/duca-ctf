import { getRedis, isRedisEnabled } from "./redis";

const memoryStore = new Map();

function checkRateLimitMemory(key, limit, windowMs) {
  const now = Date.now();
  const entry = memoryStore.get(key) || { count: 0, resetAt: now + windowMs };

  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }

  if (entry.count >= limit) {
    return false;
  }

  entry.count += 1;
  memoryStore.set(key, entry);
  return true;
}

export async function checkRateLimit(key, limit, windowMs) {
  if (!isRedisEnabled()) {
    return checkRateLimitMemory(key, limit, windowMs);
  }

  try {
    const redis = await getRedis();
    const redisKey = `rate:${key}`;
    const count = await redis.incr(redisKey);

    if (count === 1) {
      await redis.pExpire(redisKey, windowMs);
    }

    return count <= limit;
  } catch (err) {
    console.error("Redis rate limit error, falling back to memory:", err);
    return checkRateLimitMemory(key, limit, windowMs);
  }
}
