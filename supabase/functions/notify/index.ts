// @ts-nocheck
// Supabase Edge Function: notify
//
// Two actions, both POST with a JSON body:
//
//   { "action": "broadcast", "title": "...", "body": "...", "url": "/", "excludeEndpoint": "..." }
//     Sends a push notification to every subscribed device right now.
//     Called from the app for "crew activity" notifications.
//
//   { "action": "check" }
//     Sweeps for things that became true since the last check: an active
//     set's timer finishing, a field section becoming due to water, and the
//     once-a-day reminder digest. Meant to be called every few minutes by
//     pg_cron (see supabase/schema.sql).
//
// Required secrets (set with `supabase secrets set NAME=value`):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:you@example.com)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com';

const DAY_MS = 24 * 60 * 60 * 1000;
// Daily reminder digest fires once, when the cron sweep lands in this UTC hour
// (12:00 UTC ≈ 6am Mountain Daylight Time).
const REMINDER_UTC_HOUR = 12;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function getValue(key, fallback = null) {
  const { data, error } = await supabase
    .from('kv_storage')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error || !data) return fallback;
  try { return JSON.parse(data.value); } catch { return data.value; }
}

async function setValue(key, value) {
  const v = typeof value === 'string' ? value : JSON.stringify(value);
  await supabase
    .from('kv_storage')
    .upsert({ key, value: v, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

async function getSubscriptions() {
  const { data, error } = await supabase
    .from('kv_storage')
    .select('key, value')
    .like('key', 'push:%');
  if (error || !data) return [];
  return data
    .map(row => {
      try { return { key: row.key, sub: JSON.parse(row.value) }; }
      catch { return null; }
    })
    .filter(Boolean);
}

async function sendToAll(payload, excludeEndpoint = null) {
  const subs = await getSubscriptions();
  const body = JSON.stringify(payload);
  await Promise.all(subs.map(async ({ key, sub }) => {
    if (excludeEndpoint && sub.endpoint === excludeEndpoint) return;
    try {
      await webpush.sendNotification(sub, body);
    } catch (err) {
      // Subscription is gone (browser unsubscribed, device reset, etc.) — clean it up.
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await supabase.from('kv_storage').delete().eq('key', key);
      }
    }
  }));
}

// Mirrors migrateConfig() / computeNextSets() in src/App.jsx so the "due to
// water" check matches what the app shows on the Plan tab.
function migrateConfig(c) {
  if (!c) return c;
  const sets = (c.sets || []).map((s, i) => ({
    frequencyDays: 3,
    afiMode: 'every',
    order: i + 1,
    active: true,
    ...s
  }));
  return { ...c, sets };
}

function computeNextSets(config, lastCompleted = {}, now = Date.now()) {
  const activeSets = (config.sets || []).filter(s => s.active !== false);
  return activeSets.map(set => {
    const last = lastCompleted[set.id] || null;
    const freqMs = (set.frequencyDays || 1) * DAY_MS;
    const dueAt = last ? last + freqMs : 0;
    const isDue = now >= dueAt;
    return { set, lastCompleted: last, dueAt, isDue };
  });
}

function todayKey(now = new Date()) {
  return now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

async function checkTimerDone(notifyState) {
  const active = await getValue('active', null);
  if (!active) return;

  const config = migrateConfig(await getValue('config', null));
  if (!config) return;

  const dueAt = active.startedAt + (active.plannedHours || 0) * 3600000;
  if (Date.now() < dueAt) return;

  const dedupeKey = `${active.setId}-${active.startedAt}`;
  if (notifyState.timerNotifiedFor === dedupeKey) return;

  const set = config.sets.find(s => s.id === active.setId);
  await sendToAll({
    title: `${set?.label || 'Set'} timer done`,
    body: `Planned ${active.plannedHours}h is up — head out to check it / shut off.`,
    url: '/'
  });
  notifyState.timerNotifiedFor = dedupeKey;
}

async function checkSectionsDue(notifyState) {
  const config = migrateConfig(await getValue('config', null));
  if (!config) return;

  const schedule = await getValue('schedule', { lastCompleted: {} });
  const today = todayKey();
  notifyState.dueNotified = notifyState.dueNotified || {};

  for (const { set, isDue, lastCompleted } of computeNextSets(config, schedule.lastCompleted || {})) {
    // Skip sections that have never been watered — that's the starting
    // state for a new field, not a fresh "due" event worth a push.
    if (!lastCompleted || !isDue) continue;
    if (notifyState.dueNotified[set.id] === today) continue;

    await sendToAll({
      title: `${set.label} is due to water`,
      body: `It's been ${set.frequencyDays}+ days since the last watering.`,
      url: '/'
    });
    notifyState.dueNotified[set.id] = today;
  }
}

async function checkDailyReminders(notifyState) {
  const now = new Date();
  if (now.getUTCHours() !== REMINDER_UTC_HOUR) return;

  const today = todayKey(now);
  if (notifyState.lastReminderDate === today) return;
  notifyState.lastReminderDate = today;

  const reminders = await getValue('reminders', []);
  const daily = (reminders || []).filter(r => r.frequency === 'daily' && r.enabled);
  if (daily.length === 0) return;

  const body = daily.length === 1
    ? daily[0].title
    : `${daily.length} reminders today: ${daily.map(r => r.title).join(', ')}`;

  await sendToAll({ title: 'Daily reminder', body, url: '/notes' });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return new Response(JSON.stringify({ error: 'VAPID keys not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  let payload = {};
  try { payload = await req.json(); } catch { /* empty body, e.g. cron ping */ }

  if (payload.action === 'broadcast') {
    await sendToAll(
      { title: payload.title || 'Irrigation Tracker', body: payload.body || '', url: payload.url || '/' },
      payload.excludeEndpoint || null
    );
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (payload.action === 'check') {
    const notifyState = await getValue('notifystate', {});
    await checkTimerDone(notifyState);
    await checkSectionsDue(notifyState);
    await checkDailyReminders(notifyState);
    await setValue('notifystate', notifyState);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ error: 'Unknown action' }), {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});
