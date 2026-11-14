import Link from "next/link";
import { useId } from "react";

export function Mark({ size = 28 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
      <defs>
        <linearGradient id={`rf-mark-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#EA580C" />
          <stop offset=".55" stopColor="#DB2777" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <rect
        x="1"
        y="1"
        width="24"
        height="24"
        rx="9"
        fill={`url(#rf-mark-${id})`}
      />
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
    <Link
      href={href}
      className="flex items-center gap-2.5 text-stone-900 no-underline"
    >
      <Mark />
      <span className="font-display text-lg font-bold tracking-tight">
        Realframe
      </span>
    </Link>
  );
}
