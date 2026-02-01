---
type: reference
title: CI/CD Pipeline Setup Guide
created: 2026-02-01
tags:
  - ci-cd
  - github-actions
  - deployment
related:
  - "[[TEST-SETUP]]"
  - "[[README]]"
---

# CI/CD Pipeline Setup Guide

## Overview

The RaidPresence project uses a fully automated CI/CD pipeline powered by GitHub Actions and Railway. This creates a seamless deployment workflow where:

1. **You push a semantic version tag** (e.g., `v0.2.0`) to GitHub
2. **GitHub Actions automatically runs tests** to validate the build
3. **Railway detects the passing build and deploys** automatically
4. **Zero manual intervention required** from merge to production

## What the Workflow Does

The GitHub Actions workflow (`.github/workflows/ci-cd.yml`) is triggered whenever you push a semantic version tag matching the pattern `v[0-9]+.[0-9]+.[0-9]+` (like `v1.0.0`, `v0.2.0`, etc.).

When triggered, the workflow:

1. **Checks out your code** - Retrieves the code from the repository at the tag
2. **Sets up Node.js 18.x** - Configures the runtime environment compatible with project dependencies
3. **Installs dependencies** - Runs `npm ci` for clean, reproducible dependency installation
4. **Runs type checks** - Executes `npm test` which runs TypeScript compilation (`tsc --noEmit`)
5. **Validates or blocks** - If tests pass, Railway is notified and deploys; if tests fail, deployment is blocked

## How to Trigger a Deployment

### Step 1: Prepare Your Code

Ensure your code is committed and all changes are pushed to the main branch:

```bash
git add .
git commit -m "Your commit message"
git push origin main
```

### Step 2: Create a Semantic Version Tag

Create a new semantic version tag following the `v[MAJOR].[MINOR].[PATCH]` format:

```bash
# Example: Create version 0.2.0
git tag v0.2.0
```

### Step 3: Push the Tag to GitHub

Push the tag to trigger the CI/CD pipeline:

```bash
# Push a specific tag
git push origin v0.2.0

# Or push all tags at once
git push origin --tags
```

### Complete Example

```bash
# Commit your changes
git add .
git commit -m "feat: Add new raid command"

# Push to main branch
git push origin main

# Create a new version tag
git tag v0.2.0

# Push the tag to GitHub (this triggers the pipeline)
git push origin v0.2.0
```

## What Happens Next

After pushing the tag:

1. **GitHub Actions kicks off** within seconds
2. **Tests run automatically** (TypeScript type checking)
3. **Check GitHub Actions tab** to monitor progress

### Success Path
- ✅ All tests pass
- ✅ GitHub marks the workflow as successful
- ✅ Railway detects the passing build
- ✅ Railway automatically deploys the new version
- ✅ Your bot updates in production

### Failure Path
- ❌ Tests fail (TypeScript errors detected)
- ❌ GitHub marks the workflow as failed
- ❌ Railway does NOT deploy
- ❌ You must fix the errors and try again

## Monitoring Your Deployment

### Via GitHub Web Interface

1. Go to your repository on GitHub
2. Click the **Actions** tab
3. Look for your workflow run matching the tag you pushed
4. Click on the workflow to see detailed logs
5. Each step shows pass/fail status

### Via Command Line

```bash
# View your recent tags and commits
git tag -l --sort=-v:refname | head -10

# View GitHub Actions logs (requires GitHub CLI)
# First, install: https://cli.github.com/
gh run list --limit 10
gh run view <RUN_ID>
```

## Troubleshooting

### Tests Failed: What to Do

If the GitHub Actions workflow fails:

1. **Check the error logs** in the GitHub Actions tab
2. **Identify the TypeScript error** from the logs
3. **Fix the error locally**:
   ```bash
   npm test  # Run locally to verify the fix
   ```
4. **Commit and push the fix**:
   ```bash
   git add .
   git commit -m "fix: Resolve TypeScript error"
   git push origin main
   ```
5. **Create a new tag** with an updated version:
   ```bash
   git tag v0.2.1
   git push origin v0.2.1
   ```

### Common TypeScript Errors

- **Missing type annotations** - Add explicit types to variables/parameters
- **Type mismatches** - Ensure assigned values match declared types
- **Unused variables** - Remove or use all declared variables
- **Import errors** - Verify imports reference correct files and exports

### Workflow Doesn't Trigger

If pushing a tag doesn't trigger the workflow:

1. **Verify the tag format** - Must be exactly `v[NUMBER].[NUMBER].[NUMBER]` (e.g., `v0.1.0`)
2. **Check GitHub Actions permissions** - Ensure the repository has Actions enabled
3. **Verify the workflow file** - Confirm `.github/workflows/ci-cd.yml` exists in the repository
4. **Push to main branch first** - The workflow definition must exist on the branch being tested

Example valid tags:
- ✅ `v0.1.0`
- ✅ `v1.2.3`
- ✅ `v10.20.30`

Example invalid tags:
- ❌ `0.1.0` (missing `v` prefix)
- ❌ `v0.1` (missing patch version)
- ❌ `v0.1.0-beta` (contains non-numeric suffix)

## Manual Testing Before Release

Before creating a version tag, test locally to catch errors early:

```bash
# Run the same test that the workflow runs
npm test

# If npm test passes, you're good to create and push the tag
```

This saves time by catching issues before they reach GitHub.

## Next Steps

- Learn more about semantic versioning: https://semver.org/
- GitHub Actions documentation: https://docs.github.com/en/actions
- Railway deployment documentation: https://docs.railway.app/

---

**For questions or issues**, refer to the [[TEST-SETUP]] documentation or check the troubleshooting guides in [[README]].
