# Releasing

1. Bump `version` in `.claude-plugin/plugin.json` and `package.json`
2. Commit, push to main, then tag:

```sh
git add .claude-plugin/plugin.json package.json
git commit -m "Release v0.8.0"
git push origin main
git tag v0.8.0
git push origin v0.8.0
```

Pushing the tag triggers the workflow, which builds the zip, publishes the GitHub
Release, and notifies the marketplace. Nothing else to do.

## Prerequisites

`MARKETPLACE_DISPATCH_TOKEN` must be set in this repo's Actions secrets — a fine-grained
PAT scoped to `alwaysmap/alwaysmap-marketplace` with Contents write permission.

## Breaking changes

Call these out in the GitHub Release body (and, if applicable, a stderr version-skew notice) so cowork sessions hitting them after a session refresh have a pointer to the changelog.

### Unreleased

- **`set-archetypes --json` now requires the canonical object form** `{"role_types": [...]}`. The bare-array shortcut (`'["TPM","PM"]'`) was undocumented and had no observed callers (grep of `skills/`, `commands/`, `docs/`, `README.md` shows only object-form usage). Cowork plugins cache across sessions, so live sessions will not feel the break until session refresh.
