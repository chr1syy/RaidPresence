# /config Command Reference

The `/config` command allows server administrators to configure RaidPresence settings for their Discord server. These settings control raid scanning, permissions, localization, and archiving behavior.

## Overview

All configuration commands require Administrator permission or server ownership. Changes take effect immediately and apply to the entire server.

## Subcommands

> **Note:** Raid-eligible roles are no longer configured server-wide. They are chosen per raid via the `required roles:` option of `/raid create`.

### `leader-roles` - Set Raid Leader Roles
**Permission:** Administrator
**Description:** Defines which roles have permission to manage raids (create, edit, delete, etc.).

**Usage:**
```
/config leader-roles
  roles: [Role mentions, e.g., @Raid Leader @Officer]
```

**Example:**
```
/config leader-roles
  roles: @Raid Leader @Officer @Admin
```

**Notes:**
- Administrators always have full permissions regardless of this setting
- Multiple roles can be specified
- Members with these roles can manage all raid operations

### `timezone` - Set Server Timezone
**Permission:** Administrator
**Description:** Sets the timezone offset for the server. This affects how raid times are displayed and processed.

**Usage:**
```
/config timezone
  offset: [Timezone offset, e.g., +1, -5, +8]
```

**Example:**
```
/config timezone
  offset: +1
```

**Notes:**
- Offset should be the number of hours from UTC
- Use positive values for timezones ahead of UTC, negative for behind
- Examples: GMT = 0, EST = -5, CET = +1, PST = -8

### `language` - Set Bot Language
**Permission:** Administrator
**Description:** Changes the bot's language for all user interactions.

**Usage:**
```
/config language
  language: [en / de]
```

**Example:**
```
/config language
  language: de
```

**Notes:**
- Supported languages: English (en), German (de)
- Changes apply to all bot messages immediately
- User preferences are stored per-server

### `archive-channel` - Set Archive Channel
**Permission:** Administrator
**Description:** Specifies the Discord channel where archived raids will be stored.

**Usage:**
```
/config archive-channel
  channel: [#channel mention]
```

**Example:**
```
/config archive-channel
  channel: #raid-archive
```

**Notes:**
- The bot must have permission to send messages in the specified channel
- Archived raids are moved to this channel when pinned
- Only one archive channel can be configured per server

### `auto-archive` - Toggle Auto-Archive
**Permission:** Administrator
**Description:** Enables or disables automatic archiving of completed raids.

**Usage:**
```
/config auto-archive
  enabled: [true / false]
```

**Example:**
```
/config auto-archive
  enabled: true
```

**Notes:**
- When enabled, raids are automatically archived 2 hours after their scheduled time
- Manual archiving with `/raid pin` is always available regardless of this setting
- Auto-archiving only occurs if the raid was closed

## Configuration Overview

After initial setup with `/setup`, use these commands to fine-tune the bot for your server's needs:

1. **Raid Roles** - Define who gets signed up for raids
2. **Leader Roles** - Define who can manage raids
3. **Timezone** - Ensure correct time display
4. **Language** - Set preferred language
5. **Archive Channel** - Set up archival location
6. **Auto-Archive** - Enable automatic cleanup

## Related Commands

- `/setup` - Initial server configuration wizard
- `/raid` - Raid management commands