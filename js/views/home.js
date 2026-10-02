import { h, icon, fmt, countUp } from '../ui.js';
import { getState, settings, dayStats, streak } from '../store.js';
import { boxCounts, dueCounts, plan, buildSession } from '../leitner.js';
import { WORDS } from '../words.js';
import { boxChart } from '../charts.js';
import { t, dateLine, pct } from '../i18n.js';
import { go } from '../router.js';
import { sfx, unlock as unlockAudio } from '../sfx.js';
import { unlock as unlockSpeech } from '../speech.js';

export function homeView() {
  const s = settings();
  const counts = boxCounts();
  const due = dueCounts();
  const today = dayStats();
  const p = plan();
  const learning = WORDS.length - counts[0];
  const goalDone = today.goal;
  const days = streak();

  const start = () => {
    unlockAudio();
    unlockSpeech();
    const words = buildSession(s.daily);
    if (!words.length) return;
    sfx.start();
    go('session', { words, before: boxCounts(), extra: goalDone });
  };

  const total = p.reviews + p.fresh;
  const heroNum = h('span.hero-num', fmt(0));
  const startBtn = h(
    'button.btn.primary.xl.start',
    { onclick: start, disabled: !total },
    h('span', goalDone ? t('practiceMore') : t('start')),
    icon('arrowRight'),
  );

  const hero = h(
    'section.card.hero',
    h('div.hero-top', h('span.eyebrow', dateLine()), goalDone && h('span.pill.good', icon('check'), t('goalDone'))),
    h(
      'div.hero-main',
      h('div.hero-figure', heroNum, h('span.hero-unit', t('cards', { n: total }))),
      h('p.hero-sub', !total ? t('allLearned') : t(goalDone ? 'extraRound' : 'today', { x: breakdown(p) })),
    ),
    startBtn,
    h('div.hero-keys', h('kbd', 'Enter'), t('toStart')),
  );

  const chart = boxChart(counts, due);
  const chartCard = h(
    'section.card.boxes-card',
    h(
      'header.card-head',
      h('div', h('h2', t('boxesTitle')), h('p.muted', t('boxesSub', { learning, notStarted: counts[0], total: WORDS.length }))),
    ),
    chart,
    h('p.chart-note', t('chartNote')),
  );

  const acc = accuracy();
  const stats = h(
    'section.stats',
    stat('flame', days, t('streak'), 'streak'),
    stat('target', acc === null ? '—' : pct(acc), t('accuracy'), 'acc'),
    stat('award', counts[5], t('inBox5'), 'master'),
  );

  const el = h(
    'main.home',
    h(
      'header.topbar',
      h('div.brand', logo(), h('span', t('brand'), h('em', t('brandSub')))),
      h('button.icon-btn', { 'aria-label': t('settings'), onclick: () => (sfx.tap(), go('settings')) }, icon('settings')),
    ),
    hero,
    chartCard,
    stats,
    h('footer.privacy', icon('lock'), t('privacy')),
  );

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.repeat && document.activeElement?.tagName !== 'BUTTON') start();
  };

  return {
    el,
    mount() {
      countUp(heroNum, total, { duration: 700, delay: 120 });
      chart.animateIn(200);
      el.querySelectorAll('[data-count]').forEach((n, i) => countUp(n, Number(n.dataset.count), { delay: 300 + i * 80 }));
      document.addEventListener('keydown', onKey);
    },
    unmount() {
      document.removeEventListener('keydown', onKey);
    },
  };
}

function breakdown(p) {
  const parts = [];
  if (p.reviews) parts.push(t('reviews', { n: p.reviews }));
  if (p.fresh) parts.push(t('newWords', { n: p.fresh }));
  return parts.join(t('joinParts')) || t('nothingDue');
}

function stat(iconName, value, label, cls) {
  const num = typeof value === 'number' ? h('b', { 'data-count': value }, fmt(0)) : h('b', value);
  return h('div.stat', { class: cls }, h('span.stat-icon', icon(iconName)), h('div', num, h('span', label)));
}

function accuracy() {
  let q = 0;
  let c = 0;
  for (const d of Object.values(getState().days)) {
    q += d.q;
    c += d.c;
  }
  return q ? Math.round((c / q) * 100) : null;
}

export function logo() {
  const el = h('span.logo', { 'aria-hidden': 'true' });
  for (let i = 1; i <= 5; i++) el.append(h('i', { style: { '--i': i } }));
  return el;
}
