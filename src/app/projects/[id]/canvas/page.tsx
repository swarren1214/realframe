import { notFound, redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { createClient } from "@/lib/supabase/server";
import type { Project } from "@/lib/types";
import { Canvas, type Frame } from "./Canvas";

export const dynamic = "force-dynamic";

export default async function CanvasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/?next=/projects/${id}/canvas`);

  const { data: project } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (!project) notFound();
  const { data: role } = await supabase.rpc("project_role", { p: id });
  if (role !== "owner" && role !== "editor") redirect(`/p/${project.slug}`);

  const { data: profile } = await supabase.from("profiles").select("plan").eq("id", user.id).single();
  if (profile?.plan !== "pro") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-stone-50 p-6">
        <Logo href="/projects" />
        <div className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-ember-700">Pro feature</p>
          <h1 className="mt-1 font-display text-2xl font-bold">Lay out every screen on a canvas</h1>
          <p className="mt-2 text-stone-600">
            See your prototype&apos;s screens side by side at desktop, tablet and phone sizes. Every frame is live, and you can edit
            any of them visually.
          </p>
          <form action="/api/billing/checkout" method="post" className="mt-6">
            <button className="min-h-12 rounded-lg bg-ember-700 px-6 font-semibold text-white hover:bg-ember-800">
              Upgrade to Pro · $20/month
            </button>
          </form>
          <a href={`/projects/${id}`} className="mt-4 inline-block text-sm text-stone-600">
            Back to the studio
          </a>
        </div>
      </main>
    );
  }

  const [{ data: frames }, { data: latest }] = await Promise.all([
    supabase
      .from("canvas_frames")
      .select("id, label, route, width, height, x, y, version_id")
      .eq("project_id", id)
      .order("created_at"),
    supabase.from("versions").select("id, number, html").eq("project_id", id).order("number", { ascending: false }).limit(1),
  ]);

  return (
    <Canvas
      project={project as Project}
      frames={(frames ?? []) as Frame[]}
      latest={(latest?.[0] as { id: string; number: number; html: string } | undefined) ?? null}
    />
  );
}
