import { ApiError, json, readJson, route } from "@/lib/api/v1";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /v1/devices { token, platform: "ios" | "android", appVersion? } → register for push.
// A token moves with the person signed in on the device, so the row is claimed with the
// service key (RLS would stop one user taking over another's stale row).
export const POST = route(async (request, { user }) => {
  const body = await readJson<{ token: string; platform: string; appVersion: string }>(request);
  const token = String(body.token ?? "");
  if (token.length < 8 || token.length > 512) throw new ApiError(400, "Invalid push token.", "invalid");
  if (body.platform !== "ios" && body.platform !== "android") throw new ApiError(400, "Platform must be ios or android.", "invalid");
  const { error } = await createAdminClient()
    .from("device_tokens")
    .upsert(
      { token, user_id: user.id, platform: body.platform, app_version: body.appVersion ?? null, last_seen: new Date().toISOString() },
      { onConflict: "token" },
    );
  if (error) throw new Error(error.message);
  return json({ registered: true });
});

// DELETE /v1/devices?token= → on sign-out.
export const DELETE = route(async (request, { supabase }) => {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) throw new ApiError(400, "Say which token to remove.", "invalid");
  await supabase.from("device_tokens").delete().eq("token", token);
  return new Response(null, { status: 204 });
});
