export function adminUserPath(email) {
  return `/admin/user/${encodeURIComponent(email)}`;
}

export function decodeAdminUserEmail(encoded) {
  return decodeURIComponent(encoded);
}
