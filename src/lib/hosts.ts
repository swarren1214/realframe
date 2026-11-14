// Host helpers for prototype subdomains: <slug>.realframe.app.
export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "realframe.app";
export const APP_HOST = `www.${ROOT_DOMAIN}`;

const RESERVED = new Set([
  "www", "app", "api", "admin", "mail", "email", "auth", "login", "billing", "help",
  "support", "docs", "blog", "status", "cdn", "static", "assets", "dashboard", "realframe",
]);

export function isReservedSlug(slug: string) {
  return RESERVED.has(slug);
}

/** The prototype slug when the host is a prototype subdomain, else null. */
export function subdomainSlug(host: string | null | undefined) {
  const h = (host ?? "").toLowerCase().split(":")[0];
  if (!h.endsWith(`.${ROOT_DOMAIN}`)) return null;
  const sub = h.slice(0, -(ROOT_DOMAIN.length + 1));
  if (!sub || sub.includes(".") || RESERVED.has(sub) || !/^[a-z0-9-]{3,60}$/.test(sub)) return null;
  return sub;
}

/** Share session cookies across realframe.app and its subdomains. */
export function cookieDomain(host: string | null | undefined) {
  const h = (host ?? "").toLowerCase().split(":")[0];
  return h === ROOT_DOMAIN || h.endsWith(`.${ROOT_DOMAIN}`) ? `.${ROOT_DOMAIN}` : undefined;
}

/** Public review URL for a prototype, given the host the app is running on. */
export function reviewUrlFor(slug: string, currentHost: string) {
  const h = currentHost.toLowerCase().split(":")[0];
  if (h === ROOT_DOMAIN || h.endsWith(`.${ROOT_DOMAIN}`)) return `https://${slug}.${ROOT_DOMAIN}`;
  return `${h.startsWith("localhost") ? "http" : "https"}://${currentHost}/p/${slug}`;
}
