"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CircleAlert,
  CircleCheck,
  FilePenLine,
  Gauge,
  Inbox,
  MessageSquare,
  MessageSquareReply,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type InboxItem = {
  id: string;
  kind: string;
  projectId: string | null;
  versionId: string | null;
  threadId: string | null;
  teamId?: string | null;
  actor: string | null;
  body: string | null;
  createdAt: string;
  read: boolean;
  projectName: string;
  versionNumber: number | null;
};

const ICON: Record<string, { icon: typeof Inbox; color: string }> = {
  comment: { icon: MessageSquare, color: "bg-ember-600" },
  reply: { icon: MessageSquareReply, color: "bg-ember-600" },
  approved: { icon: CircleCheck, color: "bg-emerald-600" },
  changes: { icon: FilePenLine, color: "bg-amber-600" },
  build_done: { icon: Sparkles, color: "bg-raspberry-600" },
  build_failed: { icon: CircleAlert, color: "bg-red-600" },
  usage_alert: { icon: Gauge, color: "bg-amber-600" },
  spend_cap: { icon: CircleAlert, color: "bg-amber-700" },
};

function line(n: InboxItem) {
  const who = n.actor || "Someone";
  const v = n.versionNumber ? ` v${n.versionNumber}` : "";
  switch (n.kind) {
    case "comment":
      return { who, what: `commented on${v}` };
    case "reply":
      return { who, what: `replied on${v}` };
    case "approved":
      return { who, what: `approved${v}` };
    case "changes":
      return { who, what: `asked for changes on${v}` };
    case "build_done":
      return {
        who: "Build finished:",
        what: n.versionNumber
          ? `v${n.versionNumber} is ready`
          : "a new version is ready",
      };
    case "usage_alert":
      return { who: "Usage alert:", what: n.body ?? "check your usage" };
    case "spend_cap":
      return { who: "Spend cap reached:", what: n.body ?? "builds are paused" };
    default:
      return { who: "Build failed:", what: n.body ?? "it didn't finish" };
  }
}

/** Where a notification opens: the version and the panel it's about. */
function hrefFor(n: InboxItem) {
  if (n.kind === "usage_alert" || n.kind === "spend_cap")
    return `${n.teamId ? "/team/billing" : "/billing"}?tab=usage`;
  if (!n.projectId) return "/projects";
  const q = new URLSearchParams();
  if (n.versionId) q.set("v", n.versionId);
  if (["comment", "reply", "approved", "changes"].includes(n.kind))
    q.set("tab", "comments");
  const s = q.toString();
  return `/projects/${n.projectId}${s ? `?${s}` : ""}`;
}

function when(iso: string) {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const TABS = [
  ["all", "All"],
  ["comments", "Comments"],
  ["reviews", "Reviews"],
  ["builds", "Builds"],
  ["billing", "Billing"],
] as const;

export function InboxList({
  items,
  show,
}: {
  items: InboxItem[];
  show: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const unread = items.filter((n) => !n.read && !readIds.has(n.id));

  async function markRead(ids: string[] | null) {
    setReadIds((s) => new Set([...s, ...(ids ?? items.map((n) => n.id))]));
    await supabase.rpc("mark_notifications_read", { p_ids: ids });
    router.refresh();
  }

  const today = new Date().toDateString();
  const groups = [
    {
      label: "Today",
      list: items.filter((n) => new Date(n.createdAt).toDateString() === today),
    },
    {
      label: "Earlier",
      list: items.filter((n) => new Date(n.createdAt).toDateString() !== today),
    },
  ].filter((g) => g.list.length);

  return (
    <div>
      <div className="flex items-center gap-3">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Inbox
        </h1>
        <div className="flex-1" />
        {unread.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => markRead(null)}>
            Mark all read
          </Button>
        )}
      </div>
      <nav
        aria-label="Filter"
        className="mt-4 flex w-max max-w-full gap-0.5 overflow-x-auto rounded-full bg-foreground/5 p-0.5"
      >
        {TABS.map(([id, label]) => (
          <Link
            key={id}
            href={id === "all" ? "/inbox" : `/inbox?show=${id}`}
            aria-current={show === id ? "page" : undefined}
            className="inline-flex h-8 items-center rounded-full px-3.5 text-[13px] font-medium text-stone-600 no-underline aria-[current=page]:bg-card aria-[current=page]:text-foreground aria-[current=page]:shadow-sm"
          >
            {label}
          </Link>
        ))}
      </nav>

      {groups.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-2 rounded-3xl border border-dashed border-stone-200 px-6 py-14 text-center">
          <Inbox className="size-6 text-stone-400" aria-hidden="true" />
          <p className="text-sm font-medium">Nothing here yet</p>
          <p className="max-w-sm text-[13px] text-stone-600">
            Comments, approvals and finished builds on your prototypes show up
            here.
          </p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.label} className="mt-6">
            <h2 className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-[.08em] text-stone-400">
              {g.label}
            </h2>
            <ul className="space-y-1.5">
              {g.list.map((n) => {
                const { icon: Icon, color } = ICON[n.kind] ?? ICON.comment;
                const { who, what } = line(n);
                const isUnread = !n.read && !readIds.has(n.id);
                return (
                  <li key={n.id}>
                    <Link
                      href={hrefFor(n)}
                      onClick={() => isUnread && markRead([n.id])}
                      className={cn(
                        "flex gap-3 rounded-2xl px-3.5 py-3 no-underline transition-colors hover:bg-card",
                        isUnread &&
                          "bg-card shadow-[inset_0_0_0_1px_var(--color-border)]",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-8 shrink-0 place-items-center rounded-full text-white",
                          color,
                        )}
                        aria-hidden="true"
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] text-foreground">
                          <b className="font-semibold">{who}</b> {what}
                        </span>
                        {n.body &&
                          ![
                            "build_failed",
                            "usage_alert",
                            "spend_cap",
                          ].includes(n.kind) && (
                            <span className="mt-0.5 block truncate text-[13px] text-stone-600">
                              &ldquo;{n.body}&rdquo;
                            </span>
                          )}
                        <span className="mt-0.5 block text-xs text-stone-500">
                          {n.kind === "usage_alert" || n.kind === "spend_cap"
                            ? "Usage & billing"
                            : n.projectName}{" "}
                          · {when(n.createdAt)}
                        </span>
                      </span>
                      {isUnread && (
                        <span
                          className="mt-2 size-2 shrink-0 rounded-full bg-raspberry-600"
                          aria-label="Unread"
                        />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
