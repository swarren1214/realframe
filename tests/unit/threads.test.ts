import { describe, expect, it } from "vitest";
import { mergeThreads, threadStamp } from "@/lib/threads";

const t = (id: string, at: string, body = "") => ({ id, created_at: at, body });

describe("mergeThreads", () => {
  const current = [t("a", "1"), t("b", "2"), t("c", "3")];

  it("replaces changed threads, adds new ones and drops deleted ones", () => {
    const next = mergeThreads(
      current,
      [t("b", "2", "edited"), t("d", "4")],
      ["b", "c", "d"],
    );
    expect(next.map((x) => [x.id, x.body])).toEqual([
      ["a", ""],
      ["b", "edited"],
      ["d", ""],
    ]);
  });

  it("takes the loaded list as the whole list when ids is null", () => {
    expect(mergeThreads(current, [t("z", "9")], null).map((x) => x.id)).toEqual(
      ["z"],
    );
  });
});

describe("threadStamp", () => {
  it("changes when a comment, thread or resolution changes", () => {
    const base = { threads: 3, resolved: 1, comments: 7, latest: "2026-01-01" };
    const s = threadStamp(base);
    expect(threadStamp({ ...base })).toBe(s);
    expect(threadStamp({ ...base, resolved: 2 })).not.toBe(s);
    expect(threadStamp({ ...base, comments: 6 })).not.toBe(s);
    expect(threadStamp({ ...base, latest: "2026-01-02" })).not.toBe(s);
  });
});
