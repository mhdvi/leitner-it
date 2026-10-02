"""Builds js/data/words.js from the Farsi translation files in tools/fa/.

Sources (downloaded into tools/.cache on first run):
  - Kelly list for Italian (corpus-based, CEFR-banded; Kilgarriff et al. 2014)
  - OpenSubtitles 2018 word frequencies (hermitdave/FrequencyWords, CC BY-SA 4.0)
  - Morph-it! 0.48 (Zanchetta & Baroni, LGPL), to lemmatise the subtitle counts
  - English Wiktionary via kaikki.org (IPA, gender, plurals, verb forms, auxiliary; CC BY-SA)

Levels: each word is ranked by the better of its Kelly position and its subtitle
frequency, so everyday spoken words (latte, frigorifero) are not held back by the
newspaper-heavy Kelly corpus. The ranked list is then cut into A1-B2 bands.

Translation lines look like `word=farsi`. Two optional overrides may follow:
  `word=farsi|pos`              fix the part of speech
  `word=farsi|pos|display`      fix the displayed form (e.g. `i soldi`, `la gente`)
  `word=farsi|pos|display|b2`   also force the level (empty fields keep the default)
A meaning of `-` drops the word. Nouns are shown with un / uno / una / un' unless overridden.

Requires xlrd (pip install xlrd) and curl.
Usage:  python tools/build_words.py
"""
import glob, json, os, re, subprocess, sys, tarfile
from collections import defaultdict

ROOT = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(ROOT, '.cache')
OUT = os.path.join(ROOT, '..', 'js', 'data', 'words.js')

SOURCES = {
    'it_m3.xls': 'https://raw.githubusercontent.com/kotoshu/frequency-list-kelly/HEAD/references/it_m3.xls',
    'it_freq.txt': 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/it/it_50k.txt',
    'morph-it.tgz': 'https://docs.sslmit.unibo.it/lib/exe/fetch.php?media=resources:morph-it.tgz',
}
WIKTIONARY = 'it_wiktionary.json'  # made by extract_wiktionary.py
LEVELS = ['a1', 'a2', 'b1', 'b2']
BANDS = [1000, 2200, 3900]  # rank cut-offs for A1, A2, B1; the rest is B2
POS = ('n', 'v', 'adj', 'adv', 'prep', 'conj', 'excl', 'pron', 'num')
KELLY_POS = {'n': 'n', 'v': 'v', 'adj': 'adj', 'adv': 'adv', 'prep': 'prep', 'pron': 'pron', 'conj': 'conj',
             'num': 'num', 'int': 'excl', 'det': 'adj'}
VOWELS = 'aeiouàèéìòóùAEIOU'
MODALS = {'potere', 'dovere', 'volere', 'sapere'}  # ha potuto (essere only when the next verb takes it)
# Where Wiktionary's first-listed auxiliary is not the everyday one.
AUX = {'correre': 'a', 'saltare': 'a', 'mancare': 'e', 'esplodere': 'e', 'crescere': 'e'}
ELIDED = {"d'": 'd', "l'": 'l', "un'": 'un', "all'": 'all', "dell'": 'dell', "nell'": 'nell', "sull'": 'sull'}
ARTICLE_RE = re.compile(r"^(un|uno|una|il|lo|la|i|gli|le|un/una|uno/una) |^(un'|l'|un/un')")
ARTICLES = {'un': 'm', 'uno': 'm', 'il': 'm', 'lo': 'm', 'i': 'm', 'gli': 'm', 'una': 'f', 'la': 'f', 'le': 'f'}


def fetch(name):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        print('downloading', name)
        # curl rather than urllib: some Python installs ship an outdated certificate store.
        subprocess.run(['curl', '-sSL', '-o', path, SOURCES[name]], check=True)
    return path


def wiktionary():
    path = os.path.join(CACHE, WIKTIONARY)
    if not os.path.exists(path):
        print('extracting Wiktionary (streams ~770 MB once)')
        from extract_wiktionary import URL, extract
        curl = subprocess.Popen(['curl', '-sSL', URL], stdout=subprocess.PIPE)
        extract(path, curl.stdout)
        curl.wait()
    return json.load(open(path, encoding='utf-8'))


def morphit():
    folder = os.path.join(CACHE, 'current_version')
    if not os.path.isdir(folder):
        tarfile.open(fetch('morph-it.tgz')).extractall(CACHE)
    return os.path.join(folder, 'morph-it_048.txt')


def ranks():
    """Kelly positions, subtitle lemma ranks and subtitle form ranks."""
    import xlrd
    sheet = xlrd.open_workbook(fetch('it_m3.xls')).sheet_by_index(0)
    kelly = {}
    for r in range(1, sheet.nrows):
        w, pos, lvl = (str(v).strip() for v in sheet.row_values(r)[:3])
        if w not in kelly:
            kelly[w] = (r if lvl else None, KELLY_POS.get(pos, ''))

    lemmas = defaultdict(set)
    for line in open(morphit(), encoding='latin-1'):
        p = line.rstrip('\n').split('\t')
        if len(p) == 3 and not p[2].startswith(('NPR', 'PON', 'SENT', 'SYM')):
            lemmas[p[0]].add(p[1])
    lemma_freq, form_rank = defaultdict(int), {}
    for i, line in enumerate(open(fetch('it_freq.txt'), encoding='utf-8')):
        form, count = line.split()
        form_rank.setdefault(form, i)
        for l in lemmas.get(form, ()):
            lemma_freq[l] += int(count)
    sub = {l: i for i, l in enumerate(sorted(lemma_freq, key=lemma_freq.get, reverse=True))}
    return kelly, sub, form_rank


def base_verb(w):
    """alzarsi -> alzare, accorgersi -> accorgere."""
    for a, b in (('arsi', 'are'), ('ersi', 'ere'), ('irsi', 'ire'), ('rsi', 're')):
        if w.endswith(a):
            return w[: -len(a)] + b
    return w


def masc_article(w, plural=False):
    lw = w.lower()
    impure = (lw[:1] == 's' and lw[1:2] not in ('',) and lw[1] not in VOWELS) or lw[:1] in 'zxy' or lw[:2] in ('gn', 'ps', 'pn')
    if plural:
        return 'gli ' if impure or lw[:1] in VOWELS else 'i '
    return 'uno ' if impure else 'un '


def regular_plural(w, g):
    if w.endswith('io'):
        return [w[:-1], w[:-2] + 'ii']
    if w.endswith(('o', 'e')):
        return [w[:-1] + 'i']
    if w.endswith('a'):
        return [w[:-1] + ('e' if g == 'f' else 'i')]
    return []


def main():
    translations = {}
    for f in sorted(glob.glob(os.path.join(ROOT, 'fa', '*.txt'))):
        for line in open(f, encoding='utf-8'):
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            key, _, rest = line.partition('=')
            parts = rest.split('|')
            if parts[0] != '-':
                translations[key] = parts

    wk = wiktionary()
    kelly, sub, form_rank = ranks()

    def rank(w):
        k = kelly.get(w, (None, ''))[0]
        if w not in kelly:  # subtitle-only word: rank by its own form, not by summed lemma counts
            s = form_rank.get(w)
        else:
            s = None if ' ' in w else sub.get(base_verb(w))
        if k is None and s is None:
            return 3500 if w in kelly else 9999
        return min(x for x in (k, s) if x is not None)

    def entries(w, pos):
        es = wk.get(w) or []
        return [e for e in es if e['pos'] == pos] + [e for e in es if e['pos'] != pos]

    def ipa_of(w, pos):
        if w in ELIDED:
            return ELIDED[w]
        for e in entries(w, pos):
            if e.get('ipa'):
                return e['ipa']
        if w != base_verb(w):  # alzarsi: alzare's IPA with -rsi
            b = ipa_of(base_verb(w), 'v')
            return b[:-2] + 'rsi' if b.endswith('re') else ''
        pieces = w.replace("'", "' ").split()
        if len(pieces) > 1:  # multi-word expression: join the parts
            parts = [ipa_of(p, '') for p in pieces]
            if not all(parts):
                return ''
            return ''.join(x + ('' if p in ELIDED else ' ') for p, x in zip(pieces, parts)).strip()
        return ''

    ranked = sorted(translations, key=lambda w: (rank(w), w))
    rows = []
    for i, word in enumerate(ranked):
        parts = translations[word]
        lvl = parts[3] if len(parts) > 3 and parts[3] else LEVELS[sum(i >= b for b in BANDS)]
        es = wk.get(word) or []
        pos = parts[1] if len(parts) > 1 and parts[1] else kelly.get(word, (0, ''))[1] or (es[0]['pos'] if es else '')
        if pos not in POS:
            pos = {'det': 'adj', 'phr': 'adv'}.get(pos, '')
        e = next(iter(entries(word, pos)), {})
        g, extra = '', ''
        if len(parts) > 2 and parts[2]:
            display = parts[2]
            if pos == 'n':
                g = 'f' if display.startswith("un'") else ARTICLES.get(display.split(' ')[0], '')
        elif pos == 'n' and e.get('pos') == 'n':
            gg = e.get('g', '')
            if gg in ('m-p', 'f-p'):
                g = gg[0]
                display = (masc_article(word, True) if g == 'm' else 'le ') + word
            elif gg in ('m', 'f'):
                g = gg
                display = masc_article(word) + word if g == 'm' else ("un'" if word[0] in VOWELS else 'una ') + word
            elif gg.startswith('mf'):  # un/una cliente, un/un'artista
                display = masc_article(word).strip() + '/' + ("un'" if word[0] in VOWELS else 'una ') + word
            else:
                display = word  # unknown gender: shown bare
        else:
            display = word

        if pos == 'n' and g and e.get('pl') and not display.startswith(('i ', 'gli ', 'le ')):
            # Skip archaic forms that Wiktionary writes with stress accents (fòcora); irregular
            # feminine plurals (le dita, le uova) are the ones worth learning, so they come first.
            pls = [(p, pg or g) for p, pg in e['pl'] if p and ' ' not in p and not re.search('[àèéìòóù].', p)]
            pls = sorted(pls, key=lambda x: x[1] == g)[:2]
            if pls and not (len(pls) == 1 and pls[0][0] in regular_plural(word, g)):
                extra = ' / '.join((masc_article(p, True) if pg == 'm' else 'le ') + p for p, pg in pls)
        elif pos == 'adj' and e.get('fem') and e['fem'] != word:
            extra = e['fem']
        elif pos == 'v':
            refl = word != base_verb(word)
            v = next(iter(entries(base_verb(word), 'v')), {}) if refl else e
            p3, pp = v.get('p3'), v.get('pp')
            if p3 and pp:
                if refl:
                    extra = f'si {p3} · si è {pp}'
                else:
                    aux = v.get('aux') or [['a', '']]
                    if ['e', 'i'] in aux and ['a', 't'] in aux:  # è salito / ha salito le scale
                        kinds = ['e', 'a'] if aux.index(['e', 'i']) < aux.index(['a', 't']) else ['a', 'e']
                    else:  # other second auxiliaries are rare or pronominal uses
                        kinds = [aux[0][0]]
                    if word in MODALS:
                        kinds = ['a']
                    if word in AUX:
                        kinds = [AUX[word]]
                    extra = f"{p3} · {'/'.join({'e': 'è', 'a': 'ha'}[a] for a in kinds) or 'ha'} {pp}"
        shown = ARTICLE_RE.sub('', display)  # i soldi -> soldi: prefer the IPA of the shown form
        ipa = (ipa_of(shown, pos) if shown != word else '') or ipa_of(word, pos)
        rows.append([display, parts[0], ipa, pos, lvl, extra, g])

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// Generated by tools/build_words.py. Do not edit by hand.\n')
        f.write("// [word (nouns with un/uno/una/un'), farsi, ipa, part of speech, level, extra, gender]\n")
        f.write('// extra: plural with article (nouns, when not regular), feminine (adjectives), "va · è andato" (verbs)\n')
        f.write('export default [\n')
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False, separators=(',', ':')) + ',\n')
        f.write('];\n')
    counts = {l: sum(1 for r in rows if r[4] == l) for l in LEVELS}
    no_ipa = [r[0] for r in rows if not r[2]]
    print(f'{len(rows)} words written to {os.path.relpath(OUT)}', counts, f'without IPA: {len(no_ipa)}')
    unranked = [w for w in ranked if rank(w) == 9999]
    if unranked:
        print('not in Kelly or subtitles (placed last):', unranked[:20])


if __name__ == '__main__':
    sys.path.insert(0, ROOT)
    main()
