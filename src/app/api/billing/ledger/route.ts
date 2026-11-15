import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ledgerCsv, readKind, readLedger } from "@/lib/usage";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * GET /api/billing/ledger: every build in the last 13 months, as CSV (format=csv) or JSON.
 * Optional filters: team (a Team Pro team's ledger), kind, project. The database decides
 * what the caller may see: their own builds, or a team's when they're on it.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const q = request.nextUrl.searchParams;
  const team = q.get("team");
  const project = q.get("project");
  if ((team && !UUID.test(team)) || (project && !UUID.test(project)))
    return NextResponse.json({ error: "Bad filter." }, { status: 400 });
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - 13);

  const { data, error } = await supabase.rpc("usage_ledger", {
    p_team: team,
    p_limit: 5000,
    p_project: project,
    p_kind: readKind(q.get("kind")),
    p_since: since.toISOString(),
  });
  if (error) {
    const forbidden = error.message.includes("forbidden");
    return NextResponse.json(
      { error: forbidden ? "You're not on that workspace." : error.message },
      { status: forbidden ? 403 : 500 },
    );
  }
  const rows = readLedger(data);
  if (q.get("format") !== "csv") return NextResponse.json({ rows });

  const withPeople = rows.some((r) => r.user_name && team);
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(ledgerCsv(rows, withPeople), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="realframe-usage-${day}.csv"`,
      "cache-control": "no-store",
    },
  });
}
