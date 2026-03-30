---
title: Claude Cowork plugin runtime constraints — read-only dirs, no background agents, path resolution
date: 2026-03-30
category: integration-issues
module: plugin-packaging
problem_type: integration_issue
component: tooling
symptoms:
  - "EACCES: permission denied when npm install runs in plugin directory"
  - "Template not found: /tmp/skills/board/references/board-template.html"
  - "Interview prep files exist on disk but board shows has_prep: false"
  - "GitHub release zip missing node_modules — CI build doesn't install deps"
root_cause: config_error
resolution_type: config_change
severity: critical
tags:
  - cowork
  - plugin
  - read-only
  - npm-install
  - path-resolution
  - file-discovery
  - bundling
  - github-actions
---

# Claude Cowork plugin runtime constraints — read-only dirs, no background agents, path resolution

## Problem

A Claude Cowork plugin with Node.js scripts failed at runtime in multiple ways: npm install crashed on read-only filesystem, board template couldn't be found, and generated documents (interview prep, company overviews) weren't discovered by the board builder even though they existed on disk.

## Symptoms

- `EACCES: permission denied` when tracker.js auto-install tried to write to the plugin's `node_modules/`
- `Error: Template not found: /tmp/skills/board/references/board-template.html` — script resolved template path relative to `__dirname` which points to the extracted scripts dir, not the plugin root
- Board cards showed "Job posting" and "Company overview" links but never "Interview prep" even after prep docs were generated
- GitHub release zip was 65KB (no deps) while local build was 173KB (with deps) — CI never installed node_modules before building

## What Didn't Work

- **Auto-install with `execSync('npm install')`** — the plugin is extracted to a read-only path like `/sessions/.remote-plugins/plugin_*/`. Any write to that directory fails.
- **Setting `NODE_PATH` to session-level node_modules** — Claude in Cowork tried this workaround but it was fragile and didn't fix the template path issue.
- **Computed role directory paths for file discovery** — `roleDirName()` computed `YYYY-MM-DD-slugified-role` but Claude in Cowork created directories with just the slug (e.g., `sr-director-tpm/` instead of `2026-03-30-sr-director-technical-program-management/`). Exact path matching missed the files.
- **Slug-suffix matching in `findRoleDirOnDisk`** — still too strict when Claude used abbreviated slugs.

## Solution

Four fixes applied across releases v0.5.12 through v0.5.15:

### 1. Bundle js-yaml in the zip (no runtime install)

```js
// Before — dynamic import after auto-install (breaks on read-only FS)
if (!fs.existsSync(path.join(__dirname, 'node_modules', 'js-yaml'))) {
  execSync('npm install --production', { cwd: __dirname, stdio: 'inherit' });
}
const yaml = (await import('js-yaml')).default;

// After — static import, js-yaml included in zip
import yaml from 'js-yaml';
```

Build script includes `scripts/node_modules/js-yaml/` in the zip. CI workflow runs `cd scripts && npm install --production` before `npm run build`.

### 2. Use CLAUDE_PLUGIN_ROOT for template resolution

```js
// Before — relative to script location (wrong in Cowork)
const templatePath = path.join(__dirname, '..', 'skills', 'board', 'references', 'board-template.html');

// After — use Cowork env var, fall back to relative for local dev
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..');
const templatePath = path.join(pluginRoot, 'skills', 'board', 'references', 'board-template.html');
```

### 3. Aggressive file discovery scanning the whole company directory

```js
function findFileInCompanyDir(cd, filename, roleSlug) {
  if (!fs.existsSync(cd)) return null;
  // Check company root
  const rootPath = path.join(cd, filename);
  if (fs.existsSync(rootPath)) return rootPath;
  // Scan subdirs — prefer slug match, accept any
  const entries = fs.readdirSync(cd, { withFileTypes: true }).filter(e => e.isDirectory());
  if (roleSlug) {
    for (const entry of entries) {
      if (entry.name.includes(roleSlug)) {
        const p = path.join(cd, entry.name, filename);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  for (const entry of entries) {
    const p = path.join(cd, entry.name, filename);
    if (fs.existsSync(p)) return p;
  }
  return null;
}
```

### 4. CI installs deps before build

```yaml
# .github/workflows/release.yml
- name: Install dependencies
  run: cd scripts && npm install --production

- name: Build plugin zip
  run: npm run build
```

## Why This Works

**Read-only plugin dirs:** Cowork extracts plugins to a read-only mount. Bundling deps eliminates the need for any runtime writes to the plugin directory.

**Path resolution:** In Cowork, `__dirname` for scripts points to the extracted location (e.g., `/sessions/.remote-plugins/plugin_*/scripts/`), not the plugin root. `CLAUDE_PLUGIN_ROOT` is set by Cowork and points to the actual plugin root where skills/templates live.

**File discovery:** Claude in Cowork constructs directory names differently than the script's `roleDirName()` function — it may use abbreviated slugs, omit dates, or use different casing. Scanning the entire company directory tree for the target filename (e.g., `prep.md`) with slug-preference is robust against any naming variation.

**CI deps:** `node_modules/` is gitignored, so GitHub Actions checkouts don't have it. The build script includes `scripts/node_modules/js-yaml/` in the zip, but the files must exist first.

## Prevention

- **Never rely on runtime npm install in Cowork plugins.** Bundle all Node.js dependencies in the zip. Keep deps minimal (js-yaml is the only one for this project).
- **Always use `CLAUDE_PLUGIN_ROOT` for cross-directory references** between scripts and skills/templates. Fall back to `__dirname`-relative for local development.
- **Never assume Claude will create directories with the exact name your script computes.** Always scan the filesystem as a fallback when resolving document paths.
- **Test the GitHub release zip, not just the local build.** Download the release asset and verify it contains everything needed (deps, templates, skills).
- **Cowork sessions cache plugins.** After updating a plugin, start a new session to pick up changes.

## Related Issues

- (auto memory [claude]) Documented in project memory: `feedback_cowork_constraints.md`
- No background sub-agents in Cowork — skill prompts must be designed for sequential inline execution
