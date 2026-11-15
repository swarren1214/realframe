"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  ArrowDownUp,
  Clock,
  Ellipsis,
  FolderOpen,
  MessageSquare,
  Search,
  SquareArrowOutUpRight,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { ProjectThumb } from "@/components/ProjectThumb";
import { Badge, BadgeDot } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { archiveProject, deleteProjectQuietly } from "@/app/projects/actions";
import { unwrapped } from "@/lib/safe-action";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";

const archive = unwrapped(archiveProject);
const remove = unwrapped(deleteProjectQuietly);

export type BrowserProject = {
  id: string;
  name: string;
  slug: string;
  published: boolean;
  updated_at: string;
  created_at: string;
  archived_at: string | null;
  /** Mine: I own it. Team: someone else's in my workspace. Shared: invited individually. */
  scope: "mine" | "team" | "shared";
  /** Opens in the studio (builders) or on the review page. */
  href: string;
  canManage: boolean;
  openComments: number;
  portrait: boolean;
};

type Filter = "all" | "mine" | "shared" | "archived";
type Sort = "edited" | "created" | "name";

export function ProjectBrowser({
  projects,
  thumbs,
  empty,
  showMine,
}: {
  projects: BrowserProject[];
  thumbs: { urls: Record<string, string>; pending: string[] };
  empty: string;
  /** In a team workspace "Mine" narrows to what you made; alone, everything is yours. */
  showMine: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("edited");
  const [confirm, setConfirm] = useState<BrowserProject | null>(null);
  const [, startTransition] = useTransition();
  const search = useRef<HTMLInputElement>(null);

  // "/" jumps to search, like most tools.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (e.key !== "/" || t.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      search.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hasShared = projects.some((p) => p.scope === "shared");
  const archivedCount = projects.filter((p) => p.archived_at).length;
  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    ...(showMine ? [{ id: "mine" as const, label: "Mine" }] : []),
    ...(hasShared ? [{ id: "shared" as const, label: "Shared with me" }] : []),
    ...(archivedCount ? [{ id: "archived" as const, label: `Archived · ${archivedCount}` }] : []),
  ];

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = projects.filter((p) => {
      if (filter === "archived" ? !p.archived_at : p.archived_at) return false;
      if (filter === "mine" && p.scope !== "mine") return false;
      if (filter === "shared" && p.scope !== "shared") return false;
      return !q || p.name.toLowerCase().includes(q);
    });
    return list.sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "created"
          ? b.created_at.localeCompare(a.created_at)
          : b.updated_at.localeCompare(a.updated_at),
    );
  }, [projects, query, filter, sort]);

  const active = projects.filter((p) => !p.archived_at);
  const withComments = active.filter((p) => p.openComments > 0).length;

  function setArchived(p: BrowserProject, archived: boolean) {
    startTransition(async () => {
      try {
        await archive(p.id, archived);
        notify.success(archived ? `Archived ${p.name}` : `Restored ${p.name}`, {
          description: archived
            ? p.published
              ? "Its review link is offline until you publish it again."
              : undefined
            : "Publish it again to bring its review link back.",
          undo: archived
            ? async () => {
                await archive(p.id, false);
                router.refresh();
              }
            : undefined,
        });
        router.refresh();
      } catch (e) {
        notify.error(e instanceof Error ? e.message : "Couldn't do that.");
      }
    });
  }

  if (!projects.length)
    return (
      <div className="mt-10 flex items-center gap-3 rounded-3xl border border-dashed border-stone-300 bg-card/50 p-6 text-[13px] text-stone-600">
        <FolderOpen className="size-5 text-stone-400" aria-hidden="true" />
        {empty}
      </div>
    );

  return (
    <section className="mt-10" aria-label="Prototypes">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-60">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-stone-400"
            aria-hidden="true"
          />
          <input
            ref={search}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            placeholder="Search prototypes"
            aria-label="Search prototypes"
            className="h-10 w-full rounded-full border border-stone-200 bg-card pl-10 pr-10 text-[13px] outline-none transition-[border-color,box-shadow] placeholder:text-stone-400 focus:border-raspberry-600 focus:ring-4 focus:ring-raspberry-100 [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-stone-500 hover:bg-secondary"
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <Kbd className="absolute right-3 top-1/2 -translate-y-1/2 max-lg:hidden">/</Kbd>
          )}
        </div>
        {filters.length > 1 && (
          <div
            role="radiogroup"
            aria-label="Show"
            className="flex max-w-full overflow-x-auto rounded-full bg-secondary p-0.5"
          >
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "h-9 shrink-0 whitespace-nowrap rounded-full px-3 text-[12.5px] font-medium transition-colors",
                  filter === f.id
                    ? "bg-card text-stone-900 shadow-sm"
                    : "text-stone-600 hover:text-stone-900",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger aria-label="Sort by" className="h-10 rounded-full bg-card">
            <ArrowDownUp className="size-3.5 text-stone-500" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="edited">Last edited</SelectItem>
            <SelectItem value="created">Newest</SelectItem>
            <SelectItem value="name">Name</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="mx-1 mb-3 mt-4 text-xs text-stone-500" aria-live="polite">
        {query || filter !== "all"
          ? `${shown.length} of ${filter === "archived" ? archivedCount : active.length} ${filter === "archived" ? "archived" : "prototypes"}`
          : `${active.length} ${active.length === 1 ? "prototype" : "prototypes"}${withComments ? ` · ${withComments} with open comments` : ""}`}
      </p>

      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-stone-300 bg-card/50 p-8 text-center text-[13px] text-stone-600">
          <Search className="size-5 text-stone-400" aria-hidden="true" />
          {query ? `Nothing matches “${query}”.` : "Nothing here yet."}
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="font-semibold text-raspberry-700 hover:underline"
            >
              Clear search
            </button>
          )}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => (
            <li key={p.id} className="relative">
              <Link
                href={p.href}
                className={cn(
                  "group block rounded-3xl border border-stone-200/80 bg-card p-4 no-underline shadow-[0_12px_32px_-24px_rgba(28,25,23,.35)] transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-raspberry-200 hover:shadow-[0_20px_40px_-24px_rgba(190,24,93,.4)]",
                  p.archived_at && "opacity-80",
                )}
              >
                <ProjectThumb
                  src={thumbs.urls[p.id]}
                  name={p.name}
                  portrait={p.portrait}
                  capturing={thumbs.pending.includes(p.id)}
                />
                <div className="flex items-center gap-2 pr-9">
                  <span className="truncate text-sm font-semibold text-stone-900">{p.name}</span>
                  {p.published && (
                    <Badge variant="success">
                      <BadgeDot />
                      Live
                    </Badge>
                  )}
                  {p.archived_at && <Badge>Archived</Badge>}
                </div>
                <p className="mt-1 flex items-center gap-1 pr-9 text-xs text-stone-500">
                  <Clock className="size-3" aria-hidden="true" />
                  <span suppressHydrationWarning>Edited {relative(p.updated_at)}</span>
                  {p.scope === "shared" && (
                    <span className="ml-auto inline-flex items-center gap-1">
                      <Users className="size-3" aria-hidden="true" />
                      Shared
                    </span>
                  )}
                  {p.openComments > 0 && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 font-medium text-raspberry-700",
                        p.scope !== "shared" && "ml-auto",
                      )}
                      title={`${p.openComments} open ${p.openComments === 1 ? "comment" : "comments"}`}
                    >
                      <MessageSquare className="size-3" aria-hidden="true" />
                      {p.openComments}
                      <span className="sr-only"> open comments</span>
                    </span>
                  )}
                </p>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={`More for ${p.name}`}
                  className="absolute bottom-[1.375rem] right-3 grid size-8 place-items-center rounded-full text-stone-500 outline-none transition-colors hover:bg-secondary hover:text-stone-900 focus-visible:ring-[3px] focus-visible:ring-ring/40"
                >
                  <Ellipsis className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem asChild>
                    <Link href={p.href}>
                      <SquareArrowOutUpRight />
                      Open
                    </Link>
                  </DropdownMenuItem>
                  {p.published && (
                    <DropdownMenuItem asChild>
                      <a href={`/p/${p.slug}`} target="_blank" rel="noreferrer">
                        <Users />
                        Open review link
                      </a>
                    </DropdownMenuItem>
                  )}
                  {p.canManage && (
                    <>
                      <DropdownMenuSeparator />
                      {p.archived_at ? (
                        <DropdownMenuItem onSelect={() => setArchived(p, false)}>
                          <ArchiveRestore />
                          Restore
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onSelect={() => setArchived(p, true)}>
                          <Archive />
                          Archive
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setConfirm(p)}
                      >
                        <Trash2 />
                        Delete…
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={Boolean(confirm)} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{confirm?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              All of its versions, variants and comments go with it. This can&apos;t be undone.
              {!confirm?.archived_at && " To take it offline but keep it, archive it instead."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const p = confirm;
                if (!p) return;
                startTransition(async () => {
                  try {
                    await remove(p.id);
                    notify.success(`Deleted ${p.name}`);
                    router.refresh();
                  } catch (e) {
                    notify.error(e instanceof Error ? e.message : "Couldn't delete it.");
                  }
                });
              }}
            >
              Delete prototype
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function relative(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2 * 86400) return "yesterday";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
