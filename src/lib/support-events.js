const globalForSupport = globalThis;

function getBus() {
  if (!globalForSupport.supportEventBus) {
    globalForSupport.supportEventBus = {
      tickets: new Map(),
      inboxes: new Map(),
    };
  }
  return globalForSupport.supportEventBus;
}

function subscribe(map, key, listener) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(listener);
  return () => {
    map.get(key)?.delete(listener);
  };
}

function publish(map, key, payload) {
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

export function subscribeToTicket(ticketId, listener) {
  return subscribe(getBus().tickets, ticketId, listener);
}

export function publishTicketEvent(ticketId, event) {
  publish(getBus().tickets, ticketId, event);
}

export function subscribeToInbox(inboxKey, listener) {
  return subscribe(getBus().inboxes, inboxKey, listener);
}

export function publishInboxEvent(inboxKey, event) {
  publish(getBus().inboxes, inboxKey, event);
}

export function publishInboxUpdates(ticketSummary, ticketUserId) {
  const event = { type: "ticket", ticket: ticketSummary };
  publishInboxEvent(inboxKeyForUser(ticketUserId), event);
  publishInboxEvent(ADMIN_INBOX_KEY, event);
}
