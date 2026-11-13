# Realframe

Prompt a working prototype, publish it to an invite-only link, and collect pinned comments from reviewers.

This is the v1 core loop:

1. Magic-link sign-in (Supabase Auth)
2. Prompt Claude → a self-contained HTML prototype, saved as a numbered version
3. Iterate with follow-up prompts; restore any earlier version
4. Publish a version to `/p/<slug>` with **invite-only** or **anyone with the link (view only)** access
5. Invited reviewers sign in with their email and leave pinned, threaded comments, live-updated over Supabase Realtime

Canvas, visual editing, billing and variants are planned for later.

## Stack

- Next.js 16 (App Router, `src/proxy.ts` for session refresh), React 19, Tailwind 4
- Supabase: Postgres + RLS, Auth (magic link), Realtime
- Anthropic API (`claude-sonnet-5-5` by default) for code generation
- Vercel for hosting

## How it's secured

- Every read and write goes through the signed-in user's Supabase session. There is **no service-role key** in the app.
- Row-level security derives access from `project_role(project_id)`: `owner`, `editor`, `commenter`, `viewer`, `public` (anyone-with-link on a published project, live version only), or none.
- Invites are rows in `project_members` keyed by email. When the invited person signs in, a trigger links their account to the invite.
- Prototypes render in an `<iframe srcdoc>` with `sandbox="allow-scripts allow-forms allow-popups allow-modals"` and **no** `allow-same-origin`, so prototype code runs in an opaque origin and can't read Realframe's cookies, storage or DOM. Comment pins are drawn by a small injected script that talks to the parent over `postMessage`.

## Environment variables

| Name | Where | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel (all envs) | `https://sezaqrjqeyrxoeanqbdt.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel (all envs) | Supabase → Project Settings → API keys (publishable) |
| `ANTHROPIC_API_KEY` | Vercel (all envs), **secret** | console.anthropic.com → API keys |
| `REALFRAME_CODEGEN_MODEL` | optional | Defaults to `claude-sonnet-5-5` |

Copy `.env.example` to `.env.local` for local development.

## Supabase setup

The schema lives in `supabase/migrations/0001_init.sql` and has already been applied to the `realframe` project.

In the Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL**: your production URL, e.g. `https://realframe.vercel.app`
- **Redirect URLs**: add
  - `https://realframe.vercel.app/auth/callback`
  - `https://*-stephen-warren-s-projects.vercel.app/auth/callback` (preview deployments)
  - `http://localhost:3000/auth/callback` (local)

**Email:** Supabase's built-in email sender only delivers to members of your Supabase organization and is heavily rate-limited. Before inviting outside reviewers, set up custom SMTP (Authentication → Emails → SMTP settings), e.g. Resend (`smtp.resend.com`, port 465, user `resend`, password = Resend API key) with a verified sending domain.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev
```

## Project layout

```
src/
  proxy.ts                         session refresh on every request
  lib/ai.ts                        system prompt + Claude call + response parsing
  lib/agent.ts                     script injected into prototypes (pins, comment clicks)
  lib/supabase/{server,client}.ts  Supabase clients
  components/PrototypeFrame.tsx    sandboxed iframe + postMessage bridge
  app/page.tsx                     landing + sign-in
  app/auth/callback/route.ts       magic-link exchange
  app/projects/                    project list, server actions
  app/projects/[id]/Studio.tsx     prompt, preview, versions, share, comments
  app/api/projects/[id]/generate   POST: prompt → new version
  app/p/[slug]/                    reviewer page with pinned comments
supabase/migrations/0001_init.sql  schema, RLS, RPCs, realtime
```

## Deploy

```bash
rm -rf node_modules && npm install          # node_modules was installed on Linux; reinstall on your Mac
ANTHROPIC_API_KEY=sk-ant-... ./scripts/deploy.sh
```

The script links the folder to a `realframe` project in the `stephen-warren-s-projects` Vercel team, sets the four environment variables (the Anthropic key as sensitive), and runs a production deploy. After the first deploy, add the production URL to Supabase's Auth URL configuration (see above).
