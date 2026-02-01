---
type: reference
title: CI/CD Pipeline Comprehensive Guide
created: 2026-02-01
tags:
  - ci-cd
  - deployment
  - github-actions
  - railway
related:
  - "[[CI-CD-SETUP]]"
  - "[[DEPLOYMENT-FLOW]]"
  - "[[TEST-SETUP]]"
---

# CI/CD Pipeline Comprehensive Guide

Welcome to the RaidPresence CI/CD Pipeline documentation. This guide serves as your central entry point for understanding, setting up, and maintaining our automated deployment system.

**TL;DR - Deploy in 3 Steps:**
```bash
git tag v0.2.0          # Create version tag
git push --tags         # Push to GitHub
# Check GitHub Actions → Railway auto-deploys
```

---

## Quick Start: Deploy Your First Version

### Deployment in 3 Steps

#### Step 1: Create Version Tag

```bash
# Tag your commit with a version
git tag -a v0.1.0 -m "Release v0.1.0: Initial deployment"
```

#### Step 2: Push Tag to GitHub

```bash
# Push the tag (triggers CI/CD automatically)
git push origin v0.1.0

# Or push all tags at once
git push --tags
```

#### Step 3: Watch & Verify

1. Go to your GitHub repository
2. Click **Actions** tab
3. Watch the CI/CD pipeline run
4. If it passes ✅: Railway auto-deploys
5. If it fails ❌: Fix issues and re-tag

**Expected timeline:** 2-5 minutes from tag push to live deployment

---

## Architecture Overview

### How the Pipeline Works

```
Your Code Commit
       ↓
You Create Version Tag (v0.1.0)
       ↓
GitHub detects tag → Triggers CI/CD workflow
       ↓
┌─────────────────────────────────────────┐
│  GitHub Actions (CI/CD Pipeline)        │
│  1. Check out code                      │
│  2. Setup Node.js environment           │
│  3. Install dependencies (npm ci)       │
│  4. Run tests (TypeScript compilation)  │
│  5. Check code quality                  │
└─────────────────────────────────────────┘
       ↓
Tests Pass? ✅ YES → Tests Fail? ❌ NO
       ↓                    ↓
   SUCCESS          WORKFLOW BLOCKED
       ↓               (Fix & retry)
Railway Auto-Deploys
       ↓
New Version LIVE 🎉
```

### Key Components

| Component | Purpose | Location |
|-----------|---------|----------|
| **GitHub Actions** | Runs CI/CD pipeline, tests code | `.github/workflows/ci-cd.yml` |
| **TypeScript** | Type-safe development, compile checks | `src/**/*.ts` |
| **Jest** | Test runner and assertion library | `package.json` scripts |
| **Railway** | Hosts your application, auto-deploys | External service |
| **Git Tags** | Version markers that trigger deployments | Git repository |

---

## Files & Documentation

### Core Configuration Files

Located in repository root:

| File | Purpose | Edit? |
|------|---------|-------|
| `.github/workflows/ci-cd.yml` | GitHub Actions workflow definition | Rarely |
| `jest.config.js` | Test configuration | When adding tests |
| `tsconfig.json` | TypeScript configuration | Rarely |
| `package.json` | Dependencies and scripts | When adding dependencies |

### Documentation Files

This is your complete CI/CD documentation suite:

#### Setup & Configuration
- **[CI-CD-SETUP.md](CI-CD-SETUP.md)** - Initial setup guide for GitHub Actions and Railway integration
- **[RAILWAY-SETUP.md](RAILWAY-SETUP.md)** - Railway platform configuration and deployment setup
- **[TEST-SETUP.md](TEST-SETUP.md)** - Testing framework setup and running tests locally

#### Operations & Deployment
- **[DEPLOYMENT-FLOW.md](DEPLOYMENT-FLOW.md)** - Step-by-step deployment process from tag to production
- **[VERSION-STRATEGY.md](VERSION-STRATEGY.md)** - Semantic versioning, best practices, and tag management
- **[NOTIFICATIONS-SETUP.md](NOTIFICATIONS-SETUP.md)** - Configure failure alerts on Discord or Slack

#### Monitoring & Enhancements
- **[CI-BADGES.md](CI-BADGES.md)** - GitHub repository badges showing build status
- **[OPTIONAL-ENHANCEMENTS.md](OPTIONAL-ENHANCEMENTS.md)** - Advanced features: artifacts, logs, coverage tracking

#### This Document
- **CICD-README.md** - You are here! Central entry point and overview

---

## Common Tasks

### Deploy a New Version

See [DEPLOYMENT-FLOW.md](DEPLOYMENT-FLOW.md) for detailed step-by-step instructions.

**Quick version:**
```bash
# Make your changes and commit
git add .
git commit -m "feat: Add new raid feature"

# Create version tag
git tag -a v0.2.0 -m "Release v0.2.0: New raid feature"

# Push and deploy
git push origin v0.2.0

# Watch GitHub Actions → Railway deployment
```

### Check Current Deployment Status

1. Go to GitHub **Actions** tab
2. See latest workflow run status
3. Click run to view logs

Or check Railway dashboard:
1. Go to [Railway.app](https://railway.app)
2. Select your project
3. View latest deployment

### Fix a Failed Deployment

See [DEPLOYMENT-FLOW.md](DEPLOYMENT-FLOW.md) Troubleshooting section.

**Common causes:**
- Tests fail locally (run `npm test` to check)
- TypeScript compilation errors
- Type mismatches in code
- Dependency issues

**Fix process:**
```bash
# Fix the issues locally
npm test  # Find errors
# ... fix code ...

# Delete failed tag
git tag -d v0.2.0
git push --delete origin v0.2.0

# Re-tag and deploy
git tag -a v0.2.0 -m "Release v0.2.0"
git push origin v0.2.0
```

### Rollback to Previous Version

If deployed version has bugs:

```bash
# Find previous good version
git tag --list

# Check out that version
git checkout v0.1.0

# Create new tag from it
git tag -a v0.1.1 -m "Rollback to v0.1.0"

# Deploy
git push origin v0.1.1
```

---

## Troubleshooting

### Problem: Deployment Didn't Trigger

**Symptom**: I pushed a tag but GitHub Actions didn't run

**Causes & Solutions**:

1. **Tag format is wrong**
   - Must match pattern: `v[0-9]+.[0-9]+.[0-9]+`
   - Examples: ✅ `v0.1.0`, ✅ `v1.2.3`, ❌ `v1.0`, ❌ `1.0.0`
   ```bash
   # Delete wrong tag and retry
   git tag -d v1.0  # Wrong format
   git tag -a v1.0.0 -m "Release v1.0.0"  # Correct
   git push origin v1.0.0
   ```

2. **Tag wasn't pushed to GitHub**
   - You created it locally but forgot to push
   ```bash
   # Push the tag
   git push origin v0.1.0
   ```

3. **Workflow file is broken**
   - Check `.github/workflows/ci-cd.yml` exists and is valid YAML
   - Look for syntax errors (indentation, quotes)

**Solution**: See [DEPLOYMENT-FLOW.md](DEPLOYMENT-FLOW.md#troubleshooting)

### Problem: Tests Failed, Can't Deploy

**Symptom**: CI/CD shows red ❌, says "Tests Failed"

**Solution**:
1. Go to GitHub Actions → Click failed run
2. Find the failing test in logs
3. Fix the issue locally: `npm test`
4. Commit the fix
5. Delete the failed tag and create new one

See [TEST-SETUP.md](TEST-SETUP.md) for detailed test debugging.

### Problem: I Don't Get Failure Notifications

**Solution**: Set up notifications in [NOTIFICATIONS-SETUP.md](NOTIFICATIONS-SETUP.md)

Once configured, you'll be notified on:
- ❌ Test failures
- ✅ Successful deployments (optional)
- 🔗 Links to logs for quick debugging

---

## Understanding Your Pipeline

### What Runs During CI/CD

The `.github/workflows/ci-cd.yml` workflow:

1. **Checkout** - Downloads your code from GitHub
2. **Setup Node.js** - Installs Node.js environment
3. **Install Dependencies** - Runs `npm ci` (clean install)
4. **Run Tests** - Executes `npm test` (TypeScript compilation checks)
5. **Deploy** - If all pass, Railway automatically deploys

### Why Tests Matter

The pipeline **blocks deployment** if tests fail because:
- ❌ Failed tests = broken code likely
- Prevents bad code from reaching production
- Ensures only high-quality code deploys
- Protects users from bugs

### Running Tests Locally

Before creating a tag, test locally:

```bash
# Run all tests
npm test

# Run tests in watch mode (re-run on changes)
npm test -- --watch

# Run specific test file
npm test -- src/commands/raid.test.ts
```

See [TEST-SETUP.md](TEST-SETUP.md) for detailed testing guide.

---

## Versioning Strategy

RaidPresence uses **Semantic Versioning** (SemVer): `MAJOR.MINOR.PATCH`

### Version Bumping Rules

| Change | Bump | Example |
|--------|------|---------|
| Breaking change | MAJOR | v1.0.0 → v2.0.0 |
| New feature | MINOR | v1.0.0 → v1.1.0 |
| Bug fix | PATCH | v1.1.0 → v1.1.1 |

### Version Progression

```
v0.1.0 (initial)
  ↓
v0.1.1 (bug fix)
  ↓
v0.2.0 (new feature)
  ↓
v1.0.0 (stable)
  ↓
v1.0.1 (hotfix)
  ↓
v1.1.0 (new features)
```

See [VERSION-STRATEGY.md](VERSION-STRATEGY.md) for complete guide.

---

## Deployment Flow

### Before You Deploy

1. **Commit your changes**
   ```bash
   git add .
   git commit -m "your message"
   ```

2. **Run tests locally**
   ```bash
   npm test  # Must pass
   ```

3. **Push to main branch** (if required by your process)
   ```bash
   git push origin main
   ```

### During Deployment

1. **Create version tag**
   ```bash
   git tag -a v0.2.0 -m "Release v0.2.0"
   ```

2. **Push tag to GitHub**
   ```bash
   git push origin v0.2.0
   ```

3. **Watch pipeline**
   - GitHub Actions starts automatically
   - Takes 2-5 minutes
   - Failure notifications (if configured)

### After Deployment

1. **Verify in production**
   - Visit your application
   - Test core functionality
   - Check logs if issues

2. **Monitor for issues**
   - Watch logs for errors
   - Check user reports
   - Be ready to rollback if needed

See [DEPLOYMENT-FLOW.md](DEPLOYMENT-FLOW.md) for detailed walkthrough.

---

## Status Badges

Show your build status in README:

```markdown
[![CI/CD Pipeline](https://github.com/YOUR_USERNAME/RaidPresence/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/YOUR_USERNAME/RaidPresence/actions/workflows/ci-cd.yml)
```

Benefits:
- ✅ Shows build passes at a glance
- ✅ Visitors see active maintenance
- ✅ Clicks link directly to workflow

See [CI-BADGES.md](CI-BADGES.md) for setup.

---

## Optional Enhancements

After basic pipeline is working, consider adding:

| Feature | Complexity | Value |
|---------|-----------|-------|
| Failure notifications | ⭐ Low | 🔥 High |
| Test artifacts | ⭐ Low | 🔥 High |
| Code coverage | ⭐⭐ Medium | 🔥 Medium |
| Performance tracking | ⭐⭐ Medium | 🔥 Low |
| Automated releases | ⭐⭐⭐ High | 🔥 Medium |

See [OPTIONAL-ENHANCEMENTS.md](OPTIONAL-ENHANCEMENTS.md) for detailed setup.

---

## Security Considerations

### Secrets Management

Never commit:
- Discord/Slack webhook URLs
- Railway API tokens
- Database credentials
- Private keys

Store in **GitHub Secrets**:
1. Go to repo **Settings** → **Secrets**
2. Add secrets (e.g., `DISCORD_WEBHOOK_URL`)
3. Reference as `${{ secrets.SECRET_NAME }}`

### Permissions

- Only admins can configure CI/CD
- Only maintainers can create tags
- Webhook URLs have minimal permissions
- Review secrets quarterly

### Audit Trail

GitHub Actions logs:
- Who deployed what
- When deployments happened
- What commands ran
- Any errors that occurred

---

## Performance Tuning

### Pipeline Speed

Current average: **2-5 minutes**

Breakdown:
- Checkout: ~10s
- Setup Node.js: ~20s
- Install deps: ~30-60s (depends on network)
- Run tests: ~30-120s (depends on test count)
- Deploy: ~30s

### Optimization Tips

1. **Cache dependencies**: Already enabled (npm cache)
2. **Skip optional steps**: We don't upload artifacts by default
3. **Parallel tests**: Run multiple tests simultaneously
4. **Conditional steps**: Only run linting on code changes

See [OPTIONAL-ENHANCEMENTS.md](OPTIONAL-ENHANCEMENTS.md#performance-monitoring-dashboard) for monitoring.

---

## Key Files Explained

### `.github/workflows/ci-cd.yml`

The main CI/CD workflow file. Key sections:

```yaml
# Trigger: Only on version tags
on:
  push:
    tags:
      - 'v[0-9]+.[0-9]+.[0-9]+'

# Steps in order
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
  - run: npm ci
  - run: npm test
  # Optional: Post success/failure notifications
```

Edit this to:
- Add new test steps
- Enable notifications
- Upload artifacts
- Deploy to other services

### `jest.config.js`

Jest testing framework configuration:

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
};
```

Edit when:
- Adding new test patterns
- Changing test environment
- Adding test utilities

### `tsconfig.json`

TypeScript compiler configuration:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "strict": true,
    // ... more options
  }
}
```

Rarely needs editing. Controls:
- TypeScript version target
- Module output format
- Type checking strictness

---

## Next Steps

### New to CI/CD?

1. Read [CI-CD-SETUP.md](CI-CD-SETUP.md) - Initial configuration
2. Read [DEPLOYMENT-FLOW.md](DEPLOYMENT-FLOW.md) - Deployment process
3. Deploy your first version (see Quick Start above)

### Ready to Deploy?

1. Check [VERSION-STRATEGY.md](VERSION-STRATEGY.md) - Versioning rules
2. Run `npm test` - Verify tests pass
3. Create and push a tag - Start deployment

### Want Better Monitoring?

1. Configure [NOTIFICATIONS-SETUP.md](NOTIFICATIONS-SETUP.md) - Get failure alerts
2. Add [OPTIONAL-ENHANCEMENTS.md](OPTIONAL-ENHANCEMENTS.md) - Advanced features

### Need Help?

1. Check [DEPLOYMENT-FLOW.md](DEPLOYMENT-FLOW.md#troubleshooting) - Troubleshooting
2. Review [TEST-SETUP.md](TEST-SETUP.md) - Testing issues
3. Check GitHub Actions logs - Detailed error messages

---

## Quick Reference

### Common Commands

```bash
# Deploy a new version
git tag -a v0.2.0 -m "Release v0.2.0"
git push origin v0.2.0

# List all versions
git tag --list

# View specific version info
git show v0.2.0

# Delete a tag (if needed)
git tag -d v0.2.0
git push --delete origin v0.2.0

# Run tests locally
npm test

# Deploy specific commit
git log --oneline              # Find commit
git tag -a v0.2.0 COMMIT_SHA  # Tag it
git push origin v0.2.0         # Deploy
```

### Useful Links

- **GitHub Repository**: [View on GitHub](https://github.com/chr1syy/RaidPresence)
- **GitHub Actions**: [Actions Tab](https://github.com/chr1syy/RaidPresence/actions)
- **Railway Dashboard**: [View Deployments](https://railway.app)
- **Discord Developer Portal**: [Applications](https://discord.com/developers/applications)

---

## Document Map

```
CICD-README.md (You are here)
├── Quick Setup
├── Architecture Overview
├── Common Tasks
└── Links to:
    ├── CI-CD-SETUP.md (Initial setup)
    ├── DEPLOYMENT-FLOW.md (Detailed deployment)
    ├── TEST-SETUP.md (Testing guide)
    ├── RAILWAY-SETUP.md (Platform config)
    ├── VERSION-STRATEGY.md (Versioning)
    ├── NOTIFICATIONS-SETUP.md (Alerts)
    ├── CI-BADGES.md (Build badges)
    └── OPTIONAL-ENHANCEMENTS.md (Advanced features)
```

---

## Questions?

If something isn't clear:

1. **Check the relevant documentation** - Each file has a specific purpose
2. **Review GitHub Actions logs** - Detailed error messages are there
3. **Run tests locally** - `npm test` catches most issues
4. **Ask your team** - Someone may have encountered it

## Contributing

To improve this documentation:

1. Make improvements to the relevant .md file
2. Test the instructions yourself
3. Submit a pull request
4. Include what you fixed in the description

---

**Last Updated**: 2026-02-01  
**Maintainer**: DevOps Team  
**Status**: ✅ Active & Maintained
