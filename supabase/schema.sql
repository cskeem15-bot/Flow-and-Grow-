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

-- For a single-farm operation, allow all access via the anon key.
-- If you ever add auth or multi-tenant support, replace this with
-- per-user row-level security policies.
alter table kv_storage enable row level security;

drop policy if exists "Allow all operations" on kv_storage;
create policy "Allow all operations"
  on kv_storage
  for all
  using (true)
  with check (true);
