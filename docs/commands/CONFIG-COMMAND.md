---
type: reference
title: /config Command Reference
created: 2026-02-04
tags:
  - commands
  - configuration
related:
  - "[[SETUP-GUIDE]]"
  - "[[RAID-COMMAND]]"
---

# /config Command Reference

Configure bot settings for your Discord server. Each server has independent configuration.

## Table of Contents

- [Overview](#overview)
- [Permissions](#permissions)
- [/config view](#config-view) - View current configuration
- [/config raid-roles](#config-raid-roles) - Set raid attendance roles
- [/config leader-roles](#config-leader-roles) - Set raid leader roles
- [/config language](#config-language) - Set bot language
- [/config timezone](#config-timezone) - Set timezone offset
- [Multi-Server Support](#multi-server-support)

---

## Overview

The `/config` command allows server administrators to customize RaidPresence for their server. All configuration is stored per-server in the database, so different servers can have completely different settings.

### What Gets Configured

- **Raid Roles**: Which Discord roles get auto-added to raid rosters
- **Leader Roles**: Which roles can create/manage raids
- **Language**: Bot message language (en/de)
- **Timezone**: Timezone offset for raid time display

---

## Permissions

**All `/config` commands require Administrator permission** in Discord.

Only server administrators can view or modify configuration settings.

---

## /config view

View current server configuration.

### Syntax

```
/config view
```

### Output

Displays:
- Raid attendance roles (for auto-roster)
- Raid leader roles (for permissions)
- Bot language setting
- Timezone setting

### Example Output

```
Server Configuration:
━━━━━━━━━━━━━━━━━━━━━━━━
📋 Raid Roles: Raider, Member, Trial
👑 Leader Roles: Officer, Raid Leader
🌐 Language: English (en)
⏰ Timezone: GMT+1 (CET)
```

### Usage Notes

- Shows configuration as it currently exists
- If any setting is not configured, shows "Not configured" or default value
- Use this before modifying settings to understand current state

---

## /config raid-roles

Set Discord roles that are automatically added to raid rosters.

### Syntax

```
/config raid-roles roles:Role1,Role2,Role3
```

### Parameters

| Parameter | Required | Type | Format | Description |
|-----------|----------|------|--------|-------------|
| `roles` | Yes | String | Role names or IDs, comma-separated | Discord roles that should be added to raid rosters. Can use role names, role IDs, or a mix. |

### Examples

Using role names:
```
/config raid-roles roles:Raider,Member,Trial
```

Using role IDs:
```
/config raid-roles roles:123456789,987654321
```

Mixed names and IDs:
```
/config raid-roles roles:Raider,123456789,Trial
```

### Behavior

- These roles serve as the **default** for new raids when the `roles` parameter is not specified in `/raid create`
- Individual raids can override these defaults by specifying custom roles in the `/raid create` command
- The `/raid refresh` command uses the raid's configured roles (custom or defaults) to update the roster

### Important Notes

⚠️ **Role Names are Case-Sensitive**

- `Raider` ≠ `raider`
- `Member` ≠ `member`
- Verify exact role names in your Discord server

### Best Practices

- **Standard Setup**: Configure this with your main raiding roles
- **Multiple Tiers**: Include trial roles, core roles, and backup roles
- **Regular Review**: Update if your server's role structure changes
- **Override for Special Raids**: Use custom roles in `/raid create` for special events

### Troubleshooting

**Roles Not Added to Raid**

1. Verify role names are case-sensitive and spelled correctly
2. Check role IDs if using IDs
3. Ensure members have the configured roles in Discord
4. Use `/raid refresh` to update the roster if roles changed after raid creation

---

## /config leader-roles

Set Discord roles that can create and manage raids.

### Syntax

```
/config leader-roles roles:Officer,Raid Leader
```

### Parameters

| Parameter | Required | Type | Format | Description |
|-----------|----------|------|--------|-------------|
| `roles` | Yes | String | Role names or IDs, comma-separated | Discord roles whose members can create and manage raids |

### Examples

Using role names:
```
/config leader-roles roles:Officer,Raid Leader
```

Using role IDs:
```
/config leader-roles roles:123456789
```

### Behavior

- Members with these roles can use all `/raid` management commands:
  - `/raid create`
  - `/raid delete`
  - `/raid close`
  - `/raid cancel`
  - `/raid remind`
  - `/raid refresh`
- Members with these roles can also use `/config view` (not modify) to see settings

### Default Behavior

If **not configured**, defaults to members with **ManageEvents** Discord permission.

### Important Notes

⚠️ **Role Names are Case-Sensitive**

Verify exact role names in your Discord server.

### Best Practices

- **Define Clear Leadership**: Configure specific raid leader roles
- **Multiple Roles**: Include all roles that should have raid management access
- **Regular Review**: Update if your server's leadership structure changes
- **Fallback**: If you don't configure this, anyone with ManageEvents can manage raids

### Troubleshooting

**User Can't Manage Raids**

1. Check if user has configured leader role in Discord
2. Verify role name is case-sensitive and spelled correctly
3. Check if user has ManageEvents permission (used as fallback)
4. Verify configuration with `/config view`

---

## /config language

Set the bot language for your server.

### Syntax

```
/config language lang:en
```

### Parameters

| Parameter | Required | Type | Options | Description |
|-----------|----------|------|---------|-------------|
| `lang` | Yes | String | en, de | Language code for bot messages |

### Available Languages

| Code | Language |
|------|----------|
| `en` | English |
| `de` | German (Deutsch) |

### Examples

English:
```
/config language lang:en
```

German:
```
/config language lang:de
```

### Effects

- All bot messages appear in selected language
- Raid embeds, buttons, and responses are translated
- Settings, confirmations, and errors in selected language

### Supported Messages

- Raid embed titles and descriptions
- Button labels
- Command responses
- Error messages
- Configuration messages

### Notes

- If language is not configured, defaults to English
- Changing language updates future messages but doesn't retranslate existing raid embeds
- Use `/raid refresh` to update raid embed text after changing language

---

## /config timezone

Set timezone offset for raid times.

### Syntax

```
/config timezone offset:1
```

### Parameters

| Parameter | Required | Type | Range | Description |
|-----------|----------|------|-------|-------------|
| `offset` | Yes | Number | -12 to +14 | Timezone offset in hours from GMT/UTC |

### Examples

GMT/UTC:
```
/config timezone offset:0
```

GMT+1 (Central European Time):
```
/config timezone offset:1
```

GMT-5 (Eastern Standard Time):
```
/config timezone offset:-5
```

GMT+8 (China/Singapore Time):
```
/config timezone offset:8
```

### Effects

- Raid times are created using this timezone offset
- Helps with scheduling raids in the correct local time
- Discord timestamps still display in each user's local timezone (Discord shows each person their own timezone automatically)

### How It Works

When you create a raid with `/raid create date:2026-01-15 time:20:00`:
1. Bot interprets `20:00` in your configured timezone
2. Converts to UTC internally
3. Users see Discord timestamps that display in their own local timezone

### Important Notes

⚠️ **Discord Timestamps**

Discord always shows timestamps in each user's local timezone. The bot's timezone setting only affects how the bot interprets the times you enter.

### Finding Your Timezone

| Location | Offset |
|----------|--------|
| UTC/GMT | 0 |
| London (GMT) | 0 |
| Amsterdam/Berlin (CET) | +1 |
| Moscow | +3 |
| Dubai | +4 |
| India Standard Time | +5:30 |
| Bangkok | +7 |
| Hong Kong/Singapore | +8 |
| Tokyo | +9 |
| Sydney | +10 to +11 |
| New York (EST) | -5 |
| Chicago (CST) | -6 |
| Denver (MST) | -7 |
| Los Angeles (PST) | -8 |
| Honolulu (HST) | -10 |

### Daylight Saving Time

⚠️ **Important**: This setting uses a fixed offset and does not account for daylight saving time changes. You may need to adjust it when DST begins/ends in your region.

### Best Practices

- **Set Correctly**: Verify your server's timezone before creating raids
- **DST Awareness**: Adjust offset when daylight saving time changes
- **Team Coordination**: Ensure all raid leaders know the configured timezone

---

## Multi-Server Support

### How It Works

RaidPresence stores configuration **per-server** in the database:

**Server A Settings:**
- Raid roles: `Raider,Member`
- Leader roles: `Officer`
- Language: `en` (English)
- Timezone: `1` (GMT+1)

**Server B Settings:**
- Raid roles: `Guild Member,Core Raider,Trial`
- Leader roles: `Raid Leader,Guild Master`
- Language: `de` (German)
- Timezone: `-5` (EST)

### Important

- No need to restart the bot or edit configuration files
- Each server is completely independent
- Configuration changes apply immediately
- Use `/config view` to check configuration anytime

---

## Configuration Workflow

### Initial Setup (First Time)

1. **Set Raid Roles**: `/config raid-roles roles:YourRaider,YourMember`
2. **Set Leader Roles**: `/config leader-roles roles:YourOfficer`
3. **Set Timezone**: `/config timezone offset:0` (adjust for your region)
4. **Set Language**: `/config language lang:en` (adjust for your server)
5. **Verify**: `/config view` to confirm all settings

### Ongoing Management

- **Create Raids**: Admins use `/raid create` with configured settings
- **Monitor**: Check `/config view` before creating raids
- **Update**: Modify configuration if server structure changes
- **Override**: Use custom roles in `/raid create` for special cases

---

## Troubleshooting

### Configuration Not Applied

**Problem**: Set raid roles but they're not being added to raids.

**Solutions**:
1. Verify role names are case-sensitive: `/config view`
2. Check members have the roles in Discord
3. Create new raid (existing raids aren't updated)
4. Use `/raid refresh` to update existing raids

### Wrong Timezone for Raids

**Problem**: Raid times are off by several hours.

**Solutions**:
1. Check configured timezone: `/config view`
2. Verify offset is correct for your region
3. Account for daylight saving time changes
4. Use `/config timezone offset:X` to correct

### Language Not Changing

**Problem**: Bot messages still in wrong language after `/config language`.

**Solutions**:
1. Verify language was set: `/config view`
2. New raids use new language immediately
3. Existing raids keep old language (use `/raid refresh` to update)
4. Clear browser cache if using web dashboard

### Permission Denied Errors

**Problem**: User can't access `/config` or `/raid` commands.

**Solutions**:
1. Verify user has Administrator permission for `/config`
2. Verify user has configured leader role or ManageEvents for `/raid`
3. Check role configuration: `/config view`
4. Ask server owner to verify permissions

---

## Related Documentation

- [[SETUP-GUIDE]] - Initial server setup and configuration
- [[RAID-COMMAND]] - Creating and managing raids
- [[PLAYER-GUIDE]] - How players interact with raids
