---
type: reference
title: Version Strategy and Semantic Versioning
created: 2026-02-01
tags:
  - versioning
  - release
  - deployment
related:
  - "[[DEPLOYMENT-FLOW]]"
  - "[[CI-CD-SETUP]]"
---

# Version Strategy and Semantic Versioning Guide

This document outlines the versioning strategy for RaidPresence and best practices for managing releases and deployments.

## Rationale

**Clear versioning helps track deployments and enables quick rollbacks**: A consistent versioning scheme allows teams to:
- Clearly identify which changes are included in each release
- Quickly communicate the scope of changes (breaking, new features, fixes)
- Enable easy rollbacks to known good states
- Automate deployment pipelines based on version tags
- Track which versions are in production vs development

## Semantic Versioning (SemVer)

RaidPresence follows **Semantic Versioning 2.0.0** specification. All versions follow this format:

```
MAJOR.MINOR.PATCH
```

### Version Components

#### MAJOR (Breaking Changes)
- **When to bump**: When you make incompatible API or behavior changes
- **What it means**: Existing users MUST update their configurations or code
- **Example changes**:
  - Database schema changes that require migrations
  - Discord command syntax changes
  - Configuration file format changes
  - Removal of previously supported features
  - Major design changes to core functionality

**Example progression:**
```
v1.0.0 → v2.0.0  (breaking changes)
```

#### MINOR (New Features)
- **When to bump**: When you add new functionality in a backward-compatible way
- **What it means**: New capabilities available, but existing code continues to work
- **Example changes**:
  - New slash commands
  - New configuration options
  - New Discord features
  - Performance improvements
  - New database models (with migrations)

**Example progression:**
```
v1.0.0 → v1.1.0  (new feature)
v1.1.0 → v1.2.0  (another new feature)
```

#### PATCH (Bug Fixes)
- **When to bump**: When you fix bugs or make internal improvements
- **What it means**: Bug fixes and performance tweaks with no new functionality
- **Example changes**:
  - Bug fixes in existing commands
  - Performance optimizations
  - Documentation updates
  - Dependency security patches
  - Internal refactoring

**Example progression:**
```
v1.1.0 → v1.1.1  (bug fix)
v1.1.1 → v1.1.2  (another bug fix)
```

## Version Progression Examples

### Scenario 1: First Release
```
v0.1.0 (initial alpha release)
```

### Scenario 2: Development Sequence
```
v0.1.0 (initial release)
  ↓
v0.1.1 (critical bug fix)
  ↓
v0.2.0 (new raid management feature)
  ↓
v0.2.1 (performance fix)
  ↓
v0.2.2 (bug fix)
  ↓
v1.0.0 (stable production release)
```

### Scenario 3: Post-Launch Development
```
v1.0.0 (stable production release)
  ↓
v1.0.1 (hotfix for critical bug)
  ↓
v1.1.0 (new multi-server feature)
  ↓
v1.1.1 (fix in new feature)
  ↓
v1.2.0 (new configuration options)
  ↓
v2.0.0 (major redesign with breaking changes)
```

## Creating Version Tags

### Local Tag Creation

Create a new version tag on your local machine:

```bash
# Create annotated tag (recommended)
git tag -a v0.2.0 -m "Release v0.2.0: Add raid import feature"

# Or create lightweight tag (simpler)
git tag v0.2.0
```

**Recommendation**: Use annotated tags `-a` as they store the tagger name, email, and date.

### Pushing Tags to GitHub

Push all tags to the remote repository:

```bash
# Push only the tag you just created
git push origin v0.2.0

# Push all tags at once
git push --tags

# Push both commits and tags
git push origin main --tags
```

## Listing Existing Tags

View all version tags in your repository:

```bash
# List all tags
git tag --list

# List tags with descriptions (annotated tags only)
git tag --list -n

# List tags matching a pattern
git tag --list 'v1.*'

# Show tags with dates (for annotated tags)
git tag --list -n9999  # Shows all details

# Show detailed info for a specific tag
git show v1.0.0
```

### Tag Output Examples

```bash
$ git tag --list
v0.1.0
v0.2.0
v1.0.0
v1.1.0

$ git tag --list -n
v0.1.0          Initial alpha release
v0.2.0          Add raid import feature
v1.0.0          Stable production release
v1.1.0          Multi-server support
```

## Deleting Tags

### Delete Local Tag

If you made a mistake or need to redo a tag:

```bash
# Delete local tag
git tag -d v0.2.0
```

### Delete Remote Tag

If you've already pushed the tag to GitHub and need to remove it:

```bash
# Delete from GitHub (or any remote)
git push --delete origin v0.2.0

# Alternative syntax
git push origin :v0.2.0
```

### Completely Remove a Tag

To remove a tag from both local and remote:

```bash
# Delete locally
git tag -d v0.2.0

# Delete from all remotes
git push --delete origin v0.2.0
```

## CI/CD Integration

The RaidPresence CI/CD pipeline automatically:

1. **Triggers on version tags**: When you push a tag matching `v[0-9]+.[0-9]+.[0-9]+`, the pipeline starts
2. **Runs tests**: TypeScript compilation and all tests must pass
3. **Blocks bad releases**: If tests fail, deployment is blocked until fixed
4. **Auto-deploys on success**: Railway automatically deploys the tagged version

### GitHub Actions Trigger

The workflow in `.github/workflows/ci-cd.yml` listens for:

```yaml
on:
  push:
    tags:
      - 'v[0-9]+.[0-9]+.[0-9]+'
```

This matches: `v0.1.0`, `v1.2.3`, `v2.0.0`, etc.

## Release Workflow

### Step 1: Commit Your Changes

Make sure all your changes are committed:

```bash
git add .
git commit -m "feat: Add raid import feature"
```

### Step 2: Create Version Tag

Create a descriptive tag:

```bash
git tag -a v0.2.0 -m "Release v0.2.0: Add raid import feature

Features:
- Import raids from CSV file
- Automatic role assignment
- Bulk sync with database

Fixes:
- Performance issue with large rosters"
```

### Step 3: Push Tag to GitHub

```bash
git push origin v0.2.0
```

Or push all tags at once:

```bash
git push --tags
```

### Step 4: Watch GitHub Actions

1. Go to your GitHub repository
2. Click **Actions** tab
3. Watch the CI/CD pipeline run
4. If it passes, deployment to production is automatic
5. If it fails, fix the issues and create a new patch tag

### Step 5: Verify Deployment

Once the pipeline completes:
1. Check Railway deployment dashboard
2. Verify the new version is running
3. Test core functionality
4. Create a release note if needed

## Release Notes

After deploying, consider creating a GitHub Release:

```bash
# GitHub CLI approach (if using gh)
gh release create v0.2.0 --title "v0.2.0: Raid Import Feature" \
  --notes "Added CSV import capability and performance improvements"
```

Or manually through GitHub web interface:

1. Go to **Releases** page
2. Click **Draft a new release**
3. Select your tag
4. Fill in title and description
5. Click **Publish release**

## Version Constraints

To avoid conflicts, follow these rules:

1. **Never reuse versions**: v0.1.0 should only exist once
2. **Always increment**: 0.1.0 → 0.1.1 → 0.2.0 (never backward)
3. **Zero prefix for pre-release**: v0.x.y before v1.0.0 indicates "unstable"
4. **Pre-release suffixes** (optional): v1.0.0-alpha, v1.0.0-beta, v1.0.0-rc.1

## Troubleshooting

### Tag Didn't Trigger CI/CD

**Issue**: You created a tag but the workflow didn't run

**Causes:**
1. Tag doesn't match pattern `v[0-9]+.[0-9]+.[0-9]+`
2. Tag was created but not pushed to GitHub
3. Tag already existed with same name

**Solution:**
```bash
# Delete the tag and try again
git tag -d v0.2.0
git push --delete origin v0.2.0

# Create new tag with correct format
git tag -a v0.2.0 -m "Release v0.2.0"

# Push it
git push origin v0.2.0

# Check Actions tab
```

### Need to Re-run Pipeline for Same Version

**Issue**: Pipeline failed, you fixed it, but you can't push the same tag again

**Solution**: Delete and recreate the tag:

```bash
# Delete locally and remotely
git tag -d v0.2.0
git push --delete origin v0.2.0

# Re-create after fixes
git tag -a v0.2.0 -m "Release v0.2.0"
git push origin v0.2.0
```

### Multiple Hotfixes in Production

**Scenario**: v1.0.0 is live, you found a critical bug and deployed v1.0.1, but now you need another hotfix

**Solution**: Just follow the sequence:

```bash
v1.0.0 (production)
  ↓ (critical bug found)
v1.0.1 (hotfix deployed)
  ↓ (another issue found)
v1.0.2 (another hotfix)
  ↓ (more fixes)
v1.1.0 (accumulate fixes + new features)
```

## Best Practices

1. **Atomic commits**: Each commit should be a logical unit of work
2. **Meaningful messages**: Commit messages should explain *why*, not just *what*
3. **One feature per release**: Don't mix multiple features in one tag
4. **Test before tagging**: Always run tests before creating a version tag
5. **Document changes**: Include a CHANGELOG.md to track all versions
6. **Coordinate teams**: Discuss major/minor bumps with your team first
7. **Plan hotfixes**: Have a process for emergency production fixes

## References

- [Semantic Versioning 2.0.0](https://semver.org/)
- [Git Tag Documentation](https://git-scm.com/book/en/v2/Git-Basics-Tagging)
- [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
- [Conventional Commits](https://www.conventionalcommits.org/)
