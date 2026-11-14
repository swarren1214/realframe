// Shared by server pages and client components (no "use client" here, so values import cleanly).

export type Source = {
  project_id: string;
  repo_full_name: string;
  branch: string;
  root_dir: string;
  framework: string | null;
  build_on_push: boolean;
  publish_on_push: boolean;
};

export type Build = {
  id: string;
  status: "queued" | "building" | "succeeded" | "failed" | "canceled";
  trigger: string;
  commit_sha: string | null;
  commit_message: string | null;
  commit_author: string | null;
  error_summary: string | null;
  queued_at: string;
  started_at: string | null;
  finished_at: string | null;
  version_id: string | null;
};

export const BUILD_COLUMNS =
  "id, status, trigger, commit_sha, commit_message, commit_author, error_summary, queued_at, started_at, finished_at, version_id";
