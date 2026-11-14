import Link from "next/link";
import { FinalCta, MarketingFooter, MarketingHeader } from "./Sections";

/** Layout for Privacy and Terms: a readable column with a table of contents. */
export function LegalPage({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  /** "November 14, 2026" */
  updated: string;
  intro: React.ReactNode;
  sections: { id: string; title: string; body: React.ReactNode }[];
}) {
  return (
    <div className="min-h-screen">
      <MarketingHeader />
      <main className="mx-auto max-w-3xl px-6 pb-20 pt-14">
        <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
          {title}
        </h1>
        <p className="mt-3 text-sm text-stone-500">Last updated {updated}</p>
        <div className="legal mt-8">{intro}</div>
        <nav
          aria-label="On this page"
          className="mt-8 rounded-3xl border border-stone-200 bg-card p-5"
        >
          <p className="text-[13px] font-bold uppercase tracking-[.08em] text-stone-500">
            On this page
          </p>
          <ol className="mt-3 grid gap-x-6 gap-y-1.5 text-[15px] sm:grid-cols-2">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="text-raspberry-700 hover:underline"
                >
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        {sections.map((s, i) => (
          <section
            key={s.id}
            id={s.id}
            aria-labelledby={`${s.id}-h`}
            className="legal mt-10 scroll-mt-36 sm:scroll-mt-24"
          >
            <h2
              id={`${s.id}-h`}
              className="font-display text-2xl font-bold tracking-tight"
            >
              {i + 1}. {s.title}
            </h2>
            {s.body}
          </section>
        ))}
        <p className="legal mt-12 border-t border-stone-200 pt-6">
          Questions about this page? Email{" "}
          <a href="mailto:support@hearthapps.com">support@hearthapps.com</a>.
          See also our{" "}
          {title === "Privacy Policy" ? (
            <Link href="/terms">Terms of Service</Link>
          ) : (
            <Link href="/privacy">Privacy Policy</Link>
          )}{" "}
          and <Link href="/faq">FAQ</Link>.
        </p>
      </main>
      <FinalCta />
      <MarketingFooter />
    </div>
  );
}
