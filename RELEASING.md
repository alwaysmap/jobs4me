# Releasing

## Prerequisites

- Clean working tree (no uncommitted changes)
- HEAD is a fast-forward of `origin/main` (so the push lands cleanly)
- Push access to `origin`

The release script is worktree-safe — you can run it from the primary checkout on `main` or from any worktree branch that's been fast-forwarded from `main`. The push uses `HEAD:main` rather than the local `main` ref, so the branch name doesn't matter.

## Steps

Run the release script with the desired version:

```bash
npm run release -- X.Y.Z
```

This single command does everything:

1. Updates version in `plugin.json`, `marketplace.json`, and `package.json`
2. Commits the version bump (`Release vX.Y.Z`) on the current branch
3. Creates git tag `vX.Y.Z`
4. Pushes `HEAD` to `origin/main` and pushes the tag

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
- **"Updates were rejected because a pushed branch tip is behind its remote"** — your HEAD has diverged from `origin/main`. Rebase onto `origin/main` before releasing so the push is a fast-forward.
