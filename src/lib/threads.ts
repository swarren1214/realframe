/** What the review page reads for each pinned thread. */
export const REVIEW_THREAD_SELECT =
  "id, version_id, x, y, status, created_at, guest_name, addressed_version_id, comments(id, thread_id, author_email, author_name, is_guest, body, created_at)";

/** What the Studio reads for each pinned thread. */
export const STUDIO_THREAD_SELECT =
  "id, version_id, x, y, status, created_at, addressed_version_id, comments(id, thread_id, author_email, author_name, body, created_at)";

/**
 * Merges freshly loaded threads into a list: `ids` are the threads that changed. Returned
 * threads replace their old copies or are added; changed ids that came back missing were
 * deleted. With `ids` null, the loaded list is the whole list.
 */
export function mergeThreads<T extends { id: string; created_at: string }>(
  current: T[],
  loaded: T[],
  ids: string[] | null,
): T[] {
  if (ids === null) return loaded;
  const changed = new Set(ids);
  const byId = new Map(loaded.map((t) => [t.id, t]));
  const next = current
    .filter((t) => !changed.has(t.id) || byId.has(t.id))
    .map((t) => byId.get(t.id) ?? t);
  for (const t of loaded) if (!current.some((c) => c.id === t.id)) next.push(t);
  return next.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** A cheap fingerprint of a prototype's threads, for guests polling for changes. */
export function threadStamp(t: {
  threads: number;
  resolved: number;
  comments: number;
  latest: string | null;
}) {
  return `${t.threads}.${t.resolved}.${t.comments}.${t.latest ?? ""}`;
}
