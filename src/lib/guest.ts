import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Signed cookie for password-link guests: proves they entered the right password
// for one project, and carries the name they comment under.
const MAX_AGE = 60 * 60 * 24 * 30;

function key() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("SUPABASE_SECRET_KEY is not set on the server.");
  return createHmac("sha256", secret).update("realframe-guest-v1").digest();
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString("utf8");

export const guestCookieName = (projectId: string) =>
  `rf_guest_${projectId.replace(/-/g, "")}`;
export const GUEST_MAX_AGE = MAX_AGE;

export function signGuest(projectId: string, name: string) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const body = `${projectId}.${exp}.${b64(name)}`;
  const sig = createHmac("sha256", key()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyGuest(
  value: string | undefined,
  projectId: string,
): { name: string } | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const [pid, exp, name, sig] = parts;
  if (pid !== projectId || Number(exp) < Date.now() / 1000) return null;
  const expected = createHmac("sha256", key())
    .update(`${pid}.${exp}.${name}`)
    .digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return null;
  try {
    return { name: unb64(name).slice(0, 60) || "Guest" };
  } catch {
    return null;
  }
}
