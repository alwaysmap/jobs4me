---
title: Installation
summary: Install the plugin in Claude Desktop, Claude.ai, or Claude Code.
weight: 1
---

## Requirements

- Claude Desktop, Claude.ai with Cowork mode, or Claude Code (CLI)
- A Claude Pro or Max subscription

## Install from the marketplace (Claude Code)

If you have [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed, you can install the plugin directly from the command line.

**Add the marketplace and install:**

```bash
# Add the jobs4me marketplace
claude plugin marketplace add alwaysmap/jobs4me

# Update marketplace listings
claude plugin marketplace update

# List available plugins
claude plugin marketplace list

# Install the plugin
claude plugin install jfm@jobs4me
```

**Verify the installation:**

```bash
claude plugin list
```

Start a new Claude Code session and select a folder for your job search data.

## Install from zip (Claude Desktop / Claude.ai)

1. Download `jobs-for-me.zip` from [the latest release](https://github.com/alwaysmap/jobs4me/releases/latest)
2. In Claude, go to **Customize > Personal plugins > +**
3. Upload the zip file
4. Start a new Cowork session and select a folder for your job search data

Either way — no dependencies to install, no API keys, no configuration files to edit.

## Choose your data folder

When you start a Cowork session, select a folder where your job search data will live. Good options:

- A folder in **Google Drive**, **Dropbox**, or **iCloud** — your data syncs and backs up automatically
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

### Claude Code (CLI)

```bash
# Update marketplace listings
claude plugin marketplace update

# Update the plugin
claude plugin update jfm@jobs4me
```

Restart Claude Code to apply the update.

### Claude Desktop / Claude.ai

1. Download the new `jobs-for-me.zip` from [releases](https://github.com/alwaysmap/jobs4me/releases/latest)
2. In Claude, go to **Customize > Personal plugins**
3. Delete the old plugin, then upload the new zip
4. Start a new Cowork session (old sessions cache the previous version)

Your data folder is untouched by plugin updates — only the plugin code changes.
