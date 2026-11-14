import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { gather } from "./gather";
import { extract } from "./extract";
import type { DesignSystemSource } from "./types";

/**
 * Reads a design system's source and stores what builds need: tokens, components, rules and,
 * for public React packages, how to load the real components. Runs after the response
 * (it takes a minute or two), reporting progress on the row.
 */
export async function processImport(id: string) {
  const admin = createAdminClient();
  const step = (progress: string) =>
    admin.from("design_systems").update({ progress }).eq("id", id);
  const { data: ds } = await admin
    .from("design_systems")
    .select("id, name, source")
    .eq("id", id)
    .maybeSingle();
  if (!ds) return;
  try {
    await step("Reading the source");
    const material = await gather(admin, ds.source as DesignSystemSource);
    await step(
      `Studying ${material.files.length + material.pdfs.length} files`,
    );
    const real = Boolean(material.runtime);
    const result = await extract(material, {
      name: ds.name,
      realComponents: real,
      packageName: material.runtime?.package,
    });

    await admin
      .from("design_systems")
      .update({
        status: "ready",
        progress: null,
        error: null,
        kind: real ? "components" : "styles",
        summary: result.summary || null,
        tokens: result.tokens,
        components: result.components,
        runtime: material.runtime,
        synced_sha: material.sha,
        synced_at: new Date().toISOString(),
      })
      .eq("id", id);
    // Rules from the docs are replaced on every sync; ones people added stay.
    await admin
      .from("design_system_rules")
      .delete()
      .eq("design_system_id", id)
      .eq("origin", "docs");
    if (result.rules.length) {
      await admin
        .from("design_system_rules")
        .insert(
          result.rules.map((body) => ({
            design_system_id: id,
            body,
            origin: "docs",
            status: "active",
          })),
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "The import failed.";
    console.error("design system import failed", id, err);
    await admin
      .from("design_systems")
      .update({
        status: "failed",
        progress: null,
        error: message.slice(0, 500),
      })
      .eq("id", id);
  }
}
