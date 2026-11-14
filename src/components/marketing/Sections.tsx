import Link from "next/link";
import {
  Check,
  CircleCheck,
  GitBranch,
  LayoutGrid,
  Layers,
  MessageSquareText,
  Palette,
  Smartphone,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { Mark } from "@/components/Logo";
import { PLANS } from "@/lib/plans";
import { HeroSignup } from "./HeroSignup";
import { HOME_FAQ } from "./faq-content";

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-transparent bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-full text-stone-900"
        >
          <Mark size={30} />
          <span className="font-display text-xl font-bold">Realframe</span>
        </Link>
        <nav
          aria-label="Main"
          className="flex flex-wrap items-center gap-1 text-sm font-medium"
        >
          <a
            href="/#how"
            className="hidden rounded-full px-3.5 py-3 text-stone-600 hover:text-stone-900 sm:inline"
          >
            How it works
          </a>
          <Link
            href="/faq"
            className="hidden rounded-full px-3.5 py-3 text-stone-600 hover:text-stone-900 sm:inline"
          >
            FAQ
          </Link>
          <Link
            href="/pricing"
            className="rounded-full px-3.5 py-3 text-stone-600 hover:text-stone-900"
          >
            Pricing
          </Link>
          <Link
            href="/login"
            className="rounded-full px-3.5 py-3 font-semibold text-stone-900"
          >
            Sign in
          </Link>
          <a
            href="/#signup"
            className="btn-glow rounded-full px-4 py-2.5 font-semibold text-white"
          >
            Start free
          </a>
        </nav>
      </div>
    </header>
  );
}

export function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-10 pt-14 lg:grid-cols-[1.05fr_1fr]">
      <div>
        <p className="inline-flex items-center gap-2 rounded-full bg-raspberry-50 px-3 py-1.5 text-[13px] font-semibold text-raspberry-800">
          <CircleCheck className="size-4" aria-hidden="true" />
          Reviewers are free on every plan
        </p>
        <h1 className="mt-5 font-display text-5xl font-bold leading-[1.04] tracking-tight sm:text-6xl">
          Prototype it. Get it reviewed. Fix it in one build.
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-stone-600">
          Describe a product and Realframe builds a real, coded prototype. Send
          it on a private link, run a review round, and turn every open comment
          into the next version.
        </p>
        <HeroSignup />
        <p className="mt-3 text-[13px] text-stone-500">
          No password, no card. {PLANS.free.monthlyBuilds} free builds every
          month. By signing up you agree to the{" "}
          <Link href="/terms" className="underline underline-offset-2">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
      <HeroArt />
    </section>
  );
}

function HeroArt() {
  return (
    <div
      aria-hidden="true"
      className="rf-light-palette relative h-[420px] overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-ember-600 via-raspberry-600 to-violet-600"
    >
      <div className="absolute inset-10 flex flex-col overflow-hidden rounded-[1.25rem] bg-white shadow-[0_30px_60px_rgba(28,25,23,.25)]">
        <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-3">
          <span className="size-2.5 rounded-full bg-stone-200" />
          <span className="size-2.5 rounded-full bg-stone-200" />
          <span className="size-2.5 rounded-full bg-stone-200" />
          <span className="ml-3 truncate text-xs text-stone-500">
            checkout-flow.realframe.app
          </span>
          <span className="ml-auto hidden rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800 sm:inline">
            Review round · 2 of 3 approved
          </span>
        </div>
        <div className="relative grid flex-1 grid-cols-3 gap-3 p-5">
          <div className="rounded-xl bg-stone-100" />
          <div className="rounded-xl bg-raspberry-100" />
          <div className="rounded-xl bg-stone-100" />
          <div className="rounded-xl bg-stone-100" />
          <div className="rounded-xl bg-stone-100" />
          <div className="rounded-xl bg-violet-100" />
          <span className="absolute left-[46%] top-[22%] grid size-8 place-items-center rounded-[16px_16px_16px_4px] bg-raspberry-700 text-[13px] font-bold text-white">
            2
          </span>
          <span className="absolute left-[78%] top-[60%] grid size-8 place-items-center rounded-[16px_16px_16px_4px] bg-emerald-600 text-white">
            <Check className="size-4" />
          </span>
        </div>
      </div>
    </div>
  );
}

const STEPS = [
  {
    title: "Describe it",
    body: "Write what you want, or import a repo, a file or your design system. Realframe builds a working, coded prototype.",
  },
  {
    title: "Share it privately",
    body: "Publish to its own subdomain: invite-only, a password for clients, or view-only for anyone with the link.",
  },
  {
    title: "Run a review round",
    body: "Ask specific people to review a version. They pin comments on the screens and approve or ask for changes.",
  },
  {
    title: "Fix from feedback",
    body: "Pick the open comments and build the next version from them. Reviewers see what was addressed.",
  },
];

export function HowItWorks() {
  return (
    <section
      id="how"
      aria-labelledby="how-heading"
      className="mx-auto max-w-6xl scroll-mt-20 px-6 py-20"
    >
      <p className="text-[13px] font-bold uppercase tracking-[.08em] text-raspberry-700">
        How it works
      </p>
      <h2
        id="how-heading"
        className="mt-2 font-display text-4xl font-bold tracking-tight"
      >
        From prompt to approved, in one place
      </h2>
      <ol className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <li
            key={s.title}
            className="rounded-3xl border border-stone-200 bg-card p-6"
          >
            <p className="font-display text-sm font-bold text-raspberry-700">
              {String(i + 1).padStart(2, "0")}
            </p>
            <h3 className="mt-2.5 text-lg font-bold">{s.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-stone-600">
              {s.body}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

const LOOP = [
  {
    icon: CircleCheck,
    title: "Review rounds with approvals",
    body: "Request a review on a version, set a due date, and see who approved and who asked for changes.",
  },
  {
    icon: WandSparkles,
    title: "Fix from feedback",
    body: "Select open comments and turn them into one build. Each is marked “Addressed in v7” and its author is told.",
  },
  {
    icon: MessageSquareText,
    title: "Comments that follow the work",
    body: "Pins stay tied to the version they were left on. Clients on a password link see the whole discussion.",
  },
  {
    icon: Sparkles,
    title: "Reviewers never pay",
    body: "Anyone you ask to review just needs a free account. Seats are only for people who build.",
  },
];

export function ReviewLoop() {
  return (
    <section
      id="review"
      aria-labelledby="review-heading"
      className="rf-light-palette scroll-mt-20 bg-stone-900 text-stone-100"
    >
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-2">
        <div>
          <p className="text-[13px] font-bold uppercase tracking-[.08em] text-raspberry-200">
            The review loop
          </p>
          <h2
            id="review-heading"
            className="mt-2 font-display text-4xl font-bold tracking-tight text-white"
          >
            Built for the people who never write a prompt
          </h2>
          <p className="mt-4 text-[17px] leading-relaxed text-stone-300">
            Most AI builders stop at the share link. Realframe is where the
            feedback happens: stakeholders and clients review the real thing,
            and every comment can become the next version.
          </p>
          <ul className="mt-8 space-y-5">
            {LOOP.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-raspberry-800/40 text-raspberry-200">
                  <Icon className="size-[18px]" aria-hidden="true" />
                </span>
                <span>
                  <span className="block font-bold text-white">{title}</span>
                  <span className="mt-1 block text-[15px] leading-relaxed text-stone-400">
                    {body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div
          aria-hidden="true"
          className="rounded-[1.75rem] border border-stone-700 bg-stone-800 p-6"
        >
          <div className="mb-4 flex items-center justify-between">
            <span className="font-bold text-white">Review round · v6</span>
            <span className="rounded-full bg-emerald-900 px-2.5 py-1 text-xs font-semibold text-emerald-200">
              Approved
            </span>
          </div>
          {[
            ["MC", "Maya Chen"],
            ["JA", "Jordan Avery"],
            ["SR", "Sam Rivera"],
          ].map(([i, n]) => (
            <div
              key={n}
              className="mb-2.5 flex items-center gap-3 rounded-2xl bg-stone-900 px-3.5 py-3"
            >
              <span className="grid size-8 place-items-center rounded-full bg-ember-200 text-xs font-bold text-ember-800">
                {i}
              </span>
              <span className="flex-1 text-sm text-stone-100">{n}</span>
              <span className="text-xs font-semibold text-emerald-300">
                Approved
              </span>
            </div>
          ))}
          <div className="mt-4 rounded-2xl bg-stone-900 p-3.5 text-sm text-stone-300">
            <span className="rounded-full bg-raspberry-800/50 px-2 py-0.5 text-[11px] font-bold text-raspberry-200">
              Addressed in v6
            </span>
            <p className="mt-2.5">
              “Make the promo code field easier to find.”
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  {
    icon: Layers,
    title: "Real, coded prototypes",
    body: "Working HTML, CSS and JavaScript, not linked images. Clickable on any device.",
  },
  {
    icon: GitBranch,
    title: "GitHub push-to-publish",
    body: "Connect a repo and every push builds and publishes a new version of your prototype.",
  },
  {
    icon: Palette,
    title: "Your design system",
    body: "Import tokens and components so every prototype looks like your product.",
  },
  {
    icon: LayoutGrid,
    title: "Canvas and visual edits",
    body: "See every screen and device size side by side, and edit text and styles in place.",
  },
  {
    icon: Sparkles,
    title: "Variants",
    body: "Build two or three directions at once and keep the one that works.",
  },
  {
    icon: Smartphone,
    title: "iPhone and Android apps",
    body: "Review and comment on prototypes from your phone, with pins in the right place.",
  },
];

export function Features() {
  return (
    <section
      aria-labelledby="features-heading"
      className="mx-auto max-w-6xl px-6 py-20"
    >
      <h2
        id="features-heading"
        className="font-display text-4xl font-bold tracking-tight"
      >
        Everything a prototype needs to get to yes
      </h2>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <li
            key={title}
            className="rounded-3xl border border-stone-200 bg-card p-6"
          >
            <Icon className="size-5 text-raspberry-700" aria-hidden="true" />
            <h3 className="mt-3 text-[17px] font-bold">{title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-stone-600">
              {body}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Faq() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="mx-auto max-w-3xl scroll-mt-20 px-6 pb-20 pt-6"
    >
      <h2
        id="faq-heading"
        className="mb-6 font-display text-3xl font-bold tracking-tight"
      >
        Questions
      </h2>
      <div className="space-y-3">
        {HOME_FAQ.map((f) => (
          <details
            key={f.q}
            className="group rounded-2xl border border-stone-200 bg-card px-5 py-4 [&_summary::-webkit-details-marker]:hidden"
          >
            <summary className="flex min-h-7 cursor-pointer list-none items-center justify-between gap-4 font-semibold">
              {f.q}
              <span
                aria-hidden="true"
                className="text-xl leading-none text-stone-400 transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-3 text-[15px] leading-relaxed text-stone-600">
              {f.a}
            </p>
          </details>
        ))}
      </div>
      <p className="mt-5 text-[15px]">
        <Link
          href="/faq"
          className="font-semibold text-raspberry-700 hover:underline"
        >
          See all questions
        </Link>
      </p>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-20">
      <div className="rf-light-palette flex flex-wrap items-center justify-between gap-6 rounded-[2.5rem] bg-gradient-to-br from-ember-600 via-raspberry-600 to-violet-600 px-10 py-14 text-white">
        <h2 className="max-w-xl font-display text-4xl font-bold leading-tight">
          Your next review round starts with a sentence.
        </h2>
        <a
          href="/#signup"
          className="rounded-full bg-white px-7 py-4 text-base font-bold text-raspberry-800 hover:bg-white/90"
        >
          Start free
        </a>
      </div>
    </section>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-stone-200">
      <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4 px-6 py-8 text-sm text-stone-500">
        <span>© {new Date().getFullYear()} Hearth Software LLC</span>
        <nav aria-label="Footer" className="flex flex-wrap gap-5">
          <Link href="/pricing" className="hover:text-stone-900">
            Pricing
          </Link>
          <Link href="/faq" className="hover:text-stone-900">
            FAQ
          </Link>
          <Link href="/privacy" className="hover:text-stone-900">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-stone-900">
            Terms
          </Link>
          <a
            href="mailto:support@hearthapps.com"
            className="hover:text-stone-900"
          >
            Contact
          </a>
          <Link href="/login" className="hover:text-stone-900">
            Sign in
          </Link>
        </nav>
      </div>
    </footer>
  );
}
