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

### Turn on crew sign-up

The app requires everyone to sign in — but once approved, everyone sees and shares the same data. Crew members can create their own accounts from the sign-in screen ("Create one"), but a few settings need to be checked first:

1. In Supabase, click **Authentication** (left sidebar) → **Sign In / Providers** → **Email**
2. Make sure **Allow new users to sign up** is **ON**
3. Turn **Confirm email** **OFF** (crew "emails" don't need to be real inboxes — see below — so there's no inbox to click a confirmation link from)
4. Click **Save**

That's it — the app handles the rest:

- The **first person** to create an account becomes an **admin** automatically.
- Everyone after that lands on a "Waiting for Approval" screen until an admin approves them from **Setup → Crew Accounts** in the app.
- Admins can approve/decline new sign-ups and promote other approved users to admin from that same card.

**Whoever sets this up first should create their own account first** — that's how you become the first admin.

> Email doesn't need to be a real inbox crew members check — it's just their username. Something like `firstname@yourfarm.local` works fine.

### Create logins for your crew (manual alternative)

If you'd rather create accounts yourself instead of having crew sign up:

1. In Supabase, click **Authentication** (left sidebar) → **Users** → **Add user** → **Create new user**
2. For each crew member:
   - **Email**: their email address (doesn't need to be a real inbox they check — it's just their username)
   - **Password**: make one up and write it down to share with them
   - Turn **Auto Confirm User** ON
   - Click **Create user**
3. Give each person their email + password — that's what they'll use on the app's sign-in screen

Accounts created this way (and any account that existed before the sign-up feature was added) are automatically approved as admins, so they skip the "Waiting for Approval" step.

**To remove someone's access** later, go to **Authentication → Users**, click their row, and **Delete user**.
**To reset someone's password**, click their row → **Reset password** (or just delete and re-create the account with a new password).

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

## Step 3 — Turn on notifications (optional)

This lets the crew get phone alerts — even when the app is closed — for things like:
- A set's timer finishing
- A field section becoming due to water
- Crew starting or finishing a set
- Daily reminders

It takes about 15 minutes, only needs to be done once, and is completely optional — the app works fine without it.

> **iPhone users:** do the "Add to your phone's home screen" step below **first**. Notifications only work from the home-screen app icon, not from a regular Safari tab.

### 3a. Add your VAPID secrets to Supabase

VAPID keys are the credentials that let your app send push notifications. A key pair was generated for you when this feature was set up:
- The **public** key is already in `.env.example` and your local `.env` as `VITE_VAPID_PUBLIC_KEY`
- The **private** key is saved as a comment in your local `.env` file (look for `VAPID_PRIVATE_KEY`) — keep it secret, don't share it or put it in Vercel

In your Supabase project:
1. Go to **Edge Functions → Secrets** (or **Project Settings → Edge Functions**)
2. Add three secrets:
   - `VAPID_PUBLIC_KEY` = (the value of `VITE_VAPID_PUBLIC_KEY` from your `.env`)
   - `VAPID_PRIVATE_KEY` = (the value from the `VAPID_PRIVATE_KEY` comment in your `.env`)
   - `VAPID_SUBJECT` = `mailto:your-email@example.com` (any email — push services use this as a contact)

### 3b. Deploy the notification function

1. In Supabase, go to **Edge Functions → Deploy a new function**
2. Name it exactly `notify`
3. Open `supabase/functions/notify/index.ts` from this project, copy the entire file, and paste it into the function editor
4. Deploy

### 3c. Schedule the automatic checks

This tells Supabase to check every 10 minutes for timers finishing and sections becoming due.

1. Click **SQL Editor → New query**
2. Open `supabase/schema.sql` and find the **"Push notification scheduling"** block near the bottom
3. Copy that block into the SQL editor
4. Replace the placeholders:
   - `https://xxxxxxx.supabase.co/functions/v1/notify` → your Project URL + `/functions/v1/notify`
   - both `your-anon-public-key-here` → your anon public key (same one from Step 1)
5. Click **Run**

### 3d. Add the public key to Vercel

1. Go to your Vercel project → **Settings → Environment Variables**
2. Add `VITE_VAPID_PUBLIC_KEY` = (same value as in your `.env`)
3. Go to **Deployments**, click **⋯** on the latest deployment, and choose **Redeploy**

### 3e. Turn it on for each phone

On each crew member's phone, open the app (iPhone: use the home-screen icon), go to **Setup → Notifications**, and tap **Turn On Notifications**. Each phone needs to do this once.

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

**"A crew member can't sign in / forgot their password."**
Go to Supabase → **Authentication → Users**, click their row, and use **Reset password** (or delete and re-create the account with a new password — see "Create logins for your crew" in Step 1).

**"A new crew member signed up but is stuck on 'Waiting for Approval'."**
An admin needs to approve them: open the app → **Setup → Crew Accounts**, find their email under "Pending Requests", and tap **Approve**.

**"Sign-up says 'Database error saving new user' or doesn't create an account."**
Make sure `schema.sql` has been run (it creates the `user_status` table and the trigger that sets up new accounts), and that **Confirm email** is turned **OFF** under Supabase → **Authentication → Providers → Email** (see "Turn on crew sign-up" in Step 1).

**"Data is shared between everyone — what if I want separate fields/users?"**
Everyone who signs in shares the same data — that's intentional for a single-farm crew. If you ever need multi-farm support (separate fields/data per login), that's a future upgrade.

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

- `src/App.jsx` — the entire app (all UI, all logic)
- `src/lib/storage.js` — the Supabase adapter (translates app storage calls to database queries)
- `src/lib/auth.js` — sign-in/sign-up/sign-out helpers and admin approval functions for the crew login screen
- `src/lib/push.js` — push notification helpers (subscribe/unsubscribe, sending alerts)
- `public/sw.js` — service worker that receives push notifications
- `src/main.jsx` — entry point (probably won't touch)
- `src/index.css` — global styles (probably won't touch)
- `supabase/schema.sql` — database structure + notification scheduling
- `supabase/functions/notify/index.ts` — Edge Function that sends push notifications
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
