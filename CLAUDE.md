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
├── src/
│   ├── App.jsx           ← the entire app, ~3600 lines, single component file
│   ├── main.jsx          ← entry point, attaches storage to window
│   ├── index.css         ← Tailwind + global styles
│   └── lib/
│       └── storage.js    ← Supabase adapter
└── supabase/
    └── schema.sql        ← one-time database setup
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

When making changes to data shape, update the relevant section in App.jsx — there's no separate schema definition outside that file.

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
- "Add user logins" — Supabase has Auth built in; integrate by creating a login screen and adding auth.uid() checks to RLS policies

When the user says "the app is broken," ask them:
1. Are you running locally (`npm run dev`) or on Vercel (the public URL)?
2. What did you click before it broke?
3. Open browser DevTools (or share the URL) and check the Console tab for red errors.
