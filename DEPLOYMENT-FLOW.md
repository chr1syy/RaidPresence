---
type: reference
title: End-to-End Deployment Flow
created: 2026-02-01
tags:
  - deployment
  - workflow
  - ci-cd
related:
  - "[[CI-CD-SETUP]]"
  - "[[RAILWAY-SETUP]]"
---

# End-to-End Deployment Flow

## Overview

This document describes the complete process from local development to production deployment. The workflow uses semantic version tags to trigger automated tests and deployments.

## Complete Deployment Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                    RAIDPRESENCE DEPLOYMENT FLOW                    │
└─────────────────────────────────────────────────────────────────────┘

1. LOCAL DEVELOPMENT
   └─→ Developer works on features, bug fixes, or improvements
   └─→ Code is tested locally
   └─→ Changes committed and pushed to main branch

2. CREATE & PUSH TAG
   └─→ git tag v0.2.0 (semantic versioning)
   └─→ git push origin v0.2.0 (pushes tag to GitHub)

3. GITHUB ACTIONS TRIGGERED
   └─→ GitHub detects tag matching pattern: v[0-9]+.[0-9]+.[0-9]+
   └─→ Workflow: .github/workflows/ci-cd.yml starts
   └─→ Ubuntu environment spins up

4. CI/CD VALIDATION
   ├─→ Checkout code from repository
   ├─→ Setup Node.js 18.x environment
   ├─→ Run: npm ci (clean dependency install)
   ├─→ Run: npm test (TypeScript compilation checks)
   └─→ Tests complete: PASS or FAIL

5. DECISION POINT
   │
   ├─→ ✅ TESTS PASS
   │   └─→ GitHub marks workflow as successful
   │   └─→ Go to Railway Deployment (Step 6)
   │
   └─→ ❌ TESTS FAIL
       └─→ GitHub marks workflow as failed
       └─→ Railway does NOT deploy
       └─→ Go to Error Recovery (Step 7)

6. RAILWAY DEPLOYMENT (on success)
   ├─→ Railway detects successful GitHub Actions build
   ├─→ Railway pulls code from main branch
   ├─→ Run build: npm run build (TypeScript + Prisma generate)
   ├─→ If build succeeds:
   │   ├─→ Run migrations: prisma migrate deploy
   │   ├─→ Deploy commands: node dist/deploy-commands.js
   │   ├─→ Start bot: node dist/index.js
   │   └─→ Bot connects to Discord ✅
   └─→ If build fails: Rollback to previous working version

7. ERROR RECOVERY (on GitHub Actions failure)
   ├─→ Developer reviews GitHub Actions logs
   ├─→ Identifies TypeScript errors
   ├─→ Fixes errors locally
   ├─→ Run: npm test (verify fix)
   ├─→ Push fixed code: git push origin main
   ├─→ Create new tag: git tag v0.2.1
   ├─→ Push tag: git push origin v0.2.1
   └─→ Return to Step 3 (GitHub Actions retries)

8. PRODUCTION DEPLOYMENT COMPLETE ✅
   └─→ Bot is running with latest code
   └─→ All Discord commands are registered
   └─→ Database migrations are applied
   └─→ Ready to serve raids
```

## Step-by-Step Instructions

### Phase 1: Local Development and Testing

**Duration**: Development-dependent (minutes to hours)

```bash
# 1. Work on your feature/fix
#    Create new files, modify existing code, etc.

# 2. Test locally to catch errors early
npm test

# If tests fail, fix the TypeScript errors:
# - Missing type annotations
# - Type mismatches
# - Unused variables
# - Import errors

# 3. Once tests pass locally, commit your changes
git add .
git commit -m "feat: Add new raid command"

# 4. Push to GitHub main branch
git push origin main
```

### Phase 2: Create and Push Semantic Version Tag

**Duration**: < 1 minute

```bash
# 1. Create a semantic version tag
#    Format: v[MAJOR].[MINOR].[PATCH]
#    Example: v0.2.0, v1.0.0, v0.2.1
git tag v0.2.0

# 2. Push the tag to GitHub
#    This is the trigger that starts the entire pipeline
git push origin v0.2.0

# OR push all tags at once if you created multiple
git push origin --tags
```

### Phase 3: GitHub Actions Runs Automatically

**Duration**: 1-3 minutes (automatic, no action needed)

**What happens:**
1. GitHub detects the tag was pushed
2. Workflow definition from `.github/workflows/ci-cd.yml` triggers
3. Ubuntu runner starts and checks out your code at the tag
4. Node.js 18.x is installed and configured
5. Dependencies are installed with `npm ci`
6. Tests run: `npm test` (TypeScript compilation)
7. Results reported back

**Monitor progress:**
```bash
# Via web interface
# Go to: https://github.com/[your-org]/RaidPresence/actions
# Look for the workflow run matching your tag name

# Via GitHub CLI (if installed)
gh run list --limit 10
gh run view <RUN_ID>  # Replace with actual run ID from list
```

### Phase 4: Railway Deployment Happens Automatically

**Duration**: 2-5 minutes (automatic, no action needed)

**What happens (on GitHub Actions success):**
1. Railway detects the passing workflow
2. Railway pulls the latest code from main branch
3. Railway runs `npm run build`:
   - Compiles TypeScript to JavaScript
   - Generates Prisma client for production database
4. Railway runs `npm start`:
   - Runs database migrations (`prisma migrate deploy`)
   - Deploys Discord commands (`node dist/deploy-commands.js`)
   - Starts the bot (`node dist/index.js`)
5. Bot connects to Discord

**Monitor progress:**
```bash
# Via Railway Dashboard
# Go to: https://railway.app/
# Select RaidPresence project
# Check "Deployments" tab for latest deployment status
# Look for "Running" status and green checkmarks
```

### Phase 5: Verification

**Duration**: 1-2 minutes

After deployment completes, verify the bot is working:

```bash
# In your Discord server:
# 1. Check that the bot is online (shows "Playing..." status)
# 2. Test a bot command (e.g., /raid list)
# 3. Verify no errors in Discord

# Alternative: Check Railway logs
# In Railway dashboard:
# - Click on "Logs" tab
# - Look for "Connected to Discord" message
# - Verify no error messages in the output
```

## Common Scenarios

### Scenario 1: Successful Deployment

```bash
# Day 1: New feature is ready
git add .
git commit -m "feat: Add raid scheduling command"
git push origin main

# Create version tag
git tag v0.2.0
git push origin v0.2.0

# GitHub Actions runs tests ✅
# Railway deploys automatically ✅
# Bot has new command in Discord ✅
```

### Scenario 2: Tests Fail, Need Fixes

```bash
# Day 1: Push tag triggers tests
git tag v0.2.0
git push origin v0.2.0

# GitHub Actions fails - TypeScript error detected
# Check logs: https://github.com/.../actions/runs/[RUN_ID]

# Day 1 (later): Fix the error locally
npm test  # Run locally to verify fix
git add .
git commit -m "fix: Add missing type annotation"
git push origin main

# Create new patch version
git tag v0.2.1
git push origin v0.2.1

# GitHub Actions runs tests ✅
# Railway deploys automatically ✅
```

### Scenario 3: Multiple Commits Before Deployment

```bash
# Day 1-3: Multiple commits accumulated
git add .
git commit -m "refactor: Improve raid creation logic"
git push origin main

git add .
git commit -m "feat: Add raid notifications"
git push origin main

git add .
git commit -m "fix: Database query optimization"
git push origin main

# Day 4: All features ready for release
git tag v0.2.0
git push origin v0.2.0

# All accumulated changes deploy at once ✅
```

## Troubleshooting Common Issues

### Issue: GitHub Actions Workflow Didn't Trigger

**Symptoms**: Pushed a tag but no workflow run appears in GitHub Actions

**Causes & Solutions:**

1. **Tag format is wrong**
   - ❌ Wrong: `0.1.0`, `v0.1`, `release-0.1.0`
   - ✅ Correct: `v0.1.0`, `v1.0.0`, `v2.3.4`
   - Solution: Delete and recreate with correct format
   ```bash
   git tag -d v0.1.0  # Delete local tag
   git push origin :refs/tags/v0.1.0  # Delete remote tag
   git tag v0.1.0  # Create correct tag
   git push origin v0.1.0
   ```

2. **Workflow file is missing or broken**
   - Check that `.github/workflows/ci-cd.yml` exists
   - Verify YAML syntax is correct (no indentation errors)
   - Solution: Repair or recreate workflow file from [[CI-CD-SETUP]]

3. **GitHub Actions is disabled on repository**
   - Go to Settings → Actions
   - Enable "Actions" for the repository
   - Retry deployment

### Issue: Tests Pass but Railway Doesn't Deploy

**Symptoms**: GitHub Actions shows ✅ but bot doesn't update

**Causes & Solutions:**

1. **Railway project not connected to GitHub**
   - Go to Railway dashboard
   - Check that GitHub repository is linked
   - Solution: Reconnect the repository if needed

2. **Railway build command failed**
   - Check Railway deployment logs for build errors
   - Verify `npm run build` works locally
   - Solution: Fix build errors and retag with new version

3. **Railway start command failed**
   - Check Railway logs for errors during start
   - Common: Database migration failures, missing env vars
   - Solution: Check [[Troubleshooting]] section in [[RAILWAY-SETUP]]

### Issue: Tests Fail with TypeScript Error

**Symptoms**: GitHub Actions shows ❌ with TypeScript error message

**Common TypeScript Errors & Fixes:**

| Error | Cause | Fix |
|-------|-------|-----|
| `Cannot find module` | Wrong import path | Check file exists and path is correct |
| `Property 'X' does not exist` | Wrong type usage | Verify object has that property or use correct type |
| `Type 'X' is not assignable to type 'Y'` | Type mismatch | Check assigned value matches declared type |
| `Parameter 'X' implicitly has an 'any' type` | Missing type annotation | Add explicit type: `param: string` |
| `Unused variable 'X'` | Dead code | Remove variable or use it in code |

**Solution Steps:**

```bash
# 1. Run tests locally to see full error details
npm test

# 2. Read the error message carefully
# It tells you the file name and line number

# 3. Fix the issue in your editor
# Add type annotations, fix imports, etc.

# 4. Run tests again to verify fix
npm test

# 5. Commit and push the fix
git add .
git commit -m "fix: Resolve TypeScript error"
git push origin main

# 6. Create new tag with incremented patch version
git tag v0.2.1  # was v0.2.0, now v0.2.1
git push origin v0.2.1
```

## Best Practices

### Before Creating a Tag

```bash
# Always run tests locally first
npm test

# If tests pass, you're safe to tag and deploy
# If tests fail, fix locally before tagging
```

### Version Numbering

Follow semantic versioning (https://semver.org/):

- **MAJOR** (e.g., v1.0.0): Breaking changes
- **MINOR** (e.g., v0.2.0): New features, backwards compatible
- **PATCH** (e.g., v0.2.1): Bug fixes

Examples:
- `v0.1.0` → `v0.2.0` (added new commands)
- `v0.2.0` → `v0.2.1` (fixed a bug)
- `v0.2.1` → `v1.0.0` (breaking changes, major refactor)

### Commit Messages

Use clear, descriptive messages:

```bash
# ❌ Bad
git commit -m "updates"

# ✅ Good
git commit -m "feat: Add /raid schedule command"
git commit -m "fix: Prevent duplicate raid entries"
git commit -m "docs: Update README with new commands"
```

### Release Cadence

- **Hotfixes**: Deploy immediately with patch version bump
- **Feature releases**: Every 1-2 weeks with minor version bump
- **Major releases**: When breaking changes accumulated

## Deployment Checklist

Before each deployment, verify:

- [ ] `npm test` passes locally
- [ ] Git commit message is clear and descriptive
- [ ] Code is pushed to main branch
- [ ] Tag format is correct (v[NUMBER].[NUMBER].[NUMBER])
- [ ] Tag is pushed to GitHub (`git push origin [tag-name]`)
- [ ] GitHub Actions workflow started (check Actions tab)
- [ ] Tests passed in GitHub Actions (✅ status)
- [ ] Railway shows "Running" status
- [ ] Bot is online in Discord

If all checks pass, deployment is complete! 🎉

## Next Steps

- Read [[CI-CD-SETUP]] for detailed GitHub Actions configuration
- Read [[RAILWAY-SETUP]] for Railway platform details
- Check [[CICD-CHECKLIST]] before first deployment
- Refer to [[TROUBLESHOOTING]] for more help

---

**Last Updated**: 2026-02-01

For help with specific issues, check the troubleshooting guides or refer to the related documentation linked above.
