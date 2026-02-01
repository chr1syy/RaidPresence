---
type: reference
title: GitHub Actions Failure Notifications Setup
created: 2026-02-01
tags:
  - ci-cd
  - notifications
  - github-actions
related:
  - "[[CI-CD-SETUP]]"
  - "[[DEPLOYMENT-FLOW]]"
---

# GitHub Actions Failure Notifications Setup

This guide explains how to configure Discord (or Slack) webhook notifications for CI/CD pipeline failures. This allows your team to be immediately notified when tests fail during the deployment process.

## Rationale

**Silent on Success, Loud on Failures**: The pipeline notification system is designed to:
- Reduce noise by NOT sending messages when builds succeed (the default expected state)
- Alert immediately when tests fail, enabling quick debugging and fixes
- Integrate directly with your team's communication platform (Discord or Slack)
- Provide actionable error messages with links to failed workflow runs

## Setting Up Discord Webhooks

### Step 1: Create a Discord Channel

1. Open your Discord server
2. Create a new channel named `#ci-cd-notifications` (or your preferred name)
3. Note the Channel ID for later use

### Step 2: Create a Webhook

1. In the Discord channel, click the channel settings icon (gear)
2. Go to **Integrations** → **Webhooks**
3. Click **New Webhook**
4. Name it something like `GitHub Actions CI/CD`
5. Click **Copy Webhook URL**
6. Save this URL safely - it's sensitive!

### Step 3: Add Webhook URL to GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name it `DISCORD_WEBHOOK_URL`
5. Paste the webhook URL you copied from Discord
6. Click **Add secret**

> **Security Note**: This URL should never be committed to your repository or shared publicly. GitHub Secrets keep it encrypted and secure.

## Setting Up Slack Webhooks

### Step 1: Create a Slack Channel

1. In your Slack workspace, create a new channel (e.g., `#ci-cd-notifications`)
2. Note the channel name

### Step 2: Create an Incoming Webhook

1. Go to [Slack Apps](https://api.slack.com/apps)
2. Create a new app or select an existing one
3. Click **Incoming Webhooks**
4. Toggle **Activate Incoming Webhooks** to ON
5. Click **Add New Webhook to Workspace**
6. Select your channel and click **Allow**
7. Copy the **Webhook URL**

### Step 3: Add Webhook URL to GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name it `SLACK_WEBHOOK_URL`
5. Paste the webhook URL from Slack
6. Click **Add secret**

## Adding Notification Steps to CI/CD Workflow

### Discord Notification Step

Add this step to your `.github/workflows/ci-cd.yml` file (after your test steps):

```yaml
# Optional: Send notification to Discord on test failure
- name: Notify Discord on failure
  if: failure()
  uses: slackapi/slack-github-action@v1.24.0
  with:
    webhook-url: ${{ secrets.DISCORD_WEBHOOK_URL }}
    payload: |
      {
        "text": "❌ CI/CD Pipeline Failed",
        "embeds": [
          {
            "title": "RaidPresence Build Failed",
            "description": "Tests failed on commit: ${{ github.sha }}",
            "color": 16711680,
            "fields": [
              {
                "title": "Repository",
                "value": "${{ github.repository }}",
                "short": true
              },
              {
                "title": "Branch",
                "value": "${{ github.ref_name }}",
                "short": true
              },
              {
                "title": "Commit Message",
                "value": "${{ github.event.head_commit.message }}",
                "short": false
              },
              {
                "title": "Author",
                "value": "${{ github.event.head_commit.author.name }}",
                "short": true
              }
            ],
            "actions": [
              {
                "type": "button",
                "text": "View Workflow Run",
                "url": "${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
              }
            ]
          }
        ]
      }
```

### Slack Notification Step

Slack uses a compatible webhook format. Use this step instead:

```yaml
# Optional: Send notification to Slack on test failure
- name: Notify Slack on failure
  if: failure()
  run: |
    curl -X POST -H 'Content-type: application/json' \
      --data "{
        \"text\": \"❌ CI/CD Pipeline Failed\",
        \"blocks\": [
          {
            \"type\": \"header\",
            \"text\": {
              \"type\": \"plain_text\",
              \"text\": \"RaidPresence Build Failed\"
            }
          },
          {
            \"type\": \"section\",
            \"fields\": [
              {
                \"type\": \"mrkdwn\",
                \"text\": \"*Repository:*\n${{ github.repository }}\"
              },
              {
                \"type\": \"mrkdwn\",
                \"text\": \"*Branch:*\n${{ github.ref_name }}\"
              },
              {
                \"type\": \"mrkdwn\",
                \"text\": \"*Author:*\n${{ github.event.head_commit.author.name }}\"
              },
              {
                \"type\": \"mrkdwn\",
                \"text\": \"*Commit:*\n${{ github.event.head_commit.message }}\"
              }
            ]
          },
          {
            \"type\": \"actions\",
            \"elements\": [
              {
                \"type\": \"button\",
                \"text\": {
                  \"type\": \"plain_text\",
                  \"text\": \"View Workflow Run\"
                },
                \"url\": \"${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}\"
              }
            ]
          }
        ]
      }" \
      ${{ secrets.SLACK_WEBHOOK_URL }}
```

## Message Format Explained

The notification messages include:

| Field | Purpose |
|-------|---------|
| **Title** | Quick identifier that the build failed |
| **Repository** | Which project the failure occurred in |
| **Branch** | Which branch/tag was deployed |
| **Commit Message** | What code change triggered the failure |
| **Author** | Who made the failing commit |
| **View Workflow Run** | Direct link to debug the specific failure |

## Example Notification

Here's what your team will see:

**Discord:**
```
❌ CI/CD Pipeline Failed

RaidPresence Build Failed
Tests failed on commit: abc123def456

Repository: yourusername/RaidPresence
Branch: v0.2.0
Commit Message: Fix: Correct database connection timeout
Author: John Doe

[View Workflow Run Button]
```

**Slack:**
Similar format with Slack's block-based styling.

## Testing Your Webhook

To verify your webhook is working before a real failure:

### Discord Test
```bash
curl -X POST -H 'Content-type: application/json' \
  --data '{"content":"✅ Test message from GitHub Actions"}' \
  YOUR_DISCORD_WEBHOOK_URL
```

### Slack Test
```bash
curl -X POST -H 'Content-type: application/json' \
  --data '{"text":"✅ Test message from GitHub Actions"}' \
  YOUR_SLACK_WEBHOOK_URL
```

## Troubleshooting

### Webhook Not Firing

**Issue**: Notifications aren't being sent

**Solution**:
1. Verify the webhook URL is correctly stored in GitHub Secrets
2. Check that the `if: failure()` condition is in place
3. Intentionally break a test to verify the notification fires
4. Check GitHub Actions logs for any errors

### Invalid Webhook URL

**Issue**: "Invalid or missing webhook URL" error

**Solution**:
1. Re-copy the webhook URL from Discord/Slack
2. Verify there are no extra spaces or characters
3. Check that the secret name matches exactly: `DISCORD_WEBHOOK_URL` or `SLACK_WEBHOOK_URL`

### Permissions Error

**Issue**: "Unauthorized" or "Forbidden" error

**Solution**:
1. Verify the webhook URL is still valid (it may have expired)
2. For Discord: Check the webhook hasn't been deleted from channel settings
3. For Slack: Check the app still has permission to post in the channel

## Next Steps

Once notifications are set up:
1. Make a test commit to verify the notification works
2. Share the webhook setup docs with your team
3. Consider adding success notifications for important deployments
4. Monitor the notification channel for patterns in failures

## Security Best Practices

1. **Never commit webhook URLs** to your repository
2. **Rotate webhooks periodically** (especially if team members leave)
3. **Use GitHub Secrets** for storing sensitive URLs
4. **Limit webhook permissions** to the minimum needed
5. **Review webhook access** in Discord/Slack regularly
6. **Document who has access** to the notification channel

## References

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Discord Webhooks Guide](https://discord.com/developers/docs/resources/webhook)
- [Slack Incoming Webhooks](https://api.slack.com/messaging/webhooks)
- [slackapi/slack-github-action](https://github.com/slackapi/slack-github-action)
