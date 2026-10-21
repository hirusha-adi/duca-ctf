import test from "node:test";
import assert from "node:assert/strict";
import { prepareFlagChanges } from "../src/lib/flag-changes.mjs";

test("replacement retires omitted flags while retaining historical rows", () => {
  const previous = [{ id: "kept", retired: false }, { id: "removed", retired: false }, { id: "old", retired: true }];
  const changes = prepareFlagChanges([
    { id: "kept", value: " flag{same} ", label: "First" },
    { value: "flag{new}" },
  ], previous);
  assert.deepEqual(changes.retiredIds, ["removed"]);
  assert.deepEqual(changes.flags, [
    { id: "kept", value: "flag{same}", label: "First", order: 0 },
    { id: null, value: "flag{new}", label: "", order: 1 },
  ]);
  assert.equal(previous[1].retired, false, "planning leaves stored rows untouched");
});

test("removing every accepted flag is rejected before a retirement plan is returned", () => {
  assert.throws(() => prepareFlagChanges([], [{ id: "only" }]), /AT_LEAST_ONE_FLAG/);
});

test("invalid entries late in the request reject the complete replacement", () => {
  assert.throws(() => prepareFlagChanges([
    { id: "kept", value: "valid" },
    { value: "  " },
  ], [{ id: "kept" }, { id: "removed" }]), /FLAG_VALUE_REQUIRED/);
  assert.throws(() => prepareFlagChanges([{ value: "valid" }, null]), /INVALID_FLAGS/);
});

test("foreign, retired, and repeated flag IDs cannot be edited", () => {
  assert.throws(() => prepareFlagChanges([{ id: "foreign", value: "x" }], [{ id: "local" }]), /INVALID_FLAG_ID/);
  assert.throws(() => prepareFlagChanges([{ id: "old", value: "x" }], [{ id: "old", retired: true }]), /INVALID_FLAG_ID/);
  assert.throws(() => prepareFlagChanges([{ id: "one", value: "x" }, { id: "one", value: "y" }], [{ id: "one" }]), /DUPLICATE_FLAG/);
});

test("duplicate normalized values and malformed labels are rejected", () => {
  assert.throws(() => prepareFlagChanges([{ value: "same" }, { value: " same " }]), /DUPLICATE_FLAG_VALUE/);
  assert.throws(() => prepareFlagChanges([{ value: "flag", label: {} }]), /INVALID_FLAG_LABEL/);
  assert.throws(() => prepareFlagChanges("flag"), /INVALID_FLAGS/);
});

test("authored flags stay within the portable format's count and text limits", () => {
  const maximum = Array.from({ length: 20 }, (_, index) => ({ value: `${index}-${"x".repeat(4090)}`, label: "l".repeat(200) }));
  assert.equal(prepareFlagChanges(maximum).flags.length, 20);
  assert.throws(() => prepareFlagChanges([...maximum, { value: "extra" }]), /TOO_MANY_FLAGS/);
  assert.throws(() => prepareFlagChanges([{ value: "x".repeat(4097) }]), /FLAG_VALUE_TOO_LONG/);
  assert.throws(() => prepareFlagChanges([{ value: "flag", label: "l".repeat(201) }]), /INVALID_FLAG_LABEL/);
});
