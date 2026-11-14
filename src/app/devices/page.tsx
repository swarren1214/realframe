import { renderTeamPage } from "../team/load";

export const dynamic = "force-dynamic";

export default function DevicesPage() {
  return renderTeamPage("devices", "/devices");
}
