import "server-only";
import { readPrefs } from "@/lib/notify-links";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendFeedbackAddressed,
  sendReviewDecision,
  sendReviewRequest,
} from "@/lib/email";
import type { ReviewDecision, ReviewRound } from "@/lib/types";
import { UserError } from "@/lib/services/projects";

// Review rounds and fix-from-feedback, shared by server actions and (later) the /v1 API.
// Every write goes through the signed-in user's client, so SQL decides who may do what;
// the admin client only reads names and addresses for emails.

const ROUND_COLUMNS =
  "id, project_id, version_id, note, due_at, rule, status, created_at, requested_by, versions(number), review_requests(email, user_id, decision, decided_at)";

type RoundRow = {
  id: string;
  project_id: string;
  version_id: string;
  note: string | null;
  due_at: string | null;
  rule: "all" | "any";
  status: ReviewRound["status"];
  created_at: string;
  requested_by: string | null;
  versions: { number: number } | { number: number }[] | null;
  review_requests: {
    email: string;
    user_id: string | null;
    decision: ReviewDecision;
    decided_at: string | null;
  }[];
};

async function names(ids: string[]) {
  if (!ids.length) return new Map<string, string | null>();
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id, display_name")
    .in("id", ids);
  return new Map(
    (data ?? []).map((p) => [
      p.id as string,
      (p.display_name as string) ?? null,
    ]),
  );
}

/**
 * The prototype's open review round, or null. `client` can be the user's (RLS applies) or the
 * admin client for password guests. Returns null if the rounds table doesn't exist yet, so the
 * review page keeps working before the migration is applied.
 */
export async function loadActiveRound(
  client: SupabaseClient,
  projectId: string,
): Promise<ReviewRound | null> {
  const { data, error } = await client
    .from("review_rounds")
    .select(ROUND_COLUMNS)
    .eq("project_id", projectId)
    .is("closed_at", null)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as unknown as RoundRow;
  const who = await names(
    [r.requested_by, ...r.review_requests.map((q) => q.user_id)].filter(
      (x): x is string => Boolean(x),
    ),
  );
  const v = Array.isArray(r.versions) ? r.versions[0] : r.versions;
  return {
    id: r.id,
    project_id: r.project_id,
    version_id: r.version_id,
    version_number: v?.number ?? null,
    note: r.note,
    due_at: r.due_at,
    rule: r.rule,
    status: r.status,
    created_at: r.created_at,
    requested_by_name: r.requested_by
      ? (who.get(r.requested_by) ?? null)
      : null,
    requests: r.review_requests
      .map((q) => ({
        email: q.email,
        name: q.user_id ? (who.get(q.user_id) ?? null) : null,
        decision: q.decision,
        decided_at: q.decided_at,
      }))
      .sort((a, b) => a.email.localeCompare(b.email)),
  };
}

/** Parses "a@x.com, b@y.com\nc@z.com" into clean, unique addresses. */
export function parseEmails(raw: string | string[]) {
  const list = (Array.isArray(raw) ? raw : raw.split(/[\s,;]+/))
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const bad = list.filter((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  if (bad.length) throw new UserError(`${bad[0]} isn't an email address.`);
  return [...new Set(list)];
}

export async function requestReview(
  supabase: SupabaseClient,
  opts: {
    projectId: string;
    versionId: string;
    emails: string[];
    note?: string | null;
    dueAt?: string | null;
    rule?: "all" | "any";
    requester: { id: string; email: string };
    reviewUrl: string;
  },
) {
  const emails = parseEmails(opts.emails).filter(
    (e) => e !== opts.requester.email.toLowerCase(),
  );
  if (!emails.length)
    throw new UserError("Add at least one reviewer besides you.");
  const { data: roundId, error } = await supabase.rpc("request_review", {
    p_project: opts.projectId,
    p_version: opts.versionId,
    p_emails: emails,
    p_note: opts.note ?? null,
    p_due: opts.dueAt ?? null,
    p_rule: opts.rule ?? "all",
  });
  if (error) throw new UserError(error.message);

  const admin = createAdminClient();
  const [{ data: project }, { data: version }, { data: me }] =
    await Promise.all([
      admin.from("projects").select("name").eq("id", opts.projectId).single(),
      admin.from("versions").select("number").eq("id", opts.versionId).single(),
      admin
        .from("profiles")
        .select("display_name")
        .eq("id", opts.requester.id)
        .maybeSingle(),
    ]);
  const results = await Promise.all(
    emails.map((to) =>
      sendReviewRequest({
        to,
        requester: me?.display_name || opts.requester.email,
        prototype: project?.name ?? "a prototype",
        version: version?.number ?? 1,
        note: opts.note ?? null,
        dueAt: opts.dueAt ?? null,
        url: opts.reviewUrl,
      }).catch(() => ({ sent: false as const })),
    ),
  );
  return {
    roundId: roundId as string,
    emailed: results.filter((r) => r.sent).length,
    reviewers: emails.length,
  };
}

export async function decideReview(
  supabase: SupabaseClient,
  opts: {
    roundId: string;
    decision: ReviewDecision;
    reviewer: { id: string; email: string };
    reviewUrl: string;
  },
) {
  const { data: status, error } = await supabase.rpc("decide_review", {
    p_round: opts.roundId,
    p_decision: opts.decision,
  });
  if (error) throw new UserError(error.message);
  if (opts.decision !== "pending") {
    const admin = createAdminClient();
    const { data: round } = await admin
      .from("review_rounds")
      .select("requested_by, projects(name), versions(number)")
      .eq("id", opts.roundId)
      .single();
    const r = round as unknown as {
      requested_by: string | null;
      projects: { name: string } | null;
      versions: { number: number } | null;
    } | null;
    if (r?.requested_by) {
      const [{ data: requester }, { data: me }] = await Promise.all([
        admin
          .from("profiles")
          .select("email, notify_email")
          .eq("id", r.requested_by)
          .single(),
        admin
          .from("profiles")
          .select("display_name")
          .eq("id", opts.reviewer.id)
          .maybeSingle(),
      ]);
      if (requester?.email && readPrefs(requester.notify_email).reviews)
        await sendReviewDecision({
          to: requester.email,
          reviewer: me?.display_name || opts.reviewer.email,
          prototype: r.projects?.name ?? "your prototype",
          version: r.versions?.number ?? 1,
          decision: opts.decision,
          roundStatus: status as string,
          url: opts.reviewUrl,
        }).catch(() => undefined);
    }
  }
  return status as ReviewRound["status"];
}

export async function closeReview(supabase: SupabaseClient, roundId: string) {
  const { error } = await supabase.rpc("close_review", { p_round: roundId });
  if (error) throw new UserError(error.message);
}

/**
 * After a fix-from-feedback build: marks the threads addressed and emails the people who
 * commented (except the builder). Never throws: the build already succeeded.
 */
export async function markAddressed(
  supabase: SupabaseClient,
  opts: {
    projectId: string;
    threadIds: string[];
    version: { id: string; number: number };
    builder: { id: string; email: string };
    reviewUrl: string;
  },
) {
  try {
    const { error } = await supabase.rpc("mark_threads_addressed", {
      p_project: opts.projectId,
      p_threads: opts.threadIds,
      p_version: opts.version.id,
    });
    if (error) throw new Error(error.message);
    const admin = createAdminClient();
    const [{ data: comments }, { data: project }, { data: me }] =
      await Promise.all([
        admin
          .from("comments")
          .select("thread_id, author_email, is_guest")
          .in("thread_id", opts.threadIds),
        admin.from("projects").select("name").eq("id", opts.projectId).single(),
        admin
          .from("profiles")
          .select("display_name")
          .eq("id", opts.builder.id)
          .maybeSingle(),
      ]);
    const perPerson = new Map<string, Set<string>>();
    for (const c of comments ?? []) {
      const email = String(c.author_email ?? "").toLowerCase();
      if (!email || c.is_guest || email === opts.builder.email.toLowerCase())
        continue;
      if (!perPerson.has(email)) perPerson.set(email, new Set());
      perPerson.get(email)!.add(c.thread_id as string);
    }
    await Promise.all(
      [...perPerson].map(([to, threads]) =>
        sendFeedbackAddressed({
          to,
          builder: me?.display_name || opts.builder.email,
          prototype: project?.name ?? "a prototype",
          version: opts.version.number,
          count: threads.size,
          url: opts.reviewUrl,
        }).catch(() => undefined),
      ),
    );
    return perPerson.size;
  } catch (e) {
    console.error("markAddressed", e);
    return 0;
  }
}
