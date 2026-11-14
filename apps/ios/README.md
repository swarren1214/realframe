# Realframe for iOS

SwiftUI app for iOS 26+ (Liquid Glass). It signs in with Supabase Auth and gets its data from
the Realframe API at `api.realframe.app/v1` (see `docs/api/openapi.yaml`).

## Run it

1. `brew install xcodegen` (once).
2. Create `apps/ios/Config/Config.local.xcconfig` (git-ignored):
   ```
   RF_SUPABASE_PUBLISHABLE_KEY = <Supabase publishable key>
   // Optional, to use your local Next.js server from the simulator:
   // RF_API_BASE_URL = http:/$()/localhost:3000/api/v1
   ```
3. `cd apps/ios && xcodegen && open Realframe.xcodeproj`
4. Pick your team under Signing & Capabilities and run.

`Realframe.xcodeproj` is generated from `project.yml`. Don't commit it; change `project.yml` instead.

## Sign-in

Email plus a 6-digit code (`signInWithOTP` then `verifyOTP`). For the code to arrive, the
Supabase magic-link email template must include `{{ .Token }}` (see `supabase/templates/`).

## What's here

| Folder | What it does |
| --- | --- |
| `Core` | Config, theme, models, the `/v1` client (`API.swift`) |
| `Auth` | Session state and the code sign-in screen |
| `Projects` | Project list, filters, search, new prototype |
| `Studio` | Prompt history, live build progress (polls `/v1/builds/:id`), composer |
| `Review` | Full-screen prototype in a `WKWebView` with pinned comments and threads |
| `Share` | Review link, publish, access mode, invites |
| `Account` | Plan, builds left, sign out |

## How prototypes are shown

`ReviewView` loads `/v1/versions/:id/document`: the version's HTML with the same pin agent the web
app injects plus a small bridge. It's loaded with `loadHTMLString(_, baseURL: nil)` and a
non-persistent data store, so prototype code runs in an opaque origin with no access to the app's
session. The agent talks to Swift through the `rf` script message handler; Swift answers with
`window.postMessage({ type: "rf:mode" | "rf:pins" }, "*")`.

## Not done yet

Push notifications (APNs), the Inbox, Sign in with Apple, in-app account deletion, version
history and restore, imported (bundle) apps, the bundled Space Grotesk font, and an app icon.
