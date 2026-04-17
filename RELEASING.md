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
