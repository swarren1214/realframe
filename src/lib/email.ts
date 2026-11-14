import "server-only";

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
  role: "admin" | "member";
  url: string;
}) {
  const team = esc(opts.teamName);
  const inviter = esc(opts.inviter);
  const role = opts.role === "admin" ? "an admin" : "a member";
  const subject = `${opts.inviter} invited you to ${opts.teamName} on Realframe`;
  const text = `${opts.inviter} invited you to join ${opts.teamName} on Realframe as ${role}.\n\nAccept or decline: ${opts.url}\n\nSign in with ${opts.to} to see the invite. If you weren't expecting it, you can ignore this email.`;
  const html = `<!doctype html><html><body style="margin:0;background:#fffbf7;font-family:Inter,-apple-system,Segoe UI,sans-serif;color:#1c1917">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e7e5e4;border-radius:24px;padding:32px">
<tr><td>
<div style="display:inline-block;width:32px;height:32px;border-radius:11px;background:linear-gradient(135deg,#c2410c,#be185d 55%,#7c3aed)"></div>
<h1 style="margin:20px 0 8px;font-size:20px;line-height:1.3">Join ${team} on Realframe</h1>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#57534e">${inviter} invited you as ${role}. Teammates share prototypes, devices and design systems.</p>
<a href="${esc(opts.url)}" style="display:inline-block;background:linear-gradient(135deg,#c2410c,#be185d);color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:999px">See the invite</a>
<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#78716c">Sign in with ${esc(opts.to)} to accept or decline. If you weren't expecting this, you can ignore it.</p>
</td></tr></table></td></tr></table></body></html>`;
  return send(opts.to, subject, html, text);
}
