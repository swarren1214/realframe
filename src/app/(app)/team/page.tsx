import { renderTeamPage } from "./load";

export const dynamic = "force-dynamic";

export default function TeamPage() {
  return renderTeamPage("settings", "/team");
}
