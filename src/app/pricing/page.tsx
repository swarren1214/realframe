import type { Metadata } from "next";
import {
  Faq,
  FinalCta,
  MarketingFooter,
  MarketingHeader,
} from "@/components/marketing/Sections";
import { Pricing } from "@/components/marketing/Pricing";

export const metadata: Metadata = {
  title: "Pricing · Realframe",
  description:
    "Free, Pro and Team plans. Reviewers are free on every plan, failed builds are never billed, and annual plans get two months free.",
  alternates: { canonical: "https://realframe.app/pricing" },
};

export default function PricingPage() {
  return (
    <div className="min-h-screen">
      <MarketingHeader />
      <main>
        <Pricing heading="h1" />
        <Faq />
        <FinalCta />
      </main>
      <MarketingFooter />
    </div>
  );
}
