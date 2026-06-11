# Project context for Claude Code

This is an irrigation tracking app for a Utah corn maze farm. The user is NOT a developer — they're a farmer using Claude Code to help them deploy and maintain a working app. Be patient, explain things in plain English, and prefer doing things FOR them over asking them to do things.

## Stack

- **Frontend:** React 18 + Vite + Tailwind CSS, single-page app
- **Backend:** Supabase (Postgres key-value store via a `kv_storage` table)
- **Hosting:** Vercel (auto-deploys from GitHub main branch)
- **Storage adapter:** `src/lib/storage.js` exposes a `window.storage`-compatible API backed by Supabase, so the main app code in `App.jsx` doesn't need to know about the backend.

## Folder structure

```
.
├── README.md             ← user-facing setup guide
├── CLAUDE.md             ← this file
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── index.html
├── .env                  ← local env (gitignored), user creates from .env.example
├── .env.example
├── .gitignore
├── public/
│   └── sw.js             ← service worker (receives push notifications)
├── src/
│   ├── App.jsx           ← the entire app, single component file
│   ├── main.jsx          ← entry point, attaches storage to window
│   ├── index.css         ← Tailwind + global styles
│   └── lib/
│       ├── storage.js    ← Supabase adapter (also exports the raw `supabase` client)
│       ├── auth.js       ← sign-in/sign-out helpers for the login screen
│       └── push.js       ← push notification helpers (subscribe, broadcast)
└── supabase/
    ├── schema.sql        ← one-time database setup + notification cron
    └── functions/
        └── notify/
            └── index.ts  ← Edge Function that sends push notifications
```

## How the storage works

The app code (`App.jsx`) calls `window.storage.get/set/delete/list(key, shared)`. The shim in `main.jsx` points `window.storage` at the Supabase adapter in `src/lib/storage.js`. The `shared` boolean parameter is ignored — all data is shared since this is a single-farm setup.

Storage keys follow these prefixes:
- `config` — field configuration
- `active` — currently running irrigation set
- `week:YYYY-WW` — irrigation history per ISO week
- `reminders` — crew reminder list
- `daynote:YYYY-MM-DD` — crew log notes per day
- `photo:<id>` — set photos
- `event:<id>` — manual calendar events
- `point:<id>` — scouting monitoring points
- `measurement:<id>` — growth measurements
- `scoutphoto:<id>` — scouting photos
- `push:<deviceId>` — a device's Web Push subscription (JSON), written by `src/lib/push.js`
- `notifystate` — dedup state for the `notify` Edge Function (last reminder date, last "due" notification per set, last timer notification), so it doesn't repeat alerts

When making changes to data shape, update the relevant section in App.jsx — there's no separate schema definition outside that file.

## Watering rotation model

The field runs through its active sections back-to-back, in `order`, each for its own `hours`. There's no per-section watering frequency — instead `config.cycleDays` (default 7) is a single field-wide setting: once every active section has been watered since section #1 (lowest `order`) last finished, the whole field rests until `cycleDays` days after that finish, then the rotation starts over from section #1.

- `computeRotationTimeline(config, lastCompleted, now, untilMs, postponedUntil)` (`src/App.jsx`) generates the forward timeline of `{set, startAt, endAt}` blocks — this is the source of truth for the schedule.
- `computeNextSets()` and `computeProjectedSchedule()` are thin wrappers over it: `computeNextSets()` ranks sections by when the timeline says they next run (used by the "Up Next" card and due badges), `computeProjectedSchedule()` feeds the Plan tab's timeline view.
- `migrateConfig()` fills in `cycleDays: 7` for configs saved before this model existed, and no longer sets a per-section `frequencyDays`.
- The "Days Between Rotations" stepper in Setup edits `config.cycleDays`.
- `supabase/functions/notify/index.ts` mirrors `migrateConfig()` and has its own `checkSectionsDue()` that fires once when a full rotation is done and `cycleDays` (plus any postponement) has elapsed since section #1 finished — keep it in sync if this model changes.

### Postponing watering (rain / wet soil)

`schedule.postponedUntil` (ms timestamp, or `null`) is a single field-wide "don't start anything before this time" floor, set via `setPostponedUntil()` in `App()` and rendered by `PostponeCard` on the Now tab.

- `computeRotationTimeline` clamps its starting cursor to `postponedUntil` when that's later than `now`, which pushes the whole remaining timeline back — so the Plan tab, "Up Next" card, and due badges all reflect the delay automatically.
- It auto-expires: once real time passes `postponedUntil`, it's ignored and the schedule behaves normally again — no need to clear it. `PostponeCard` offers "+1/2/3/5/7 days" presets, a "Custom" date picker (sets `postponedUntil` to midnight local time on the chosen day), "Change Date" to pick a new value while already postponed, and "Resume Now" to clear it early.
- `supabase/functions/notify/index.ts`'s `checkSectionsDue()` also respects `postponedUntil` so the "due to water" push doesn't fire during a postponement.

## Authentication & permissions

The app requires sign-in (Supabase Auth, email/password). All data stays shared across everyone who's approved — auth/approval is a login gate, not per-user data partitioning.

- `src/lib/auth.js` wraps `signIn`, `signUp`, `signOut`, `getSession`, `onAuthStateChange`, plus the `user_status` helpers below.
- In `App()`, `session` state is `undefined` (still checking) → loading screen, `null` (signed out) → `<LoginScreen />`, or the session object → continue to the approval check. The `loadAll()` polling effect is gated on `session` being truthy AND `userStatus?.status === 'approved'`.
- `SetupView` renders an `AccountCard` showing the signed-in email (with an "Admin" badge for admins) and a Sign Out button.

### Self-signup & admin approval

Anyone can create an account from `<LoginScreen />` ("Create one" link, calls `signUp()`). New accounts aren't usable right away:

- `supabase/schema.sql` defines a `user_status` table: `{ id, email, status ('pending'|'approved'|'declined'), is_admin, requested_at, decided_at, decided_by }`, populated by an `on_auth_user_created` trigger (`handle_new_user()`).
- The trigger auto-approves the **first-ever** account as an admin (so a fresh deployment always has someone who can approve others). Every account that existed *before* this feature was added is also backfilled as `status='approved', is_admin=true`. Everyone else starts `status='pending', is_admin=false`.
- In `App()`, after `session` resolves to a user, a `userStatus` state (`undefined`=checking, `null`/`{status:'pending'|'declined'|'approved', is_admin, ...}`) is loaded via `getUserStatus(session.user.id)`. If `userStatus` isn't `approved`, `<AccountStatusScreen />` is shown instead of the app — "waiting for approval" (pending) or "access declined". A polling effect re-checks every 10s while pending so the screen updates automatically once an admin decides.
- `kv_storage`'s RLS policy requires `is_approved()` (a `security definer` SQL function checking `user_status`), not just `auth.role() = 'authenticated'` — see `supabase/schema.sql`. The `notify` Edge Function uses the service role key and bypasses RLS, so it's unaffected.

### Admin vs. standard user

`userStatus.is_admin` is the permission flag. Admins get a `PendingRequestsCard` in `SetupView` (only rendered when `userStatus?.is_admin`) that lists every account via `listAllUsers()`:

- **Pending accounts** get Approve / Decline buttons (`decideUser(id, true|false)`).
- **Approved accounts** (other than yourself) get a "Make Admin" / "Admin" toggle (`setUserAdmin(id, bool)`) to promote/demote other admins.

`user_status` RLS: everyone can read their own row; only approved admins (`is_approved_admin()`) can read all rows or update any row (approve/decline/promote). Standard users see the normal app (Now/Week/Notes/Plan/etc.) but not the Crew Accounts card.

The farm admin can still create/remove/reset crew accounts manually in the Supabase Dashboard (Authentication → Users) if preferred — see README "Create logins for your crew".

## Push notifications

`src/lib/push.js` registers `public/sw.js` as a service worker and manages each device's subscription (stored at `push:<deviceId>`). `broadcastPush()` calls the `notify` Edge Function (`supabase/functions/notify/index.ts`) to actually send pushes via VAPID/web-push.

- **Crew activity** (set started/completed) — triggered directly from `App.jsx` via `broadcastPush()`.
- **Set timer done**, **section due to water**, and **daily reminders** — handled by the `notify` function's `check` action, which is meant to run every 10 minutes via `pg_cron` (see the "Push notification scheduling" block in `supabase/schema.sql`). It mirrors `migrateConfig` and the rotation/cycle logic from `App.jsx` (see "Watering rotation model" above), so keep that logic in sync if the schedule model changes.
- Requires `VITE_VAPID_PUBLIC_KEY` (frontend env var) plus `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` (Edge Function secrets). See README "Step 3 — Turn on notifications".

## Common tasks

**Run locally:**
```bash
npm install
npm run dev
```

**Build for production:**
```bash
npm run build
```

**Deploy:**
- Push to `main` branch on GitHub. Vercel auto-deploys.
- Make sure Vercel has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set in environment variables.

**Debug data:**
- Open Supabase → Table Editor → `kv_storage` to see raw stored values

## Guidance for editing

- `App.jsx` is a single large file. That's intentional — it keeps the whole app readable in one place. Don't aggressively refactor it into many files unless the user asks.
- The app is mobile-first. Test changes at iPhone widths (375px) before desktop.
- Tailwind classes only — there's no CSS-in-JS or separate stylesheet.
- The color palette is intentional (yellow `#FACC15` for actions, lime `#A3E635` for active/done states, dark green-tinted base). Don't change colors without checking with the user.
- All storage writes call `recordWrite()` first to avoid race conditions with polling. Maintain this pattern when adding new write operations.

## What the user might ask

- "Add a feature for X" — edit `App.jsx`, follow existing patterns
- "Why is my data not saving" — check `.env` is set, check Supabase RLS policy is active, check browser console for errors
- "Make it work offline" — would need to add a service worker and IndexedDB caching layer; nontrivial, scope this carefully
- "Add a crew member" / "someone can't log in" — point them to README "Create logins for your crew" (Supabase Dashboard → Authentication → Users)

When the user says "the app is broken," ask them:
1. Are you running locally (`npm run dev`) or on Vercel (the public URL)?
2. What did you click before it broke?
3. Open browser DevTools (or share the URL) and check the Console tab for red errors.
