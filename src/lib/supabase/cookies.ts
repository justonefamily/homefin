/**
 * One login for every app on the family domain. When NEXT_PUBLIC_AUTH_COOKIE_DOMAIN is set
 * (".justonefamily.app"), the session cookie is shared by the hub and every app subdomain.
 * Unset (preview deployments, localhost) → cookie scoped to the host as usual.
 */
export const cookieOptions = () => {
  const domain = process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN;
  return domain ? { domain, path: "/", sameSite: "lax" as const, secure: true } : {};
};
