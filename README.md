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
| `REALFRAME_PLANNER_MODEL` | optional | Model that breaks big requests into steps. Defaults to `claude-haiku-5-5` (rates via `REALFRAME_PLANNER_INPUT_USD_PER_MTOK` / `..._OUTPUT_...`, default 1 / 5) |
| `SUPABASE_SECRET_KEY` | Vercel (all envs), **secret** | Supabase → Project Settings → API keys (secret). Server-only: Stripe webhook and usage bookkeeping |
| `STRIPE_SECRET_KEY` | Vercel, **secret** | Stripe → Developers → API keys (`sk_test_…` in the sandbox) |
| `STRIPE_WEBHOOK_SECRET` | Vercel, **secret** | Signing secret of the `/api/stripe/webhook` endpoint |
| `STRIPE_PRO_PRICE_ID` | optional | Defaults to the sandbox Pro price; set the live price ID when going live |
| `STRIPE_USAGE_PRODUCT_ID` | optional | Defaults to the sandbox "Realframe AI usage" product |
| `REALFRAME_INPUT_USD_PER_MTOK` / `REALFRAME_OUTPUT_USD_PER_MTOK` | optional | Model prices used to cost each build (default 3 / 15) |

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

## Prototype addresses and review links

- Every prototype is served at `https://<slug>.realframe.app` (the slug is editable in the Share panel) as well as `/p/<slug>`. `src/proxy.ts` rewrites subdomain roots to `/p/<slug>`; other subdomain paths redirect to `www`.
- Requires the wildcard domain `*.realframe.app` on the Vercel project, and `https://*.realframe.app/auth/callback` in Supabase's redirect URLs. Session cookies are scoped to `.realframe.app` so one sign-in covers every subdomain.
- Access modes: invite-only (sign in), password (no account: guests enter the password and a name, get a signed 30-day cookie, see the whole discussion and can comment if allowed), and public view-only.
- Password hashes live in `project_secrets` (bcrypt via pgcrypto, no client access); `check_project_password` is service-role only.
- `NEXT_PUBLIC_ROOT_DOMAIN` overrides `realframe.app`.

## Canvas, variants and visual editing

- **Variants:** pick 2 or 3 in the prompt box; each is built in a different design direction and costs one build. Keep one to make it the next version.
- **Visual editing:** "Edit visually" in the studio or canvas. Static elements are tagged with stable `data-rf` ids and edited in place; script-rendered elements get rules in `<style data-rf-edits>`. Saving creates a version with source `edit`.
- **Canvas (Pro):** `/projects/<id>/canvas`, live frames per screen and device size, saved in `canvas_frames`.

## Plans and billing

- **Free:** 30 builds per calendar month (UTC).
- **Pro:** $20/month through Stripe Checkout. Includes $10 of AI usage per billing period; usage beyond that is billed at cost + 50%. When Stripe drafts each renewal invoice (`invoice.created`), the webhook adds one "AI usage" line for the period that just ended. A 150-builds-per-24h safety cap applies.
- Each build's model cost is recorded server-side in `generations.cost_micros` / `billed_micros` (micro-USD). Plan constants live in `public.plan_settings()`; per-user overrides go in `profiles.build_limit_override`.
- Stripe webhook events: `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.created`.

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
  lib/plan.ts                      planner: splits a request into ordered steps, and the per-step prompt
  lib/plan-runs.ts                 planned-build bookkeeping (build_runs): save, settle cost, post summary
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

## Native apps (iOS + Android)

The apps live in `apps/ios` (SwiftUI, iOS 26+) and `apps/android` (Kotlin + Jetpack Compose). Both sign in with Supabase Auth (email + 6-digit code) and call the versioned API.

- **API:** `src/app/api/v1/*`, served at `https://api.realframe.app/v1/...` (`src/proxy.ts` rewrites it) and at `/api/v1` on the main host. Requests carry `Authorization: Bearer <Supabase access token>`; cookies are never read. Spec: `docs/api/openapi.yaml`.
- **Shared logic:** project operations (publish, access, invites, rename) live in `src/lib/services/projects.ts` and are used by both the server actions and `/v1`.
- **Builds from the apps run in the background** (`after()`): `POST /v1/projects/:id/builds` returns a build id at once, and the app polls `GET /v1/builds/:id`.
- **Prototypes in the apps:** `GET /v1/versions/:id/document` returns the HTML with the pin agent plus a native bridge. The apps load it with no base URL, so prototype code runs in an opaque origin.
- **Setup:** apply `supabase/migrations/0016_native_apps.sql`, add `api.realframe.app` to the Vercel project's domains, and re-upload `supabase/templates/*.html` (they now include `{{ .Token }}` for the app's code sign-in).

See `apps/ios/README.md` and `apps/android/README.md` to run each app.

## Planned builds

Prompts in the Studio go through a plan-then-build loop instead of one big generation:

1. `POST /api/projects/[id]/plan` claims one build, asks the planner model for 1–6 ordered steps, and stores the run in `build_runs`. Short single-line edits skip the planner and run as one step.
2. The steps run on the server (`src/lib/plan-runner.ts`). Each step runs in its own background call (`POST /api/plan-runs/step`, signed with an HMAC key, answered at once, built in `after()`) with the full 300 s limit, builds on the document the previous step produced, then starts the next step. The Studio only watches the run's row in `build_runs` (status, steps, `progress_chars`), so closing the page, locking the phone or losing the connection doesn't stop the build. Reopening the prototype picks the progress up again.
3. The last step saves one version (`create_run_version`, attributed to the person who started the run) and settles the build with the summed tokens and cost (planner + every step). The chat gets a per-step summary.

If a hand-off between steps is lost, the run is started again: by the Studio when it sees no progress for 45 s (`POST /api/projects/[id]/plan/[runId]`), or by the sweeper cron. Taking a step is a conditional update, so a step never runs twice. Runs with no progress for 15 minutes are settled by `sweep_stale_work`.

If a step fails after earlier ones succeeded, the finished steps are saved as a version. **Stop** in the Studio (`DELETE` on the same route) settles the run between steps, or asks the building step to stop; finished steps are kept and the step in progress isn't charged. Variants still use the single-pass `/variants` route.

- **Setup:** apply `supabase/migrations/0020_build_plans.sql` and `0033_background_plan_runs.sql`. On preview deployments with Vercel deployment protection, set `VERCEL_AUTOMATION_BYPASS_SECRET` so steps can call the next one.

### Chat

Every chat message goes through one fast model call (`respondOrPlan` in `src/lib/plan.ts`, the planner model) that sees the current prototype and the recent chat, and either **answers** (questions, ideas, feedback, discussion: posted to the chat, nothing changes, no build is used) or **plans a build**. When a build request leans on the chat ("yes, do that"), the run gets the request restated so it stands on its own. If the call fails, the message is treated as a build.

### Check and fix

Every planned build ends with a **Check and fix** step (`src/lib/qa`). The result is opened in real Chromium inside a Vercel Sandbox (the prototype's code never runs on our servers), phone-sized and framed exactly as the Studio shows it. Every `#/` screen is visited and every control tapped. Reported problems:
- errors, failed loads and blank screens
- links that leave the prototype
- controls that do nothing
- sideways scrolling

If anything turns up, the builder gets one pass to fix it, and the chat summary says what was checked and fixed. If the sandbox can't run, or the fix doesn't land, the build is saved as built with a note.

- `REALFRAME_QA=off` turns the step off.
- `REALFRAME_QA_SNAPSHOT_ID` (from `npx tsx scripts/qa-snapshot.mts`) starts checks from a snapshot with the browser installed. Without it, each check installs the browser first, which takes about 15 s.

