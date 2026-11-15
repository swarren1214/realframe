import "server-only";
import { roleWithArticle, type TeamRole } from "@/lib/team-shared";

const FROM =
  process.env.INVITE_FROM_EMAIL || "Realframe <realframe@mail.hearthapps.com>";

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

/**
 * Sends an email through Resend. Without RESEND_API_KEY it does nothing and says so, so
 * features that email (invites) still work in the app.
 */
async function send(to: string, subject: string, html: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false as const, reason: "not_configured" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, html, text }),
  });
  if (!res.ok) {
    console.error("resend", res.status, await res.text().catch(() => ""));
    return { sent: false as const, reason: "failed" };
  }
  return { sent: true as const };
}

export async function sendTeamInvite(opts: {
  to: string;
  teamName: string;
  inviter: string;
  role: TeamRole;
  url: string;
}) {
  const team = esc(opts.teamName);
  const inviter = esc(opts.inviter);
  const role = roleWithArticle(opts.role);
  const subject = `${opts.inviter} invited you to ${opts.teamName} on Realframe`;
  const text = `${opts.inviter} invited you to join ${opts.teamName} on Realframe as ${role}.\n\nAccept or decline: ${opts.url}\n\nSign in with ${opts.to} to see the invite. If you weren't expecting it, you can ignore this email.`;
  const html = `<!doctype html><html><body style="margin:0;background:#fffbf7;font-family:Inter,-apple-system,Segoe UI,sans-serif;color:#1c1917">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e7e5e4;border-radius:24px;padding:32px">
<tr><td>
<div style="display:inline-block;width:32px;height:32px;border-radius:11px;background:linear-gradient(135deg,#c2410c,#be185d 55%,#7c3aed)"></div>
<h1 style="margin:20px 0 8px;font-size:20px;line-height:1.3">Join ${team} on Realframe</h1>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#57534e">${inviter} invited you as ${role}. ${opts.role === "reviewer" ? "Reviewers can open, comment on and approve the team's prototypes, free." : "Teammates share prototypes, devices and design systems."}</p>
<a href="${esc(opts.url)}" style="display:inline-block;background:linear-gradient(135deg,#c2410c,#be185d);color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:999px">See the invite</a>
<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#78716c">Sign in with ${esc(opts.to)} to accept or decline. If you weren't expecting this, you can ignore it.</p>
</td></tr></table></td></tr></table></body></html>`;
  return send(opts.to, subject, html, text);
}

/** The shared card layout every Realframe email uses. */
function card(
  title: string,
  body: string,
  cta: { label: string; url: string },
  foot: string,
) {
  return `<!doctype html><html><body style="margin:0;background:#fffbf7;font-family:Inter,-apple-system,Segoe UI,sans-serif;color:#1c1917">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e7e5e4;border-radius:24px;padding:32px">
<tr><td>
<div style="display:inline-block;width:32px;height:32px;border-radius:11px;background:linear-gradient(135deg,#c2410c,#be185d 55%,#7c3aed)"></div>
<h1 style="margin:20px 0 8px;font-size:20px;line-height:1.3">${title}</h1>
<div style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#57534e">${body}</div>
<a href="${esc(cta.url)}" style="display:inline-block;background:linear-gradient(135deg,#c2410c,#be185d);color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:999px">${esc(cta.label)}</a>
<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#78716c">${foot}</p>
</td></tr></table></td></tr></table></body></html>`;
}

const fmtDue = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

export async function sendReviewRequest(opts: {
  to: string;
  requester: string;
  prototype: string;
  version: number;
  note: string | null;
  dueAt: string | null;
  url: string;
}) {
  const due = opts.dueAt ? ` by ${fmtDue(opts.dueAt)}` : "";
  const subject = `${opts.requester} asked you to review ${opts.prototype}${due}`;
  const text = `${opts.requester} asked you to review v${opts.version} of ${opts.prototype}${due}.${opts.note ? `\n\n"${opts.note}"` : ""}\n\nOpen it, leave comments on the screens, then approve it or ask for changes: ${opts.url}\n\nSign in with ${opts.to}. Reviewing on Realframe is free.`;
  const html = card(
    `Review ${esc(opts.prototype)}`,
    `${esc(opts.requester)} asked you to review <strong>v${opts.version}</strong>${esc(due)}.${
      opts.note
        ? `<blockquote style="margin:12px 0 0;padding:10px 14px;border-radius:12px;background:#fdf2f8;color:#44403c">${esc(opts.note)}</blockquote>`
        : ""
    }<p style="margin:12px 0 0">Leave comments on the screens, then approve it or ask for changes.</p>`,
    { label: "Open the prototype", url: opts.url },
    `Sign in with ${esc(opts.to)}. Reviewing on Realframe is free.`,
  );
  return send(opts.to, subject, html, text);
}

export async function sendReviewDecision(opts: {
  to: string;
  reviewer: string;
  prototype: string;
  version: number;
  decision: "approved" | "changes_requested";
  roundStatus: string;
  url: string;
}) {
  const verb =
    opts.decision === "approved" ? "approved" : "asked for changes on";
  const roundLine =
    opts.roundStatus === "approved"
      ? "The review round is approved."
      : opts.roundStatus === "changes_requested"
        ? "The round needs changes."
        : "The round is still waiting on other reviewers.";
  const subject = `${opts.reviewer} ${verb} ${opts.prototype} v${opts.version}`;
  const text = `${opts.reviewer} ${verb} v${opts.version} of ${opts.prototype}. ${roundLine}\n\n${opts.url}`;
  const html = card(
    `${esc(opts.reviewer)} ${verb} v${opts.version}`,
    `<p style="margin:0">${esc(opts.prototype)}: ${roundLine}</p>`,
    { label: "See the feedback", url: opts.url },
    "You're getting this because you requested the review.",
  );
  return send(opts.to, subject, html, text);
}

export async function sendFeedbackAddressed(opts: {
  to: string;
  builder: string;
  prototype: string;
  version: number;
  count: number;
  url: string;
}) {
  const what =
    opts.count === 1 ? "your comment" : `${opts.count} of your comments`;
  const subject = `${opts.builder} addressed ${what} on ${opts.prototype}`;
  const text = `${opts.builder} made v${opts.version} of ${opts.prototype} from ${what}. Take a look and resolve it, or reply if it isn't fixed: ${opts.url}`;
  const html = card(
    `${esc(opts.builder)} addressed ${what}`,
    `<p style="margin:0">v${opts.version} of ${esc(opts.prototype)} was built from ${what}. Take a look, then resolve it or reply if it isn't fixed.</p>`,
    { label: `Open v${opts.version}`, url: opts.url },
    "You're getting this because you commented on this prototype.",
  );
  return send(opts.to, subject, html, text);
}

export type DigestItem = {
  kind: string;
  team_id?: string | null;
  project_id: string | null;
  project: string | null;
  version_id: string | null;
  version: number | null;
  actor: string | null;
  body: string | null;
};

/** One email for everything that happened since the last one. */
export async function sendNotificationDigest(
  opts: Parameters<typeof digestEmail>[0],
) {
  const { subject, html, text } = digestEmail(opts);
  return send(opts.to, subject, html, text);
}

export function digestEmail(opts: {
  to: string;
  name: string | null;
  items: DigestItem[];
  appUrl: string;
  unsubscribeUrl: string;
}) {
  const line = (n: DigestItem) => {
    const who = n.actor || "Someone";
    const v = n.version ? ` v${n.version}` : "";
    const what =
      n.kind === "comment"
        ? `${who} commented on${v}`
        : n.kind === "reply"
          ? `${who} replied on${v}`
          : n.kind === "build_done"
            ? `Build finished${n.version ? `: v${n.version} is ready` : ""}`
            : n.kind === "usage_alert"
              ? "Usage alert"
              : n.kind === "spend_cap"
                ? "Spend cap reached"
                : "A build didn't finish";
    return { what, body: n.kind === "build_failed" ? null : n.body };
  };
  const link = (n: DigestItem) => {
    if (n.kind === "usage_alert" || n.kind === "spend_cap")
      return `${opts.appUrl}/${n.team_id ? "team/billing" : "billing"}?tab=usage`;
    if (!n.project_id) return `${opts.appUrl}/inbox`;
    const q = new URLSearchParams();
    if (n.version_id) q.set("v", n.version_id);
    if (n.kind === "comment" || n.kind === "reply") q.set("tab", "comments");
    return `${opts.appUrl}/projects/${n.project_id}${q.size ? `?${q}` : ""}`;
  };
  // Group by prototype so a busy thread reads as one block.
  const byProject = new Map<string, DigestItem[]>();
  for (const n of opts.items) {
    const k =
      n.kind === "usage_alert" || n.kind === "spend_cap"
        ? "Usage & billing"
        : (n.project ?? "Your prototypes");
    byProject.set(k, [...(byProject.get(k) ?? []), n]);
  }
  const count = opts.items.length;
  const first = [...byProject.keys()][0];
  const subject =
    byProject.size === 1
      ? `${count === 1 ? line(opts.items[0]).what : `${count} updates`} · ${first}`
      : `${count} updates on your prototypes`;

  const html = `<!doctype html><html><body style="margin:0;background:#fafaf9;font-family:Inter,Arial,sans-serif;color:#1c1917">
<div style="max-width:520px;margin:0 auto;padding:28px 20px">
<p style="margin:0 0 18px;font-size:15px">${opts.name ? `Hi ${esc(opts.name.split(" ")[0])},` : "Hi,"} here&rsquo;s what happened on your prototypes.</p>
${[...byProject.entries()]
  .map(
    ([
      project,
      list,
    ]) => `<div style="margin:0 0 16px;padding:16px 18px;background:#fff;border:1px solid #e7e5e4;border-radius:16px">
<p style="margin:0 0 10px;font-size:13px;font-weight:700">${esc(project)}</p>
${list
  .map((n) => {
    const l = line(n);
    return `<p style="margin:0 0 10px;font-size:14px;line-height:1.45"><a href="${link(n)}" style="color:#1c1917;text-decoration:none"><b>${esc(l.what)}</b></a>${l.body ? `<br><span style="color:#57534e">&ldquo;${esc(l.body)}&rdquo;</span>` : ""}</p>`;
  })
  .join("")}
</div>`,
  )
  .join("")}
<p style="margin:20px 0 0"><a href="${opts.appUrl}/inbox" style="display:inline-block;padding:11px 18px;border-radius:999px;background:#be185d;color:#fff;font-size:14px;font-weight:600;text-decoration:none">Open your Inbox</a></p>
<p style="margin:28px 0 0;font-size:12px;color:#78716c">You get at most one of these every 15 minutes. <a href="${opts.appUrl}/welcome?edit=1#notifications" style="color:#78716c">Email settings</a> &middot; <a href="${opts.unsubscribeUrl}" style="color:#78716c">Unsubscribe</a></p>
</div></body></html>`;
  const text = [
    "Here's what happened on your prototypes.",
    "",
    ...[...byProject.entries()].flatMap(([project, list]) => [
      project,
      ...list.map((n) => {
        const l = line(n);
        return `- ${l.what}${l.body ? `: "${l.body}"` : ""}\n  ${link(n)}`;
      }),
      "",
    ]),
    `Inbox: ${opts.appUrl}/inbox`,
    `Unsubscribe: ${opts.unsubscribeUrl}`,
  ].join("\n");
  return { subject, html, text };
}
