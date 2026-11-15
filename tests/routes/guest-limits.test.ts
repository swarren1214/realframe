// Guest password tries and guest comments are rate-limited.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase } from "./fake-supabase";

const state: { admin: ReturnType<typeof fakeSupabase>; allowed: boolean } = {
  allowed: true,
} as never;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => state.admin.client,
}));
vi.mock("@/lib/guest", () => ({
  GUEST_MAX_AGE: 60,
  guestCookieName: () => "rf_guest",
  signGuest: () => "signed",
  verifyGuest: () => ({ name: "Dana" }),
}));

beforeEach(() => {
  state.allowed = true;
  state.admin = fakeSupabase((c) => {
    if (c.rpc === "hit_rate_limit") return { data: state.allowed };
    if (c.rpc === "check_project_password") return { data: "p1" };
    if (c.table === "projects")
      return {
        data: {
          id: "p1",
          published: true,
          access_mode: "password",
          guest_comments: true,
        },
      };
  });
});

const unlock = () => {
  const body = new URLSearchParams({ password: "secret1", name: "Dana" });
  return new NextRequest("https://www.realframe.app/api/p/shop/unlock", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-forwarded-for": "203.0.113.9, 10.0.0.1",
    },
  });
};
const ctx = { params: Promise.resolve({ slug: "shop" }) };

describe("guest limits", () => {
  it("counts password tries per address and per prototype", async () => {
    const { POST } = await import("@/app/api/p/[slug]/unlock/route");
    const res = await POST(unlock(), ctx);
    expect(res.headers.get("location")).not.toContain("error=");
    const keys = state.admin.calls
      .filter((c) => c.rpc === "hit_rate_limit")
      .map((c) => (c.args as { p_key: string }).p_key);
    expect(keys).toEqual(["unlock:shop:203.0.113.9", "unlock:shop"]);
  });

  it("stops checking the password once the limit is hit", async () => {
    state.allowed = false;
    const { POST } = await import("@/app/api/p/[slug]/unlock/route");
    const res = await POST(unlock(), ctx);
    expect(res.headers.get("location")).toContain("error=rate");
    expect(
      state.admin.calls.some((c) => c.rpc === "check_project_password"),
    ).toBe(false);
  });

  it("refuses guest comments past the limit with 429", async () => {
    state.allowed = false;
    const { POST } = await import("@/app/api/p/[slug]/comments/route");
    const res = await POST(
      new NextRequest("https://www.realframe.app/api/p/shop/comments", {
        method: "POST",
        body: JSON.stringify({ threadId: "t1", body: "Nice" }),
      }),
      ctx,
    );
    expect(res.status).toBe(429);
  });
});
