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

-- ============================================================
-- Crew accounts: self-signup + admin approval
--
-- Anyone can create an account from the login screen, but new accounts
-- start "pending" and can't read/write kv_storage until an existing admin
-- approves them from Setup -> Pending Requests. The very first account ever
-- created (or any account that already existed before this table was added)
-- is auto-approved as an admin, so there's always someone who can approve
-- everyone else.
-- ============================================================

create table if not exists user_status (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  is_admin boolean not null default false,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text
);

-- Existing crew accounts (created via Authentication -> Users before this
-- feature existed) are trusted and become approved admins, so they can
-- approve future signups.
insert into user_status (id, email, status, is_admin, decided_at)
select id, email, 'approved', true, now()
from auth.users
on conflict (id) do nothing;

-- New signups: the first-ever account becomes an approved admin (covers a
-- brand-new deployment using self-signup from the start); everyone after
-- that starts "pending" until an admin approves them.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from user_status) = 0 then
    insert into user_status (id, email, status, is_admin, decided_at)
    values (new.id, new.email, 'approved', true, now());
  else
    insert into user_status (id, email, status)
    values (new.id, new.email, 'pending');
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Lets RLS policies check the current user's status without recursive
-- evaluation (a regular policy that queries user_status from within a
-- user_status policy would recurse).
create or replace function is_approved()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select status = 'approved' from user_status where id = auth.uid()), false);
$$;

create or replace function is_approved_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select is_admin and status = 'approved' from user_status where id = auth.uid()), false);
$$;

alter table user_status enable row level security;

drop policy if exists "Users see own status" on user_status;
create policy "Users see own status"
  on user_status for select
  using (id = auth.uid());

drop policy if exists "Admins see all statuses" on user_status;
create policy "Admins see all statuses"
  on user_status for select
  using (is_approved_admin());

drop policy if exists "Admins update statuses" on user_status;
create policy "Admins update statuses"
  on user_status for update
  using (is_approved_admin())
  with check (is_approved_admin());

-- All data is shared across the crew, but only approved users may read or
-- write it. The "notify" Edge Function uses the service role key, which
-- bypasses RLS, so scheduled notifications keep working regardless of this
-- policy.
alter table kv_storage enable row level security;

drop policy if exists "Allow all operations" on kv_storage;
drop policy if exists "Allow authenticated access" on kv_storage;
drop policy if exists "Allow approved users" on kv_storage;
create policy "Allow approved users"
  on kv_storage
  for all
  using (is_approved())
  with check (is_approved());

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
