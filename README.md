# Irrigation Tracker

A field irrigation tracking app for furrow-irrigated corn farms. Tracks irrigation sets, advance times, growth stages, scouting points, reminders, photos, and crew notes. Designed for shared access across a small crew on mobile devices.

This is the production version of the app, ready to deploy on Vercel with a Supabase backend.

---

## Where things stand

✅ The app code is built, tested, and already pushed to GitHub (`cskeem15-bot/Flow-and-Grow-`).

Two things left, about 15 minutes total:

1. **Set up your database** (Supabase) — 10 min
2. **Put the app online** (Vercel) — 5 min

After that, it just runs — no more setup.

---

## Step 1 — Set up your database (Supabase)

Supabase is your free database. This is what stores all your irrigation data.

1. Go to **https://supabase.com** and sign up (free, no credit card)
2. Click **New Project**
   - Name: `irrigation-tracker`
   - Database password: make one up and save it somewhere safe
   - Region: pick **West US (North California)** or **West US 2 (Washington)** for Utah
   - Plan: **Free**
3. Wait 2–3 minutes while it provisions
4. Click **SQL Editor** → **New query**
5. Open `supabase/schema.sql` from this project, copy its entire contents, paste into the SQL editor, and click **Run**. You should see "Success. No rows returned." — that's correct.
6. Click **Settings** (gear icon) → **API**, and copy two things:
   - **Project URL** (`https://xxxxxxx.supabase.co`)
   - **anon public key** (starts with `eyJ...`)

Keep these two values handy for Step 2.

> **Want to test on your computer first?** Run `cp .env.example .env`, paste your two Supabase values into `.env`, then `npm run dev` and open `http://localhost:5173`. Totally optional — Vercel works fine without this.

---

## Step 2 — Put the app online (Vercel)

1. Go to **https://vercel.com** and sign in with your GitHub account
2. Click **Add New → Project**
3. Find **Flow-and-Grow-** and click **Import** (Vercel auto-detects all the build settings — leave them as-is)
4. Under **Environment Variables**, add:
   - `VITE_SUPABASE_URL` = (your Supabase Project URL)
   - `VITE_SUPABASE_ANON_KEY` = (your Supabase anon key)
5. Click **Deploy** and wait 1–2 minutes
6. Open the URL Vercel gives you (e.g. `flow-and-grow-xyz.vercel.app`) — the app is live

---

## Optional — Add to your phone's home screen

On iPhone:
1. Open the Vercel URL in Safari
2. Tap the **Share** button → **Add to Home Screen**
3. Name it "Irrigation" and tap Add

It now lives on your home screen like a real app. Send the link to your crew so they can do the same.

---

## Optional — Custom domain

If you want `irrigation.yourfarm.com` instead of the Vercel URL:

1. Buy a domain from **Cloudflare** (cheapest, ~$10/year) or Namecheap
2. In Vercel → your project → **Settings → Domains**, paste your domain
3. Vercel tells you what DNS records to add at your registrar
4. Wait 30 min for DNS to propagate

---

## Day-to-day usage

You won't need to touch any of this again. The app just runs.

When you want to make changes:
1. Edit the code locally
2. Commit and push to GitHub: `git add . && git commit -m "describe change" && git push`
3. Vercel auto-deploys within 60 seconds

When you want to look at your data directly:
- Supabase → Table Editor → `kv_storage`

When something breaks:
- Open Claude Code in the project folder and describe the problem

---

## Troubleshooting

**"The app loads but shows errors when I try to do anything."**
Check that `schema.sql` was run in Supabase, and that `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are set correctly (in `.env` for local, or in Vercel → Settings → Environment Variables for the live site).

**"It works locally but not on Vercel."**
Most likely the environment variables aren't set in Vercel. Go to your Vercel project → Settings → Environment Variables → make sure both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set, then redeploy.

**"Data is shared between everyone — what if I want separate fields/users?"**
The current setup is intentionally simple: one farm, one database, shared between crew. If you ever need multi-farm support or per-user logins, that's a future upgrade — Supabase has full auth built in.

**"How do I back up my data?"**
Supabase → Database → Backups. Free plan keeps daily backups for 7 days. You can also export the `kv_storage` table as CSV anytime from the Table Editor.

**"How much does this cost?"**
- Supabase free tier: 500 MB database, plenty for years of irrigation data
- Vercel free tier: 100 GB bandwidth/month, way more than you'll use
- Domain (optional): ~$10/year
- **Total realistic cost: $0–10/year**

---

## What's where in the code

If you want to make changes:

- `src/App.jsx` — the entire app (all UI, all logic, ~3,600 lines)
- `src/lib/storage.js` — the Supabase adapter (translates app storage calls to database queries)
- `src/main.jsx` — entry point (probably won't touch)
- `src/index.css` — global styles (probably won't touch)
- `supabase/schema.sql` — database structure
- `tailwind.config.js`, `postcss.config.js`, `vite.config.js` — build configs (don't touch)

The vast majority of changes will be in `App.jsx`. Just ask Claude Code: *"In App.jsx, change X to do Y."*

---

## Questions to ask Claude Code when stuck

Copy and paste any of these as needed:

- *"Walk me through running this app locally for the first time. I have Node installed."*
- *"My .env file isn't being read. Help me debug."*
- *"I added a new feature in App.jsx and it broke. Here's the error: [paste error]"*
- *"I want to add a new tab to the bottom navigation. Walk me through it."*
- *"Show me what's in the kv_storage table in Supabase using their SQL editor."*

You don't need to be a developer to make changes — Claude Code is your developer.
