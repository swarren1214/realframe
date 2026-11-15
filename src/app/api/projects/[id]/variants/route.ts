import { readReferences, referenceBlocks } from "@/lib/references";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GenerationError, generatePrototype, routeDeadline } from "@/lib/ai";
import {
  IMPORTED_APP_MESSAGE,
  finishBuild,
  limitResponse,
  loadBuildContext,
  readPrompt,
} from "@/lib/builds";

export const maxDuration = 300;

// Directions that push each variant somewhere different.
const DIRECTIONS = [
  "Stay close to the request with a clean, conventional, highly usable layout.",
  "Take a bolder visual direction: a different layout structure, typographic scale and use of color than the obvious choice.",
  "Explore a different information hierarchy or interaction model for the same goal, e.g. a different navigation pattern or primary view.",
];

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
  if (role !== "owner" && role !== "editor") {
    return NextResponse.json(
      { error: "Only owners and editors can change this prototype." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    prompt?: string;
    baseVersionId?: string | null;
    count?: number;
    references?: unknown;
  };
  const read = readPrompt(body);
  if ("error" in read)
    return NextResponse.json({ error: read.error }, { status: 400 });
  const { prompt } = read;
  const attached = readReferences(body.references, id, user.id);
  const count = Math.min(3, Math.max(2, Math.round(Number(body.count) || 3)));

  const { current, history, context } = await loadBuildContext(
    supabase,
    id,
    body.baseVersionId,
  );
  if (current?.kind === "bundle")
    return NextResponse.json({ error: IMPORTED_APP_MESSAGE }, { status: 400 });

  // Each variant is a build. Claim them one at a time; stop when the plan runs out.
  const claims: string[] = [];
  let lastError: string | undefined;
  for (let i = 0; i < count; i++) {
    const { data, error } = await supabase.rpc("claim_generation", {
      p_project: id,
      p_kind: "variant",
    });
    if (error || !data) {
      lastError = error?.message;
      break;
    }
    claims.push(data as string);
  }
  if (claims.length < 2) {
    for (const c of claims) await finishBuild(c, { ok: false });
    if (claims.length === 0) return limitResponse(lastError);
    return NextResponse.json(
      {
        error:
          "You only have one build left, and variants need at least two. Use a regular build instead.",
        code: "not_enough",
      },
      { status: 402 },
    );
  }

  await supabase.from("messages").insert({
    project_id: id,
    role: "user",
    content: `${prompt}\n\n(${claims.length} variants)`,
    created_by: user.id,
    attachments: attached,
  });
  const references = await referenceBlocks(attached);

  const groupId = crypto.randomUUID();
  const results = await Promise.allSettled(
    claims.map((_, i) =>
      generatePrototype({
        prompt,
        context,
        currentHtml: current?.html ?? null,
        history,
        variantHint: DIRECTIONS[i],
        references,
        deadline,
      }),
    ),
  );

  const rows = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      await finishBuild(claims[i], {
        ok: true,
        input: r.value.usage.input,
        output: r.value.usage.output,
      });
      rows.push({
        project_id: id,
        group_id: groupId,
        position: rows.length + 1,
        base_version_id: current?.id ?? null,
        prompt,
        html: r.value.html,
        summary: r.value.summary,
        created_by: user.id,
      });
    } else {
      const err = r.reason;
      await finishBuild(claims[i], {
        ok: false,
        error: err instanceof Error ? err.message : "Generation failed.",
        ...(err instanceof GenerationError ? err.usage : {}),
      });
    }
  }

  if (rows.length === 0) {
    const reason = results.find((r) => r.status === "rejected") as
      PromiseRejectedResult | undefined;
    const message =
      reason?.reason instanceof Error
        ? reason.reason.message
        : "Generation failed.";
    await supabase.from("messages").insert({
      project_id: id,
      role: "assistant",
      content: `That didn't work: ${message}`,
      created_by: user.id,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { error } = await supabase.from("variants").insert(rows);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("messages").insert({
    project_id: id,
    role: "assistant",
    content: `Made ${rows.length} variants to compare. Keep the one you like and it becomes the next version.`,
    created_by: user.id,
  });
  return NextResponse.json({ groupId, count: rows.length });
}
