"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, MessageSquareWarning, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { unwrapped } from "@/lib/safe-action";
import { notify } from "@/lib/toast";
import { decideReviewRound as raw_decide } from "@/app/projects/review-actions";
import type { ReviewDecision, ReviewRound } from "@/lib/types";

const decide = unwrapped(raw_decide);

const fmtDue = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

export const DECISION_LABEL: Record<ReviewDecision, string> = {
  pending: "Waiting",
  approved: "Approved",
  changes_requested: "Changes requested",
};

/** Round status shown to reviewers on the review page, with their Approve / Request changes buttons. */
export function RoundBanner({
  round,
  userEmail,
  slug,
  viewingVersionId,
  isGuest,
}: {
  round: ReviewRound;
  userEmail: string | null;
  slug: string;
  viewingVersionId: string;
  isGuest: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<ReviewDecision | null>(null);
  const mine = userEmail
    ? round.requests.find((r) => r.email === userEmail.toLowerCase())
    : undefined;
  const approved = round.requests.filter(
    (r) => r.decision === "approved",
  ).length;
  const requester = round.requested_by_name ?? "The builder";
  const onRoundVersion = viewingVersionId === round.version_id;

  async function answer(d: ReviewDecision) {
    setBusy(d);
    try {
      await decide(round.id, d, slug);
      notify.success(
        d === "approved"
          ? `You approved v${round.version_number}`
          : d === "changes_requested"
            ? "Asked for changes"
            : "Answer cleared",
      );
      router.refresh();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  const tone =
    mine?.decision === "approved" || round.status === "approved"
      ? "border-emerald-200 bg-emerald-50"
      : mine?.decision === "changes_requested" ||
          round.status === "changes_requested"
        ? "border-ember-200 bg-ember-50"
        : "border-raspberry-200 bg-raspberry-50";

  const title = mine
    ? mine.decision === "approved"
      ? `You approved v${round.version_number}`
      : mine.decision === "changes_requested"
        ? `You asked for changes on v${round.version_number}`
        : `${requester} asked you to review v${round.version_number}${round.due_at ? ` by ${fmtDue(round.due_at)}` : ""}`
    : `Review round on v${round.version_number}: ${approved} of ${round.requests.length} approved`;

  return (
    <section
      aria-label="Review round"
      className={cn(
        "mx-2 mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border px-3.5 py-2.5 lg:mx-3 lg:px-4",
        tone,
      )}
    >
      <div className="min-w-0 flex-1 basis-72">
        <p className="text-[13px] font-semibold text-stone-900">{title}</p>
        <p className="text-xs text-stone-600 max-sm:line-clamp-2">
          {mine && mine.decision === "pending"
            ? round.note
              ? `“${round.note}” Leave comments on the screens, then approve or ask for changes.`
              : "Leave comments on the screens, then approve or ask for changes."
            : mine
              ? `${requester} has been told. You can change your answer until the round closes.`
              : isGuest
                ? "Reviewers asked by name approve here after signing in."
                : `Asked: ${round.requests.map((r) => `${r.name ?? r.email} (${DECISION_LABEL[r.decision].toLowerCase()})`).join(", ")}`}
          {!onRoundVersion &&
            " You're looking at a different version than the one in review."}
        </p>
      </div>
      {mine &&
        (mine.decision === "pending" ? (
          <div className="flex gap-2 max-sm:w-full max-sm:[&>*]:flex-1">
            <Button
              variant="outline"
              loading={busy === "changes_requested"}
              disabled={Boolean(busy)}
              onClick={() => answer("changes_requested")}
            >
              <MessageSquareWarning />
              Request changes
            </Button>
            <Button
              className="bg-emerald-700 text-white hover:bg-emerald-800"
              loading={busy === "approved"}
              disabled={Boolean(busy)}
              onClick={() => answer("approved")}
            >
              <CircleCheck />
              Approve v{round.version_number}
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            loading={busy === "pending"}
            disabled={Boolean(busy)}
            onClick={() => answer("pending")}
          >
            <Undo2 />
            Change my answer
          </Button>
        ))}
    </section>
  );
}
