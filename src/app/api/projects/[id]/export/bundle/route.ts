import { NextResponse, type NextRequest } from "next/server";
import { zipSync } from "fflate";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_BUNDLE_BYTES, MAX_BUNDLE_FILES } from "@/lib/bundle";
import { slugify } from "@/lib/export";

export const maxDuration = 120;

/**
 * GET /api/projects/[id]/export/bundle?version=…
 * An imported app version's files, as they're served, in one ZIP.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const versionId = request.nextUrl.searchParams.get("version") ?? "";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { data: role } = await supabase.rpc("project_role", { p: id });
  if (role !== "owner" && role !== "editor")
    return NextResponse.json(
      { error: "Only owners and editors can export." },
      { status: 403 },
    );

  const { data: version } = await supabase
    .from("versions")
    .select("id, number, kind, bundle_id, projects(name)")
    .eq("id", versionId)
    .eq("project_id", id)
    .maybeSingle();
  if (!version || version.kind !== "bundle" || !version.bundle_id)
    return NextResponse.json(
      { error: "That version isn't an imported app." },
      { status: 404 },
    );

  const storage = createAdminClient().storage.from("bundles");
  const base = `${id}/${version.bundle_id}`;
  const files: Record<string, Uint8Array> = {};
  let bytes = 0;
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 12) return;
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await storage.list(
        `${base}${dir ? `/${dir}` : ""}`,
        {
          limit: 1000,
          offset,
        },
      );
      if (error) throw new Error(error.message);
      for (const entry of data ?? []) {
        const rel = dir ? `${dir}/${entry.name}` : entry.name;
        if (!entry.id) {
          await walk(rel, depth + 1);
          continue;
        }
        if (Object.keys(files).length >= MAX_BUNDLE_FILES)
          throw new Error("Too many files.");
        const { data: blob, error: dlError } = await storage.download(
          `${base}/${rel}`,
        );
        if (dlError || !blob)
          throw new Error(dlError?.message ?? "Couldn't read a file.");
        const buf = new Uint8Array(await blob.arrayBuffer());
        bytes += buf.length;
        if (bytes > MAX_BUNDLE_BYTES * 2)
          throw new Error("The app is too big to export.");
        files[rel] = buf;
      }
      if (!data || data.length < 1000) break;
    }
  }
  try {
    await walk("", 0);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  if (!Object.keys(files).length)
    return NextResponse.json(
      { error: "This app has no files." },
      { status: 404 },
    );

  await supabase.from("exports").insert({
    project_id: id,
    version_id: version.id,
    user_id: user.id,
    scope: "prototype",
    format: "bundle",
  });
  const name = slugify(
    (version.projects as unknown as { name: string } | null)?.name ?? "app",
  );
  return new NextResponse(Buffer.from(zipSync(files, { level: 6 })), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${name}-v${version.number}.zip"`,
      "cache-control": "no-store",
    },
  });
}
