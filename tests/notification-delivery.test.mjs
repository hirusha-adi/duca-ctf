import test from "node:test";
import assert from "node:assert/strict";
import { createNotificationScheduler, deliverBestEffortNotification } from "../src/lib/notification-delivery.mjs";

test("successful delivery completes normally", async () => {
  let delivered = false;
  assert.equal(await deliverBestEffortNotification(async () => { delivered = true; }), true);
  assert.equal(delivered, true);
});

test("both asynchronous transport rejection and synchronous failure are contained", async () => {
  for (const task of [() => Promise.reject(new Error("Redis unavailable")), () => { throw new Error("Transport failed"); }]) {
    const errors = [];
    assert.equal(await deliverBestEffortNotification(task, { onError: (error) => errors.push(error) }), false);
    assert.equal(errors.length, 1);
  }
});

test("a hung transport has a bounded delivery attempt", async () => {
  const errors = [];
  const delivered = await deliverBestEffortNotification(() => new Promise(() => {}), {
    timeoutMs: 10,
    onError: (error) => errors.push(error),
  });
  assert.equal(delivered, false);
  assert.match(errors[0].message, /timed out/);
});

test("a late transport rejection remains handled after the timeout", async () => {
  let rejectTransport;
  const transport = new Promise((_, reject) => { rejectTransport = reject; });
  assert.equal(await deliverBestEffortNotification(() => transport, { timeoutMs: 10 }), false);
  rejectTransport(new Error("Late connection failure"));
  await new Promise((resolve) => setImmediate(resolve));
});

test("logging failures cannot change the saved mutation result", async () => {
  assert.equal(await deliverBestEffortNotification(() => { throw new Error("Offline"); }, {
    onError: () => { throw new Error("Logger unavailable"); },
  }), false);
});

test("scheduling returns before transport starts or completes", async () => {
  let callback;
  let started = false;
  const schedule = createNotificationScheduler((task) => { callback = task; });
  const result = schedule("Solve", async () => { started = true; });
  assert.equal(result, undefined);
  assert.equal(started, false);
  await callback();
  assert.equal(started, true);
});

test("missing after-response context falls back safely without changing the response", async () => {
  const errors = [];
  const schedule = createNotificationScheduler(
    () => { throw new Error("No request context"); },
    (label, error) => errors.push([label, error.message])
  );
  assert.equal(schedule("Support", () => Promise.reject(new Error("Offline"))), undefined);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(errors, [["Support", "Offline"]]);
});
