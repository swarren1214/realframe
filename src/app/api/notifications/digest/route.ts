import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotificationDigest, type DigestItem } from "@/lib/email";
import { readPrefs, unsubscribeToken } from "@/lib/notify-links";

export const maxDuration = 60;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.realframe.app";

type Row = {
  user_id: string;
  email: string;
  name: string | null;
  prefs: unknown;
  items: (DigestItem & { id: string })[];
};

/** People claimed per batch, and when to stop claiming more (the function allows 60 s). */
const BATCH = 25;
const BUDGET_MS = 40_000;

/**
 * Sends notification emails that are due. Vercel Cron calls it every 5 minutes with the cron
 * secret. The database hands out each batch once and never emails a person more than once
 * every 15 minutes. Batches are small and sent in parallel; a send that fails is put back
 * for the next run (up to three tries).
 */
async function run() {
  const admin = createAdminClient();
  const started = Date.now();
  let sent = 0;
  let retried = 0;
  while (Date.now() - started < BUDGET_MS) {
    const { data, error } = await admin.rpc("claim_notification_digest", {
      p_limit: BATCH,
    });
    if (error) {
      console.error("claim_notification_digest", error.message);
      return { sent, retried, error: true };
    }
    const rows = (data ?? []) as Row[];
    if (!rows.length) break;
    const results = await Promise.all(rows.map((row) => sendOne(row)));
    for (const [i, r] of results.entries()) {
      if (r === "sent") sent++;
      if (r === "failed") {
        retried++;
        const { error: putBack } = await admin.rpc(
          "release_notification_digest",
          { p_user: rows[i].user_id, p_ids: rows[i].items.map((n) => n.id) },
        );
        if (putBack)
          console.error("release_notification_digest", putBack.message);
      }
    }
    if (rows.length < BATCH) break;
  }
  return { sent, retried };
}

async function sendOne(row: Row): Promise<"sent" | "skipped" | "failed"> {
  const prefs = readPrefs(row.prefs);
  // Review decisions are emailed the moment they happen, so they're not repeated here.
  const items = row.items.filter((n) =>
    n.kind === "comment" || n.kind === "reply"
      ? prefs.comments
      : n.kind === "build_done" || n.kind === "build_failed"
        ? prefs.builds
        : n.kind === "usage_alert" || n.kind === "spend_cap"
          ? prefs.billing
          : false,
  );
  if (!items.length || !row.email) return "skipped";
  const res = await sendNotificationDigest({
    to: row.email,
    name: row.name,
    items,
    appUrl: APP_URL,
    unsubscribeUrl: `${APP_URL}/api/notifications/unsubscribe?u=${row.user_id}&t=${unsubscribeToken(row.user_id)}`,
  }).catch(() => ({ sent: false as const, reason: "failed" as const }));
  if (res.sent) return "sent";
  // Email not set up on this deployment: nothing to retry.
  return "reason" in res && res.reason === "not_configured"
    ? "skipped"
    : "failed";
}

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(
    secret && req.headers.get("authorization") === `Bearer ${secret}`,
  );
}

export async function GET(req: NextRequest) {
  if (!authorized(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await run());
}
export async function POST(req: NextRequest) {
  return GET(req);
}
