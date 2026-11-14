import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";
import { LoginForm } from "@/components/LoginForm";
import type { Metadata } from "next";
import { Check, TriangleAlert } from "lucide-react";

export const metadata: Metadata = {
  title: "Sign in · Realframe",
  description: "Sign in to Realframe with a link sent to your email.",
};

function safeNext(n?: string) {
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/projects";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const dest = safeNext(next);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(dest);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-6">
      <Logo href="/" />
      <div className="grid flex-1 items-center gap-12 py-12 md:grid-cols-2">
        <div>
          <h2 className="font-display text-4xl font-bold leading-[1.08] tracking-tight lg:text-[44px]">
            Prompt a prototype.
            <br />
            <span className="bg-gradient-to-r from-ember-700 via-raspberry-700 to-violet-700 bg-clip-text text-transparent">
              Share the real thing.
            </span>
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-stone-600">
            Describe a product and Realframe builds a working, clickable prototype. Publish it to a private link, invite reviewers and
            collect comments pinned right on the screens.
          </p>
          <ul className="mt-5 flex flex-wrap gap-2 text-xs font-medium text-stone-700">
            {["Real, coded prototypes", "Private review links", "Every version saved"].map((t) => (
              <li key={t} className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5">
                <Check className="size-3.5 text-raspberry-700" aria-hidden="true" />
                {t}
              </li>
            ))}
          </ul>
          <HeroArt />
        </div>
        <div className="flex flex-col items-center gap-3 md:items-end">
          {error && (
            <p role="alert" className="flex w-full max-w-sm items-center gap-2 rounded-2xl bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
              <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
              That sign-in link has expired or was already used. Request a new one.
            </p>
          )}
          <LoginForm next={dest} />
        </div>
      </div>
    </main>
  );
}

function HeroArt() {
  return (
    <div
      aria-hidden="true"
      className="relative mt-10 hidden h-64 overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-ember-600 via-raspberry-600 to-violet-600 md:block"
    >
      <svg viewBox="0 0 560 256" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice">
        <circle cx="470" cy="40" r="120" fill="#fff" fillOpacity=".08" />
        <circle cx="80" cy="250" r="140" fill="#1c1917" fillOpacity=".12" />
        <circle cx="280" cy="128" r="170" fill="none" stroke="#fff" strokeOpacity=".25" strokeDasharray="3 10" />
        <rect x="150" y="40" width="260" height="176" rx="24" fill="#fff" fillOpacity=".96" />
        <rect x="150" y="40" width="260" height="32" rx="16" fill="#1e3a8a" />
        <rect x="168" y="52" width="70" height="7" rx="3.5" fill="#93c5fd" />
        <rect x="168" y="86" width="70" height="52" rx="12" fill="#f1f5f9" />
        <rect x="246" y="86" width="70" height="52" rx="12" fill="#fee2e2" />
        <rect x="324" y="86" width="70" height="52" rx="12" fill="#f1f5f9" />
        <rect x="168" y="146" width="70" height="52" rx="12" fill="#f1f5f9" />
        <rect x="246" y="146" width="70" height="52" rx="12" fill="#f1f5f9" />
        <rect x="324" y="146" width="70" height="52" rx="12" fill="#f1f5f9" />
        <path d="M352 168l18 0-6.5 6.5 14.5 14.5-5 5-14.5-14.5-6.5 6.5z" fill="#1c1917" />
        <g transform="translate(300 96)">
          <path d="M0 0h28a14 14 0 0 1 0 28H4a4 4 0 0 1-4-4z" transform="translate(-4 -30)" fill="#be185d" />
          <text x="10" y="-11" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="12" fontWeight="700" fill="#fff">
            2
          </text>
        </g>
        <g transform="translate(110 70)">
          <circle r="20" fill="#fdba74" />
          <text y="4" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="11" fontWeight="700" fill="#7c2d12">
            MC
          </text>
        </g>
        <g transform="translate(456 190)">
          <circle r="18" fill="#c4b5fd" />
          <text y="4" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="11" fontWeight="700" fill="#4c1d95">
            JA
          </text>
        </g>
        <path d="M60 40l6 15 15 6-15 6-6 15-6-15-15-6 15-6z" fill="#fff" fillOpacity=".85" />
        <path d="M510 110l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="#fff" fillOpacity=".7" />
      </svg>
    </div>
  );
}
