import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/marketing/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy · Realframe",
  description:
    "What Realframe collects, why, who processes it, and how to access or delete your data.",
  alternates: { canonical: "https://realframe.app/privacy" },
};

const CONTACT = "support@hearthapps.com";
const mail = <a href={`mailto:${CONTACT}`}>{CONTACT}</a>;

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="November 14, 2026"
      intro={
        <>
          <p>
            Realframe is made by Hearth Software LLC (“we”, “us”). This policy
            explains what we collect when you use realframe.app, the review
            links it publishes and the Realframe mobile apps, why we collect it,
            and the choices you have.
          </p>
          <p>
            <strong>The short version:</strong> we collect what we need to run
            Realframe for you. We don&apos;t sell your data, we don&apos;t show
            ads, we don&apos;t use third-party analytics or tracking, and we
            don&apos;t use your work to train AI models.
          </p>
        </>
      }
      sections={[
        {
          id: "collect",
          title: "What we collect",
          body: (
            <>
              <h3>You give us</h3>
              <ul>
                <li>
                  <strong>Account details:</strong> your email address, and the
                  display name and profile photo you choose to add.
                </li>
                <li>
                  <strong>Your work:</strong> prompts, prototypes and every
                  version of them, files and folders you import, design systems,
                  device settings, and canvas layouts.
                </li>
                <li>
                  <strong>Comments and reviews:</strong> comments, replies,
                  where they&apos;re pinned, and review decisions. If you
                  comment as a guest on a password link, the name you enter is
                  stored with your comment.
                </li>
                <li>
                  <strong>Teams:</strong> the teams you create or join, your
                  role, and the email addresses you invite.
                </li>
                <li>
                  <strong>Messages to us:</strong> anything you send to{" "}
                  {CONTACT}.
                </li>
              </ul>
              <h3>Collected as you use Realframe</h3>
              <ul>
                <li>
                  <strong>Usage and billing records:</strong> each build, its AI
                  token counts, its cost and what was billed; your plan and
                  subscription status.
                </li>
                <li>
                  <strong>Technical logs:</strong> our hosting provider keeps
                  standard request logs, such as IP address, browser type and
                  the pages requested, to run and secure the service.
                </li>
              </ul>
              <h3>From services you connect</h3>
              <ul>
                <li>
                  <strong>Payments:</strong> Stripe processes card payments. We
                  never see or store your full card number; we keep your Stripe
                  customer ID, plan and billing period.
                </li>
                <li>
                  <strong>GitHub:</strong> if you connect a repository, we store
                  which installation and repository you connected and receive
                  its code when you import or push.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: "use",
          title: "How we use it",
          body: (
            <ul>
              <li>
                To provide Realframe: building and hosting your prototypes,
                showing them to the people you share them with, and keeping
                versions and comments.
              </li>
              <li>
                To send the emails the product needs: sign-in links, invites,
                review requests and decisions, and notes when your feedback is
                addressed.
              </li>
              <li>
                To bill you correctly, including AI usage beyond what your plan
                includes.
              </li>
              <li>
                To keep Realframe secure, prevent abuse, fix problems and answer
                your questions.
              </li>
              <li>To meet legal obligations, such as keeping tax records.</li>
            </ul>
          ),
        },
        {
          id: "ai",
          title: "AI and your content",
          body: (
            <>
              <p>
                When you build or change a prototype, we send the information
                needed for that build to Anthropic, which provides the Claude
                models that generate the code. That can include your prompt, the
                current version of the prototype, earlier messages in the
                conversation, your design system, and, when you use Fix from
                feedback, the comments you selected.
              </p>
              <p>
                We don&apos;t use your prompts, prototypes or comments to train
                AI models. Anthropic&apos;s handling of this data is covered by
                its own terms and{" "}
                <a
                  href="https://www.anthropic.com/legal/privacy"
                  rel="noreferrer"
                  target="_blank"
                >
                  privacy policy
                </a>
                .
              </p>
            </>
          ),
        },
        {
          id: "sharing",
          title: "Who we share it with",
          body: (
            <>
              <p>
                <strong>People you share with.</strong> Prototypes are private
                until you publish them. A published prototype is visible to the
                people its access setting allows: invited people, anyone with
                the password, or anyone with the link. Comments on a prototype
                are visible to the people who can comment on it. Your team can
                see the team&apos;s prototypes.
              </p>
              <p>
                <strong>Service providers</strong> that process data for us to
                run Realframe:
              </p>
              <ul>
                <li>Supabase: database, sign-in and file storage</li>
                <li>Vercel: hosting and running builds of imported code</li>
                <li>Anthropic: AI code generation</li>
                <li>Stripe: payments and invoices</li>
                <li>Resend: sending email</li>
                <li>GitHub: only if you connect a repository</li>
              </ul>
              <p>
                We also share information when the law requires it, to protect
                people&apos;s safety or our rights, or as part of a merger or
                sale of the business, in which case this policy continues to
                apply. We don&apos;t sell personal information or share it for
                advertising.
              </p>
            </>
          ),
        },
        {
          id: "cookies",
          title: "Cookies and local storage",
          body: (
            <>
              <p>
                We only use cookies and storage that Realframe needs to work:
              </p>
              <ul>
                <li>sign-in cookies that keep you signed in;</li>
                <li>
                  a cookie that remembers which team workspace you&apos;re in;
                </li>
                <li>
                  a signed cookie that remembers your name and access when you
                  open a password link as a guest;
                </li>
                <li>
                  browser storage for preferences like light or dark mode.
                </li>
              </ul>
              <p>
                We don&apos;t use advertising cookies or third-party analytics.
              </p>
            </>
          ),
        },
        {
          id: "retention",
          title: "How long we keep it",
          body: (
            <p>
              We keep your account and work while your account is open. When you
              delete a prototype, it disappears from Realframe right away and
              its versions and comments are removed from our database; stored
              files such as thumbnails and imported files may remain in storage
              until your account is deleted. When you ask us to delete your
              account, we delete it, its prototypes and their files within 30
              days. Backups held by our providers roll off on their normal
              schedule. We keep billing and tax records as long as the law
              requires.
            </p>
          ),
        },
        {
          id: "choices",
          title: "Your choices and rights",
          body: (
            <>
              <p>You can:</p>
              <ul>
                <li>
                  change your name and photo, and your prototypes&apos; access
                  settings, at any time in Realframe;
                </li>
                <li>
                  ask for a copy of your data, a correction, or deletion of your
                  account, by emailing {mail} from the address on your account;
                </li>
                <li>cancel a paid plan at any time from the billing page.</li>
              </ul>
              <p>
                Depending on where you live, you may have further rights, such
                as to object to or restrict some processing. We&apos;ll respond
                to requests within 30 days and won&apos;t treat you differently
                for making one.
              </p>
            </>
          ),
        },
        {
          id: "security",
          title: "Security",
          body: (
            <p>
              Data is encrypted in transit. Access to prototypes is checked by
              the database itself on every request, passwords for review links
              are stored only as hashes, and sign-in uses one-time email links
              instead of passwords. No system is perfectly secure; if you find a
              security problem, please email {mail}.
            </p>
          ),
        },
        {
          id: "international",
          title: "Where data is stored",
          body: (
            <p>
              Realframe is run from the United States, and our main database is
              hosted there. If you use Realframe from elsewhere, your
              information is transferred to and processed in the United States.
            </p>
          ),
        },
        {
          id: "children",
          title: "Children",
          body: (
            <p>
              Realframe isn&apos;t meant for children under 16, and we
              don&apos;t knowingly collect their information. If you think a
              child has given us personal information, email {mail} and
              we&apos;ll delete it.
            </p>
          ),
        },
        {
          id: "changes",
          title: "Changes to this policy",
          body: (
            <p>
              We&apos;ll update this page when our practices change and change
              the date at the top. If a change is significant, we&apos;ll tell
              you by email or in Realframe before it takes effect. See also our{" "}
              <Link href="/terms">Terms of Service</Link>.
            </p>
          ),
        },
      ]}
    />
  );
}
