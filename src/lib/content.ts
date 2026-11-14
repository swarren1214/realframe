import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Imported apps are served from a separate registrable domain, one subdomain per version:
//   https://<version id>-<signature>.<CONTENT_ROOT_DOMAIN>/
// A separate site keeps their scripts away from Realframe's cookies; a subdomain per version
// gives every app its own origin (so absolute paths and localStorage work); the signature
// makes the hostname a capability that only the server can mint.
import { CONTENT_ROOT_DOMAIN } from "@/lib/hosts";
export { CONTENT_ROOT_DOMAIN };

function secret() {
  const s = process.env.CONTENT_SIGNING_SECRET || process.env.SUPABASE_SECRET_KEY;
  if (!s) throw new Error("No signing secret for imported apps.");
  return s;
}

function sign(versionId: string) {
  return createHmac("sha256", secret()).update(`content:${versionId}`).digest("hex").slice(0, 16);
}

export function contentUrlFor(versionId: string) {
  return `https://${versionId}-${sign(versionId)}.${CONTENT_ROOT_DOMAIN}/`;
}

/** The version id when `host` is a validly signed content host, else null. */
export function versionFromContentHost(host: string | null | undefined) {
  const h = (host ?? "").toLowerCase().split(":")[0];
  if (!h.endsWith(`.${CONTENT_ROOT_DOMAIN}`)) return null;
  const label = h.slice(0, -(CONTENT_ROOT_DOMAIN.length + 1));
  const m = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-([0-9a-f]{16})$/.exec(label);
  if (!m) return null;
  const expected = Buffer.from(sign(m[1]));
  const given = Buffer.from(m[2]);
  return expected.length === given.length && timingSafeEqual(expected, given) ? m[1] : null;
}
