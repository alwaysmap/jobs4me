# Releasing

## Prerequisites

- Clean working tree (no uncommitted changes)
- On the `main` branch
- Push access to `origin`

## Steps

Run the release script with the desired version:

```bash
npm run release -- X.Y.Z
```

This single command does everything:

1. Updates version in `plugin.json`, `marketplace.json`, and `package.json`
2. Commits the version bump (`Release vX.Y.Z`)
3. Creates git tag `vX.Y.Z`
4. Pushes the commit and tag to `origin main`

GitHub Actions detects the new `v*` tag and automatically:

5. Builds `jobs-for-me.zip`
6. Creates a GitHub Release with the zip attached and auto-generated release notes

## Example

```bash
npm run release -- 0.7.0
```

## Troubleshooting

- **"Working tree is dirty"** — commit or stash your changes first
- **"Tag already exists"** — that version has already been released; pick a new one
- **Invalid version** — must be `X.Y.Z` format (e.g. `0.7.0`, `1.0.0`)
