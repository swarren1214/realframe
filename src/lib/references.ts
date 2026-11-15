import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export const MAX_REFERENCES = 6;

export type Reference = { path: string; name: string; type: string };

/** A content block the model reads: an image, or a PDF as a document. */
export type ReferenceBlock =
  | {
      type: "image";
      source: { type: "base64"; media_type: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; data: string };
    }
  | {
      type: "document";
      source: { type: "base64"; media_type: "application/pdf"; data: string };
    };

const TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"]);

/**
 * Keeps only references this person may use on this prototype: files under the
 * prototype's folder, or their own pending uploads from before it existed.
 */
export function readReferences(
  raw: unknown,
  projectId: string,
  userId: string,
): Reference[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r && typeof r === "object")
    .map((r) => {
      const o = r as Record<string, unknown>;
      return {
        path: String(o.path ?? ""),
        name: String(o.name ?? "").slice(0, 120) || "image",
        type: String(o.type ?? ""),
      };
    })
    .filter(
      (r) =>
        TYPES.has(r.type) &&
        !r.path.includes("..") &&
        (r.path.startsWith(`${projectId}/`) ||
          r.path.startsWith(`pending/${userId}/`)),
    )
    .slice(0, MAX_REFERENCES);
}

/** Downloads references and turns them into blocks for the model. Missing files are skipped. */
export async function referenceBlocks(refs: Reference[]): Promise<ReferenceBlock[]> {
  if (!refs.length) return [];
  const storage = createAdminClient().storage.from("references");
  const out = await Promise.all(
    refs.map(async (r): Promise<ReferenceBlock | null> => {
      const { data } = await storage.download(r.path);
      if (!data) return null;
      const b64 = Buffer.from(await data.arrayBuffer()).toString("base64");
      return r.type === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
        : {
            type: "image",
            source: {
              type: "base64",
              media_type: r.type as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
              data: b64,
            },
          };
    }),
  );
  return out.filter((b): b is ReferenceBlock => b !== null);
}
