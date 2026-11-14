"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { unwrapped } from "@/lib/safe-action";
import { notify } from "@/lib/toast";
import { requestReviewRound as raw_request } from "@/app/projects/review-actions";

const requestReviewRound = unwrapped(raw_request);

/** Splits pasted addresses on commas, spaces and new lines. */
export function splitEmails(raw: string) {
  return [
    ...new Set(
      raw
        .split(/[\s,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export function RequestReviewDialog({
  projectId,
  version,
  suggested,
  trigger,
  open: openProp,
  onOpenChange,
}: {
  projectId: string;
  version: { id: string; number: number };
  /** People already on the prototype, offered as one-click additions. */
  suggested: string[];
  trigger?: React.ReactNode;
  /** Control it from outside (e.g. a menu item) instead of the trigger. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (o: boolean) => {
    setOpenState(o);
    onOpenChange?.(o);
  };
  const [emails, setEmails] = useState("");
  const [due, setDue] = useState("");
  const [rule, setRule] = useState<"all" | "any">("all");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const list = splitEmails(emails);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!list.length) return;
    setBusy(true);
    try {
      const res = await requestReviewRound({
        projectId,
        versionId: version.id,
        emails: list,
        note: note.trim() || undefined,
        // End of the chosen day, in the reviewer-facing sense of "by Friday".
        dueAt: due ? new Date(`${due}T23:59:00`).toISOString() : null,
        rule,
      });
      notify.success(
        `Asked ${res.reviewers} reviewer${res.reviewers === 1 ? "" : "s"} to review v${version.number}`,
        {
          description:
            res.emailed === res.reviewers
              ? "They've been emailed the link."
              : "Email isn't set up for everyone, so send them the review link too.",
        },
      );
      setOpen(false);
      setEmails("");
      setNote("");
      setDue("");
      router.refresh();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  const unused = suggested.filter((s) => !list.includes(s));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Request a review of v{version.number}</DialogTitle>
            <DialogDescription>
              Reviewers get an email with the link. Each one approves or asks
              for changes. Reviewers are free.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="rr-emails">Reviewers</Label>
            <Textarea
              id="rr-emails"
              rows={2}
              required
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder="maya@company.com, client@example.com"
            />
            {unused.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {unused.slice(0, 8).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() =>
                      setEmails((v) => (v.trim() ? `${v.trim()}, ${s}` : s))
                    }
                    className="min-h-8 rounded-full bg-stone-100 px-3 text-xs text-stone-700 hover:bg-stone-200"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-stone-500">
              People without access are invited as commenters.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rr-due">Due (optional)</Label>
              <Input
                id="rr-due"
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rr-rule">Approved when</Label>
              <Select
                value={rule}
                onValueChange={(v) => setRule(v as "all" | "any")}
              >
                <SelectTrigger id="rr-rule">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Everyone approves</SelectItem>
                  <SelectItem value="any">Anyone approves</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rr-note">Note to reviewers (optional)</Label>
            <Textarea
              id="rr-note"
              rows={3}
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What should they look at?"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!list.length}>
              <Send />
              {list.length
                ? `Send to ${list.length} reviewer${list.length === 1 ? "" : "s"}`
                : "Send"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
