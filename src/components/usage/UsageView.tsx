import Link from "next/link";
import { ChevronRight, Download, TrendingUp } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/Eyebrow";
import { formatUsd } from "@/lib/billing";
import {
  KIND_LABEL,
  KIND_SINGULAR,
  USAGE_KINDS,
  dailySeries,
  forecastMicros,
  formatDuration,
  formatTokens,
  readKind,
  readLedger,
  readOverview,
  type LedgerRow,
  type UsageKind,
  type UsageOverview,
} from "@/lib/usage";

/** Series colors, validated for color-vision deficiency on light and dark surfaces. */
const KIND_COLOR: Record<UsageKind, string> = {
  build: "#db2777",
  variant: "#8b5cf6",
  fix: "#ea580c",
  ai_copy: "#0891b2",
  export: "#b45309",
  voice: "#2563eb",
};

const PAGE = 25;

export type UsageParams = {
  kind?: string;
  project?: string;
  before?: string;
};

/** Loads what the Usage tab shows for a person (team null) or a Team Pro team. */
export async function loadUsage(
  supabase: SupabaseClient,
  team: string | null,
  params: UsageParams,
) {
  const kind = readKind(params.kind);
  const project =
    params.project && /^[0-9a-f-]{36}$/i.test(params.project)
      ? params.project
      : null;
  const before =
    params.before && !Number.isNaN(Date.parse(params.before))
      ? params.before
      : null;
  const [overview, ledger] = await Promise.all([
    supabase.rpc("usage_overview", { p_team: team }),
    supabase.rpc("usage_ledger", {
      p_team: team,
      p_before: before,
      p_limit: PAGE + 1,
      p_project: project,
      p_kind: kind,
    }),
  ]);
  if (overview.error) console.error("usage_overview", overview.error.message);
  if (ledger.error) console.error("usage_ledger", ledger.error.message);
  const rows = readLedger(ledger.data);
  return {
    overview: readOverview(overview.data),
    rows: rows.slice(0, PAGE),
    more: rows.length > PAGE ? rows[PAGE - 1].created_at : null,
    filters: { kind, project, before },
  };
}

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/** The Usage tab: this period's spend, where it went, controls and every build. */
export function UsageView({
  data,
  team,
  basePath,
}: {
  data: Awaited<ReturnType<typeof loadUsage>>;
  team: string | null;
  basePath: string;
}) {
  const o = data.overview;
  if (!o)
    return (
      <Card>
        <p className="text-sm text-stone-600">
          Usage isn&apos;t available right now. Try again in a minute.
        </p>
      </Card>
    );
  return (
    <div className="space-y-5">
      <PeriodCard o={o} />
      <DailyChart o={o} />
      <div className="grid gap-5 lg:grid-cols-2">
        <ByProject o={o} basePath={basePath} />
        {o.by_member.length > 0 ? <ByMember o={o} /> : <KindTotals o={o} />}
      </div>
      <Ledger
        rows={data.rows}
        more={data.more}
        filters={data.filters}
        projects={o.by_project}
        basePath={basePath}
        team={team}
        showPeople={o.by_member.length > 0}
      />
    </div>
  );
}

function PeriodCard({ o }: { o: UsageOverview }) {
  const paid = o.plan === "pro" || o.plan === "team";
  const start = new Date(o.period_start);
  const end = new Date(o.period_end);
  const forecast = paid
    ? forecastMicros(o.usage_micros, o.daily, start, end, new Date())
    : null;
  const pct = o.included_micros
    ? Math.min(100, (o.usage_micros / o.included_micros) * 100)
    : 0;
  const capPct =
    o.spend_cap_micros && o.included_micros
      ? Math.min(100, (o.spend_cap_micros / o.included_micros) * 100)
      : null;
  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <Eyebrow>
            {paid ? "Included AI usage this period" : "AI usage this month"}
          </Eyebrow>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="font-display text-4xl font-bold tracking-tight">
              {formatUsd(o.usage_micros)}
            </span>
            {paid && (
              <span className="text-stone-600">
                of {formatUsd(o.included_micros, 0)}
              </span>
            )}
          </p>
          <p className="mt-1 text-xs text-stone-600" suppressHydrationWarning>
            {fmtDay(o.period_start)} to{" "}
            {fmtDay(new Date(end.getTime() - 1).toISOString())} · resets{" "}
            {fmtDay(o.period_end)}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-4">
          <Stat label="Builds" value={String(o.builds)} />
          <Stat label="Failed, $0" value={String(o.failed)} />
          <Stat label="Build time" value={formatTotalTime(o.duration_ms)} />
          <Stat
            label="Overage"
            value={formatUsd(Math.max(o.usage_micros - o.included_micros, 0))}
          />
        </dl>
      </div>
      {paid && (
        <div>
          <div
            role="meter"
            aria-label="Included AI usage used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
            className="relative h-3 overflow-hidden rounded-full bg-stone-100"
          >
            <div
              className="h-full rounded-full btn-glow"
              style={{ width: `${pct}%` }}
            />
            {capPct !== null && capPct < 100 && (
              <div
                className="absolute inset-y-0 w-0.5 bg-foreground"
                style={{ left: `${capPct}%` }}
                aria-hidden="true"
              />
            )}
          </div>
          <div className="relative mt-1 h-4 text-[11px] text-stone-600">
            <span className="absolute left-0">$0</span>
            {capPct !== null && capPct < 85 && capPct > 10 && (
              <span
                className="absolute -translate-x-1/2"
                style={{ left: `${capPct}%` }}
              >
                Cap {formatUsd(o.spend_cap_micros!)}
              </span>
            )}
            <span className="absolute right-0">
              {formatUsd(o.included_micros, 0)} included
              {o.spend_cap_micros !== null &&
                !(capPct !== null && capPct < 85 && capPct > 10) &&
                ` · cap ${formatUsd(o.spend_cap_micros)}`}
            </span>
          </div>
        </div>
      )}
      {forecast !== null && forecast > o.usage_micros && (
        <p className="flex flex-wrap items-center gap-2 rounded-2xl border border-stone-200/80 bg-background px-4 py-3 text-[13px]">
          <TrendingUp className="size-4 text-ember-700" aria-hidden="true" />
          <span>
            At this pace you&apos;ll use about{" "}
            <strong>{formatUsd(forecast)}</strong> by {fmtDay(o.period_end)}
            {forecast > o.included_micros ? (
              <>
                , about{" "}
                <strong>{formatUsd(forecast - o.included_micros)}</strong> past
                the included amount, billed at cost + 50%.
              </>
            ) : (
              ", within the included amount."
            )}
          </span>
        </p>
      )}
    </Card>
  );
}

/** Total build time: "48 s", "12 min", "3 h 05 min". */
function formatTotalTime(ms: number) {
  const min = Math.round(ms / 60_000);
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-stone-600">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function DailyChart({ o }: { o: UsageOverview }) {
  const series = dailySeries(
    o.daily,
    new Date(o.period_start),
    new Date(o.period_end),
  );
  const kinds = USAGE_KINDS.filter((k) => (o.by_kind[k] ?? 0) > 0);
  const max = Math.max(...series.map((s) => s.total), 1);
  // A round top for the axis: 0.5, 1, 2, 5, 10 … dollars.
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  const top =
    (steps.find((s) => s * 1_000_000 >= max) ?? Math.ceil(max / 1e6)) *
    1_000_000;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Daily usage</h2>
        {kinds.length > 1 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-700">
            {kinds.map((k) => (
              <li key={k} className="flex items-center gap-1.5">
                <span
                  className="size-2.5 rounded-[3px]"
                  style={{ background: KIND_COLOR[k] }}
                  aria-hidden="true"
                />
                {KIND_LABEL[k]}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex gap-2">
        <div className="flex h-40 w-12 flex-col justify-between text-right text-[11px] tabular-nums text-stone-600">
          <span>{formatUsd(top)}</span>
          <span>{formatUsd(top / 2)}</span>
          <span>$0</span>
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="relative flex h-40 items-end gap-[2px] border-b border-stone-200"
            role="img"
            aria-label={`Daily AI usage, ${fmtDay(o.period_start)} to ${fmtDay(o.period_end)}. Total ${formatUsd(o.usage_micros)}.`}
          >
            <div
              className="pointer-events-none absolute inset-x-0 top-0 border-t border-stone-100"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-stone-100"
              aria-hidden="true"
            />
            {series.map((s) => (
              <div
                key={s.day}
                className="group relative flex h-full min-w-0 flex-1 flex-col-reverse gap-[2px]"
              >
                {kinds.map((k) =>
                  s.kinds[k] ? (
                    <div
                      key={k}
                      className="w-full first:rounded-b-none last:rounded-t-[4px]"
                      style={{
                        height: `${Math.max((s.kinds[k]! / top) * 100, 0.8)}%`,
                        background: KIND_COLOR[k],
                      }}
                    />
                  ) : null,
                )}
                {s.day === today && (
                  <div
                    className="absolute inset-x-0 bottom-0 h-full rounded-t-[4px] ring-1 ring-inset ring-stone-300"
                    aria-hidden="true"
                  />
                )}
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-stone-900 px-2 py-1 text-[11px] text-white shadow-lg group-hover:block">
                  <span className="font-semibold">{fmtDay(s.day)}</span> ·{" "}
                  {formatUsd(s.total)}
                  {kinds
                    .filter((k) => s.kinds[k])
                    .map((k) => (
                      <span key={k} className="block text-white/80">
                        {KIND_LABEL[k]} {formatUsd(s.kinds[k]!)}
                      </span>
                    ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-stone-600">
            <span>{fmtDay(series[0]?.day ?? o.period_start)}</span>
            <span>{fmtDay(series.at(-1)?.day ?? o.period_end)}</span>
          </div>
        </div>
      </div>
      <details className="text-xs text-stone-700">
        <summary className="cursor-pointer font-medium">
          Show as a table
        </summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <thead>
            <tr className="text-stone-600">
              <th className="py-1 font-medium">Day</th>
              {kinds.map((k) => (
                <th key={k} className="py-1 font-medium">
                  {KIND_LABEL[k]}
                </th>
              ))}
              <th className="py-1 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {series
              .filter((s) => s.total > 0)
              .map((s) => (
                <tr key={s.day} className="border-t border-stone-100">
                  <td className="py-1">{fmtDay(s.day)}</td>
                  {kinds.map((k) => (
                    <td key={k} className="py-1">
                      {s.kinds[k] ? formatUsd(s.kinds[k]!) : "—"}
                    </td>
                  ))}
                  <td className="py-1 font-semibold">{formatUsd(s.total)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </Card>
  );
}

function ShareBar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 rounded-full bg-stone-100" aria-hidden="true">
      <div
        className="h-full rounded-full bg-raspberry-700"
        style={{ width: `${Math.max(pct, 1)}%` }}
      />
    </div>
  );
}

function ByProject({ o, basePath }: { o: UsageOverview; basePath: string }) {
  const total = Math.max(o.usage_micros, 1);
  return (
    <Card>
      <h2 className="text-sm font-semibold">By prototype</h2>
      {o.by_project.length === 0 ? (
        <p className="text-[13px] text-stone-600">No builds yet this period.</p>
      ) : (
        <ul className="space-y-3">
          {o.by_project.slice(0, 8).map((p) => {
            const pct = Math.round((p.micros / total) * 100);
            return (
              <li key={p.project_id ?? p.name}>
                <Link
                  href={
                    p.project_id
                      ? `${basePath}?tab=usage&project=${p.project_id}#ledger`
                      : `${basePath}?tab=usage#ledger`
                  }
                  className="block space-y-1.5 rounded-xl text-inherit no-underline"
                >
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{p.name}</span>
                    <span className="font-semibold tabular-nums">
                      {formatUsd(p.micros)}
                    </span>
                  </div>
                  <ShareBar pct={pct} />
                  <p className="text-xs text-stone-600">
                    {pct}% · {p.builds} build{p.builds === 1 ? "" : "s"}
                    {p.failed ? ` · ${p.failed} failed` : ""}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ByMember({ o }: { o: UsageOverview }) {
  const total = Math.max(o.usage_micros, 1);
  return (
    <Card>
      <h2 className="text-sm font-semibold">By member</h2>
      <ul className="space-y-3">
        {o.by_member.map((m) => {
          const pct = Math.round((m.micros / total) * 100);
          return (
            <li key={m.user_id} className="space-y-1.5">
              <div className="flex justify-between gap-3 text-sm">
                <span className="truncate font-medium">{m.name}</span>
                <span className="font-semibold tabular-nums">
                  {formatUsd(m.micros)}
                </span>
              </div>
              <ShareBar pct={pct} />
              <p className="text-xs text-stone-600">
                {pct}% · {m.builds} build{m.builds === 1 ? "" : "s"}
              </p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function KindTotals({ o }: { o: UsageOverview }) {
  const kinds = USAGE_KINDS.filter((k) => (o.by_kind[k] ?? 0) > 0);
  return (
    <Card>
      <h2 className="text-sm font-semibold">By kind of work</h2>
      {kinds.length === 0 ? (
        <p className="text-[13px] text-stone-600">No builds yet this period.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {kinds.map((k) => (
            <li key={k} className="flex items-center gap-2">
              <span
                className="size-2.5 rounded-[3px]"
                style={{ background: KIND_COLOR[k] }}
                aria-hidden="true"
              />
              <span className="flex-1">{KIND_LABEL[k]}</span>
              <span className="font-semibold tabular-nums">
                {formatUsd(o.by_kind[k] ?? 0)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Ledger({
  rows,
  more,
  filters,
  projects,
  basePath,
  team,
  showPeople,
}: {
  rows: LedgerRow[];
  more: string | null;
  filters: {
    kind: UsageKind | null;
    project: string | null;
    before: string | null;
  };
  projects: UsageOverview["by_project"];
  basePath: string;
  team: string | null;
  showPeople: boolean;
}) {
  const csv = new URLSearchParams({ format: "csv" });
  if (team) csv.set("team", team);
  if (filters.kind) csv.set("kind", filters.kind);
  if (filters.project) csv.set("project", filters.project);
  const next = new URLSearchParams({ tab: "usage" });
  if (filters.kind) next.set("kind", filters.kind);
  if (filters.project) next.set("project", filters.project);
  if (more) next.set("before", more);

  return (
    <Card id="ledger">
      <form
        method="get"
        action={basePath}
        className="flex flex-wrap items-end gap-3"
      >
        <input type="hidden" name="tab" value="usage" />
        <h2 className="mr-auto text-sm font-semibold">Ledger</h2>
        <label className="flex flex-col gap-1 text-xs text-stone-600">
          Prototype
          <select
            name="project"
            defaultValue={filters.project ?? ""}
            className="h-9 rounded-xl border border-stone-200 bg-card px-2 text-sm text-foreground"
          >
            <option value="">All prototypes</option>
            {projects
              .filter((p) => p.project_id)
              .map((p) => (
                <option key={p.project_id} value={p.project_id!}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-stone-600">
          Kind
          <select
            name="kind"
            defaultValue={filters.kind ?? ""}
            className="h-9 rounded-xl border border-stone-200 bg-card px-2 text-sm text-foreground"
          >
            <option value="">All kinds</option>
            {USAGE_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline" size="sm">
          Filter
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={`/api/billing/ledger?${csv}`} download>
            <Download />
            CSV
          </a>
        </Button>
      </form>

      {rows.length === 0 ? (
        <p className="text-[13px] text-stone-600">
          {filters.before ? "No earlier builds." : "No builds match."}
        </p>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-stone-100 text-xs text-stone-600">
                <th className="p-2 font-medium">Time</th>
                <th className="p-2 font-medium">Prototype</th>
                {showPeople && <th className="p-2 font-medium">Who</th>}
                <th className="p-2 font-medium">Kind</th>
                <th className="p-2 font-medium">Version</th>
                <th className="p-2 text-right font-medium">Tokens in / out</th>
                <th className="p-2 text-right font-medium">Time taken</th>
                <th className="p-2 text-right font-medium">Billed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <LedgerLine key={r.id} r={r} showPeople={showPeople} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {more && (
        <Link
          href={`${basePath}?${next}#ledger`}
          className="self-start text-[13px] font-semibold"
        >
          Earlier builds
        </Link>
      )}
    </Card>
  );
}

function LedgerLine({ r, showPeople }: { r: LedgerRow; showPeople: boolean }) {
  const failed = r.status === "failed";
  const running = r.status === "started";
  return (
    <tr className="border-b border-stone-50 align-top">
      <td
        className="whitespace-nowrap p-2 text-stone-600"
        suppressHydrationWarning
      >
        {fmtTime(r.created_at)}
      </td>
      <td className="p-2 font-medium">
        {r.project_name}
        {r.steps.length > 1 && (
          <details className="mt-1 font-normal text-stone-600">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-xs">
              <ChevronRight className="size-3" aria-hidden="true" />
              {r.steps.length} steps
            </summary>
            <ol className="mt-1 list-decimal space-y-0.5 pl-6 text-xs">
              {r.steps.map((s, i) => (
                <li key={i}>
                  {s.title}
                  {s.status === "failed" && " (failed)"}
                </li>
              ))}
            </ol>
          </details>
        )}
      </td>
      {showPeople && (
        <td className="p-2 text-stone-700">{r.user_name ?? "—"}</td>
      )}
      <td className="p-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${failed ? "bg-stone-100 text-stone-700" : "bg-raspberry-50 text-raspberry-800"}`}
        >
          {!failed && (
            <span
              className="size-2 rounded-full"
              style={{ background: KIND_COLOR[r.kind] }}
              aria-hidden="true"
            />
          )}
          {KIND_SINGULAR[r.kind]}
          {failed && " · failed"}
          {running && " · running"}
        </span>
      </td>
      <td className="p-2 text-stone-700">
        {r.version_number ? `v${r.version_number}` : "—"}
      </td>
      <td className="p-2 text-right tabular-nums text-stone-700">
        {r.input_tokens == null && r.output_tokens == null
          ? "—"
          : `${formatTokens(r.input_tokens)} / ${formatTokens(r.output_tokens)}`}
      </td>
      <td className="p-2 text-right tabular-nums text-stone-700">
        {formatDuration(r.duration_ms)}
      </td>
      <td
        className={`p-2 text-right font-semibold tabular-nums ${failed ? "text-stone-600" : ""}`}
      >
        {running ? "—" : formatUsd(r.billed_micros)}
      </td>
    </tr>
  );
}
