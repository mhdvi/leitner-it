"""Streams the kaikki.org Italian Wiktionary dump and keeps only what the word
bank needs (IPA, gender, plural, feminine, verb forms, auxiliary, English glosses).

Writes tools/.cache/it_wiktionary.json. Run by build_words.py when missing.
"""
import json, os, sys

URL = 'https://kaikki.org/dictionary/Italian/kaikki.org-dictionary-Italian.jsonl'
POS = {'noun': 'n', 'verb': 'v', 'adj': 'adj', 'adv': 'adv', 'pron': 'pron', 'prep': 'prep', 'conj': 'conj',
       'intj': 'excl', 'num': 'num', 'det': 'det', 'article': 'det', 'phrase': 'phr', 'prep_phrase': 'prep'}
SKIP_FORM_TAGS = {'diminutive', 'augmentative', 'pejorative', 'derogatory', 'alternative', 'archaic', 'obsolete',
                  'endearing', 'superlative', 'comparative', 'table-tags', 'inflection-template', 'canonical', 'dialectal'}


def plain(f):
    """Spelling without Wiktionary's stress accents (andàto -> andato)."""
    for target, _ in [(l[1], l[0]) for l in f.get('links') or []]:
        return target.split('#')[0]
    return f['form']


def entry(d):
    out = {'pos': POS[d['pos']]}
    ipas = [s for s in d.get('sounds') or [] if 'ipa' in s]
    ipas.sort(key=lambda s: (bool(s.get('note')), bool(s.get('tags'))))  # standard pronunciation first
    if ipas:
        out['ipa'] = ipas[0]['ipa'].strip('/[]').replace('.', '')
    head = (d.get('head_templates') or [{}])[0]
    args, exp = head.get('args') or {}, head.get('expansion') or ''
    forms = [f for f in d.get('forms') or [] if not SKIP_FORM_TAGS & set(f.get('tags') or [])]
    if out['pos'] == 'n':
        g = args.get('1', '').split('<')[0]
        out['g'] = g
        if '(invariable' in exp or args.get('2') == '#':
            out['pl'] = [[d['word'], g[:1]]]
        else:
            pl = [[f['form'], 'f' if 'feminine' in f['tags'] else 'm' if 'masculine' in f['tags'] else g[:1]]
                  for f in forms if 'plural' in (f.get('tags') or [])]
            if pl:
                out['pl'] = pl
    elif out['pos'] == 'adj':
        for f in forms:
            t = set(f.get('tags') or [])
            if {'feminine', 'singular'} <= t and not f['form'].endswith(('’', "'")):
                out['fem'] = f['form']
                break
        if '(invariable' in exp:
            out['inv'] = 1
    elif out['pos'] == 'v':
        aux = []
        for f in forms:
            t = set(f.get('tags') or [])
            if 'participle' in t and 'past' in t and 'pp' not in out:
                out['pp'] = plain(f)
            elif {'indicative', 'present', 'singular', 'third-person'} <= t and 'p3' not in out:
                out['p3'] = plain(f)
            elif 'auxiliary' in t:
                a = 'e' if plain(f).startswith(('essere', 'èssere')) else 'a'
                kind = 'i' if 'intransitive' in t else 't' if 'transitive' in t else ''
                if [a, kind] not in aux:
                    aux.append([a, kind])
        if aux:
            out['aux'] = aux
    glosses = []
    for s in d.get('senses') or []:
        if s.get('form_of') or s.get('alt_of') or 'form-of' in (s.get('tags') or []):
            continue
        for gl in s.get('glosses') or []:
            if gl not in glosses:
                glosses.append(gl)
    if not glosses:
        return None
    out['en'] = '; '.join(glosses[:4])[:200]
    return out


def extract(path, stream):
    words = {}
    if True:
        for i, line in enumerate(stream):
            d = json.loads(line)
            if d.get('pos') not in POS or ' ' in d['word'] and d['pos'] not in ('phrase', 'prep_phrase', 'adv', 'conj', 'prep'):
                continue
            e = entry(d)
            if e:
                words.setdefault(d['word'], []).append(e)
            if i % 100000 == 0:
                print(f'  {i} entries', file=sys.stderr)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(words, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{len(words)} headwords written to {path}', file=sys.stderr)


if __name__ == '__main__':
    # Usage: curl -sL <URL> | python tools/extract_wiktionary.py
    extract(os.path.join(os.path.dirname(os.path.abspath(__file__)), '.cache', 'it_wiktionary.json'), sys.stdin.buffer)
