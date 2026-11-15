import { readInterval } from "@/lib/plans";
import { usageWindow } from "@/lib/usage-window";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadTeams, type TeamDeviceRow, type TeamMember } from "@/lib/teams";
import { TeamSettings } from "./TeamSettings";
import { Card } from "@/components/ui/card";
import { Eyebrow } from "@/components/Eyebrow";
import { readBillingTab } from "@/components/usage/BillingTabs";
import { Invoices, loadInvoices } from "@/components/usage/Invoices";
import { SpendControls } from "@/components/usage/SpendControls";
import {
  UsageView,
  loadUsage,
  type UsageParams,
} from "@/components/usage/UsageView";

export type TeamView = "settings" | "members" | "billing" | "devices";

export async function renderTeamPage(
  view: TeamView,
  next: string,
  params: UsageParams & { tab?: string } = {},
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${next}`);
  const [{ data: profile }, { current }] = await Promise.all([
    supabase
      .from("profiles")
      .select("plan, display_name")
      .eq("id", user.id)
      .maybeSingle(),
    loadTeams(supabase, user.id),
  ]);
  if (!current) redirect("/projects");
  // A personal workspace's plan is the person's own.
  if (view === "billing" && current.personal) redirect("/billing");

  const [
    { data: members },
    { data: devices },
    { count: prototypes },
    { data: people },
  ] = await Promise.all([
    supabase
      .from("team_members")
      .select("email, user_id, role, status, created_at")
      .eq("team_id", current.id)
      .order("created_at"),
    supabase
      .from("team_devices")
      .select("id, team_id, name, kind, width, height, frame")
      .eq("team_id", current.id)
      .order("created_at"),
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("team_id", current.id),
    supabase.rpc("team_profiles", { t: current.id }),
  ]);
  // GitHub: accounts this person connected, and which ones the team shares.
  const admin = createAdminClient();
  const { data: billingRow } = await admin
    .from("teams")
    .select(
      "plan, seats, subscription_status, current_period_start, current_period_end, cancel_at_period_end, stripe_customer_id, billing_interval, spend_cap_micros, alert_thresholds",
    )
    .eq("id", current.id)
    .single();
  const interval = readInterval(billingRow?.billing_interval);
  // Annual plans measure included usage per month, counted from the subscription start.
  const periodFrom =
    interval === "year" && billingRow?.current_period_start
      ? usageWindow(
          new Date(billingRow.current_period_start),
          new Date(),
        ).start.toISOString()
      : (billingRow?.current_period_start ??
        new Date(
          new Date().getFullYear(),
          new Date().getMonth(),
          1,
        ).toISOString());
  const { data: usageRows } =
    billingRow?.plan === "team"
      ? await admin
          .from("generations")
          .select("billed_micros")
          .eq("team_id", current.id)
          .gte("created_at", periodFrom)
      : { data: [] as { billed_micros: number | null }[] };
  // Paid seats are active builders; reviewers are free.
  const activeMembers = Math.max(
    1,
    ((members ?? []) as { status: string; role: string }[]).filter(
      (m) => m.status === "active" && m.role !== "reviewer",
    ).length,
  );
  const reviewers = (
    (members ?? []) as { status: string; role: string }[]
  ).filter((m) => m.status === "active" && m.role === "reviewer").length;
  const billing = {
    plan: (billingRow?.plan ?? "free") as "free" | "team",
    seats:
      billingRow?.plan === "team"
        ? Number(billingRow.seats ?? activeMembers)
        : activeMembers,
    status: billingRow?.subscription_status ?? null,
    periodEnd: billingRow?.current_period_end ?? null,
    cancelAtPeriodEnd: Boolean(billingRow?.cancel_at_period_end),
    hasCustomer: Boolean(billingRow?.stripe_customer_id),
    interval,
    reviewers,
    usageMicros: (usageRows ?? []).reduce(
      (n, r) => n + Number(r.billed_micros ?? 0),
      0,
    ),
  };
  const [{ data: mine }, { data: shared }] = await Promise.all([
    admin
      .from("github_installation_users")
      .select(
        "installation_id, github_installations(account_login, account_type)",
      )
      .eq("user_id", user.id),
    admin
      .from("team_github_installations")
      .select(
        "installation_id, shared_by, github_installations(account_login, account_type)",
      )
      .eq("team_id", current.id),
  ]);
  type Inst = { account_login: string; account_type: string } | null;
  const github = {
    mine: (mine ?? []).map((r) => ({
      id: r.installation_id as number,
      login:
        (r.github_installations as unknown as Inst)?.account_login ?? "GitHub",
    })),
    shared: (shared ?? []).map((r) => ({
      id: r.installation_id as number,
      login:
        (r.github_installations as unknown as Inst)?.account_login ?? "GitHub",
      byMe: r.shared_by === user.id,
    })),
  };
  const profiles = Object.fromEntries(
    (
      (people ?? []) as {
        user_id: string;
        display_name: string | null;
        avatar_url: string | null;
      }[]
    ).map((p) => [p.user_id, { name: p.display_name, avatar: p.avatar_url }]),
  );

  // Team Pro's Usage and Billing tabs. Members see the team's totals and their own builds;
  // admins see everyone's and change the controls.
  const billingTab = readBillingTab(params.tab);
  let billingExtra: React.ReactNode = null;
  if (view === "billing" && billingRow?.plan === "team") {
    if (billingTab === "usage") {
      const usage = await loadUsage(supabase, current.id, params);
      billingExtra = (
        <UsageView data={usage} team={current.id} basePath="/team/billing" />
      );
    } else {
      const invoices =
        current.role === "admin"
          ? await loadInvoices(billingRow.stripe_customer_id)
          : [];
      billingExtra = (
        <>
          <Card id="spend-controls">
            <Eyebrow>Alerts and spend cap</Eyebrow>
            <SpendControls
              teamId={current.id}
              capMicros={
                billingRow.spend_cap_micros == null
                  ? null
                  : Number(billingRow.spend_cap_micros)
              }
              thresholds={
                (billingRow.alert_thresholds as number[] | null) ?? [
                  50, 80, 100,
                ]
              }
              includedMicros={Number(billing.seats) * 10_000_000}
              canEdit={current.role === "admin"}
            />
          </Card>
          {current.role === "admin" && billingRow.stripe_customer_id && (
            <Invoices invoices={invoices} />
          )}
        </>
      );
    }
  }

  return (
    <div>
      <TeamSettings
        billingTab={billingTab}
        billingExtra={billingExtra}
        view={view}
        ownerName={profile?.display_name ?? null}
        team={current}
        me={user.email?.toLowerCase() ?? ""}
        members={(members ?? []) as TeamMember[]}
        devices={(devices ?? []) as TeamDeviceRow[]}
        prototypes={prototypes ?? 0}
        profiles={profiles}
        github={github}
        billing={billing}
      />
    </div>
  );
}
