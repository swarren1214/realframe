# Realframe for Android

Kotlin + Jetpack Compose (Material 3), minSdk 29. It signs in with Supabase Auth (supabase-kt)
and gets its data from the Realframe API at `api.realframe.app/v1` (see `docs/api/openapi.yaml`).

## Run it

1. Copy `local.properties.example` to `local.properties` and set `rf.supabaseKey`. To use your
   local Next.js server from the emulator, set `rf.apiBaseUrl=http://10.0.2.2:3000/api/v1`.
2. Open `apps/android` in Android Studio, or run `./gradlew :app:installDebug`.

## What's here

| File | What it does |
| --- | --- |
| `core/Api.kt` | Supabase client and the `/v1` client |
| `core/Models.kt` | API shapes |
| `ui/theme/Theme.kt` | Raspberry tonal palette and expressive shapes |
| `ui/screens/SignInScreen.kt` | Email + 6-digit code |
| `ui/screens/ProjectsScreen.kt` | Search, filter chips, project cards, New prototype FAB |
| `ui/screens/StudioScreen.kt` | Prompt history, build progress (polls `/v1/builds/:id`), composer |
| `ui/screens/ReviewScreen.kt` | Full-screen prototype in a `WebView`, pins, threads, floating Browse/Comment toolbar |
| `ui/screens/ShareScreen.kt` | Review link, publish, access mode, invites |
| `ui/screens/AccountScreen.kt` | Plan, builds left, sign out; Inbox placeholder |

## How prototypes are shown

`ReviewScreen` loads `/v1/versions/:id/document` with `loadDataWithBaseURL(null, …)`, with file and
content access off. The pin agent reaches Kotlin only through the `RealframeAndroid.post(json)`
interface; Kotlin answers with `window.postMessage({ type: "rf:mode" | "rf:pins" }, "*")`.

## Not done yet

Push notifications (FCM), the Inbox, Google sign-in, in-app account deletion, version history and
restore, imported (bundle) apps, Material 3 Expressive components that are still alpha (floating
toolbar, wavy progress), and a real app icon.
