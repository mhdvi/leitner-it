import { h, icon, svg, countUp, fmt, burst, reduceMotion, wait } from '../ui.js';
import { streak } from '../store.js';
import { flowChart } from '../charts.js';
import { t } from '../i18n.js';
import { speak, supported as speechSupported } from '../speech.js';
import { sfx } from '../sfx.js';
import { go } from '../router.js';
import { foreignWord } from './session.js';

const R = 52;
const C = 2 * Math.PI * R;

export function summaryView(params) {
  if (!params.results?.length) return { redirect: 'home' };
  const { results, before, moves, ms, completed } = params;
  const n = results.length;
  const correct = results.filter((r) => r.correct).length;
  const pct = Math.round((correct / n) * 100);
  const missed = results.filter((r) => !r.correct);
  const days = streak();

  const title = t(pct === 100 ? 'titleFlawless' : pct >= 85 ? 'titleGreat' : pct >= 60 ? 'titleGood' : 'titleLesson');
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  const time = [mins ? t('mins', { n: mins }) : '', t('secs', { n: secs })].filter(Boolean).join(' ');

  const pctNum = h('span.ring-num', fmt(0));
  const ring = svg(
    `<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="ring-bg" cx="60" cy="60" r="${R}"/><circle class="ring-fg" cx="60" cy="60" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C}"/></svg>`,
  );
  const ringFg = ring.querySelector('.ring-fg');

  const flow = flowChart(before, moves);

  const el = h(
    'main.summary',
    h(
      'section.card.result',
      h('div.result-ring', ring, h('div.ring-label', pctNum, h('small', document.documentElement.lang === 'fa' ? '٪' : '%'))),
      h(
        'div.result-text',
        h('span.eyebrow', t(completed ? 'complete' : 'endedEarly')),
        h('h1', title),
        h('p.muted', t('correctOf', { c: correct, n, time })),
        days > 0 && completed && h('span.pill.streak', icon('flame'), t('streakPill', { n: days })),
      ),
    ),
    h('section.card', h('header.card-head', h('div', h('h2', t('howMoved')), h('p.muted', t('dotsExplain')))), flow),
    missed.length &&
      h(
        'section.card.missed',
        h('header.card-head', h('div', h('h2', t('revisit')), h('p.muted', t('revisitSub')))),
        h(
          'ul.word-list',
          missed.map((r, i) =>
            h(
              'li',
              { style: { '--i': i } },
              h('div.wl-en', { dir: 'ltr' }, foreignWord(r.word, 'b'), r.word.ipa && h('span.ipa', `/${r.word.ipa}/`)),
              h('span.wl-fa', { dir: 'rtl', lang: 'fa' }, r.word.fa),
              speechSupported &&
                h(
                  'button.icon-btn.sm',
                  {
                    'aria-label': t('pronounce', { w: r.word.w }),
                    onclick: (e) => {
                      const b = e.currentTarget;
                      b.classList.add('speaking');
                      speak(r.word.say).then(() => b.classList.remove('speaking'));
                    },
                  },
                  icon('speaker'),
                ),
            ),
          ),
        ),
      ),
    h('div.summary-actions', h('button.btn.primary.lg', { onclick: () => (sfx.tap(), go('home')) }, t('done'))),
  );

  const onKey = (e) => {
    if (e.key === 'Enter' && document.activeElement?.tagName !== 'BUTTON') go('home');
  };

  return {
    el,
    async mount() {
      document.addEventListener('keydown', onKey);
      sfx.complete();
      await wait(reduceMotion() ? 0 : 250);
      ringFg.style.transition = reduceMotion() ? 'none' : 'stroke-dashoffset 1.3s cubic-bezier(.2,.8,.2,1)';
      ringFg.setAttribute('stroke-dashoffset', String(C * (1 - pct / 100)));
      countUp(pctNum, pct, { duration: 1300 });
      if (pct >= 85) {
        setTimeout(() => {
          const r = ring.getBoundingClientRect();
          burst(r.left + r.width / 2, r.top + r.height / 2, {
            count: 22,
            spread: 120,
            colors: ['var(--box-1)', 'var(--box-3)', 'var(--box-5)', 'var(--good)'],
          });
        }, 1100);
      }
      await wait(reduceMotion() ? 0 : 900);
      const r = flow.getBoundingClientRect();
      if (r.bottom > window.innerHeight) {
        flow.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' });
        await wait(reduceMotion() ? 0 : 550);
      }
      flow.play();
    },
    unmount() {
      document.removeEventListener('keydown', onKey);
    },
  };
}
