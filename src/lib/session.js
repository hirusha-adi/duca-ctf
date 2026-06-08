/** Session seal + cookie lifetime (iron-session defaults maxAge to ttl - 60s). */
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function isSecureSessionCookieEnabled() {
  if (process.env.SESSION_COOKIE_SECURE === "true") return true;
  if (process.env.SESSION_COOKIE_SECURE === "false") return false;
  return process.env.NODE_ENV === "production";
}

export const sessionOptions = {
  password: process.env.SESSION_SECRET || "complex_password_at_least_32_characters_long",
  cookieName: "duca_ctf_session",
  ttl: SESSION_TTL_SECONDS,
  cookieOptions: {
    secure: isSecureSessionCookieEnabled(),
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  },
};
