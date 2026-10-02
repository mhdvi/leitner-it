# Leitner Italiano (لایتنر ایتالیایی)

A private, offline-first web app (PWA) for learning about 6,000 Italian words, Italian → Farsi, with the five-box Leitner system. The interface is in Farsi (right-to-left) by default. It can be switched to English on the first screen or in Settings.

This app is a sibling of `../leitner-fr` and `../leitner-de` and shares their architecture.

## Run it

It's a static site with no build step:

```sh
python tools/serve.py        # http://localhost:8000
```

Any static host works, including GitHub Pages. The sibling apps can live on the same origin; their storage keys and cache names don't overlap.

## What's specific to Italian

- **Word bank.** Words from A1 to B2, taken from the Kelly list for Italian (a corpus-based, CEFR-banded learner list) plus everyday words from film subtitles. Kelly is built from web and news text, so each word is ranked by the better of its Kelly position and its subtitle frequency. The ranked list is then cut into A1–B2 bands. This keeps *latte* or *frigorifero* from landing in B2 just because newspapers rarely use them.
- **Gender.** Nouns are shown with *un* / *uno* / *una* / *un'*, tinted by gender, and spoken with the article. Nouns of either gender show both (*un/una cliente*); plural-only nouns show their plural article (*i soldi*, *le ferie*).
- **Word forms** from Wiktionary:
  - nouns show their plural when it isn't the regular one (*gli uomini*, *le uova*, *le città*, *i fuochi*);
  - adjectives show their feminine (*bello → bella*);
  - verbs show presente + passato prossimo with the right auxiliary (*va · è andato*, *fa · ha fatto*, *si alza · si è alzato*). Verbs that take both show both (*sale · è/ha salito*).
- **Pronunciation.** Uses the device's Italian voice (`it-IT` preferred). Phonetics, with stress marks, come from Wiktionary.

## Your own word lists

Settings → Word lists lets you add your own words and study them in the same Leitner boxes.

- **Adding a list.** Paste words or choose a CSV/TXT file, one `word, meaning` per line. The separator can be a comma, tab, `=`, `:` or `;`; extra columns are further meanings, and an optional last column in `/slashes/` is used as the phonetics. Write nouns with their article (*il cane*, *una casa*) and they're tinted by gender like the built-in words. There's a template to download, Excel's Windows-1256 Farsi files are read correctly, and a list holds up to 5,000 words.
- **Studying.** New cards come from your enabled lists first, then from the built-in words. A word that is also in the built-in words is studied from your list, with your meaning. Quiz options for list words draw on the same list (when it has 12 or more words) and on the whole word bank.
- **Switching on and off.** The built-in words and each list have a switch (at least one stays on). A switched-off list is paused and keeps its boxes. Deleting a list removes its words and their progress. Each list can be exported as CSV.
- **Storage.** Lists are saved with your progress, so they're included in the backup file. Resetting progress keeps your lists.

## Data and licences

- **Kelly list (Italian)**, Kilgarriff et al. 2014, *Language Resources and Evaluation* 48(2). Mirrored at [kotoshu/frequency-list-kelly](https://github.com/kotoshu/frequency-list-kelly). Made available for research and education, so this app should stay free and non-commercial.
- **OpenSubtitles 2018 frequencies**, [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords): CC BY-SA 4.0.
- **Morph-it!** 0.48, Zanchetta & Baroni: LGPL. Used only to lemmatise the subtitle counts.
- **Wiktionary** via [kaikki.org](https://kaikki.org/dictionary/Italian/): CC BY-SA. Provides IPA, gender, plurals, verb forms and auxiliaries.

The Farsi meanings in `tools/fa/` were written for this app.

## Editing the word bank

1. Edit `tools/fa/*.txt`:
   - `word=meaning` sets the Farsi meaning;
   - `word=-` drops the word;
   - `word=meaning|pos|display|level` sets the part of speech, the displayed form (e.g. `i soldi`, `un'auto`) and/or the level. Leave a field empty to keep the default, e.g. `comma=بند (قانون)|||b2`.
2. Run `python tools/build_words.py`. It needs `xlrd` (`pip install xlrd`) and `curl`. The sources download into `tools/.cache` on the first run. Wiktionary is streamed once (about 770 MB) and reduced to a 13 MB extract.
3. Change `VERSION` in `sw.js` so installed copies pick up the new data.
