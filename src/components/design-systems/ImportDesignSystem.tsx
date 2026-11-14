"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  ExternalLink,
  FileText,
  Layers,
  Lock,
  Package,
  Search,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createDesignSystem as raw_createDesignSystem } from "@/app/design-systems/actions";
import {
  githubBranches as raw_githubBranches,
  githubRepos as raw_githubRepos,
  githubStatus as raw_githubStatus,
  type GitHubStatus,
} from "@/app/projects/github-actions";
import { unwrapped } from "@/lib/safe-action";
import { notify } from "@/lib/toast";
import { createClient } from "@/lib/supabase/client";
import type { DesignSystemSource } from "@/lib/design-systems/types";
import { cn } from "@/lib/utils";
import { GitHubMark } from "@/components/icons/GitHubMark";

const createDesignSystem = unwrapped(raw_createDesignSystem);
const githubStatus = unwrapped(raw_githubStatus);
const githubRepos = unwrapped(raw_githubRepos);
const githubBranches = unwrapped(raw_githubBranches);
type Repo = Awaited<ReturnType<typeof githubRepos>>[number];
type Tab = "github" | "npm" | "storybook" | "upload";

const ACCEPT = ".json,.css,.scss,.md,.mdx,.txt,.pdf,.zip,.js,.ts";

export async function startSync(id: string) {
  const res = await fetch(`/api/design-systems/${id}/sync`, { method: "POST" });
  if (!res.ok)
    throw new Error(
      ((await res.json().catch(() => ({}))) as { error?: string }).error ??
        "Couldn't start the import.",
    );
}

export function ImportDesignSystem({
  teamId,
  teamName,
  trigger,
}: {
  teamId: string;
  teamName: string;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("github");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  // GitHub
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [installation, setInstallation] = useState<number | null>(null);
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [q, setQ] = useState("");
  const [repo, setRepo] = useState<Repo | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [branch, setBranch] = useState("");
  const [folder, setFolder] = useState("./");
  const [syncOnPush, setSyncOnPush] = useState(true);
  // npm
  const [pkg, setPkg] = useState("");
  const [version, setVersion] = useState("");
  const [stylesheet, setStylesheet] = useState("");
  // Storybook
  const [storybook, setStorybook] = useState("");
  // Upload
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    if (!open || status) return;
    githubStatus(`${location.pathname}${location.search}`)
      .then((s) => {
        setStatus(s);
        if (s.installations[0]) setInstallation(s.installations[0].id);
      })
      .catch(() =>
        setStatus({ configured: false, installUrl: null, installations: [] }),
      );
  }, [open, status]);

  useEffect(() => {
    if (!installation) return;
    setRepos(null);
    githubRepos(installation)
      .then(setRepos)
      .catch((e) =>
        notify.error(
          e instanceof Error ? e.message : "Couldn't list repositories.",
        ),
      );
  }, [installation]);

  const shown = useMemo(
    () =>
      (repos ?? [])
        .filter((r) =>
          r.fullName.toLowerCase().includes(q.trim().toLowerCase()),
        )
        .slice(0, 40),
    [repos, q],
  );

  async function pickRepo(r: Repo) {
    setRepo(r);
    setBranch(r.defaultBranch);
    setBranches([r.defaultBranch]);
    if (!name)
      setName(
        r.name.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      );
    githubBranches(installation!, r.fullName)
      .then(setBranches)
      .catch(() => {});
  }

  function reset() {
    setName("");
    setRepo(null);
    setQ("");
    setFolder("./");
    setPkg("");
    setVersion("");
    setStylesheet("");
    setStorybook("");
    setFiles([]);
  }

  async function submit() {
    setBusy(true);
    try {
      let source: DesignSystemSource;
      if (tab === "github") {
        if (!repo || !installation) throw new Error("Pick a repository.");
        source = {
          kind: "github",
          installationId: installation,
          repo: repo.fullName,
          branch,
          folder,
        };
      } else if (tab === "npm") {
        source = { kind: "npm", package: pkg, version, stylesheet };
      } else if (tab === "storybook") {
        source = { kind: "storybook", url: storybook };
      } else {
        if (!files.length) throw new Error("Add at least one file.");
        const supabase = createClient();
        const paths: string[] = [];
        for (const f of files) {
          if (f.size > 25 * 1024 * 1024)
            throw new Error(`${f.name} is over 25 MB.`);
          const path = `${teamId}/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, "_")}`;
          const { error } = await supabase.storage
            .from("design-systems")
            .upload(path, f, { contentType: f.type || undefined });
          if (error)
            throw new Error(`Couldn't upload ${f.name}: ${error.message}`);
          paths.push(path);
        }
        source = { kind: "upload", paths };
      }
      const label = name.trim() || (tab === "npm" ? pkg : "Design system");
      const id = await createDesignSystem(teamId, label, source, syncOnPush);
      await startSync(id);
      notify.success(`Importing ${label}`, {
        description: "This takes a minute or two. You can keep working.",
      });
      setOpen(false);
      reset();
      router.push(`/design-systems/${id}`);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Couldn't import that.");
    } finally {
      setBusy(false);
    }
  }

  const ready =
    (tab === "github" && repo) ||
    (tab === "npm" && pkg.trim()) ||
    (tab === "storybook" && storybook.trim()) ||
    (tab === "upload" && files.length > 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import design system</DialogTitle>
          <DialogDescription>
            Add your team&apos;s components or style guide to {teamName}.
            Realframe reads them, and every build follows them.
          </DialogDescription>
        </DialogHeader>
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as Tab)}
          className="gap-4"
        >
          <TabsList>
            <TabsTrigger value="github">
              <GitHubMark />
              GitHub
            </TabsTrigger>
            <TabsTrigger value="npm">
              <Package />
              npm package
            </TabsTrigger>
            <TabsTrigger value="storybook">
              <BookOpen />
              Storybook
            </TabsTrigger>
            <TabsTrigger value="upload">
              <Upload />
              Upload files
            </TabsTrigger>
          </TabsList>

          <TabsContent value="github" className="space-y-3">
            {!status ? (
              <div className="grid h-40 place-items-center">
                <Spinner />
              </div>
            ) : !status.configured || status.installations.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl bg-stone-50 p-6 text-center">
                <GitHubMark className="size-6" />
                <p className="text-sm font-semibold">Connect GitHub</p>
                <p className="max-w-sm text-xs text-stone-600">
                  You choose which repositories Realframe can read. It never
                  writes to them.
                </p>
                {status.installUrl && (
                  <Button asChild size="sm" variant="secondary">
                    <a href={status.installUrl}>
                      <GitHubMark />
                      Connect GitHub
                    </a>
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  {status.installations.length > 1 && (
                    <Select
                      value={String(installation)}
                      onValueChange={(v) => (
                        setInstallation(Number(v)),
                        setRepo(null)
                      )}
                    >
                      <SelectTrigger aria-label="GitHub account">
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
                  )}
                  <label className="flex h-9 items-center gap-2 rounded-full border border-border px-3 text-sm">
                    <Search
                      className="size-3.5 text-stone-400"
                      aria-hidden="true"
                    />
                    <span className="sr-only">Search repositories</span>
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Search repositories"
                      className="min-w-0 flex-1 bg-transparent outline-none"
                    />
                  </label>
                  <div
                    role="listbox"
                    aria-label="Repositories"
                    className="h-56 space-y-0.5 overflow-y-auto pr-1"
                  >
                    {!repos ? (
                      <div className="grid h-full place-items-center">
                        <Spinner />
                      </div>
                    ) : (
                      shown.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          role="option"
                          aria-selected={repo?.id === r.id}
                          onClick={() => pickRepo(r)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13px]",
                            repo?.id === r.id
                              ? "bg-glow-soft font-semibold shadow-[inset_0_0_0_1px_var(--color-raspberry-200)]"
                              : "hover:bg-stone-100",
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {r.name}
                          </span>
                          {r.private && (
                            <Lock
                              className="size-3 text-stone-400"
                              aria-label="Private"
                            />
                          )}
                          <span className="text-[11px] font-normal text-stone-500">
                            {r.language ?? ""}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                  {status.installUrl && (
                    <a
                      href={status.installUrl}
                      className="inline-flex items-center gap-1 text-[11px] text-stone-600 hover:text-raspberry-700"
                    >
                      Choose which repositories Realframe can read
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  )}
                </div>
                <div className="space-y-3 rounded-2xl bg-stone-50 p-4">
                  <div className="grid gap-1.5">
                    <Label htmlFor="ds-branch">Branch</Label>
                    <Select
                      value={branch}
                      onValueChange={setBranch}
                      disabled={!repo}
                    >
                      <SelectTrigger id="ds-branch">
                        <SelectValue placeholder="Pick a repository first" />
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
                  <div className="grid gap-1.5">
                    <Label htmlFor="ds-folder">Folder</Label>
                    <Input
                      id="ds-folder"
                      value={folder}
                      onChange={(e) => setFolder(e.target.value)}
                      className="font-mono text-xs"
                      placeholder="packages/ui"
                    />
                    <p className="text-[11px] text-stone-500">
                      Where the components or tokens live, for monorepos.
                    </p>
                  </div>
                  <SwitchRow
                    id="ds-sync"
                    checked={syncOnPush}
                    onCheckedChange={setSyncOnPush}
                    label={`Update when ${branch || "the branch"} changes`}
                    description="New components and tokens show up in the next build."
                  />
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="npm" className="space-y-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ds-pkg">Package</Label>
              <Input
                id="ds-pkg"
                value={pkg}
                onChange={(e) => setPkg(e.target.value)}
                placeholder="@acme/ui"
                className="font-mono text-sm"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="ds-ver">Version</Label>
                <Input
                  id="ds-ver"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="latest"
                  className="font-mono text-sm"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ds-css">Stylesheet (optional)</Label>
                <Input
                  id="ds-css"
                  value={stylesheet}
                  onChange={(e) => setStylesheet(e.target.value)}
                  placeholder="dist/styles.css"
                  className="font-mono text-sm"
                />
              </div>
            </div>
            <p className="text-xs text-stone-600">
              Public React packages load as real components in prototypes.
              Private packages can be imported from GitHub instead.
            </p>
          </TabsContent>

          <TabsContent value="storybook" className="space-y-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ds-sb">Storybook address</Label>
              <Input
                id="ds-sb"
                type="url"
                value={storybook}
                onChange={(e) => setStorybook(e.target.value)}
                placeholder="https://storybook.acme.com"
              />
            </div>
            <p className="text-xs text-stone-600">
              Realframe reads the component list and styles from a public
              Storybook (6.4 or later). Prototypes match its look; they
              don&apos;t load its code.
            </p>
          </TabsContent>

          <TabsContent value="upload" className="space-y-3">
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                setFiles((f) =>
                  [...f, ...Array.from(e.dataTransfer.files)].slice(0, 20),
                );
              }}
              className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-[1.5px] border-dashed border-stone-300 bg-stone-50 p-6 text-center hover:border-raspberry-200"
            >
              <Upload className="size-5 text-stone-500" aria-hidden="true" />
              <span className="text-sm font-semibold">
                Drop files or choose them
              </span>
              <span className="text-xs text-stone-600">
                Tokens (.json), CSS, a Figma variables export, a style guide
                (.pdf, .md), or a component zip
              </span>
              <input
                type="file"
                multiple
                accept={ACCEPT}
                className="sr-only"
                onChange={(e) =>
                  setFiles((f) =>
                    [...f, ...Array.from(e.target.files ?? [])].slice(0, 20),
                  )
                }
              />
            </label>
            {files.length > 0 && (
              <ul className="space-y-1">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center gap-2 rounded-xl bg-stone-50 px-3 py-1.5 text-xs"
                  >
                    <FileText
                      className="size-3.5 text-stone-500"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="text-stone-500">
                      {Math.max(1, Math.round(f.size / 1024))} KB
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${f.name}`}
                      onClick={() =>
                        setFiles((xs) => xs.filter((_, j) => j !== i))
                      }
                      className="text-stone-500 hover:text-stone-900"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>

        <div className="grid gap-1.5">
          <Label htmlFor="ds-name">Name in Realframe</Label>
          <Input
            id="ds-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder={tab === "npm" && pkg ? pkg : "Acme UI"}
          />
        </div>
        <div className="flex items-center gap-3 border-t border-stone-100 pt-4">
          <p className="min-w-0 flex-1 text-[11px] text-stone-600">
            Everyone on{" "}
            <strong className="font-semibold text-stone-800">{teamName}</strong>{" "}
            can use it once it&apos;s imported. It stays private to the team.
          </p>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!ready} loading={busy} onClick={submit}>
            <Layers />
            Import
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
