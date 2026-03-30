#!/usr/bin/env node
/**
 * release.js — Tag a release and push to trigger GitHub Actions.
 *
 * Usage: npm run release -- 0.6.0
 *
 * This will:
 * 1. Update version in plugin.json and package.json
 * 2. Commit the version bump
 * 3. Create git tag v0.6.0
 * 4. Push the commit and tag to origin
 * 5. GitHub Actions builds the zip and creates the release
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const version = process.argv[2];
if (!version) {
  console.error('Usage: npm run release -- <version>');
  console.error('Example: npm run release -- 0.6.0');
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Invalid version: "${version}" (expected X.Y.Z)`);
  process.exit(1);
}

const tag = `v${version}`;

// Check for uncommitted changes
const status = execSync('git status --porcelain', { cwd: root }).toString().trim();
if (status) {
  console.error('Working tree is dirty. Commit or stash changes first.\n');
  console.error(status);
  process.exit(1);
}

// Check tag doesn't already exist
try {
  execSync(`git rev-parse ${tag} 2>/dev/null`, { cwd: root });
  console.error(`Tag ${tag} already exists.`);
  process.exit(1);
} catch {
  // good — tag doesn't exist
}

// Update version in both files
function updateVersion(filePath) {
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  json.version = version;
  fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
}

updateVersion(path.join(root, '.claude-plugin', 'plugin.json'));
updateVersion(path.join(root, 'package.json'));
console.log(`Updated version to ${version}`);

// Commit, tag, push
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });

run('git add .claude-plugin/plugin.json package.json');
run(`git commit -m "Release ${tag}"`);
run(`git tag ${tag}`);
run(`git push origin main ${tag}`);

console.log(`\nReleased ${tag} — GitHub Actions will build and publish the zip.`);
