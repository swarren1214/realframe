import type { Metadata } from "next";
import {
  FinalCta,
  MarketingFooter,
  MarketingHeader,
} from "@/components/marketing/Sections";
import { FAQ_GROUPS } from "@/components/marketing/faq-content";

export const metadata: Metadata = {
  title: "FAQ · Realframe",
  description:
    "Answers about building prototypes, sharing and review rounds, plans and billing, and privacy on Realframe.",
  alternates: { canonical: "https://realframe.app/faq" },
};

export default function FaqPage() {
  const all = FAQ_GROUPS.flatMap((g) => g.items);
  // Structured data so search engines can show the answers.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: all.map((i) => ({
      "@type": "Question",
      name: i.q,
      acceptedAnswer: { "@type": "Answer", text: i.a },
    })),
  };
  return (
    <div className="min-h-screen">
      <MarketingHeader />
      <main className="mx-auto max-w-3xl px-6 pb-20 pt-14">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />
        <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
          Questions
        </h1>
        <p className="mt-3 text-lg text-stone-600">
          Can&apos;t find what you need? Email{" "}
          <a
            href="mailto:support@hearthapps.com"
            className="text-raspberry-700 underline underline-offset-2"
          >
            support@hearthapps.com
          </a>
          .
        </p>
        <nav aria-label="Topics" className="mt-6 flex flex-wrap gap-2">
          {FAQ_GROUPS.map((g) => (
            <a
              key={g.id}
              href={`#${g.id}`}
              className="min-h-11 content-center rounded-full bg-stone-100 px-4 text-sm font-medium text-stone-700 hover:bg-stone-200"
            >
              {g.title}
            </a>
          ))}
        </nav>
        {FAQ_GROUPS.map((g) => (
          <section
            key={g.id}
            id={g.id}
            aria-labelledby={`${g.id}-h`}
            className="mt-12 scroll-mt-36 sm:scroll-mt-24"
          >
            <h2
              id={`${g.id}-h`}
              className="mb-4 font-display text-2xl font-bold tracking-tight"
            >
              {g.title}
            </h2>
            <div className="space-y-3">
              {g.items.map((f) => (
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
          </section>
        ))}
      </main>
      <FinalCta />
      <MarketingFooter />
    </div>
  );
}
