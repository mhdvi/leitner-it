// Leitner system with five boxes.
// A correct answer moves a card up one box; a wrong answer (or timeout) sends it back to box 1.
// Each box is reviewed on a longer interval, so well-known words come back less often.

import { getState, today, recordAnswer } from './store.js';
import { WORDS, LEVELS } from './words.js';
import { t } from './i18n.js';

export const BOXES = 5;
export const INTERVALS = [0, 1, 2, 4, 8, 16]; // days until next review, indexed by box

export function intervalLabel(box) {
  const d = INTERVALS[box];
  return d === 1 ? t('daily') : t('everyDays', { n: d });
}

export function intervalShort(box) {
  const d = INTERVALS[box];
  return d === 1 ? t('daily') : t('nDays', { n: d });
}

// Word counts per box: index 0 = not started yet, 1..5 = boxes.
export function boxCounts() {
  const counts = [WORDS.length, 0, 0, 0, 0, 0];
  for (const c of Object.values(getState().cards)) {
    counts[c.b] += 1;
    counts[0] -= 1;
  }
  return counts;
}

export function dueCounts(day = today()) {
  const counts = [0, 0, 0, 0, 0, 0];
  for (const c of Object.values(getState().cards)) if (c.d <= day) counts[c.b] += 1;
  return counts;
}

// Level order for introducing new words: the chosen level first, then harder ones, then easier.
function levelOrder(level) {
  const i = Math.max(0, LEVELS.indexOf(level));
  return [...LEVELS.slice(i), ...LEVELS.slice(0, i).reverse()];
}

// Planned composition of the next session without building it.
export function plan(n = getState().settings.daily) {
  const due = dueCounts().reduce((a, b) => a + b, 0);
  const reviews = Math.min(due, n);
  const newAvail = boxCounts()[0];
  return { reviews, fresh: Math.min(n - reviews, newAvail), dueTotal: due };
}

export function buildSession(n) {
  const { cards, settings } = getState();
  const day = today();
  const byWord = new Map(WORDS.map((w) => [w.w, w]));

  // 1. Due cards, lowest box first (the ones most at risk of being forgotten), oldest due first.
  const due = Object.entries(cards)
    .filter(([w, c]) => c.d <= day && byWord.has(w))
    .sort((a, b) => a[1].b - b[1].b || a[1].d - b[1].d || Math.random() - 0.5)
    .slice(0, n)
    .map(([w]) => byWord.get(w));

  // 2. Fill the rest with new words, in level order, most frequent first.
  const picked = [...due];
  if (picked.length < n) {
    for (const lvl of levelOrder(settings.level)) {
      for (const w of WORDS) {
        if (picked.length >= n) break;
        if (w.lvl === lvl && !cards[w.w]) picked.push(w);
      }
      if (picked.length >= n) break;
    }
  }
  return shuffle(picked);
}

// Applies an answer to the card and returns the move it caused.
export function answer(word, correct) {
  const state = getState();
  const day = today();
  const card = state.cards[word.w];
  const from = card ? card.b : 0;
  // A new word answered correctly is already known, so it skips ahead to box 2.
  const to = correct ? Math.min(Math.max(from, 1) + 1, BOXES) : 1;
  const next = card || { b: 1, d: day, n: 0, c: 0, w: 0, t: day };
  next.b = to;
  next.d = day + INTERVALS[to];
  next.n += 1;
  next.t = day;
  if (correct) next.c += 1;
  else next.w += 1;
  state.cards[word.w] = next;
  recordAnswer(correct);
  return { from, to };
}

export function boxOf(word) {
  return getState().cards[word.w]?.b || 0;
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
