-- ============================================================
-- Irrigation Tracker schema
-- Run this in Supabase SQL Editor once to set up the database.
-- ============================================================

create table if not exists kv_storage (
  key text primary key,
  value text not null,
  shared boolean default true,
  updated_at timestamptz default now()
);

create index if not exists kv_storage_key_prefix_idx on kv_storage (key text_pattern_ops);

-- All data is shared across the crew, but only signed-in users (created
-- by the farm admin in Authentication -> Users) may read or write it.
-- The "notify" Edge Function uses the service role key, which bypasses RLS,
-- so scheduled notifications keep working regardless of this policy.
alter table kv_storage enable row level security;

drop policy if exists "Allow all operations" on kv_storage;
drop policy if exists "Allow authenticated access" on kv_storage;
create policy "Allow authenticated access"
  on kv_storage
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ============================================================
-- Push notification scheduling (optional)
--
-- Run this AFTER you've deployed the "notify" Edge Function and added
-- your VAPID secrets (see README "Turn on notifications"). Replace the
-- two placeholders below with your project's values, then run this block.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'irrigation-notify-check',
  '*/10 * * * *', -- every 10 minutes
  $$
  select net.http_post(
    url := 'https://xxxxxxx.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer your-anon-public-key-here',
      'apikey', 'your-anon-public-key-here'
    ),
    body := jsonb_build_object('action', 'check')
  );
  $$
);
