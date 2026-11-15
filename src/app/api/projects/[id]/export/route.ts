import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GenerationError, routeDeadline } from "@/lib/ai";
import { finishBuild, limitResponse } from "@/lib/builds";
import { exportWithAi } from "@/lib/export-ai";
import { AI_FORMATS, FORMAT_INFO, readFormat } from "@/lib/export";

export const maxDuration = 300;

const MAX_PART = 200_000;
const UUID = /^[0-9a-f-]{36}$/i;

type Body = {
  format?: string;
  versionId?: string;
  name?: string;
  selection?: {
    label?: string;
    selector?: string;
    html?: string;
    css?: string;
  }[];
};

/**
 * POST /api/projects/[id]/export
 * File formats are made in the browser; this records them. AI formats (React project,
 * React or Tailwind component) run here as a build of kind 'export' and return the files.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const deadline = routeDeadline(maxDuration);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { data: role } = await supabase.rpc("project_role", { p: id });
  if (role !== "owner" && role !== "editor")
    return NextResponse.json(
      { error: "Only owners and editors can export this prototype." },
      { status: 403 },
    );

  const body = (await request.json().catch(() => ({}))) as Body;
  const format = readFormat(body.format);
  if (!format || !body.versionId || !UUID.test(body.versionId))
    return NextResponse.json(
      { error: "Pick a format and a version." },
      { status: 400 },
    );
  const scope = FORMAT_INFO[format].scope;
  const parts = (body.selection ?? []).slice(0, 5).map((s) => ({
    label: String(s.label ?? "").slice(0, 60),
    selector: String(s.selector ?? "").slice(0, 300),
    html: String(s.html ?? ""),
    css: String(s.css ?? ""),
  }));
  if (scope === "selection" && !parts.length)
    return NextResponse.json(
      { error: "Point at an element to export first." },
      { status: 400 },
    );

  const { data: version } = await supabase
    .from("versions")
    .select("id, html, kind")
    .eq("id", body.versionId)
    .eq("project_id", id)
    .maybeSingle();
  if (!version)
    return NextResponse.json(
      { error: "That version doesn't exist." },
      { status: 404 },
    );

  const log = (generationId: string | null) =>
    supabase.from("exports").insert({
      project_id: id,
      version_id: version.id,
      user_id: user.id,
      scope,
      format,
      selectors: parts.map((p) => ({ label: p.label, selector: p.selector })),
      generation_id: generationId,
    });

  if (!AI_FORMATS.includes(format)) {
    const { error } = await log(null);
    if (error) console.error("export log", error.message);
    return NextResponse.json({ ok: true });
  }

  if (format === "react" && version.kind !== "html")
    return NextResponse.json(
      { error: "Imported apps export as their original files." },
      { status: 400 },
    );
  const src =
    format === "react"
      ? {
          name: String(body.name ?? "Prototype").slice(0, 80),
          html: version.html ?? "",
          css: "",
        }
      : {
          name:
            parts
              .map((p) => p.label)
              .filter(Boolean)
              .join(" and ") || "Component",
          html: parts.map((p) => p.html).join("\n\n"),
          css: [...new Set(parts.map((p) => p.css))].join("\n\n"),
        };
  if (
    src.html.length + src.css.length >
    (format === "react" ? 400_000 : MAX_PART)
  )
    return NextResponse.json(
      {
        error:
          "That's too big to convert. Export a smaller part, or use the ZIP.",
      },
      { status: 413 },
    );

  // AI exports are a Pro and Team feature.
  const { data: quota } = await supabase.rpc("build_quota", { p_project: id });
  const plan = (quota as { plan?: string }[] | null)?.[0]?.plan ?? "free";
  if (plan !== "pro" && plan !== "team")
    return NextResponse.json(
      {
        error:
          "React and Tailwind exports are part of Pro. File exports stay free.",
        code: "pro_required",
      },
      { status: 402 },
    );

  const { data: claimId, error: claimError } = await supabase.rpc(
    "claim_generation",
    {
      p_project: id,
      p_kind: "export",
    },
  );
  if (claimError || !claimId) return limitResponse(claimError?.message);

  try {
    const result = await exportWithAi(format, src, deadline);
    await finishBuild(claimId as string, {
      ok: true,
      input: result.usage.input,
      output: result.usage.output,
    });
    const { error } = await log(claimId as string);
    if (error) console.error("export log", error.message);
    return NextResponse.json({ files: result.files });
  } catch (e) {
    const usage = e instanceof GenerationError ? e.usage : undefined;
    await finishBuild(claimId as string, {
      ok: false,
      error: (e as Error).message,
      input: usage?.input ?? null,
      output: usage?.output ?? null,
    });
    return NextResponse.json(
      { error: (e as Error).message || "The export didn't finish." },
      { status: 502 },
    );
  }
}
