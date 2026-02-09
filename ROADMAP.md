# Roadmap

Future development plans for RaidPresence.

## Phase 2: Enhanced Raid Management

**Status:** Planning

- [ ] **Manual Roster Management**
  - `/raid add` - Manually add specific members to a raid
  - `/raid remove` - Remove specific members from roster
  - Override automatic role-based roster

- [ ] **Raid Status Workflow**
  - Planning: Initial creation phase
  - Open: Accepting attendance changes
  - Locked: Roster finalized, no changes allowed
  - Completed: Raid finished, archived

- [ ] **Automated Reminders**
  - Schedule automatic reminders (24h, 1h before raid)
  - Configurable reminder times per server
  - Smart mentions (only those who haven't responded)

- [ ] **Export Roster**
  - Export to text format
  - Copy-paste friendly output
  - Support for different game UIs (WoW addons, etc.)

## Phase 3: Scaling & Multi-Server

**Status:** Partially Complete

- [x] **Multi-Server Support**
  - Per-guild configuration in database
  - Independent settings per Discord server
  - No cross-contamination between servers

- [ ] **Discord Sharding**
  - Support for large-scale deployment (2500+ servers)
  - Automatic shard management
  - Cross-shard communication

- [ ] **PostgreSQL Migration**
  - Full production database support
  - Migration guide from SQLite
  - Performance optimizations

- [ ] **Web Dashboard**
  - View and manage raids from browser
  - Real-time updates via WebSocket
  - Mobile-responsive design
  - OAuth2 Discord login

- [ ] **Calendar Integration**
  - Discord event creation
  - Google Calendar sync
  - iCal export for external calendars

- [ ] **Guild Analytics**
  - Attendance heat maps
  - Player activity trends
  - Role distribution charts
  - Peak activity times

## Phase 4: Monetization & Premium Features

**Status:** Concept

- [ ] **Premium Features**
  - Web dashboard access
  - Advanced statistics and reports
  - Custom raid templates
  - Priority support

- [ ] **Multi-Game Support**
  - Support for other MMOs (FFXIV, ESO, etc.)
  - Generic raid/event system
  - Game-specific customization

- [ ] **Custom Raid Templates**
  - Save raid configurations as templates
  - Quick-create from templates
  - Share templates with other servers

- [ ] **Roster Optimization**
  - Automated role balance suggestions
  - Recommend roster changes for optimal composition
  - Class/spec distribution analysis

- [ ] **API Access**
  - Public API for integrations
  - Webhook notifications
  - Third-party bot integration

## Completed Features

### Phase 1 Quick Wins ✅

- [x] **Raid Clone** (`/raid clone`) - Clone existing raids with new date/time, preserving roles and rescanning members
- [x] **Attendance Stats** (`/raid stats`) - Per-raid and guild-wide attendance analytics with reliability scoring
- [x] **Custom Reminders** (`/raid remind message:`) - Custom leader messages and opted-out player visibility in reminders
- [x] **Status Dashboard** (`/raid status`) - At-a-glance view of up to 7 upcoming raids with roster status indicators
- [x] Database index optimization for stats and status queries

### Core Functionality ✅

- [x] Reverse sign-up system (auto-add eligible members)
- [x] Role-based attendance tracking
- [x] Class/spec selection and persistence
- [x] Interactive Discord UI (buttons, select menus)
- [x] Raid CRUD operations (create, list, edit, delete)
- [x] Per-server configuration
- [x] Permission system (raid leaders, admins)
- [x] Multi-language support (English, German)
- [x] Timezone configuration
- [x] Real-time embed updates
- [x] Late arrival tracking
- [x] Opt-out system
- [x] Role-based sorting (Tank/Healer/DPS)
- [x] Raid refresh command
- [x] Raid reminder system
- [x] Raid cancellation
- [x] Raid closing (lock roster)

## Contributing Ideas

Have an idea for a new feature? Check out [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on proposing and implementing features.

## Release Timeline

Timeline is tentative and subject to change based on priorities and community feedback.

- **Phase 2**: Q2 2026 (targeting April-June)
- **Phase 3**: Q3-Q4 2026 (targeting July-December)
- **Phase 4**: 2027 and beyond

## Priorities

Current development priorities (highest to lowest):

1. Bug fixes and stability improvements
2. User-requested features
3. Phase 2 features (enhanced management)
4. Phase 3 features (scaling)
5. Phase 4 features (premium/monetization)

---

*Last updated: 2026-02-09*
