// The digest cron: needs the secret; sends in batches; puts back sends that failed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase } from "./fake-supabase";

const state: { admin: ReturnType<typeof fakeSupabase> } = {} as never;
const outcomes = new Map<string, { sent: boolean; reason?: string }>();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => state.admin.client,
}));
vi.mock("@/lib/email", () => ({
  sendNotificationDigest: async (o: { to: string }) =>
    outcomes.get(o.to) ?? { sent: true },
}));

const req = (auth?: string) =>
  new NextRequest("https://www.realframe.app/api/notifications/digest", {
    headers: auth ? { authorization: auth } : {},
  });
const row = (n: number) => ({
  user_id: `u${n}`,
  email: `p${n}@acme.co`,
  name: null,
  prefs: {},
  items: [{ id: `n${n}`, kind: "comment", body: "Hi" }],
});

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "cron-secret");
  outcomes.clear();
});
afterEach(() => vi.unstubAllEnvs());

describe("digest cron", () => {
  it("refuses callers without the cron secret", async () => {
    state.admin = fakeSupabase(() => undefined);
    const { GET, POST } = await import("@/app/api/notifications/digest/route");
    expect((await GET(req())).status).toBe(401);
    expect((await POST(req("Bearer nope"))).status).toBe(401);
    expect(state.admin.calls).toHaveLength(0);
  });

  it("sends each batch and puts back only the sends that failed", async () => {
    let batches = 0;
    state.admin = fakeSupabase((c) => {
      if (c.rpc === "claim_notification_digest")
        return { data: batches++ === 0 ? [row(1), row(2), row(3)] : [] };
      if (c.rpc === "release_notification_digest") return { data: 1 };
    });
    outcomes.set("p2@acme.co", { sent: false, reason: "failed" });
    outcomes.set("p3@acme.co", { sent: false, reason: "not_configured" });
    const { GET } = await import("@/app/api/notifications/digest/route");
    const res = await GET(req("Bearer cron-secret"));
    expect(await res.json()).toEqual({ sent: 1, retried: 1 });
    const released = state.admin.calls.filter(
      (c) => c.rpc === "release_notification_digest",
    );
    expect(released.map((c) => c.args)).toEqual([
      { p_user: "u2", p_ids: ["n2"] },
    ]);
    expect(
      state.admin.calls.find((c) => c.rpc === "claim_notification_digest")
        ?.args,
    ).toEqual({ p_limit: 25 });
  });
});
