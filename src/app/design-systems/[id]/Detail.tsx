"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronLeft,
  MessageSquarePlus,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  addRule as raw_addRule,
  deleteDesignSystem as raw_deleteDesignSystem,
  removeRule as raw_removeRule,
  renameDesignSystem as raw_renameDesignSystem,
  setSyncOnPush as raw_setSyncOnPush,
  setTeamDefault as raw_setTeamDefault,
  updateRule as raw_updateRule,
} from "../actions";
import { unwrapped } from "@/lib/safe-action";
import { notify } from "@/lib/toast";
import {
  sourceLabel,
  type DesignSystem,
  type Rule,
} from "@/lib/design-systems/types";
import type { Team } from "@/lib/team-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SwitchRow } from "@/components/ui/switch-row";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Eyebrow } from "@/components/Eyebrow";
import { ComponentPreview } from "@/components/design-systems/ComponentPreview";
import { startSync } from "@/components/design-systems/ImportDesignSystem";
import { AnimatePresence, listItem, motion } from "@/components/motion";
import { KindBadge, SOURCE_ICON, usePollWhile } from "../Library";

const addRule = unwrapped(raw_addRule);
const updateRule = unwrapped(raw_updateRule);
const removeRule = unwrapped(raw_removeRule);
const renameDesignSystem = unwrapped(raw_renameDesignSystem);
const setSyncOnPush = unwrapped(raw_setSyncOnPush);
const setTeamDefault = unwrapped(raw_setTeamDefault);
const deleteDesignSystem = unwrapped(raw_deleteDesignSystem);

const ago = (iso: string) => {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 90) return "just now";
  if (d < 3600) return `${Math.round(d / 60)}m ago`;
  if (d < 86400) return `${Math.round(d / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-stone-200/80 bg-card p-5 shadow-[0_12px_32px_-24px_rgba(28,25,23,.35)]">
      <div className="mb-4 flex items-center gap-3">
        <Eyebrow>{title}</Eyebrow>
        <div className="flex-1" />
        {action}
      </div>
      {children}
    </section>
  );
}

function RuleRow({
  rule,
  admin,
  dsId,
  onDone,
}: {
  rule: Rule;
  admin: boolean;
  dsId: string;
  onDone: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(rule.body);
  const [busy, setBusy] = useState(false);
  async function act(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      notify.success(done);
      setEditing(false);
      onDone();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <motion.li
      {...listItem}
      className="flex gap-3 rounded-2xl bg-stone-50 px-3.5 py-3 text-[13px] leading-relaxed text-stone-700"
    >
      {editing ? (
        <div className="flex-1 space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            rows={2}
            aria-label="Rule"
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              loading={busy}
              onClick={() =>
                act(
                  () => updateRule(dsId, rule.id, { body: text }),
                  "Rule saved",
                )
              }
            >
              <Check />
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => (setEditing(false), setText(rule.body))}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <span className="min-w-0 flex-1">
            {rule.body}
            {rule.origin === "admin" && (
              <span className="ml-1.5 text-xs font-medium text-raspberry-700">
                · Added by {rule.created_by_email ?? "an admin"}
              </span>
            )}
            {rule.status === "pending" && (
              <span className="ml-1.5 text-xs font-medium text-amber-800">
                · Suggested by {rule.created_by_email ?? "a teammate"}
              </span>
            )}
          </span>
          {admin && (
            <span className="flex shrink-0 items-start gap-0.5">
              {rule.status === "pending" && (
                <Button
                  size="sm"
                  variant="soft"
                  loading={busy}
                  onClick={() =>
                    act(
                      () => updateRule(dsId, rule.id, { status: "active" }),
                      "Rule approved",
                    )
                  }
                >
                  Approve
                </Button>
              )}
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Edit rule"
                onClick={() => setEditing(true)}
              >
                <Pencil />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={
                  rule.status === "pending"
                    ? "Dismiss suggestion"
                    : "Remove rule"
                }
                onClick={() =>
                  act(() => removeRule(dsId, rule.id), "Rule removed")
                }
              >
                <X />
              </Button>
            </span>
          )}
        </>
      )}
    </motion.li>
  );
}

export function Detail({
  ds,
  team,
  rules,
  projects,
}: {
  ds: DesignSystem;
  team: Team;
  rules: Rule[];
  projects: { id: string; name: string; updated_at: string }[];
}) {
  const router = useRouter();
  const admin = team.role === "admin";
  const [q, setQ] = useState("");
  const [newRule, setNewRule] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  usePollWhile(ds.status === "importing");
  const Icon = SOURCE_ICON[ds.source_kind];
  const shown = ds.components.filter((c) =>
    c.name.toLowerCase().includes(q.trim().toLowerCase()),
  );
  const pending = rules.filter((r) => r.status === "pending");
  const active = rules.filter((r) => r.status === "active");

  async function run(key: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(key);
    try {
      await fn();
      if (done) notify.success(done);
      router.refresh();
      return true;
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "That didn't work.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  const t = ds.tokens;
  return (
    <main className="mx-auto max-w-5xl px-2 pt-8">
      <Link
        href="/design-systems"
        className="inline-flex items-center gap-1 text-[13px] text-stone-600 no-underline hover:text-stone-900"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Design systems
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {admin ? (
          <>
            <label htmlFor="ds-title" className="sr-only">
              Name
            </label>
            <input
              id="ds-title"
              defaultValue={ds.name}
              maxLength={60}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (!v) e.target.value = ds.name;
                else if (v !== ds.name)
                  run("rename", () => renameDesignSystem(ds.id, v), "Renamed");
              }}
              className="min-w-0 rounded-xl bg-transparent px-1 font-display text-2xl font-bold tracking-tight outline-none [field-sizing:content] hover:bg-stone-900/[.04] focus:bg-card focus:ring-2 focus:ring-raspberry-200"
            />
          </>
        ) : (
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {ds.name}
          </h1>
        )}
        <KindBadge kind={ds.kind} />
        {ds.is_default && (
          <Badge className="bg-raspberry-50 text-raspberry-800">
            Team default
          </Badge>
        )}
        <div className="flex-1" />
        {admin && ds.status !== "importing" && (
          <>
            {!ds.is_default && ds.status === "ready" && (
              <Button
                variant="ghost"
                loading={busy === "default"}
                onClick={() =>
                  run(
                    "default",
                    () => setTeamDefault(ds.team_id, ds.id),
                    `${ds.name} is now the team default`,
                  )
                }
              >
                <Star />
                Make team default
              </Button>
            )}
            <Button
              variant="outline"
              loading={busy === "sync"}
              onClick={() =>
                run(
                  "sync",
                  () => startSync(ds.id),
                  ds.source_kind === "upload"
                    ? "Re-reading the files"
                    : "Syncing",
                )
              }
            >
              <RefreshCw />
              {ds.status === "failed" ? "Try again" : "Sync now"}
            </Button>
          </>
        )}
      </div>
      <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-stone-600">
        <Icon className="size-3.5" aria-hidden="true" />
        {sourceLabel(ds)}
        {ds.synced_at && (
          <>
            <span aria-hidden="true">·</span>
            <span suppressHydrationWarning>
              Synced {ago(ds.synced_at)}
              {ds.synced_sha && ds.source_kind === "github"
                ? ` from ${ds.synced_sha.slice(0, 7)}`
                : ""}
            </span>
          </>
        )}
      </p>
      {ds.summary && (
        <p className="mt-3 max-w-2xl text-sm text-stone-700">{ds.summary}</p>
      )}

      {ds.status === "importing" && (
        <div className="mt-6 space-y-2 rounded-3xl border border-stone-200 bg-card p-5">
          <p className="text-sm font-semibold">Importing {ds.name}</p>
          <Progress indeterminate aria-label="Import progress" />
          <p className="text-xs text-stone-600">
            {ds.progress ?? "Working"}… This takes a minute or two; you can
            leave this page.
          </p>
        </div>
      )}
      {ds.status === "failed" && (
        <div
          role="alert"
          className="mt-6 flex gap-3 rounded-3xl bg-amber-50 p-5 text-amber-900"
        >
          <TriangleAlert
            className="mt-0.5 size-5 shrink-0 text-amber-600"
            aria-hidden="true"
          />
          <div className="text-sm">
            <p className="font-semibold">The import didn&apos;t work</p>
            <p className="mt-1">{ds.error}</p>
          </div>
        </div>
      )}

      {(ds.status === "ready" || ds.components.length > 0) && (
        <Tabs defaultValue="components" className="mt-6 gap-4">
          <TabsList className="w-auto self-start">
            <TabsTrigger value="components" className="px-4">
              Components{" "}
              <span className="text-stone-500">{ds.components.length}</span>
            </TabsTrigger>
            <TabsTrigger value="tokens" className="px-4">
              Tokens
            </TabsTrigger>
            <TabsTrigger value="rules" className="px-4">
              Rules for AI{" "}
              <span className="text-stone-500">{active.length}</span>
              {pending.length > 0 && (
                <span
                  className="size-1.5 rounded-full bg-amber-500"
                  aria-label={`${pending.length} suggested`}
                />
              )}
            </TabsTrigger>
            <TabsTrigger value="used" className="px-4">
              Used in <span className="text-stone-500">{projects.length}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="components">
            <Panel
              title={`${ds.components.length} components`}
              action={
                <label className="flex h-8 items-center gap-2 rounded-full border border-border px-3 text-xs">
                  <Search
                    className="size-3.5 text-stone-400"
                    aria-hidden="true"
                  />
                  <span className="sr-only">Search components</span>
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search components"
                    className="w-40 bg-transparent outline-none"
                  />
                </label>
              }
            >
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {shown.map((c) => (
                  <li key={c.name} className="space-y-2">
                    <ComponentPreview ds={ds} component={c} />
                    <div>
                      <p className="text-[13px] font-semibold">{c.name}</p>
                      {c.description && (
                        <p className="line-clamp-2 text-xs text-stone-600">
                          {c.description}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-stone-500">
                {ds.kind === "components"
                  ? "Previews render the real components."
                  : "Previews show how builds recreate each component."}
              </p>
            </Panel>
          </TabsContent>

          <TabsContent value="tokens" className="grid gap-4 md:grid-cols-2">
            <Panel title="Colors">
              {t.colors?.length ? (
                <ul className="grid grid-cols-2 gap-2.5">
                  {t.colors.map((c) => (
                    <li
                      key={`${c.name}-${c.value}`}
                      className="flex items-center gap-2.5"
                      title={c.usage}
                    >
                      <span
                        className="size-7 shrink-0 rounded-lg border border-black/10"
                        style={{ background: c.value }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium">
                          {c.name}
                        </span>
                        <span className="font-mono text-[11px] text-stone-500">
                          {c.value}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-stone-500">No colors found.</p>
              )}
            </Panel>
            <div className="space-y-4">
              <Panel title="Type">
                {t.fonts?.map((f) => (
                  <p key={f.role} className="flex items-baseline gap-3 py-1">
                    <span
                      className="text-2xl font-semibold"
                      style={{ fontFamily: `${f.family}, system-ui` }}
                    >
                      Aa
                    </span>
                    <span className="text-xs text-stone-600">
                      {f.role}: {f.family}
                    </span>
                  </p>
                ))}
                {!!t.typeScale?.length && (
                  <p className="mt-2 text-xs text-stone-600">
                    {t.typeScale.map((s) => `${s.name} ${s.size}`).join(" · ")}
                  </p>
                )}
                {!t.fonts?.length && !t.typeScale?.length && (
                  <p className="text-[13px] text-stone-500">
                    No type styles found.
                  </p>
                )}
              </Panel>
              <Panel title="Shape & space">
                <dl className="space-y-2 text-xs">
                  {[
                    ["Radii", t.radii],
                    ["Spacing", t.spacing],
                    ["Shadows", t.shadows],
                  ].map(([label, xs]) =>
                    (xs as { name: string; value: string }[] | undefined)
                      ?.length ? (
                      <div key={label as string}>
                        <dt className="font-medium text-stone-800">
                          {label as string}
                        </dt>
                        <dd className="font-mono text-stone-600">
                          {(xs as { name: string; value: string }[])
                            .map((x) => `${x.name} ${x.value}`)
                            .join(" · ")}
                        </dd>
                      </div>
                    ) : null,
                  )}
                </dl>
              </Panel>
            </div>
          </TabsContent>

          <TabsContent value="rules">
            <Panel title="Rules for AI">
              <p className="-mt-2 mb-4 text-[13px] text-stone-600">
                Every build with {ds.name} follows these. They&apos;re written
                from your docs;{" "}
                {admin
                  ? "edit them or add your own."
                  : "you can suggest new ones for an admin to approve."}
              </p>
              <ul className="space-y-1.5">
                <AnimatePresence initial={false}>
                  {[...pending, ...active].map((r) => (
                    <RuleRow
                      key={r.id}
                      rule={r}
                      admin={admin}
                      dsId={ds.id}
                      onDone={() => router.refresh()}
                    />
                  ))}
                </AnimatePresence>
              </ul>
              <form
                className="mt-4 flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const ok = await run(
                    "rule",
                    () => addRule(ds.id, newRule),
                    admin
                      ? "Rule added"
                      : "Suggestion sent to the team's admins",
                  );
                  if (ok) setNewRule("");
                }}
              >
                <label htmlFor="new-rule" className="sr-only">
                  {admin ? "New rule" : "Suggest a rule"}
                </label>
                <Textarea
                  id="new-rule"
                  rows={1}
                  value={newRule}
                  onChange={(e) => setNewRule(e.target.value)}
                  maxLength={500}
                  placeholder={
                    admin
                      ? "e.g. Dispatch screens use the compact density."
                      : "Suggest a rule for this system"
                  }
                  className="min-h-10 flex-1"
                />
                <Button
                  type="submit"
                  variant="outline"
                  loading={busy === "rule"}
                  disabled={!newRule.trim()}
                >
                  {admin ? <Plus /> : <MessageSquarePlus />}
                  {admin ? "Add rule" : "Suggest"}
                </Button>
              </form>
            </Panel>
          </TabsContent>

          <TabsContent value="used">
            <Panel title="Prototypes using it">
              {projects.length ? (
                <ul className="divide-y divide-stone-100">
                  {projects.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/projects/${p.id}`}
                        className="flex items-center gap-3 py-2.5 text-sm no-underline hover:text-raspberry-700"
                      >
                        <span className="flex-1 font-medium">{p.name}</span>
                        <span
                          className="text-xs text-stone-500"
                          suppressHydrationWarning
                        >
                          {ago(p.updated_at)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-stone-500">
                  No prototypes use it yet. Pick it when you start one, or from
                  the studio&apos;s chat box.
                </p>
              )}
            </Panel>
          </TabsContent>
        </Tabs>
      )}

      {admin && (
        <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-stone-200 pt-6">
          {ds.source_kind === "github" && (
            <SwitchRow
              id="sync-push"
              className="max-w-sm flex-1"
              checked={ds.sync_on_push}
              onCheckedChange={(on) =>
                run(
                  "push",
                  () => setSyncOnPush(ds.id, on),
                  on ? "Syncs on every push" : "Stopped syncing on push",
                )
              }
              label={`Update when ${ds.source.kind === "github" ? ds.source.branch : "the branch"} changes`}
              description="Re-reads the repository after each push."
            />
          )}
          <div className="flex-1" />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                className="text-red-700 hover:bg-red-50 hover:text-red-800"
              >
                <Trash2 />
                Delete design system
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {ds.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  {projects.length
                    ? `${projects.length} prototype${projects.length === 1 ? "" : "s"} use it. They keep every version already built, and new builds go back to no design system.`
                    : "Its rules go with it. This can't be undone."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    if (
                      await run(
                        "delete",
                        () => deleteDesignSystem(ds.id),
                        `Deleted ${ds.name}`,
                      )
                    )
                      router.push("/design-systems");
                  }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </main>
  );
}
