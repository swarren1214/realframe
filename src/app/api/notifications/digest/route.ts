import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotificationDigest, type DigestItem } from "@/lib/email";
import { readPrefs, unsubscribeToken } from "@/lib/notify-links";

export const maxDuration = 60;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.realframe.app";

/**
 * Sends notification emails that are due. Called every few minutes by a Supabase
 * schedule. Safe to call any time: the database hands out each batch once and
 * never emails a person more than once every 15 minutes, so extra calls send
 * nothing extra.
 */
async function run() {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_notification_digest");
  if (error) {
    console.error("claim_notification_digest", error.message);
    return { sent: 0, error: true };
  }
  let sent = 0;
  for (const row of (data ?? []) as {
    user_id: string;
    email: string;
    name: string | null;
    prefs: unknown;
    items: DigestItem[];
  }[]) {
    const prefs = readPrefs(row.prefs);
    // Review decisions are emailed the moment they happen, so they're not repeated here.
    const items = row.items.filter((n) =>
      n.kind === "comment" || n.kind === "reply"
        ? prefs.comments
        : n.kind === "build_done" || n.kind === "build_failed"
          ? prefs.builds
          : false,
    );
    if (!items.length || !row.email) continue;
    const res = await sendNotificationDigest({
      to: row.email,
      name: row.name,
      items,
      appUrl: APP_URL,
      unsubscribeUrl: `${APP_URL}/api/notifications/unsubscribe?u=${row.user_id}&t=${unsubscribeToken(row.user_id)}`,
    }).catch(() => ({ sent: false }));
    if (res.sent) sent++;
  }
  return { sent };
}

export async function POST(_req: NextRequest) {
  return NextResponse.json(await run());
}
export async function GET(_req: NextRequest) {
  return NextResponse.json(await run());
}
