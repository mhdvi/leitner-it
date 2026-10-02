import { h, icon, fmt, toast, confirmDialog } from '../ui.js';
import {
  getState, settings, updateSettings, exportData, importData, resetProgress, storageBytes, requestPersistence, dayKey,
} from '../store.js';
import { WORDS, LEVELS, LEVEL_TAGS } from '../words.js';
import { t, lang, applyLang, LEVEL_NAMES } from '../i18n.js';
import { italianVoices, onVoices, currentVoice, speak, supported as speechSupported } from '../speech.js';
import { sfx } from '../sfx.js';
import { applyTheme } from '../theme.js';
import { go } from '../router.js';
import { estimate } from './welcome.js';

export function settingsView() {
  const s = () => settings();
  const cleanups = [];

  // ---- Controls ----

  function stepper(value, { min, max, step, onChange }) {
    let v = value;
    const out = h('b.stepper-value', fmt(v));
    const set = (n) => {
      v = Math.max(min, Math.min(max, n));
      out.textContent = fmt(v);
      sfx.select();
      onChange(v);
    };
    return h(
      'div.stepper',
      { dir: 'ltr' },
      h('button.icon-btn.sm', { 'aria-label': t('decrease'), onclick: () => set(v - step) }, '−'),
      out,
      h('button.icon-btn.sm', { 'aria-label': t('increase'), onclick: () => set(v + step) }, '+'),
    );
  }

  function segmented(options, value, onChange, label) {
    const btns = options.map(([val, text, attrs]) =>
      h(
        'button.seg',
        {
          ...attrs,
          'aria-pressed': String(val === value),
          onclick: (e) => {
            btns.forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
            sfx.select();
            onChange(val);
          },
        },
        text,
      ),
    );
    return h('div.segmented', { role: 'group', 'aria-label': label }, btns);
  }

  function toggle(value, onChange, label) {
    const btn = h('button.switch', {
      role: 'switch',
      'aria-checked': String(value),
      'aria-label': label,
      onclick: () => {
        const on = btn.getAttribute('aria-checked') !== 'true';
        btn.setAttribute('aria-checked', String(on));
        onChange(on);
        sfx.toggle(on);
      },
    });
    return btn;
  }

  function range(value, { min, max, step, onChange, format }) {
    const out = h('span.range-value', format(value));
    const input = h('input', {
      type: 'range', min, max, step, value,
      oninput: (e) => {
        out.textContent = format(Number(e.target.value));
        onChange(Number(e.target.value));
      },
    });
    const sync = () => input.style.setProperty('--p', ((input.value - min) / (max - min)) * 100 + '%');
    input.addEventListener('input', sync);
    sync();
    return h('div.range', input, out);
  }

  const row = (title, desc, control) =>
    h('div.row', h('div.row-text', h('span.row-title', title), desc && h('span.row-desc', desc)), control);

  const section = (title, ...rows) => h('section.card.settings-group', h('h2', title), ...rows);

  // ---- Learning ----

  const dailyDesc = h('span', estimate(s().daily));
  const learning = section(
    t('learning'),
    row(t('perDay'), dailyDesc, stepper(s().daily, {
      min: 5, max: 200, step: 5,
      onChange: (v) => {
        updateSettings({ daily: v });
        dailyDesc.textContent = estimate(v);
      },
    })),
    row(
      t('startFrom'),
      t('startFromDesc'),
      h(
        'select.select',
        { onchange: (e) => (updateSettings({ level: e.target.value }), sfx.select()), 'aria-label': t('startFrom') },
        LEVELS.map((l) => h('option', { value: l, selected: s().level === l }, `${LEVEL_TAGS[l]} · ${LEVEL_NAMES[lang()][l]}`)),
      ),
    ),
    row(t('timePerQ'), t('timePerQDesc'), segmented(
      [5, 10, 15, 20].map((n) => [n, t('secShort', { n })]),
      s().timer,
      (v) => updateSettings({ timer: v }),
      t('timePerQ'),
    )),
  );

  // ---- Sound ----

  const voiceSelect = h('select.select', {
    'aria-label': t('voice'),
    dir: 'ltr',
    onchange: (e) => {
      updateSettings({ voice: e.target.value });
      speak('Pronuncia');
    },
  });
  const fillVoices = () => {
    const list = italianVoices();
    const cur = currentVoice();
    voiceSelect.replaceChildren(
      h('option', { value: '', selected: !s().voice }, `${t('automatic')}${cur && !s().voice ? ` (${cur.name})` : ''}`),
      ...list
        .slice()
        .sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name))
        .map((v) => h('option', { value: v.voiceURI, selected: s().voice === v.voiceURI }, `${v.name} — ${v.lang}`)),
    );
  };
  fillVoices();
  cleanups.push(onVoices(fillVoices));

  const sound = section(
    t('sound'),
    row(t('autoSpeak'), t('autoSpeakDesc'), toggle(s().autoSpeak, (v) => updateSettings({ autoSpeak: v }), t('autoSpeak'))),
    speechSupported
      ? row(t('voice'), t('voiceDesc'), voiceSelect)
      : row(t('voice'), t('voiceNone'), h('span.muted', t('unavailable'))),
    speechSupported &&
      row(t('rate'), null, range(s().rate, {
        min: 0.6, max: 1.2, step: 0.05,
        format: (v) => `${fmt(Number(v.toFixed(2)))}×`,
        onChange: (v) => updateSettings({ rate: v }),
      })),
    speechSupported &&
      row(t('testVoice'), null, h('button.btn.ghost', { onclick: () => speak('Ciao! Come stai?') }, icon('speaker'), t('playSample'))),
    row(t('sfx'), null, toggle(s().sfx, (v) => updateSettings({ sfx: v }), t('sfx'))),
    row(t('volume'), null, range(s().volume, {
      min: 0, max: 1, step: 0.05,
      format: (v) => fmt(Math.round(v * 100)) + (lang() === 'fa' ? '٪' : '%'),
      onChange: (v) => updateSettings({ volume: v }),
    })),
  );
  // Preview the volume when the slider is released.
  const ranges = sound.querySelectorAll('input[type=range]');
  ranges[ranges.length - 1]?.addEventListener('change', () => sfx.correct());

  // ---- Appearance ----

  const appearance = section(
    t('appearance'),
    row(t('language'), null, segmented(
      [['fa', 'فارسی', { lang: 'fa' }], ['en', 'English', { lang: 'en' }]],
      lang(),
      (v) => {
        updateSettings({ ui: v });
        applyLang();
        go('settings', null, { replace: true });
      },
      t('language'),
    )),
    row(t('theme'), null, segmented([['auto', t('system')], ['light', t('light')], ['dark', t('dark')]], s().theme, (v) => {
      updateSettings({ theme: v });
      applyTheme(v);
    }, t('theme'))),
  );

  // ---- Data ----

  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: onImport });
  const learned = Object.keys(getState().cards).length;
  const persistNote = h('span', '');
  requestPersistence().then((ok) => {
    persistNote.textContent = ok ? t('persisted') : '';
  });

  const data = section(
    t('data'),
    h('p.group-note', icon('lock'), h('span', t('dataNote', { kb: Math.ceil(storageBytes() / 1024) }), persistNote)),
    row(t('exportTitle'), t('exportDesc', { n: learned }), h('button.btn.ghost', { onclick: onExport }, icon('download'), t('export'))),
    row(t('importTitle'), t('importDesc'), h('button.btn.ghost', { onclick: () => fileInput.click() }, icon('upload'), t('import'))),
    row(t('resetTitle'), t('resetDesc'), h('button.btn.ghost.danger-text', { onclick: onReset }, icon('trash'), t('reset'))),
    fileInput,
  );

  const about = section(t('about'), h('p.group-note', t('aboutText', { n: WORDS.length })));

  const el = h(
    'main.settings',
    h(
      'header.topbar',
      h('button.icon-btn', { 'aria-label': t('back'), onclick: () => (sfx.tap(), go('home')) }, icon('back')),
      h('h1.topbar-title', t('settings')),
      h('span.spacer'),
    ),
    learning,
    sound,
    appearance,
    data,
    about,
  );

  function onExport() {
    sfx.tap();
    const blob = new Blob([exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `leitner-italiano-backup-${dayKey()}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast(t('backupDone'), 'good');
  }

  async function onImport(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      let n = 0;
      try {
        n = Object.keys(JSON.parse(text).cards || {}).length;
      } catch {
        importData(text); // throws the translated JSON error below
      }
      const ok = await confirmDialog({
        title: t('replaceTitle'),
        body: t('replaceBody', { n }),
        confirm: t('replace'),
        danger: true,
      });
      if (!ok) return;
      importData(text);
      applyTheme();
      applyLang();
      toast(t('imported'), 'good');
      go('home');
    } catch (err) {
      toast(err.message?.startsWith('err') ? t(err.message, err.vars) : t('importFailed'), 'bad');
    }
  }

  async function onReset() {
    const ok = await confirmDialog({
      title: t('resetConfirmTitle'),
      body: t('resetConfirmBody'),
      confirm: t('reset'),
      danger: true,
    });
    if (!ok) return;
    resetProgress();
    toast(t('resetDone'));
    go('home');
  }

  const onKey = (e) => {
    if (e.key === 'Escape' && !document.querySelector('.overlay')) go('home');
  };

  return {
    el,
    mount() {
      document.addEventListener('keydown', onKey);
    },
    unmount() {
      document.removeEventListener('keydown', onKey);
      cleanups.forEach((fn) => fn());
    },
  };
}
