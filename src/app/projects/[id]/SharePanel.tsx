"use client";
import type { Run } from "./studio-types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  Copy,
  Globe,
  KeyRound,
  Rocket,
  Trash2,
  UserPlus,
  Users,
  Send,
} from "lucide-react";
import { Badge, BadgeDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupCard } from "@/components/ui/radio-group";
import { SwitchRow } from "@/components/ui/switch-row";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eyebrow } from "@/components/Eyebrow";
import { cn } from "@/lib/utils";
import { copyWithToast, notify } from "@/lib/toast";
import { Textarea } from "@/components/ui/textarea";
import { type Build } from "@/components/builds/Builds";
import { reviewUrlFor } from "@/lib/hosts";
import { splitEmails } from "@/components/reviews/RequestReviewDialog";
import { requestReviewRound as raw_requestReviewRound } from "@/app/projects/review-actions";
import {
  type Member,
  type Project,
  type Role,
  type VersionMeta,
} from "@/lib/types";
import {
  inviteMember as raw_inviteMember,
  publishVersion as raw_publishVersion,
  removeMember as raw_removeMember,
  setAccessMode as raw_setAccessMode,
  setGuestComments as raw_setGuestComments,
  setGuestInspect as raw_setGuestInspect,
  setProjectPassword as raw_setProjectPassword,
  updateSlug as raw_updateSlug,
  unpublish as raw_unpublish,
} from "../actions";
import { unwrapped } from "@/lib/safe-action";

const inviteMember = unwrapped(raw_inviteMember);
const publishVersion = unwrapped(raw_publishVersion);
const requestReviewRound = unwrapped(raw_requestReviewRound);
const removeMember = unwrapped(raw_removeMember);
const setAccessMode = unwrapped(raw_setAccessMode);
const setGuestComments = unwrapped(raw_setGuestComments);
const setGuestInspect = unwrapped(raw_setGuestInspect);
const setProjectPassword = unwrapped(raw_setProjectPassword);
const updateSlug = unwrapped(raw_updateSlug);
const unpublish = unwrapped(raw_unpublish);

const ACCESS = [
  {
    value: "invite",
    title: "Only people I invite",
    desc: "They sign in with an emailed link.",
    icon: Users,
  },
  {
    value: "password",
    title: "Anyone with the password",
    desc: "No account needed. Guests enter the password and a name.",
    icon: KeyRound,
  },
  {
    value: "public",
    title: "Anyone with the link",
    desc: "View only. Comments stay with invited reviewers.",
    icon: Globe,
  },
] as const;

/**
 * One place to share: which version people see, who can open it, and whether
 * to ask for approval, finished by a single action ("Publish v4 and send").
 */
export function ShareDialog({
  open,
  onOpenChange,
  project,
  selected,
  live,
  isOwner,
  canBuild,
  members,
  reviewUrl,
  pending,
  isBusy,
  run,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  selected: VersionMeta | null;
  live: VersionMeta | null;
  isOwner: boolean;
  canBuild: boolean;
  members: Member[];
  reviewUrl: string;
  pending: boolean;
  isBusy: (key: string) => boolean;
  run: Run;
}) {
  const router = useRouter();
  const selectedIsLive =
    project.published && !!selected && selected.id === project.live_version_id;
  const [makeLive, setMakeLive] = useState(true);
  const [approval, setApproval] = useState(false);
  const [emails, setEmails] = useState("");
  const [due, setDue] = useState("");
  const [rule, setRule] = useState<"all" | "any">("all");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const list = splitEmails(emails);
  const suggested = members
    .filter((m) => m.role !== "editor")
    .map((m) => m.email)
    .filter((e) => !list.includes(e));

  const publishing = isOwner && !!selected && !selectedIsLive && makeLive;
  const asking = approval && list.length > 0 && !!selected;
  const label =
    publishing && asking
      ? `Publish v${selected!.number} and send`
      : publishing
        ? `Publish v${selected!.number}`
        : asking
          ? `Send to ${list.length} reviewer${list.length === 1 ? "" : "s"}`
          : "Done";

  async function submit() {
    if (!publishing && !asking) return onOpenChange(false);
    setSending(true);
    try {
      if (publishing) await publishVersion(project.id, selected!.id);
      if (asking) {
        const res = await requestReviewRound({
          projectId: project.id,
          versionId: selected!.id,
          emails: list,
          note: note.trim() || undefined,
          dueAt: due ? new Date(`${due}T23:59:00`).toISOString() : null,
          rule,
        });
        notify.success(
          `${publishing ? `v${selected!.number} is live. ` : ""}Asked ${res.reviewers} reviewer${res.reviewers === 1 ? "" : "s"} to approve it`,
          {
            description:
              res.emailed === res.reviewers
                ? "They've been emailed the link."
                : "Email isn't set up for everyone, so send them the link too.",
            action: {
              label: "Copy link",
              onClick: () => copyWithToast(reviewUrl),
            },
          },
        );
      } else {
        notify.success(`v${selected!.number} is live`, {
          action: {
            label: "Copy link",
            onClick: () => copyWithToast(reviewUrl),
          },
        });
      }
      setApproval(false);
      setEmails("");
      setNote("");
      setDue("");
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] gap-5 pb-0 [&>*]:min-w-0 max-sm:bottom-0 max-sm:top-auto max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Share {project.name}</DialogTitle>
          <DialogDescription>
            Pick what people see, who can open it, and whether you want an
            approval.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <Eyebrow>What people see</Eyebrow>
          {selected ? (
            <div className="flex items-center gap-2.5 rounded-2xl border border-stone-200 bg-card px-3.5 py-2.5">
              <span className="text-[13px] font-semibold">
                v{selected.number}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-stone-600">
                {selected.summary || "Selected version"}
              </span>
              {selectedIsLive ? (
                <Badge variant="success">
                  <BadgeDot />
                  Live
                </Badge>
              ) : isOwner ? (
                <SwitchRow
                  id="share-make-live"
                  label={<span className="text-xs">Make live</span>}
                  checked={makeLive}
                  onCheckedChange={setMakeLive}
                  className="border-0 bg-transparent p-0"
                />
              ) : (
                <Badge>Draft</Badge>
              )}
            </div>
          ) : (
            <p className="text-xs text-stone-600">Build a version first.</p>
          )}
          <p className="text-[11px] text-stone-500">
            {live
              ? `Now live: v${live.number}. People on the link always see the live version.`
              : "Nothing is live yet, so the link doesn't work until you publish."}
            {!isOwner && " Only the owner can change what's live."}
          </p>
        </section>

        {(project.published || publishing) && (
          <section className="space-y-2">
            <Eyebrow>Link</Eyebrow>
            <div className="flex gap-1.5">
              <Input
                readOnly
                value={reviewUrl}
                aria-label="Review link"
                className="text-xs text-stone-600"
              />
              <Button
                variant="outline"
                onClick={() => copyWithToast(reviewUrl)}
              >
                <Copy />
                Copy
              </Button>
            </div>
          </section>
        )}

        {isOwner && (
          <SharePanel
            hideLink
            project={project}
            isOwner={isOwner}
            members={members}
            reviewUrl={reviewUrl}
            pending={pending}
            isBusy={isBusy}
            run={run}
          />
        )}

        {canBuild && selected && (
          <section className="space-y-3 rounded-2xl bg-stone-50 p-3.5">
            <SwitchRow
              id="share-approval"
              label="Ask for approval"
              description="Reviewers get an email and approve or ask for changes. Reviewers are free."
              checked={approval}
              onCheckedChange={setApproval}
              className="border-0 bg-transparent p-0"
            />
            {approval && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="share-reviewers">Reviewers</Label>
                  <Textarea
                    id="share-reviewers"
                    rows={2}
                    value={emails}
                    onChange={(e) => setEmails(e.target.value)}
                    placeholder="maya@company.com, client@example.com"
                  />
                  {suggested.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {suggested.slice(0, 8).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() =>
                            setEmails((v) =>
                              v.trim() ? `${v.trim()}, ${m}` : m,
                            )
                          }
                          className="min-h-8 rounded-full bg-card px-3 text-xs text-stone-700 shadow-[inset_0_0_0_1px_var(--color-border)] hover:bg-stone-100"
                        >
                          + {m}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="share-due">Due (optional)</Label>
                    <Input
                      id="share-due"
                      type="date"
                      value={due}
                      onChange={(e) => setDue(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="share-rule">Approved when</Label>
                    <Select
                      value={rule}
                      onValueChange={(v) => setRule(v as "all" | "any")}
                    >
                      <SelectTrigger id="share-rule">
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
                  <Label htmlFor="share-note">Note (optional)</Label>
                  <Textarea
                    id="share-note"
                    rows={2}
                    maxLength={2000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="What should they look at?"
                  />
                </div>
              </div>
            )}
          </section>
        )}

        <DialogFooter className="sticky bottom-0 -mx-5 border-t border-stone-100 bg-card px-5 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="mr-auto"
          >
            Close
          </Button>
          <Button
            variant="default"
            loading={sending}
            disabled={approval && list.length === 0 && !publishing}
            onClick={submit}
          >
            {asking ? <Send /> : publishing ? <Rocket /> : <Check />}
            {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SharePanel({
  project,
  isOwner,
  members,
  reviewUrl,
  pending,
  isBusy,
  run,
  hideLink = false,
}: {
  hideLink?: boolean;
  project: Project;
  isOwner: boolean;
  members: Member[];
  reviewUrl: string;
  pending: boolean;
  isBusy: (key: string) => boolean;
  run: Run;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "commenter" | "editor">(
    "commenter",
  );
  const [copied, setCopied] = useState(false);
  const [password, setPassword] = useState("");
  const [address, setAddress] = useState(project.slug);
  const [addressError, setAddressError] = useState("");

  if (!isOwner) {
    return (
      <p className="p-4 text-[13px] text-stone-600">
        Only the owner can change who has access.
      </p>
    );
  }

  return (
    <div className={cn("space-y-6", hideLink ? "" : "p-4")}>
      {!hideLink && (
        <section className="space-y-2">
          <Eyebrow>Review link</Eyebrow>
          {project.published ? (
            <>
              <div className="flex gap-1.5">
                <Input
                  readOnly
                  value={reviewUrl}
                  aria-label="Review link"
                  className="text-xs text-stone-600"
                />
                <Button
                  size="icon"
                  aria-label={copied ? "Copied" : "Copy link"}
                  title={copied ? "Copied" : "Copy link"}
                  onClick={async () => {
                    await copyWithToast(reviewUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? <Check /> : <Copy />}
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                loading={isBusy("unpublish")}
                disabled={pending}
                onClick={() =>
                  run(() => unpublish(project.id), "unpublish", {
                    title: "Review link turned off",
                    undo: project.live_version_id
                      ? async () => {
                          await publishVersion(
                            project.id,
                            project.live_version_id!,
                          );
                          router.refresh();
                        }
                      : undefined,
                  })
                }
              >
                Unpublish
              </Button>
            </>
          ) : (
            <p className="text-xs text-stone-600">
              Publish a version (top right) to get a review link.
            </p>
          )}
        </section>
      )}

      <section className="space-y-2">
        <Eyebrow>Address</Eyebrow>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setAddressError("");
            run(async () => {
              try {
                const slug = await updateSlug(project.id, address);
                setAddress(slug);
                notify.success(`Address changed to ${slug}`, {
                  action: {
                    label: "Copy link",
                    onClick: () =>
                      copyWithToast(reviewUrlFor(slug, window.location.host)),
                  },
                });
              } catch (err) {
                setAddressError(
                  err instanceof Error
                    ? err.message
                    : "Couldn't change the address.",
                );
              }
            }, "slug");
          }}
          className="flex items-center gap-1.5"
        >
          <label htmlFor="slug" className="sr-only">
            Subdomain
          </label>
          <div className="flex min-w-0 flex-1 items-center rounded-full border border-stone-200 bg-card pr-3 focus-within:border-raspberry-600 focus-within:ring-4 focus-within:ring-raspberry-100">
            <input
              id="slug"
              value={address}
              onChange={(e) => setAddress(e.target.value.toLowerCase())}
              maxLength={60}
              className="h-9 min-w-0 flex-1 rounded-full bg-transparent pl-3.5 text-[13px] outline-none"
            />
            <span className="shrink-0 text-xs text-stone-400">
              .realframe.app
            </span>
          </div>
          {address !== project.slug && (
            <Button
              variant="secondary"
              type="submit"
              loading={isBusy("slug")}
              disabled={pending}
            >
              Save
            </Button>
          )}
        </form>
        {addressError ? (
          <p role="alert" className="text-xs text-red-700">
            {addressError}
          </p>
        ) : (
          <p className="text-[11px] text-stone-500">
            Changing it breaks links you&apos;ve already shared.
          </p>
        )}
      </section>

      <section className="space-y-2">
        <Eyebrow id="access-label">Who can open it</Eyebrow>
        <RadioGroup
          aria-labelledby="access-label"
          value={project.access_mode}
          disabled={pending}
          onValueChange={(value) => {
            if (value === "password" && !project.has_password) {
              document.getElementById("share-password")?.focus();
              return;
            }
            const previous = project.access_mode;
            run(
              () => setAccessMode(project.id, value as Project["access_mode"]),
              "access",
              {
                title: {
                  invite: "Only invited people can open it",
                  password: "Anyone with the password can open it",
                  public: "Anyone with the link can view",
                }[value as Project["access_mode"]],
                undo: async () => {
                  await setAccessMode(project.id, previous);
                  router.refresh();
                },
              },
            );
          }}
        >
          {ACCESS.map(({ value, title, desc, icon: Icon }) => (
            <RadioGroupCard key={value} value={value}>
              <span
                aria-hidden="true"
                className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-stone-600 group-data-[state=checked]:btn-glow"
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold">{title}</span>
                <span className="block text-xs text-stone-600">{desc}</span>
              </span>
              <Check
                className="ml-auto hidden size-4 shrink-0 text-raspberry-700 group-data-[state=checked]:block"
                aria-hidden="true"
              />
            </RadioGroupCard>
          ))}
        </RadioGroup>
        <div className="space-y-2 rounded-2xl bg-stone-900/[.03] p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const value = password;
              run(
                async () => {
                  await setProjectPassword(project.id, value);
                  setPassword("");
                },
                "password",
                project.has_password ? "Password changed" : "Password set",
              );
            }}
            className="flex gap-1.5"
          >
            <label htmlFor="share-password" className="sr-only">
              {project.has_password ? "New password" : "Password"}
            </label>
            <Input
              id="share-password"
              type="password"
              autoComplete="new-password"
              minLength={6}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                project.has_password
                  ? "Change the password"
                  : "Set a password (6+ characters)"
              }
            />
            <Button
              variant="secondary"
              type="submit"
              loading={isBusy("password")}
              disabled={pending}
            >
              <KeyRound />
              {project.has_password ? "Change" : "Set"}
            </Button>
          </form>
          <SwitchRow
            id="guest-comments"
            className="-mx-1"
            label="Password guests can comment"
            description="Guests add a name when they enter the password."
            checked={project.guest_comments !== false}
            loading={isBusy("guests")}
            disabled={pending && !isBusy("guests")}
            onCheckedChange={(on) =>
              run(() => setGuestComments(project.id, on), "guests")
            }
          />
        </div>
        <SwitchRow
          id="guest-inspect"
          className="-mx-1"
          label="Guests can inspect code"
          description="Lets password guests and anyone with a public link open dev mode. People you invite always can."
          checked={project.guest_inspect === true}
          loading={isBusy("inspect")}
          disabled={pending && !isBusy("inspect")}
          onCheckedChange={(on) =>
            run(() => setGuestInspect(project.id, on), "inspect")
          }
        />
      </section>

      <section className="space-y-2">
        <Eyebrow>Invite people</Eyebrow>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const value = email;
            run(
              async () => {
                await inviteMember(project.id, value, role);
                setEmail("");
              },
              "invite",
              `Invited ${value.trim().toLowerCase()} as ${role}`,
            );
          }}
          className="space-y-1.5"
        >
          <label htmlFor="inv" className="sr-only">
            Email
          </label>
          <Input
            id="inv"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
          />
          <div className="flex gap-1.5">
            <Select
              value={role}
              onValueChange={(v) => setRole(v as typeof role)}
            >
              <SelectTrigger aria-label="Role" className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="commenter">Commenter</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="secondary"
              type="submit"
              loading={isBusy("invite")}
              disabled={pending}
            >
              <UserPlus />
              Invite
            </Button>
          </div>
        </form>
        <p className="text-[11px] text-stone-500">
          Send them the review link. They sign in with this email to get access.
        </p>
        {members.length > 0 && (
          <ul className="space-y-0.5">
            {members.map((m) => (
              <li
                key={m.email}
                className="flex items-center gap-2 rounded-full py-1 pl-1 pr-0.5 hover:bg-stone-900/[.03]"
              >
                <span
                  aria-hidden="true"
                  className="grid size-7 shrink-0 place-items-center rounded-full bg-glow-soft text-[11px] font-semibold uppercase text-raspberry-800"
                >
                  {m.email[0]}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs">
                  {m.email}
                </span>
                <Badge className="capitalize">{m.role}</Badge>
                <Button
                  variant="destructive"
                  size="icon-sm"
                  aria-label={`Remove ${m.email}`}
                  title={`Remove ${m.email}`}
                  loading={isBusy(`remove-${m.email}`)}
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => removeMember(project.id, m.email),
                      `remove-${m.email}`,
                      {
                        title: `Removed ${m.email}`,
                        undo: () =>
                          inviteMember(
                            project.id,
                            m.email,
                            m.role as "viewer" | "commenter" | "editor",
                          ),
                      },
                    )
                  }
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
