"use client";
import { useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  GitBranch,
  GitPullRequest,
  Lock,
  Search,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { SwitchRow } from "@/components/ui/switch-row";
import { GitHubMark } from "@/components/icons/GitHubMark";
import { notify } from "@/lib/toast";
import {
  githubRepos as raw_githubRepos,
  githubStatus as raw_githubStatus,
  type GitHubStatus,
} from "@/app/projects/github-actions";
import { unwrapped } from "@/lib/safe-action";
import { safeBranch, safeFolder, type ExportFile } from "@/lib/export";

const githubRepos = unwrapped(raw_githubRepos);
const githubStatus = unwrapped(raw_githubStatus);
type Repo = Awaited<ReturnType<typeof githubRepos>>[number];

type Result = {
  commitUrl: string;
  branchUrl: string;
  branchCreated: boolean;
  pullRequest: { url: string; number: number; created: boolean } | null;
};

const STORE = "rf-github-export";

/** Push an export's files to a branch in a connected repository, with a pull request. */
export function PushToGitHub(props: {
  projectId: string;
  versionId: string;
  format: string;
  files: ExportFile[];
  selection: { label: string; selector: string }[];
  defaultBranch: string;
  defaultMessage: string;
  onPushed?: () => void;
}) {
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [installation, setInstallation] = useState<number | null>(null);
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [repo, setRepo] = useState<Repo | null>(null);
  const [query, setQuery] = useState("");
  const [branch, setBranch] = useState(props.defaultBranch);
  const [folder, setFolder] = useState("");
  const [message, setMessage] = useState("");
  const [pr, setPr] = useState(true);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<{ text: string; url?: string } | null>(
    null,
  );
  const [result, setResult] = useState<Result | null>(null);

  // The last repository and folder pushed to, so the next export lands in the same place.
  const remembered = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(STORE) ?? "null") as {
        installation: number;
        repo: string;
        folder: string;
      } | null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    githubStatus(window.location.pathname)
      .then((s) => {
        setStatus(s);
        const keep = s.installations.find(
          (i) => i.id === remembered?.installation,
        );
        setInstallation(keep?.id ?? s.installations[0]?.id ?? null);
        if (keep) setFolder(remembered?.folder ?? "");
      })
      .catch((e) =>
        setError({
          text: e instanceof Error ? e.message : "Couldn't reach GitHub.",
        }),
      );
  }, [remembered]);

  useEffect(() => {
    if (!installation) return;
    setRepos(null);
    setRepo(null);
    githubRepos(installation)
      .then((list) => {
        setRepos(list);
        const keep = list.find((r) => r.fullName === remembered?.repo);
        if (keep) setRepo(keep);
      })
      .catch((e) =>
        setError({
          text: e instanceof Error ? e.message : "Couldn't list repositories.",
        }),
      );
  }, [installation, remembered]);

  useEffect(() => setBranch(props.defaultBranch), [props.defaultBranch]);
  useEffect(() => setResult(null), [props.files]);

  const shown = useMemo(
    () =>
      (repos ?? [])
        .filter((r) =>
          r.fullName.toLowerCase().includes(query.trim().toLowerCase()),
        )
        .slice(0, 50),
    [repos, query],
  );

  const branchOk = safeBranch(branch) !== null;
  const folderOk = safeFolder(folder) !== null;
  const onDefault = repo !== null && branch.trim() === repo.defaultBranch;

  async function push() {
    if (!repo || !installation) return;
    setPushing(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(
        `/api/projects/${props.projectId}/export/github`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            installationId: installation,
            repo: repo.fullName,
            branch: branch.trim(),
            folder,
            message,
            pullRequest: pr && !onDefault,
            format: props.format,
            versionId: props.versionId,
            files: props.files,
            selection: props.selection,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError({
          text: data.error || `The push failed (${res.status}).`,
          url: data.settingsUrl,
        });
        return;
      }
      setResult(data as Result);
      try {
        localStorage.setItem(
          STORE,
          JSON.stringify({ installation, repo: repo.fullName, folder }),
        );
      } catch {}
      notify.success(
        data.pullRequest
          ? `Pull request #${data.pullRequest.number} ${data.pullRequest.created ? "opened" : "updated"}`
          : `Pushed to ${branch.trim()}`,
      );
      props.onPushed?.();
    } catch {
      setError({ text: "Couldn't reach Realframe. Try again." });
    } finally {
      setPushing(false);
    }
  }

  if (!status && error)
    return (
      <p
        role="alert"
        className="flex gap-2 rounded-2xl bg-red-50 p-3 text-xs text-red-800"
      >
        <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
        {error.text}
      </p>
    );

  if (!status)
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-muted-foreground">
        <Spinner />
        Checking GitHub…
      </div>
    );

  if (!status.configured)
    return (
      <p className="rounded-2xl bg-secondary p-4 text-[13px] text-stone-700">
        GitHub isn&apos;t set up for Realframe yet.
      </p>
    );

  if (!status.installations.length)
    return (
      <div className="flex flex-col items-center gap-2.5 rounded-2xl bg-card p-6 text-center">
        <span className="grid size-11 place-items-center rounded-2xl bg-foreground text-background">
          <GitHubMark className="size-5" />
        </span>
        <p className="text-[13px] font-semibold">Connect GitHub</p>
        <p className="max-w-xs text-xs text-stone-600">
          Choose which repositories Realframe can use. It only writes when you
          push an export, and it opens a pull request rather than changing your
          main branch.
        </p>
        <Button asChild variant="secondary" size="sm">
          <a href={status.installUrl!}>
            <GitHubMark />
            Connect GitHub
          </a>
        </Button>
      </div>
    );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">
          Push to GitHub
        </p>
        <div className="ml-auto flex items-center gap-1.5">
          {status.installations.length > 1 ? (
            <Select
              value={String(installation)}
              onValueChange={(v) => setInstallation(Number(v))}
            >
              <SelectTrigger size="sm" aria-label="GitHub account">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {status.installations.map((i) => (
                  <SelectItem key={i.id} value={String(i.id)}>
                    {i.login}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-stone-600">
              <GitHubMark className="size-3.5" />
              {status.installations[0].login}
            </span>
          )}
          <Button asChild variant="link" size="sm" className="text-xs">
            <a href={status.installUrl!}>Add or change</a>
          </Button>
        </div>
      </div>

      {!repo ? (
        <>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-stone-400"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search repositories"
              className="pl-8"
              aria-label="Search repositories"
            />
          </div>
          <div className="max-h-60 space-y-0.5 overflow-y-auto">
            {repos === null ? (
              <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-muted-foreground">
                <Spinner />
                Loading repositories…
              </div>
            ) : shown.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-muted-foreground">
                No repositories match.
              </p>
            ) : (
              shown.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRepo(r)}
                  className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-left outline-none transition-colors hover:bg-foreground/[.04] focus-visible:ring-[3px] focus-visible:ring-ring/40"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-secondary text-stone-700">
                    <GitHubMark className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] font-semibold">
                    <span className="truncate">{r.fullName}</span>
                    {r.private && (
                      <Lock
                        className="size-3 shrink-0 text-stone-500"
                        aria-label="Private"
                      />
                    )}
                  </span>
                </button>
              ))
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Don&apos;t see a repository?{" "}
            <a href={status.installUrl!} className="font-medium text-primary">
              Choose which repositories Realframe can use
            </a>
            .
          </p>
        </>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2.5 rounded-2xl bg-card px-3 py-2">
            <GitHubMark className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
              {repo.fullName}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setRepo(null);
                setResult(null);
              }}
            >
              Change
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="gh-branch" className="text-xs">
                Branch
              </Label>
              <Input
                id="gh-branch"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                aria-invalid={!branchOk || undefined}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gh-folder" className="text-xs">
                Folder
              </Label>
              <Input
                id="gh-folder"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder="Repository root"
                aria-invalid={!folderOk || undefined}
                className="font-mono text-xs"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gh-message" className="text-xs">
              Commit message
            </Label>
            <Input
              id="gh-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={props.defaultMessage}
              maxLength={500}
            />
          </div>
          <SwitchRow
            id="gh-pr"
            className="-mx-1"
            label="Open a pull request"
            description={
              onDefault
                ? `You're pushing straight to ${repo.defaultBranch}, so there's nothing to open a pull request into.`
                : `Into ${repo.defaultBranch}. If one is already open for this branch, the push updates it.`
            }
            checked={pr && !onDefault}
            disabled={onDefault}
            onCheckedChange={setPr}
          />
          <p className="text-[11px] text-stone-600">
            {props.files.length} file{props.files.length === 1 ? "" : "s"} in
            one commit. Files with the same path are replaced; nothing else in
            the repository changes.
          </p>
          <Button
            variant="default"
            className="w-full"
            onClick={push}
            loading={pushing}
            disabled={!branchOk || !folderOk || pushing}
          >
            <Upload />
            {pushing
              ? "Pushing…"
              : pr && !onDefault
                ? "Push and open pull request"
                : `Push to ${branch.trim() || "branch"}`}
          </Button>
        </div>
      )}

      {result && (
        <div
          role="status"
          className="space-y-2 rounded-2xl bg-emerald-50 p-3 text-[13px] text-emerald-900"
        >
          <p className="font-semibold">
            {result.branchCreated
              ? `Created ${branch.trim()} and pushed.`
              : `Pushed to ${branch.trim()}.`}
          </p>
          <div className="flex flex-wrap gap-2">
            {result.pullRequest && (
              <Button asChild size="sm" variant="default">
                <a
                  href={result.pullRequest.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <GitPullRequest />
                  Pull request #{result.pullRequest.number}
                </a>
              </Button>
            )}
            <Button asChild size="sm" variant="outline">
              <a href={result.branchUrl} target="_blank" rel="noreferrer">
                <GitBranch />
                View branch
              </a>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <a href={result.commitUrl} target="_blank" rel="noreferrer">
                <ExternalLink />
                Commit
              </a>
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="space-y-2 rounded-2xl bg-red-50 p-3 text-xs text-red-800"
        >
          <p className="flex gap-2">
            <TriangleAlert
              className="mt-px size-3.5 shrink-0"
              aria-hidden="true"
            />
            {error.text}
          </p>
          {error.url && (
            <Button asChild size="sm" variant="outline">
              <a href={error.url} target="_blank" rel="noreferrer">
                <ExternalLink />
                Open GitHub settings
              </a>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
