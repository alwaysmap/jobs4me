---
title: Installation
summary: Install the plugin in Claude Desktop or Claude Code.
weight: 1
---

## Requirements

- Claude Desktop or Claude Code (CLI)
- A Claude Pro or Max subscription

## Desktop App Installation

First, [install the Claude desktop app](https://claude.ai/download) if you haven't already.

1. Go to **Customize > Plugins > Personal > + > Add marketplace**
2. Paste: `alwaysmap/alwaysmap-marketplace`
3. **Quit Claude Desktop fully** — press **⌘Q**, or right-click the dock icon and choose **Quit**. Closing the window is not enough; the marketplace only syncs on a real quit-and-relaunch.
4. **Relaunch Claude Desktop.** Give it a few seconds for the first sync to finish.
5. Go to **Customize > Plugins > Personal**, find **Jobs for Me**, and click **+** to install it.
6. Start a new Cowork session and select a folder for your job search data.

See [Managing plugins](https://docs.anthropic.com/en/docs/claude-ai/plugins#managing-plugins) in the Claude docs for more details.

> **Desktop and Claude Code keep entirely separate plugin worlds.** Each one has its own marketplaces, its own cache, and its own installed plugins. Adding the marketplace in Desktop does nothing for Claude Code, and vice versa. If you use both, install in both.

## Claude Code Installation

If you have [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed, you can install the plugin directly from the command line.

**Add the marketplace and install:**

```bash
# Add the alwaysmap marketplace
claude plugin marketplace add alwaysmap/alwaysmap-marketplace

# Update marketplace listings
claude plugin marketplace update

# List available plugins
claude plugin marketplace list

# Install the plugin
claude plugin install jfm@alwaysmap
```

**Verify the installation:**

```bash
claude plugin list
```

Start a new Claude Code session and select a folder for your job search data.

Either way — no dependencies to install, no API keys, no configuration files to edit.

## Choose your data folder

When you start a Cowork session, select a folder where your job search data will live. Good options:

- A folder in [Google Drive](https://www.google.com/drive/download/), [Dropbox](https://www.dropbox.com/install), or **iCloud** (built into macOS) — your data syncs and backs up automatically
- Any local folder if you prefer to manage backups yourself

Everything is plain YAML and markdown files — easy to read, easy to back up, and yours to keep.

## View your board

The plugin generates a kanban board at `Kanban/index.html` in your data folder. It updates automatically after every change.

![Kanban board with role cards, doc links, and column stages](/images/board-overview.png)

You can:

- **Open it directly** in your browser from the Cowork file viewer
- **Serve it on your network** with [Tailscale](https://tailscale.com):

```bash
# macOS
/Applications/Tailscale.app/Contents/MacOS/Tailscale serve --bg /path/to/your-folder/Kanban/

# Linux
tailscale serve --bg /path/to/your-folder/Kanban/
```

This serves the board over HTTPS on your tailnet, accessible from any device. The `--bg` flag makes it persist across reboots.

## Updating

### Desktop App

Claude Desktop refreshes its marketplace listings every time it launches. To pick up a new version:

1. **Quit Claude Desktop fully** (⌘Q — closing the window is not enough).
2. **Relaunch.** Wait a few seconds for the sync to finish.
3. Go to **Customize > Plugins > Personal**. The version shown next to **Jobs for Me** will be the latest available.
4. If a new version is detected, Desktop will show an update button next to the plugin — click it.

If the version still looks stale after a relaunch, see [Troubleshooting](#troubleshooting) below.

### Claude Code

```bash
# Update marketplace listings
claude plugin marketplace update

# Update the plugin
claude plugin update jfm@alwaysmap
```

Restart Claude Code to apply the update.

> **Reminder:** Desktop and Claude Code update independently. Updating in one does nothing for the other. If you use both, run the update in both.

Your data folder is untouched by plugin updates — only the plugin code changes.

## Troubleshooting

### "I refreshed the marketplace and it says I'm on the latest version, but nothing happened."

Refreshing a marketplace updates *listings* — what versions are available — not the plugin itself. Installing and updating are separate steps you have to take explicitly:

- **Desktop:** click the **+** (install) or update button next to **Jobs for Me** in Customize > Plugins > Personal.
- **Claude Code:** run `claude plugin install jfm@alwaysmap` to install or `claude plugin update jfm@alwaysmap` to update.

### "I added the marketplace but Jobs for Me isn't showing up."

Check which surface you added it in. **Desktop and Claude Code don't share marketplaces or installs** — adding the marketplace in Claude Code does *not* make it appear in Desktop, and vice versa. Add it again in whichever app you're trying to use the plugin in.

### Desktop still shows an old version after relaunching.

Force a clean re-sync:

1. Quit Claude Desktop fully (⌘Q).
2. Relaunch.
3. Customize > Plugins > Personal — find **alwaysmap** in the marketplace list and **remove** it.
4. Re-add it: **+** > Add marketplace > paste `alwaysmap/alwaysmap-marketplace`.
5. Quit and relaunch one more time.
6. Find **Jobs for Me** and click **+** to install.

### Claude Code says `Permission denied (publickey)` when installing.

You're hitting a GitHub SSH auth issue while cloning the plugin. The plugin source is configured for HTTPS, so this should not happen with the current marketplace — if it does, make sure your marketplace listing is fresh:

```bash
claude plugin marketplace remove alwaysmap
claude plugin marketplace add alwaysmap/alwaysmap-marketplace
claude plugin install jfm@alwaysmap
```
