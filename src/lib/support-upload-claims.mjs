import { createHmac, timingSafeEqual } from "node:crypto";

const SUPPORT_UPLOAD_URL = /^\/uploads\/support\/[0-9a-f-]{36}\.(?:jpg|png|gif|webp|pdf|txt|zip)$/i;

export function createSupportUploadToken(userId, url, secret) {
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error("A valid session secret is required for upload claims");
  }
  if (typeof userId !== "string" || !userId || typeof url !== "string" || !SUPPORT_UPLOAD_URL.test(url)) {
    throw new Error("Invalid support upload claim");
  }
  return createHmac("sha256", secret).update(JSON.stringify([userId, url])).digest("hex");
}

/** Tokens are checked before normalization, and are never stored in messages. */
export function verifySupportUploadClaims(attachments, userId, secret) {
  if (attachments == null) return true;
  if (!Array.isArray(attachments) || attachments.length > 10) return false;
  return attachments.every((attachment) => {
    if (!attachment || typeof attachment !== "object" || Array.isArray(attachment)) return false;
    if (typeof attachment.url !== "string" || !SUPPORT_UPLOAD_URL.test(attachment.url)) return false;
    if (typeof attachment.uploadToken !== "string" || !/^[0-9a-f]{64}$/i.test(attachment.uploadToken)) return false;
    const expected = createSupportUploadToken(userId, attachment.url, secret);
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(attachment.uploadToken, "hex"));
  });
}
