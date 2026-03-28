#!/usr/bin/env node
/**
 * tracker.js — Safe YAML operations for the job search tracker.
 *
 * All reads and writes go through js-yaml, so output is always valid YAML.
 * Claude calls this script via Bash instead of writing YAML by hand.
 *
 * All mutating commands accept --rebuild-board to auto-regenerate Kanban/index.html.
 * All mutating commands automatically: backup → mutate → validate → print JSON result.
 *
 * Usage: node tracker.js <command> [options]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────

const VALID_STAGES = [
  'suggested', 'maybe', 'applied', 'interviewing',
  'offered', 'rejected', 'closed', 'declined',
];

// Deprecated stage names that should be auto-migrated
const STAGE_ALIASES = { possible: 'maybe' };

// Valid stage transitions (from → allowed destinations)
const STAGE_TRANSITIONS = {
  suggested: ['maybe', 'applied', 'declined'],
  maybe:     ['applied', 'interviewing', 'declined'],
  applied:   ['interviewing', 'rejected', 'closed', 'declined'],
  interviewing: ['offered', 'rejected', 'closed', 'declined'],
  offered:   ['applied', 'closed', 'declined'],
  rejected:  ['applied'],        // re-apply after rejection
  closed:    ['suggested'],      // re-opened posting
  declined:  ['suggested', 'maybe'],  // changed mind
};

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
 * @property {string} jd        - Resolved path to JD file (may not exist)
 * @property {string} overview  - Resolved path to overview file
 * @property {string} prep      - Resolved path to prep file
 * @property {boolean} has_jd
 * @property {boolean} has_overview
 * @property {boolean} has_prep
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

const trackerPath = (dir) => path.join(dir, 'tracker.yaml');
const filtersPath = (dir) => path.join(dir, 'filters.yaml');
const backupsPath = (dir) => path.join(dir, '.backups');

function slugify(text, maxLen = 50) {
  return (text || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLen);
}

function roleDirName(app) {
  const date = app.dates?.identified || app.dates?.suggested
    || app.last_updated
    || today();
  return `${date.slice(0, 7)}-${slugify(app.role)}`;
}

function companyDir(dir, company) {
  return path.join(dir, 'companies', company);
}

function roleDir(dir, app) {
  return path.join(companyDir(dir, app.company || 'Unknown'), roleDirName(app));
}

/**
 * Resolve document paths for an application.
 * Checks new `companies/` structure first, falls back to legacy flat layout.
 * @param {string} dir
 * @param {Application} app
 * @returns {DocPaths}
 */
function resolveDocPaths(dir, app) {
  const company = app.company || '';
  const rd = roleDir(dir, app);
  const cd = companyDir(dir, company);

  const candidates = {
    jd:       [path.join(rd, 'jd.md'),       path.join(dir, 'active', `${company} - JD.md`)],
    overview: [path.join(cd, 'overview.md'),  path.join(dir, `${company} - Company Overview.md`)],
    prep:     [path.join(rd, 'prep.md'),      path.join(dir, `${company} - Interview Prep.md`)],
  };

  const result = {};
  for (const [key, [preferred, legacy]] of Object.entries(candidates)) {
    const preferredExists = fs.existsSync(preferred);
    const legacyExists = !preferredExists && fs.existsSync(legacy);
    result[key] = preferredExists ? preferred : (legacyExists ? legacy : preferred);
    result[`has_${key}`] = preferredExists || legacyExists;
  }
  return /** @type {DocPaths} */ (result);
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

function readFilters(dir) {
  const p = filtersPath(dir);
  if (!fs.existsSync(p)) {
    return { include: {}, skip: [], watch: [], priority_sources: [], decline_patterns: [] };
  }
  return yaml.load(fs.readFileSync(p, 'utf8')) || {};
}

function writeFilters(dir, doc) {
  backup(dir, 'filters.yaml');
  fs.writeFileSync(filtersPath(dir), yaml.dump(doc, YAML_DUMP_OPTIONS), 'utf8');
}

// ────────────────────────────────────────────────────────────────
// Backup
// ────────────────────────────────────────────────────────────────

function backup(dir, filename) {
  const src = path.join(dir, filename);
  if (!fs.existsSync(src)) return;

  const bDir = backupsPath(dir);
  if (!fs.existsSync(bDir)) fs.mkdirSync(bDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const { name, ext } = path.parse(filename);
  fs.copyFileSync(src, path.join(bDir, `${name}.${ts}${ext}`));

  // Prune to last 20
  const keep = 20;
  const prefix = `${name}.`;
  const old = fs.readdirSync(bDir)
    .filter(f => f.startsWith(prefix) && f.endsWith(ext))
    .sort();
  while (old.length > keep) {
    fs.unlinkSync(path.join(bDir, old.shift()));
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

  const ids = apps.map(a => a.id).filter(Boolean);
  const seen = new Set();
  for (const id of ids) {
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

function escapeForScript(json) {
  return JSON.stringify(json).replace(/<\/script>/gi, '<\\/script>');
}

// ────────────────────────────────────────────────────────────────
// Pure mutation functions (operate on in-memory doc, no I/O)
//
// Each returns the affected Application. They mutate doc.applications
// in place — this is intentional since the doc is always read fresh
// and written back as a unit.
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
  // Accept deprecated aliases
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
// Board generation (decomposed)
// ────────────────────────────────────────────────────────────────

function enrichAppsWithDocFlags(dir, apps) {
  return apps.map(app => {
    const docs = resolveDocPaths(dir, app);
    return { ...app, has_jd: docs.has_jd, has_overview: docs.has_overview, has_prep: docs.has_prep };
  });
}

function buildConfigData(dir) {
  const config = {};

  const profilePath = path.join(dir, 'profile.yaml');
  if (fs.existsSync(profilePath)) {
    const profile = yaml.load(fs.readFileSync(profilePath, 'utf8')) || {};
    if (profile.preferences) config.preferences = profile.preferences;
  }

  const archetypesPath = path.join(dir, 'archetypes.yaml');
  if (fs.existsSync(archetypesPath)) {
    const arcDoc = yaml.load(fs.readFileSync(archetypesPath, 'utf8'));
    config.archetypes = Array.isArray(arcDoc) ? arcDoc : (arcDoc?.archetypes || []);
  }

  const filters = readFilters(dir);
  if (filters.include?.sources)          config.sources = filters.include.sources;
  if (filters.include?.target_companies) config.target_companies = filters.include.target_companies;
  if (filters.watch)                     config.watch = filters.watch;
  if (filters.skip)                      config.skip = filters.skip;
  if (filters.decline_patterns)          config.decline_patterns = filters.decline_patterns;

  return config;
}

function buildDocumentData(dir, apps) {
  const data = {};
  for (const app of apps) {
    const docs = resolveDocPaths(dir, app);
    for (const key of ['jd', 'overview', 'prep']) {
      if (docs[`has_${key}`] && fs.existsSync(docs[key])) {
        data[`${app.id}::${key}`] = fs.readFileSync(docs[key], 'utf8');
      }
    }
  }
  return data;
}

/** Build briefs data for embedding in the board. Returns array of {date, content}. */
function buildBriefsData(dir, limit = 15) {
  const briefsDir = path.join(dir, 'briefs');
  if (!fs.existsSync(briefsDir)) return [];

  return fs.readdirSync(briefsDir)
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse()
    .slice(0, limit)
    .map(f => ({
      date: f.replace(/\.md$/, ''),
      content: fs.readFileSync(path.join(briefsDir, f), 'utf8'),
    }));
}

/** Migrate legacy flat files into companies/ structure. Returns count of moved files. */
function migrateFiles(dir, apps) {
  let count = 0;
  for (const app of apps) {
    if (app.stage === 'suggested') continue;
    const company = app.company || '';
    if (!company) continue;

    const rd = roleDir(dir, app);
    const cd = companyDir(dir, company);

    const moves = [
      [path.join(dir, 'active',   `${company} - JD.md`),               path.join(rd, 'jd.md')],
      [path.join(dir, 'declined', `${company} - JD.md`),               path.join(rd, 'jd.md')],
      [path.join(dir, `${company} - Company Overview.md`),              path.join(cd, 'overview.md')],
      [path.join(dir, `${company} - Interview Prep.md`),                path.join(rd, 'prep.md')],
    ];
    for (const [src, dest] of moves) {
      if (moveFile(src, dest)) count++;
    }
  }
  return count;
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

    const rd = roleDir(dir, app);
    ensureDir(rd);
    const jdPath = path.join(rd, 'jd.md');
    fs.writeFileSync(jdPath, content, 'utf8');
    return { saved: jdPath, company: app.company, role: app.role, bytes: content.length };
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

    // Migrate legacy file structure
    const filesMoved = migrateFiles(dir, apps);
    return { stages_renamed: stagesRenamed, files_moved: filesMoved };
  },

  paths(dir, args) {
    const doc = readTracker(dir);
    const { app } = findApp(doc, args.id);
    const docs = resolveDocPaths(dir, app);
    return {
      company_dir: companyDir(dir, app.company),
      role_dir: roleDir(dir, app),
      ...docs,
    };
  },

  'needs-research'(dir) {
    const apps = readTracker(dir).applications;
    const seen = new Set();
    const needs = [];
    const skipStages = new Set(['declined', 'rejected', 'closed']);

    // Only research companies with at least one active (non-terminal) role
    const activeCompanies = new Set(
      apps.filter(a => a.company && !skipStages.has(a.stage)).map(a => a.company)
    );

    for (const company of activeCompanies) {
      if (seen.has(company)) continue;
      seen.add(company);

      const overviewPath = path.join(companyDir(dir, company), 'overview.md');
      if (!fs.existsSync(overviewPath)) {
        const rep = apps.find(a => a.company === company);
        needs.push({ company, id: rep.id, company_dir: companyDir(dir, company) });
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

  help() {
    return {
      commands: {
        'Core CRUD':       ['list', 'get', 'add', 'update', 'decline', 'stage'],
        'Batch':           ['batch', 'batch-decline', 'filter-candidates'],
        'Files':           ['save-jd', 'migrate', 'paths', 'needs-research'],
        'Board':           ['board-json', 'build-board', 'list-briefs'],
        'Query':           ['count', 'find'],
        'Housekeeping':    ['init', 'validate', 'add-decline-pattern', 'help'],
      },
      stages: VALID_STAGES,
      transitions: STAGE_TRANSITIONS,
    };
  },

  'build-board'(dir) {
    const scriptDir = __dirname;
    const templatePath = path.join(scriptDir, '..', 'skills', 'board', 'references', 'board-template.html');
    if (!fs.existsSync(templatePath)) throw new Error(`Template not found: ${templatePath}`);

    // Migrate legacy data (stage renames + file moves)
    const doc = readTracker(dir);
    let needsWrite = false;
    for (const app of doc.applications) {
      const alias = STAGE_ALIASES[app.stage];
      if (alias) { app.stage = alias; needsWrite = true; }
    }
    if (needsWrite) writeTracker(dir, doc);
    const apps = doc.applications;
    migrateFiles(dir, apps);

    const trackerData  = enrichAppsWithDocFlags(dir, apps);
    const configData   = buildConfigData(dir);
    const documentData = buildDocumentData(dir, apps);
    const briefsData   = buildBriefsData(dir);

    let html = fs.readFileSync(templatePath, 'utf8');
    html = html.replace('__TRACKER_DATA__',  escapeForScript(trackerData));
    html = html.replace('__CONFIG_DATA__',   escapeForScript(configData));
    html = html.replace('__DOCUMENT_DATA__', escapeForScript(documentData));
    html = html.replace('__BRIEFS_DATA__',   escapeForScript(briefsData));
    html = html.replace(/__WORKSPACE_DIR__/g, path.resolve(dir));

    const outDir = path.join(dir, 'Kanban');
    ensureDir(outDir);
    const outPath = path.join(outDir, 'index.html');
    fs.writeFileSync(outPath, html, 'utf8');
    return { built: outPath, roles: trackerData.length };
  },
};

// Commands that mutate tracker.yaml and support --rebuild-board
const MUTATING_COMMANDS = new Set([
  'add', 'update', 'decline', 'stage',
  'batch', 'batch-decline', 'add-decline-pattern',
]);

// Required args per command (checked before dispatch)
const REQUIRED_ARGS = {
  get:                    ['id'],
  add:                    ['json'],
  update:                 ['id', 'json'],
  decline:                ['id'],
  stage:                  ['id', 'stage'],
  find:                   ['company'],
  'add-decline-pattern':  ['pattern'],
  batch:                  ['json'],
  'batch-decline':        ['ids'],
  'filter-candidates':    ['json'],
  'save-jd':              ['id'],
  paths:                  ['id'],
};

// ────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv);
  const dir = args.dir || process.env.JFM_DIR || process.cwd();
  const cmd = args._command;

  const handler = cmd ? commands[cmd] : null;
  if (!handler) {
    console.error(cmd ? `Unknown command: ${cmd}` : 'No command specified');
    console.error(`Run: node tracker.js help`);
    process.exit(1);
  }

  // Check required args
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

    // Rebuild board after mutating commands if requested
    if (MUTATING_COMMANDS.has(cmd) && args['rebuild-board']) {
      try {
        const boardResult = commands['build-board'](dir, args);
        // Don't print board result — it would pollute the primary command's output
        void boardResult;
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
