import { h, icon } from '../ui.js';
import { settings, updateSettings, setOnboarded, requestPersistence } from '../store.js';
import { WORDS, LEVELS, LEVEL_TAGS } from '../words.js';
import { t, fmt, lang, applyLang, LEVEL_NAMES } from '../i18n.js';
import { speak, unlock as unlockSpeech, supported as speechSupported } from '../speech.js';
import { sfx, unlock as unlockAudio } from '../sfx.js';
import { go } from '../router.js';
import { logo } from './home.js';

export const DAILY_PRESETS = [10, 20, 30, 50];

// Survives a re-render when the interface language is switched mid-way.
let resume = null;

export function welcomeView() {
  const draft = resume?.draft || { ...settings() };
  let step = resume?.step || 0;
  resume = null;
  const steps = [intro, daily, level, sound];

  const dots = h('div.steps', steps.map((_, i) => h('i', { class: i <= step ? 'on' : '' })));
  const backBtn = h('button.icon-btn', { 'aria-label': t('back'), onclick: () => show(step - 1), style: { visibility: 'hidden' } }, icon('back'));
  const langBtn = h(
    'button.lang-btn',
    {
      onclick: () => {
        sfx.tap();
        updateSettings({ ui: lang() === 'fa' ? 'en' : 'fa' });
        applyLang();
        resume = { draft, step };
        go('welcome', null, { replace: true });
      },
      lang: lang() === 'fa' ? 'en' : 'fa',
    },
    lang() === 'fa' ? 'English' : 'فارسی',
  );
  const body = h('div.onb-body');
  const el = h('main.onboarding', h('header.onb-top', backBtn, dots, langBtn), body);

  function show(i, first = false) {
    if (i < 0 || i >= steps.length) return;
    if (!first) sfx.tap();
    const dir = i >= step ? 'fwd' : 'bwd';
    step = i;
    const panel = steps[i]();
    panel.classList.add('onb-panel', first ? 'first' : dir);
    body.replaceChildren(panel);
    [...dots.children].forEach((d, j) => d.classList.toggle('on', j <= i));
    backBtn.style.visibility = i > 0 ? 'visible' : 'hidden';
    panel.querySelector('.btn.primary')?.focus({ preventScroll: true });
  }

  function intro() {
    return h(
      'section',
      h('div.onb-hero', logo()),
      h('h1.onb-title', t('introLine1', { n: WORDS.length }), h('br'), t('introLine2'), h('br'), h('span.accent-text', t('introLine3'))),
      h('p.onb-lead', t('introLead')),
      h(
        'ul.onb-points',
        h('li', icon('layers'), h('span', t('point1'))),
        h('li', icon('clock'), h('span', t('point2'))),
        h('li', icon('lock'), h('span', t('point3'))),
      ),
      h('button.btn.primary.lg.block', { onclick: () => show(1) }, t('getStarted'), icon('arrowRight')),
    );
  }

  function daily() {
    const value = h('b.stepper-value', fmt(draft.daily));
    const minutes = h('span');
    const chips = DAILY_PRESETS.map((n) =>
      h('button.chip', { onclick: () => set(n), 'aria-pressed': String(draft.daily === n), 'data-n': n }, fmt(n)),
    );
    function set(n) {
      draft.daily = Math.max(5, Math.min(200, n));
      value.textContent = fmt(draft.daily);
      minutes.textContent = estimate(draft.daily);
      chips.forEach((c) => c.setAttribute('aria-pressed', String(Number(c.dataset.n) === draft.daily)));
      sfx.select();
      value.animate([{ transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
    }
    minutes.textContent = estimate(draft.daily);
    return h(
      'section',
      h('span.eyebrow', t('step', { n: 1 })),
      h('h1.onb-title.sm', t('dailyTitle')),
      h('p.onb-lead', t('dailyLead')),
      h(
        'div.stepper.big',
        { dir: 'ltr' },
        h('button.icon-btn', { 'aria-label': t('fewer'), onclick: () => set(draft.daily - 5) }, '−'),
        value,
        h('button.icon-btn', { 'aria-label': t('more'), onclick: () => set(draft.daily + 5) }, '+'),
      ),
      h('p.muted.center', minutes),
      h('div.chips.center', chips),
      h('button.btn.primary.lg.block', { onclick: () => show(2) }, t('continue'), icon('arrowRight')),
    );
  }

  function level() {
    const options = LEVELS.map((l) => {
      const count = WORDS.filter((w) => w.lvl === l).length;
      return h(
        'button.level-opt',
        {
          'aria-pressed': String(draft.level === l),
          onclick: (e) => {
            draft.level = l;
            sfx.select();
            e.currentTarget.parentElement.querySelectorAll('.level-opt').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
          },
        },
        h('span.lvl-tag', LEVEL_TAGS[l]),
        h('span.lvl-name', LEVEL_NAMES[lang()][l]),
        h('span.lvl-count', t('wordCount', { n: count })),
      );
    });
    return h(
      'section',
      h('span.eyebrow', t('step', { n: 2 })),
      h('h1.onb-title.sm', t('levelTitle')),
      h('p.onb-lead', t('levelLead')),
      h('div.level-list', options),
      h('button.btn.primary.lg.block', { onclick: () => show(3) }, t('continue'), icon('arrowRight')),
    );
  }

  function sound() {
    const available = speechSupported;
    const play = h(
      'button.sound-test',
      {
        onclick: async () => {
          unlockAudio();
          unlockSpeech();
          play.classList.add('speaking');
          await speak('Ciao e benvenuti', { rate: draft.rate });
          play.classList.remove('speaking');
        },
        disabled: !available,
      },
      icon('speaker'),
      h('span', available ? t('tapToHear') : t('speechNA')),
    );
    return h(
      'section',
      h('span.eyebrow', t('step', { n: 3 })),
      h('h1.onb-title.sm', t('soundTitle')),
      h('p.onb-lead', available ? t('soundLead') : t('noSpeech')),
      play,
      h('button.btn.primary.lg.block', { onclick: finish }, t('startLearning'), icon('arrowRight')),
    );
  }

  function finish() {
    unlockAudio();
    updateSettings({ daily: draft.daily, level: draft.level });
    setOnboarded();
    requestPersistence();
    sfx.start();
    go('home', null, { replace: true });
  }

  return {
    el,
    mount() {
      show(step, true);
    },
  };
}

export function estimate(n) {
  return t('minutes', { n: Math.max(1, Math.round((n * 7) / 60)) });
}
