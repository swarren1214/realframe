// FAQ answers shared by the home page (a short list) and /faq (everything, grouped).
import { PLANS } from "@/lib/plans";

export type Qa = { q: string; a: string; home?: boolean };

const included = `$${PLANS.pro.includedUsdPerMonth}`;

export const FAQ_GROUPS: { title: string; id: string; items: Qa[] }[] = [
  {
    title: "Getting started",
    id: "getting-started",
    items: [
      {
        q: "What does Realframe make?",
        a: "Real, coded prototypes: working HTML, CSS and JavaScript you can click through on any device, not linked images. You describe what you want, and Realframe builds it and keeps every version.",
      },
      {
        q: "Do I need to know how to code?",
        a: "No. You describe changes in plain language, edit text and styles in place, or pin comments on the screen and fix them in one build. If you do code, you can import files or connect a GitHub repo.",
      },
      {
        q: "Can I bring my own code?",
        a: "Yes. Import a file or folder, or connect a GitHub repo. Pushes to the branch you choose build and publish automatically.",
        home: true,
      },
      {
        q: "Can prototypes use my design system?",
        a: "Yes. Import your tokens and components, and new builds use them so prototypes look like your product.",
      },
    ],
  },
  {
    title: "Sharing and reviewing",
    id: "reviewing",
    items: [
      {
        q: "Who can see my prototypes?",
        a: "Only people you choose. Each published prototype gets its own link that can be invite-only, protected by a password, or view-only for anyone with the link. Unpublished prototypes are private to you and your team.",
      },
      {
        q: "Do reviewers need an account?",
        a: "Invited reviewers sign in with a free account using just their email, with no password to remember. On a password link, guests can comment with only their name.",
      },
      {
        q: "What is a review round?",
        a: "A request for specific people to review one version, optionally by a due date. Each reviewer approves it or asks for changes, and you see who has answered. You choose whether everyone or anyone has to approve.",
      },
      {
        q: "What does “Fix from feedback” do?",
        a: "You pick open comments and Realframe builds the next version from them in one go. Each comment is marked “Addressed in vN” and the people who wrote it are told, so they can check it and resolve it.",
      },
    ],
  },
  {
    title: "Plans and billing",
    id: "billing",
    items: [
      {
        q: "Who needs a paid seat?",
        a: "Only people who build: anyone who prompts, edits or publishes. Reviewers, clients and stakeholders comment and approve for free with an account, or with a password and no account at all.",
        home: true,
      },
      {
        q: "How does AI usage billing work?",
        a: `Pro and each Team builder include ${included} of AI usage every month. Past that, you pay what the model costs us plus 50%, added to your next invoice. A build that fails costs nothing.`,
        home: true,
      },
      {
        q: "Do annual plans include usage every month?",
        a: `Yes. The ${included} allowance resets monthly whether you pay monthly or yearly, and any usage past it is billed at the end of each month.`,
        home: true,
      },
      {
        q: "What does the Free plan include?",
        a: `${PLANS.free.monthlyBuilds} builds a month, unlimited free reviewers, invite-only links, pinned comments and version history. No card needed.`,
      },
      {
        q: "Can I cancel any time?",
        a: "Yes. You keep Pro until the end of the period you paid for, then move to Free with your prototypes intact.",
        home: true,
      },
      {
        q: "Do you offer refunds?",
        a: "Plans aren't refunded for part of a billing period, except where the law requires it. If something went wrong with a charge, email support@hearthapps.com and we'll look into it.",
      },
    ],
  },
  {
    title: "Privacy and security",
    id: "privacy",
    items: [
      {
        q: "Do you train AI models on my work?",
        a: "No. We don't use your prototypes, prompts or comments to train AI models, and we don't sell them. Builds are generated with Anthropic's Claude models through their API.",
      },
      {
        q: "Who owns what I make?",
        a: "You do. You keep the rights to your prompts, prototypes and comments. We only use them to run the service for you.",
      },
      {
        q: "How do I delete my account?",
        a: "Email support@hearthapps.com from the address on your account. We delete your account and its prototypes within 30 days, except billing records we're required to keep.",
      },
    ],
  },
];

export const HOME_FAQ = FAQ_GROUPS.flatMap((g) => g.items).filter(
  (i) => i.home,
);
