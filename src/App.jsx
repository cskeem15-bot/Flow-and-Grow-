import React, { useState, useEffect, useRef } from 'react';
import {
  Clock, Play, CheckCircle, Settings, Calendar, BarChart3,
  Droplets, AlertCircle, ChevronRight, RotateCcw,
  Square, Activity, Users, ChevronDown, ChevronUp, Trash2,
  X, Bell, Camera, MessageSquare, Plus,
  Image as ImageIcon, Send, ListChecks, BellOff,
  Sprout, Eye, TrendingUp, Sun
} from 'lucide-react';
import {
  registerServiceWorker, isPushSupported, getCurrentSubscription,
  enablePushNotifications, disablePushNotifications, broadcastPush
} from './lib/push.js';

// ============================================================
// STORAGE
// ============================================================
const SHARED = true;

async function getValue(key, fallback = null) {
  try {
    const result = await window.storage.get(key, SHARED);
    if (!result) return fallback;
    try { return JSON.parse(result.value); }
    catch { return result.value; }
  } catch { return fallback; }
}

async function setValue(key, value) {
  try {
    const v = typeof value === 'string' ? value : JSON.stringify(value);
    await window.storage.set(key, v, SHARED);
    return true;
  } catch { return false; }
}

async function deleteValue(key) {
  try {
    await window.storage.delete(key, SHARED);
    return true;
  } catch { return false; }
}

async function listKeys(prefix) {
  try {
    const result = await window.storage.list(prefix, SHARED);
    return result?.keys || [];
  } catch { return []; }
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ============================================================
// IMAGE COMPRESSION
// ============================================================
async function compressImage(file, maxDim = 1280, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width *= scale;
          height *= scale;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============================================================
// DEFAULTS
// ============================================================
const DEFAULT_CONFIG = {
  fieldName: 'North Field',
  totalRows: 374,
  furrowLength: 623,
  gatesPerSet: 35,
  defaultSetHours: 8,
  plantingDate: null,
  sets: Array.from({ length: 11 }, (_, i) => {
    const startRow = i * 35 + 1;
    const endRow = i === 10 ? 374 : (i + 1) * 35;
    return {
      id: i + 1,
      label: `Set ${i + 1}`,
      rows: `${startRow}–${endRow}`,
      gates: endRow - startRow + 1,
      hours: 8,
      frequencyDays: 3,
      afiMode: 'every',
      order: i + 1,
      active: true
    };
  }),
  crew: ['Cody']
};

const AFI_MODE_OPTIONS = [
  { id: 'every', label: 'Every', sub: 'all rows' },
  { id: 'evens', label: 'Evens', sub: 'AFI' },
  { id: 'odds', label: 'Odds', sub: 'AFI' }
];

const DEFAULT_REMINDERS = [
  { id: 'r1', title: 'Check tail flow', desc: 'Tail should be 70–80% of head flow. Adjust gate count if weak.', frequency: 'each_set', enabled: true, createdAt: Date.now() },
  { id: 'r2', title: 'Walk first 10 gates', desc: 'Check for washout 15 min after starting any set.', frequency: 'each_set', enabled: true, createdAt: Date.now() },
  { id: 'r3', title: 'Watch for midday leaf curl', desc: 'If you see it, shorten interval before next set.', frequency: 'daily', enabled: true, createdAt: Date.now() },
  { id: 'r4', title: 'Inspect sediment basin', desc: 'Check forebay sediment level — clean when half full.', frequency: 'weekly', enabled: true, createdAt: Date.now() }
];

const GROWTH_STAGES = [
  {
    id: 'planting',
    name: 'Planting → V3',
    subtitle: 'Seedling Stage',
    startDay: 0,
    endDay: 21,
    frequency: 'Once a week',
    frequencyDetail: 'Don\'t over-water — let roots reach for moisture',
    setLength: '4–6 hr',
    mode: 'every',
    modeLabel: 'Every Row',
    accent: '#FACC15',
    keyPoints: [
      'Goal: germination without sealing',
      'Soil should be moist, not soggy',
      'One mechanical reset pass at V1–V2',
      'Weekly cadence forces root depth'
    ],
    warnings: [
      'Crusting at the head needs reset, not more water',
      'Cold snap forecast: delay irrigation'
    ]
  },
  {
    id: 'v3-v6',
    name: 'V3 → V6',
    subtitle: 'Root Building',
    startDay: 22,
    endDay: 35,
    frequency: 'Every 7–10 days',
    frequencyDetail: 'Force roots deep before height window',
    setLength: '6 hr',
    mode: 'alternating',
    modeLabel: 'Alternating Rows',
    accent: '#A3E635',
    keyPoints: [
      'Switch to AFI (evens/odds weeks)',
      'Light side-dress N (~30–40 lb)',
      'Some afternoon leaf curl is OK',
      'First foliar pass (Ca, Zn, B, humic)'
    ],
    warnings: [
      'Don\'t over-react to midday curl',
      'Glyphosate window V2–V4 only'
    ]
  },
  {
    id: 'height',
    name: 'V6 → Tassel',
    subtitle: 'HEIGHT WINDOW',
    startDay: 36,
    endDay: 60,
    frequency: 'Every 5–7 days',
    frequencyDetail: 'Internodes form NOW — never let it get thirsty',
    setLength: '6–8 hr',
    mode: 'alternating',
    modeLabel: 'Alternating Rows',
    accent: '#A3E635',
    isHighlight: true,
    keyPoints: [
      'This is where height is made or lost',
      'Main N side-dress (~80–120 lb) at V6–V8',
      'Pull a tissue test at V8 if dialing in',
      'Watch midday leaf curl every day'
    ],
    warnings: [
      '95°F+ for days: tighten to 5-day cycle',
      'Curl that doesn\'t recover by 8 PM = behind'
    ]
  },
  {
    id: 'tassel-r3',
    name: 'Tassel → R3',
    subtitle: 'Reproductive',
    startDay: 61,
    endDay: 85,
    frequency: 'Every 5–7 days',
    frequencyDetail: 'Salts peak now, water demand at max',
    setLength: '6–8 hr',
    mode: 'alternating',
    modeLabel: 'Alternating Rows',
    accent: '#A3E635',
    keyPoints: [
      'Pull mid-season EC (salt) test',
      'Last ear shoot internodes forming',
      'Heat waves: switch to every-row briefly',
      'Optional small N pass only if pale'
    ],
    warnings: [
      'Lower-leaf browning = under-watered',
      'Standing water 24h after set = over-watered'
    ]
  },
  {
    id: 'maze-prep',
    name: 'R3 → Maze Open',
    subtitle: 'Firming Up',
    startDay: 86,
    endDay: 110,
    frequency: 'Stretch to 10 days, then stop',
    frequencyDetail: 'Let ground firm up for foot traffic',
    setLength: '—',
    mode: 'taper',
    modeLabel: 'Taper Off',
    accent: '#FACC15',
    keyPoints: [
      'Height game is over',
      'Cut water 2–3 weeks before opening',
      'Avoid late irrigation = no lodging',
      'Maze paths need to be dry and firm'
    ],
    warnings: [
      'Late water can cause lodging in wind',
      'Wet ground at opening = muddy paths'
    ]
  }
];

function getCurrentStage(plantingDate) {
  if (!plantingDate) return null;
  const planted = new Date(plantingDate);
  const today = new Date();
  const dap = Math.floor((today - planted) / 86400000);
  if (dap < 0) {
    return { stage: null, dap, status: 'pre-planting', daysUntil: -dap };
  }
  for (const stage of GROWTH_STAGES) {
    if (dap >= stage.startDay && dap <= stage.endDay) {
      const daysIntoStage = dap - stage.startDay;
      const stageDays = stage.endDay - stage.startDay;
      const daysLeftInStage = stage.endDay - dap;
      return { stage, dap, daysIntoStage, stageDays, daysLeftInStage, status: 'active' };
    }
  }
  return { stage: GROWTH_STAGES[GROWTH_STAGES.length - 1], dap, status: 'late-season' };
}

function getStageDateRange(stage, plantingDate) {
  if (!plantingDate) return null;
  const planted = new Date(plantingDate);
  const start = new Date(planted);
  start.setDate(planted.getDate() + stage.startDay);
  const end = new Date(planted);
  end.setDate(planted.getDate() + stage.endDay);
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

// ============================================================
// HELPERS
// ============================================================
function getWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getWeekRange(weekKey) {
  const [year, w] = weekKey.split('-W');
  const jan4 = new Date(Date.UTC(parseInt(year), 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const weekStart = new Date(jan4);
  weekStart.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (parseInt(w) - 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 4);
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(weekStart)} – ${fmt(weekEnd)}`;
}

function getDayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDuration(ms) {
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatTimeShort(date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatRelative(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function loadFonts() {
  if (document.getElementById('irr-fonts')) return;
  const link = document.createElement('link');
  link.id = 'irr-fonts';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&family=JetBrains+Mono:wght@400;500;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap';
  document.head.appendChild(link);
}

// Fills in defaults for older saved configs so every set has the new
// per-set scheduling fields (frequency, AFI mode, order, active flag).
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

const DAY_MS = 24 * 60 * 60 * 1000;

// Ranks active field sections by their own watering frequency/order so the
// app can recommend what to run next, independent of a fixed weekly cycle.
function computeNextSets(config, lastCompleted = {}, now = Date.now()) {
  const activeSets = (config.sets || []).filter(s => s.active !== false);
  return activeSets
    .map(set => {
      const last = lastCompleted[set.id] || null;
      const freqMs = (set.frequencyDays || 1) * DAY_MS;
      const dueAt = last ? last + freqMs : 0;
      const isDue = now >= dueAt;
      let dueLabel;
      if (!last) {
        dueLabel = 'Never watered';
      } else if (isDue) {
        const daysSince = Math.floor((now - last) / DAY_MS);
        dueLabel = daysSince <= 0 ? 'Due now' : `Due now · last watered ${daysSince}d ago`;
      } else {
        const daysUntil = Math.ceil((dueAt - now) / DAY_MS);
        dueLabel = `Due in ${daysUntil}d`;
      }
      return { set, lastCompleted: last, dueAt, isDue, dueLabel };
    })
    .sort((a, b) => {
      if (a.isDue !== b.isDue) return a.isDue ? -1 : 1;
      if (a.dueAt !== b.dueAt) return a.dueAt - b.dueAt;
      return (a.set.order ?? 0) - (b.set.order ?? 0);
    });
}

// Projects which section would run on each upcoming day, assuming one
// section is run per day in due/order priority and the rotation continues.
function computeProjectedSchedule(config, lastCompleted = {}, days = 14, startDate = new Date()) {
  const sim = { ...lastCompleted };
  const plan = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const ranked = computeNextSets(config, sim, dayStart);
    const top = ranked[0] || null;
    plan.push({ date, set: top?.set || null, isDue: top?.isDue ?? false, dueLabel: top?.dueLabel ?? null });
    if (top) sim[top.set.id] = dayStart;
  }
  return plan;
}

// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  const [view, setView] = useState('now');
  const [config, setConfig] = useState(null);
  const [activeSet, setActiveSet] = useState(null);
  const [currentWeek, setCurrentWeek] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [reminders, setReminders] = useState([]);
  const [todayNote, setTodayNote] = useState(null);
  const [photosByLocation, setPhotosByLocation] = useState({});
  const [weekKey] = useState(getWeekKey());
  const [dayKey] = useState(getDayKey());
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const lastWriteAtRef = useRef(0);

  function recordWrite() {
    lastWriteAtRef.current = Date.now();
  }

  useEffect(() => { loadFonts(); }, []);
  useEffect(() => { registerServiceWorker(); }, []);

  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    loadAll();
    const interval = setInterval(() => {
      // Skip polling within 4 seconds of a local write to avoid stale-read races
      if (Date.now() - lastWriteAtRef.current < 4000) return;
      loadAll();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  async function loadAll() {
    const c = migrateConfig(await getValue('config', DEFAULT_CONFIG));
    setConfig(prev => JSON.stringify(prev) === JSON.stringify(c) ? prev : c);
    const a = await getValue('active', null);
    setActiveSet(prev => JSON.stringify(prev) === JSON.stringify(a) ? prev : a);
    const wk = await getValue(`week:${weekKey}`, null);
    const newWeek = wk || { weekKey, mode: 'every', startedAt: null, sets: {} };
    setCurrentWeek(prev => JSON.stringify(prev) === JSON.stringify(newWeek) ? prev : newWeek);
    const sch = await getValue('schedule', { lastCompleted: {} });
    setSchedule(prev => JSON.stringify(prev) === JSON.stringify(sch) ? prev : sch);
    const r = await getValue('reminders', DEFAULT_REMINDERS);
    setReminders(prev => JSON.stringify(prev) === JSON.stringify(r) ? prev : r);
    const todays = await getValue(`daynote:${dayKey}`, null);
    const newNote = todays || { dayKey, entries: [] };
    setTodayNote(prev => JSON.stringify(prev) === JSON.stringify(newNote) ? prev : newNote);
    await loadPhotoCounts();
    setLoading(false);
  }

  async function loadPhotoCounts() {
    const keys = await listKeys('photo:');
    const counts = {};
    for (const k of keys) {
      try {
        const r = await window.storage.get(k, SHARED);
        const meta = JSON.parse(r.value);
        const loc = `${meta.setId}-${meta.weekKey}`;
        counts[loc] = (counts[loc] || 0) + 1;
      } catch {}
    }
    setPhotosByLocation(counts);
  }

  async function saveConfig(newConfig) {
    recordWrite();
    setConfig(newConfig);
    await setValue('config', newConfig);
  }

  async function saveWeek(newWeek) {
    recordWrite();
    setCurrentWeek(newWeek);
    await setValue(`week:${weekKey}`, newWeek);
  }

  async function saveReminders(newReminders) {
    recordWrite();
    setReminders(newReminders);
    await setValue('reminders', newReminders);
  }

  async function saveTodayNote(newNote) {
    recordWrite();
    setTodayNote(newNote);
    await setValue(`daynote:${dayKey}`, newNote);
  }

  async function startSet(setId, crewMember, hours) {
    recordWrite();
    const newActive = {
      setId,
      weekKey,
      startedAt: Date.now(),
      plannedHours: hours || config.defaultSetHours,
      startedBy: crewMember,
      rowAdvances: {}
    };
    setActiveSet(newActive);
    await setValue('active', newActive);

    const newWeek = { ...currentWeek };
    newWeek.startedAt = newWeek.startedAt || Date.now();
    newWeek.sets = { ...newWeek.sets };
    newWeek.sets[setId] = {
      status: 'active',
      startedAt: Date.now(),
      startedBy: crewMember
    };
    await saveWeek(newWeek);

    const set = config.sets.find(s => s.id === setId);
    broadcastPush({
      title: `${set?.label || 'Set'} started`,
      body: `${crewMember} started irrigating · planned ${newActive.plannedHours}h`
    });
  }

  async function markRowAdvanced(rowNumber) {
    if (!activeSet) return;
    recordWrite();
    const newAdvances = { ...(activeSet.rowAdvances || {}) };
    if (newAdvances[rowNumber]) {
      delete newAdvances[rowNumber];
    } else {
      newAdvances[rowNumber] = Date.now();
    }
    const newActive = { ...activeSet, rowAdvances: newAdvances };
    setActiveSet(newActive);
    await setValue('active', newActive);
  }

  async function completeSet(notes, crewMember) {
    if (!activeSet) return;
    recordWrite();
    const completedAt = Date.now();
    const newWeek = { ...currentWeek };
    newWeek.sets = { ...newWeek.sets };
    newWeek.sets[activeSet.setId] = {
      ...newWeek.sets[activeSet.setId],
      status: 'done',
      completedAt,
      completedBy: crewMember || activeSet.startedBy,
      notes: notes || '',
      actualHours: (completedAt - activeSet.startedAt) / 3600000,
      rowAdvances: activeSet.rowAdvances || {}
    };
    setActiveSet(null);
    await saveWeek(newWeek);
    await setValue('active', null);

    const newSchedule = {
      ...schedule,
      lastCompleted: { ...schedule.lastCompleted, [activeSet.setId]: completedAt }
    };
    setSchedule(newSchedule);
    await setValue('schedule', newSchedule);

    const set = config.sets.find(s => s.id === activeSet.setId);
    const hrs = ((completedAt - activeSet.startedAt) / 3600000).toFixed(1);
    broadcastPush({
      title: `${set?.label || 'Set'} completed`,
      body: `${crewMember || activeSet.startedBy} finished after ${hrs}h`
    });
  }

  async function cancelActive() {
    if (!activeSet) return;
    recordWrite();
    const newWeek = { ...currentWeek };
    newWeek.sets = { ...newWeek.sets };
    delete newWeek.sets[activeSet.setId];
    setActiveSet(null);
    await saveWeek(newWeek);
    await setValue('active', null);
  }

  async function resetSetStatus(setId) {
    const newWeek = { ...currentWeek };
    const completedAt = newWeek.sets[setId]?.completedAt;
    newWeek.sets = { ...newWeek.sets };
    delete newWeek.sets[setId];

    // If this was the most recent completion driving the schedule, undo it
    // so the section becomes due again instead of silently staying "watered".
    if (completedAt && schedule.lastCompleted[setId] === completedAt) {
      recordWrite();
      const newSchedule = { ...schedule, lastCompleted: { ...schedule.lastCompleted } };
      delete newSchedule.lastCompleted[setId];
      setSchedule(newSchedule);
      await setValue('schedule', newSchedule);
    }

    await saveWeek(newWeek);
  }

  async function addPhoto(setId, file, caption, crewMember) {
    try {
      const dataUrl = await compressImage(file);
      const id = uid();
      const meta = {
        id,
        setId,
        weekKey,
        dataUrl,
        caption: caption || '',
        takenAt: Date.now(),
        takenBy: crewMember
      };
      await setValue(`photo:${id}`, meta);
      await loadPhotoCounts();
      return id;
    } catch (e) {
      console.error('Photo upload failed', e);
      return null;
    }
  }

  async function deletePhoto(photoId) {
    await deleteValue(`photo:${photoId}`);
    await loadPhotoCounts();
  }

  async function addTodayEntry(text, author) {
    const entry = { id: uid(), text, author, timestamp: Date.now() };
    const newNote = {
      ...(todayNote || { dayKey, entries: [] }),
      entries: [...((todayNote && todayNote.entries) || []), entry]
    };
    await saveTodayNote(newNote);
  }

  async function deleteTodayEntry(entryId) {
    const newNote = {
      ...todayNote,
      entries: todayNote.entries.filter(e => e.id !== entryId)
    };
    await saveTodayNote(newNote);
  }

  if (loading || !config || !currentWeek || !schedule) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0B0F08', color: '#F5F7F0', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
        <div className="text-center">
          <Droplets className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <div>Loading field data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{
      background: '#0B0F08',
      color: '#F5F7F0',
      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif"
    }}>
      <style>{`
        .font-display { font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-variation-settings: 'opsz' 96; }
        .font-mono-time { font-family: 'JetBrains Mono', monospace; font-feature-settings: 'tnum'; }
        .glow-amber { box-shadow: 0 0 28px rgba(250, 204, 21, 0.35); }
        .glow-green { box-shadow: 0 0 28px rgba(163, 230, 53, 0.4); }
        @keyframes pulse-soft {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        .pulse-soft { animation: pulse-soft 2s ease-in-out infinite; }
      `}</style>

      <Header config={config} weekKey={weekKey} />

      <div className="pb-24 px-4 max-w-2xl mx-auto">
        {view === 'now' && (
          <NowView
            config={config}
            activeSet={activeSet}
            currentWeek={currentWeek}
            schedule={schedule}
            reminders={reminders.filter(r => r.enabled)}
            todayNote={todayNote}
            onStart={startSet}
            onComplete={completeSet}
            onCancel={cancelActive}
            onAddTodayEntry={addTodayEntry}
            onMarkRowAdvanced={markRowAdvanced}
            tick={tick}
            setView={setView}
          />
        )}
        {view === 'week' && (
          <WeekView
            config={config}
            currentWeek={currentWeek}
            schedule={schedule}
            activeSet={activeSet}
            photosByLocation={photosByLocation}
            weekKey={weekKey}
            onStart={startSet}
            onResetSet={resetSetStatus}
            onAddPhoto={addPhoto}
            onDeletePhoto={deletePhoto}
          />
        )}
        {view === 'notes' && (
          <NotesView
            reminders={reminders}
            todayNote={todayNote}
            config={config}
            onSaveReminders={saveReminders}
            onAddEntry={addTodayEntry}
            onDeleteEntry={deleteTodayEntry}
          />
        )}
        {view === 'setup' && (
          <SetupView config={config} onSave={saveConfig} />
        )}
        {view === 'history' && (
          <HistoryView currentWeekKey={weekKey} config={config} />
        )}
        {view === 'schedule' && (
          <ScheduleView config={config} schedule={schedule} setView={setView} />
        )}
      </div>

      <BottomNav view={view} setView={setView} hasActive={!!activeSet} />
    </div>
  );
}

function Header({ config, weekKey }) {
  return (
    <div className="px-4 pt-6 pb-4 max-w-2xl mx-auto">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.2em]" style={{ color: '#8C9683' }}>
            {getWeekRange(weekKey)}
          </div>
          <h1 className="font-display text-3xl" style={{ color: '#F5F7F0', letterSpacing: '-0.02em' }}>
            {config.fieldName}
          </h1>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wider" style={{ color: '#8C9683' }}>Field</div>
          <div className="font-mono-time text-sm" style={{ color: '#FACC15' }}>
            {config.totalRows}r · {config.furrowLength}ft
          </div>
        </div>
      </div>
      <div className="mt-3 h-px" style={{ background: 'linear-gradient(90deg, #2A3525, transparent)' }}></div>
    </div>
  );
}

function NowView({ config, activeSet, currentWeek, schedule, reminders, todayNote, onStart, onComplete, onCancel, onAddTodayEntry, onMarkRowAdvanced, tick, setView }) {
  const [showComplete, setShowComplete] = useState(false);
  const [showStart, setShowStart] = useState(null);
  const [showTailWatch, setShowTailWatch] = useState(false);
  const [notes, setNotes] = useState('');
  const [crewMember, setCrewMember] = useState(config.crew[0] || '');
  const [customHours, setCustomHours] = useState(config.defaultSetHours);
  const [quickEntry, setQuickEntry] = useState('');
  const [quickEntryAuthor, setQuickEntryAuthor] = useState(config.crew[0] || '');

  const setsDone = Object.values(currentWeek.sets).filter(s => s.status === 'done').length;
  const activeSetsCount = config.sets.filter(s => s.active !== false).length;
  const nextSets = computeNextSets(config, schedule.lastCompleted);
  const nextInfo = nextSets[0];
  const nextSet = nextInfo?.set;

  const todayEntries = (todayNote && todayNote.entries) || [];

  function submitQuickEntry() {
    if (quickEntry.trim()) {
      onAddTodayEntry(quickEntry.trim(), quickEntryAuthor);
      setQuickEntry('');
    }
  }

  return (
    <div className="space-y-4">
      <StageBanner config={config} setView={setView} />

      {activeSet ? (
        <ActiveSetCard
          config={config}
          activeSet={activeSet}
          showComplete={showComplete}
          setShowComplete={setShowComplete}
          notes={notes}
          setNotes={setNotes}
          crewMember={crewMember}
          setCrewMember={setCrewMember}
          onComplete={onComplete}
          onCancel={onCancel}
          onOpenTailWatch={() => setShowTailWatch(true)}
        />
      ) : !nextSet ? (
        <div className="rounded-2xl p-8 text-center" style={{
          background: 'linear-gradient(135deg, #1A2614 0%, #1E2818 100%)',
          border: '1px solid #2A3525'
        }}>
          <Settings className="w-16 h-16 mx-auto mb-4" style={{ color: '#8C9683' }} />
          <div className="font-display text-3xl mb-2">No Active Sections</div>
          <div style={{ color: '#8C9683' }}>Add field sections in Setup to get started.</div>
        </div>
      ) : (
        <NextSetCard
          nextSet={nextSet}
          dueInfo={nextInfo}
          config={config}
          showStart={showStart}
          setShowStart={setShowStart}
          crewMember={crewMember}
          setCrewMember={setCrewMember}
          customHours={customHours}
          setCustomHours={setCustomHours}
          onStart={onStart}
        />
      )}

      {reminders.length > 0 && (
        <div className="rounded-2xl p-4" style={{ background: '#151A11', border: '1px solid #2A3525' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4" style={{ color: '#FACC15' }} />
              <div className="text-xs uppercase tracking-[0.2em]" style={{ color: '#8C9683' }}>
                Reminders
              </div>
            </div>
            <button onClick={() => setView('notes')} className="text-xs" style={{ color: '#FACC15' }}>
              Manage
            </button>
          </div>
          <div className="space-y-2">
            {reminders.slice(0, 3).map(r => (
              <div key={r.id} className="flex items-start gap-2 text-sm">
                <div className="w-1 h-1 rounded-full mt-2 flex-shrink-0" style={{ background: '#FACC15' }}></div>
                <div className="flex-1">
                  <div className="font-medium">{r.title}</div>
                  <div className="text-xs" style={{ color: '#8C9683' }}>{r.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl p-4" style={{ background: '#151A11', border: '1px solid #2A3525' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" style={{ color: '#FACC15' }} />
            <div className="text-xs uppercase tracking-[0.2em]" style={{ color: '#8C9683' }}>
              Today's Log
            </div>
          </div>
          <div className="text-xs" style={{ color: '#8C9683' }}>
            {todayEntries.length} {todayEntries.length === 1 ? 'note' : 'notes'}
          </div>
        </div>

        {todayEntries.length > 0 && (
          <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
            {todayEntries.slice().reverse().slice(0, 4).map(entry => (
              <div key={entry.id} className="rounded-xl p-3" style={{ background: '#0B0F08' }}>
                <div className="text-sm">{entry.text}</div>
                <div className="text-xs mt-1" style={{ color: '#8C9683' }}>
                  {entry.author} · {formatRelative(entry.timestamp)}
                </div>
              </div>
            ))}
            {todayEntries.length > 4 && (
              <button onClick={() => setView('notes')} className="text-xs" style={{ color: '#FACC15' }}>
                See all {todayEntries.length} notes →
              </button>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <select
            value={quickEntryAuthor}
            onChange={(e) => setQuickEntryAuthor(e.target.value)}
            className="p-2 rounded-lg text-sm"
            style={{ background: '#0B0F08', color: '#F5F7F0', border: '1px solid #2A3525' }}
          >
            {config.crew.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input
            value={quickEntry}
            onChange={(e) => setQuickEntry(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitQuickEntry()}
            placeholder="Quick note for the crew..."
            className="flex-1 p-2 rounded-lg text-sm"
            style={{ background: '#0B0F08', color: '#F5F7F0', border: '1px solid #2A3525' }}
          />
          <button
            onClick={submitQuickEntry}
            className="px-3 rounded-lg flex items-center justify-center"
            style={{ background: '#FACC15', color: '#0B0F08' }}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      <WeekProgress setsDone={setsDone} totalSets={activeSetsCount} />

      {showTailWatch && activeSet && (
        <TailWatchModal
          config={config}
          activeSet={activeSet}
          onMarkRowAdvanced={onMarkRowAdvanced}
          onClose={() => setShowTailWatch(false)}
        />
      )}
    </div>
  );
}

function ActiveSetCard({ config, activeSet, showComplete, setShowComplete, notes, setNotes, crewMember, setCrewMember, onComplete, onCancel, onOpenTailWatch }) {
  const setDef = config.sets.find(s => s.id === activeSet.setId);
  const elapsed = Date.now() - activeSet.startedAt;
  const plannedMs = activeSet.plannedHours * 3600000;
  const remaining = plannedMs - elapsed;
  const overrun = remaining < 0;
  const pct = Math.min(100, (elapsed / plannedMs) * 100);
  const endTime = new Date(activeSet.startedAt + plannedMs);

  return (
    <div className="rounded-2xl p-6 glow-green" style={{
      background: 'linear-gradient(135deg, #1A2614 0%, #1E2818 100%)',
      border: '1px solid #A3E635'
    }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full pulse-soft" style={{ background: '#A3E635' }}></div>
        <div className="text-xs uppercase tracking-[0.2em] font-semibold" style={{ color: '#A3E635' }}>
          Now Running
        </div>
      </div>

      <div className="font-display text-4xl mb-1" style={{ letterSpacing: '-0.02em' }}>
        {setDef?.label}
      </div>
      <div className="text-sm mb-6" style={{ color: '#8C9683' }}>
        Rows {setDef?.rows} · {setDef?.gates} gates · Started by {activeSet.startedBy}
      </div>

      <div className="text-center my-6">
        <div className="text-xs uppercase tracking-[0.2em] mb-2" style={{ color: overrun ? '#F59E0B' : '#8C9683' }}>
          {overrun ? 'Overrun' : 'Elapsed'}
        </div>
        <div className="font-mono-time text-6xl font-bold" style={{ color: overrun ? '#F59E0B' : '#F5F7F0' }}>
          {formatDuration(overrun ? -remaining : elapsed)}
        </div>
        <div className="text-sm mt-2" style={{ color: '#8C9683' }}>
          of {activeSet.plannedHours}h · ends {formatTimeShort(endTime)}
        </div>
      </div>

      <div className="h-2 rounded-full overflow-hidden mb-4" style={{ background: '#0B0F08' }}>
        <div className="h-full transition-all duration-1000" style={{
          width: `${pct}%`,
          background: overrun ? '#F59E0B' : '#A3E635'
        }}></div>
      </div>

      <TailWatchSummary activeSet={activeSet} config={config} onOpen={onOpenTailWatch} />

      {!showComplete ? (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setShowComplete(true)}
            className="py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-2 active:scale-95 transition-transform"
            style={{ background: '#A3E635', color: '#0B0F08' }}
          >
            <CheckCircle className="w-5 h-5" />
            Mark Done
          </button>
          <button
            onClick={onCancel}
            className="py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-2 border-2 active:scale-95 transition-transform"
            style={{ borderColor: '#2A3525', color: '#8C9683' }}
          >
            <Square className="w-4 h-4" />
            Cancel
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <select
            value={crewMember}
            onChange={(e) => setCrewMember(e.target.value)}
            className="w-full p-3 rounded-xl"
            style={{ background: '#0B0F08', color: '#F5F7F0', border: '1px solid #2A3525' }}
          >
            {config.crew.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (washout, weak flow, etc.) — optional"
            className="w-full p-3 rounded-xl text-sm"
            rows={2}
            style={{ background: '#0B0F08', color: '#F5F7F0', border: '1px solid #2A3525' }}
          />
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => { onComplete(notes, crewMember); setShowComplete(false); setNotes(''); }}
              className="py-4 rounded-xl font-semibold active:scale-95 transition-transform"
              style={{ background: '#A3E635', color: '#0B0F08' }}
            >
              Confirm Done
            </button>
            <button
              onClick={() => { setShowComplete(false); setNotes(''); }}
              className="py-4 rounded-xl font-semibold border-2"
              style={{ borderColor: '#2A3525', color: '#8C9683' }}
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NextSetCard({ nextSet, dueInfo, config, showStart, setShowStart, crewMember, setCrewMember, customHours, setCustomHours, onStart }) {
  const afiLabel = AFI_MODE_OPTIONS.find(o => o.id === (nextSet?.afiMode || 'every'))?.label || 'Every';
  return (
    <div className="rounded-2xl p-6" style={{ background: '#151A11', border: '1px solid #2A3525' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-[0.2em]" style={{ color: '#8C9683' }}>
          Up Next
        </div>
        {dueInfo && (
          <div className="text-xs px-2 py-1 rounded-full font-semibold" style={{
            background: dueInfo.isDue ? '#A3E635' : '#2A3525',
            color: dueInfo.isDue ? '#0B0F08' : '#8C9683'
          }}>
            {dueInfo.dueLabel}
          </div>
        )}
      </div>
      <div className="font-display text-4xl mb-1" style={{ letterSpacing: '-0.02em' }}>
        {nextSet?.label}
      </div>
      <div className="text-sm mb-6" style={{ color: '#8C9683' }}>
        Rows {nextSet?.rows} · {nextSet?.gates} gates · {nextSet?.hours}h planned · every {nextSet?.frequencyDays}d · {afiLabel} rows
      </div>

      {showStart === nextSet?.id ? (
        <div className="space-y-3">
          <div>
            <label className="text-xs uppercase tracking-wider block mb-1" style={{ color: '#8C9683' }}>Started by</label>
            <select
              value={crewMember}
              onChange={(e) => setCrewMember(e.target.value)}
              className="w-full p-3 rounded-xl"
              style={{ background: '#0B0F08', color: '#F5F7F0', border: '1px solid #2A3525' }}
            >
              {config.crew.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider block mb-1" style={{ color: '#8C9683' }}>Planned hours</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCustomHours(Math.max(1, customHours - 1))}
                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                style={{ background: '#0B0F08', border: '1px solid #2A3525' }}
              >−</button>
              <div className="flex-1 text-center font-mono-time text-3xl">{customHours}h</div>
              <button
                onClick={() => setCustomHours(Math.min(24, customHours + 1))}
                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                style={{ background: '#0B0F08', border: '1px solid #2A3525' }}
              >+</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => { onStart(nextSet.id, crewMember, customHours); setShowStart(null); }}
              className="py-4 rounded-xl font-bold text-lg active:scale-95 transition-transform"
              style={{ background: '#FACC15', color: '#0B0F08' }}
            >
              Start Now
            </button>
            <button
              onClick={() => setShowStart(null)}
              className="py-4 rounded-xl font-semibold border-2"
              style={{ borderColor: '#2A3525', color: '#8C9683' }}
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => { setShowStart(nextSet?.id); setCustomHours(nextSet?.hours || config.defaultSetHours); }}
          className="w-full py-5 rounded-xl font-bold text-lg flex items-center justify-center gap-3 glow-amber active:scale-95 transition-transform"
          style={{ background: '#FACC15', color: '#0B0F08' }}
        >
          <Play className="w-5 h-5" fill="currentColor" />
          Start This Set
        </button>
      )}
    </div>
  );
}

function WeekProgress({ setsDone, totalSets }) {
  const pct = totalSets > 0 ? (setsDone / totalSets) * 100 : 0;
  return (
    <div className="rounded-2xl p-5" style={{ background: '#151A11', border: '1px solid #2A3525' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-[0.2em]" style={{ color: '#8C9683' }}>
          This Week
        </div>
        <div className="font-mono-time text-sm" style={{ color: '#FACC15' }}>
          {setsDone}/{totalSets}
        </div>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: '#0B0F08' }}>
        <div className="h-full transition-all duration-500" style={{
          width: `${pct}%`,
          background: 'linear-gradient(90deg, #A3E635, #FACC15)'
        }}></div>
      </div>
    </div>
  );
}

function WeekView({ config, currentWeek, schedule, activeSet, photosByLocation, weekKey, onStart, onResetSet, onAddPhoto, onDeletePhoto }) {
  const setsDone = Object.values(currentWeek.sets).filter(s => s.status === 'done').length;
  const [photoSetId, setPhotoSetId] = useState(null);
  const sortedSets = [...config.sets].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const dueById = {};
  computeNextSets(config, schedule.lastCompleted).forEach(info => { dueById[info.set.id] = info; });

  return (
    <div className="space-y-4">
      <div className="rounded-2xl overflow-hidden" style={{ background: '#151A11', border: '1px solid #2A3525' }}>
        <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid #2A3525' }}>
          <div className="text-xs uppercase tracking-[0.2em]" style={{ color: '#8C9683' }}>
            Sets · {setsDone}/{config.sets.length} done
          </div>
        </div>
        {sortedSets.map(set => {
          const status = currentWeek.sets[set.id];
          const isActive = activeSet?.setId === set.id;
          const isDone = status?.status === 'done';
          const photoCount = photosByLocation[`${set.id}-${weekKey}`] || 0;
          return (
            <SetRow
              key={set.id}
              set={set}
              status={status}
              dueInfo={dueById[set.id]}
              isActive={isActive}
              isDone={isDone}
              photoCount={photoCount}
              onStart={() => onStart(set.id, config.crew[0], set.hours)}
              onReset={() => onResetSet(set.id)}
              onOpenPhotos={() => setPhotoSetId(set.id)}
              canStart={!activeSet && !isDone}
            />
          );
        })}
      </div>

      {photoSetId !== null && (
        <PhotosModal
          setId={photoSetId}
          weekKey={weekKey}
          config={config}
          onClose={() => setPhotoSetId(null)}
          onAddPhoto={onAddPhoto}
          onDeletePhoto={onDeletePhoto}
        />
      )}
    </div>
  );
}

function SetRow({ set, status, dueInfo, isActive, isDone, photoCount, onStart, onReset, onOpenPhotos, canStart }) {
  const [expanded, setExpanded] = useState(false);
  const afiLabel = AFI_MODE_OPTIONS.find(o => o.id === (set.afiMode || 'every'))?.label || 'Every';

  return (
    <div style={{ borderBottom: '1px solid #2A3525' }}>
      <div className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{
          background: isActive ? '#A3E635' : isDone ? '#2A3525' : '#0B0F08',
          border: '1px solid',
          borderColor: isActive ? '#A3E635' : isDone ? '#A3E635' : '#2A3525'
        }}>
          {isActive ? (
            <Activity className="w-5 h-5" style={{ color: '#0B0F08' }} />
          ) : isDone ? (
            <CheckCircle className="w-5 h-5" style={{ color: '#A3E635' }} />
          ) : (
            <span className="font-mono-time text-sm" style={{ color: '#8C9683' }}>{set.id}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold flex items-center gap-2 flex-wrap">
            {set.label}
            {isActive && (
              <span className="text-xs px-2 py-0.5 rounded-full pulse-soft" style={{ background: '#A3E635', color: '#0B0F08' }}>
                running
              </span>
            )}
            {photoCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: '#2A3525', color: '#FACC15' }}>
                <ImageIcon className="w-3 h-3" /> {photoCount}
              </span>
            )}
            {set.active === false && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#2A3525', color: '#8C9683' }}>
                inactive
              </span>
            )}
            {!isActive && !isDone && dueInfo?.isDue && set.active !== false && (
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: '#A3E635', color: '#0B0F08' }}>
                due
              </span>
            )}
          </div>
          <div className="text-xs" style={{ color: '#8C9683' }}>
            Rows {set.rows} · {set.gates} gates · {set.hours}h · every {set.frequencyDays}d · {afiLabel} rows
          </div>
        </div>
        <button
          onClick={onOpenPhotos}
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: '#0B0F08', border: '1px solid #2A3525', color: '#8C9683' }}
        >
          <Camera className="w-4 h-4" />
        </button>
        {canStart && (
          <button
            onClick={onStart}
            className="px-4 py-2 rounded-xl text-sm font-semibold active:scale-95 transition-transform"
            style={{ background: '#FACC15', color: '#0B0F08' }}
          >
            Start
          </button>
        )}
        {isDone && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-2 rounded-lg"
            style={{ color: '#8C9683' }}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>
      {expanded && isDone && status && (
        <div className="px-4 pb-4 pt-1 text-sm" style={{ color: '#8C9683' }}>
          <div className="rounded-xl p-3" style={{ background: '#0B0F08' }}>
            <div>By <span style={{ color: '#F5F7F0' }}>{status.completedBy}</span></div>
            <div>Ran {status.actualHours?.toFixed(1)}h</div>
            <div>{formatRelative(status.completedAt)}</div>
            {status.notes && <div className="mt-2 italic">"{status.notes}"</div>}

            {status.rowAdvances && Object.keys(status.rowAdvances).length > 0 && (() => {
              const setRows = getSetRowNumbers(set);
              const stats = computeAdvanceStats(status.rowAdvances, status.startedAt, setRows);
              const tailSoakMs = status.completedAt - (status.startedAt + stats.maxMs);
              return (
                <div className="mt-3 pt-3" style={{ borderTop: '1px solid #2A3525' }}>
                  <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: '#FACC15' }}>
                    Advance Data
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>Rows tracked: <span className="font-mono-time" style={{ color: '#F5F7F0' }}>{stats.count}/{stats.total}</span></div>
                    <div>Avg advance: <span className="font-mono-time" style={{ color: '#F5F7F0' }}>{formatMinSec(stats.avgMs)}</span></div>
                    <div>Fastest: <span className="font-mono-time" style={{ color: '#A3E635' }}>Row {stats.advances.find(a => a.elapsed === stats.minMs)?.row} · {formatMinSec(stats.minMs)}</span></div>
                    <div>Slowest: <span className="font-mono-time" style={{ color: '#F59E0B' }}>Row {stats.advances.find(a => a.elapsed === stats.maxMs)?.row} · {formatMinSec(stats.maxMs)}</span></div>
                    <div className="col-span-2">Min tail soak: <span className="font-mono-time" style={{ color: '#A3E635' }}>{formatMinSec(tailSoakMs)}</span></div>
                  </div>
                </div>
              );
            })()}

            <button
              onClick={onReset}
              className="mt-3 text-xs flex items-center gap-1"
              style={{ color: '#F59E0B' }}
            >
              <RotateCcw className="w-3 h-3" /> Reset this set
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PhotosModal({ setId, weekKey, config, onClose, onAddPhoto, onDeletePhoto }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState('');
  const [author, setAuthor] = useState(config.crew[0] || '');
  const [pendingFile, setPendingFile] = useState(null);
  const [viewing, setViewing] = useState(null);
  const fileRef = useRef(null);

  const setDef = config.sets.find(s => s.id === setId);

  useEffect(() => {
    loadPhotos();
  }, [setId, weekKey]);

  async function loadPhotos() {
    setLoading(true);
    try {
      const keys = await listKeys('photo:');
      const all = await Promise.all(
        keys.map(async k => {
          try {
            const r = await window.storage.get(k, SHARED);
            return JSON.parse(r.value);
          } catch { return null; }
        })
      );
      const filtered = all
        .filter(p => p && p.setId === setId && p.weekKey === weekKey)
        .sort((a, b) => b.takenAt - a.takenAt);
      setPhotos(filtered);
    } catch {
      setPhotos([]);
    }
    setLoading(false);
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (file) setPendingFile(file);
  }

  async function confirmUpload() {
    if (!pendingFile) return;
    setUploading(true);
    await onAddPhoto(setId, pendingFile, caption, author);
    setPendingFile(null);
    setCaption('');
    setUploading(false);
    await loadPhotos();
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this photo?')) return;
    await onDeletePhoto(id);
    await loadPhotos();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-t-3xl sm:rounded-3xl flex flex-col" style={{ background: '#0B0F08', border: '1px solid #2A3525' }}>
        <div className="p-4 flex items-center justify-between flex-shrink-0" style={{ borderBottom: '1px solid #2A3525' }}>
          <div>
            <div className="font-display text-xl">{setDef?.label}</div>
            <div className="text-xs" style={{ color: '#8C9683' }}>Photos · Rows {setDef?.rows}</div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg" style={{ color: '#8C9683' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {pendingFile && (
            <div className="mb-4 rounded-2xl p-4" style={{ background: '#151A11', border: '1px solid #FACC15' }}>
              <div className="text-sm font-semibold mb-3">New Photo</div>
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Caption (washout at gate 12, weak tail flow, etc.)"
                className="w-full p-3 rounded-xl mb-2 text-sm"
                style={{ background: '#0B0F08', color: '#F5F7F0', border: '1px solid #2A3525' }}
              />
              <select
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full p-3 rounded-xl mb-3 text-sm"
                style={{ background: '#0B0F08', color: '#F5F7F0', border: '1px solid #2A3525' }}
              >
                {config.crew.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={confirmUpload}
                  disabled={uploading}
                  className="py-3 rounded-xl font-semibold"
                  style={{ background: '#FACC15', color: '#0B0F08', opacity: uploading ? 0.6 : 1 }}
                >
                  {uploading ? 'Uploading...' : 'Save Photo'}
                </button>
                <button
                  onClick={() => { setPendingFile(null); setCaption(''); }}
                  className="py-3 rounded-xl font-semibold border-2"
                  style={{ borderColor: '#2A3525', color: '#8C9683' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center py-8" style={{ color: '#8C9683' }}>Loading photos...</div>
          ) : photos.length === 0 && !pendingFile ? (
            <div className="text-center py-12">
              <Camera className="w-12 h-12 mx-auto mb-3" style={{ color: '#8C9683' }} />
              <div style={{ color: '#8C9683' }}>No photos yet for this set.</div>
              <div className="text-xs mt-1" style={{ color: '#8C9683' }}>Tap the camera button below to add one.</div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {photos.map(p => (
                <div key={p.id} className="rounded-xl overflow-hidden" style={{ background: '#151A11', border: '1px solid #2A3525' }}>
                  <img
                    src={p.dataUrl}
                    alt={p.caption}
                    className="w-full aspect-square object-cover cursor-pointer"
                    onClick={() => setViewing(p)}
                  />
                  <div className="p-2">
                    {p.caption && <div className="text-xs mb-1">{p.caption}</div>}
                    <div className="text-xs flex justify-between" style={{ color: '#8C9683' }}>
                      <span>{p.takenBy}</span>
                      <span>{formatRelative(p.takenAt)}</span>
                    </div>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="text-xs mt-2 flex items-center gap-1"
                      style={{ color: '#F59E0B' }}
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 flex-shrink-0" style={{ borderTop: '1px solid #2A3525' }}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFile}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={!!pendingFile}
            className="w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 active:scale-95 transition-transform"
            style={{ background: '#FACC15', color: '#0B0F08', opacity: pendingFile ? 0.5 : 1 }}
          >
            <Camera className="w-5 h-5" />
            Take / Upload Photo
          </button>
        </div>
      </div>

      {viewing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.95)' }} onClick={() => setViewing(null)}>
          <div className="relative max-w-full max-h-full">
            <img src={viewing.dataUrl} alt={viewing.caption} className="max-w-full max-h-[80vh] rounded-xl" />
            <button onClick={() => setViewing(null)} className="absolute top-2 right-2 w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}>
              <X className="w-5 h-5" />
            </button>
            {viewing.caption && (
              <div className="text-center mt-3 text-sm" style={{ color: '#F5F7F0' }}>{viewing.caption}</div>
            )}
            <div className="text-center text-xs mt-1" style={{ color: '#8C9683' }}>
              {viewing.takenBy} · {formatRelative(viewing.takenAt)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NotesView({ reminders, todayNote, config, onSaveReminders, onAddEntry, onDeleteEntry }) {
  const [tab, setTab] = useState('reminders');
  const [newText, setNewText] = useState('');
  const [newAuthor, setNewAuthor] = useState(config.crew[0] || '');
  const [addingReminder, setAddingReminder] = useState(false);
  const [newReminder, setNewReminder] = useState({ title: '', desc: '', frequency: 'daily' });

  function toggleReminder(id) {
    onSaveReminders(reminders.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  }

  function deleteReminder(id) {
    onSaveReminders(reminders.filter(r => r.id !== id));
  }

  function addReminder() {
    if (!newReminder.title.trim()) return;
    onSaveReminders([
      ...reminders,
      {
        id: uid(),
        title: newReminder.title.trim(),
        desc: newReminder.desc.trim(),
        frequency: newReminder.frequency,
        enabled: true,
        createdAt: Date.now()
      }
    ]);
    setNewReminder({ title: '', desc: '', frequency: 'daily' });
    setAddingReminder(false);
  }

  function submitEntry() {
    if (newText.trim()) {
      onAddEntry(newText.trim(), newAuthor);
      setNewText('');
    }
  }

  const entries = ((todayNote && todayNote.entries) || []).slice().reverse();
  const freqLabel = (f) => ({ each_set: 'Each Set', daily: 'Daily', weekly: 'Weekly', once: 'One Time' })[f] || f;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-1 grid grid-cols-2" style={{ background: '#151A11', border: '1px solid #2A3525' }}>
        <button
          onClick={() => setTab('reminders')}
          className="py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold"
          style={{
            background: tab === 'reminders' ? '#FACC15' : 'transparent',
            color: tab === 'reminders' ? '#0B0F08' : '#8C9683'
          }}
        >
          <ListChecks className="w-4 h-4" />
          Reminders
        </button>
        <button
          onClick={() => setTab('log')}
          className="py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold"
          style={{
            background: tab === 'log' ? '#FACC15' : 'transparent',
            color: tab === 'log' ? '#0B0F08' : '#8C9683'
          }}
        >
          <MessageSquare className="w-4 h-4" />
          Crew Log
        </button>
      </div>

      {tab === 'reminders' ? (
        <div className="rounded-2xl overflow-hidden" style={{ background: '#151A11', border: '1px solid #2A3525' }}>
          <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid #2A3525' }}>
            <div className="text-xs uppercase tracking-[0.2em]" style={{ color: '#8C9683' }}>
              Crew Reminders
            </div>
            <button
              onClick={() => setAddingReminder(true)}
              className="text-xs flex items-center gap-1"
              style={{ color: '#FACC15' }}
            >
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>
          {reminders.length === 0 && !addingReminder ? (
            <div className="p-8 text-center" style={{ color: '#8C9683' }}>
              <Bell className="w-10 h-10 mx-auto mb-2 opacity-50" />
              No reminders yet
            </div>
          ) : (
            reminders.map(r => (
              <div key={r.id} className="p-4 flex items-start gap-3" style={{ borderBottom: '1px solid #2A3525' }}>
                <button
                  onClick={() => toggleReminder(r.id)}
                  className="mt-1 w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{
                    background: r.enabled ? '#A3E635' : 'transparent',
                    border: '1px solid',
                    borderColor: r.enabled ? '#A3E635' : '#2A3525'
                  }}
                >
                  {r.enabled ? <CheckCircle className="w-4 h-4" style={{ color: '#0B0F08' }} /> : <BellOff className="w-3 h-3" style={{ color: '#8C9683' }} />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold" style={{ color: r.enabled ? '#F5F7F0' : '#8C9683' }}>{r.title}</div>
                  {r.desc && <div className="text-xs mt-0.5" style={{ color: '#8C9683' }}>{r.desc}</div>}
                  <div className="text-xs mt-1 inline-block px-2 py-0.5 rounded-full" style={{ background: '#0B0F08', color: '#FACC15' }}>
                    {freqLabel(r.frequency)}
                  </div>
                </div>
                <button
                  onClick={() => deleteReminder(r.id)}
                  className="p-1"
                  style={{ color: '#8C9683' }}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
          {addingReminder && (
            <div className="p-4 space-y-3" style={{ background: '#0B0F08' }}>
              <input
                value={newReminder.title}
                onChange={(e) => setNewReminder({ ...newReminder, title: e.target.value })}
                placeholder="Title (e.g. Check tail flow)"
                className="w-full p-3 rounded-xl text-sm"
                style={{ background: '#151A11', color: '#F5F7F0', border: '1px solid #2A3525' }}
              />
              <textarea
                value={newReminder.desc}
                onChange={(e) => setNewReminder({ ...newReminder, desc: e.target.value })}
                placeholder="Details (optional)"
                rows={2}
                className="w-full p-3 rounded-xl text-sm"
                style={{ background: '#151A11', color: '#F5F7F0', border: '1px solid #2A3525' }}
              />
              <div className="grid grid-cols-4 gap-2">
                {['each_set', 'daily', 'weekly', 'once'].map(f => (
                  <button
                    key={f}
                    onClick={() => setNewReminder({ ...newReminder, frequency: f })}
                    className="py-2 rounded-lg text-xs font-semibold"
                    style={{
                      background: newReminder.frequency === f ? '#FACC15' : '#151A11',
                      color: newReminder.frequency === f ? '#0B0F08' : '#8C9683',
                      border: '1px solid #2A3525'
                    }}
                  >
                    {freqLabel(f)}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={addReminder}
                  className="py-3 rounded-xl font-semibold"
                  style={{ background: '#FACC15', color: '#0B0F08' }}
                >
                  Add Reminder
                </button>
                <button
                  onClick={() => { setAddingReminder(false); setNewReminder({ title: '', desc: '', frequency: 'daily' }); }}
                  className="py-3 rounded-xl font-semibold border-2"
                  style={{ borderColor: '#2A3525', color: '#8C9683' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="rounded-2xl p-4" style={{ background: '#151A11', border: '1px solid #2A3525' }}>
            <div className="text-xs uppercase tracking-[0.2em] mb-3" style={{ color: '#8C9683' }}>
              Add Note · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </div>
            <div className="space-y-2">
              <select
                value={newAuthor}
                onChange={(e) => setNewAuthor(e.target.value)}
                className="w-full p-3 rounded-xl text-sm"
                style={{ background: '#0B0F08', color: '#F5F7F0', border: '1px solid #2A3525' }}
              >
                {config.crew.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <textarea
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder="Note for the crew (handoff info, issues, observations)..."
                rows={3}
                className="w-full p-3 rounded-xl text-sm"
                style={{ background: '#0B0F08', color: '#F5F7F0', border: '1px solid #2A3525' }}
              />
              <button
                onClick={submitEntry}
                className="w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 active:scale-95 transition-transform"
                style={{ background: '#FACC15', color: '#0B0F08' }}
              >
                <Send className="w-4 h-4" /> Post Note
              </button>
            </div>
          </div>

          <div className="rounded-2xl overflow-hidden" style={{ background: '#151A11', border: '1px solid #2A3525' }}>
            <div className="p-4" style={{ borderBottom: '1px solid #2A3525' }}>
              <div className="text-xs uppercase tracking-[0.2em]" style={{ color: '#8C9683' }}>
                Today's Notes · {entries.length}
              </div>
            </div>
            {entries.length === 0 ? (
              <div className="p-8 text-center" style={{ color: '#8C9683' }}>
                <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-50" />
                No notes yet today
              </div>
            ) : (
              entries.map(entry => (
                <div key={entry.id} className="p-4 flex gap-3" style={{ borderBottom: '1px solid #2A3525' }}>
                  <div className="flex-1">
                    <div className="text-sm">{entry.text}</div>
                    <div className="text-xs mt-1" style={{ color: '#8C9683' }}>
                      <span style={{ color: '#FACC15' }}>{entry.author}</span> · {formatRelative(entry.timestamp)}
                    </div>
                  </div>
                  <button
                    onClick={() => onDeleteEntry(entry.id)}
                    className="p-1"
                    style={{ color: '#8C9683' }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SetupView({ config, onSave }) {
  const [local, setLocal] = useState(config);
  const [crewInput, setCrewInput] = useState('');

  function save() { onSave(local); }

  function updateSet(id, field, value) {
    const newSets = local.sets.map(s => s.id === id ? { ...s, [field]: value } : s);
    setLocal({ ...local, sets: newSets });
  }

  function moveSet(id, direction) {
    const sorted = [...local.sets].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const idx = sorted.findIndex(s => s.id === id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[swapIdx];
    const newSets = local.sets.map(s => {
      if (s.id === a.id) return { ...s, order: b.order };
      if (s.id === b.id) return { ...s, order: a.order };
      return s;
    });
    setLocal({ ...local, sets: newSets });
  }

  function addSection() {
    const maxId = local.sets.reduce((m, s) => Math.max(m, s.id), 0);
    const maxOrder = local.sets.reduce((m, s) => Math.max(m, s.order ?? 0), 0);
    const newSet = {
      id: maxId + 1,
      label: `Set ${maxId + 1}`,
      rows: '1-1',
      gates: 1,
      hours: local.defaultSetHours || 8,
      frequencyDays: 3,
      afiMode: 'every',
      order: maxOrder + 1,
      active: true
    };
    setLocal({ ...local, sets: [...local.sets, newSet] });
  }

  function removeSet(id) {
    if (!window.confirm('Remove this field section?')) return;
    setLocal({ ...local, sets: local.sets.filter(s => s.id !== id) });
  }

  const sortedSets = [...local.sets].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  function addCrew() {
    if (crewInput.trim() && !local.crew.includes(crewInput.trim())) {
      setLocal({ ...local, crew: [...local.crew, crewInput.trim()] });
      setCrewInput('');
    }
  }

  function removeCrew(name) {
    setLocal({ ...local, crew: local.crew.filter(c => c !== name) });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-5" style={{ background: '#151A11', border: '1px solid #2A3525' }}>
        <div className="text-xs uppercase tracking-[0.2em] mb-3" style={{ color: '#8C9683' }}>Field</div>
        <input
          value={local.fieldName}
          onChange={(e) => setLocal({ ...local, fieldName: e.target.value })}
          className="w-full p-3 rounded-xl mb-3 font-display text-xl"
          style={{ background: '#0B0F08', color: '#F5F7F0', border: '1px solid #2A3525' }}
        />
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs uppercase tracking-wider block mb-1" style={{ color: '#8C9683' }}>Total Rows</label>
            <input
              type="number"
              value={local.totalRows}
              onChange={(e) => setLocal({ ...local, totalRows: parseInt(e.target.value) || 0 })}
              className="w-full p-3 rounded-xl font-mono-time"
              style={{ background: '#0B0F08', color: '#F5F7F0', border: '1px solid #2A3525' }}
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider block mb-1" style={{ color: '#8C9683' }}>Furrow Length (ft)</label>
            <input
              type="number"
              value={local.furrowLength}
              onChange={(e) => setLocal({ ...local, furrowLength: parseInt(e.target.value) || 0 })}
              className="w-full p-3 rounded-xl font-mono-time"
              style={{ background: '#0B0F08', color: '#F5F7F0', border: '1px solid #2A3525' }}
            />
          </div>
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider block mb-1 flex items-center gap-1" style={{ color: '#FACC15' }}>
            <Sprout className="w-3 h-3" /> Planting Date
          </label>
          <input
            type="date"
            value={local.plantingDate || ''}
            onChange={(e) => setLocal({ ...local, plantingDate: e.target.value || null })}
            className="w-full p-3 rounded-xl font-mono-time"
            style={{ background: '#0B0F08', color: '#F5F7F0', border: '1px solid #2A3525' }}
          />
          <div className="text-xs mt-1" style={{ color: '#8C9683' }}>
            Unlocks stage-based scheduling on the Plan tab
          </div>
        </div>
      </div>

      <div className="rounded-2xl p-5" style={{ background: '#151A11', border: '1px solid #2A3525' }}>
        <div className="text-xs uppercase tracking-[0.2em] mb-3" style={{ color: '#8C9683' }}>Crew</div>
        <div className="space-y-2 mb-3">
          {local.crew.map(name => (
            <div key={name} className="flex items-center justify-between p-3 rounded-xl" style={{ background: '#0B0F08' }}>
              <span>{name}</span>
              <button onClick={() => removeCrew(name)} style={{ color: '#8C9683' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={crewInput}
            onChange={(e) => setCrewInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCrew()}
            placeholder="Add crew member"
            className="flex-1 p-3 rounded-xl"
            style={{ background: '#0B0F08', color: '#F5F7F0', border: '1px solid #2A3525' }}
          />
          <button
            onClick={addCrew}
            className="px-5 rounded-xl font-semibold"
            style={{ background: '#FACC15', color: '#0B0F08' }}
          >
            Add
          </button>
        </div>
      </div>

      <div className="rounded-2xl p-5" style={{ background: '#151A11', border: '1px solid #2A3525' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-[0.2em]" style={{ color: '#8C9683' }}>Field Sections</div>
          <button
            onClick={addSection}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold active:scale-95 transition-transform"
            style={{ background: '#FACC15', color: '#0B0F08' }}
          >
            <Plus className="w-3 h-3" /> Add Section
          </button>
        </div>
        <div className="text-xs mb-3" style={{ color: '#8C9683' }}>
          Set each section's rows, gates, hours, and watering frequency. Use the arrows to match irrigation order.
        </div>
        <div className="space-y-2">
          {sortedSets.map((set, idx) => (
            <SectionEditorRow
              key={set.id}
              set={set}
              isFirst={idx === 0}
              isLast={idx === sortedSets.length - 1}
              onUpdate={(field, value) => updateSet(set.id, field, value)}
              onMoveUp={() => moveSet(set.id, -1)}
              onMoveDown={() => moveSet(set.id, 1)}
              onRemove={() => removeSet(set.id)}
            />
          ))}
        </div>
      </div>

      <NotificationsCard />

      <button
        onClick={save}
        className="w-full py-4 rounded-xl font-bold text-lg glow-amber active:scale-95 transition-transform"
        style={{ background: '#FACC15', color: '#0B0F08' }}
      >
        Save Changes
      </button>
    </div>
  );
}

function NotificationsCard() {
  const configured = !!import.meta.env.VITE_VAPID_PUBLIC_KEY;
  const [supported] = useState(() => isPushSupported());
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!configured || !supported) return;
    getCurrentSubscription().then(sub => setEnabled(!!sub));
  }, [configured, supported]);

  async function toggle() {
    setError('');
    setBusy(true);
    try {
      if (enabled) {
        await disablePushNotifications();
        setEnabled(false);
      } else {
        await enablePushNotifications();
        setEnabled(true);
      }
    } catch (e) {
      setError(e.message || 'Something went wrong.');
    }
    setBusy(false);
  }

  return (
    <div className="rounded-2xl p-5" style={{ background: '#151A11', border: '1px solid #2A3525' }}>
      <div className="text-xs uppercase tracking-[0.2em] mb-3" style={{ color: '#8C9683' }}>Notifications</div>
      <div className="text-sm mb-3" style={{ color: '#8C9683' }}>
        Get alerts on this device for set timers finishing, sections due to water, crew activity, and daily reminders — even when the app is closed.
      </div>

      {!configured ? (
        <div className="p-3 rounded-xl text-sm" style={{ background: '#0B0F08', color: '#8C9683', border: '1px solid #2A3525' }}>
          Notifications aren't set up for this app yet. Ask Claude Code to finish the notification setup.
        </div>
      ) : !supported ? (
        <div className="p-3 rounded-xl text-sm" style={{ background: '#0B0F08', color: '#8C9683', border: '1px solid #2A3525' }}>
          This browser doesn't support notifications. On iPhone, add this app to your Home Screen first, then try again from there.
        </div>
      ) : (
        <>
          <button
            onClick={toggle}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold active:scale-95 transition-transform"
            style={{
              background: enabled ? '#A3E635' : '#151A11',
              color: enabled ? '#0B0F08' : '#8C9683',
              border: '1px solid #2A3525'
            }}
          >
            {enabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
            {busy ? 'Working…' : enabled ? 'Notifications On' : 'Turn On Notifications'}
          </button>
          {error && (
            <div className="text-xs mt-2" style={{ color: '#FACC15' }}>{error}</div>
          )}
        </>
      )}
    </div>
  );
}

function SectionEditorRow({ set, isFirst, isLast, onUpdate, onMoveUp, onMoveDown, onRemove }) {
  const [expanded, setExpanded] = useState(false);
  const parts = (set.rows || '').split(/[–\-]/).map(s => parseInt(s.trim()));
  const startRow = isNaN(parts[0]) ? '' : parts[0];
  const endRow = isNaN(parts[1]) ? '' : parts[1];
  const afiMode = set.afiMode || 'every';
  const isActive = set.active !== false;

  function updateRange(which, value) {
    const v = parseInt(value);
    const newStart = which === 'start' ? (isNaN(v) ? 0 : v) : (startRow || 0);
    const newEnd = which === 'end' ? (isNaN(v) ? 0 : v) : (endRow || 0);
    onUpdate('rows', `${newStart}-${newEnd}`);
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#0B0F08', border: '1px solid #2A3525' }}>
      <div className="flex items-center gap-2 p-3">
        <div className="flex flex-col gap-1 flex-shrink-0">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: '#151A11', color: isFirst ? '#2A3525' : '#8C9683' }}
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: '#151A11', color: isLast ? '#2A3525' : '#8C9683' }}
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-w-0">
          <input
            value={set.label}
            onChange={(e) => onUpdate('label', e.target.value)}
            className="w-full bg-transparent font-semibold mb-0.5"
            style={{ color: '#F5F7F0' }}
          />
          <div className="text-xs truncate" style={{ color: '#8C9683' }}>
            Rows {set.rows} · {set.gates} gates · {set.hours}h · every {set.frequencyDays}d{!isActive ? ' · inactive' : ''}
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-2 rounded-lg flex-shrink-0"
          style={{ color: '#8C9683' }}
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-3 space-y-3" style={{ borderTop: '1px solid #2A3525' }}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wider block mb-1" style={{ color: '#8C9683' }}>Start Row</label>
              <input
                type="number"
                value={startRow}
                onChange={(e) => updateRange('start', e.target.value)}
                className="w-full p-2 rounded-lg font-mono-time"
                style={{ background: '#151A11', color: '#F5F7F0', border: '1px solid #2A3525' }}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider block mb-1" style={{ color: '#8C9683' }}>End Row</label>
              <input
                type="number"
                value={endRow}
                onChange={(e) => updateRange('end', e.target.value)}
                className="w-full p-2 rounded-lg font-mono-time"
                style={{ background: '#151A11', color: '#F5F7F0', border: '1px solid #2A3525' }}
              />
            </div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider block mb-1" style={{ color: '#8C9683' }}>Gates</label>
            <input
              type="number"
              value={set.gates}
              onChange={(e) => onUpdate('gates', parseInt(e.target.value) || 0)}
              className="w-full p-2 rounded-lg font-mono-time"
              style={{ background: '#151A11', color: '#F5F7F0', border: '1px solid #2A3525' }}
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="text-xs uppercase tracking-wider" style={{ color: '#8C9683' }}>Set Hours</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onUpdate('hours', Math.max(1, set.hours - 1))}
                className="w-8 h-8 rounded-lg"
                style={{ background: '#151A11' }}
              >−</button>
              <span className="font-mono-time w-10 text-center">{set.hours}h</span>
              <button
                onClick={() => onUpdate('hours', Math.min(24, set.hours + 1))}
                className="w-8 h-8 rounded-lg"
                style={{ background: '#151A11' }}
              >+</button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-xs uppercase tracking-wider" style={{ color: '#8C9683' }}>Watering Frequency</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onUpdate('frequencyDays', Math.max(1, (set.frequencyDays || 1) - 1))}
                className="w-8 h-8 rounded-lg"
                style={{ background: '#151A11' }}
              >−</button>
              <span className="font-mono-time w-20 text-center">every {set.frequencyDays}d</span>
              <button
                onClick={() => onUpdate('frequencyDays', Math.min(14, (set.frequencyDays || 1) + 1))}
                className="w-8 h-8 rounded-lg"
                style={{ background: '#151A11' }}
              >+</button>
            </div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider block mb-1" style={{ color: '#8C9683' }}>Pattern</label>
            <div className="grid grid-cols-3 gap-2">
              {AFI_MODE_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => onUpdate('afiMode', opt.id)}
                  className="py-2 rounded-lg text-center"
                  style={{
                    background: afiMode === opt.id ? '#FACC15' : '#151A11',
                    color: afiMode === opt.id ? '#0B0F08' : '#F5F7F0',
                    border: '1px solid #2A3525'
                  }}
                >
                  <div className="font-semibold text-sm">{opt.label}</div>
                  <div className="text-[10px] opacity-70">{opt.sub}</div>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => onUpdate('active', !isActive)}
            className="w-full py-2 rounded-lg text-sm font-semibold active:scale-95 transition-transform"
            style={{
              background: isActive ? '#A3E635' : '#151A11',
              color: isActive ? '#0B0F08' : '#8C9683',
              border: '1px solid #2A3525'
            }}
          >
            {isActive ? 'Active in rotation' : 'Inactive — tap to include in rotation'}
          </button>

          <button
            onClick={onRemove}
            className="w-full py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
            style={{ background: '#151A11', color: '#8C9683', border: '1px solid #2A3525' }}
          >
            <Trash2 className="w-4 h-4" /> Remove Section
          </button>
        </div>
      )}
    </div>
  );
}

function HistoryView({ currentWeekKey, config }) {
  const [weeks, setWeeks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWeeks();
  }, [currentWeekKey]);

  async function loadWeeks() {
    try {
      const keys = await listKeys('week:');
      const weekData = await Promise.all(
        keys.map(async k => {
          try {
            const r = await window.storage.get(k, SHARED);
            return { key: k.replace('week:', ''), data: JSON.parse(r.value) };
          } catch { return null; }
        })
      );
      const valid = weekData.filter(w => w && w.key !== currentWeekKey)
        .sort((a, b) => b.key.localeCompare(a.key));
      setWeeks(valid);
    } catch { setWeeks([]); }
    setLoading(false);
  }

  if (loading) {
    return <div className="text-center py-12" style={{ color: '#8C9683' }}>Loading history...</div>;
  }

  if (weeks.length === 0) {
    return (
      <div className="rounded-2xl p-8 text-center" style={{ background: '#151A11', border: '1px solid #2A3525' }}>
        <Calendar className="w-12 h-12 mx-auto mb-3" style={{ color: '#8C9683' }} />
        <div className="font-display text-2xl mb-2">No history yet</div>
        <div style={{ color: '#8C9683' }}>Past weeks will show up here once you finish them.</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {weeks.map(w => {
        const done = Object.values(w.data.sets).filter(s => s.status === 'done').length;
        const total = config.sets.length;
        return (
          <div key={w.key} className="rounded-2xl p-5" style={{ background: '#151A11', border: '1px solid #2A3525' }}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="font-display text-xl">{getWeekRange(w.key)}</div>
              </div>
              <div className="text-right">
                <div className="font-mono-time text-2xl" style={{ color: '#FACC15' }}>{done}/{total}</div>
                <div className="text-xs" style={{ color: '#8C9683' }}>sets done</div>
              </div>
            </div>
            <div className="h-1 rounded-full overflow-hidden mt-3" style={{ background: '#0B0F08' }}>
              <div className="h-full" style={{
                width: `${(done / total) * 100}%`,
                background: done === total ? '#A3E635' : '#FACC15'
              }}></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StageBanner({ config, setView }) {
  const stageInfo = getCurrentStage(config.plantingDate);

  if (!stageInfo) {
    return (
      <button
        onClick={() => setView('setup')}
        className="w-full rounded-2xl p-4 text-left flex items-center justify-between"
        style={{ background: '#151A11', border: '1px dashed #FACC15' }}
      >
        <div className="flex items-center gap-3">
          <Sprout className="w-5 h-5" style={{ color: '#FACC15' }} />
          <div>
            <div className="text-sm font-semibold" style={{ color: '#F5F7F0' }}>Set planting date</div>
            <div className="text-xs" style={{ color: '#8C9683' }}>Unlocks stage-based scheduling</div>
          </div>
        </div>
        <ChevronRight className="w-5 h-5" style={{ color: '#FACC15' }} />
      </button>
    );
  }

  if (stageInfo.status === 'pre-planting') {
    return (
      <button
        onClick={() => setView('schedule')}
        className="w-full rounded-2xl p-4 text-left"
        style={{ background: '#151A11', border: '1px solid #2A3525' }}
      >
        <div className="flex items-center gap-3">
          <Sun className="w-5 h-5" style={{ color: '#FACC15' }} />
          <div className="flex-1">
            <div className="text-sm font-semibold">Pre-planting · {stageInfo.daysUntil} days to go</div>
            <div className="text-xs" style={{ color: '#8C9683' }}>Tap for prep checklist</div>
          </div>
          <ChevronRight className="w-4 h-4" style={{ color: '#8C9683' }} />
        </div>
      </button>
    );
  }

  const { stage, daysIntoStage, stageDays, daysLeftInStage } = stageInfo;
  const pct = (daysIntoStage / stageDays) * 100;

  return (
    <button
      onClick={() => setView('schedule')}
      className="w-full rounded-2xl p-4 text-left"
      style={{
        background: stage.isHighlight ? 'linear-gradient(135deg, #1A2614 0%, #1E2818 100%)' : '#151A11',
        border: `1px solid ${stage.isHighlight ? stage.accent : '#2A3525'}`
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Sprout className="w-4 h-4 flex-shrink-0" style={{ color: stage.accent }} />
            <div className="text-[10px] uppercase tracking-[0.2em] font-semibold" style={{ color: stage.accent }}>
              {stage.subtitle}
            </div>
          </div>
          <div className="font-display text-xl font-semibold">{stage.name}</div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="font-mono-time text-sm" style={{ color: stage.accent }}>
            Day {stageInfo.dap}
          </div>
          <div className="text-[10px]" style={{ color: '#8C9683' }}>
            {daysLeftInStage}d left
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
        <div className="rounded-lg p-2" style={{ background: '#0B0F08' }}>
          <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#8C9683' }}>Cadence</div>
          <div className="font-semibold" style={{ color: '#F5F7F0' }}>{stage.frequency}</div>
        </div>
        <div className="rounded-lg p-2" style={{ background: '#0B0F08' }}>
          <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#8C9683' }}>Set Length</div>
          <div className="font-semibold" style={{ color: '#F5F7F0' }}>{stage.setLength}</div>
        </div>
        <div className="rounded-lg p-2" style={{ background: '#0B0F08' }}>
          <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#8C9683' }}>Mode</div>
          <div className="font-semibold" style={{ color: '#F5F7F0' }}>{stage.modeLabel}</div>
        </div>
      </div>

      <div className="h-1 rounded-full overflow-hidden" style={{ background: '#0B0F08' }}>
        <div className="h-full transition-all" style={{ width: `${pct}%`, background: stage.accent }}></div>
      </div>
    </button>
  );
}

function ScheduleView({ config, schedule, setView }) {
  const [mode, setMode] = useState('plan');

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="rounded-2xl p-1 grid grid-cols-4" style={{ background: '#151A11', border: '1px solid #2A3525' }}>
        <button
          onClick={() => setMode('plan')}
          className="py-3 rounded-xl flex items-center justify-center gap-1 text-xs font-semibold"
          style={{
            background: mode === 'plan' ? '#FACC15' : 'transparent',
            color: mode === 'plan' ? '#0B0F08' : '#8C9683'
          }}
        >
          <ListChecks className="w-4 h-4" />
          Plan
        </button>
        <button
          onClick={() => setMode('stages')}
          className="py-3 rounded-xl flex items-center justify-center gap-1 text-xs font-semibold"
          style={{
            background: mode === 'stages' ? '#FACC15' : 'transparent',
            color: mode === 'stages' ? '#0B0F08' : '#8C9683'
          }}
        >
          <Sprout className="w-4 h-4" />
          Stages
        </button>
        <button
          onClick={() => setMode('calendar')}
          className="py-3 rounded-xl flex items-center justify-center gap-1 text-xs font-semibold"
          style={{
            background: mode === 'calendar' ? '#FACC15' : 'transparent',
            color: mode === 'calendar' ? '#0B0F08' : '#8C9683'
          }}
        >
          <Calendar className="w-4 h-4" />
          Calendar
        </button>
        <button
          onClick={() => setMode('scouting')}
          className="py-3 rounded-xl flex items-center justify-center gap-1 text-xs font-semibold"
          style={{
            background: mode === 'scouting' ? '#FACC15' : 'transparent',
            color: mode === 'scouting' ? '#0B0F08' : '#8C9683'
          }}
        >
          <TrendingUp className="w-4 h-4" />
          Scouting
        </button>
      </div>

      {mode === 'plan' && <PlanView config={config} schedule={schedule} setView={setView} />}
      {mode === 'stages' && <StagesPanel config={config} setView={setView} />}
      {mode === 'calendar' && <CalendarPanel config={config} />}
      {mode === 'scouting' && <ScoutingPanel config={config} />}
    </div>
  );
}

function PlanView({ config, schedule, setView }) {
  const activeSets = config.sets.filter(s => s.active !== false);
  const stageInfo = getCurrentStage(config.plantingDate);
  const plan = computeProjectedSchedule(config, schedule.lastCompleted, 14);
  const todayKey = getDayKey(new Date());

  if (activeSets.length === 0) {
    return (
      <div className="rounded-2xl p-8 text-center" style={{ background: '#151A11', border: '1px solid #2A3525' }}>
        <ListChecks className="w-12 h-12 mx-auto mb-3" style={{ color: '#8C9683' }} />
        <div className="font-display text-2xl mb-2">No Active Sections</div>
        <div className="text-sm mb-4" style={{ color: '#8C9683' }}>
          Add field sections and set their watering frequency in Setup.
        </div>
        <button
          onClick={() => setView('setup')}
          className="px-4 py-2 rounded-xl text-sm font-semibold"
          style={{ background: '#FACC15', color: '#0B0F08' }}
        >
          Go to Setup
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {stageInfo && (
        <div className="rounded-2xl p-4" style={{ background: '#151A11', border: `1px solid ${stageInfo.stage.accent}` }}>
          <div className="text-xs uppercase tracking-[0.2em] mb-1" style={{ color: stageInfo.stage.accent }}>
            Current Stage · {stageInfo.stage.name}
          </div>
          <div className="text-sm" style={{ color: '#8C9683' }}>
            Recommended cadence: <span style={{ color: '#F5F7F0' }}>{stageInfo.stage.frequency}</span>
          </div>
        </div>
      )}

      <div className="rounded-2xl p-4" style={{ background: '#151A11', border: '1px solid #2A3525' }}>
        <div className="text-xs uppercase tracking-[0.2em] mb-1" style={{ color: '#8C9683' }}>Upcoming Rotation</div>
        <div className="text-xs" style={{ color: '#8C9683' }}>
          Projected from each section's frequency and order. Actual order shifts if sets run early, late, or out of turn.
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: '#151A11', border: '1px solid #2A3525' }}>
        {plan.map((p, i) => {
          const isToday = getDayKey(p.date) === todayKey;
          const dateLabel = p.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          return (
            <div key={i} className="p-3 flex items-center gap-3" style={{ borderBottom: i < plan.length - 1 ? '1px solid #2A3525' : 'none' }}>
              <div className="w-20 flex-shrink-0">
                <div className="text-xs font-semibold" style={{ color: isToday ? '#FACC15' : '#F5F7F0' }}>
                  {isToday ? 'Today' : dateLabel}
                </div>
                {isToday && <div className="text-[10px]" style={{ color: '#8C9683' }}>{dateLabel}</div>}
              </div>
              {p.set ? (
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{p.set.label}</div>
                  <div className="text-xs" style={{ color: '#8C9683' }}>
                    Rows {p.set.rows} · {p.set.hours}h · every {p.set.frequencyDays}d
                  </div>
                </div>
              ) : (
                <div className="flex-1 text-sm" style={{ color: '#8C9683' }}>—</div>
              )}
              {p.set && (
                <div className="text-xs px-2 py-1 rounded-full font-semibold flex-shrink-0" style={{
                  background: p.isDue ? '#A3E635' : '#2A3525',
                  color: p.isDue ? '#0B0F08' : '#8C9683'
                }}>
                  {p.isDue ? 'Due' : 'Planned'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StagesPanel({ config, setView }) {
  if (!config.plantingDate) {
    return <PlantingDatePrompt setView={setView} message="Stage tracking needs your planting date to figure out where you are in the season." />;
  }
  const stageInfo = getCurrentStage(config.plantingDate);
  const currentStageId = stageInfo?.stage?.id;
  const plantingDateLabel = new Date(config.plantingDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="space-y-4">
      {/* Planting date header */}
      <div className="rounded-2xl p-4 flex items-center justify-between" style={{ background: '#151A11', border: '1px solid #2A3525' }}>
        <div>
          <div className="text-xs uppercase tracking-[0.2em]" style={{ color: '#8C9683' }}>Planted</div>
          <div className="font-display text-lg">{plantingDateLabel}</div>
        </div>
        <button
          onClick={() => setView('setup')}
          className="px-3 py-2 rounded-lg text-xs font-semibold"
          style={{ background: '#0B0F08', border: '1px solid #2A3525', color: '#8C9683' }}
        >
          Edit
        </button>
      </div>

      {/* Stage list */}
      <div className="space-y-3">
        {GROWTH_STAGES.map(stage => {
          const isCurrent = stage.id === currentStageId;
          const isPast = stageInfo && stageInfo.dap > stage.endDay;
          const dateRange = getStageDateRange(stage, config.plantingDate);
          return (
            <StageCard
              key={stage.id}
              stage={stage}
              isCurrent={isCurrent}
              isPast={isPast}
              dateRange={dateRange}
              stageInfo={isCurrent ? stageInfo : null}
            />
          );
        })}
      </div>

      {/* Footer note */}
      <div className="rounded-2xl p-4 text-xs" style={{ background: '#151A11', border: '1px solid #2A3525', color: '#8C9683' }}>
        <div className="font-semibold mb-1" style={{ color: '#F5F7F0' }}>About these stages</div>
        Stage timing is approximate and based on days after planting. Actual stage transitions depend on heat (growing degree days), soil temp, and weather. Use the corn itself as the source of truth — count leaf collars to confirm V stage.
      </div>
    </div>
  );
}

function StageCard({ stage, isCurrent, isPast, dateRange, stageInfo }) {
  const [expanded, setExpanded] = useState(isCurrent);

  return (
    <div className="rounded-2xl overflow-hidden" style={{
      background: isCurrent ? 'linear-gradient(135deg, #1A2614 0%, #1E2818 100%)' : '#151A11',
      border: `1px solid ${isCurrent ? stage.accent : '#2A3525'}`,
      opacity: isPast ? 0.55 : 1
    }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 text-left flex items-center gap-3"
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{
          background: isCurrent ? stage.accent : '#0B0F08',
          border: `1px solid ${isCurrent ? stage.accent : '#2A3525'}`
        }}>
          {isPast ? (
            <CheckCircle className="w-5 h-5" style={{ color: stage.accent }} />
          ) : isCurrent ? (
            <Activity className="w-5 h-5" style={{ color: '#0B0F08' }} />
          ) : (
            <Sprout className="w-5 h-5" style={{ color: stage.accent }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="font-display text-lg font-semibold">{stage.name}</span>
            {isCurrent && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold pulse-soft" style={{ background: stage.accent, color: '#0B0F08' }}>
                NOW
              </span>
            )}
            {stage.isHighlight && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: '#2A3525', color: stage.accent }}>
                KEY STAGE
              </span>
            )}
          </div>
          <div className="text-xs" style={{ color: '#8C9683' }}>
            {stage.subtitle} · {dateRange}
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: '#8C9683' }} />
        ) : (
          <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: '#8C9683' }} />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Quick specs */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg p-2" style={{ background: '#0B0F08' }}>
              <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#8C9683' }}>Cadence</div>
              <div className="font-semibold">{stage.frequency}</div>
            </div>
            <div className="rounded-lg p-2" style={{ background: '#0B0F08' }}>
              <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#8C9683' }}>Set</div>
              <div className="font-semibold">{stage.setLength}</div>
            </div>
            <div className="rounded-lg p-2" style={{ background: '#0B0F08' }}>
              <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#8C9683' }}>Mode</div>
              <div className="font-semibold">{stage.modeLabel}</div>
            </div>
          </div>

          <div className="text-xs italic" style={{ color: '#8C9683' }}>
            "{stage.frequencyDetail}"
          </div>

          {/* Key points */}
          <div>
            <div className="text-[10px] uppercase tracking-wider mb-2 flex items-center gap-1" style={{ color: stage.accent }}>
              <TrendingUp className="w-3 h-3" /> What to focus on
            </div>
            <div className="space-y-1.5">
              {stage.keyPoints.map((point, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <div className="w-1 h-1 rounded-full mt-2 flex-shrink-0" style={{ background: stage.accent }}></div>
                  <div>{point}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Warnings */}
          <div>
            <div className="text-[10px] uppercase tracking-wider mb-2 flex items-center gap-1" style={{ color: '#F59E0B' }}>
              <Eye className="w-3 h-3" /> Watch for
            </div>
            <div className="space-y-1.5">
              {stage.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <AlertCircle className="w-3 h-3 mt-1 flex-shrink-0" style={{ color: '#F59E0B' }} />
                  <div>{w}</div>
                </div>
              ))}
            </div>
          </div>

          {isCurrent && stageInfo && (
            <div className="rounded-xl p-3" style={{ background: '#0B0F08', border: `1px solid ${stage.accent}` }}>
              <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: stage.accent }}>Where you are</div>
              <div className="text-sm">
                Day <span className="font-mono-time font-bold" style={{ color: stage.accent }}>{stageInfo.daysIntoStage}</span> of {stageInfo.stageDays} in this stage · <span style={{ color: stage.accent }}>{stageInfo.daysLeftInStage} days</span> until next stage
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CalendarPanel({ config }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(getDayKey(today));
  const [setsByDate, setSetsByDate] = useState({});
  const [eventsByDate, setEventsByDate] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAddEvent, setShowAddEvent] = useState(false);

  useEffect(() => {
    loadData();
  }, [viewYear, viewMonth]);

  async function loadData() {
    setLoading(true);
    // Load all weeks, extract completed sets and group by date
    try {
      const weekKeys = await listKeys('week:');
      const sets = {};
      for (const k of weekKeys) {
        try {
          const r = await window.storage.get(k, SHARED);
          const data = JSON.parse(r.value);
          for (const setId in data.sets) {
            const s = data.sets[setId];
            if (s.completedAt) {
              const dk = getDayKey(new Date(s.completedAt));
              if (!sets[dk]) sets[dk] = [];
              sets[dk].push({ setId: parseInt(setId), ...s });
            } else if (s.startedAt) {
              const dk = getDayKey(new Date(s.startedAt));
              if (!sets[dk]) sets[dk] = [];
              sets[dk].push({ setId: parseInt(setId), ...s });
            }
          }
        } catch {}
      }
      setSetsByDate(sets);

      // Load events
      const evKeys = await listKeys('event:');
      const events = {};
      for (const k of evKeys) {
        try {
          const r = await window.storage.get(k, SHARED);
          const ev = JSON.parse(r.value);
          if (!events[ev.date]) events[ev.date] = [];
          events[ev.date].push(ev);
        } catch {}
      }
      setEventsByDate(events);
    } catch {}
    setLoading(false);
  }

  async function addEvent(eventData) {
    const id = uid();
    const ev = { id, ...eventData };
    await setValue(`event:${id}`, ev);
    await loadData();
  }

  async function deleteEvent(eventId) {
    await deleteValue(`event:${eventId}`);
    await loadData();
  }

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  }

  function jumpToToday() {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelectedDate(getDayKey(today));
  }

  const days = getCalendarDays(viewYear, viewMonth);
  const monthName = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const selectedDay = days.find(d => getDayKey(d.date) === selectedDate);

  return (
    <div className="space-y-4">
      {/* Month header */}
      <div className="rounded-2xl p-4" style={{ background: '#151A11', border: '1px solid #2A3525' }}>
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={prevMonth}
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: '#0B0F08', border: '1px solid #2A3525' }}
          >
            <ChevronRight className="w-4 h-4 rotate-180" style={{ color: '#8C9683' }} />
          </button>
          <div className="text-center">
            <div className="font-display text-xl font-semibold">{monthName}</div>
            <button
              onClick={jumpToToday}
              className="text-[10px] uppercase tracking-wider mt-0.5"
              style={{ color: '#FACC15' }}
            >
              Jump to Today
            </button>
          </div>
          <button
            onClick={nextMonth}
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: '#0B0F08', border: '1px solid #2A3525' }}
          >
            <ChevronRight className="w-4 h-4" style={{ color: '#8C9683' }} />
          </button>
        </div>

        {/* Day labels */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {dayLabels.map((d, i) => (
            <div key={i} className="text-center text-[10px] uppercase tracking-wider py-1" style={{ color: '#8C9683' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1">
          {days.map((d, i) => (
            <DayCell
              key={i}
              day={d}
              today={today}
              isSelected={getDayKey(d.date) === selectedDate}
              sets={setsByDate[getDayKey(d.date)] || []}
              events={eventsByDate[getDayKey(d.date)] || []}
              plantingDate={config.plantingDate}
              onSelect={() => setSelectedDate(getDayKey(d.date))}
            />
          ))}
        </div>

        {/* Legend */}
        <div className="mt-4 pt-3 grid grid-cols-2 gap-2 text-[10px]" style={{ borderTop: '1px solid #2A3525', color: '#8C9683' }}>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: '#A3E635' }}></div>
            Sets ran
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: '#FACC15' }}></div>
            Event / stage change
          </div>
        </div>
      </div>

      {/* Day details */}
      {selectedDay && (
        <DayDetails
          date={selectedDay.date}
          sets={setsByDate[getDayKey(selectedDay.date)] || []}
          events={eventsByDate[getDayKey(selectedDay.date)] || []}
          plantingDate={config.plantingDate}
          config={config}
          onAddEvent={() => setShowAddEvent(true)}
          onDeleteEvent={deleteEvent}
        />
      )}

      {showAddEvent && selectedDay && (
        <AddEventModal
          date={getDayKey(selectedDay.date)}
          onSave={async (data) => { await addEvent(data); setShowAddEvent(false); }}
          onCancel={() => setShowAddEvent(false)}
        />
      )}
    </div>
  );
}

function getCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const startDayOfWeek = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevLastDay = new Date(year, month, 0).getDate();
  const days = [];
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    days.push({ date: new Date(year, month - 1, prevLastDay - i), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({ date: new Date(year, month, d), inMonth: true });
  }
  const remaining = 42 - days.length;
  for (let d = 1; d <= remaining; d++) {
    days.push({ date: new Date(year, month + 1, d), inMonth: false });
  }
  return days;
}

function getStageForDate(date, plantingDate) {
  if (!plantingDate) return null;
  const planted = new Date(plantingDate);
  const dap = Math.floor((date - planted) / 86400000);
  if (dap < 0) return null;
  for (const stage of GROWTH_STAGES) {
    if (dap >= stage.startDay && dap <= stage.endDay) {
      return { stage, dap, isStart: dap === stage.startDay };
    }
  }
  return null;
}

function DayCell({ day, today, isSelected, sets, events, plantingDate, onSelect }) {
  const isToday = day.date.toDateString() === today.toDateString();
  const stageInfo = getStageForDate(day.date, plantingDate);
  const hasSets = sets.length > 0;
  const hasEvents = events.length > 0 || stageInfo?.isStart;
  const isPlantingDay = plantingDate && getDayKey(day.date) === plantingDate;

  return (
    <button
      onClick={onSelect}
      className="aspect-square rounded-lg relative flex flex-col items-center justify-start p-1"
      style={{
        background: isSelected ? '#1E2818' : (isToday ? 'rgba(250, 204, 21, 0.08)' : 'transparent'),
        border: isSelected ? `1px solid #FACC15` : (isToday ? `1px solid #FACC15` : '1px solid transparent'),
        opacity: day.inMonth ? 1 : 0.25
      }}
    >
      <span className="text-xs font-semibold" style={{
        color: isToday ? '#FACC15' : day.inMonth ? '#F5F7F0' : '#8C9683'
      }}>
        {day.date.getDate()}
      </span>
      {stageInfo && day.inMonth && (
        <div className="absolute bottom-1 left-1 right-1 h-0.5 rounded-full" style={{ background: stageInfo.stage.accent, opacity: 0.4 }}></div>
      )}
      <div className="absolute bottom-1.5 flex gap-0.5">
        {hasSets && (
          <div className="w-1 h-1 rounded-full" style={{ background: '#A3E635' }}></div>
        )}
        {hasEvents && (
          <div className="w-1 h-1 rounded-full" style={{ background: '#FACC15' }}></div>
        )}
        {isPlantingDay && (
          <div className="w-1 h-1 rounded-full" style={{ background: '#A3E635', boxShadow: '0 0 4px #A3E635' }}></div>
        )}
      </div>
    </button>
  );
}

function DayDetails({ date, sets, events, plantingDate, config, onAddEvent, onDeleteEvent }) {
  const dateLabel = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const stageInfo = getStageForDate(date, plantingDate);
  const isPlantingDay = plantingDate && getDayKey(date) === plantingDate;
  const isPast = date < new Date(new Date().toDateString());
  const isToday = date.toDateString() === new Date().toDateString();

  return (
    <div className="rounded-2xl p-4" style={{ background: '#151A11', border: '1px solid #2A3525' }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em]" style={{ color: '#8C9683' }}>
            {isPast ? 'Past' : isToday ? 'Today' : 'Future'}
          </div>
          <div className="font-display text-lg">{dateLabel}</div>
        </div>
        <button
          onClick={onAddEvent}
          className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1"
          style={{ background: '#FACC15', color: '#0B0F08' }}
        >
          <Plus className="w-3 h-3" /> Event
        </button>
      </div>

      {/* Planting day callout */}
      {isPlantingDay && (
        <div className="rounded-xl p-3 mb-3 flex items-start gap-2" style={{ background: 'linear-gradient(135deg, #1A2614 0%, #1E2818 100%)', border: '1px solid #A3E635' }}>
          <Sprout className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#A3E635' }} />
          <div>
            <div className="text-sm font-semibold" style={{ color: '#A3E635' }}>Planting Day</div>
            <div className="text-xs" style={{ color: '#8C9683' }}>Season starts here</div>
          </div>
        </div>
      )}

      {/* Stage */}
      {stageInfo && (
        <div className="rounded-xl p-3 mb-3" style={{ background: '#0B0F08', border: `1px solid ${stageInfo.stage.accent}` }}>
          <div className="flex items-center gap-2 mb-1">
            <Sprout className="w-3 h-3" style={{ color: stageInfo.stage.accent }} />
            <span className="text-[10px] uppercase tracking-[0.2em] font-semibold" style={{ color: stageInfo.stage.accent }}>
              {stageInfo.isStart ? 'STAGE STARTS' : 'IN STAGE'}
            </span>
          </div>
          <div className="text-sm font-semibold">{stageInfo.stage.name}</div>
          <div className="text-xs" style={{ color: '#8C9683' }}>
            {stageInfo.stage.subtitle} · Day {stageInfo.dap} after planting
          </div>
          <div className="grid grid-cols-3 gap-1 mt-2 text-[10px]">
            <div style={{ color: '#8C9683' }}>
              <span style={{ color: '#F5F7F0' }}>{stageInfo.stage.frequency}</span>
            </div>
            <div style={{ color: '#8C9683' }}>
              <span style={{ color: '#F5F7F0' }}>{stageInfo.stage.setLength}</span>
            </div>
            <div style={{ color: '#8C9683' }}>
              <span style={{ color: '#F5F7F0' }}>{stageInfo.stage.modeLabel}</span>
            </div>
          </div>
        </div>
      )}

      {/* Sets */}
      {sets.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-wider mb-2 flex items-center gap-1" style={{ color: '#A3E635' }}>
            <Droplets className="w-3 h-3" /> Irrigation · {sets.length} {sets.length === 1 ? 'set' : 'sets'}
          </div>
          <div className="space-y-1.5">
            {sets.map((s, i) => {
              const setDef = config.sets.find(x => x.id === s.setId);
              return (
                <div key={i} className="rounded-lg p-2 text-sm flex items-center justify-between" style={{ background: '#0B0F08' }}>
                  <div>
                    <span className="font-semibold">Set {s.setId}</span>
                    {setDef && <span className="text-xs ml-2" style={{ color: '#8C9683' }}>Rows {setDef.rows}</span>}
                  </div>
                  <div className="text-xs text-right" style={{ color: '#8C9683' }}>
                    {s.completedAt ? (
                      <>
                        <span style={{ color: '#A3E635' }}>{s.actualHours?.toFixed(1)}h</span>
                        {s.completedBy && <div>{s.completedBy}</div>}
                      </>
                    ) : (
                      <span style={{ color: '#FACC15' }}>started</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Events */}
      {events.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: '#FACC15' }}>
            Events
          </div>
          <div className="space-y-1.5">
            {events.map(ev => (
              <div key={ev.id} className="rounded-lg p-2 flex items-start gap-2" style={{ background: '#0B0F08' }}>
                <div className="w-1 h-1 rounded-full mt-2 flex-shrink-0" style={{ background: '#FACC15' }}></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{ev.title}</div>
                  {ev.time && <div className="text-xs" style={{ color: '#FACC15' }}>{ev.time}</div>}
                  {ev.notes && <div className="text-xs mt-1" style={{ color: '#8C9683' }}>{ev.notes}</div>}
                </div>
                <button
                  onClick={() => onDeleteEvent(ev.id)}
                  className="p-1"
                  style={{ color: '#8C9683' }}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {sets.length === 0 && events.length === 0 && !stageInfo && !isPlantingDay && (
        <div className="text-center py-4 text-sm" style={{ color: '#8C9683' }}>
          Nothing scheduled. Tap "Event" to add one.
        </div>
      )}
    </div>
  );
}

function AddEventModal({ date, onSave, onCancel }) {
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');

  function handleSave() {
    if (!title.trim()) return;
    onSave({ date, title: title.trim(), time: time.trim(), notes: notes.trim() });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5" style={{ background: '#0B0F08', border: '1px solid #2A3525' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="font-display text-xl">Add Event</div>
          <button onClick={onCancel} className="p-2" style={{ color: '#8C9683' }}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="text-xs mb-3" style={{ color: '#8C9683' }}>
          For {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
        </div>
        <div className="space-y-3">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Event title (e.g. Canal turn opens)"
            className="w-full p-3 rounded-xl"
            style={{ background: '#151A11', color: '#F5F7F0', border: '1px solid #2A3525' }}
          />
          <input
            value={time}
            onChange={(e) => setTime(e.target.value)}
            placeholder="Time (optional, e.g. 6:00 AM)"
            className="w-full p-3 rounded-xl"
            style={{ background: '#151A11', color: '#F5F7F0', border: '1px solid #2A3525' }}
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            rows={3}
            className="w-full p-3 rounded-xl text-sm"
            style={{ background: '#151A11', color: '#F5F7F0', border: '1px solid #2A3525' }}
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleSave}
              className="py-3 rounded-xl font-bold"
              style={{ background: '#FACC15', color: '#0B0F08' }}
            >
              Save Event
            </button>
            <button
              onClick={onCancel}
              className="py-3 rounded-xl font-semibold border-2"
              style={{ borderColor: '#2A3525', color: '#8C9683' }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function getSetRowNumbers(set) {
  if (!set || !set.rows) return [];
  const parts = set.rows.split(/[–\-]/).map(s => parseInt(s.trim()));
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return [];
  const rows = [];
  for (let i = parts[0]; i <= parts[1]; i++) rows.push(i);
  return rows;
}

function computeAdvanceStats(rowAdvances, startedAt, setRows) {
  const advances = Object.entries(rowAdvances || {})
    .map(([row, ts]) => ({ row: parseInt(row), ts, elapsed: ts - startedAt }))
    .sort((a, b) => a.ts - b.ts);
  const total = setRows.length;
  const count = advances.length;
  if (count === 0) {
    return { count, total, advances, avgMs: 0, minMs: 0, maxMs: 0, latest: null, first: null };
  }
  const elapsedTimes = advances.map(a => a.elapsed);
  const avgMs = elapsedTimes.reduce((s, e) => s + e, 0) / count;
  const minMs = Math.min(...elapsedTimes);
  const maxMs = Math.max(...elapsedTimes);
  return {
    count, total, advances, avgMs, minMs, maxMs,
    first: advances[0],
    latest: advances[advances.length - 1]
  };
}

function formatMinSec(ms) {
  if (!ms || ms < 0) return '—';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

function TailWatchSummary({ activeSet, config, onOpen }) {
  const setDef = config.sets.find(s => s.id === activeSet.setId);
  const setRows = getSetRowNumbers(setDef);
  const stats = computeAdvanceStats(activeSet.rowAdvances, activeSet.startedAt, setRows);
  const pct = stats.total > 0 ? (stats.count / stats.total) * 100 : 0;

  return (
    <button
      onClick={onOpen}
      className="w-full rounded-xl p-3 mb-4 text-left flex items-center justify-between active:scale-[0.98] transition-transform"
      style={{ background: '#0B0F08', border: '1px solid #2A3525' }}
    >
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <Droplets className="w-3 h-3" style={{ color: '#FACC15' }} />
          <span className="text-[10px] uppercase tracking-[0.2em] font-semibold" style={{ color: '#FACC15' }}>
            Tail Watch
          </span>
        </div>
        <div className="flex items-baseline gap-3">
          <div className="font-mono-time text-xl font-bold" style={{ color: '#F5F7F0' }}>
            {stats.count}/{stats.total}
          </div>
          {stats.count > 0 && (
            <>
              <div className="text-xs" style={{ color: '#8C9683' }}>
                avg <span className="font-mono-time" style={{ color: '#F5F7F0' }}>{formatMinSec(stats.avgMs)}</span>
              </div>
              <div className="text-xs" style={{ color: '#8C9683' }}>
                last <span className="font-mono-time" style={{ color: '#F5F7F0' }}>Row {stats.latest.row}</span>
              </div>
            </>
          )}
        </div>
        <div className="h-1 rounded-full overflow-hidden mt-2" style={{ background: '#151A11' }}>
          <div className="h-full" style={{ width: `${pct}%`, background: '#FACC15' }}></div>
        </div>
      </div>
      <ChevronRight className="w-5 h-5 ml-3 flex-shrink-0" style={{ color: '#FACC15' }} />
    </button>
  );
}

function TailWatchModal({ config, activeSet, onMarkRowAdvanced, onClose }) {
  const setDef = config.sets.find(s => s.id === activeSet.setId);
  const setRows = getSetRowNumbers(setDef);
  const stats = computeAdvanceStats(activeSet.rowAdvances, activeSet.startedAt, setRows);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(i);
  }, []);

  const elapsed = Date.now() - activeSet.startedAt;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#0B0F08' }}>
      {/* Header */}
      <div className="flex-shrink-0 p-4 flex items-center justify-between" style={{ borderBottom: '1px solid #2A3525' }}>
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] font-semibold" style={{ color: '#FACC15' }}>
            Tail Watch
          </div>
          <div className="font-display text-xl">{setDef?.label} · Rows {setDef?.rows}</div>
        </div>
        <button onClick={onClose} className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#151A11', border: '1px solid #2A3525' }}>
          <X className="w-5 h-5" style={{ color: '#F5F7F0' }} />
        </button>
      </div>

      {/* Stats bar */}
      <div className="flex-shrink-0 p-4 grid grid-cols-4 gap-2" style={{ background: '#151A11', borderBottom: '1px solid #2A3525' }}>
        <div className="rounded-lg p-2 text-center" style={{ background: '#0B0F08' }}>
          <div className="text-[9px] uppercase tracking-wider" style={{ color: '#8C9683' }}>Advanced</div>
          <div className="font-mono-time text-lg font-bold" style={{ color: '#A3E635' }}>
            {stats.count}/{stats.total}
          </div>
        </div>
        <div className="rounded-lg p-2 text-center" style={{ background: '#0B0F08' }}>
          <div className="text-[9px] uppercase tracking-wider" style={{ color: '#8C9683' }}>Set Time</div>
          <div className="font-mono-time text-lg font-bold" style={{ color: '#FACC15' }}>
            {formatMinSec(elapsed)}
          </div>
        </div>
        <div className="rounded-lg p-2 text-center" style={{ background: '#0B0F08' }}>
          <div className="text-[9px] uppercase tracking-wider" style={{ color: '#8C9683' }}>Avg Advance</div>
          <div className="font-mono-time text-lg font-bold" style={{ color: '#F5F7F0' }}>
            {stats.count > 0 ? formatMinSec(stats.avgMs) : '—'}
          </div>
        </div>
        <div className="rounded-lg p-2 text-center" style={{ background: '#0B0F08' }}>
          <div className="text-[9px] uppercase tracking-wider" style={{ color: '#8C9683' }}>Soak (1st)</div>
          <div className="font-mono-time text-lg font-bold" style={{ color: '#A3E635' }}>
            {stats.first ? formatMinSec(elapsed - stats.first.elapsed) : '—'}
          </div>
        </div>
      </div>

      {/* Row grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="text-xs mb-3" style={{ color: '#8C9683' }}>
          Tap each row when water reaches the tail end. Tap again to undo.
        </div>
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-7">
          {setRows.map(row => {
            const advancedAt = activeSet.rowAdvances?.[row];
            const isAdvanced = !!advancedAt;
            const advanceElapsed = isAdvanced ? advancedAt - activeSet.startedAt : 0;
            return (
              <button
                key={row}
                onClick={() => onMarkRowAdvanced(row)}
                className="aspect-square rounded-xl flex flex-col items-center justify-center active:scale-95 transition-transform relative"
                style={{
                  background: isAdvanced ? '#A3E635' : '#151A11',
                  border: `1px solid ${isAdvanced ? '#A3E635' : '#2A3525'}`,
                  color: isAdvanced ? '#0B0F08' : '#F5F7F0'
                }}
              >
                <div className="font-mono-time text-lg font-bold">{row}</div>
                {isAdvanced && (
                  <div className="font-mono-time text-[9px] mt-0.5" style={{ color: '#0B0F08', opacity: 0.7 }}>
                    {formatMinSec(advanceElapsed)}
                  </div>
                )}
                {isAdvanced && (
                  <CheckCircle className="absolute top-1 right-1 w-3 h-3" style={{ color: '#0B0F08' }} />
                )}
              </button>
            );
          })}
        </div>

        {stats.count >= 2 && (
          <div className="mt-6 rounded-xl p-3" style={{ background: '#151A11', border: '1px solid #2A3525' }}>
            <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: '#FACC15' }}>
              Uniformity Check
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs" style={{ color: '#8C9683' }}>Fastest</div>
                <div className="font-mono-time" style={{ color: '#A3E635' }}>
                  Row {stats.advances.find(a => a.elapsed === stats.minMs)?.row} · {formatMinSec(stats.minMs)}
                </div>
              </div>
              <div>
                <div className="text-xs" style={{ color: '#8C9683' }}>Slowest</div>
                <div className="font-mono-time" style={{ color: '#F59E0B' }}>
                  Row {stats.advances.find(a => a.elapsed === stats.maxMs)?.row} · {formatMinSec(stats.maxMs)}
                </div>
              </div>
            </div>
            <div className="text-xs mt-2" style={{ color: '#8C9683' }}>
              Spread: <span className="font-mono-time" style={{ color: '#F5F7F0' }}>{formatMinSec(stats.maxMs - stats.minMs)}</span>
              {' · '}
              {(stats.maxMs - stats.minMs) > stats.avgMs * 0.5 ? (
                <span style={{ color: '#F59E0B' }}>uneven — check slow furrows</span>
              ) : (
                <span style={{ color: '#A3E635' }}>uniform advance ✓</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PlantingDatePrompt({ setView, message }) {
  return (
    <div className="rounded-2xl p-8 text-center" style={{ background: '#151A11', border: '1px solid #2A3525' }}>
      <Sprout className="w-12 h-12 mx-auto mb-3" style={{ color: '#FACC15' }} />
      <div className="font-display text-2xl mb-2">Set Your Planting Date</div>
      <div className="text-sm mb-5" style={{ color: '#8C9683' }}>{message}</div>
      <button
        onClick={() => setView('setup')}
        className="px-6 py-3 rounded-xl font-bold"
        style={{ background: '#FACC15', color: '#0B0F08' }}
      >
        Go to Setup
      </button>
    </div>
  );
}

// ============================================================
// SCOUTING — Monitoring points, stages, height, photos
// ============================================================

const CORN_STAGES = [
  { id: 'VE', label: 'VE', desc: 'Emergence' },
  { id: 'V1', label: 'V1', desc: '1 leaf collar' },
  { id: 'V2', label: 'V2', desc: '2 leaf collars' },
  { id: 'V3', label: 'V3', desc: '3 leaf collars' },
  { id: 'V4', label: 'V4', desc: '4 leaf collars' },
  { id: 'V5', label: 'V5', desc: '5 leaf collars' },
  { id: 'V6', label: 'V6', desc: '6 leaf collars' },
  { id: 'V7', label: 'V7', desc: '7 leaf collars' },
  { id: 'V8', label: 'V8', desc: '8 leaf collars' },
  { id: 'V9', label: 'V9', desc: '9 leaf collars' },
  { id: 'V10', label: 'V10', desc: '10 leaf collars' },
  { id: 'V11', label: 'V11', desc: '11 leaf collars' },
  { id: 'V12', label: 'V12', desc: '12 leaf collars' },
  { id: 'V13', label: 'V13', desc: '13+ leaf collars' },
  { id: 'V14', label: 'V14', desc: '14+ leaf collars' },
  { id: 'VT', label: 'VT', desc: 'Tassel emerged' },
  { id: 'R1', label: 'R1', desc: 'Silking' },
  { id: 'R2', label: 'R2', desc: 'Blister' },
  { id: 'R3', label: 'R3', desc: 'Milk' },
  { id: 'R4', label: 'R4', desc: 'Dough' },
  { id: 'R5', label: 'R5', desc: 'Dent' },
  { id: 'R6', label: 'R6', desc: 'Black layer' }
];

const POINT_COLORS = ['#A3E635', '#FACC15', '#60A5FA', '#F472B6', '#C084FC', '#FB923C', '#22D3EE', '#FB7185', '#A78BFA', '#34D399', '#FBBF24', '#F87171'];

function ScoutingPanel({ config }) {
  const [points, setPoints] = useState([]);
  const [measurements, setMeasurements] = useState([]);
  const [photos, setPhotos] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAddPoint, setShowAddPoint] = useState(false);
  const [addMeasurementForPoint, setAddMeasurementForPoint] = useState(null);
  const [viewingPoint, setViewingPoint] = useState(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const ptKeys = await listKeys('point:');
      const pts = (await Promise.all(ptKeys.map(async k => {
        try { const r = await window.storage.get(k, SHARED); return JSON.parse(r.value); } catch { return null; }
      }))).filter(Boolean).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      setPoints(pts);

      const mKeys = await listKeys('measurement:');
      const ms = (await Promise.all(mKeys.map(async k => {
        try { const r = await window.storage.get(k, SHARED); return JSON.parse(r.value); } catch { return null; }
      }))).filter(Boolean).sort((a, b) => b.measuredAt - a.measuredAt);
      setMeasurements(ms);

      // Load scouting photos (key prefix: scoutphoto:)
      const photoKeys = await listKeys('scoutphoto:');
      const phs = {};
      for (const k of photoKeys) {
        try {
          const r = await window.storage.get(k, SHARED);
          const p = JSON.parse(r.value);
          if (p.measurementId) phs[p.measurementId] = p;
        } catch {}
      }
      setPhotos(phs);
    } catch {}
    setLoading(false);
  }

  async function addPoint(data) {
    const id = uid();
    const point = {
      id,
      name: data.name,
      row: data.row || null,
      position: data.position || '',
      notes: data.notes || '',
      color: POINT_COLORS[points.length % POINT_COLORS.length],
      createdAt: Date.now()
    };
    await setValue(`point:${id}`, point);
    await loadAll();
    setShowAddPoint(false);
  }

  async function deletePoint(pointId) {
    if (!window.confirm('Delete this monitoring point and all its measurements?')) return;
    await deleteValue(`point:${pointId}`);
    // Also delete measurements for this point
    const toDelete = measurements.filter(m => m.pointId === pointId);
    for (const m of toDelete) {
      await deleteValue(`measurement:${m.id}`);
      if (photos[m.id]) await deleteValue(`scoutphoto:${m.id}`);
    }
    await loadAll();
  }

  async function addMeasurement(data, photoFile) {
    const id = uid();
    const m = {
      id,
      pointId: data.pointId,
      stage: data.stage,
      heightInches: parseFloat(data.heightInches) || 0,
      notes: data.notes || '',
      measuredBy: data.measuredBy,
      measuredAt: Date.now(),
      date: getDayKey(new Date())
    };
    await setValue(`measurement:${id}`, m);

    if (photoFile) {
      try {
        const dataUrl = await compressImage(photoFile);
        await setValue(`scoutphoto:${id}`, {
          measurementId: id,
          dataUrl,
          takenAt: Date.now()
        });
      } catch (e) {
        console.error('Photo save failed', e);
      }
    }

    await loadAll();
    setAddMeasurementForPoint(null);
  }

  async function deleteMeasurement(measurementId) {
    if (!window.confirm('Delete this measurement?')) return;
    await deleteValue(`measurement:${measurementId}`);
    if (photos[measurementId]) await deleteValue(`scoutphoto:${measurementId}`);
    await loadAll();
  }

  if (loading) {
    return <div className="text-center py-12" style={{ color: '#8C9683' }}>Loading scouting data...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl p-4 flex items-center justify-between" style={{ background: '#151A11', border: '1px solid #2A3525' }}>
        <div>
          <div className="text-xs uppercase tracking-[0.2em]" style={{ color: '#8C9683' }}>Field Scouting</div>
          <div className="font-display text-lg">
            {points.length} {points.length === 1 ? 'point' : 'points'} · {measurements.length} measurements
          </div>
        </div>
        <button
          onClick={() => setShowAddPoint(true)}
          className="px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-1"
          style={{ background: '#FACC15', color: '#0B0F08' }}
        >
          <Plus className="w-4 h-4" /> Point
        </button>
      </div>

      {/* Chart */}
      {points.length > 0 && measurements.length > 1 && (
        <HeightChart points={points} measurements={measurements} plantingDate={config.plantingDate} />
      )}

      {/* Points list */}
      {points.length === 0 ? (
        <div className="rounded-2xl p-8 text-center" style={{ background: '#151A11', border: '1px solid #2A3525' }}>
          <TrendingUp className="w-12 h-12 mx-auto mb-3" style={{ color: '#FACC15' }} />
          <div className="font-display text-2xl mb-2">Add Your First Point</div>
          <div className="text-sm mb-5" style={{ color: '#8C9683' }}>
            Flag spots across your field — head/middle/tail, or by zone — and measure them each week to track growth.
          </div>
          <button
            onClick={() => setShowAddPoint(true)}
            className="px-6 py-3 rounded-xl font-bold"
            style={{ background: '#FACC15', color: '#0B0F08' }}
          >
            + Add Monitoring Point
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {points.map(p => {
            const pointMeasurements = measurements.filter(m => m.pointId === p.id);
            const latest = pointMeasurements[0];
            return (
              <PointCard
                key={p.id}
                point={p}
                latest={latest}
                count={pointMeasurements.length}
                onMeasure={() => setAddMeasurementForPoint(p)}
                onView={() => setViewingPoint(p)}
              />
            );
          })}
        </div>
      )}

      {/* Modals */}
      {showAddPoint && (
        <AddPointModal
          onSave={addPoint}
          onCancel={() => setShowAddPoint(false)}
          existingCount={points.length}
        />
      )}

      {addMeasurementForPoint && (
        <AddMeasurementModal
          point={addMeasurementForPoint}
          config={config}
          onSave={addMeasurement}
          onCancel={() => setAddMeasurementForPoint(null)}
        />
      )}

      {viewingPoint && (
        <PointHistoryModal
          point={viewingPoint}
          measurements={measurements.filter(m => m.pointId === viewingPoint.id)}
          photos={photos}
          plantingDate={config.plantingDate}
          onClose={() => setViewingPoint(null)}
          onDelete={() => { deletePoint(viewingPoint.id); setViewingPoint(null); }}
          onMeasure={() => { setAddMeasurementForPoint(viewingPoint); setViewingPoint(null); }}
          onDeleteMeasurement={deleteMeasurement}
        />
      )}
    </div>
  );
}

function PointCard({ point, latest, count, onMeasure, onView }) {
  const dapText = latest && point ? '' : '';
  return (
    <div className="rounded-2xl p-4" style={{ background: '#151A11', border: '1px solid #2A3525' }}>
      <div className="flex items-start gap-3">
        <div className="w-2 h-12 rounded-full flex-shrink-0 mt-1" style={{ background: point.color }}></div>
        <button onClick={onView} className="flex-1 min-w-0 text-left">
          <div className="font-display text-lg font-semibold">{point.name}</div>
          <div className="text-xs flex flex-wrap gap-x-2" style={{ color: '#8C9683' }}>
            {point.row && <span>Row {point.row}</span>}
            {point.position && <span>· {point.position}</span>}
            <span>· {count} {count === 1 ? 'reading' : 'readings'}</span>
          </div>
          {latest ? (
            <div className="mt-2 flex items-center gap-3">
              <div className="rounded-lg px-2 py-1" style={{ background: '#0B0F08', color: point.color }}>
                <span className="font-mono-time font-bold">{latest.stage}</span>
              </div>
              <div className="font-mono-time font-bold" style={{ color: '#F5F7F0' }}>
                {latest.heightInches}"
              </div>
              <div className="text-xs" style={{ color: '#8C9683' }}>
                {formatRelative(latest.measuredAt)}
              </div>
            </div>
          ) : (
            <div className="mt-2 text-xs italic" style={{ color: '#8C9683' }}>
              No measurements yet
            </div>
          )}
        </button>
        <button
          onClick={onMeasure}
          className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 flex-shrink-0"
          style={{ background: '#FACC15', color: '#0B0F08' }}
        >
          Measure
        </button>
      </div>
    </div>
  );
}

function HeightChart({ points, measurements, plantingDate }) {
  // Group measurements by point, sort by date
  const byPoint = {};
  for (const p of points) byPoint[p.id] = [];
  for (const m of measurements) {
    if (byPoint[m.pointId]) {
      byPoint[m.pointId].push(m);
    }
  }
  for (const id in byPoint) byPoint[id].sort((a, b) => a.measuredAt - b.measuredAt);

  // Find scale
  const allHeights = measurements.map(m => m.heightInches);
  const maxHeight = Math.max(...allHeights, 12);
  const allDates = measurements.map(m => m.measuredAt);
  const minDate = Math.min(...allDates);
  const maxDate = Math.max(...allDates);
  const dateRange = Math.max(maxDate - minDate, 86400000);

  const W = 320;
  const H = 180;
  const padding = { left: 32, right: 16, top: 16, bottom: 28 };
  const chartW = W - padding.left - padding.right;
  const chartH = H - padding.top - padding.bottom;

  function xFor(ts) {
    return padding.left + ((ts - minDate) / dateRange) * chartW;
  }
  function yFor(h) {
    return padding.top + chartH - (h / maxHeight) * chartH;
  }

  // Y-axis ticks
  const yTicks = [0, Math.round(maxHeight / 2), Math.round(maxHeight)];

  return (
    <div className="rounded-2xl p-4" style={{ background: '#151A11', border: '1px solid #2A3525' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-[0.2em]" style={{ color: '#8C9683' }}>
          Height Over Time
        </div>
        <div className="text-xs" style={{ color: '#8C9683' }}>inches</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 'auto' }}>
        {/* Grid lines */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={padding.left} y1={yFor(t)} x2={W - padding.right} y2={yFor(t)} stroke="#2A3525" strokeDasharray="2 4" />
            <text x={padding.left - 6} y={yFor(t) + 4} fontSize="9" fill="#8C9683" textAnchor="end" fontFamily="JetBrains Mono">{t}</text>
          </g>
        ))}
        {/* X-axis label */}
        <text x={padding.left} y={H - 6} fontSize="9" fill="#8C9683" fontFamily="JetBrains Mono">
          {new Date(minDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </text>
        <text x={W - padding.right} y={H - 6} fontSize="9" fill="#8C9683" textAnchor="end" fontFamily="JetBrains Mono">
          {new Date(maxDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </text>
        {/* Lines and points per monitoring point */}
        {points.map(p => {
          const ms = byPoint[p.id];
          if (ms.length === 0) return null;
          const pathD = ms.map((m, i) => {
            const x = xFor(m.measuredAt);
            const y = yFor(m.heightInches);
            return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
          }).join(' ');
          return (
            <g key={p.id}>
              {ms.length > 1 && (
                <path d={pathD} stroke={p.color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              )}
              {ms.map((m, i) => (
                <circle key={i} cx={xFor(m.measuredAt)} cy={yFor(m.heightInches)} r="3" fill={p.color} stroke="#0B0F08" strokeWidth="1" />
              ))}
            </g>
          );
        })}
      </svg>
      {/* Legend */}
      <div className="flex flex-wrap gap-2 mt-2">
        {points.filter(p => byPoint[p.id].length > 0).map(p => (
          <div key={p.id} className="flex items-center gap-1 text-xs" style={{ color: '#8C9683' }}>
            <div className="w-2 h-2 rounded-full" style={{ background: p.color }}></div>
            {p.name}
          </div>
        ))}
      </div>
    </div>
  );
}

function AddPointModal({ onSave, onCancel, existingCount }) {
  const [name, setName] = useState('');
  const [row, setRow] = useState('');
  const [position, setPosition] = useState('');
  const [notes, setNotes] = useState('');

  function handleSave() {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      row: row ? parseInt(row) : null,
      position: position.trim(),
      notes: notes.trim()
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5" style={{ background: '#0B0F08', border: '1px solid #2A3525' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="font-display text-xl">Add Monitoring Point</div>
          <button onClick={onCancel} className="p-2" style={{ color: '#8C9683' }}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs uppercase tracking-wider block mb-1" style={{ color: '#8C9683' }}>Name *</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Head NE, Middle, Tail SW"
              className="w-full p-3 rounded-xl"
              style={{ background: '#151A11', color: '#F5F7F0', border: '1px solid #2A3525' }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wider block mb-1" style={{ color: '#8C9683' }}>Row #</label>
              <input
                type="number"
                value={row}
                onChange={(e) => setRow(e.target.value)}
                placeholder="optional"
                className="w-full p-3 rounded-xl font-mono-time"
                style={{ background: '#151A11', color: '#F5F7F0', border: '1px solid #2A3525' }}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider block mb-1" style={{ color: '#8C9683' }}>Position</label>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="w-full p-3 rounded-xl"
                style={{ background: '#151A11', color: '#F5F7F0', border: '1px solid #2A3525' }}
              >
                <option value="">—</option>
                <option value="Head">Head</option>
                <option value="Middle">Middle</option>
                <option value="Tail">Tail</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider block mb-1" style={{ color: '#8C9683' }}>Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Distinguishing details, what to look for, etc."
              rows={2}
              className="w-full p-3 rounded-xl text-sm"
              style={{ background: '#151A11', color: '#F5F7F0', border: '1px solid #2A3525' }}
            />
          </div>
          <div className="text-xs" style={{ color: '#8C9683' }}>
            Point color will be assigned automatically · #{existingCount + 1}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={handleSave} className="py-3 rounded-xl font-bold" style={{ background: '#FACC15', color: '#0B0F08' }}>
              Save Point
            </button>
            <button onClick={onCancel} className="py-3 rounded-xl font-semibold border-2" style={{ borderColor: '#2A3525', color: '#8C9683' }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddMeasurementModal({ point, config, onSave, onCancel }) {
  const [stage, setStage] = useState('V1');
  const [height, setHeight] = useState('');
  const [notes, setNotes] = useState('');
  const [measuredBy, setMeasuredBy] = useState(config.crew[0] || '');
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setPhotoPreview(ev.target.result);
      reader.readAsDataURL(file);
    }
  }

  async function handleSave() {
    if (!height) return;
    setSaving(true);
    await onSave({
      pointId: point.id,
      stage,
      heightInches: height,
      notes: notes.trim(),
      measuredBy
    }, photoFile);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5" style={{ background: '#0B0F08', border: '1px solid #2A3525' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs uppercase tracking-[0.2em]" style={{ color: point.color }}>Measuring</div>
            <div className="font-display text-xl">{point.name}</div>
          </div>
          <button onClick={onCancel} className="p-2" style={{ color: '#8C9683' }}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-3">
          {/* Stage selector */}
          <div>
            <label className="text-xs uppercase tracking-wider block mb-2" style={{ color: '#8C9683' }}>Growth Stage</label>
            <div className="flex gap-1 overflow-x-auto pb-2 no-scrollbar">
              {CORN_STAGES.map(s => (
                <button
                  key={s.id}
                  onClick={() => setStage(s.id)}
                  className="px-3 py-2 rounded-lg text-xs font-bold flex-shrink-0"
                  style={{
                    background: stage === s.id ? '#FACC15' : '#151A11',
                    color: stage === s.id ? '#0B0F08' : '#F5F7F0',
                    border: '1px solid #2A3525'
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div className="text-xs mt-1" style={{ color: '#8C9683' }}>
              {CORN_STAGES.find(s => s.id === stage)?.desc}
            </div>
          </div>

          {/* Height */}
          <div>
            <label className="text-xs uppercase tracking-wider block mb-1" style={{ color: '#8C9683' }}>Height (inches)</label>
            <input
              type="number"
              step="0.5"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder="e.g. 12"
              className="w-full p-3 rounded-xl font-mono-time text-xl"
              style={{ background: '#151A11', color: '#F5F7F0', border: '1px solid #2A3525' }}
            />
          </div>

          {/* Photo */}
          <div>
            <label className="text-xs uppercase tracking-wider block mb-1" style={{ color: '#8C9683' }}>Photo (optional)</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFile}
              className="hidden"
            />
            {photoPreview ? (
              <div className="relative rounded-xl overflow-hidden" style={{ border: '1px solid #2A3525' }}>
                <img src={photoPreview} alt="preview" className="w-full max-h-40 object-cover" />
                <button
                  onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(0,0,0,0.7)', color: '#F5F7F0' }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm"
                style={{ background: '#151A11', color: '#F5F7F0', border: '1px dashed #2A3525' }}
              >
                <Camera className="w-4 h-4" />
                Take or upload photo
              </button>
            )}
          </div>

          {/* Crew member */}
          <div>
            <label className="text-xs uppercase tracking-wider block mb-1" style={{ color: '#8C9683' }}>Measured by</label>
            <select
              value={measuredBy}
              onChange={(e) => setMeasuredBy(e.target.value)}
              className="w-full p-3 rounded-xl"
              style={{ background: '#151A11', color: '#F5F7F0', border: '1px solid #2A3525' }}
            >
              {config.crew.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs uppercase tracking-wider block mb-1" style={{ color: '#8C9683' }}>Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Color, vigor, any issues..."
              rows={2}
              className="w-full p-3 rounded-xl text-sm"
              style={{ background: '#151A11', color: '#F5F7F0', border: '1px solid #2A3525' }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={handleSave} disabled={!height || saving} className="py-3 rounded-xl font-bold" style={{ background: '#FACC15', color: '#0B0F08', opacity: (!height || saving) ? 0.5 : 1 }}>
              {saving ? 'Saving...' : 'Save Measurement'}
            </button>
            <button onClick={onCancel} className="py-3 rounded-xl font-semibold border-2" style={{ borderColor: '#2A3525', color: '#8C9683' }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PointHistoryModal({ point, measurements, photos, plantingDate, onClose, onDelete, onMeasure, onDeleteMeasurement }) {
  const [viewingPhoto, setViewingPhoto] = useState(null);
  const planted = plantingDate ? new Date(plantingDate) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div className="w-full max-w-2xl max-h-[90vh] rounded-t-3xl sm:rounded-3xl flex flex-col" style={{ background: '#0B0F08', border: '1px solid #2A3525' }}>
        {/* Header */}
        <div className="p-4 flex-shrink-0" style={{ borderBottom: '1px solid #2A3525' }}>
          <div className="flex items-start gap-3">
            <div className="w-2 h-12 rounded-full flex-shrink-0 mt-1" style={{ background: point.color }}></div>
            <div className="flex-1 min-w-0">
              <div className="font-display text-2xl">{point.name}</div>
              <div className="text-xs" style={{ color: '#8C9683' }}>
                {point.row && `Row ${point.row}`} {point.position && `· ${point.position}`} · {measurements.length} {measurements.length === 1 ? 'reading' : 'readings'}
              </div>
              {point.notes && (
                <div className="text-xs italic mt-1" style={{ color: '#8C9683' }}>"{point.notes}"</div>
              )}
            </div>
            <button onClick={onClose} className="p-2" style={{ color: '#8C9683' }}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* History */}
        <div className="flex-1 overflow-y-auto p-4">
          {measurements.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-sm" style={{ color: '#8C9683' }}>No measurements yet for this point.</div>
            </div>
          ) : (
            <div className="space-y-3">
              {measurements.map(m => {
                const photo = photos[m.id];
                const dap = planted ? Math.floor((m.measuredAt - planted) / 86400000) : null;
                return (
                  <div key={m.id} className="rounded-xl p-3" style={{ background: '#151A11', border: '1px solid #2A3525' }}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="rounded-md px-2 py-0.5 font-mono-time font-bold text-sm" style={{ background: '#0B0F08', color: point.color }}>
                            {m.stage}
                          </span>
                          <span className="font-mono-time font-bold text-lg" style={{ color: '#F5F7F0' }}>
                            {m.heightInches}"
                          </span>
                        </div>
                        <div className="text-xs" style={{ color: '#8C9683' }}>
                          {new Date(m.measuredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          {dap !== null && dap >= 0 && ` · Day ${dap}`}
                          {' · '}{m.measuredBy}
                        </div>
                        {m.notes && (
                          <div className="text-xs mt-1 italic" style={{ color: '#F5F7F0' }}>"{m.notes}"</div>
                        )}
                      </div>
                      {photo && (
                        <button
                          onClick={() => setViewingPhoto(photo)}
                          className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0"
                          style={{ border: '1px solid #2A3525' }}
                        >
                          <img src={photo.dataUrl} alt="" className="w-full h-full object-cover" />
                        </button>
                      )}
                      <button
                        onClick={() => onDeleteMeasurement(m.id)}
                        className="p-1 flex-shrink-0"
                        style={{ color: '#8C9683' }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 flex-shrink-0 grid grid-cols-2 gap-2" style={{ borderTop: '1px solid #2A3525' }}>
          <button
            onClick={onMeasure}
            className="py-3 rounded-xl font-bold"
            style={{ background: '#FACC15', color: '#0B0F08' }}
          >
            + Measure Now
          </button>
          <button
            onClick={onDelete}
            className="py-3 rounded-xl font-semibold border-2 flex items-center justify-center gap-1"
            style={{ borderColor: '#2A3525', color: '#F59E0B' }}
          >
            <Trash2 className="w-3 h-3" /> Delete Point
          </button>
        </div>

        {viewingPhoto && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.95)' }} onClick={() => setViewingPhoto(null)}>
            <div className="relative max-w-full max-h-full">
              <img src={viewingPhoto.dataUrl} alt="" className="max-w-full max-h-[85vh] rounded-xl" />
              <button onClick={() => setViewingPhoto(null)} className="absolute top-2 right-2 w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}>
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BottomNav({ view, setView, hasActive }) {
  const tabs = [
    { id: 'now', label: 'Now', icon: Activity },
    { id: 'week', label: 'Week', icon: Calendar },
    { id: 'schedule', label: 'Plan', icon: Sprout },
    { id: 'notes', label: 'Notes', icon: MessageSquare },
    { id: 'history', label: 'Log', icon: BarChart3 },
    { id: 'setup', label: 'Setup', icon: Settings }
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40" style={{
      background: 'rgba(11, 15, 8, 0.95)',
      backdropFilter: 'blur(10px)',
      borderTop: '1px solid #2A3525'
    }}>
      <div className="max-w-2xl mx-auto px-2 py-2 grid grid-cols-6 gap-1">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const active = view === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              className="py-2 rounded-xl flex flex-col items-center gap-1 relative"
              style={{
                background: active ? '#1E2818' : 'transparent',
                color: active ? '#FACC15' : '#8C9683'
              }}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-semibold">{tab.label}</span>
              {tab.id === 'now' && hasActive && (
                <div className="absolute top-1 right-2 w-2 h-2 rounded-full pulse-soft" style={{ background: '#A3E635' }}></div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
