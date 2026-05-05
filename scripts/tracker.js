#!/usr/bin/env node
/**
 * tracker.js — Safe YAML operations for the job search tracker.
 *
 * All reads and writes go through js-yaml, so output is always valid YAML.
 * Claude calls this script via Bash instead of writing YAML by hand.
 *
 * All mutating commands auto-rebuild Kanban/index.html unless --no-board is passed.
 * All mutating commands automatically: backup → mutate → validate → print JSON result.
 *
 * Usage: node tracker.js <command> [options]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve the script's real directory (survives symlinks and copies). This is
// the anchor for locating vendored deps and the plugin root fallback.
const __filename = fileURLToPath(import.meta.url);
const __realfile  = fs.realpathSync(__filename);
const __dirname   = path.dirname(__realfile);

// js-yaml is vendored as a self-contained ESM bundle under ./vendor so the
// plugin works when installed from git (no npm install, no node_modules).
import yaml from './vendor/js-yaml.mjs';

// ────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────

const VALID_STAGES = [
  'suggested', 'maybe', 'applied', 'interviewing',
  'offered', 'rejected', 'closed', 'declined',
];

/** Deprecated stage names → canonical names. */
const STAGE_ALIASES = { possible: 'maybe' };

/** Valid stage transitions: from → allowed destinations. */
const STAGE_TRANSITIONS = {
  suggested:    ['maybe', 'applied', 'declined'],
  maybe:        ['applied', 'interviewing', 'declined'],
  applied:      ['interviewing', 'rejected', 'closed', 'declined'],
  interviewing: ['offered', 'rejected', 'closed', 'declined'],
  offered:      ['applied', 'closed', 'declined'],
  rejected:     ['applied'],
  closed:       ['suggested'],
  declined:     ['suggested', 'maybe'],
};

const TERMINAL_STAGES = new Set(['declined', 'rejected', 'closed']);

// Liveness verification — phrases that mean the posting is closed.
// Matched case-insensitively against the page body.
const CLOSURE_PHRASES = [
  'no longer accepting applications',
  'position filled',
  'this role is closed',
  'this requisition has been closed',
  'we are not currently hiring for this position',
  'this position has been filled',
  'this job is no longer available',
  'applications are closed',
];

// ATS hosts where deep-links are known to redirect to a generic board
// when the role is removed. We layer an extra check on these.
const ATS_HOST_RE = /(greenhouse\.io|lever\.co|ashbyhq\.com)/i;

// "Generic board" CTA phrases — if present without the role title on an
// ATS page, the deep-link almost certainly resolved to the company root.
const ATS_GENERIC_CTA_PHRASES = [
  'view all jobs',
  'see all positions',
  'all open roles',
  'all open positions',
  'see all jobs',
];

const YAML_DUMP_OPTIONS = {
  lineWidth: -1,
  noRefs: true,
  quotingType: '"',
  forceQuotes: false,
  sortKeys: false,
};

// ────────────────────────────────────────────────────────────────
// Types (JSDoc — no runtime cost, helps readers)
// ────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} Application
 * @property {string} id
 * @property {string} company
 * @property {string} [role]
 * @property {string} stage
 * @property {string} [url]
 * @property {string} [archetype]
 * @property {string} [last_updated]
 * @property {string} [agent_summary]
 * @property {string} [notes]
 * @property {{proceed?: string, reason?: string}} [decision]
 * @property {Record<string, string>} [dates]
 */

/**
 * @typedef {Object} TrackerDoc
 * @property {Application[]} applications
 */

/**
 * @typedef {Object} DocPaths
 * @property {string} jd
 * @property {string} overview
 * @property {string} prep
 * @property {string} cover_letter
 * @property {boolean} has_jd
 * @property {boolean} has_overview
 * @property {boolean} has_prep
 * @property {boolean} has_cover_letter
 */

// ────────────────────────────────────────────────────────────────
// Argument parsing
// ────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { _command: argv[2] };
  for (let i = 3; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    const hasValue = next && !next.startsWith('--');
    args[key] = hasValue ? next : true;
    if (hasValue) i++;
  }
  return args;
}

// JSON-shape hint examples embedded in parseJsonArg error messages.
// Neutral (no shell quoting) so agents in any invocation context can
// reconstruct the correct JSON for their shell.
const SHAPE_HINT = {
  array:  '["Acme", "Crusoe"]',
  object: '{"notes":"..."}',
};

/**
 * Parse and shape-validate a JSON-valued CLI flag.
 *
 * Throws with a specific, flag-named error on any of:
 *   - missing or non-string value (undefined, null, empty string, or a
 *     boolean `true` left behind by parseArgs when a flag appears with
 *     no following value)
 *   - invalid JSON
 *   - parsed value whose shape doesn't match `expect`
 *
 * Returns the parsed value on success.
 *
 * @param {unknown} raw — the arg value, typically args.X from parseArgs
 * @param {string} flagName — the flag name without the leading "--"
 * @param {{ expect: 'array' | 'object' }} options
 */
function parseJsonArg(raw, flagName, { expect }) {
  // A non-string raw covers: undefined/null (flag absent), boolean true
  // (flag present with no following value — parseArgs sets args[key] = true),
  // and any future non-string value. parseArgs never hands us the empty string.
  if (typeof raw !== 'string') {
    throw new Error(`missing required --${flagName}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const snippet = raw.length > 40 ? raw.slice(0, 40) + '...' : raw;
    throw new Error(
      `invalid JSON for --${flagName}: ${snippet}. Expected a JSON ${expect}, e.g. ${SHAPE_HINT[expect]}.`
    );
  }

  const isObject = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
  const typeLabel = Array.isArray(parsed)
    ? 'array'
    : parsed === null
      ? 'null'
      : typeof parsed;

  if (expect === 'array' && !Array.isArray(parsed)) {
    throw new Error(
      `expected JSON array for --${flagName}, got ${typeLabel}. Expected shape: ${SHAPE_HINT.array}.`
    );
  }
  if (expect === 'object' && !isObject) {
    throw new Error(
      `expected JSON object for --${flagName}, got ${typeLabel}. Expected shape: ${SHAPE_HINT.object}.`
    );
  }

  return parsed;
}

/**
 * Coerce an optional scalar flag value to a string, rejecting the
 * flag-without-value case where parseArgs leaves `args[key] = true`.
 *
 * Use this for optional text flags like --reason on decline / batch-decline.
 * Returns '' when the flag was absent, the supplied string when present,
 * and throws on any non-string value (boolean `true`, etc.).
 */
function requireOptionalString(raw, flagName) {
  if (raw === undefined) return '';
  if (typeof raw !== 'string') {
    throw new Error(`--${flagName} requires a string value`);
  }
  return raw;
}

// ────────────────────────────────────────────────────────────────
// Path helpers
// ────────────────────────────────────────────────────────────────

const trackerPath    = (dir) => path.join(dir, 'tracker.yaml');
const profilePath    = (dir) => path.join(dir, 'profile.yaml');
const archetypesPath = (dir) => path.join(dir, 'archetypes.yaml');
const filtersPath    = (dir) => path.join(dir, 'filters.yaml');
const backupsDir     = (dir) => path.join(dir, '.backups');

function slugify(text, maxLen = 50) {
  return (text || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLen);
}

/** Extract the identified date from an application record. */
function identifiedDate(app) {
  return app.dates?.identified
    || app.dates?.suggested
    || app.last_updated
    || today();
}

/** Directory name for a role: YYYY-MM-DD-slugified-title. */
function roleDirName(app) {
  return `${identifiedDate(app).slice(0, 10)}-${slugify(app.role)}`;
}

/** Legacy format: YYYY-MM-slugified-title (before v0.4). */
function legacyRoleDirName(app) {
  return `${identifiedDate(app).slice(0, 7)}-${slugify(app.role)}`;
}

function companyDirPath(dir, company) {
  return path.join(dir, 'companies', company);
}

/**
 * Resolve the role directory, checking for legacy format on disk.
 * Note: performs fs.existsSync checks to support legacy fallback.
 */
function roleDirPath(dir, app) {
  const cd = companyDirPath(dir, app.company || 'Unknown');
  const preferred = path.join(cd, roleDirName(app));
  if (fs.existsSync(preferred)) return preferred;

  const legacy = path.join(cd, legacyRoleDirName(app));
  if (fs.existsSync(legacy)) return legacy;

  return preferred;
}

/**
 * Resolve document paths for an application.
 * Checks `companies/` structure first, falls back to legacy flat layout.
 * @param {string} dir
 * @param {Application} app
 * @returns {DocPaths}
 */
/**
 * Find a specific file (e.g., 'prep.md', 'jd.md') anywhere inside a company
 * directory — checks company root and all subdirectories.
 * Returns the first match, preferring subdirs that match the role slug.
 */
function findFileInCompanyDir(cd, filename, roleSlug) {
  if (!fs.existsSync(cd)) return null;

  // Check company root (e.g., companies/Oracle/prep.md)
  const rootPath = path.join(cd, filename);
  if (fs.existsSync(rootPath)) return rootPath;

  // Scan subdirectories — prefer slug match, accept any
  const entries = fs.readdirSync(cd, { withFileTypes: true })
    .filter(e => e.isDirectory());

  // First pass: match by slug
  if (roleSlug) {
    for (const entry of entries) {
      if (entry.name.includes(roleSlug)) {
        const p = path.join(cd, entry.name, filename);
        if (fs.existsSync(p)) return p;
      }
    }
  }

  // Second pass: any subdirectory with the file
  for (const entry of entries) {
    const p = path.join(cd, entry.name, filename);
    if (fs.existsSync(p)) return p;
  }

  return null;
}

function resolveDocPaths(dir, app) {
  const company = app.company || '';
  const cd = companyDirPath(dir, company);
  const rd = roleDirPath(dir, app);
  const roleSlug = slugify(app.role);

  // Overview is always at company level
  const overviewPreferred = path.join(cd, 'overview.md');
  const overviewLegacy = path.join(dir, `${company} - Company Overview.md`);
  const overviewExists = fs.existsSync(overviewPreferred);
  const overviewLegacyExists = !overviewExists && fs.existsSync(overviewLegacy);

  // JD and prep: try computed role dir first, then scan company dir
  const jdComputed = path.join(rd, 'jd.md');
  const jdLegacy = path.join(dir, 'active', `${company} - JD.md`);
  const jdFound = fs.existsSync(jdComputed) ? jdComputed
    : findFileInCompanyDir(cd, 'jd.md', roleSlug)
    || (fs.existsSync(jdLegacy) ? jdLegacy : null);

  const prepComputed = path.join(rd, 'prep.md');
  const prepLegacy = path.join(dir, `${company} - Interview Prep.md`);
  const prepFound = fs.existsSync(prepComputed) ? prepComputed
    : findFileInCompanyDir(cd, 'prep.md', roleSlug)
    || (fs.existsSync(prepLegacy) ? prepLegacy : null);

  const coverComputed = path.join(rd, 'cover-letter.md');
  const coverFound = fs.existsSync(coverComputed) ? coverComputed
    : findFileInCompanyDir(cd, 'cover-letter.md', roleSlug);

  return /** @type {DocPaths} */ ({
    jd:               jdFound || jdComputed,
    has_jd:           !!jdFound,
    overview:         overviewExists ? overviewPreferred : (overviewLegacyExists ? overviewLegacy : overviewPreferred),
    has_overview:     overviewExists || overviewLegacyExists,
    prep:             prepFound || prepComputed,
    has_prep:         !!prepFound,
    cover_letter:     coverFound || coverComputed,
    has_cover_letter: !!coverFound,
  });
}

// ────────────────────────────────────────────────────────────────
// File I/O
// ────────────────────────────────────────────────────────────────

/** @returns {TrackerDoc} */
function readTracker(dir) {
  const p = trackerPath(dir);
  if (!fs.existsSync(p)) return { applications: [] };
  const doc = yaml.load(fs.readFileSync(p, 'utf8')) || {};
  if (!doc.applications) doc.applications = [];
  return doc;
}

function writeTracker(dir, doc) {
  backup(dir, 'tracker.yaml');
  fs.writeFileSync(trackerPath(dir), yaml.dump(doc, YAML_DUMP_OPTIONS), 'utf8');
  validateDoc(doc);
  pruneBackups(dir, 'tracker.yaml');
}

function readProfile(dir) {
  const p = profilePath(dir);
  if (!fs.existsSync(p)) return {};
  return yaml.load(fs.readFileSync(p, 'utf8')) || {};
}

function writeProfile(dir, doc) {
  backup(dir, 'profile.yaml');
  validateProfile(doc);
  fs.writeFileSync(profilePath(dir), yaml.dump(doc, YAML_DUMP_OPTIONS), 'utf8');
  pruneBackups(dir, 'profile.yaml');
}

function readArchetypes(dir) {
  const p = archetypesPath(dir);
  if (!fs.existsSync(p)) return { role_types: [] };
  const doc = yaml.load(fs.readFileSync(p, 'utf8')) || {};
  // Normalize top-level key: accept archetypes or role_types
  if (doc.archetypes && !doc.role_types) {
    doc.role_types = doc.archetypes;
    delete doc.archetypes;
  }
  if (!doc.role_types) doc.role_types = [];
  // Normalize field aliases within each role type
  for (const rt of doc.role_types) {
    if (rt.search_keywords && !rt.keywords) { rt.keywords = rt.search_keywords; delete rt.search_keywords; }
    if (rt.company_size && !rt.company_fit) { rt.company_fit = rt.company_size; delete rt.company_size; }
  }
  return doc;
}

function writeArchetypes(dir, doc) {
  backup(dir, 'archetypes.yaml');
  validateArchetypes(doc);
  fs.writeFileSync(archetypesPath(dir), yaml.dump(doc, YAML_DUMP_OPTIONS), 'utf8');
  pruneBackups(dir, 'archetypes.yaml');
}

/** Read filters.yaml with key normalization to canonical names. */
function readFilters(dir) {
  const p = filtersPath(dir);
  if (!fs.existsSync(p)) {
    return { sources: [], target_companies: [], skip_companies: [], watch: [], industries: [], decline_patterns: [] };
  }
  const raw = yaml.load(fs.readFileSync(p, 'utf8')) || {};
  // Normalize legacy key names → canonical
  return {
    sources:          raw.include?.sources || raw.sources || [],
    target_companies: raw.include?.target_companies || raw.target_companies || [],
    skip_companies:   raw.skip_companies || raw.skip || [],
    watch:            raw.watch || [],
    industries:       raw.industries || [],
    decline_patterns: raw.decline_patterns || [],
  };
}

function writeFilters(dir, doc) {
  backup(dir, 'filters.yaml');
  validateFilters(doc);
  fs.writeFileSync(filtersPath(dir), yaml.dump(doc, YAML_DUMP_OPTIONS), 'utf8');
  pruneBackups(dir, 'filters.yaml');
}

// ────────────────────────────────────────────────────────────────
// Config validation
// ────────────────────────────────────────────────────────────────

const VALID_SENIORITY = ['ic', 'manager', 'director', 'vp', 'c-level'];
const VALID_SOURCE_TYPES = ['job_board', 'org_portfolio', 'career_page', 'curated_list', 'aggregator'];

function validateProfile(doc) {
  const errors = [];
  if (doc.preferences) {
    const p = doc.preferences;
    if (p.comp_floor_usd != null && typeof p.comp_floor_usd !== 'number') {
      errors.push('preferences.comp_floor_usd must be a number');
    }
    if (p.max_travel_pct != null && (typeof p.max_travel_pct !== 'number' || p.max_travel_pct < 0 || p.max_travel_pct > 100)) {
      errors.push('preferences.max_travel_pct must be 0-100');
    }
    if (p.seniority_floor && !VALID_SENIORITY.includes(p.seniority_floor)) {
      errors.push(`preferences.seniority_floor must be one of: ${VALID_SENIORITY.join(', ')}`);
    }
  }
  if (doc.evidence?.case_studies) {
    doc.evidence.case_studies.forEach((cs, i) => {
      if (!cs.title) errors.push(`evidence.case_studies[${i}]: missing title`);
      if (!cs.situation) errors.push(`evidence.case_studies[${i}]: missing situation`);
      if (!cs.action) errors.push(`evidence.case_studies[${i}]: missing action`);
      if (!cs.outcome) errors.push(`evidence.case_studies[${i}]: missing outcome`);
      if (!Array.isArray(cs.tags)) errors.push(`evidence.case_studies[${i}]: tags must be an array`);
    });
  }
  if (errors.length > 0) throw new Error('Profile validation failed:\n  ' + errors.join('\n  '));
}

function validateArchetypes(doc) {
  const errors = [];
  if (!Array.isArray(doc.role_types)) {
    errors.push('role_types must be an array');
  } else {
    const keys = new Set();
    doc.role_types.forEach((rt, i) => {
      if (!rt.key) errors.push(`role_types[${i}]: missing key`);
      if (!rt.name) errors.push(`role_types[${i}]: missing name`);
      if (!Array.isArray(rt.titles) || rt.titles.length === 0) errors.push(`role_types[${i}]: titles must be a non-empty array`);
      if (!Array.isArray(rt.keywords) || rt.keywords.length === 0) errors.push(`role_types[${i}]: keywords must be a non-empty array`);
      if (!rt.experience_mapping) errors.push(`role_types[${i}]: missing experience_mapping`);
      if (!rt.company_fit) errors.push(`role_types[${i}]: missing company_fit`);
      if (rt.key && keys.has(rt.key)) errors.push(`role_types[${i}]: duplicate key "${rt.key}"`);
      if (rt.key) keys.add(rt.key);
    });
  }
  if (errors.length > 0) throw new Error('Archetypes validation failed:\n  ' + errors.join('\n  '));
}

function validateFilters(doc) {
  const errors = [];
  if (doc.sources) {
    doc.sources.forEach((s, i) => {
      if (!s.name) errors.push(`sources[${i}]: missing name`);
      if (!s.url) errors.push(`sources[${i}]: missing url`);
      if (s.type && !VALID_SOURCE_TYPES.includes(s.type)) {
        errors.push(`sources[${i}]: type must be one of: ${VALID_SOURCE_TYPES.join(', ')}`);
      }
    });
  }
  for (const key of ['target_companies', 'skip_companies', 'watch']) {
    if (doc[key] && !Array.isArray(doc[key])) errors.push(`${key} must be an array`);
  }
  if (doc.decline_patterns) {
    doc.decline_patterns.forEach((p, i) => {
      const pattern = typeof p === 'string' ? p : p?.pattern;
      if (!pattern) errors.push(`decline_patterns[${i}]: missing pattern`);
    });
  }
  if (errors.length > 0) throw new Error('Filters validation failed:\n  ' + errors.join('\n  '));
}

// ────────────────────────────────────────────────────────────────
// Backup
// ────────────────────────────────────────────────────────────────

function backup(dir, filename) {
  const src = path.join(dir, filename);
  if (!fs.existsSync(src)) return;

  const bDir = backupsDir(dir);
  if (!fs.existsSync(bDir)) fs.mkdirSync(bDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const { name, ext } = path.parse(filename);
  fs.copyFileSync(src, path.join(bDir, `${name}.${ts}${ext}`));
}

// FUSE-safe readFileSync. Google Drive's macOS FUSE layer occasionally
// returns EDEADLK / EAGAIN / EBUSY for files that are mid-sync; cat,
// cp, and Node's fs all hit this. Treat those as "transient empty"
// instead of crashing the whole board build. Other errors propagate.
function safeReadFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'EDEADLK' || err.code === 'EAGAIN' || err.code === 'EBUSY') {
      console.error(`Warning: transient I/O on ${filePath} (${err.code}) — treating as empty`);
      return '';
    }
    throw err;
  }
}

function pruneBackups(dir, filename) {
  try {
    const bDir = backupsDir(dir);
    if (!fs.existsSync(bDir)) return;

    const { name, ext } = path.parse(filename);
    const prefix = `${name}.`;
    const backups = fs.readdirSync(bDir)
      .filter(f => f.startsWith(prefix) && f.endsWith(ext))
      .sort();

    const toRemove = backups.slice(0, Math.max(0, backups.length - 20));
    for (const f of toRemove) {
      try { fs.unlinkSync(path.join(bDir, f)); } catch {}
    }
  } catch {}
}

// ────────────────────────────────────────────────────────────────
// Validation
// ────────────────────────────────────────────────────────────────

/**
 * Validate a tracker doc in memory. Throws on failure.
 * @param {TrackerDoc} doc
 */
function validateDoc(doc) {
  const apps = doc.applications || [];
  const errors = [];

  apps.forEach((app, i) => {
    if (!app.id)      errors.push(`Entry ${i}: missing id`);
    if (!app.company) errors.push(`Entry ${i}: missing company`);
    if (!app.stage)   errors.push(`Entry ${i}: missing stage`);
    if (app.stage && !VALID_STAGES.includes(app.stage)) {
      errors.push(`Entry ${i} (${app.id}): invalid stage "${app.stage}"`);
    }
  });

  const seen = new Set();
  for (const { id } of apps) {
    if (!id) continue;
    if (seen.has(id)) errors.push(`Duplicate id: ${id}`);
    seen.add(id);
  }

  if (errors.length > 0) {
    throw new Error('Validation failed:\n  ' + errors.join('\n  '));
  }
}

// ────────────────────────────────────────────────────────────────
// Utilities
// ────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().split('T')[0];
}

function makeId(company, role) {
  return slugify(`${company}-${role || 'role'}`, 60);
}

function findApp(doc, id) {
  const idx = doc.applications.findIndex(a => a.id === id);
  if (idx === -1) throw new Error(`No application found with id: ${id}`);
  return { app: doc.applications[idx], idx };
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function moveFile(src, dest) {
  if (!fs.existsSync(src) || fs.existsSync(dest)) return false;
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  fs.unlinkSync(src);
  return true;
}

/** Escape </script> for safe embedding inside HTML <script> tags. */
function escapeHtmlScript(json) {
  return JSON.stringify(json).replace(/<\/script>/gi, '<\\/script>');
}

// ────────────────────────────────────────────────────────────────
// Pure mutation functions (operate on in-memory doc, no I/O)
//
// Each returns the affected Application. They mutate doc.applications
// in place — intentional since the doc is always read fresh and
// written back as a unit.
// ────────────────────────────────────────────────────────────────

function addEntry(doc, entry, opts = {}) {
  if (!entry.company) throw new Error('Missing required field: company');

  const defaults = {
    id: makeId(entry.company, entry.role),
    stage: 'suggested',
    last_updated: today(),
    dates: { identified: today() },
  };
  const merged = { ...defaults, ...entry, dates: { ...defaults.dates, ...entry.dates } };

  // Liveness gate: a `suggested` entry must have been verified live, or
  // the caller must have opted out via skipLivenessCheck. Anything else
  // (manually adding an `applied`/`interviewing` entry retroactively) is
  // exempt — the user wouldn't be there if the role weren't real.
  if (merged.stage === 'suggested' && !opts.skipLivenessCheck) {
    if (!merged.dates || !merged.dates.liveness_verified) {
      throw new Error(
        'Adding stage=suggested requires --liveness-verified-at <ISO timestamp> ' +
        '(or --skip-liveness-check to override). Run `tracker.js verify-posting --url ...` first.'
      );
    }
  }

  const dupe = doc.applications.find(a =>
    a.company === merged.company && a.role === merged.role
  );
  if (dupe) throw new Error(`Duplicate: ${merged.company} / ${merged.role} (id: ${dupe.id})`);

  doc.applications.push(merged);
  return merged;
}

function updateEntry(doc, id, updates) {
  const { app } = findApp(doc, id);
  for (const [key, value] of Object.entries(updates)) {
    if ((key === 'dates' || key === 'decision') && typeof value === 'object') {
      app[key] = { ...app[key], ...value };
    } else {
      app[key] = value;
    }
  }
  app.last_updated = today();
  return app;
}

function declineEntry(doc, id, reason) {
  const { app } = findApp(doc, id);
  app.stage = 'declined';
  app.decision = { proceed: 'no', reason: reason || '' };
  app.last_updated = today();
  app.dates = { ...app.dates, declined: today() };
  return app;
}

function stageEntry(doc, id, stage) {
  const resolved = STAGE_ALIASES[stage] || stage;
  if (!VALID_STAGES.includes(resolved)) {
    throw new Error(`Invalid stage: "${stage}". Valid: ${VALID_STAGES.join(', ')}`);
  }
  const { app } = findApp(doc, id);
  const allowed = STAGE_TRANSITIONS[app.stage];
  if (allowed && !allowed.includes(resolved)) {
    throw new Error(`Cannot move from "${app.stage}" to "${resolved}". Valid transitions: ${allowed.join(', ')}`);
  }
  app.stage = resolved;
  app.last_updated = today();
  if (!app.dates) app.dates = {};
  if (!app.dates[resolved]) app.dates[resolved] = today();
  return app;
}

// ────────────────────────────────────────────────────────────────
// Board generation
// ────────────────────────────────────────────────────────────────

function enrichAppsWithDocFlags(dir, apps) {
  return apps.map(app => {
    const docs = resolveDocPaths(dir, app);
    return { ...app, has_jd: docs.has_jd, has_overview: docs.has_overview, has_prep: docs.has_prep, has_cover_letter: docs.has_cover_letter };
  });
}

function buildConfigData(dir) {
  const config = {};

  const profilePath = path.join(dir, 'profile.yaml');
  if (fs.existsSync(profilePath)) {
    const profile = yaml.load(fs.readFileSync(profilePath, 'utf8')) || {};
    if (profile.name) config.profile_name = profile.name;
    if (profile.preferences) config.preferences = profile.preferences;
    if (profile.evidence) config.evidence = profile.evidence;
  }

  const arcData = readArchetypes(dir);
  if (arcData.role_types.length > 0) config.archetypes = arcData.role_types;

  const filters = readFilters(dir);
  // Support both flat (sources:) and nested (include.sources:) layouts
  config.sources          = filters.include?.sources || filters.sources || [];
  config.target_companies = filters.include?.target_companies || filters.target_companies || [];
  config.watch            = filters.watch || [];
  config.industries       = filters.industries || [];
  config.skip             = filters.skip || filters.skip_companies || [];
  config.decline_patterns = filters.decline_patterns || [];

  return config;
}

/** Build document data map for embedding in the board HTML. */
function buildDocumentData(dir, apps) {
  const data = {};
  const overviewSeen = new Set();

  for (const app of apps) {
    const docs = resolveDocPaths(dir, app);

    // JD, prep, and cover letter are role-specific — key by app ID
    for (const key of ['jd', 'prep', 'cover_letter']) {
      if (docs[`has_${key}`] && fs.existsSync(docs[key])) {
        data[`${app.id}::${key}`] = safeReadFile(docs[key]);
      }
    }

    // Overview is company-level — key by company name, read once per company
    if (docs.has_overview && !overviewSeen.has(app.company)) {
      overviewSeen.add(app.company);
      if (fs.existsSync(docs.overview)) {
        data[`${app.company}::overview`] = safeReadFile(docs.overview);
      }
    }
  }

  return data;
}

/** Load recent search briefs for embedding in the board. */
function buildBriefsData(dir, limit = 15) {
  const briefsPath = path.join(dir, 'briefs');
  if (!fs.existsSync(briefsPath)) return [];

  const dateRe = /(\d{4}-\d{2}-\d{2})/;

  return fs.readdirSync(briefsPath)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const m = f.match(dateRe);
      return {
        filename: f,
        label: f.replace(/\.md$/, ''),
        date: m ? m[1] : '',
      };
    })
    .sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.filename.localeCompare(a.filename);
    })
    .slice(0, limit)
    .map(({ label, date, filename }) => ({
      label,
      date,
      content: safeReadFile(path.join(briefsPath, filename)),
    }));
}

/** Migrate legacy flat files into companies/ structure. */
function migrateFiles(dir, apps) {
  let count = 0;
  for (const app of apps) {
    if (app.stage === 'suggested') continue;
    const company = app.company || '';
    if (!company) continue;

    const rd = roleDirPath(dir, app);
    const cd = companyDirPath(dir, company);

    const moves = [
      [path.join(dir, 'active',   `${company} - JD.md`),    path.join(rd, 'jd.md')],
      [path.join(dir, 'declined', `${company} - JD.md`),    path.join(rd, 'jd.md')],
      [path.join(dir, `${company} - Company Overview.md`),   path.join(cd, 'overview.md')],
      [path.join(dir, `${company} - Interview Prep.md`),     path.join(rd, 'prep.md')],
    ];
    for (const [src, dest] of moves) {
      if (moveFile(src, dest)) count++;
    }
  }
  return count;
}

/**
 * Build the Kanban board HTML.
 * @param {string} dir - Workspace directory
 * @param {{ skipMigration?: boolean }} [options]
 */
function buildBoard(dir, options = {}) {
  // Resolve template path: CLAUDE_PLUGIN_ROOT (set by Cowork) or relative to the
  // real script location. Using __dirname (resolved via realpathSync above) keeps
  // the fallback correct across symlinks and copies.
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..');
  const templatePath = path.join(pluginRoot, 'skills', 'board', 'references', 'board-template.html');
  if (!fs.existsSync(templatePath)) throw new Error(`Template not found: ${templatePath}`);

  const doc = readTracker(dir);

  // Run stage migrations unless skipped (auto-rebuilds skip for speed)
  if (!options.skipMigration) {
    let needsWrite = false;
    for (const app of doc.applications) {
      const alias = STAGE_ALIASES[app.stage];
      if (alias) { app.stage = alias; needsWrite = true; }
    }
    if (needsWrite) writeTracker(dir, doc);
  }

  const apps = doc.applications;

  // Only read docs for active roles — terminal roles show metadata only
  const activeApps  = apps.filter(a => !TERMINAL_STAGES.has(a.stage));
  const terminalApps = apps.filter(a => TERMINAL_STAGES.has(a.stage));

  const trackerData = [
    ...enrichAppsWithDocFlags(dir, activeApps),
    ...terminalApps.map(app => ({ ...app, has_jd: false, has_overview: false, has_prep: false, has_cover_letter: false })),
  ];

  const configData   = buildConfigData(dir);
  const documentData = buildDocumentData(dir, activeApps);
  const briefsData   = buildBriefsData(dir);

  let html = fs.readFileSync(templatePath, 'utf8');
  html = html.replace('__TRACKER_DATA__',  escapeHtmlScript(trackerData));
  html = html.replace('__CONFIG_DATA__',   escapeHtmlScript(configData));
  html = html.replace('__DOCUMENT_DATA__', escapeHtmlScript(documentData));
  html = html.replace('__BRIEFS_DATA__',   escapeHtmlScript(briefsData));
  html = html.replace(/__WORKSPACE_DIR__/g, path.resolve(dir));

  const outDir = path.join(dir, 'Kanban');
  ensureDir(outDir);
  const outPath = path.join(outDir, 'index.html');
  fs.writeFileSync(outPath, html, 'utf8');
  return { built: outPath, roles: trackerData.length };
}

// ────────────────────────────────────────────────────────────────
// Liveness verification
//
// Fetches a posting URL and runs a structured set of checks to decide
// whether the role is open. The agent calls this before adding any
// `suggested` entry to tracker; a failed check sends the role to
// "Companies to Watch" instead of the tracker.
// ────────────────────────────────────────────────────────────────

async function verifyPosting(url, { roleTitle, timeoutMs } = {}) {
  const fetchedAt = new Date().toISOString();
  const result = {
    url,
    final_url: url,
    status: null,
    live: false,
    checks: {
      status_2xx: false,
      title_present: roleTitle ? false : null,
      no_closure_phrase: false,
      is_specific_page: false,
    },
    closure_phrase_matched: null,
    fetched_at: fetchedAt,
    error: null,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || 10000);

  let response;
  try {
    response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        // Identify ourselves; some boards 403 on bare clients.
        'user-agent': 'jfm-tracker/0.8 (+https://jobs4me.org)',
        accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      },
    });
  } catch (err) {
    clearTimeout(timer);
    result.error = err.name === 'AbortError' ? `timeout after ${timeoutMs || 10000}ms` : err.message;
    return result;
  }
  clearTimeout(timer);

  result.status = response.status;
  result.final_url = response.url || url;
  result.checks.status_2xx = response.status >= 200 && response.status < 300;

  let body = '';
  try {
    body = await response.text();
  } catch (err) {
    result.error = `body read failed: ${err.message}`;
    return result;
  }
  const bodyLower = body.toLowerCase();

  // Closure-phrase scan
  const matchedClosure = CLOSURE_PHRASES.find(p => bodyLower.includes(p));
  result.closure_phrase_matched = matchedClosure || null;
  result.checks.no_closure_phrase = !matchedClosure;

  // Role-title scan (case-insensitive substring; null when no title given)
  if (roleTitle) {
    result.checks.title_present = bodyLower.includes(String(roleTitle).toLowerCase());
  }

  // ATS-specific generic-board detection: if final URL is on an ATS host
  // AND a "view all jobs" CTA appears AND the role title is missing, treat
  // as a redirect to the company's generic board.
  const isAts = ATS_HOST_RE.test(result.final_url);
  const hasGenericCta = isAts && ATS_GENERIC_CTA_PHRASES.some(p => bodyLower.includes(p));
  if (isAts && hasGenericCta && roleTitle && !result.checks.title_present) {
    result.checks.is_specific_page = false;
  } else {
    result.checks.is_specific_page = result.checks.status_2xx;
  }

  result.live =
    result.checks.status_2xx &&
    result.checks.no_closure_phrase &&
    result.checks.is_specific_page &&
    (result.checks.title_present !== false); // null counts as "not failing"

  return result;
}

// ────────────────────────────────────────────────────────────────
// Filesystem sweep
//
// Cross-checks tracker.yaml against the actual workspace filesystem
// and surfaces inconsistencies as structured findings. Auto-fixes
// the safe-to-automate categories (Drive conflict files, stale temp
// files, backups beyond retention, misplaced files with unambiguous
// targets). Everything that needs judgment goes back to the agent
// via the _internal sweep skill.
// ────────────────────────────────────────────────────────────────

const SWEEP_SCOPES = ['all', 'orphans', 'drive', 'temp', 'tracker-files', 'backups'];
const STALE_TEMP_AGE_MS = 24 * 60 * 60 * 1000;
const BACKUP_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const DRIVE_CONFLICT_RES = [
  /\(Conflicted copy [^)]+\)/i,
  / \(\d+\)\.[A-Za-z0-9]+$/,
  /\.docx#$/,
  /^\.~lock\./,
];

const MISPLACED_NAME_PATTERNS = [
  /Job Description/i,
  /\bJD\b/,
  /cover-letter/i,
  /\bresume\b/i,
  /\boverview\b/i,
];

const ACTIVE_PIPELINE_STAGES = new Set([
  'suggested', 'maybe', 'applied', 'interviewing', 'offered',
]);

// Normalize a string for fuzzy company-name matching: strip punctuation,
// collapse whitespace, lowercase. "Posit, PBC" and "Posit PBC" both
// become "posit pbc".
function normalizeCompanyName(s) {
  return String(s || '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function fileMtimeSafe(p) {
  try { return fs.statSync(p).mtimeMs; } catch { return null; }
}

function isMatchingScope(scope, target) {
  if (scope === 'all') return true;
  return scope.split(',').map(s => s.trim()).includes(target);
}

function findMissingRoleDirs(dir, apps) {
  const findings = [];
  for (const app of apps) {
    if (TERMINAL_STAGES.has(app.stage)) continue;
    const rd = roleDirPath(dir, app);
    if (!fs.existsSync(rd)) {
      findings.push({
        type: 'missing_role_dir',
        severity: 'error',
        app_id: app.id,
        expected_path: rd,
        auto_fixable: false,
        remediation: 'Recreate the role directory; any documents that lived there are lost.',
      });
    }
  }
  return findings;
}

function findOrphanedRoleDirs(dir, apps) {
  const findings = [];
  const companiesDir = path.join(dir, 'companies');
  if (!fs.existsSync(companiesDir)) return findings;

  const knownRoleDirs = new Set();
  for (const app of apps) {
    knownRoleDirs.add(roleDirPath(dir, app));
  }

  for (const company of fs.readdirSync(companiesDir, { withFileTypes: true })) {
    if (!company.isDirectory()) continue;
    if (company.name.startsWith('_')) continue; // _archived etc.
    const cd = path.join(companiesDir, company.name);
    for (const role of fs.readdirSync(cd, { withFileTypes: true })) {
      if (!role.isDirectory()) continue;
      const rd = path.join(cd, role.name);
      if (knownRoleDirs.has(rd)) continue;
      // Only flag dirs that look like role dirs (date-prefixed)
      if (!/^\d{4}-\d{2}-\d{2}/.test(role.name)) continue;
      findings.push({
        type: 'orphaned_role_dir',
        severity: 'warn',
        path: rd,
        auto_fixable: false,
        remediation: 'Re-link to a tracker entry, archive (move to companies/_archived/), or delete after review.',
      });
    }
  }
  return findings;
}

function findMissingJDs(dir, apps) {
  const findings = [];
  for (const app of apps) {
    if (!ACTIVE_PIPELINE_STAGES.has(app.stage)) continue;
    if (app.stage === 'suggested') continue; // suggested doesn't require a JD on disk
    const docs = resolveDocPaths(dir, app);
    if (!docs.has_jd) {
      findings.push({
        type: 'missing_jd',
        severity: 'error',
        app_id: app.id,
        expected_path: path.join(roleDirPath(dir, app), 'jd.md'),
        auto_fixable: false,
        remediation: 'Re-fetch from posting URL via search/assess skill.',
      });
    }
  }
  return findings;
}

function findMissingOverviews(dir, apps) {
  const findings = [];
  const seen = new Set();
  for (const app of apps) {
    if (!ACTIVE_PIPELINE_STAGES.has(app.stage)) continue;
    if (seen.has(app.company)) continue;
    seen.add(app.company);
    const docs = resolveDocPaths(dir, app);
    if (!docs.has_overview) {
      findings.push({
        type: 'missing_overview',
        severity: 'warn',
        company: app.company,
        expected_path: path.join(companyDirPath(dir, app.company), 'overview.md'),
        auto_fixable: false,
        remediation: 'Generate Company Overview via prep skill.',
      });
    }
  }
  return findings;
}

function findMisplacedFiles(dir) {
  const findings = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return findings; }
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!e.name.endsWith('.md')) continue;
    if (MISPLACED_NAME_PATTERNS.some(re => re.test(e.name))) {
      findings.push({
        type: 'misplaced_file',
        severity: 'warn',
        path: path.join(dir, e.name),
        auto_fixable: false,
        remediation: 'Move to the appropriate company/role directory.',
      });
    }
  }
  return findings;
}

function findDriveConflicts(dir) {
  const findings = [];
  function walk(d) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      if (e.name === '.git' || e.name === 'node_modules' || e.name === '.backups') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        walk(p);
        continue;
      }
      if (DRIVE_CONFLICT_RES.some(re => re.test(e.name))) {
        // Auto-fixable only when we can see an "original" sibling
        const original = e.name
          .replace(/\s*\(Conflicted copy [^)]+\)/i, '')
          .replace(/ \(\d+\)(\.[A-Za-z0-9]+)$/, '$1')
          .replace(/\.docx#$/, '.docx');
        const originalPath = path.join(d, original);
        const hasOriginal = original !== e.name && fs.existsSync(originalPath);
        findings.push({
          type: 'drive_conflict',
          severity: 'warn',
          path: p,
          original_path: hasOriginal ? originalPath : null,
          auto_fixable: hasOriginal,
          suggested_action: hasOriginal ? 'delete' : 'review',
          remediation: hasOriginal
            ? 'Original sibling exists — safe to delete the conflict copy.'
            : 'No original sibling found — review content before deleting.',
        });
      }
    }
  }
  walk(dir);
  return findings;
}

function findStaleTempFiles() {
  const findings = [];
  const tmp = '/tmp';
  let entries;
  try { entries = fs.readdirSync(tmp, { withFileTypes: true }); }
  catch { return findings; }
  const cutoff = Date.now() - STALE_TEMP_AGE_MS;
  for (const e of entries) {
    if (!e.isFile()) continue;
    const matches =
      e.name.startsWith('jfm-') ||
      /^jd-.*\.md$/.test(e.name) ||
      e.name === 'jfm-header.tex';
    if (!matches) continue;
    const p = path.join(tmp, e.name);
    const mtime = fileMtimeSafe(p);
    if (mtime === null || mtime > cutoff) continue;
    findings.push({
      type: 'stale_temp',
      severity: 'info',
      path: p,
      auto_fixable: true,
      suggested_action: 'delete',
      remediation: 'Stale temp file from a prior session; safe to remove.',
    });
  }
  return findings;
}

function findBackupsBeyondRetention(dir) {
  const findings = [];
  const bDir = path.join(dir, '.backups');
  if (!fs.existsSync(bDir)) return findings;
  const cutoff = Date.now() - BACKUP_RETENTION_MS;
  let entries;
  try { entries = fs.readdirSync(bDir, { withFileTypes: true }); }
  catch { return findings; }
  for (const e of entries) {
    if (!e.isFile()) continue;
    const p = path.join(bDir, e.name);
    const mtime = fileMtimeSafe(p);
    if (mtime === null || mtime > cutoff) continue;
    findings.push({
      type: 'backup_beyond_retention',
      severity: 'info',
      path: p,
      auto_fixable: true,
      suggested_action: 'delete',
      remediation: 'Backup older than 30 days; pruneBackups should have removed it.',
    });
  }
  return findings;
}

function findEmptyCompanyDirs(dir) {
  const findings = [];
  const companiesDir = path.join(dir, 'companies');
  if (!fs.existsSync(companiesDir)) return findings;
  for (const e of fs.readdirSync(companiesDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('_')) continue;
    const cd = path.join(companiesDir, e.name);
    let contents;
    try { contents = fs.readdirSync(cd); } catch { continue; }
    const meaningful = contents.filter(name => name !== '.DS_Store');
    if (meaningful.length === 0) {
      findings.push({
        type: 'empty_company_dir',
        severity: 'info',
        path: cd,
        auto_fixable: false,
        remediation: 'Delete after confirming no roles or overview were lost.',
      });
    }
  }
  return findings;
}

function findNameMismatches(dir, apps) {
  const findings = [];
  const companiesDir = path.join(dir, 'companies');
  if (!fs.existsSync(companiesDir)) return findings;
  const dirNames = fs.readdirSync(companiesDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('_'))
    .map(e => e.name);

  const seen = new Set();
  for (const app of apps) {
    if (!app.company || seen.has(app.company)) continue;
    seen.add(app.company);
    if (dirNames.includes(app.company)) continue; // exact match
    // No exact match — look for a normalized match
    const normalized = normalizeCompanyName(app.company);
    const match = dirNames.find(d => normalizeCompanyName(d) === normalized && d !== app.company);
    if (match) {
      findings.push({
        type: 'name_mismatch',
        severity: 'warn',
        company: app.company,
        directory_name: match,
        path: path.join(companiesDir, match),
        auto_fixable: false,
        remediation: `Tracker has "${app.company}" but directory is "${match}". Rename one to match.`,
      });
    }
  }
  return findings;
}

function applySweepFix(finding) {
  try {
    if (finding.type === 'drive_conflict' && finding.auto_fixable) {
      fs.unlinkSync(finding.path);
      return { ok: true };
    }
    if (finding.type === 'stale_temp') {
      fs.unlinkSync(finding.path);
      return { ok: true };
    }
    if (finding.type === 'backup_beyond_retention') {
      fs.unlinkSync(finding.path);
      return { ok: true };
    }
    return { ok: false, error: 'no auto-fix for this finding type' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function sweepWorkspace(dir, { mode, scope }) {
  const apps = readTracker(dir).applications;
  const findings = [];

  if (isMatchingScope(scope, 'tracker-files')) {
    findings.push(...findMissingRoleDirs(dir, apps));
    findings.push(...findMissingJDs(dir, apps));
    findings.push(...findMissingOverviews(dir, apps));
  }
  if (isMatchingScope(scope, 'orphans')) {
    findings.push(...findOrphanedRoleDirs(dir, apps));
    findings.push(...findEmptyCompanyDirs(dir));
    findings.push(...findNameMismatches(dir, apps));
    findings.push(...findMisplacedFiles(dir));
  }
  if (isMatchingScope(scope, 'drive')) {
    findings.push(...findDriveConflicts(dir));
  }
  if (isMatchingScope(scope, 'temp')) {
    findings.push(...findStaleTempFiles());
  }
  if (isMatchingScope(scope, 'backups')) {
    findings.push(...findBackupsBeyondRetention(dir));
  }

  let fixed = 0;
  let errors = 0;
  if (mode === 'apply') {
    for (const f of findings) {
      if (!f.auto_fixable) continue;
      const r = applySweepFix(f);
      if (r.ok) {
        fixed++;
        f.fixed = true;
      } else {
        errors++;
        f.fix_error = r.error;
      }
    }
  }

  const summary = {
    errors: findings.filter(f => f.severity === 'error').length,
    warnings: findings.filter(f => f.severity === 'warn').length,
    info: findings.filter(f => f.severity === 'info').length,
    auto_fixable: findings.filter(f => f.auto_fixable).length,
  };
  if (mode === 'apply') {
    summary.fixed = fixed;
    summary.fix_errors = errors;
  }

  // Exit code: 0 for dry-run; 1 if --apply changed something cleanly;
  // 2 for partial failure under --apply.
  let exitCode = 0;
  if (mode === 'apply') {
    if (errors > 0) exitCode = 2;
    else if (fixed > 0) exitCode = 1;
  }

  return {
    scope,
    mode,
    findings,
    summary,
    _exit_code: exitCode,
  };
}

// ────────────────────────────────────────────────────────────────
// Command implementations
//
// Each returns a result object. None call process.exit — that's
// main()'s job. Output goes to stdout via the returned value.
// ────────────────────────────────────────────────────────────────

const commands = {
  list(dir) {
    return readTracker(dir).applications;
  },

  get(dir, args) {
    const { app } = findApp(readTracker(dir), args.id);
    return app;
  },

  add(dir, args) {
    const doc = readTracker(dir);
    const entryRaw = parseJsonArg(args.json, 'json', { expect: 'object' });
    if (args['liveness-verified-at']) {
      entryRaw.dates = { ...(entryRaw.dates || {}), liveness_verified: args['liveness-verified-at'] };
    }
    const opts = { skipLivenessCheck: args['skip-liveness-check'] === true || args['skip-liveness-check'] === 'true' };
    const entry = addEntry(doc, entryRaw, opts);
    writeTracker(dir, doc);
    return entry;
  },

  sweep(dir, args) {
    const mode = args.apply ? 'apply' : 'dry-run';
    const scope = args.scope || 'all';
    const valid = SWEEP_SCOPES.concat(scope.split(',').map(s => s.trim()));
    // Either a known scope or a comma-separated list of known sub-scopes
    const parts = scope.split(',').map(s => s.trim());
    for (const p of parts) {
      if (!SWEEP_SCOPES.includes(p)) {
        throw new Error(`Invalid --scope "${p}". Valid: ${SWEEP_SCOPES.join(', ')} (or a comma-separated list).`);
      }
    }
    return sweepWorkspace(dir, { mode, scope });
  },

  async 'verify-posting'(_dir, args) {
    if (!args.url) throw new Error('Missing --url');
    const timeoutMs = args['timeout-ms'] ? parseInt(args['timeout-ms'], 10) : 10000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error('--timeout-ms must be a positive integer');
    }
    return verifyPosting(args.url, {
      roleTitle: args['role-title'] || null,
      timeoutMs,
    });
  },

  update(dir, args) {
    const doc = readTracker(dir);
    const app = updateEntry(doc, args.id, parseJsonArg(args.json, 'json', { expect: 'object' }));
    writeTracker(dir, doc);
    return app;
  },

  decline(dir, args) {
    const doc = readTracker(dir);
    const reason = requireOptionalString(args.reason, 'reason');
    const app = declineEntry(doc, args.id, reason);
    writeTracker(dir, doc);
    return { ...app, stored_at: { reason: 'decision.reason', declined_date: 'dates.declined' } };
  },

  stage(dir, args) {
    const doc = readTracker(dir);
    const app = stageEntry(doc, args.id, args.stage);
    writeTracker(dir, doc);
    // stageEntry writes the resolved stage name back to app.stage; read it
    // post-call to build the stored_at path without re-applying STAGE_ALIASES.
    return { ...app, stored_at: { stage: 'stage', stage_date: `dates.${app.stage}` } };
  },

  count(dir) {
    const apps = readTracker(dir).applications;
    const counts = { _total: apps.length };
    for (const a of apps) counts[a.stage] = (counts[a.stage] || 0) + 1;
    return counts;
  },

  find(dir, args) {
    const query = args.company.toLowerCase();
    const matches = readTracker(dir).applications.filter(a =>
      (a.company || '').toLowerCase().includes(query)
    );
    if (matches.length === 0) throw new Error(`No applications found matching: ${args.company}`);
    return matches;
  },

  validate(dir) {
    const doc = readTracker(dir);
    validateDoc(doc);
    return { valid: true, count: doc.applications.length };
  },

  init(dir) {
    const p = trackerPath(dir);
    if (fs.existsSync(p)) throw new Error('tracker.yaml already exists');
    const doc = { applications: [] };
    fs.writeFileSync(p, yaml.dump(doc, YAML_DUMP_OPTIONS), 'utf8');
    return { created: p };
  },

  'add-decline-pattern'(dir, args) {
    const doc = readFilters(dir);
    if (!doc.decline_patterns) doc.decline_patterns = [];
    doc.decline_patterns.push({ pattern: args.pattern, learned_from: args['learned-from'] || '' });
    writeFilters(dir, doc);
    return { added: args.pattern, total: doc.decline_patterns.length };
  },

  'update-source'(dir, args) {
    if (!args.name) throw new Error('--name is required');
    if (!args.url && !args.type) throw new Error('Provide --url and/or --type to update');

    const doc = readFilters(dir);
    if (!doc.sources) doc.sources = [];

    const idx = doc.sources.findIndex(
      s => s.name.toLowerCase() === args.name.toLowerCase()
    );

    if (idx === -1) {
      if (args['add-if-missing']) {
        if (!args.url) throw new Error('--url is required when adding a new source');
        const type = args.type || 'career_page';
        doc.sources.push({ name: args.name, url: args.url, type });
        writeFilters(dir, doc);
        return { action: 'added', name: args.name, url: args.url, type };
      }
      throw new Error(`Source not found: "${args.name}". Use --add-if-missing to create it.`);
    }

    const source = doc.sources[idx];
    const before = { ...source };
    if (args.url) source.url = args.url;
    if (args.type) source.type = args.type;
    writeFilters(dir, doc);
    return { action: 'updated', name: source.name, before, after: { ...source } };
  },

  // ── Batch & bulk ──

  batch(dir, args) {
    const ops = parseJsonArg(args.json, 'json', { expect: 'array' });
    if (ops.length === 0) {
      throw new Error('batch expects a non-empty JSON array of operations');
    }

    const doc = readTracker(dir);
    const results = ops.map(op => {
      try {
        const handlers = {
          add:     () => addEntry(doc, op.entry || {}, { skipLivenessCheck: op.skip_liveness_check === true }),
          update:  () => updateEntry(doc, op.id, op.fields || {}),
          decline: () => declineEntry(doc, op.id, op.reason || ''),
          stage:   () => stageEntry(doc, op.id, op.stage),
        };
        const handler = handlers[op.op];
        if (!handler) return { ok: false, op: op.op, error: `Unknown op: ${op.op}` };
        const result = handler();
        return { ok: true, op: op.op, id: result.id, company: result.company };
      } catch (err) {
        return { ok: false, op: op.op, id: op.id, error: err.message };
      }
    });

    writeTracker(dir, doc);
    return { processed: results.length, results };
  },

  'batch-decline'(dir, args) {
    const ids = args.ids.split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length === 0) throw new Error('No IDs provided');

    const doc = readTracker(dir);
    const reason = requireOptionalString(args.reason, 'reason');
    const results = ids.map(id => {
      try {
        const app = declineEntry(doc, id, reason);
        return { ok: true, id, company: app.company };
      } catch (err) {
        return { ok: false, id, error: err.message };
      }
    });

    const declined = results.filter(r => r.ok).length;
    // Only write if at least one decline succeeded — keeps backups clean
    // when every id was invalid and no mutation actually happened.
    if (declined > 0) writeTracker(dir, doc);
    const out = { declined, total: ids.length, results };
    // stored_at is only meaningful when at least one write landed; omitting
    // it on all-failure batches avoids falsely implying paths were written.
    if (declined > 0) {
      out.stored_at = { reason: 'decision.reason', declined_date: 'dates.declined' };
    }
    return out;
  },

  'filter-candidates'(dir, args) {
    const candidates = parseJsonArg(args.json, 'json', { expect: 'array' });

    // Build a stage-aware lookup. The agent uses existing_entry to apply
    // the dedup table in skills/search/SKILL.md (skip silently / flag for
    // resurface / call out in "Already in pipeline").
    const existingMap = new Map();
    for (const a of readTracker(dir).applications) {
      const key = `${(a.company || '').toLowerCase()}::${(a.role || '').toLowerCase()}`;
      existingMap.set(key, {
        id: a.id,
        stage: a.stage,
        decline_reason: (a.decision && a.decision.reason) || null,
        last_updated: a.last_updated || null,
      });
    }

    const filters = readFilters(dir);
    const skipTerms = (filters.skip_companies || filters.skip || []).map(s =>
      (typeof s === 'string' ? s : s.name || '').toLowerCase()
    );
    const declineTerms = (filters.decline_patterns || []).map(p =>
      (typeof p === 'string' ? p : p.pattern || '').toLowerCase()
    ).filter(Boolean);

    // Decline-reason regex for the resurface heuristic. Matches the canonical
    // "Posting is stale or closed" pattern and its variants. Stays in sync
    // with the seeded pattern in skills/search/references/decline-learning.md.
    const RESURFACE_RE = /stale|closed|posting|removed|filled|no longer hiring/i;

    const passed = [];
    const filtered = [];

    for (const c of candidates) {
      const companyLower = (c.company || '').toLowerCase();
      const key = `${companyLower}::${(c.role || '').toLowerCase()}`;

      if (existingMap.has(key)) {
        const existing = existingMap.get(key);
        const suggestResurface =
          (existing.stage === 'declined' || existing.stage === 'closed') &&
          RESURFACE_RE.test(existing.decline_reason || '');
        filtered.push({
          ...c,
          reason: 'duplicate',
          existing_entry: existing,
          suggest_resurface: suggestResurface,
        });
      } else if (skipTerms.some(s => companyLower.includes(s))) {
        filtered.push({ ...c, reason: 'skip_list' });
      } else {
        const searchable = `${c.company} ${c.role} ${c.description || ''}`.toLowerCase();
        const matchedPattern = declineTerms.find(p => searchable.includes(p));
        if (matchedPattern) {
          filtered.push({ ...c, reason: 'decline_pattern', matched: matchedPattern });
        } else {
          passed.push(c);
        }
      }
    }

    return { passed: passed.length, filtered: filtered.length, candidates: passed, filtered_detail: filtered };
  },

  'save-jd'(dir, args) {
    const { app } = findApp(readTracker(dir), args.id);

    let content;
    if (args.file) {
      if (!fs.existsSync(args.file)) throw new Error(`File not found: ${args.file}`);
      content = fs.readFileSync(args.file, 'utf8');
    } else {
      content = args.content || '';
    }

    const rd = roleDirPath(dir, app);
    ensureDir(rd);
    const jdPath = path.join(rd, 'jd.md');
    fs.writeFileSync(jdPath, content, 'utf8');
    return { saved: jdPath, company: app.company, role: app.role, bytes: content.length };
  },

  // ── Config: profile, archetypes, filters ──

  'get-profile'(dir) {
    return readProfile(dir);
  },

  'set-profile'(dir, args) {
    const updates = parseJsonArg(args.json, 'json', { expect: 'object' });
    const doc = readProfile(dir);

    // Shallow merge at top level; for objects (evidence, preferences), merge one level deep
    for (const [key, value] of Object.entries(updates)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value) && typeof doc[key] === 'object') {
        doc[key] = { ...doc[key], ...value };
      } else {
        doc[key] = value;
      }
    }

    writeProfile(dir, doc);
    return doc;
  },

  'get-archetypes'(dir) {
    return readArchetypes(dir);
  },

  'set-archetypes'(dir, args) {
    const input = parseJsonArg(args.json, 'json', { expect: 'object' });
    if (!Array.isArray(input.role_types)) {
      throw new Error('set-archetypes --json requires { "role_types": [...] }');
    }
    const doc = { role_types: input.role_types };
    writeArchetypes(dir, doc);
    return doc;
  },

  'get-filters'(dir) {
    return readFilters(dir);
  },

  'set-filters'(dir, args) {
    const updates = parseJsonArg(args.json, 'json', { expect: 'object' });
    const doc = readFilters(dir);

    // Replace each provided key wholesale
    for (const key of ['sources', 'target_companies', 'skip_companies', 'watch', 'industries', 'decline_patterns']) {
      if (updates[key] !== undefined) doc[key] = updates[key];
    }

    writeFilters(dir, doc);
    return doc;
  },

  'update-filter-list'(dir, args) {
    const list = args.list;
    const allowed = ['target_companies', 'skip_companies', 'watch', 'industries'];
    if (!allowed.includes(list)) {
      throw new Error(`--list must be one of: ${allowed.join(', ')}`);
    }
    if (!args.add && !args.remove) {
      throw new Error('Provide --add and/or --remove (JSON arrays)');
    }

    const doc = readFilters(dir);
    let items = doc[list] || [];

    if (args.add) {
      const toAdd = parseJsonArg(args.add, 'add', { expect: 'array' });
      const existing = new Set(items.map(s => s.toLowerCase()));
      for (const item of toAdd) {
        if (!existing.has(item.toLowerCase())) {
          items.push(item);
          existing.add(item.toLowerCase());
        }
      }
    }

    if (args.remove) {
      const toRemove = new Set(parseJsonArg(args.remove, 'remove', { expect: 'array' }).map(s => s.toLowerCase()));
      items = items.filter(s => !toRemove.has(s.toLowerCase()));
    }

    doc[list] = items;
    writeFilters(dir, doc);
    return { list, items: doc[list] };
  },

  schema(_dir, args) {
    const file = args.file || 'all';
    const schemas = {
      profile: {
        file: 'profile.yaml',
        shape: {
          name: 'string (REQUIRED)',
          email: 'string',
          evidence: {
            resume_url: 'URL string',
            portfolio_urls: ['URL string'],
            additional_context: 'block text',
            case_studies: [{
              title: 'string (REQUIRED)',
              company: 'string',
              date: 'YYYY-MM',
              url: 'URL string',
              situation: 'string (REQUIRED)',
              action: 'string (REQUIRED)',
              outcome: 'string (REQUIRED)',
              tags: ['string (REQUIRED)'],
            }],
            evidence_complete: 'boolean',
          },
          preferences: {
            comp_floor_usd: 'integer (REQUIRED)',
            comp_floor_gbp: 'integer',
            comp_exceptions: 'string',
            max_travel_pct: 'integer 0-100 (REQUIRED)',
            locations: ['remote_us | remote_uk | hybrid_<city> | onsite_<city>'],
            seniority_floor: 'ic | manager | director | vp | c-level (REQUIRED)',
            hard_nos: {
              companies: ['string'],
              industries: ['string'],
            },
          },
        },
      },
      archetypes: {
        file: 'archetypes.yaml',
        shape: {
          role_types: [{
            key: 'kebab-case-id (REQUIRED, unique)',
            name: 'string (REQUIRED)',
            titles: ['string — 4-6 variations (REQUIRED)'],
            keywords: ['string — search terms (REQUIRED)'],
            experience_mapping: 'block text (REQUIRED)',
            company_fit: 'string (REQUIRED)',
          }],
        },
      },
      filters: {
        file: 'filters.yaml',
        shape: {
          sources: [{
            name: 'string (REQUIRED)',
            url: 'URL (REQUIRED)',
            type: 'job_board | org_portfolio | career_page | curated_list | aggregator (REQUIRED)',
            priority: 'integer (optional, lower = first)',
          }],
          target_companies: ['string'],
          skip_companies: ['string'],
          watch: ['string'],
          industries: ['string — sectors/domains of interest, used to weight search results'],
          decline_patterns: [{
            pattern: 'string (REQUIRED)',
            learned_from: 'string',
          }],
        },
      },
      tracker: {
        file: 'tracker.yaml (NEVER write directly — use tracker.js commands)',
        shape: {
          applications: [{
            id: 'string (auto-generated)',
            company: 'string (REQUIRED)',
            role: 'string (REQUIRED)',
            stage: VALID_STAGES.join(' | '),
            url: 'URL string',
            archetype: 'role_types[].key from archetypes.yaml',
            last_updated: 'YYYY-MM-DD (auto-set)',
            agent_summary: 'markdown block scalar',
            notes: 'string',
            decision: { proceed: 'yes | no', reason: 'string' },
            dates: { identified: 'YYYY-MM-DD', '[stage]': 'YYYY-MM-DD' },
          }],
        },
      },
    };

    // CLI-layer annotations — not persisted to yaml, only present on
    // command return values. Documents where nested-write commands land
    // their inputs on disk so agents don't have to guess.
    const command_outputs = {
      decline: {
        returns: 'bare app record + top-level stored_at annotation',
        stored_at: { reason: 'decision.reason', declined_date: 'dates.declined' },
      },
      stage: {
        returns: 'bare app record + top-level stored_at annotation',
        stored_at: { stage: 'stage', stage_date: 'dates.<resolved-stage>' },
      },
      'batch-decline': {
        returns: '{ declined, total, results, stored_at? } — stored_at is present only when declined > 0',
        stored_at: { reason: 'decision.reason', declined_date: 'dates.declined' },
      },
    };

    if (file === 'all') return { ...schemas, command_outputs };
    if (!schemas[file]) throw new Error(`Unknown file: "${file}". Valid: ${Object.keys(schemas).join(', ')}`);
    return schemas[file];
  },

  // ── File management ──

  migrate(dir) {
    const doc = readTracker(dir);
    const apps = doc.applications;

    // Migrate deprecated stage names
    let stagesRenamed = 0;
    for (const app of apps) {
      const alias = STAGE_ALIASES[app.stage];
      if (alias) {
        app.stage = alias;
        stagesRenamed++;
      }
    }
    if (stagesRenamed > 0) writeTracker(dir, doc);

    // Migrate legacy flat files → companies/ structure
    const filesMoved = migrateFiles(dir, apps);

    // Migrate YYYY-MM-slug dirs → YYYY-MM-DD-slug
    let dirsRenamed = 0;
    for (const app of apps) {
      const cd = companyDirPath(dir, app.company || 'Unknown');
      const legacyName = legacyRoleDirName(app);
      const newName = roleDirName(app);
      if (legacyName === newName) continue;
      const legacyPath = path.join(cd, legacyName);
      const newPath = path.join(cd, newName);
      if (fs.existsSync(legacyPath) && !fs.existsSync(newPath)) {
        fs.renameSync(legacyPath, newPath);
        dirsRenamed++;
      }
    }

    return { stages_renamed: stagesRenamed, files_moved: filesMoved, dirs_renamed: dirsRenamed };
  },

  paths(dir, args) {
    const doc = readTracker(dir);
    const { app } = findApp(doc, args.id);
    const docs = resolveDocPaths(dir, app);
    return {
      company_dir: companyDirPath(dir, app.company),
      role_dir: roleDirPath(dir, app),
      ...docs,
    };
  },

  'needs-research'(dir) {
    const apps = readTracker(dir).applications;
    const seen = new Set();
    const needs = [];

    const activeCompanies = new Set(
      apps.filter(a => a.company && !TERMINAL_STAGES.has(a.stage)).map(a => a.company)
    );

    for (const company of activeCompanies) {
      if (seen.has(company)) continue;
      seen.add(company);

      const overviewPath = path.join(companyDirPath(dir, company), 'overview.md');
      if (!fs.existsSync(overviewPath)) {
        const rep = apps.find(a => a.company === company && !TERMINAL_STAGES.has(a.stage));
        needs.push({ company, id: rep.id, company_dir: companyDirPath(dir, company) });
      }
    }
    return { needs_research: needs, total_companies: seen.size };
  },

  'list-briefs'(dir, args) {
    const limit = parseInt(args?.limit || '15', 10);
    return { briefs: buildBriefsData(dir, limit) };
  },

  // ── Board ──

  'board-json'(dir) {
    return enrichAppsWithDocFlags(dir, readTracker(dir).applications);
  },

  'build-board'(dir) {
    return buildBoard(dir);
  },

  help() {
    return {
      commands: {
        'Core CRUD':    ['list', 'get', 'add', 'update', 'decline', 'stage'],
        'Batch':        ['batch', 'batch-decline', 'filter-candidates'],
        'Config':       ['get-profile', 'set-profile', 'get-archetypes', 'set-archetypes', 'get-filters', 'set-filters', 'update-filter-list', 'update-source'],
        'Files':        ['save-jd', 'migrate', 'paths', 'needs-research'],
        'Liveness':     ['verify-posting'],
        'Sweep':        ['sweep'],
        'Board':        ['board-json', 'build-board', 'list-briefs'],
        'Query':        ['count', 'find'],
        'Housekeeping': ['init', 'validate', 'add-decline-pattern', 'schema', 'help'],
      },
      stages: VALID_STAGES,
      transitions: STAGE_TRANSITIONS,
    };
  },
};

// Commands that mutate data files and trigger auto board rebuild
const MUTATING_COMMANDS = new Set([
  'add', 'update', 'decline', 'stage',
  'batch', 'batch-decline', 'add-decline-pattern', 'update-source',
  'set-profile', 'set-archetypes', 'set-filters', 'update-filter-list',
]);

// Required args per command
const REQUIRED_ARGS = {
  get:                   ['id'],
  add:                   ['json'],
  update:                ['id', 'json'],
  decline:               ['id'],
  stage:                 ['id', 'stage'],
  find:                  ['company'],
  'add-decline-pattern': ['pattern'],
  batch:                 ['json'],
  'batch-decline':       ['ids'],
  'filter-candidates':   ['json'],
  'save-jd':             ['id'],
  paths:                 ['id'],
  'set-profile':         ['json'],
  'set-archetypes':      ['json'],
  'set-filters':         ['json'],
  'update-filter-list':  ['list'],
  'update-source':       ['name'],
  'verify-posting':      ['url'],
};

// ────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────

/** Walk up from cwd looking for tracker.yaml or profile.yaml. Returns null if not found. */
function detectWorkspace() {
  let dir = process.cwd();
  const root = path.parse(dir).root;
  while (dir !== root) {
    if (fs.existsSync(path.join(dir, 'tracker.yaml')) ||
        fs.existsSync(path.join(dir, 'profile.yaml'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv);
  const cmd = args._command;
  const explicitDir = args.dir || process.env.JFM_DIR;
  const detected = explicitDir || detectWorkspace();
  // `init` is allowed to create a fresh workspace in cwd when nothing is detected.
  const dir = detected || (cmd === 'init' ? process.cwd() : null);

  if (!dir) {
    console.error('Error: could not locate a JFM workspace (no tracker.yaml or profile.yaml found walking up from cwd).');
    console.error('Set JFM_DIR to the workspace path, or pass --dir=<path>.');
    console.error("  export JFM_DIR='/path/to/workspace'");
    process.exit(1);
  }

  // Guard against silent writes to a stale/wrong workspace: if neither tracker.yaml
  // nor profile.yaml exists at the resolved dir, fail loudly (except for `init`).
  if (cmd !== 'init' &&
      !fs.existsSync(path.join(dir, 'tracker.yaml')) &&
      !fs.existsSync(path.join(dir, 'profile.yaml'))) {
    console.error(`Error: no tracker.yaml or profile.yaml at ${dir}`);
    console.error('Refusing to operate on a phantom workspace. Check JFM_DIR / --dir, or run `init` to create one.');
    process.exit(1);
  }

  const handler = cmd ? commands[cmd] : null;
  if (!handler) {
    console.error(cmd ? `Unknown command: ${cmd}` : 'No command specified');
    console.error('Run: node tracker.js help');
    process.exit(1);

  }

  const required = REQUIRED_ARGS[cmd] || [];
  for (const key of required) {
    if (!args[key]) {
      console.error(`Missing --${key}`);
      process.exit(1);
    }
  }

  try {
    let result = handler(dir, args);
    if (result && typeof result.then === 'function') {
      result = await result;
    }
    // Commands may request a specific exit code via _exit_code on the
    // returned object — used by `sweep` to signal "applied fixes" (1)
    // vs "partial failure" (2). Stripped before printing.
    let customExit;
    if (result && typeof result === 'object' && '_exit_code' in result) {
      customExit = result._exit_code;
      delete result._exit_code;
    }
    console.log(JSON.stringify(result, null, 2));

    // Auto-rebuild board after mutations (pass --no-board to skip)
    if (MUTATING_COMMANDS.has(cmd) && !args['no-board']) {
      try {
        buildBoard(dir, { skipMigration: true });
      } catch (err) {
        console.error(`Board rebuild warning: ${err.message}`);
      }
    }

    if (customExit !== undefined && customExit !== 0) {
      process.exit(customExit);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
