# Shutterstock AI Metadata Studio

A Manifest V3 Chrome extension that automates Shutterstock contributor
metadata for **vector** uploads using Gemini Vision: it scans your uploaded
files, generates a description, 25–50 keywords, and a primary/secondary
category for each one, and fills the Shutterstock form fields automatically.

Built exclusively for `submit.shutterstock.com`. No support for Adobe Stock,
Freepik, Vecteezy, iStock, or any other platform.

---

## How it works

1. Open the Shutterstock Contributor Upload page and upload your vectors as usual.
2. Open the side panel (it opens automatically, or click the toolbar icon).
3. Add at least one Gemini API key in **Settings → API**.
4. Click **Generate Metadata**. The extension analyzes each vector with
   Gemini Vision, writes the description/keywords/categories into the form,
   and moves to the next one — continuing even if you switch tabs or
   minimize Chrome, as long as Chrome itself is running.
5. Use **Export CSV** at any point to download a Shutterstock-compatible
   metadata CSV of everything processed so far.

Progress (queue, completed items, settings, API keys) is saved to
`chrome.storage.local` continuously. If Chrome restarts mid-queue, the side
panel offers **Resume Previous Session** or **Start New Session** — nothing
is lost unless you explicitly clear it.

---

## Project structure

```
shutterstock-ai-metadata/
├── manifest.json                 # MV3 manifest
├── sidepanel.html                # Side panel entry HTML
├── package.json
├── tsconfig.json
├── vite.config.ts                # Builds the side panel React app
├── scripts/
│   ├── build.mjs                 # Unified build: esbuild (bg/content) + vite (panel)
│   └── package.mjs               # Zips dist/ into a distributable .zip
├── public/
│   └── icons/                    # 16/48/128 toolbar + store icons
└── src/
    ├── background/                # MV3 service worker
    │   ├── background.ts
    │   └── alarmManager.ts        # keep-alive alarm for long queues
    ├── content/                   # Injected into the Shutterstock page
    │   ├── content.ts
    │   ├── domObserver.ts         # detects uploaded vectors via MutationObserver
    │   ├── autofill.ts            # writes metadata into the page's form fields
    │   └── content.css
    ├── sidepanel/                 # React UI
    │   ├── main.tsx
    │   ├── SidePanel.tsx
    │   ├── components/
    │   ├── hooks/
    │   └── styles/
    ├── services/
    │   ├── geminiService.ts       # Gemini Vision calls + prompt + response validation
    │   ├── apiKeyRotation.ts      # intelligent multi-key rotation & cooldowns
    │   └── csvExport.ts
    ├── queue/
    │   ├── queueTypes.ts
    │   └── queueProcessor.ts      # the run/pause/resume/stop loop
    ├── storage/
    │   ├── storageService.ts      # typed chrome.storage.local wrapper
    │   └── sessionManager.ts      # resume/start-new session logic
    ├── constants/
    │   ├── categories.ts          # official Shutterstock category list
    │   ├── selectors.ts           # resilient DOM selectors w/ fallbacks
    │   └── config.ts
    ├── types/index.ts             # shared types + runtime message contract
    └── utils/
        ├── retry.ts               # exponential backoff w/ jitter
        ├── logger.ts
        └── imageUtils.ts          # thumbnail → base64 for Gemini
```

---

## Prerequisites

- Node.js 18+ and npm
- A Google AI Studio (Gemini) API key — get one at
  [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
- Google Chrome 116+ (Side Panel API support)

## Install dependencies

```bash
npm install
```

## Development build (watch mode)

```bash
npm run dev
```

This rebuilds the background/content scripts on change (via esbuild) and
runs Vite in watch mode for the side panel. Reload the extension in
`chrome://extensions` after each change (Vite's HMR does not apply across
the extension boundary the way it would in a normal web app).

## Production build

```bash
npm run build
```

Output goes to `dist/`. This is a complete, loadable extension folder.

## Type-checking

```bash
npm run typecheck
```

## Package as a .zip for distribution

```bash
npm run package
```

Produces `shutterstock-ai-metadata-studio.zip` at the project root, built
from the contents of `dist/`. (Requires the system `zip` binary — on
Windows use WSL/Git Bash, or zip the `dist` folder manually.)

## Load into Chrome

1. Run `npm install && npm run build`.
2. Go to `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the `dist/` folder.
5. Pin the extension, navigate to the Shutterstock Contributor Upload page,
   and open the side panel.

---

## Settings reference

| Tab | Options |
|---|---|
| **API** | Add single/multiple Gemini API keys, import from `.txt` (one per line), delete individual/all keys, validate keys |
| **Processing** | Auto Fill vs. Review Before Fill, max retries per item, keyword count range (25–50 default), request timeout |
| **Workspace** | Page zoom (100/90/80/70/60%, default 70%), auto-open side panel |
| **Export** | Include failed items in CSV, filename prefix |
| **General** | Dark/Light/System theme, notify on completion |

## API key rotation

Keys are never simply round-robined on every request. Each key tracks
`lastUsedAt`, `cooldownUntil`, and `consecutiveFailures`; the processor
always selects the least-recently-used key among those with the fewest
recent failures and no active cooldown. A `429` applies a 60s cooldown; a
transient network/5xx error applies a 10s cooldown with exponential
backoff + jitter on retry; a key is auto-disabled after 5 consecutive
failures (re-enable it manually in Settings → API once fixed).

## Notes on DOM detection

Shutterstock's upload page is a React SPA with hashed class names that
change between deploys. `src/constants/selectors.ts` centralizes every
selector as an ordered list of fallbacks (`data-automation` attributes
first, then `aria-label`, then class-name substrings) so a markup tweak on
Shutterstock's side degrades gracefully instead of breaking detection
outright. If Shutterstock changes their markup significantly, update the
selector arrays in that one file.

## Privacy & data

- Gemini API keys are stored in `chrome.storage.local`, scoped to your
  browser profile, and are only ever sent to `generativelanguage.googleapis.com`.
- Thumbnail images are sent only to the Gemini Vision API for metadata
  generation — never to any third party or analytics service.
- All queue/session data stays local; nothing is sent to any server owned
  by this extension's developer (there isn't one — it's fully client-side).
