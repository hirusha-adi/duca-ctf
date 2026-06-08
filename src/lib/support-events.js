import { getRedis, getRedisSubscriber, isRedisEnabled } from "./redis";

const globalForSupport = globalThis;

const TICKET_CHANNEL_PREFIX = "duca:support:ticket:";
const INBOX_CHANNEL_PREFIX = "duca:support:inbox:";

function ticketChannel(ticketId) {
  return `${TICKET_CHANNEL_PREFIX}${ticketId}`;
}

function inboxChannel(inboxKey) {
  return `${INBOX_CHANNEL_PREFIX}${inboxKey}`;
}

function getMemoryBus() {
  if (!globalForSupport.supportEventBus) {
    globalForSupport.supportEventBus = {
      tickets: new Map(),
      inboxes: new Map(),
    };
  }
  return globalForSupport.supportEventBus;
}

function subscribeMemory(map, key, listener) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(listener);
  return () => {
    map.get(key)?.delete(listener);
  };
}

function publishMemory(map, key, payload) {
  const listeners = map.get(key);
  if (!listeners) return;
  for (const listener of listeners) {
    try {
      listener(payload);
    } catch (err) {
      console.error("Support event listener error:", err);
    }
  }
}

export const ADMIN_INBOX_KEY = "admin";

export function inboxKeyForUser(userId) {
  return `user:${userId}`;
}

export async function subscribeToTicket(ticketId, listener) {
  if (!isRedisEnabled()) {
    return subscribeMemory(getMemoryBus().tickets, ticketId, listener);
  }

  const subscriber = await getRedisSubscriber();
  const channel = ticketChannel(ticketId);

  const handler = (message) => {
    try {
      listener(JSON.parse(message));
    } catch (err) {
      console.error("Support ticket event parse error:", err);
    }
  };

  await subscriber.subscribe(channel, handler);
  return () => subscriber.unsubscribe(channel, handler);
}

export async function publishTicketEvent(ticketId, event) {
  if (!isRedisEnabled()) {
    publishMemory(getMemoryBus().tickets, ticketId, event);
    return;
  }

  const redis = await getRedis();
  await redis.publish(ticketChannel(ticketId), JSON.stringify(event));
}

export async function subscribeToInbox(inboxKey, listener) {
  if (!isRedisEnabled()) {
    return subscribeMemory(getMemoryBus().inboxes, inboxKey, listener);
  }

  const subscriber = await getRedisSubscriber();
  const channel = inboxChannel(inboxKey);

  const handler = (message) => {
    try {
      listener(JSON.parse(message));
    } catch (err) {
      console.error("Support inbox event parse error:", err);
    }
  };

  await subscriber.subscribe(channel, handler);
  return () => subscriber.unsubscribe(channel, handler);
}

export async function publishInboxEvent(inboxKey, event) {
  if (!isRedisEnabled()) {
    publishMemory(getMemoryBus().inboxes, inboxKey, event);
    return;
  }

  const redis = await getRedis();
  await redis.publish(inboxChannel(inboxKey), JSON.stringify(event));
}

export async function publishInboxUpdates(ticketSummary, ticketUserId) {
  const event = { type: "ticket", ticket: ticketSummary };
  await publishInboxEvent(inboxKeyForUser(ticketUserId), event);
  await publishInboxEvent(ADMIN_INBOX_KEY, event);
}
