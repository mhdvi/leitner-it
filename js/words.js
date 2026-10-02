// Word bank access and multiple-choice distractor selection.

import RAW from './data/words.js';
import { lang, POS_NAMES } from './i18n.js';

export const LEVELS = ['a1', 'a2', 'b1', 'b2'];
export const LEVEL_TAGS = { a1: 'A1', a2: 'A2', b1: 'B1', b2: 'B2' };

const ARTICLE = /^(un|uno|una|il|lo|la|i|gli|le|un\/una|uno\/una) (.+)$|^(un'|l'|un\/un')(.+)$/;

export const WORDS = RAW.map(([w, fa, ipa, pos, lvl, extra, g], i) => {
  const m = w.match(ARTICLE);
  return {
    id: i,
    w,
    say: w.replace(/^(un|uno)\/(una |un')/, '$1 ').replace(' … ', ', '), // spoken form: "un cliente"
    article: m ? (m[1] ? m[1] + ' ' : m[3]) : '', // "un " / "uno " / "una " / "un'"
    lemma: m ? m[2] || m[4] : w,
    gender: g, // 'm' | 'f' | ''
    fa,
    ipa,
    pos,
    lvl,
    extra, // plural with article (nouns), feminine (adjectives), "va · è andato" (verbs)
    senses: senses(fa),
  };
});

export function posLabel(word) {
  return POS_NAMES[lang()][word.pos] || '';
}

// Individual meanings of a Farsi gloss, without parenthetical notes.
function senses(fa) {
  return fa
    .split('،')
    .map((s) => s.replace(/\(.*?\)/g, '').trim())
    .filter(Boolean);
}

// ---- Distractors ------------------------------------------------------------
// "Close" wrong answers make the quiz test real knowledge:
//   * look-alike words (pesca / pesce / pace) — their meanings are what a
//     shaky memory of the word would confuse it with;
//   * words with the same part of speech and level — so the Farsi options share
//     the same grammatical shape and can't be ruled out by form alone.

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

function lookalikes(target) {
  const t = target.lemma.toLowerCase();
  const max = t.length <= 4 ? 1 : t.length <= 7 ? 2 : 3;
  const found = [];
  for (const w of WORDS) {
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
  const taken = new Set(target.senses);
  const chosen = [];
  const accept = (w) => {
    if (chosen.length >= count || w === target || chosen.includes(w)) return;
    if (w.senses.some((s) => taken.has(s))) return; // would be a second correct answer
    chosen.push(w);
    w.senses.forEach((s) => taken.add(s));
  };

  sample(lookalikes(target), 2).forEach(accept);

  const samePos = byPos.get(target.pos || '?') || WORDS;
  const li = LEVELS.indexOf(target.lvl);
  const near = samePos.filter((w) => Math.abs(LEVELS.indexOf(w.lvl) - li) <= 1);
  for (const pool of [near, samePos, WORDS]) {
    for (const w of sample(pool, 40)) accept(w);
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
