"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ExternalLink,
  GitBranch,
  Lock,
  Search,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { Eyebrow } from "@/components/Eyebrow";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/toast";
import {
  connectRepo as raw_connectRepo,
  githubBranches as raw_githubBranches,
  githubDetect as raw_githubDetect,
  githubRepos as raw_githubRepos,
  githubStatus as raw_githubStatus,
  type GitHubStatus,
} from "@/app/projects/github-actions";
import { unwrapped } from "@/lib/safe-action";

const connectRepo = unwrapped(raw_connectRepo);
const githubBranches = unwrapped(raw_githubBranches);
const githubDetect = unwrapped(raw_githubDetect);
const githubRepos = unwrapped(raw_githubRepos);
const githubStatus = unwrapped(raw_githubStatus);

type Repo = Awaited<ReturnType<typeof githubRepos>>[number];
type Detected = Awaited<ReturnType<typeof githubDetect>>;

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("size-4", className)}
      fill="currentColor"
    >
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.29-1.69-1.29-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

const ago = (iso: string) => {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 3600) return `${Math.max(1, Math.round(d / 60))}m ago`;
  if (d < 86400) return `${Math.round(d / 3600)}h ago`;
  if (d < 86400 * 30) return `${Math.round(d / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

/** The GitHub tab of the import dialog: connect, pick a repository, check the build settings. */
export function GitHubImport({
  projectId,
  name,
  onBusy,
}: {
  projectId: string | null;
  name: string;
  onBusy: (b: boolean) => void;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [installation, setInstallation] = useState<number | null>(null);
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [query, setQuery] = useState("");
  const [repo, setRepo] = useState<Repo | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [branch, setBranch] = useState("");
  const [rootDir, setRootDir] = useState("");
  const [detected, setDetected] = useState<Detected | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [install, setInstall] = useState("");
  const [build, setBuild] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const ghError = url.searchParams.get("github_error");
    if (ghError) setError(ghError);
    url.searchParams.delete("github_error");
    url.searchParams.delete("import");
    githubStatus(`${url.pathname}${url.search}`)
      .then((s) => {
        setStatus(s);
        if (s.installations[0]) setInstallation(s.installations[0].id);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Couldn't reach GitHub."),
      );
  }, []);

  useEffect(() => {
    if (!installation) return;
    setRepos(null);
    setRepo(null);
    githubRepos(installation)
      .then(setRepos)
      .catch((e) =>
        setError(
          e instanceof Error ? e.message : "Couldn't list repositories.",
        ),
      );
  }, [installation]);

  async function detect(r: Repo, b: string, dir: string) {
    if (!installation) return;
    setDetecting(true);
    setError("");
    try {
      const d = await githubDetect(installation, r.fullName, b, dir);
      setDetected(d);
      setInstall(d.installCommand ?? "");
      setBuild(d.buildCommand ?? "");
      setOutput(d.outputDir);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Couldn't read the repository.",
      );
    } finally {
      setDetecting(false);
    }
  }

  async function pickRepo(r: Repo) {
    if (!installation) return;
    setRepo(r);
    setBranch(r.defaultBranch);
    setRootDir("");
    setDetected(null);
    githubBranches(installation, r.fullName)
      .then((b) =>
        setBranches(b.includes(r.defaultBranch) ? b : [r.defaultBranch, ...b]),
      )
      .catch(() => setBranches([r.defaultBranch]));
    await detect(r, r.defaultBranch, "");
  }

  async function submit() {
    if (!installation || !repo) return;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      const res = await connectRepo({
        projectId,
        name,
        installationId: installation,
        repoId: repo.id,
        repoFullName: repo.fullName,
        branch,
        rootDir,
        installCommand: install,
        buildCommand: build,
        outputDir: output,
        framework: detected?.framework ?? null,
      });
      notify.success(`Building ${repo.fullName}`, {
        description: "It appears as a version when the build finishes.",
      });
      if (projectId) router.refresh();
      else router.push(`/projects/${res.projectId}`);
      // The dialog closes when the page changes; keep the spinner until then.
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Couldn't connect the repository.",
      );
      setBusy(false);
      onBusy(false);
    }
  }

  const shown = useMemo(
    () =>
      (repos ?? [])
        .filter((r) =>
          r.fullName.toLowerCase().includes(query.trim().toLowerCase()),
        )
        .slice(0, 50),
    [repos, query],
  );

  if (!status) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-muted-foreground">
        <Spinner />
        Checking GitHub…
      </div>
    );
  }

  if (!status.configured) {
    return (
      <p className="rounded-2xl bg-secondary p-4 text-[13px] text-stone-700">
        GitHub isn&apos;t set up for Realframe yet. The owner can set it up at{" "}
        <code className="text-xs">/api/github/setup</code>.
      </p>
    );
  }

  const errorBox = error && (
    <p
      role="alert"
      className="flex gap-2 rounded-2xl bg-red-50 p-3 text-xs text-red-800"
    >
      <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      {error}
    </p>
  );

  if (!status.installations.length) {
    return (
      <div className="space-y-3">
        <div className="flex flex-col items-center gap-2.5 rounded-2xl bg-stone-50 p-6 text-center">
          <span className="grid size-11 place-items-center rounded-2xl bg-foreground text-background">
            <GitHubMark className="size-5" />
          </span>
          <p className="text-[13px] font-semibold">Connect GitHub</p>
          <p className="max-w-xs text-xs text-stone-600">
            You choose which repositories Realframe can read. It never writes to
            them.
          </p>
          <Button asChild variant="secondary" size="sm">
            <a href={status.installUrl!}>
              <GitHubMark />
              Connect GitHub
            </a>
          </Button>
        </div>
        {errorBox}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Eyebrow>Repository</Eyebrow>
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
          <div className="max-h-64 space-y-0.5 overflow-y-auto">
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
                  onClick={() => pickRepo(r)}
                  className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-left outline-none transition-colors hover:bg-foreground/[.04] focus-visible:ring-[3px] focus-visible:ring-ring/40"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-secondary text-stone-700">
                    <GitHubMark className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                      <span className="truncate">{r.fullName}</span>
                      {r.private && (
                        <Lock
                          className="size-3 shrink-0 text-stone-500"
                          aria-label="Private"
                        />
                      )}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {[
                        r.language,
                        `pushed ${ago(r.pushedAt)}`,
                        r.usedBy.length
                          ? `also used by ${r.usedBy.join(", ")}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Don&apos;t see a repository?{" "}
            <a href={status.installUrl!} className="font-medium text-primary">
              Choose which repositories Realframe can read
            </a>
            .
          </p>
          {errorBox}
        </>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2.5 rounded-2xl bg-glow-soft p-3 shadow-[inset_0_0_0_1px_var(--color-raspberry-200)]">
            <GitHubMark className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
              {repo.fullName}
            </span>
            <a
              href={`https://github.com/${repo.fullName}`}
              target="_blank"
              rel="noreferrer"
              aria-label="Open on GitHub"
              className="text-stone-500 hover:text-foreground"
            >
              <ExternalLink className="size-3.5" />
            </a>
            <Button
              variant="ghost"
              size="sm"
              className="h-7"
              onClick={() => setRepo(null)}
              disabled={busy}
            >
              Change
            </Button>
          </div>

          <div className="space-y-3 rounded-2xl bg-stone-50 p-3.5 shadow-[inset_0_0_0_1px_var(--color-border)]">
            <div className="flex items-center gap-2">
              <Eyebrow>Build settings</Eyebrow>
              {detecting ? (
                <Spinner className="ml-auto size-3.5" />
              ) : (
                detected && (
                  <Badge
                    variant={detected.hostable ? "success" : "warning"}
                    className="ml-auto"
                  >
                    {detected.hostable && <Check />}
                    {detected.framework}
                  </Badge>
                )
              )}
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <Label className="mb-1.5">Branch</Label>
                <Select
                  value={branch}
                  onValueChange={(b) => {
                    setBranch(b);
                    detect(repo, b, rootDir);
                  }}
                >
                  <SelectTrigger className="w-full" aria-label="Branch">
                    <GitBranch className="size-3.5 text-stone-500" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5">App folder</Label>
                <Select
                  value={rootDir || "."}
                  onValueChange={(d) => {
                    const dir = d === "." ? "" : d;
                    setRootDir(dir);
                    detect(repo, branch, dir);
                  }}
                >
                  <SelectTrigger
                    className="w-full font-mono text-xs"
                    aria-label="App folder"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=".">./ (repository root)</SelectItem>
                    {(detected?.folders ?? []).filter(Boolean).map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="gh-install" className="mb-1.5">
                  Install command
                </Label>
                <Input
                  id="gh-install"
                  value={install}
                  onChange={(e) => setInstall(e.target.value)}
                  placeholder="None"
                  className="font-mono text-xs"
                />
              </div>
              <div>
                <Label htmlFor="gh-build" className="mb-1.5">
                  Build command
                </Label>
                <Input
                  id="gh-build"
                  value={build}
                  onChange={(e) => setBuild(e.target.value)}
                  placeholder="None"
                  className="font-mono text-xs"
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="gh-output" className="mb-1.5">
                  Output folder
                </Label>
                <Input
                  id="gh-output"
                  value={output}
                  onChange={(e) => setOutput(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </div>
            {detected && !detected.hostable && detected.reason && (
              <p className="flex gap-2 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-900">
                <TriangleAlert
                  className="mt-px size-3.5 shrink-0"
                  aria-hidden="true"
                />
                {detected.reason}
              </p>
            )}
          </div>

          {errorBox}

          <div className="flex items-center gap-3">
            <p className="flex-1 text-[11px] leading-relaxed text-muted-foreground">
              Builds run in an isolated sandbox. Every push to{" "}
              <span className="font-mono">{branch}</span> builds and publishes a
              new version.
            </p>
            <Button
              variant="default"
              loading={busy}
              disabled={detecting || !output}
              onClick={submit}
            >
              <GitHubMark />
              Import and build
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
