/** Session seal + cookie lifetime (iron-session defaults maxAge to ttl - 60s). */
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const SESSION_SECRET = process.env.SESSION_SECRET;

function isSecureSessionCookieEnabled() {
  if (process.env.SESSION_COOKIE_SECURE === "true") return true;
  if (process.env.SESSION_COOKIE_SECURE === "false") return false;
  return process.env.NODE_ENV === "production";
}

if (!SESSION_SECRET) {
  throw new Error("SESSION_SECRET is required");
}

export const sessionOptions = {
  password: SESSION_SECRET,
  cookieName: "duca_ctf_session",
  ttl: SESSION_TTL_SECONDS,
  cookieOptions: {
    secure: isSecureSessionCookieEnabled(),
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  },
};
