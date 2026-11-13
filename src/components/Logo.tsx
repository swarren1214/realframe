import Link from "next/link";

export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
      <rect x="1" y="1" width="24" height="24" rx="7" fill="#C2410C" />
      <path
        d="M14 19H9a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5"
        stroke="#FFF"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M15 15l6 2.2-2.8 1-1 2.8z" fill="#FFF" />
    </svg>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 text-stone-900 no-underline">
      <Mark />
      <span className="font-display text-lg font-bold tracking-tight">Realframe</span>
    </Link>
  );
}
