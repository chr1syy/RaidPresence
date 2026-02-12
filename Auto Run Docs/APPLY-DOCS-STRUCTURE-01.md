# Apply Documentation Structure

This auto-run document applies the recommended documentation structure to existing projects by creating new standard files and archiving old ones.

- [x] Create archive/ directory in the project root if it doesn't exist
- [x] Identify all existing documentation files (e.g., README*, CONTRIBUTING*, docs/*) in the project root and docs/ folder

  Identified files:
  - README.md
  - CONTRIBUTING.md
  - LICENSE
  - docs/guides/PLAYER-GUIDE.md
  - docs/commands/CONFIG-COMMAND.md
  - docs/commands/RAID-COMMAND.md
  - docs/architecture/raid-edit-limitations.md
  - docs/architecture/raid-edit-enhancements.md
  - docs/architecture/raid-edit-api-contract.md
  - docs/maintainers/handleEditRaid.md
  - docs/features/raid-edit.md
- [x] Move all identified old documentation files to the archive/ folder with timestamps (e.g., README_old_20231201.md)
- [x] Create new README.md in root with standard sections: project description, installation, usage, contributing link, license
- [x] Create CONTRIBUTING.md in root with contribution guidelines, setup instructions, and PR process
- [x] Create CODE_OF_CONDUCT.md in root using Contributor Covenant template
- [x] Ensure LICENSE file exists in root; if not, create with identified licence by old files as default (user can change later)
- [x] Create CHANGELOG.md in root with template for version history
- [ ] Create SECURITY.md in root with vulnerability reporting instructions
- [ ] Create docs/ directory if not exists, with subdirectories: commands/, api/, tutorials/
- [ ] Populate docs/commands/ with markdown files for each project command (e.g., install.md, build.md) describing syntax, options, and examples
- [ ] Create docs/api/README.md with API documentation template
- [ ] Create docs/tutorials/README.md with tutorial index
- [ ] Update or create AGENTS.md in root to define AI assistant modes and skills if applicable
- [ ] Run lint and typecheck commands on all new files to ensure correctness