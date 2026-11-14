import { NextResponse, after, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processImport } from "@/lib/design-systems/run";

// Reading a repo and studying it with the model takes a minute or two.
export const maxDuration = 300;

/** Starts (or re-runs) a design system import. Team admins only. */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { data: role } = await supabase.rpc("design_system_team_role", {
    ds: id,
  });
  if (role !== "admin")
    return NextResponse.json(
      { error: "Only team admins can sync design systems." },
      { status: 403 },
    );
  const { data: ds } = await supabase
    .from("design_systems")
    .select("status, progress")
    .eq("id", id)
    .maybeSingle();
  if (
    ds?.status === "importing" &&
    ds.progress &&
    ds.progress !== "Waiting to start"
  ) {
    return NextResponse.json(
      { error: "It's already importing." },
      { status: 409 },
    );
  }
  await supabase
    .from("design_systems")
    .update({ status: "importing", progress: "Starting", error: null })
    .eq("id", id);
  after(() => processImport(id));
  return NextResponse.json({ ok: true });
}
