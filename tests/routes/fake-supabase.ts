// A tiny stand-in for the Supabase JS client: records every query and answers from a handler.
// Enough for route-handler tests; database behaviour itself is tested against real SQL in tests/db.
export type Call = {
  table?: string;
  rpc?: string;
  args?: unknown;
  op: "select" | "insert" | "update" | "delete" | "upsert" | "rpc";
  values?: unknown;
  filters: [string, ...unknown[]][];
};

export type Answer = {
  data?: unknown;
  error?: { message: string } | null;
  count?: number;
};
export type Handler = (call: Call) => Answer | undefined;

export function fakeSupabase(
  handler: Handler = () => undefined,
  user: { id: string; email: string } | null = null,
) {
  const calls: Call[] = [];
  const respond = (call: Call) => {
    calls.push(call);
    const a = handler(call) ?? {};
    return {
      data: a.data ?? null,
      error: a.error ?? null,
      count: a.count ?? null,
    };
  };
  const builder = (table: string) => {
    const call: Call = { table, op: "select", filters: [] };
    const chain: Record<string, unknown> = {};
    const filter =
      (name: string) =>
      (...args: unknown[]) => {
        call.filters.push([name, ...args]);
        return chain;
      };
    for (const f of [
      "eq",
      "neq",
      "in",
      "is",
      "not",
      "lt",
      "lte",
      "gt",
      "gte",
      "order",
      "limit",
      "match",
      "or",
      "filter",
      "contains",
    ])
      chain[f] = filter(f);
    chain.select = (cols?: unknown) => {
      if (call.op === "select") call.values = cols;
      return chain;
    };
    for (const op of ["insert", "update", "upsert"] as const)
      chain[op] = (values: unknown) => {
        call.op = op;
        call.values = values;
        return chain;
      };
    chain.delete = () => {
      call.op = "delete";
      return chain;
    };
    chain.single = () => Promise.resolve(respond(call));
    chain.maybeSingle = () => Promise.resolve(respond(call));
    chain.then = (
      res: (v: unknown) => unknown,
      rej?: (e: unknown) => unknown,
    ) => Promise.resolve(respond(call)).then(res, rej);
    return chain;
  };
  const client = {
    from: (table: string) => builder(table),
    rpc: (name: string, args?: unknown) => {
      const call: Call = { rpc: name, args, op: "rpc", filters: [] };
      const p = Promise.resolve().then(() => respond(call));
      return Object.assign(p, {
        single: () => p,
        maybeSingle: () => p,
      });
    },
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
    },
    channel: () => ({ send: async () => undefined }),
  };
  return { client, calls };
}
