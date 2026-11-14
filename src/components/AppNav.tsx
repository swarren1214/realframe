"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/projects", label: "Prototypes" },
  { href: "/design-systems", label: "Design systems" },
  { href: "/team", label: "Team" },
];

/** Account-level sections, with the current one marked. */
export function AppNav() {
  const path = usePathname();
  return (
    <nav aria-label="Sections" className="hidden items-center gap-0.5 md:flex">
      {LINKS.map((l) => {
        const on = path === l.href || path.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "rounded-full px-3 py-1.5 text-[13px] font-medium no-underline transition-colors duration-(--duration-fast)",
              on
                ? "bg-stone-900/[.06] text-stone-900"
                : "text-stone-600 hover:bg-stone-900/[.04] hover:text-stone-900",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
