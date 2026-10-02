// Word bank access, the user's imported lists, and multiple-choice distractor selection.

import RAW from './data/words.js';
import { lang, POS_NAMES } from './i18n.js';
import { getState } from './store.js';

export const LEVELS = ['a1', 'a2', 'b1', 'b2'];
export const LEVEL_TAGS = { a1: 'A1', a2: 'A2', b1: 'B1', b2: 'B2' };

const ARTICLE = /^(un|uno|una|il|lo|la|i|gli|le|un\/una|uno\/una) (.+)$|^(un'|l'|un\/un')(.+)$/;
const GENDER = { un: 'm', uno: 'm', il: 'm', lo: 'm', i: 'm', gli: 'm', una: 'f', la: 'f', le: 'f', "un'": 'f' };

// Example rows for the downloadable word-list template.
export const TEMPLATE = [
  ['il cane', 'سگ', 'ˈkane'],
  ['una casa', 'خانه'],
  ['andare', 'رفتن'],
];

// Splits a leading article off: "una casa" -> { article: "una ", lemma: "casa" }.
function splitArticle(w) {
  const m = w.match(ARTICLE);
  if (!m) return { article: '', lemma: w };
  return { article: m[1] ? m[1] + ' ' : m[3], lemma: m[2] || m[4] };
}

// The word without its article, for comparing a list word with the bank.
export const lemmaOf = (w) => splitArticle(w.trim()).lemma.toLowerCase();

// The built-in bank. A built-in word's card key is the word itself.
export const WORDS = RAW.map(([w, fa, ipa, pos, lvl, extra, g], i) => ({
  id: i,
  key: w,
  w,
  say: w.replace(/^(un|uno)\/(una |un')/, '$1 ').replace(' … ', ', '), // spoken form: "un cliente"
  ...splitArticle(w), // article: "un " / "uno " / "una " / "un'"
  gender: g, // 'm' | 'f' | ''
  fa,
  ipa,
  pos,
  lvl,
  extra, // plural with article (nouns), feminine (adjectives), "va · è andato" (verbs)
  senses: senses(fa),
}));

export function posLabel(word) {
  return POS_NAMES[lang()][word.pos] || '';
}

// Individual meanings of a Farsi gloss, without parenthetical notes.
function senses(fa, sep = '،') {
  return fa
    .split(sep)
    .map((s) => s.replace(/\(.*?\)/g, '').trim())
    .filter(Boolean);
}

// ---- Imported lists -----------------------------------------------------------
// A list word's card key is "<list id>:<word>", so its progress never mixes with the bank's.

function listWord(list, [w, fa, ipa = ''], i) {
  const { article, lemma } = splitArticle(w);
  return {
    id: `${list.id}:${i}`,
    key: `${list.id}:${w}`,
    w,
    say: w,
    article,
    lemma,
    gender: GENDER[article.trim()] || '',
    fa,
    ipa,
    pos: '',
    lvl: 'custom',
    extra: '',
    list: list.id,
    listName: list.name,
    senses: senses(fa, /[،,]/),
  };
}

let active = null;
let activeSig = '';

// Words currently being studied: enabled lists first, then the bank if it is enabled.
// A bank word that also appears in an enabled list is studied from the list only.
export function activeWords() {
  const { settings, lists } = getState();
  const sig = `${settings.bank}|${lists.map((l) => `${l.id}:${l.enabled}:${l.words.length}:${l.name}`).join(',')}`;
  if (active && sig === activeSig) return active;
  const custom = [];
  for (const list of lists) if (list.enabled) list.words.forEach((entry, i) => custom.push(listWord(list, entry, i)));
  const inLists = new Set(custom.map((w) => w.lemma.toLowerCase()));
  const bank = settings.bank ? WORDS.filter((w) => !inLists.has(w.lemma.toLowerCase())) : [];
  active = { all: [...custom, ...bank], custom, bank };
  activeSig = sig;
  return active;
}

// ---- Distractors ------------------------------------------------------------
// "Close" wrong answers make the quiz test real knowledge:
//   * look-alike words (pesca / pesce / pace) — their meanings are what a
//     shaky memory of the word would confuse it with;
//   * words with the same part of speech and level — so the Farsi options share
//     the same grammatical shape and can't be ruled out by form alone.
// Options always draw on the whole bank too, so even a 10-word list gets real choices.

const byPos = new Map();
for (const w of WORDS) {
  const key = w.pos || '?';
  if (!byPos.has(key)) byPos.set(key, []);
  byPos.get(key).push(w);
}

function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function lookalikes(target, pool) {
  const t = target.lemma.toLowerCase();
  const max = t.length <= 4 ? 1 : t.length <= 7 ? 2 : 3;
  const found = [];
  for (const w of pool) {
    if (w === target) continue;
    const s = w.lemma.toLowerCase();
    if (s[0] !== t[0] && s.slice(-3) !== t.slice(-3)) continue;
    const d = editDistance(t, s, max);
    if (d <= max) found.push({ w, d });
  }
  found.sort((a, b) => a.d - b.d || Math.random() - 0.5);
  return found.slice(0, 6).map((x) => x.w);
}

function sample(arr, n) {
  const a = [...arr];
  const out = [];
  while (a.length && out.length < n) out.push(a.splice(Math.floor(Math.random() * a.length), 1)[0]);
  return out;
}

export function distractors(target, count = 4) {
  const { custom } = activeWords();
  const pool = [...custom, ...WORDS];
  // A list word is tested against other words of its own list first, when there are enough.
  const sameList = target.list ? custom.filter((w) => w.list === target.list) : [];
  const self = target.lemma.toLowerCase();
  const taken = new Set(target.senses);
  const chosen = [];
  const accept = (w) => {
    if (chosen.length >= count || w === target || chosen.includes(w)) return;
    if (w.lemma.toLowerCase() === self) return; // the same word from another source
    if (w.senses.some((s) => taken.has(s))) return; // would be a second correct answer
    chosen.push(w);
    w.senses.forEach((s) => taken.add(s));
  };

  sample(lookalikes(target, pool), 2).forEach(accept);

  // List words have no part of speech or level, so they draw from the whole bank.
  const samePos = target.list ? WORDS : byPos.get(target.pos || '?') || WORDS;
  const li = LEVELS.indexOf(target.lvl);
  const near = li < 0 ? samePos : samePos.filter((w) => Math.abs(LEVELS.indexOf(w.lvl) - li) <= 1);
  for (const p of [sameList.length >= 12 ? sameList : [], near, samePos, pool]) {
    for (const w of sample(p, 40)) accept(w);
    if (chosen.length >= count) break;
  }
  return chosen;
}

export function buildQuestion(word) {
  const options = [word, ...distractors(word)];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return { word, options, answer: options.indexOf(word) };
}
