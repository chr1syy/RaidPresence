---
type: reference
title: GitHub CI/CD Status Badges
created: 2026-02-01
tags:
  - ci-cd
  - github
  - badges
related:
  - "[[CI-CD-SETUP]]"
  - "[[DEPLOYMENT-FLOW]]"
---

# GitHub CI/CD Status Badges

This page documents the CI/CD status badges for the RaidPresence project. These badges provide quick visual feedback on the deployment readiness and build status of the repository.

## Overview

GitHub Actions badges display the current status of your CI/CD pipeline in your README.md or other documentation. They:
- Show at a glance whether tests are passing or failing
- Link directly to the GitHub Actions workflow for debugging
- Update in real-time as new builds complete
- Provide confidence that code is production-ready

## Available Badges

### 1. Build & Test Status Badge

The primary badge shows whether the latest build and tests passed:

```markdown
[![CI/CD Pipeline](https://github.com/YOUR_USERNAME/RaidPresence/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/YOUR_USERNAME/RaidPresence/actions/workflows/ci-cd.yml)
```

**Visual states:**
- 🟢 **Green (passing)**: All tests passed, code is ready to deploy
- 🔴 **Red (failing)**: Tests failed, deployment is blocked
- 🟡 **Yellow (running)**: Tests are currently running

**What it links to:** GitHub Actions workflow run page showing detailed logs and failure information

### 2. Specific Branch Badge

To show the status of a specific branch (e.g., main or develop):

```markdown
[![CI/CD Pipeline (main)](https://github.com/YOUR_USERNAME/RaidPresence/actions/workflows/ci-cd.yml/badge.svg?branch=main)](https://github.com/YOUR_USERNAME/RaidPresence/actions/workflows/ci-cd.yml?query=branch%3Amain)
```

Replace `main` with your target branch name.

## Adding Badges to README

Insert the badge markup at the top of your README.md file, right after the title:

```markdown
# RaidPresence

[![CI/CD Pipeline](https://github.com/YOUR_USERNAME/RaidPresence/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/YOUR_USERNAME/RaidPresence/actions/workflows/ci-cd.yml)

A Discord bot for World of Warcraft raid attendance management...
```

## Step-by-Step Setup

### Step 1: Get Your Repository URL

Your badge URL format is:
```
https://github.com/YOUR_USERNAME/YOUR_REPOSITORY_NAME/actions/workflows/WORKFLOW_FILE.yml/badge.svg
```

### Step 2: Update the Badge URL

Replace the placeholders:
- `YOUR_USERNAME`: Your GitHub username (e.g., `chr1syy`)
- `YOUR_REPOSITORY_NAME`: Your repository name (e.g., `RaidPresence`)
- `WORKFLOW_FILE`: The workflow filename (e.g., `ci-cd.yml`)

**Example:**
```
https://github.com/chr1syy/RaidPresence/actions/workflows/ci-cd.yml/badge.svg
```

### Step 3: Create the Badge Markdown

The full markdown badge syntax:
```markdown
[![CI/CD Pipeline](BADGE_URL)](WORKFLOW_URL)
```

- `BADGE_URL`: The URL from Step 2
- `WORKFLOW_URL`: Link to your GitHub Actions workflow runs

**Example:**
```markdown
[![CI/CD Pipeline](https://github.com/chr1syy/RaidPresence/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/chr1syy/RaidPresence/actions/workflows/ci-cd.yml)
```

### Step 4: Add to README

Edit `README.md` and add the badge markdown near the top of the file (under the title).

## Badge Customization

### Query Parameters

You can customize badge behavior with query parameters:

#### Filter by Branch
```
https://github.com/YOUR_USERNAME/RaidPresence/actions/workflows/ci-cd.yml/badge.svg?branch=main
```

#### Filter by Event Type
```
https://github.com/YOUR_USERNAME/RaidPresence/actions/workflows/ci-cd.yml/badge.svg?event=push
```

#### Show Latest Result Only
```
https://github.com/YOUR_USERNAME/RaidPresence/actions/workflows/ci-cd.yml/badge.svg?event=push&branch=main
```

## Badge Display Examples

### Passing Build
![CI/CD Pipeline](https://img.shields.io/badge/CI%2FCD-Passing-brightgreen)

Markdown:
```markdown
[![CI/CD Pipeline](https://img.shields.io/badge/CI%2FCD-Passing-brightgreen)](https://github.com/YOUR_USERNAME/RaidPresence/actions/workflows/ci-cd.yml)
```

### Failing Build
![CI/CD Pipeline](https://img.shields.io/badge/CI%2FCD-Failing-red)

Markdown:
```markdown
[![CI/CD Pipeline](https://img.shields.io/badge/CI%2FCD-Failing-red)](https://github.com/YOUR_USERNAME/RaidPresence/actions/workflows/ci-cd.yml)
```

## Multiple Badges

You can display multiple badges for different aspects of your project:

```markdown
[![CI/CD Pipeline](https://github.com/YOUR_USERNAME/RaidPresence/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/YOUR_USERNAME/RaidPresence/actions/workflows/ci-cd.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/Node-18+-brightgreen)](https://nodejs.org)
```

## Troubleshooting

### Badge Shows "Unknown"

**Issue**: The badge displays "Unknown" status

**Causes:**
1. Workflow file path is incorrect
2. Workflow hasn't run yet
3. Repository is private (badges don't work on private repos)

**Solution:**
1. Verify the workflow file path matches exactly: `.github/workflows/ci-cd.yml`
2. Make a test commit with a tag (e.g., `git tag v0.1.0 && git push --tags`) to trigger the workflow
3. Wait 30 seconds and refresh the page

### Badge Not Updating

**Issue**: Badge shows old status even after new test run

**Solution:**
1. GitHub badges cache for 5-10 minutes
2. Force refresh your browser: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
3. Open the workflow in GitHub Actions directly to verify the actual status

### Badge Links to Wrong Workflow

**Issue**: Badge links to incorrect workflow or shows wrong status

**Solution:**
1. Double-check the workflow filename in your badge URL
2. Verify it matches the file in `.github/workflows/`
3. Ensure the workflow name matches exactly (case-sensitive on Linux/Mac)

## Best Practices

1. **Place near top**: Put badges near the project title for visibility
2. **Link to actions**: Make badges clickable to help troubleshoot failures
3. **Use consistent style**: Keep badge styling consistent with your project branding
4. **Document dependencies**: Show Node version, license, and other important info
5. **Keep updated**: Review badges periodically to ensure they still work

## Examples from Other Projects

### Example 1: Minimal
```markdown
# MyProject

[![Build Status](https://github.com/user/project/actions/workflows/ci.yml/badge.svg)](https://github.com/user/project/actions/workflows/ci.yml)
```

### Example 2: Comprehensive
```markdown
# MyProject

[![Build Status](https://github.com/user/project/actions/workflows/ci.yml/badge.svg)](https://github.com/user/project/actions/workflows/ci.yml)
[![Code Coverage](https://img.shields.io/codecov/c/github/user/project)](https://codecov.io/gh/user/project)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node: 18+](https://img.shields.io/badge/Node-18+-brightgreen)](https://nodejs.org)
```

## References

- [GitHub Actions: Adding a Workflow Status Badge](https://docs.github.com/en/actions/monitoring-and-troubleshooting-workflows/adding-a-workflow-status-badge)
- [Shields.io Badge Service](https://shields.io)
- [GitHub Status Checks API](https://docs.github.com/en/rest/commits/statuses)
