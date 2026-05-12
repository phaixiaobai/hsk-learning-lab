# HSK Master — HSK 2 / 3 / 4 Trainer (PWA)

An interactive, **100 % client-side** Progressive Web App for HSK 2-4 Chinese
preparation. Dual translations in **English + Thai** alongside Pinyin, optimised
for **iPad and Apple Pencil**, and installable to the home screen for offline use.

---

## 1. System Architecture Overview

This app is a **static single-page application** built with Vite + React +
TypeScript and styled with Tailwind. There is **no server, no database, and no
network calls during normal use** — once the JS bundle and the JSON vocabulary
file are downloaded, everything runs locally in the browser.

Three crisply separated layers:

| Layer | Lives in | Responsibility |
|-------|----------|----------------|
| **Static Data Layer** | `src/data/*.json` | Vocabulary bank + pre-test items. Pure JSON, bundled at build time, cached by the service worker. |
| **State Management Layer** | `src/hooks/*` and `src/utils/*` | Custom React hooks (`useLocalStorage`) and pure functions (pre-test grading, sentence segmenter, quiz generator). |
| **UI Component Layer** | `src/components/ui/*` and `src/modules/*` | Touch-friendly primitives (Button, Card, Tabs) and the five educational modules (Pre-Test, Flashcards, Analyzer, Quiz, Writing Pad). |

Persistence is achieved entirely through **`localStorage`**, namespaced under
`hsk-master:*` keys (level, language, pre-test result, quiz scores, "need
review" cards). The service worker (configured by `vite-plugin-pwa`) caches the
shell and the `hanzi-writer` stroke-data CDN, so the app launches and works
**offline** after the first visit.

---

## 2. Folder Structure

```
hsk-app/
├─ index.html                   ← iOS / iPadOS PWA <meta> tags
├─ package.json
├─ vite.config.ts               ← Vite + vite-plugin-pwa configuration
├─ tsconfig.json
├─ tailwind.config.js
├─ postcss.config.js
├─ public/
│  ├─ manifest.json             ← Web-app manifest (theme, icons, shortcuts)
│  ├─ favicon.svg
│  └─ icons/
│     ├─ icon-192.png           ← Required PNG icons (see icons/README.txt)
│     ├─ icon-512.png
│     └─ icon-512-maskable.png
└─ src/
   ├─ main.tsx                  ← Mounts <App/>; SW auto-registers
   ├─ App.tsx                   ← Tab routing, level + language pickers
   ├─ index.css                 ← Tailwind layers + iOS tap-fix
   ├─ vite-env.d.ts
   ├─ data/
   │  ├─ vocabulary.json        ← HSK 2/3/4 vocabulary bank (sample)
   │  └─ preTest.json           ← Hand-curated 15-question diagnostic
   ├─ types/
   │  └─ index.ts               ← Shared TS interfaces
   ├─ hooks/
   │  └─ useLocalStorage.ts     ← Generic persistent useState
   ├─ utils/
   │  ├─ preTestGrading.ts      ← Pure grading algorithm + rationale
   │  ├─ quizGenerator.ts       ← Random MC / Fill-blank / Matching builder
   │  └─ sentenceAnalyzer.ts    ← Reverse-max-match segmenter
   ├─ components/
   │  └─ ui/
   │     ├─ Button.tsx
   │     ├─ Card.tsx
   │     ├─ Tabs.tsx
   │     └─ LanguageToggle.tsx
   └─ modules/
      ├─ PreTest.tsx            ← Module A
      ├─ Flashcards.tsx         ← Module B
      ├─ SentenceAnalyzer.tsx   ← Module C
      ├─ Quiz.tsx               ← Module D
      └─ WritingPad.tsx         ← Module E (hanzi-writer)
```

---

## 3. Full Source Code (highlights)

The full code is in this repository. The most pedagogically important pieces:

**Pre-Test grading** — `src/utils/preTestGrading.ts`
The algorithm is documented in-file:
1. Score each level (HSK 2/3/4) independently.
2. *Rule 1*: any level scored ≥ 80 % is "mastered" → recommend the next level up.
3. *Rule 2*: otherwise pick the highest level scored ≥ 60 % ("foothold").
4. *Rule 3*: if everything is below 60 %, default to HSK 2.
The function returns a structured `PreTestResult` containing per-level
breakdown and a human-readable `rationale` shown to the student.

**`localStorage` instead of a database** — `src/hooks/useLocalStorage.ts`
A generic `useLocalStorage<T>(key, initial)` hook exposes the same API as
React's `useState`, but persists every change to `window.localStorage` under
a namespaced key (`hsk-master:*`). It also listens for cross-tab `storage`
events so the same PWA window stays in sync if the user opens it twice.
Storage failures (Safari Private mode, quota exceeded) are caught silently.

**PWA manifest** — `public/manifest.json` + `index.html`
- `display: "standalone"` and `theme_color: "#c1272d"` make the home-screen
  launch full-screen with a status-bar matching the brand.
- `start_url: "./"` and `scope: "./"` keep the app self-contained and
  deployable to a sub-path (GitHub Pages friendly).
- Three PNG icons (192 / 512 / 512-maskable) cover Android adaptive icons.
- Because **iOS Safari does not read `manifest.json` for "Add to Home
  Screen"**, the same hints are duplicated as `<meta>` tags in `index.html`:
  `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`,
  `apple-touch-icon`, etc. This is what lets an iPad student install the
  trainer like a native app and run it offline.
- `vite-plugin-pwa` generates a Workbox-based service worker that
  precaches all bundled assets and runtime-caches the `hanzi-writer`
  CDN JSON files for offline drawing.

---

## 4. Local Execution & Deployment

### Run locally

```bash
npm install
npm run dev          # http://localhost:5173
```

Open the URL in Safari on your iPad on the same Wi-Fi (e.g. `http://<mac-ip>:5173`)
or use `npm run preview` after a build.

### Build a static bundle

```bash
npm run build        # outputs ./dist
npm run preview      # serves ./dist locally for QA
```

`dist/` is a fully static site — no Node runtime needed in production.

### Deploy to a static host (any of these works)

- **GitHub Pages**:
  1. `npm run build`
  2. Push the contents of `dist/` to a `gh-pages` branch (or use `gh-pages` npm package).
  3. If your repo path is `/hsk-master/`, set `base: '/hsk-master/'` in `vite.config.ts` first.
- **Vercel**: `vercel --prod` (auto-detects Vite, no config needed).
- **Netlify**: drag-drop the `dist/` folder, or `netlify deploy --prod --dir=dist`.
- **Cloudflare Pages / S3 + CloudFront / Firebase Hosting**: upload `dist/`.

### Install on iPad

1. Open the deployed URL in **Safari**.
2. Tap the **Share** icon → **Add to Home Screen**.
3. Confirm — an icon labelled "HSK Master" appears.
4. Launch from the home screen → it opens full-screen and works offline.

---

## 5. UI Mockup Description

**Header (sticky, ~64 px tall)**
A red square logo with the character "汉" sits on the left next to the title
"HSK Master / HSK 2·3·4 Trainer". On the right there are two pill toggles:
**Language** (`EN | ไทย | EN+TH`) and **Level** (`HSK 2 | 3 | 4`).
Below the header is a horizontally-scrolling tab strip with five emoji-prefixed
tabs: 🎴 Flashcards · 🧠 Quiz · ✍️ Writing · 🔍 Analyzer · 📋 Re-test.

**Module A — Pre-Test** (auto-opens on first run)
Centered card showing progress bar, question counter (e.g. "3 / 15"), the
prompt sentence (English or Thai depending on toggle), and a 2 × 2 grid of
huge tap-targets each rendering a hanzi option in 30 px Noto Sans SC.
After 15 answers, the card flips to a summary: a giant "HSK 3 🎉"
recommendation, a 3-column score breakdown, and a brand-coloured rationale box.

**Module B — Flashcards**
A 420-px-tall hero card with a soft red gradient background. The hanzi is
displayed at ~160 px so it's readable from across the room. Tapping the card
fades-in the Pinyin (in red, large), then the English and Thai meanings.
Two big buttons — "📌 Need Review" (red) and "✅ Got It" (green) — span the full
width below.

**Module C — Sentence Analyzer**
A multi-line textarea with a pre-filled example sentence. Below it, the
parsed tokens render as horizontal pill rows: hanzi on the left, Pinyin in
red plus EN/TH meaning in the middle, and an HSK-level chip on the right
colour-coded green (HSK 2) → amber (HSK 3) → rose (HSK 4).

**Module D — Quiz**
Top of the card shows a progress bar plus a small caption indicating the
question type (Multiple Choice / Fill-in-Blank / Matching). MC questions show
the hanzi at 70 px with four large meaning buttons; Fill-blank shows a sentence
with an obvious blank and four hanzi-option buttons; Matching is a 2-column
layout where the student taps a hanzi then taps its meaning. After question 10
the card swaps to a results screen with a 6xl score display, comparison to the
best stored score, and a "↻ New Quiz" button.

**Module E — Writing Pad**
A 320 × 320 px white canvas framed with a thick brand-red rounded border —
deliberately chunky so it feels safe to draw on with an Apple Pencil. Four
buttons sit underneath: "▶ Animate" (plays the stroke order), "✏️ Quiz Mode"
(forces drawing from memory with hints after 2 misses), "👻 Hide Outline"
(toggles the ghost guide), and "Next Character →".

**Footer**
A subtle line "100% client-side · data lives only in your browser · reset progress".

---

## 6. Suggested Future Improvements

- **Spaced-Repetition Scheduling (SRS)** — replace the binary "Got It / Need
  Review" with an SM-2 / FSRS algorithm and store interval data in IndexedDB
  for larger decks.
- **Audio (TTS)** — bundle native-speaker recordings of each vocabulary item
  or use the Web Speech API (`speechSynthesis` with `zh-CN`) for Pinyin
  playback. Keeps the app fully client-side.
- **Full HSK Vocabulary Coverage** — extend `vocabulary.json` to the official
  ~1 200 (HSK 2) + ~600 (HSK 3) + ~600 (HSK 4) words; the data layer already
  scales.
- **Listening + Reading Mock Exams** — add Module F that mimics the real
  HSK paper structure with timed sections; persist attempts in localStorage.
- **Smarter Sentence Segmentation** — swap the reverse-maximum-match for an
  in-browser WASM build of `jieba` to handle out-of-vocabulary words.
- **Handwriting Grading** — extend `hanzi-writer` to record stroke accuracy
  and progress over time; store per-character confidence scores.
- **Multi-device Sync (Optional)** — a thin WebDAV / Dropbox / iCloud Drive
  exporter that round-trips the localStorage JSON without requiring a backend.
- **Internationalised UI Strings** — externalise the (currently English) UI
  copy into `src/i18n/{en,th}.json` so the entire chrome can flip to Thai.
- **Dark Mode** — Tailwind's `dark:` classes against the existing palette.
- **Performance budget on slow iPads** — virtualise the Flashcards deck and
  lazy-load `hanzi-writer` only when the Writing tab is opened.

---

## License

MIT — happy hacking, 加油!
