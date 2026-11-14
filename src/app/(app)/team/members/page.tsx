import { renderTeamPage } from "../load";

export const dynamic = "force-dynamic";

export default function MembersPage() {
  return renderTeamPage("members", "/team/members");
}
