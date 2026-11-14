import { json, route } from "@/lib/api/v1";

// GET /v1/me → who is signed in, plus their plan and build allowance.
export const GET = route(async (_request, { supabase, user }) => {
  const { data } = await supabase.rpc("generation_quota");
  const quota = Array.isArray(data) ? data[0] : data;
  return json({ id: user.id, email: user.email, quota: quota ?? null });
});
