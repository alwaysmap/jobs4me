#!/usr/bin/env node
// validate-skill-refs.js — Verify every references/<file>.md mentioned by a
// SKILL.md actually exists on disk. Catches dangling progressive-disclosure
// pointers before they ship.
//
// Walks skills/*/SKILL.md (one level deep), extracts reference-shaped paths,
// resolves each against the SKILL.md's directory, and exits non-zero on the
// first missing file.
//
// Usage:
//   node scripts/validate-skill-refs.js          # exits 0 if clean
//   node scripts/validate-skill-refs.js --quiet  # only print errors
//
// Reference shapes accepted:
//   references/X.md                              # same-skill sibling
//   ../<other-skill>/references/X.md             # cross-skill
//   skills/<other-skill>/references/X.md         # absolute-from-repo
//   <other-skill>/references/X.md                # rare — relative-from-skills

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.dirname(path.dirname(fs.realpathSync(__filename)));
const SKILLS_DIR = path.join(REPO_ROOT, 'skills');

const args = process.argv.slice(2);
const quiet = args.includes('--quiet');

// Match reference paths inside backticks or in plain prose. Path components
// allow letters, digits, hyphens, underscores, dots; no spaces.
// Examples this captures:
//   references/voice.md
//   ../search/references/routing.md
//   skills/search/references/yaml-schema.md
const REF_PATH_RE = /(?:\.\.\/[\w-]+\/|skills\/[\w-]+\/)?references\/[\w.-]+\.md/g;

function findSkillFiles() {
  const skills = [];
  for (const entry of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(SKILLS_DIR, entry.name, 'SKILL.md');
    if (fs.existsSync(skillFile)) skills.push(skillFile);
  }
  return skills;
}

function resolveRefPath(skillFile, refMatch) {
  const skillDir = path.dirname(skillFile);
  // Repo-anchored: starts with "skills/"
  if (refMatch.startsWith('skills/')) {
    return path.join(REPO_ROOT, refMatch);
  }
  // Cross-skill via ../: starts with "../"
  if (refMatch.startsWith('../')) {
    return path.resolve(skillDir, refMatch);
  }
  // Same-skill: references/...
  return path.join(skillDir, refMatch);
}

function validate() {
  const errors = [];
  let totalRefs = 0;

  for (const skillFile of findSkillFiles()) {
    const content = fs.readFileSync(skillFile, 'utf8');
    const matches = new Set(content.match(REF_PATH_RE) || []);
    if (!quiet && matches.size > 0) {
      console.log(`\n${path.relative(REPO_ROOT, skillFile)} — ${matches.size} ref(s)`);
    }
    for (const match of matches) {
      totalRefs++;
      const target = resolveRefPath(skillFile, match);
      if (!fs.existsSync(target)) {
        errors.push({
          skill: path.relative(REPO_ROOT, skillFile),
          ref: match,
          resolved: path.relative(REPO_ROOT, target),
        });
        console.error(`  ✗ ${match} → ${path.relative(REPO_ROOT, target)} (not found)`);
      } else if (!quiet) {
        console.log(`  ✓ ${match}`);
      }
    }
  }

  if (errors.length > 0) {
    console.error(`\n${errors.length} dangling reference(s) across ${totalRefs} total. Failing.`);
    process.exit(1);
  }
  if (!quiet) {
    console.log(`\n✓ All ${totalRefs} skill references resolve.`);
  }
}

validate();
