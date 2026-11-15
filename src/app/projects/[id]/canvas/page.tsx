import { notFound, redirect } from "next/navigation";
import { ArrowLeft, LayoutGrid, Sparkles } from "lucide-react";
import { Logo } from "@/components/Logo";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import type { Project } from "@/lib/types";
import { Canvas, type Frame, type Link as FlowLink } from "./Canvas";
import { AccountMenu } from "@/components/AccountMenu";
import { contentUrlFor } from "@/lib/content";

export const dynamic = "force-dynamic";

export default async function CanvasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/projects/${id}/canvas`);

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();
  const { data: role } = await supabase.rpc("project_role", { p: id });
  if (role !== "owner" && role !== "editor") redirect(`/p/${project.slug}`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();
  if (profile?.plan !== "pro") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
        <Logo href="/projects" />
        <div className="relative w-full max-w-md overflow-hidden rounded-[1.75rem] border border-stone-200/80 bg-card p-6 text-center shadow-[0_30px_60px_-30px_rgba(124,58,237,.35)]">
          <div
            aria-hidden="true"
            className="rf-light-palette mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-ember-600 via-raspberry-600 to-violet-600 text-white"
          >
            <LayoutGrid className="size-5" />
          </div>
          <Badge variant="default">
            <Sparkles />
            Pro feature
          </Badge>
          <h1 className="mt-2 font-display text-xl font-bold tracking-tight">
            Lay out every screen on a canvas
          </h1>
          <p className="mt-1.5 text-[13px] text-stone-600">
            See your prototype&apos;s screens side by side at desktop, tablet
            and phone sizes. Every frame is live, and you can edit any of them
            visually.
          </p>
          <form action="/api/billing/checkout" method="post" className="mt-5">
            <Button variant="default" size="lg" type="submit">
              <Sparkles />
              Upgrade to Pro · $20/month
            </Button>
          </form>
          <Button asChild variant="ghost" className="mt-2">
            <Link href={`/projects/${id}`}>
              <ArrowLeft />
              Back to the studio
            </Link>
          </Button>
        </div>
      </main>
    );
  }

  const [{ data: frames }, { data: latest }, { data: links }] = await Promise.all([
    supabase
      .from("canvas_frames")
      .select("id, label, route, width, height, x, y, version_id")
      .eq("project_id", id)
      .order("created_at"),
    supabase
      .from("versions")
      .select("id, number, html, kind")
      .eq("project_id", id)
      .order("number", { ascending: false })
      .limit(1),
    supabase
      .from("canvas_links")
      .select("from_route, to_route, label")
      .eq("project_id", id),
  ]);

  return (
    <Canvas
      accountMenu={<AccountMenu compact />}
      project={project as Project}
      frames={(frames ?? []) as Frame[]}
      links={(links ?? []) as FlowLink[]}
      latest={
        latest?.[0]
          ? {
              ...(latest[0] as { id: string; number: number; html: string }),
              src:
                latest[0].kind === "bundle"
                  ? contentUrlFor(latest[0].id)
                  : null,
            }
          : null
      }
    />
  );
}
