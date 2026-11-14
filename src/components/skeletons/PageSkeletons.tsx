import { Skeleton } from "@/components/ui/skeleton";

function Loading({ label }: { label: string }) {
  return (
    <span role="status" className="sr-only">
      {label}
    </span>
  );
}

/** Pill header used on projects and billing. */
function HeaderSkeleton() {
  return (
    <div className="glass mx-auto mt-4 flex max-w-5xl items-center gap-2 rounded-full py-1.5 pl-5 pr-1.5">
      <Skeleton className="h-6 w-28 rounded-full" />
      <div className="flex-1" />
      <Skeleton className="size-9 rounded-full" />
    </div>
  );
}

export function ProjectsSkeleton() {
  return (
    <div className="min-h-screen px-4 pb-16">
      <Loading label="Loading your prototypes" />
      <HeaderSkeleton />
      <main className="mx-auto max-w-5xl px-2 pt-10">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-56" />
          <div className="flex-1" />
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>
        <Skeleton className="mt-5 h-[52px] rounded-full" />
        <Skeleton className="mt-10 h-3 w-28" />
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <li
              key={i}
              className="rounded-3xl border border-stone-200/80 bg-white p-4"
            >
              <Skeleton className="mb-3 h-20 rounded-2xl" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="mt-2 h-3 w-1/2" />
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

export function BillingSkeleton() {
  return (
    <div className="min-h-screen px-4 pb-16">
      <Loading label="Loading billing" />
      <HeaderSkeleton />
      <main className="mx-auto max-w-3xl px-2 pt-10">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-3 h-4 w-72" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-72 rounded-3xl" />
          <Skeleton className="h-72 rounded-3xl" />
        </div>
      </main>
    </div>
  );
}

/** Studio, canvas and review all share a pill header over a full-height body. */
export function WorkspaceSkeleton({
  panels = "both",
  label,
}: {
  panels?: "both" | "right" | "none";
  label: string;
}) {
  return (
    <div className="flex h-screen flex-col">
      <Loading label={label} />
      <div className="glass mx-3 mt-3 flex items-center gap-2 rounded-full py-1.5 pl-3 pr-1.5">
        <Skeleton className="size-[34px] rounded-full" />
        <Skeleton className="h-5 w-44" />
        <div className="flex-1" />
        <Skeleton className="h-9 w-24 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-full" />
        <Skeleton className="size-9 rounded-full" />
      </div>
      <div className="flex min-h-0 flex-1 gap-3 p-3">
        {panels === "both" && (
          <div className="glass hidden w-[320px] shrink-0 flex-col gap-3 rounded-3xl p-4 lg:flex xl:w-[360px]">
            <Skeleton className="h-9 rounded-full" />
            <Skeleton className="h-28" />
            <Skeleton className="h-3 w-24" />
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        )}
        <div className="min-w-0 flex-1 rounded-3xl border border-stone-200/70 bg-white/70" />
        {panels !== "none" && (
          <div className="glass hidden w-[320px] shrink-0 flex-col gap-3 rounded-3xl p-4 xl:flex xl:w-[360px]">
            <Skeleton className="h-9 rounded-full" />
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
