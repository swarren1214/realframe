"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { action } from "@/lib/safe-action";
import { createClient } from "@/lib/supabase/server";
import { reviewUrlFor } from "@/lib/hosts";
import {
  closeReview,
  decideReview,
  requestReview,
} from "@/lib/services/reviews";
import type { ReviewDecision } from "@/lib/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

async function reviewUrl(slug: string) {
  const h = await headers();
  return reviewUrlFor(
    slug,
    h.get("x-forwarded-host") ?? h.get("host") ?? "www.realframe.app",
  );
}

export const requestReviewRound = action(
  async (input: {
    projectId: string;
    versionId: string;
    emails: string[];
    note?: string;
    dueAt?: string | null;
    rule?: "all" | "any";
  }) => {
    const { supabase, user } = await requireUser();
    const { data: project } = await supabase
      .from("projects")
      .select("slug")
      .eq("id", input.projectId)
      .single();
    const res = await requestReview(supabase, {
      ...input,
      requester: { id: user.id, email: user.email ?? "" },
      reviewUrl: await reviewUrl(project?.slug ?? ""),
    });
    revalidatePath(`/projects/${input.projectId}`);
    return res;
  },
);

export const decideReviewRound = action(
  async (roundId: string, decision: ReviewDecision, slug: string) => {
    const { supabase, user } = await requireUser();
    const status = await decideReview(supabase, {
      roundId,
      decision,
      reviewer: { id: user.id, email: user.email ?? "" },
      reviewUrl: await reviewUrl(slug),
    });
    revalidatePath(`/p/${slug}`);
    return status;
  },
);

export const closeReviewRound = action(
  async (roundId: string, projectId: string) => {
    const { supabase } = await requireUser();
    await closeReview(supabase, roundId);
    revalidatePath(`/projects/${projectId}`);
  },
);
