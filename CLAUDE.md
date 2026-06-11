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

## Authentication

The app requires sign-in (Supabase Auth, email/password). All data stays shared across everyone who's logged in — auth is purely a login gate, not per-user data partitioning.

- `src/lib/auth.js` wraps `signIn`, `signOut`, `getSession`, `onAuthStateChange`.
- In `App()`, `session` state is `undefined` (still checking) → loading screen, `null` (signed out) → `<LoginScreen />`, or the session object → normal app. The `loadAll()` polling effect is gated on `session` being truthy.
- `SetupView` renders an `AccountCard` showing the signed-in email with a Sign Out button.
- There's no self-service signup or password reset. The farm admin creates/removes/resets crew accounts in the Supabase Dashboard (Authentication → Users) — see README "Create logins for your crew".
- `kv_storage`'s RLS policy requires `auth.role() = 'authenticated'` (see `supabase/schema.sql`). The `notify` Edge Function uses the service role key and bypasses RLS, so it's unaffected.

## Push notifications

`src/lib/push.js` registers `public/sw.js` as a service worker and manages each device's subscription (stored at `push:<deviceId>`). `broadcastPush()` calls the `notify` Edge Function (`supabase/functions/notify/index.ts`) to actually send pushes via VAPID/web-push.

- **Crew activity** (set started/completed) — triggered directly from `App.jsx` via `broadcastPush()`.
- **Set timer done**, **section due to water**, and **daily reminders** — handled by the `notify` function's `check` action, which is meant to run every 10 minutes via `pg_cron` (see the "Push notification scheduling" block in `supabase/schema.sql`). It mirrors `migrateConfig`/`computeNextSets` from `App.jsx`, so keep that logic in sync if the schedule model changes.
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
