import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { CONTENT_LABEL, ROOT_DOMAIN, contentLabel } from "@/lib/hosts";

// Imported apps are served from their own subdomain of realframe.app, one per version:
//   https://app-<version id>-<signature>.realframe.app/
// Their code is untrusted, and Realframe's session cookie is shared across .realframe.app,
// so every response carries a CSP `sandbox` header: the browser gives the page an opaque
// origin even when it's opened directly in a tab, so its scripts can't read cookies or storage.
// The signature makes the hostname a capability that only the server can mint.

function secret() {
  const s = process.env.CONTENT_SIGNING_SECRET || process.env.SUPABASE_SECRET_KEY;
  if (!s) throw new Error("No signing secret for imported apps.");
  return s;
}

function sign(versionId: string) {
  return createHmac("sha256", secret()).update(`content:${versionId}`).digest("hex").slice(0, 16);
}

export function contentUrlFor(versionId: string) {
  return `https://app-${versionId}-${sign(versionId)}.${ROOT_DOMAIN}/`;
}

/** The version id when `host` is a validly signed imported-app host, else null. */
export function versionFromContentHost(host: string | null | undefined) {
  const label = contentLabel(host);
  const m = label ? CONTENT_LABEL.exec(label) : null;
  if (!m) return null;
  const expected = Buffer.from(sign(m[1]));
  const given = Buffer.from(m[2]);
  return expected.length === given.length && timingSafeEqual(expected, given) ? m[1] : null;
}
