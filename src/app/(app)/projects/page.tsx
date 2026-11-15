import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { after } from "next/server";
import { requestThumbnails, thumbnailsFor } from "@/lib/thumbnails";
import { ThumbRefresher } from "@/components/ProjectThumb";
import { ProjectBrowser, type BrowserProject } from "@/components/projects/ProjectBrowser";
import { defaultDevice, readSettings } from "@/lib/devices";
import { Clock, FolderOpen, Plus, Upload, Users } from "lucide-react";
import { ImportDialog } from "@/components/ImportDialog";
import { createClient } from "@/lib/supabase/server";
import { Badge, BadgeDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eyebrow } from "@/components/Eyebrow";
import { NewPrototypeForm } from "@/components/NewPrototypeForm";
import { loadInvites, loadTeams, teamLabel } from "@/lib/teams";
import { InviteCards } from "@/components/teams/InviteCards";
import { DesignSystemSelect } from "@/components/design-systems/DesignSystemSelect";
import { swatches, type Tokens } from "@/lib/design-systems/types";
import { BuiltForSelect } from "@/components/devices/BuiltForSelect";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, onboarded_at, plan")
    .maybeSingle();
  if (profile && !profile.onboarded_at) redirect("/welcome");

  const [{ data: projects }, { teams, current }, invites] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "id, name, slug, owner_id, team_id, published, updated_at, created_at, archived_at, devices, thumbnail_path, thumbnail_version_id, thumbnail_requested_at, comment_threads(count)",
      )
      .eq("comment_threads.status", "open")
      .order("updated_at", { ascending: false }),
    loadTeams(supabase, user.id),
    loadInvites(supabase),
  ]);

  const { data: systems } = current
    ? await supabase
        .from("design_systems")
        .select("id, name, tokens, is_default")
        .eq("team_id", current.id)
        .not("synced_at", "is", null)
        .order("created_at")
    : { data: [] };
  const dsOptions = (systems ?? []).map((d) => ({
    id: d.id as string,
    name: d.name as string,
    colors: swatches(d.tokens as Tokens, 3),
    isDefault: Boolean(d.is_default),
  }));

  // Screenshots of each prototype's latest version; ones behind are refreshed after the response.
  const thumbs = await thumbnailsFor(supabase, projects ?? []);
  if (thumbs.stale.length) {
    const h = await headers();
    const host =
      h.get("x-forwarded-host") ?? h.get("host") ?? "www.realframe.app";
    const origin = `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
    after(() => requestThumbnails(thumbs.stale, origin));
  }

  // The current team's prototypes; others' prototypes you were invited to individually.
  const myTeams = new Set(teams.map((t) => t.id));
  const inTeam = (projects ?? []).filter((p) => p.team_id === current?.id);
  const shared = (projects ?? []).filter(
    (p) => !p.team_id || !myTeams.has(p.team_id),
  );
  // Reviewers open, comment on and approve the team's prototypes; they don't create them.
  const reviewer = current?.role === "reviewer";
  const isShared = new Set(shared.map((p) => p.id));
  const browserItems: BrowserProject[] = [...inTeam, ...shared].map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    published: p.published,
    updated_at: p.updated_at,
    created_at: p.created_at,
    archived_at: p.archived_at,
    scope: isShared.has(p.id) ? "shared" : p.owner_id === user.id ? "mine" : "team",
    href: isShared.has(p.id) ? `/p/${p.slug}` : `/projects/${p.id}`,
    canManage: p.owner_id === user.id,
    openComments:
      (p.comment_threads as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
    portrait: isPortrait(p.devices),
  }));

  return (
    <div>
      <main className="mx-auto max-w-5xl px-2 pt-10">
        {invites.length > 0 && (
          <div className="mb-6">
            <InviteCards invites={invites} compact />
          </div>
        )}
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {current && !current.personal ? current.name : "Your prototypes"}
          </h1>
          <div className="flex-1" />
          {!reviewer && (
            <ImportDialog
              trigger={
                <Button>
                  <Upload />
                  Import
                </Button>
              }
            />
          )}
        </div>
        {reviewer ? (
          <p
            role="note"
            className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-[13px] text-emerald-900"
          >
            You&apos;re a reviewer on {current?.name}: open any prototype to
            comment on it or approve it. Reviewers are free. Ask an admin to
            make you a builder if you need to create prototypes.
          </p>
        ) : (
          <NewPrototypeForm
            controls={
              <>
                <BuiltForSelect />
                {current && (
                  <DesignSystemSelect
                    options={dsOptions}
                    teamName={teamLabel(current)}
                  />
                )}
              </>
            }
          />
        )}

        <ProjectBrowser
          projects={browserItems}
          thumbs={thumbs}
          showMine={Boolean(current && !current.personal)}
          empty={
            current && !current.personal
              ? reviewer
                ? "No team prototypes yet. You'll see them here when builders make some."
                : "No team prototypes yet. Name one above to start one everyone on the team can open."
              : "No prototypes yet. Name one above to start."
          }
        />
      </main>
      <ThumbRefresher pending={thumbs.pending.length} />
    </div>
  );
}

/** Phone and tablet prototypes are shot upright, so their card shows a device frame. */
function isPortrait(devices: unknown) {
  const settings = readSettings(devices);
  const d = defaultDevice(settings);
  return d.kind !== "desktop" && settings.orientation !== "landscape";
}
