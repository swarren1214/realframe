// Guests poll a tiny endpoint, and load threads only when something changed.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase } from "./fake-supabase";

const state: { admin: ReturnType<typeof fakeSupabase>; guest: boolean } = {
  guest: true,
} as never;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => state.admin.client,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "cookie" }) }),
}));
vi.mock("@/lib/guest", () => ({
  guestCookieName: () => "rf_guest",
  verifyGuest: () => (state.guest ? { name: "Dana" } : null),
}));

beforeEach(() => {
  state.guest = true;
  state.admin = fakeSupabase((c) => {
    if (c.table === "projects") return { data: { id: "p1" } };
    if (c.table === "comment_threads") {
      const full = JSON.stringify(c).includes("comments(");
      return full
        ? { data: [{ id: "t1", created_at: "1", comments: [] }] }
        : { data: [{ status: "open" }, { status: "resolved" }] };
    }
    if (c.table === "comments")
      return { data: [{ created_at: "2026-01-01" }], count: 4 };
  });
});

const get = (stamp?: string) =>
  new NextRequest(
    `https://www.realframe.app/api/p/shop/threads${stamp ? `?stamp=${stamp}` : ""}`,
  );
const ctx = { params: Promise.resolve({ slug: "shop" }) };

describe("guest threads", () => {
  it("answers 'unchanged' without loading threads when the stamp matches", async () => {
    const { GET } = await import("@/app/api/p/[slug]/threads/route");
    const first = await (await GET(get(), ctx)).json();
    expect(first.threads).toHaveLength(1);
    const calls = state.admin.calls.length;
    const again = await (await GET(get(first.stamp), ctx)).json();
    expect(again).toEqual({ stamp: first.stamp, unchanged: true });
    // Only the project lookup and the two counts.
    expect(state.admin.calls.length - calls).toBe(3);
  });

  it("refuses people without the guest cookie", async () => {
    state.guest = false;
    const { GET } = await import("@/app/api/p/[slug]/threads/route");
    expect((await GET(get(), ctx)).status).toBe(404);
  });
});
