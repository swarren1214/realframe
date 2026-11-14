import { json, readJson, requireRole, route } from "@/lib/api/v1";
import { setAccessMode } from "@/lib/services/projects";
import type { AccessMode } from "@/lib/types";

// PUT /v1/projects/:id/access { mode: "invite" | "password" | "public" }
export const PUT = route<{ id: string }>(
  async (request, { supabase }, { id }) => {
    await requireRole(supabase, id, ["owner"]);
    const body = await readJson<{ mode: AccessMode }>(request);
    await setAccessMode(supabase, id, body.mode as AccessMode);
    return json({ accessMode: body.mode });
  },
);
