# Irrigation Tracker

A field irrigation tracking app for furrow-irrigated corn farms. Tracks irrigation sets, advance times, growth stages, scouting points, reminders, photos, and crew notes. Designed for shared access across a small crew on mobile devices.

This is the production version of the app, ready to deploy on Vercel with a Supabase backend.

---

## What you're getting

A complete React + Vite + Tailwind project with:

- Full irrigation tracking app (the same one you've been using in Claude)
- Supabase backend (real database, not a chat artifact)
- Vercel-ready deployment
- iPhone "Add to Home Screen" support so it acts like a real app
- Shared data across all crew devices

---

## Setup (90 minutes total, broken into 5 phases)

You'll do this once. After that, the app just runs.

### Phase 1 — Get the code into Claude Code (5 min)

1. Open **Claude Code** on your computer
2. Create a new folder for the project: `mkdir irrigation-tracker && cd irrigation-tracker`
3. Open this folder in Claude Code
4. Copy every file from this package into the new folder, preserving the folder structure:
   ```
   irrigation-tracker/
   ├── README.md
   ├── package.json
   ├── vite.config.js
   ├── tailwind.config.js
   ├── postcss.config.js
   ├── index.html
   ├── .env.example
   ├── .gitignore
   ├── src/
   │   ├── App.jsx           ← the big one (the app code)
   │   ├── main.jsx
   │   ├── index.css
   │   └── lib/
   │       └── storage.js
   └── supabase/
       └── schema.sql
   ```
5. Tell Claude Code: *"Install dependencies and verify everything is set up."* Claude Code will run `npm install` and check for issues.

### Phase 2 — Set up Supabase (15 min)

Supabase is your free database. This is what replaces the Claude artifact storage.

1. Go to **https://supabase.com** and sign up (free, no credit card)
2. Click **New Project**
   - Organization: (use the default)
   - Name: `irrigation-tracker`
   - Database password: **make one up and save it somewhere safe**
   - Region: pick **West US (North California)** or **West US 2 (Washington)** for Utah
   - Pricing plan: **Free** is plenty
3. Wait 2–3 minutes for it to provision (you'll see a progress indicator)
4. Once it's ready, click **SQL Editor** in the left sidebar
5. Click **New query**
6. Open the file `supabase/schema.sql` from this project, copy its entire contents, and paste into the Supabase SQL editor
7. Click **Run** (or press Ctrl+Enter). You should see "Success. No rows returned." That's correct.
8. Click **Settings** (gear icon, bottom left) → **API**
9. Find and copy two things:
   - **Project URL** (looks like `https://xxxxxxx.supabase.co`)
   - **anon public key** (a long string starting with `eyJ...`)

Keep these handy for the next step.

### Phase 3 — Wire up your local environment (5 min)

1. In your project folder, copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and paste in your Supabase values:
   ```
   VITE_SUPABASE_URL=https://xxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
3. Test locally:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:5173` in your browser. The app should load. Try starting a set — it should save to Supabase. Refresh the page; the data should still be there.

If anything fails, ask Claude Code: *"The app shows errors when I try to start a set. Help me debug."*

### Phase 4 — Push to GitHub (10 min)

You need the code in GitHub for Vercel to deploy from.

1. Go to **https://github.com** and create a free account if you don't have one
2. Click the **+** in the top right → **New repository**
3. Name: `irrigation-tracker`
4. Visibility: **Private** (your data, your business)
5. Don't initialize with README (we already have one)
6. Click **Create repository**
7. GitHub will show you commands — but it's easier to let Claude Code do this. Tell Claude Code:
   > *"Push this project to my new GitHub repo at github.com/YOUR-USERNAME/irrigation-tracker."*

   Claude Code will run the right git commands. If it asks for authentication, sign in with your GitHub account.

### Phase 5 — Deploy to Vercel (10 min)

1. Go to **https://vercel.com** and sign in with your GitHub account
2. Click **Add New → Project**
3. Find `irrigation-tracker` in the list and click **Import**
4. **Important:** Under "Environment Variables", add both:
   - Name: `VITE_SUPABASE_URL`  Value: (paste your Supabase URL)
   - Name: `VITE_SUPABASE_ANON_KEY`  Value: (paste your anon key)
5. Leave all other settings as defaults
6. Click **Deploy**
7. Wait 1–2 minutes. Vercel will give you a URL like `irrigation-tracker-abc123.vercel.app`
8. Open the URL on your phone. The app is live.

### Phase 6 — Add to your home screen (2 min)

On iPhone:
1. Open the Vercel URL in Safari
2. Tap the **Share** button (square with arrow)
3. Tap **Add to Home Screen**
4. Name it "Irrigation" and tap Add

It now lives on your home screen like a real app. Send the link to your crew so they can do the same.

---

## Optional but nice: custom domain

If you want `irrigation.yourfarm.com` instead of the Vercel URL:

1. Buy a domain from **Cloudflare** (cheapest, ~$10/year) or Namecheap
2. In Vercel → your project → **Settings → Domains**, paste your domain
3. Vercel tells you what DNS records to add at your registrar
4. Wait 30 min for DNS to propagate
5. Done

---

## Day-to-day usage

You won't need to touch any of this again. The app just runs.

When you want to make changes:
1. Edit the code locally
2. Commit and push to GitHub: `git add . && git commit -m "describe change" && git push`
3. Vercel auto-deploys within 60 seconds

When you want to look at your data directly:
- Supabase → Table Editor → kv_storage

When something breaks:
- Open Claude Code in the project folder and describe the problem

---

## Troubleshooting

**"The app loads but shows errors when I try to do anything."**
Check that your `.env` file has the Supabase URL and key. If it does, check that you ran the schema.sql in Supabase.

**"It works locally but not on Vercel."**
Most likely: you forgot to add the environment variables in Vercel. Go to your Vercel project → Settings → Environment Variables → make sure both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set. Then redeploy.

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

- `src/App.jsx` — the entire app (all UI, all logic, all 3,600 lines of it)
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
- *"Help me push this to GitHub and deploy to Vercel."*
- *"Show me what's in the kv_storage table in Supabase using their SQL editor."*

You don't need to be a developer to make changes — Claude Code is your developer.
