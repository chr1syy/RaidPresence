---
type: reference
title: CI/CD Pre-Deployment Validation Checklist
created: 2026-02-01
tags:
  - deployment
  - validation
  - checklist
related:
  - "[[CI-CD-SETUP]]"
  - "[[DEPLOYMENT-FLOW]]"
  - "[[RAILWAY-SETUP]]"
---

# CI/CD Pre-Deployment Validation Checklist

## Purpose

This checklist helps verify that all CI/CD components are properly configured before your first (or any subsequent) deployment. Use this to systematically validate each part of the deployment pipeline.

**How to use this checklist:**
1. Work through each section sequentially
2. Check off items as they're verified
3. If any item fails, see the troubleshooting section for that component
4. Do NOT proceed with deployment until all items are checked

---

## 1. GitHub Actions Configuration

### 1.1 Workflow File Exists

```bash
# Run this command to check
ls -la .github/workflows/ci-cd.yml
```

**Expected output:**
```
-rw-r--r-- 1 user user 2048 Feb 01 10:00 .github/workflows/ci-cd.yml
```

- [ ] File exists at `.github/workflows/ci-cd.yml`
- [ ] File size is greater than 500 bytes (not empty or corrupted)

**If failing:**
- Create the workflow file from [[CI-CD-SETUP]] documentation
- Copy the complete workflow configuration exactly

### 1.2 Workflow Triggers on Correct Tag Pattern

Open `.github/workflows/ci-cd.yml` and verify the trigger section:

```yaml
on:
  push:
    tags:
      - 'v[0-9]+.[0-9]+.[0-9]+'
```

- [ ] Trigger is configured for `push` events
- [ ] Tag pattern matches `v[0-9]+.[0-9]+.[0-9]+` (e.g., v0.1.0, v1.2.3)
- [ ] No other trigger conditions that might conflict

**If failing:**
- Edit `.github/workflows/ci-cd.yml`
- Ensure the trigger pattern is exactly as shown above

### 1.3 Workflow Has All Required Steps

The workflow should have these steps (check the file):

- [ ] `Checkout code` - uses `actions/checkout@v4`
- [ ] `Set up Node.js` - uses `actions/setup-node@v4` with `node-version: '18.x'`
- [ ] `Install dependencies` - runs `npm ci`
- [ ] `Run tests (TypeScript type checks)` - runs `npm test`

**If failing:**
- Add missing steps by comparing with [[CI-CD-SETUP]]
- Ensure step names and commands are exactly correct

### 1.4 GitHub Actions Permissions Enabled

Go to your GitHub repository settings:

1. Navigate to **Settings** → **Actions** → **General**
2. Check the **Actions permissions**

- [ ] "Allow all actions and reusable workflows" is selected
   OR
- [ ] "Allow select actions and reusable workflows" with `actions/checkout@*` and `actions/setup-node@*` allowed

**If failing:**
- Enable Actions in repository settings
- Grant permissions for the required actions

---

## 2. Package.json Configuration

### 2.1 Test Script Exists and is Correct

```bash
# View the test script
grep '"test":' package.json
```

**Expected output:**
```json
"test": "tsc --noEmit"
```

- [ ] `test` script exists in package.json
- [ ] `test` script runs `tsc --noEmit` (TypeScript type checking)
- [ ] Script does NOT have `--watch` or other modifications

**If failing:**
```bash
# Update package.json test script
npm set-script test "tsc --noEmit"
```

### 2.2 Build Script Exists and is Correct

```bash
# View the build script
grep '"build":' package.json
```

**Expected output:**
```json
"build": "tsc && prisma generate"
```

- [ ] `build` script exists in package.json
- [ ] `build` script compiles TypeScript with `tsc`
- [ ] `build` script generates Prisma client with `prisma generate`
- [ ] Both commands are connected with `&&` (both must succeed)

**If failing:**
```bash
npm set-script build "tsc && prisma generate"
```

### 2.3 Start Script Exists and is Correct

```bash
# View the start script
grep '"start":' package.json
```

**Expected output:**
```json
"start": "prisma migrate deploy && node dist/deploy-commands.js && node dist/index.js"
```

- [ ] `start` script exists in package.json
- [ ] `start` script runs database migrations: `prisma migrate deploy`
- [ ] `start` script deploys Discord commands: `node dist/deploy-commands.js`
- [ ] `start` script starts the bot: `node dist/index.js`
- [ ] All commands are connected with `&&` (all must succeed in order)

**If failing:**
```bash
npm set-script start "prisma migrate deploy && node dist/deploy-commands.js && node dist/index.js"
```

### 2.4 Database Migration Script Exists

```bash
# View the db:migrate:deploy script
grep '"db:migrate:deploy":' package.json
```

**Expected output:**
```json
"db:migrate:deploy": "prisma migrate deploy"
```

- [ ] `db:migrate:deploy` script exists
- [ ] Script runs `prisma migrate deploy` (applies pending migrations)

**If failing:**
```bash
npm set-script db:migrate:deploy "prisma migrate deploy"
```

### 2.5 Verify Scripts Work Locally

```bash
# Test each script
npm test          # Should compile without errors
npm run build     # Should create dist/ directory
npm run db:migrate:deploy  # Should run without errors (or say no migrations)
```

- [ ] `npm test` runs without TypeScript errors
- [ ] `npm run build` creates a `dist/` directory
- [ ] `npm run build` generates Prisma client successfully
- [ ] `npm run db:migrate:deploy` completes (may say "0 migrations pending")

**If failing:**
- Fix TypeScript errors shown in output
- Check that `dist/` directory exists after build
- Verify database connection string is set in `.env` file

---

## 3. Environment Variables Configuration

### 3.1 Required Variables Documented

- [ ] Project documentation lists required environment variables:
  - `DISCORD_TOKEN` - Bot token for authentication
  - `DISCORD_CLIENT_ID` - Application ID for the bot
  - `DISCORD_CLIENT_SECRET` - OAuth client secret
  - `DATABASE_URL` - PostgreSQL connection string

**If failing:**
- Create `.env.example` in project root with placeholder values
- Example:
  ```
  DISCORD_TOKEN=your_token_here
  DISCORD_CLIENT_ID=your_client_id_here
  DISCORD_CLIENT_SECRET=your_client_secret_here
  DATABASE_URL=postgresql://user:password@localhost:5432/raid_dev
  ```

### 3.2 Local Environment File Exists

```bash
# Check if .env file exists
ls -la .env
```

- [ ] `.env` file exists in project root
- [ ] `.env` contains all required variables with valid values
- [ ] `.env` is listed in `.gitignore` (NOT committed to Git)

**If failing:**
```bash
# Create .env file from example
cp .env.example .env

# Edit .env and fill in your actual values
# Do NOT commit this file to Git
echo ".env" >> .gitignore
```

### 3.3 Production Variables Ready for Railway

Before deploying to Railway, prepare these values:

- [ ] Production `DISCORD_TOKEN` - Verified with Discord
- [ ] Production `DISCORD_CLIENT_ID` - Matches Discord application
- [ ] Production `DISCORD_CLIENT_SECRET` - Valid and secure
- [ ] Production `DATABASE_URL` - PostgreSQL connection to production database

**Note:** These will be entered in Railway's environment settings, NOT in Git

---

## 4. TypeScript Configuration

### 4.1 TypeScript Configuration File Exists

```bash
# Check tsconfig.json
ls -la tsconfig.json
```

- [ ] `tsconfig.json` exists in project root
- [ ] File is valid JSON (check for syntax errors)

**If failing:**
- Create `tsconfig.json` from project template
- Ensure it's properly formatted JSON

### 4.2 TypeScript Compiles Successfully

```bash
# Try to compile
npm run build
```

- [ ] Build completes without errors
- [ ] `dist/` directory is created
- [ ] JavaScript files appear in `dist/`

**If failing:**
- Review TypeScript error messages
- Fix any type errors reported
- Verify all TypeScript files are in `src/` directory

---

## 5. Railway Integration

### 5.1 Railway Project Created

- [ ] Railway project exists at https://railway.app/
- [ ] Project is named "RaidPresence" or similar
- [ ] Can access project dashboard

**If failing:**
- Go to https://railway.app/ and create new project
- Link it to your GitHub repository

### 5.2 Railway Connected to GitHub

Go to Railway project settings:

1. Click **Settings** (gear icon)
2. Look for **GitHub Integration** or **Source**

- [ ] GitHub repository is linked to Railway project
- [ ] Shows your RaidPresence repository
- [ ] Connection status shows "Connected" or "Active"

**If failing:**
- Click "Connect GitHub" or "Link Repository"
- Authorize Railway to access your GitHub account
- Select RaidPresence repository

### 5.3 Railway Build and Start Commands Configured

In Railway project settings:

- [ ] **Build command** is set to: `npm run build`
- [ ] **Start command** is set to: `npm start`
- [ ] Both commands are visible in the build settings

**If failing:**
- Go to Railway project → **Settings**
- Update "Build Command" to `npm run build`
- Update "Start Command" to `npm start`

### 5.4 Railway Environment Variables Set

In Railway project environment:

- [ ] `DISCORD_TOKEN` is set to production token
- [ ] `DISCORD_CLIENT_ID` is set
- [ ] `DISCORD_CLIENT_SECRET` is set
- [ ] `DATABASE_URL` is set to production PostgreSQL

**If failing:**
- Go to **Variables** tab in Railway project
- Add each missing variable with production value
- Save changes (Railway will auto-redeploy)

### 5.5 Railway Database Connection

- [ ] PostgreSQL database is provisioned in Railway
- [ ] `DATABASE_URL` points to this database
- [ ] Can connect to database from Railway logs (no connection errors)

**If failing:**
- Create PostgreSQL database in Railway if needed
- Verify connection string is correct
- Check that Railway can access the database

---

## 6. Git Repository Setup

### 6.1 Repository Has Main Branch

```bash
# Check current branch
git branch -a | grep main
```

- [ ] `main` branch exists
- [ ] You can switch to main branch: `git checkout main`
- [ ] Branch is up to date: `git status` shows "nothing to commit"

**If failing:**
- Create main branch if it doesn't exist: `git checkout -b main`
- Push to GitHub: `git push origin main`

### 6.2 Git Remote is Configured

```bash
# Check remote configuration
git remote -v
```

**Expected output:**
```
origin  https://github.com/[your-org]/RaidPresence.git (fetch)
origin  https://github.com/[your-org]/RaidPresence.git (push)
```

- [ ] Remote named `origin` points to GitHub repository
- [ ] Remote URL matches your RaidPresence repository

**If failing:**
```bash
git remote set-url origin https://github.com/[your-org]/RaidPresence.git
```

### 6.3 .gitignore Has Important Files

```bash
# Check .gitignore
cat .gitignore | grep -E "^\.env$|^node_modules/|^dist/|^coverage/"
```

- [ ] `.env` is in `.gitignore` (secrets not committed)
- [ ] `node_modules/` is in `.gitignore`
- [ ] `dist/` is in `.gitignore` (built files not committed)
- [ ] `coverage/` is in `.gitignore` (test artifacts)

**If failing:**
- Add these lines to `.gitignore`:
  ```
  .env
  node_modules/
  dist/
  coverage/
  ```

---

## 7. Documentation Verification

### 7.1 Deployment Documentation Exists

- [ ] `CI-CD-SETUP.md` exists and is readable
- [ ] `DEPLOYMENT-FLOW.md` exists and documents the complete flow
- [ ] `RAILWAY-SETUP.md` exists and documents Railway configuration
- [ ] This checklist `CICD-CHECKLIST.md` exists

**If failing:**
- Create missing documentation files from [[CI-CD-SETUP]], [[DEPLOYMENT-FLOW]], and [[RAILWAY-SETUP]]

### 7.2 Documentation References are Accurate

Check each document mentions:

- [ ] Required npm scripts (test, build, start)
- [ ] Required environment variables
- [ ] Correct tag pattern (v[0-9]+.[0-9]+.[0-9]+)
- [ ] Step-by-step deployment instructions

**If failing:**
- Update documentation to reflect actual configuration
- Keep examples realistic and copy-pasteable

---

## 8. Pre-Deployment Test

### 8.1 Local Test Build

```bash
# Test the complete build and startup process locally
npm test        # TypeScript check
npm run build   # Build for deployment
npm start       # Start the application
```

- [ ] `npm test` completes without errors
- [ ] `npm run build` creates dist/ directory successfully
- [ ] `npm start` starts without errors (bot connects to Discord)

**If failing:**
- Review error messages from each command
- Fix issues before proceeding
- Do NOT push to GitHub if local tests fail

### 8.2 Create Test Tag Locally

```bash
# Create a test tag (not pushed yet)
git tag v0.0.1-test

# View your tags
git tag -l
```

- [ ] Can create Git tags without errors
- [ ] Test tag appears in `git tag -l` output

**If failing:**
- Verify Git is installed and working: `git --version`
- Check Git configuration: `git config --list | grep user`

### 8.3 Verify Tag Push Works

```bash
# Push test tag (this triggers GitHub Actions!)
git push origin v0.0.1-test

# Monitor GitHub Actions
# Check: https://github.com/[your-org]/RaidPresence/actions
```

- [ ] Can push tags to GitHub
- [ ] GitHub Actions workflow triggers (appears in Actions tab)
- [ ] Workflow shows up within 30 seconds

**If failing:**
- Check GitHub Actions is enabled (Section 1.4)
- Verify tag format matches pattern
- Check Git remote is configured correctly (Section 6.2)

### 8.4 Verify Workflow Completes

Monitor the test workflow run:

- [ ] Workflow runs through all steps
- [ ] Workflow completes (shows final status)
- [ ] If tests pass, workflow shows green ✅

**Note:** The test workflow may succeed or fail, that's OK - we're just testing that the automation works.

---

## Verification Summary

Before your first real deployment, ensure:

```
GitHub Actions    ✅ Workflow exists, triggers on tags, all steps present
Package.json      ✅ test, build, start scripts correct and tested
Environment Vars  ✅ All required variables documented and ready
TypeScript        ✅ Compiles locally without errors
Railway           ✅ Project created, connected to GitHub, env vars set
Git Repository    ✅ Main branch exists, remote configured correctly
Documentation     ✅ Deployment docs exist and are accurate
Local Testing     ✅ npm test, build, and start all work locally
Tag Testing       ✅ Can create and push test tags successfully
```

## Troubleshooting by Component

### GitHub Actions Not Triggering

**Check these in order:**
1. Tag format - must be `v[0-9]+.[0-9]+.[0-9]+`
2. Workflow file - `.github/workflows/ci-cd.yml` exists and is valid
3. Actions enabled - Go to Settings → Actions, check permissions
4. Git push succeeded - Verify with `git tag -l` and `git push -v` output

### Build Script Fails

**Check these in order:**
1. TypeScript errors - Run `npm test` and fix errors
2. Prisma generate - Run `prisma generate` directly
3. Dist directory - Verify `dist/` was created
4. Dependencies - Run `npm install` to ensure all deps present

### Railway Not Deploying

**Check these in order:**
1. GitHub connection - Verify Railway is connected to GitHub repository
2. Build command - Ensure Railway has `npm run build`
3. Start command - Ensure Railway has `npm start`
4. Env variables - All required variables set in Railway dashboard
5. Database - Verify PostgreSQL database exists and is accessible

### TypeScript Compilation Errors

**Common errors and fixes:**
- `Cannot find module` - Check import path and file exists
- `Type 'X' is not assignable to 'Y'` - Fix type mismatch
- `Property does not exist` - Verify object structure
- `Parameter implicitly has 'any' type` - Add type annotation

---

## Deployment Ready Confirmation

When you've completed this entire checklist with all items checked:

```
✅ You are ready to deploy to production!

Next steps:
1. Make your actual code changes
2. Run: npm test (verify locally)
3. Commit and push to main: git push origin main
4. Create version tag: git tag v0.2.0
5. Push tag to trigger deployment: git push origin v0.2.0
6. Monitor at: https://github.com/.../actions
7. Check bot is online in Discord
```

---

## Next Steps

- Review [[DEPLOYMENT-FLOW]] for step-by-step deployment walkthrough
- Read [[RAILWAY-SETUP]] for Railway-specific configuration details
- Check [[CI-CD-SETUP]] for GitHub Actions workflow details
- Refer to [[TROUBLESHOOTING]] for additional help

---

**Last Updated**: 2026-02-01

**Questions?** Check the related documentation or troubleshooting guides linked above.

