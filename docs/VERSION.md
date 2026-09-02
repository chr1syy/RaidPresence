---
type: reference
title: RaidPresence Versioning System
created: 2026-02-18
tags:
  - versioning
  - release-management
  - semantic-versioning
related:
  - "[[CHANGELOG]]"
---

# Versioning System

RaidPresence follows **Semantic Versioning 2.0.0** with automated version management.

---

## Semantic Versioning Format

Version format: `MAJOR.MINOR.PATCH`

Example: `1.2.3`

### MAJOR Version (Breaking Changes)
- Increment when making incompatible API changes
- Example: Removing a command or changing database structure
- `1.0.0` → `2.0.0`

### MINOR Version (New Features)
- Increment when adding new functionality that is backward compatible
- Example: New `/stats` command
- `1.0.0` → `1.1.0`

### PATCH Version (Bug Fixes)
- Increment when fixing bugs with backward compatibility
- Example: Fixing a calculation error
- `1.0.0` → `1.0.1`

---

## Current Version

**View current version:**

```bash
# From package.json
npm pkg get version

# Output: "0.8.3"

# In Discord
# Bot footer shows: v0.8.3
```

**In bot messages:**

All embeds include version in the footer:

```
RaidPresence v0.8.3 • Powered by Discord.js
```

---

## Bumping Version

### Automated Version Commands

Use these commands to update version in `package.json`:

```bash
# Patch release (bug fix)
npm run version:patch

# Before: "version": "1.2.3"
# After:  "version": "1.2.4"

# Minor release (new feature)
npm run version:minor

# Before: "version": "1.2.3"
# After:  "version": "1.3.0"

# Major release (breaking change)
npm run version:major

# Before: "version": "1.2.3"
# After:  "version": "2.0.0"
```

### Manual Version Update

Edit `package.json` directly:

```json
{
  "name": "raid-presence",
  "version": "1.2.3"  // ← Update this
}
```

---

## Version Workflow

### Before Creating a Release

1. **Decide version type** based on changes:
   - MAJOR: Breaking changes (removed commands, schema changes)
   - MINOR: New features (new commands, new functionality)
   - PATCH: Bug fixes only

2. **Update version:**
   ```bash
   npm run version:minor  # Example
   ```

3. **Build and test:**
   ```bash
   npm run build
   npm run lint      # tsc --noEmit
   npx jest          # NOT `npm test`, which is mapped to tsc --noEmit
   ```

4. **Update CHANGELOG.md** with version entry (see below)

5. **Commit changes:**
   ```bash
   git add package.json CHANGELOG.md
   git commit -m "Bump version to 1.3.0"
   ```

6. **Create release tag** — see the warning below first:
   ```bash
   git tag -a v1.3.0 -m "Release version 1.3.0"
   git push origin main
   git push origin v1.3.0
   ```

---

## ⚠️ A tag is a production deployment

Pushing a `v*` tag does not just label a commit. It triggers the full deploy chain:

```
git push origin v1.3.0
  -> GitHub Actions (.github/workflows/ci-cd.yml, triggered by `on: push: tags: ['v*']`)
  -> builds and pushes ghcr.io/chr1syy/raidpresence:latest
  -> Watchtower on the production host (300s poll) pulls :latest
  -> the running container is replaced
  -> the container's start script runs `prisma migrate deploy` against the production database
```

There is **no manual approval gate and no automated rollback**. From `git push --tags` to
new code serving live guilds is a handful of minutes, unattended.

Consequences worth internalising:

- **Never tag to "see if the build works."** Use the CI workflow instead — it runs on every
  pull request, and `workflow_dispatch` lets you run it on any branch on demand.
- **Any migration in the release applies itself to production.** Take a fresh dump first:
  `bash /usr/local/bin/raidpresence-backup.sh` on the prod host (the nightly at 03:15 is a
  floor, not a substitute).
- **Rolling back means tagging a new version.** There is no "undo" — a bad `:latest` is
  replaced only by a newer `:latest`. A reverted commit still has to be tagged to ship.
- Two workflows exist and they are not interchangeable: `ci.yml` validates (pull requests,
  weekly schedule, manual dispatch) and deploys nothing; `ci-cd.yml` deploys and runs only
  on tags.

---

## How Version is Used

### 1. Display in Bot

Version automatically appears in embed footers:

```python
# From src/commands/raid.ts
const version = require('../../package.json').version;

embed.setFooter({
  text: `RaidPresence v${version} • Powered by Discord.js`
});
```

### 2. Startup Logging

Bot logs version on startup:

```
✓ Bot is ready! Version: v0.8.3
✓ Successfully registered 14 commands
```

### 3. Version Checking (Future)

Could be used to:
- Notify admins of available updates
- Track feature compatibility
- Support multiple API versions

---

## Versioning Decisions

### When to Bump MAJOR

- Removing a command entirely
- Changing command parameters incompatibly
- Database schema breaking changes
- Removing language support
- Node.js version requirement changes

**Example:** Removing `/raid pin` command → MAJOR bump

### When to Bump MINOR

- Adding new commands
- Adding new command options
- Adding new features
- Adding language support
- Adding new database models

**Example:** Adding `/stats` command → MINOR bump

### When to Bump PATCH

- Bug fixes
- Performance improvements
- Security patches
- Documentation improvements
- Internal refactoring

**Example:** Fixing attendance calculation bug → PATCH bump

---

## Release Checklist

Before releasing a new version:

- [ ] Jest suite passing: `npx jest` (**not** `npm test` — that is mapped to `tsc --noEmit`)
- [ ] TypeScript compiling: `npm run build`
- [ ] Linting clean: `npm run lint`
- [ ] CI green on the merged pull requests (`ci.yml`)
- [ ] Version bumped: `npm run version:patch/minor/major`
- [ ] CHANGELOG.md updated — the `[Unreleased]` section emptied into a dated entry
- [ ] Commits clean: `git status`
- [ ] Branch up to date: `git pull origin main`
- [ ] Documentation updated
- [ ] **If the release contains a migration:** fresh verified dump taken on the prod host
      (`bash /usr/local/bin/raidpresence-backup.sh`, check `/root/backups/.last-status`)
- [ ] **Understood that the next step deploys to production**, then: `git tag -a v${VERSION}`

---

## Version History

**`CHANGELOG.md` is the single source of truth for release history.** This file documents
the versioning *process*; duplicating the history here only produced a second copy that
went stale — it still listed v0.1.0 as current while production ran v0.8.3.

Current release: see `npm pkg get version` and the topmost entry in
[CHANGELOG.md](../CHANGELOG.md).

---

## Best Practices

### 1. Semantic Versioning
- Follow SemVer 2.0.0 strictly
- Don't use marketing versions (e.g., "2020.1" format)
- Don't skip version numbers

### 2. Consistent Tagging
- Use `v` prefix for all git tags: `v1.2.3`
- Annotate tags with release notes
- Push tags to remote: `git push origin v1.2.3`

### 3. Update Documentation
- Update CHANGELOG.md with each release
- Note breaking changes prominently
- Include upgrade instructions for major versions

### 4. Communicative Releases
- Announce major versions to users
- Provide migration guides for breaking changes
- Highlight new features in release notes

---

## Automation Opportunities

Future enhancements could include:

1. **A deploy gate.** The highest-value missing piece: a tag currently reaches production
   with no approval step and no rollback path. A GitHub Environment with a required
   reviewer on the `docker` job in `ci-cd.yml` would make the deploy deliberate without
   changing the workflow.

2. **Automated release notes** generated from commits between tags.

3. **Version Checking**
   ```typescript
   // Check for updates on bot startup
   if (localVersion < remoteVersion) {
     logger.warn(`Update available: ${remoteVersion}`);
   }
   ```

4. **API Versioning**
   ```typescript
   // Support multiple API versions
   const apiVersion = require('package.json').version;
   app.use('/api/v1', apiRouter);
   ```

---

## Common Commands Quick Reference

```bash
# View current version
npm pkg get version

# Bump patch (1.0.0 → 1.0.1)
npm run version:patch

# Bump minor (1.0.0 → 1.1.0)
npm run version:minor

# Bump major (1.0.0 → 2.0.0)
npm run version:major

# Build and test
npm run build && npm run test:jest

# Tag and push
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin --tags
```

---

## Related Documentation

- **CHANGELOG.md** - Release history and changes
- **CONTRIBUTING.md** - Contributing guidelines
- **Package.json** - Version source of truth

---

**Last Updated:** 2026-09-01
**Semantic Versioning Standard:** https://semver.org/spec/v2.0.0.html
