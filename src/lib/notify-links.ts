import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/** A token for one-click unsubscribe links, so the link works without signing in. */
export function unsubscribeToken(userId: string) {
  return createHmac("sha256", process.env.SUPABASE_SECRET_KEY ?? "")
    .update(`unsubscribe:${userId}`)
    .digest("hex")
    .slice(0, 32);
}

export function validUnsubscribe(userId: string, token: string) {
  const expected = Buffer.from(unsubscribeToken(userId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export type NotifyPrefs = {
  comments: boolean;
  reviews: boolean;
  builds: boolean;
  billing: boolean;
};

export function readPrefs(raw: unknown): NotifyPrefs {
  const r = (raw ?? {}) as Partial<NotifyPrefs>;
  return {
    comments: r.comments !== false,
    reviews: r.reviews !== false,
    builds: r.builds !== false,
    billing: r.billing !== false,
  };
}
