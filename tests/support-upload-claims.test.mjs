import test from "node:test";
import assert from "node:assert/strict";
import { createSupportUploadToken, verifySupportUploadClaims } from "../src/lib/support-upload-claims.mjs";

const secret = "test-only-upload-claim-secret-at-least-32-characters";
const url = "/uploads/support/00000000-0000-0000-0000-000000000000.txt";
const otherUrl = "/uploads/support/11111111-1111-1111-1111-111111111111.txt";
const attachment = { url, uploadToken: createSupportUploadToken("owner", url, secret) };

test("an upload claim belongs to the uploader and exact generated file URL", () => {
  assert.equal(verifySupportUploadClaims([attachment], "owner", secret), true);
  assert.equal(verifySupportUploadClaims([attachment], "other-user", secret), false);
  assert.equal(verifySupportUploadClaims([{ ...attachment, url: otherUrl }], "owner", secret), false);
  assert.equal(verifySupportUploadClaims([attachment], "owner", `${secret}-rotated`), false);
});

test("knowing another ticket's attachment URL cannot create an access-granting message", () => {
  assert.equal(verifySupportUploadClaims([{ url }], "attacker", secret), false);
  assert.equal(verifySupportUploadClaims([{ url, uploadToken: "0".repeat(64) }], "attacker", secret), false);
  assert.equal(verifySupportUploadClaims([{ ...attachment, uploadToken: "x" }], "owner", secret), false);
});

test("all attachments must have valid claims, including entries at the end", () => {
  assert.equal(verifySupportUploadClaims([attachment, { url: otherUrl }], "owner", secret), false);
  assert.equal(verifySupportUploadClaims([null], "owner", secret), false);
  assert.equal(verifySupportUploadClaims({ url }, "owner", secret), false);
  assert.equal(verifySupportUploadClaims(Array(11).fill(attachment), "owner", secret), false);
});

test("absent attachments and text-only messages need no claims", () => {
  assert.equal(verifySupportUploadClaims(undefined, "owner", secret), true);
  assert.equal(verifySupportUploadClaims([], "owner", secret), true);
});

test("claims cannot refer to external URLs, public writeup files, or traversal paths", () => {
  for (const value of [`https://example.test${url}`, url.replace("support", "writeups"), "/uploads/support/../../.env"]) {
    assert.equal(verifySupportUploadClaims([{ url: value, uploadToken: attachment.uploadToken }], "owner", secret), false);
    assert.throws(() => createSupportUploadToken("owner", value, secret), /Invalid support upload claim/);
  }
});
