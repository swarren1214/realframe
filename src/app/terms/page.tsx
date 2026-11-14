import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/marketing/LegalPage";
import { PLANS } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Terms of Service · Realframe",
  description:
    "The terms for using Realframe: accounts, your content, acceptable use, plans and billing.",
  alternates: { canonical: "https://realframe.app/terms" },
};

const CONTACT = "support@hearthapps.com";
const mail = <a href={`mailto:${CONTACT}`}>{CONTACT}</a>;

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="November 14, 2026"
      intro={
        <p>
          These terms are an agreement between you and Hearth Software LLC
          (“we”, “us”), the company that makes Realframe. They cover
          realframe.app, the review links it publishes, the Realframe mobile
          apps and the Realframe API (together, “Realframe”). By using Realframe
          you agree to them. If you use Realframe for an organization, you agree
          on its behalf and confirm you&apos;re allowed to.
        </p>
      }
      sections={[
        {
          id: "accounts",
          title: "Your account",
          body: (
            <ul>
              <li>You must be at least 16 to use Realframe.</li>
              <li>
                You sign in with links sent to your email, so keep that inbox
                secure. You&apos;re responsible for what happens under your
                account.
              </li>
              <li>
                Give us an email address you control, and tell us at {mail} if
                you think someone else has used your account.
              </li>
            </ul>
          ),
        },
        {
          id: "content",
          title: "Your content",
          body: (
            <>
              <p>
                “Your content” means what you or your team put into Realframe or
                make with it: prompts, prototypes and their code, imported files
                and repositories, design systems, comments and review decisions.
              </p>
              <ul>
                <li>
                  <strong>You own your content.</strong> We don&apos;t claim
                  ownership of it, including prototypes generated for you.
                </li>
                <li>
                  You give us permission to host, copy, process, display and
                  send your content only as needed to run Realframe for you: for
                  example, to generate builds, store versions and show
                  prototypes to the people you share them with. This permission
                  ends when you delete the content, except for copies in backups
                  that roll off on their normal schedule.
                </li>
                <li>
                  We don&apos;t use your content to train AI models and
                  don&apos;t sell it. Our{" "}
                  <Link href="/privacy">Privacy Policy</Link> explains how we
                  handle it.
                </li>
                <li>
                  You&apos;re responsible for having the rights to what you
                  upload, import or ask Realframe to build, and for who you
                  share it with. A prototype published with “anyone with the
                  link” access can be seen by anyone who has the link.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: "ai",
          title: "AI-generated output",
          body: (
            <p>
              Realframe uses AI models to generate code. Output can be wrong,
              incomplete, insecure or similar to output made for others, and it
              isn&apos;t reviewed by us. Prototypes are for exploring and
              reviewing ideas; check generated code before you use it in
              production or rely on it for anything important.
            </p>
          ),
        },
        {
          id: "acceptable-use",
          title: "Acceptable use",
          body: (
            <>
              <p>Don&apos;t use Realframe to:</p>
              <ul>
                <li>break the law or infringe anyone&apos;s rights;</li>
                <li>
                  build pages that impersonate a real person or organization,
                  collect passwords or payment details under false pretenses, or
                  otherwise deceive people;
                </li>
                <li>
                  host or spread malware, or attack, probe or overload any
                  system, including Realframe;
                </li>
                <li>
                  publish content that is sexual content involving minors,
                  harassment, threats, or content that promotes violence or
                  hate;
                </li>
                <li>
                  get around limits, billing or access controls, share accounts
                  to avoid paying for seats, or resell Realframe without our
                  written permission;
                </li>
                <li>
                  scrape Realframe or use it to build a competing product.
                </li>
              </ul>
              <p>
                We may remove content or unpublish prototypes that break these
                rules, and suspend accounts that do so seriously or repeatedly.
              </p>
            </>
          ),
        },
        {
          id: "plans",
          title: "Plans, billing and cancellation",
          body: (
            <>
              <ul>
                <li>
                  <strong>Free</strong> includes {PLANS.free.monthlyBuilds}{" "}
                  builds a month. <strong>Pro</strong> and <strong>Team</strong>{" "}
                  are paid subscriptions, billed monthly or annually in advance.
                  Team is billed per builder; reviewers are free on every plan.
                  Current prices are on our{" "}
                  <Link href="/pricing">pricing page</Link>.
                </li>
                <li>
                  Paid plans include ${PLANS.pro.includedUsdPerMonth} of AI
                  usage a month (per builder on Team). Usage beyond that is
                  billed at our cost plus 50%, at the end of each billing month.
                  Builds that fail aren&apos;t billed.
                </li>
                <li>
                  Subscriptions renew automatically until you cancel. You can
                  cancel any time from the billing page; your plan stays active
                  until the end of the period you&apos;ve paid for, then moves
                  to Free.
                </li>
                <li>
                  Payments are handled by Stripe. Prices don&apos;t include
                  taxes, which are added where required. Payments aren&apos;t
                  refunded for part of a billing period, except where the law
                  requires it.
                </li>
                <li>
                  We may change prices with at least 30 days&apos; notice by
                  email. New prices apply from your next renewal after the
                  notice period.
                </li>
                <li>
                  If a payment fails, we may move your account to Free until
                  it&apos;s paid. Your prototypes stay intact.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: "third-party",
          title: "Other services",
          body: (
            <p>
              Realframe works with services run by others, such as GitHub,
              Stripe and the AI provider that generates builds. Your use of
              those services is covered by their terms. We aren&apos;t
              responsible for them, and features that depend on them may change
              if they do.
            </p>
          ),
        },
        {
          id: "changes-service",
          title: "Changes and availability",
          body: (
            <p>
              We&apos;re always improving Realframe, so features may change or
              be removed. We try to keep Realframe available but don&apos;t
              guarantee it will be uninterrupted or error-free. If we ever shut
              Realframe down, we&apos;ll give at least 30 days&apos; notice so
              you can save your work.
            </p>
          ),
        },
        {
          id: "ending",
          title: "Ending this agreement",
          body: (
            <p>
              You can stop using Realframe and ask us to delete your account at
              any time by emailing {mail}. We may suspend or close accounts that
              break these terms or put Realframe or others at risk; where
              reasonable, we&apos;ll tell you first and give you a chance to
              save your work. Sections that by their nature should survive, such
              as ownership, disclaimers, limits of liability and governing law,
              continue after the agreement ends.
            </p>
          ),
        },
        {
          id: "disclaimers",
          title: "Disclaimers",
          body: (
            <p>
              Realframe is provided “as is” and “as available”. To the extent
              the law allows, we disclaim all warranties, express or implied,
              including merchantability, fitness for a particular purpose and
              non-infringement.
            </p>
          ),
        },
        {
          id: "liability",
          title: "Limitation of liability",
          body: (
            <p>
              To the extent the law allows, we aren&apos;t liable for indirect,
              incidental, special, consequential or punitive damages, or for
              lost profits, revenue or data. Our total liability for any claim
              about Realframe is limited to the greater of what you paid us in
              the 12 months before the claim and US $100. Some places don&apos;t
              allow these limits, so they may not all apply to you.
            </p>
          ),
        },
        {
          id: "indemnity",
          title: "Indemnity",
          body: (
            <p>
              If someone makes a claim against us because of your content or
              your breach of these terms, you agree to cover our reasonable
              costs of dealing with it, to the extent the law allows.
            </p>
          ),
        },
        {
          id: "law",
          title: "Governing law",
          body: (
            <p>
              These terms are governed by the laws of the State of Utah, USA,
              without regard to its conflict-of-laws rules. Disputes will be
              heard in the state or federal courts located in Utah, and you and
              we agree to their jurisdiction. Nothing here limits rights you
              have under the consumer laws of where you live.
            </p>
          ),
        },
        {
          id: "changes",
          title: "Changes to these terms",
          body: (
            <p>
              We may update these terms. We&apos;ll change the date at the top,
              and for significant changes we&apos;ll tell you by email or in
              Realframe at least 14 days before they take effect. If you keep
              using Realframe after that, the new terms apply.
            </p>
          ),
        },
        {
          id: "contact",
          title: "Contact",
          body: (
            <p>
              Hearth Software LLC · {mail}. If any part of these terms
              can&apos;t be enforced, the rest still applies. These terms, with
              the Privacy Policy, are the whole agreement between us about
              Realframe.
            </p>
          ),
        },
      ]}
    />
  );
}
