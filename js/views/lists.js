// Settings section for the user's own word lists: add (paste or file), switch on/off, export, delete.

import { h, icon, fmt, toast, confirmDialog } from '../ui.js';
import { getState, settings, updateSettings, lists, addList, setListEnabled, removeList } from '../store.js';
import { WORDS, TEMPLATE, lemmaOf } from '../words.js';
import { parseList, readTextFile, toCSV, downloadText, MAX_WORDS } from '../wordlists.js';
import { t, lang } from '../i18n.js';
import { sfx } from '../sfx.js';

const templateCSV = () => toCSV(TEMPLATE);
const downloadTemplate = () => downloadText(templateCSV(), 'word-list-template.csv');

// `row` and `toggle` are the settings view's own controls, so the section matches the page.
export function listsSection({ row, toggle }) {
  const el = h('section.card.settings-group');

  function started(list) {
    const cards = getState().cards;
    return list.words.filter(([w]) => cards[`${list.id}:${w}`]).length;
  }

  // At least one source has to stay on, or there would be nothing to study.
  function enabledCount() {
    return (settings().bank ? 1 : 0) + lists().filter((l) => l.enabled).length;
  }

  function sourceToggle(on, onChange, label) {
    const sw = toggle(on, (v) => {
      if (!v && enabledCount() <= 1) {
        sw.setAttribute('aria-checked', 'true');
        toast(t('keepOneList'));
        return;
      }
      onChange(v);
      render();
    }, label);
    return sw;
  }

  function render() {
    el.replaceChildren(
      h('h2', t('wordLists')),
      h('p.group-note', icon('layers'), h('span', t('listsNote'))),
      row(t('bankWords'), t('bankDesc', { n: WORDS.length }), sourceToggle(settings().bank, (v) => updateSettings({ bank: v }), t('bankWords'))),
      ...lists().map((list) =>
        row(
          list.name,
          t('listDesc', { n: list.words.length, started: started(list), paused: !list.enabled }),
          h(
            'div.list-controls',
            h('button.icon-btn.sm', { 'aria-label': t('exportList', { name: list.name }), title: t('exportCsv'), onclick: () => exportList(list) }, icon('download')),
            h('button.icon-btn.sm.danger-text', { 'aria-label': t('deleteList', { name: list.name }), title: t('deleteListShort'), onclick: () => deleteList(list) }, icon('trash')),
            sourceToggle(list.enabled, (v) => setListEnabled(list.id, v), t('studyList', { name: list.name })),
          ),
        ),
      ),
      h(
        'div.list-actions',
        h('button.btn.primary', { onclick: () => openAddDialog(render) }, icon('upload'), t('addList')),
        h('button.btn.ghost', { onclick: downloadTemplate }, icon('download'), t('template')),
      ),
    );
  }

  function exportList(list) {
    sfx.tap();
    downloadText(toCSV(list.words), `${list.name.replace(/[\\/:*?"<>|]+/g, '-')}.csv`);
  }

  async function deleteList(list) {
    const n = started(list);
    const ok = await confirmDialog({
      title: t('deleteListTitle', { name: list.name }),
      body: t('deleteListBody', { n: list.words.length, started: n }),
      confirm: t('delete'),
      danger: true,
    });
    if (!ok) return;
    const wasOnlySource = list.enabled && enabledCount() <= 1;
    removeList(list.id);
    // Deleting the only enabled source: fall back to the built-in words.
    if (wasOnlySource) updateSettings({ bank: true });
    toast(t('listDeleted'));
    render();
  }

  render();
  return el;
}

// ---- Add-a-list dialog ----------------------------------------------------------

function defaultName() {
  const names = new Set(lists().map((l) => l.name));
  let n = lists().length + 1;
  while (names.has(t('myList', { n: fmt(n) }))) n += 1;
  return t('myList', { n: fmt(n) });
}

function openAddDialog(onAdded) {
  const bankWords = new Set(WORDS.map((w) => w.lemma.toLowerCase()));
  let parsed = { words: [], skipped: [], duplicates: 0, truncated: false };
  const firstName = defaultName();

  const name = h('input.text-input', { type: 'text', value: firstName, maxlength: 60, 'aria-label': t('listName') });
  const text = h('textarea.text-area', {
    rows: 8,
    spellcheck: false,
    dir: 'auto',
    placeholder: t('listPlaceholder'),
    'aria-label': t('wordsAndMeanings'),
    oninput: update,
  });
  const file = h('input', {
    type: 'file',
    accept: '.csv,.txt,.tsv,text/csv,text/plain',
    hidden: true,
    onchange: async (e) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (!f) return;
      text.value = await readTextFile(f);
      if (name.value === firstName) name.value = f.name.replace(/\.[^.]+$/, '').slice(0, 60);
      update();
    },
  });
  const summary = h('div.import-summary', { 'aria-live': 'polite' });
  const add = h('button.btn.primary', { onclick: submit, disabled: true }, t('addListBtn'));

  function update() {
    parsed = parseList(text.value);
    const n = parsed.words.length;
    const known = parsed.words.filter(([w]) => bankWords.has(lemmaOf(w))).length;
    const parts = [];
    if (n) parts.push(h('span.ok', icon('check'), t('wordsReady', { n })));
    if (parsed.skipped.length) {
      const lines = parsed.skipped.slice(0, 5).map(fmt).join(lang() === 'fa' ? '، ' : ', ') + (parsed.skipped.length > 5 ? '…' : '');
      parts.push(h('span.warn', t('linesSkipped', { n: parsed.skipped.length, lines })));
    }
    if (parsed.duplicates) parts.push(h('span', t('duplicatesIgnored', { n: parsed.duplicates })));
    if (known) parts.push(h('span', t('alsoInBank', { n: known })));
    if (parsed.truncated) parts.push(h('span.warn', t('truncated', { n: MAX_WORDS })));
    summary.replaceChildren(...parts);
    add.disabled = !n || !name.value.trim();
  }
  name.addEventListener('input', update);

  function close() {
    overlay.classList.remove('in');
    document.removeEventListener('keydown', onKey, true);
    setTimeout(() => overlay.remove(), 260);
  }

  function submit() {
    if (!parsed.words.length) return;
    const list = addList(name.value.trim(), parsed.words);
    if (!list) {
      toast(t('noStorage'), 'bad');
      return;
    }
    sfx.correct();
    toast(t('listAdded', { name: list.name, n: list.words.length }), 'good');
    close();
    onAdded();
  }

  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };

  const overlay = h(
    'div.overlay',
    { onclick: (e) => e.target === overlay && close() },
    h(
      'div.dialog.wide',
      { role: 'dialog', 'aria-modal': 'true', 'aria-label': t('addList') },
      h('h2', t('addList')),
      h('p', t('addListHelp')),
      h('label.field', h('span', t('listName')), name),
      text,
      h(
        'div.dialog-tools',
        h('button.btn.ghost', { onclick: () => file.click() }, icon('upload'), t('chooseFile')),
        h('button.link-btn', { onclick: downloadTemplate }, t('downloadTemplate')),
        file,
      ),
      summary,
      h('div.dialog-actions', h('button.btn.ghost', { onclick: close }, t('cancel')), add),
    ),
  );
  document.body.append(overlay);
  document.addEventListener('keydown', onKey, true);
  requestAnimationFrame(() => {
    overlay.classList.add('in');
    text.focus();
  });
}
