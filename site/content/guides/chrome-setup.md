---
title: Chrome Browser Setup
summary: Connect the Claude Chrome extension so JFM can read live JS-rendered career pages.
weight: 6
---

## Why Chrome?

Most company career boards — Greenhouse, Ashby, Workday, and many custom React SPAs — serve their
job listings as JavaScript-rendered pages. A plain HTTP fetch returns only a loading skeleton with
no actual roles. When Chrome is running with the Claude extension connected, JFM can navigate to
these pages in a real browser and extract the fully rendered content.

The difference is significant: a Greenhouse or Samsara careers page that returns 0 results with
a direct fetch typically returns 20–30 director-level roles when browsed via Chrome.

---

## Prerequisites

- **Google Chrome** — [download here](https://www.google.com/chrome/)
- **Claude for Chrome extension** — install from the [Chrome Web Store](https://chromewebstore.google.com/) (search "Claude for Chrome")
- **Cowork** — the Claude desktop app you already have

Chrome is an *enhancement*, not a requirement. If Chrome isn't available during a search, JFM
automatically falls back to Google `site:` searches, which index the rendered versions of JS career
pages.

---

## One-Time Setup

### 1. Install the extension

1. Open Chrome → go to the Chrome Web Store
2. Search **"Claude for Chrome"** by Anthropic → **Add to Chrome**
3. The Claude icon will appear in your Chrome toolbar

### 2. Launch Chrome once and confirm the connection

Open Cowork and run `/jfm:search` or ask "check if Chrome is connected." JFM calls the extension
internally — if it responds, you're ready. If not, make sure Chrome is open and the extension icon
is visible in the toolbar.

### 3. Keep Chrome running automatically (recommended)

For the extension to be available during scheduled or background searches, Chrome should start
automatically when you log in.

**macOS — Login Item:**

1. **System Settings → General → Login Items & Extensions**
2. Under **Open at Login**, click **+**
3. Select `/Applications/Google Chrome.app` → **Open**

**Windows — Startup folder:**

1. Press `Win + R`, type `shell:startup`, press Enter
2. Create a shortcut to `chrome.exe` in that folder

### 4. Skip the profile picker on startup

If Chrome shows a profile chooser on launch, it waits for a click before loading — which means the
extension isn't active until you interact with it. Fix this:

1. In Chrome, go to `chrome://settings/` → search **"On startup"**
2. Select **Continue where you left off** or **Open the New Tab page**

Or: in the profile picker itself, uncheck **"Show this on startup"**.

---

## Lightweight Option: Background App Mode

For Safari-primary users who don't want Chrome in the dock, enable background mode:

1. `chrome://settings/` → search **"Continue running background apps"**
2. Toggle **on**

Chrome will stay running as a menu bar icon even after you close all windows, keeping the extension
always available without occupying screen real estate.

---

## Fallback Behavior

If Chrome isn't connected when a search runs, JFM logs it and falls back automatically:

| Fallback | How it works |
|----------|-------------|
| **Google `site:` search** | Queries like `site:job-boards.greenhouse.io/company "director" remote` — Google indexes rendered pages | 
| **Aggregator mirrors** | builtin.com, himalayas.app, and remotive.com re-host JDs as plain HTML |

The search brief will note which sources used a fallback and which used live Chrome browsing.

---

## Privacy

When connected, JFM opens URLs in a temporary Claude-managed tab group. It only visits URLs that
are part of your configured search sources. It does not read your existing tabs, browsing history,
passwords, or any other browser data. The tab group is cleaned up after each search sweep.
