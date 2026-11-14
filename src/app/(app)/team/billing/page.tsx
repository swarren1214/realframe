import { renderTeamPage } from "../load";

export const dynamic = "force-dynamic";

export default function BillingPage() {
  return renderTeamPage("billing", "/team/billing");
}
