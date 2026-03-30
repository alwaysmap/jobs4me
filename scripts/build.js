#!/usr/bin/env node
/**
 * build.js — Package the plugin into jobs-for-me.zip for Claude Work.
 *
 * If a git tag (v*) is checked out, syncs the version into plugin.json
 * and package.json before building. Otherwise uses whatever version is
 * already in the files.
 *
 * Usage: npm run build (from project root)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outFile = path.join(root, 'jobs-for-me.zip');

// ── Sync version from git tag ──────────────────────────────────

function getGitTagVersion() {
  try {
    const tag = execSync('git describe --tags --exact-match HEAD 2>/dev/null', { cwd: root })
      .toString().trim();
    // Strip leading 'v' — "v0.5.2" → "0.5.2"
    if (tag.startsWith('v')) return tag.slice(1);
    return tag;
  } catch {
    return null; // not on a tag
  }
}

function updateJsonVersion(filePath, version) {
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (json.version === version) return false;
  const old = json.version;
  json.version = version;
  fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
  console.log(`Updated ${path.relative(root, filePath)}: ${old} → ${version}`);
  return true;
}

const tagVersion = getGitTagVersion();
if (tagVersion) {
  updateJsonVersion(path.join(root, '.claude-plugin', 'plugin.json'), tagVersion);
  updateJsonVersion(path.join(root, 'package.json'), tagVersion);
} else {
  // Read current version for display
  const plugin = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8'));
  console.log(`No git tag on HEAD — using version ${plugin.version} from plugin.json`);
}

// ── Build zip ──────────────────────────────────────────────────

if (fs.existsSync(outFile)) {
  fs.unlinkSync(outFile);
  console.log('Removed existing jobs-for-me.zip');
}

const includes = [
  '.claude-plugin/plugin.json',
  'scripts/tracker.js',
  'scripts/package.json',
  'scripts/package-lock.json',
  'scripts/node_modules/js-yaml/',
  'skills/',
  'README.md',
  'LICENSE',
];

const args = includes.map(f => JSON.stringify(f)).join(' ');
const cmd = `cd ${JSON.stringify(root)} && zip -r ${JSON.stringify(outFile)} ${args} -x "*/.DS_Store"`;

try {
  execSync(cmd, { stdio: 'inherit' });
  const stats = fs.statSync(outFile);
  const kb = (stats.size / 1024).toFixed(1);
  const version = tagVersion || JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8')).version;
  console.log(`\nBuilt: jobs-for-me.zip v${version} (${kb} KB)`);
} catch (err) {
  console.error('Build failed:', err.message);
  process.exit(1);
}
