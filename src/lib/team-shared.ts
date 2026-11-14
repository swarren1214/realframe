// Team types and helpers safe to use in client components.
import type { Device, DeviceKind } from "@/lib/devices";

export type TeamRole = "admin" | "member";
export type Team = {
  id: string;
  name: string;
  personal: boolean;
  role: TeamRole;
};
export type TeamMember = {
  email: string;
  user_id: string | null;
  role: TeamRole;
  status: "pending" | "active";
  created_at: string;
  name?: string | null;
};
export type TeamDeviceRow = {
  id: string;
  team_id: string;
  name: string;
  kind: DeviceKind;
  width: number;
  height: number;
  frame: "bezel" | "none";
};

export function teamLabel(t: Pick<Team, "name" | "personal">) {
  return t.personal ? "Personal" : t.name;
}

export function toDevice(r: TeamDeviceRow): Device {
  return {
    id: `team:${r.id}`,
    name: r.name,
    kind: r.kind,
    width: r.width,
    height: r.height,
    radius: r.kind === "phone" ? 36 : r.kind === "tablet" ? 16 : 8,
    team: true,
    frame: r.frame,
  };
}
