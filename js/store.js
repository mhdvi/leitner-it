// All progress lives in this browser's localStorage under one key.
// The whole state is small (a few hundred KB at most), so a single JSON blob
// written synchronously after every answer is both simple and crash-safe.

const KEY = 'leitner-it:v1';
const APP_ID = 'leitner-italiano';
const VERSION = 1;

export const DEFAULT_SETTINGS = {
  daily: 20,          // questions per daily session
  level: 'a1',        // CEFR level new words start from
  timer: 10,          // seconds per question
  voice: '',          // voiceURI of the preferred speech voice ('' = auto)
  rate: 0.9,          // speech rate
  autoSpeak: true,    // pronounce each word when its card appears
  sfx: true,          // sound effects
  volume: 0.7,        // sound effect volume 0..1
  theme: 'auto',      // 'auto' | 'light' | 'dark'
  ui: 'fa',           // interface language: 'fa' | 'en'
};

function fresh() {
  return {
    app: APP_ID,
    version: VERSION,
    createdAt: new Date().toISOString(),
    onboarded: false,
    settings: { ...DEFAULT_SETTINGS },
    cards: {},     // word -> { b: box 1-5, d: due day, n: times seen, c: correct, w: wrong, t: last day }
    days: {},      // 'YYYY-MM-DD' -> { q: answered, c: correct, goal: daily goal reached }
    sessions: [],  // recent session summaries, newest last
  };
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) {
    console.warn('Could not read saved progress', e);
  }
  return fresh();
}

function normalize(s) {
  const base = fresh();
  return {
    ...base,
    ...s,
    settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) },
    cards: s.cards || {},
    days: s.days || {},
    sessions: Array.isArray(s.sessions) ? s.sessions : [],
  };
}

export function getState() {
  return state;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.error('Could not save progress', e);
    return false;
  }
}

export function settings() {
  return state.settings;
}

export function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  save();
}

export function setOnboarded() {
  state.onboarded = true;
  save();
}

export function resetProgress() {
  const keep = state.settings;
  state = fresh();
  state.settings = keep;
  state.onboarded = true;
  save();
}

// ---- Days -------------------------------------------------------------------

// Local calendar day as an integer, so "due tomorrow" follows the user's midnight.
export function today() {
  const d = new Date();
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
}

export function dayKey(day = today()) {
  return new Date(day * 864e5).toISOString().slice(0, 10);
}

export function dayStats(day = today()) {
  return state.days[dayKey(day)] || { q: 0, c: 0, goal: false };
}

export function recordAnswer(correct) {
  const k = dayKey();
  const d = state.days[k] || { q: 0, c: 0, goal: false };
  d.q += 1;
  if (correct) d.c += 1;
  state.days[k] = d;
}

export function markGoal() {
  const k = dayKey();
  state.days[k] = { ...(state.days[k] || { q: 0, c: 0 }), goal: true };
}

// Consecutive days (ending today, or yesterday if today isn't done yet) with the goal reached.
export function streak() {
  let day = today();
  if (!dayStats(day).goal) day -= 1;
  let n = 0;
  while (dayStats(day).goal) {
    n += 1;
    day -= 1;
  }
  return n;
}

export function addSession(summary) {
  state.sessions.push(summary);
  if (state.sessions.length > 120) state.sessions.splice(0, state.sessions.length - 120);
}

// ---- Export / import ----------------------------------------------------------

export function exportData() {
  return JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 1);
}

// Errors carry an i18n key as their message (and `vars` for its placeholders).
function fail(key, vars) {
  const e = new Error(key);
  e.vars = vars;
  throw e;
}

export function importData(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    fail('errJson');
  }
  if (!data || data.app !== APP_ID || typeof data.cards !== 'object') fail('errNotBackup');
  if (data.version > VERSION) fail('errNewer');
  for (const [word, c] of Object.entries(data.cards)) {
    if (!c || !(c.b >= 1 && c.b <= 5) || typeof c.d !== 'number') fail('errEntry', { w: word });
  }
  delete data.exportedAt;
  state = normalize(data);
  state.onboarded = true;
  save();
  return Object.keys(state.cards).length;
}

export function storageBytes() {
  try {
    return (localStorage.getItem(KEY) || '').length * 2;
  } catch {
    return 0;
  }
}

// Ask the browser not to evict our data under storage pressure.
export async function requestPersistence() {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) || false;
  } catch {
    return false;
  }
}
