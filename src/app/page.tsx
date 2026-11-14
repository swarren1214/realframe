import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Faq,
  Features,
  FinalCta,
  Hero,
  HowItWorks,
  MarketingFooter,
  MarketingHeader,
  ReviewLoop,
} from "@/components/marketing/Sections";
import { Pricing } from "@/components/marketing/Pricing";

export const metadata: Metadata = {
  title: "Realframe · Prototype it. Get it reviewed. Fix it in one build.",
  description:
    "Describe a product and Realframe builds a real, coded prototype. Share it privately, run review rounds with approvals, and turn comments into the next version. Reviewers are free.",
  openGraph: {
    title: "Realframe",
    description:
      "Real, coded prototypes with review rounds, approvals and fix from feedback. Reviewers are free.",
    url: "https://realframe.app",
    siteName: "Realframe",
    type: "website",
  },
  alternates: { canonical: "https://realframe.app" },
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // Older links and redirects send people to /?next=… or /?error=…: that's sign-in.
  if (params.next || params.error) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params))
      if (typeof v === "string") q.set(k, v);
    redirect(`/login?${q}`);
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/projects");

  return (
    <div className="min-h-screen">
      <MarketingHeader />
      <main>
        <Hero />
        <HowItWorks />
        <ReviewLoop />
        <Features />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <MarketingFooter />
    </div>
  );
}
