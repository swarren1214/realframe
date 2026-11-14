/** A team design system, as stored and as the UI and builds use it. */

export type DesignSystemSource =
  | {
      kind: "github";
      installationId: number;
      repo: string;
      branch: string;
      folder: string;
    }
  | { kind: "npm"; package: string; version?: string; stylesheet?: string }
  | { kind: "storybook"; url: string }
  | { kind: "upload"; paths: string[] };

export type Runtime = {
  package: string;
  version: string;
  /** Import map entries a prototype adds to load React and the package from esm.sh. */
  importMap: Record<string, string>;
  stylesheet: string | null;
};

export type Tokens = {
  colors?: { name: string; value: string; usage?: string }[];
  fonts?: { role: string; family: string; source?: string }[];
  typeScale?: {
    name: string;
    size: string;
    weight?: string;
    lineHeight?: string;
  }[];
  radii?: { name: string; value: string }[];
  spacing?: { name: string; value: string }[];
  shadows?: { name: string; value: string }[];
};

export type ComponentSpec = {
  name: string;
  description?: string;
  /** Props or variants worth knowing. */
  props?: string[];
  /** A short example: JSX for real components, HTML + Tailwind for styles only. */
  example?: string;
};

export type DesignSystem = {
  id: string;
  team_id: string;
  name: string;
  source_kind: DesignSystemSource["kind"];
  source: DesignSystemSource;
  status: "importing" | "ready" | "failed";
  progress: string | null;
  error: string | null;
  kind: "components" | "styles" | null;
  summary: string | null;
  tokens: Tokens;
  components: ComponentSpec[];
  runtime: Runtime | null;
  sync_on_push: boolean;
  synced_sha: string | null;
  is_default: boolean;
  created_by: string | null;
  created_at: string;
  synced_at: string | null;
};

export type Rule = {
  id: string;
  design_system_id: string;
  body: string;
  origin: "docs" | "admin" | "suggested";
  status: "active" | "pending";
  created_by: string | null;
  created_by_email: string | null;
  created_at: string;
};

export const DS_COLUMNS =
  "id, team_id, name, source_kind, source, status, progress, error, kind, summary, tokens, components, runtime, sync_on_push, synced_sha, is_default, created_by, created_at, synced_at";

export function sourceLabel(ds: Pick<DesignSystem, "source">) {
  const s = ds.source;
  switch (s.kind) {
    case "github":
      return `${s.repo}${s.folder && s.folder !== "./" ? ` · ${s.folder.replace(/^\.\//, "")}` : ""}`;
    case "npm":
      return `${s.package}${s.version ? `@${s.version}` : ""} on npm`;
    case "storybook":
      return s.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
    case "upload":
      return s.paths
        .map((p) =>
          p
            .split("/")
            .pop()!
            .replace(/^[0-9a-f-]{36}-/, ""),
        )
        .join(", ");
  }
}

/** A few colors to show on a card, preferring brand and accent colors over grays. */
export function swatches(tokens: Tokens, n = 4) {
  const colors = (tokens.colors ?? []).filter((c) =>
    /^#|^rgb|^hsl|^oklch/i.test(c.value.trim()),
  );
  const gray =
    /gr[ae]y|neutral|slate|stone|zinc|white|black|background|surface|border|muted/i;
  return [
    ...colors.filter((c) => !gray.test(c.name)),
    ...colors.filter((c) => gray.test(c.name)),
  ]
    .slice(0, n)
    .map((c) => c.value);
}
