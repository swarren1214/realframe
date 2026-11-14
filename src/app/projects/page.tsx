import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { after } from "next/server";
import { requestThumbnails, thumbnailsFor } from "@/lib/thumbnails";
import { ProjectThumb, ThumbRefresher } from "@/components/ProjectThumb";
import { defaultDevice, readSettings } from "@/lib/devices";
import { Clock, FolderOpen, Plus, Upload, Users } from "lucide-react";
import { ImportDialog } from "@/components/ImportDialog";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/AppHeader";
import { Badge, BadgeDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eyebrow } from "@/components/Eyebrow";
import { createProject } from "./actions";
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
  if (!user) redirect("/");
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, onboarded_at, plan")
    .maybeSingle();
  if (profile && !profile.onboarded_at) redirect("/welcome");

  const [{ data: projects }, { teams, current }, invites] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "id, name, slug, owner_id, team_id, published, updated_at, devices, thumbnail_path, thumbnail_version_id, thumbnail_requested_at",
      )
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

  return (
    <div className="min-h-screen px-4 pb-16">
      <AppHeader plan={profile?.plan} />
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
          <ImportDialog
            trigger={
              <Button>
                <Upload />
                Import
              </Button>
            }
          />
        </div>
        <form
          action={createProject}
          className="glass mt-5 flex flex-wrap items-center gap-2 rounded-full p-1.5 pl-2"
        >
          <label htmlFor="name" className="sr-only">
            Prototype name
          </label>
          <Input
            id="name"
            name="name"
            required
            maxLength={80}
            placeholder="Name a new prototype, e.g. Dispatch Board v2"
            className="h-10 min-w-0 flex-1 border-transparent bg-transparent hover:border-transparent focus:ring-0"
          />
          <BuiltForSelect />
          {current && (
            <DesignSystemSelect
              options={dsOptions}
              teamName={teamLabel(current)}
            />
          )}
          <Button variant="default" size="lg" type="submit">
            <Plus />
            New prototype
          </Button>
        </form>

        <ProjectList
          title={
            current && !current.personal ? "Team prototypes" : "Created by you"
          }
          items={inTeam}
          thumbs={thumbs}
          empty={
            current && !current.personal
              ? "No team prototypes yet. Name one above to start one everyone on the team can open."
              : "No prototypes yet. Name one above to start."
          }
        />
        {shared.length > 0 && (
          <ProjectList
            title="Shared with you"
            items={shared}
            thumbs={thumbs}
            shared
          />
        )}
      </main>
      <ThumbRefresher pending={thumbs.pending.length} />
    </div>
  );
}

function ProjectList({
  title,
  items,
  empty,
  shared,
  thumbs,
}: {
  title: string;
  thumbs: { urls: Record<string, string>; pending: string[] };
  items: {
    id: string;
    name: string;
    slug: string;
    published: boolean;
    updated_at: string;
    devices?: unknown;
  }[];
  empty?: string;
  shared?: boolean;
}) {
  return (
    <section className="mt-10">
      <Eyebrow>{title}</Eyebrow>
      {items.length === 0 ? (
        <div className="mt-3 flex items-center gap-3 rounded-3xl border border-dashed border-stone-300 bg-card/50 p-6 text-[13px] text-stone-600">
          <FolderOpen className="size-5 text-stone-400" aria-hidden="true" />
          {empty}
        </div>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <li key={p.id}>
              <Link
                href={shared ? `/p/${p.slug}` : `/projects/${p.id}`}
                className="group block rounded-3xl border border-stone-200/80 bg-card p-4 no-underline shadow-[0_12px_32px_-24px_rgba(28,25,23,.35)] transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-raspberry-200 hover:shadow-[0_20px_40px_-24px_rgba(190,24,93,.4)]"
              >
                <ProjectThumb
                  src={thumbs.urls[p.id]}
                  name={p.name}
                  portrait={isPortrait(p.devices)}
                  capturing={thumbs.pending.includes(p.id)}
                />
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-stone-900">
                    {p.name}
                  </span>
                  {p.published && (
                    <Badge variant="success">
                      <BadgeDot />
                      Live
                    </Badge>
                  )}
                  {shared && (
                    <Badge className="ml-auto">
                      <Users />
                      Shared
                    </Badge>
                  )}
                </div>
                <p className="mt-1 flex items-center gap-1 text-xs text-stone-500">
                  <Clock className="size-3" aria-hidden="true" />
                  Updated{" "}
                  {new Date(p.updated_at).toLocaleString("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Phone and tablet prototypes are shot upright, so their card shows a device frame. */
function isPortrait(devices: unknown) {
  const settings = readSettings(devices);
  const d = defaultDevice(settings);
  return d.kind !== "desktop" && settings.orientation !== "landscape";
}
