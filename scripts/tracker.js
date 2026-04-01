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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// js-yaml is bundled in the zip — no npm install needed
import yaml from 'js-yaml';

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
}

/** Read filters.yaml with key normalization to canonical names. */
function readFilters(dir) {
  const p = filtersPath(dir);
  if (!fs.existsSync(p)) {
    return { sources: [], target_companies: [], skip_companies: [], watch: [], decline_patterns: [] };
  }
  const raw = yaml.load(fs.readFileSync(p, 'utf8')) || {};
  // Normalize legacy key names → canonical
  return {
    sources:          raw.include?.sources || raw.sources || [],
    target_companies: raw.include?.target_companies || raw.target_companies || [],
    skip_companies:   raw.skip_companies || raw.skip || [],
    watch:            raw.watch || [],
    decline_patterns: raw.decline_patterns || [],
  };
}

function writeFilters(dir, doc) {
  backup(dir, 'filters.yaml');
  validateFilters(doc);
  fs.writeFileSync(filtersPath(dir), yaml.dump(doc, YAML_DUMP_OPTIONS), 'utf8');
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
      if (!cs.name) errors.push(`evidence.case_studies[${i}]: missing name`);
      if (!cs.situation) errors.push(`evidence.case_studies[${i}]: missing situation`);
      if (!cs.action) errors.push(`evidence.case_studies[${i}]: missing action`);
      if (!cs.outcome) errors.push(`evidence.case_studies[${i}]: missing outcome`);
      if (!Array.isArray(cs.skills)) errors.push(`evidence.case_studies[${i}]: skills must be an array`);
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

  // Prune to last 20 backups
  const prefix = `${name}.`;
  const backups = fs.readdirSync(bDir)
    .filter(f => f.startsWith(prefix) && f.endsWith(ext))
    .sort();

  const toRemove = backups.slice(0, Math.max(0, backups.length - 20));
  for (const f of toRemove) {
    fs.unlinkSync(path.join(bDir, f));
  }
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

function addEntry(doc, entry) {
  if (!entry.company) throw new Error('Missing required field: company');

  const defaults = {
    id: makeId(entry.company, entry.role),
    stage: 'suggested',
    last_updated: today(),
    dates: { identified: today() },
  };
  const merged = { ...defaults, ...entry, dates: { ...defaults.dates, ...entry.dates } };

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
        data[`${app.id}::${key}`] = fs.readFileSync(docs[key], 'utf8');
      }
    }

    // Overview is company-level — key by company name, read once per company
    if (docs.has_overview && !overviewSeen.has(app.company)) {
      overviewSeen.add(app.company);
      if (fs.existsSync(docs.overview)) {
        data[`${app.company}::overview`] = fs.readFileSync(docs.overview, 'utf8');
      }
    }
  }

  return data;
}

/** Load recent search briefs for embedding in the board. */
function buildBriefsData(dir, limit = 15) {
  const briefsPath = path.join(dir, 'briefs');
  if (!fs.existsSync(briefsPath)) return [];

  return fs.readdirSync(briefsPath)
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse()
    .slice(0, limit)
    .map(f => ({
      date: f.replace(/\.md$/, ''),
      content: fs.readFileSync(path.join(briefsPath, f), 'utf8'),
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
  // Resolve template path: CLAUDE_PLUGIN_ROOT (set by Cowork) or relative to script
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
    const entry = addEntry(doc, JSON.parse(args.json));
    writeTracker(dir, doc);
    return entry;
  },

  update(dir, args) {
    const doc = readTracker(dir);
    const app = updateEntry(doc, args.id, JSON.parse(args.json));
    writeTracker(dir, doc);
    return app;
  },

  decline(dir, args) {
    const doc = readTracker(dir);
    const app = declineEntry(doc, args.id, args.reason || '');
    writeTracker(dir, doc);
    return app;
  },

  stage(dir, args) {
    const doc = readTracker(dir);
    const app = stageEntry(doc, args.id, args.stage);
    writeTracker(dir, doc);
    return app;
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

  // ── Batch & bulk ──

  batch(dir, args) {
    const ops = JSON.parse(args.json);
    if (!Array.isArray(ops) || ops.length === 0) {
      throw new Error('batch expects a non-empty JSON array of operations');
    }

    const doc = readTracker(dir);
    const results = ops.map(op => {
      try {
        const handlers = {
          add:     () => addEntry(doc, op.entry || {}),
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
    const reason = args.reason || '';
    const results = ids.map(id => {
      try {
        const app = declineEntry(doc, id, reason);
        return { ok: true, id, company: app.company };
      } catch (err) {
        return { ok: false, id, error: err.message };
      }
    });

    writeTracker(dir, doc);
    return { declined: results.filter(r => r.ok).length, total: ids.length, results };
  },

  'filter-candidates'(dir, args) {
    const candidates = JSON.parse(args.json);
    const existing = new Set(
      readTracker(dir).applications.map(a =>
        `${(a.company || '').toLowerCase()}::${(a.role || '').toLowerCase()}`
      )
    );

    const filters = readFilters(dir);
    const skipTerms = (filters.skip || []).map(s =>
      (typeof s === 'string' ? s : s.name || '').toLowerCase()
    );
    const declineTerms = (filters.decline_patterns || []).map(p =>
      (typeof p === 'string' ? p : p.pattern || '').toLowerCase()
    ).filter(Boolean);

    const passed = [];
    const filtered = [];

    for (const c of candidates) {
      const companyLower = (c.company || '').toLowerCase();
      const key = `${companyLower}::${(c.role || '').toLowerCase()}`;

      if (existing.has(key)) {
        filtered.push({ ...c, reason: 'duplicate' });
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
    const updates = JSON.parse(args.json);
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
    const input = JSON.parse(args.json);
    const doc = { role_types: input.role_types || input };
    writeArchetypes(dir, doc);
    return doc;
  },

  'get-filters'(dir) {
    return readFilters(dir);
  },

  'set-filters'(dir, args) {
    const updates = JSON.parse(args.json);
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
      const toAdd = JSON.parse(args.add);
      const existing = new Set(items.map(s => s.toLowerCase()));
      for (const item of toAdd) {
        if (!existing.has(item.toLowerCase())) {
          items.push(item);
          existing.add(item.toLowerCase());
        }
      }
    }

    if (args.remove) {
      const toRemove = new Set(JSON.parse(args.remove).map(s => s.toLowerCase()));
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
              name: 'string (REQUIRED)',
              company: 'string',
              date: 'YYYY-MM',
              url: 'URL string',
              situation: 'string (REQUIRED)',
              action: 'string (REQUIRED)',
              outcome: 'string (REQUIRED)',
              skills: ['string (REQUIRED)'],
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

    if (file === 'all') return schemas;
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
        'Config':       ['get-profile', 'set-profile', 'get-archetypes', 'set-archetypes', 'get-filters', 'set-filters', 'update-filter-list'],
        'Files':        ['save-jd', 'migrate', 'paths', 'needs-research'],
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
  'batch', 'batch-decline', 'add-decline-pattern',
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
};

// ────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────

/** Walk up from cwd looking for tracker.yaml or profile.yaml. */
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
  return process.cwd();
}

function main() {
  const args = parseArgs(process.argv);
  const dir = args.dir || process.env.JFM_DIR || detectWorkspace();
  const cmd = args._command;

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
    const result = handler(dir, args);
    console.log(JSON.stringify(result, null, 2));

    // Auto-rebuild board after mutations (pass --no-board to skip)
    if (MUTATING_COMMANDS.has(cmd) && !args['no-board']) {
      try {
        buildBoard(dir, { skipMigration: true });
      } catch (err) {
        console.error(`Board rebuild warning: ${err.message}`);
      }
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
