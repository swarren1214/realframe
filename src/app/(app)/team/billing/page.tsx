import { renderTeamPage } from "../load";

export const dynamic = "force-dynamic";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    kind?: string;
    project?: string;
    before?: string;
  }>;
}) {
  return renderTeamPage("billing", "/team/billing", await searchParams);
}
