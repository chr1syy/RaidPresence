# Contributing to RaidPresence

Thank you for your interest in contributing to RaidPresence! This document provides guidelines for contributing to the project.

## Development Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/yourusername/RaidPresence.git
   cd RaidPresence
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Setup Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your Discord bot token and settings
   ```

4. **Setup Database**
   ```bash
   npm run db:generate
   npm run db:migrate
   ```

5. **Deploy Commands**
   ```bash
   npm run deploy
   ```

6. **Run Development Server**
   ```bash
   npm run dev
   ```

## Development Workflow

### Making Changes

1. Create a new branch for your feature:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes following the code style guidelines below

3. Test your changes thoroughly:
   - Run TypeScript checks: `npm run typecheck`
   - Test in a Discord server
   - Verify database migrations work

4. Commit your changes:
   ```bash
   git add .
   git commit -m "feat: describe your changes"
   ```

5. Push and create a pull request:
   ```bash
   git push origin feature/your-feature-name
   ```

## Code Style

- **TypeScript**: Use strict typing, avoid `any` where possible
- **Formatting**: Follow existing code formatting patterns
- **Comments**: Add comments for complex logic, avoid obvious comments
- **Naming**:
  - Use camelCase for variables and functions
  - Use PascalCase for classes and interfaces
  - Use UPPER_CASE for constants

## Project Structure

```
RaidPresence/
├── prisma/
│   └── schema.prisma        # Database schema
├── src/
│   ├── commands/            # Slash command implementations
│   │   ├── raid.ts          # /raid command
│   │   └── config.ts        # /config command
│   ├── database/
│   │   └── client.ts        # Prisma client
│   ├── events/              # Event handlers
│   │   ├── buttonHandler.ts
│   │   └── selectHandler.ts
│   ├── types/               # TypeScript types
│   ├── utils/               # Utility functions
│   ├── deploy-commands.ts   # Command deployment
│   └── index.ts             # Bot entry point
```

## Adding New Features

### Adding a New Command

1. Create command file in `src/commands/yourcommand.ts`
2. Implement the command using discord.js SlashCommandBuilder
3. Add command handler in `src/index.ts`
4. Run `npm run deploy` to register with Discord
5. Test the command thoroughly

### Adding Database Models

1. Update `prisma/schema.prisma`
2. Create migration: `npm run db:migrate`
3. Update TypeScript types in `src/types/`
4. Update relevant command handlers

### Adding New Event Handlers

1. Create handler in `src/events/`
2. Register handler in `src/index.ts`
3. Test the interaction flow

## Testing

### Automated Test Suite

RaidPresence uses **Jest** for automated testing with comprehensive coverage of core functionality.

#### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (re-run on file changes)
npm test -- --watch

# Run tests with coverage report
npm test -- --coverage

# Run specific test file
npm test -- raid-edit.test.ts
```

#### Test Structure

Tests are located in `src/commands/__tests__/` and use the naming convention `*.test.ts`.

**Example test file structure:**
```
src/commands/__tests__/
├── raid-edit.test.ts       # Tests for raid edit functionality
└── __snapshots__/          # Snapshot files (auto-generated)
```

#### Test Coverage

The test suite includes:

**Permission Checks**
- Verify users without `canManageRaids` permission are rejected
- Test when member is null
- Validate permission checking logic

**Guild and Channel Validation**
- Ensure guild exists before processing
- Verify channel is valid and accessible
- Handle missing guild/channel gracefully

**Raid Validation**
- Verify raid exists before editing
- Check raid belongs to correct guild
- Reject closed raids
- Reject cancelled raids

**Date/Time Validation**
- Accept valid YYYY-MM-DD date format
- Reject invalid date formats
- Validate month range (1-12)
- Validate day range based on month and leap years
- Reject non-existent dates (e.g., Feb 30)
- Accept leap year dates correctly
- Reject past dates (raids must be in future)
- Accept valid HH:MM time format (24-hour)
- Handle edge cases (00:00, 23:59)
- Validate hour (0-23) and minute (0-59) ranges
- Handle timezone-adjusted date calculations

**Changes Validation**
- Reject when no changes are provided
- Track changes for date updates
- Track changes for title updates
- Handle multiple simultaneous changes

**Member Scanning**
- Add new members when raid roles are expanded
- Remove members when raid roles are restricted
- Handle mixed scenarios (add some, remove some)
- Handle empty roster after removal
- Create attendance records with correct defaults

**Embed and Message Handling**
- Update embeds in-place without re-sending
- Handle missing messageId gracefully
- Handle missing channelId gracefully
- Handle channel fetch failures

#### Test Configuration

Jest configuration in `jest.config.js`:
- **Preset**: `ts-jest` (TypeScript support)
- **Environment**: Node.js
- **Test Match**: `**/__tests__/**/*.test.ts`
- **Coverage Threshold**: 50% minimum for branches, functions, lines, and statements
- **Setup File**: `src/__tests__/setup.ts` (suppresses console output during tests)

#### Writing New Tests

When adding new features, create tests in the appropriate `__tests__` directory:

1. Create test file with `.test.ts` extension
2. Use `describe()` blocks to organize test groups
3. Use `it()` or `test()` for individual test cases
4. Mock external dependencies (database, Discord API, etc.)
5. Test success paths, error paths, and edge cases

**Example test structure:**
```typescript
import { yourFunction } from '../yourfile';

// Mock external dependencies
jest.mock('../../database/client');

describe('yourFunction()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when conditions are valid', () => {
    it('should return expected result', async () => {
      // Arrange
      const input = { /* test data */ };
      
      // Act
      const result = await yourFunction(input);
      
      // Assert
      expect(result).toBeDefined();
    });
  });

  describe('when conditions are invalid', () => {
    it('should throw error', async () => {
      // Arrange
      const input = { /* invalid data */ };
      
      // Act & Assert
      await expect(yourFunction(input)).rejects.toThrow();
    });
  });
});
```

### Manual Testing

For features not covered by automated tests, perform manual testing:

1. **Test in a Test Server**: Use a dedicated Discord server for testing
2. **Test All Paths**: Test success cases, error cases, and edge cases
3. **Test Permissions**: Verify permission checks work correctly
4. **Test Database**: Ensure data is stored and retrieved correctly
5. **Test Multi-Server**: If applicable, test with multiple servers
6. **Test Localization**: Verify messages appear in correct language
7. **Test Edge Cases**: Test with unusual but valid inputs

## Database Management

### Viewing the Database

```bash
npm run db:studio
```

### Creating Migrations

```bash
npm run db:migrate
```

### Resetting Development Database

```bash
rm dev.db
npm run db:migrate
```

## Pull Request Guidelines

- **Title**: Use descriptive titles (e.g., "Add raid cloning feature")
- **Description**: Explain what changes you made and why
- **Scope**: Keep PRs focused on a single feature or fix
- **Testing**: Describe how you tested your changes
- **Breaking Changes**: Clearly document any breaking changes

## Commit Message Format

Use conventional commit format:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `refactor:` - Code refactoring
- `test:` - Adding tests
- `chore:` - Maintenance tasks

Examples:
```
feat: add raid cloning command
fix: resolve permission check bug
docs: update installation guide
```

## Need Help?

- **Questions**: Open a GitHub issue with the "question" label
- **Bugs**: Open a GitHub issue with detailed reproduction steps
- **Features**: Open a GitHub issue to discuss before implementing

## Code of Conduct

- Be respectful and constructive
- Help others learn and grow
- Focus on what's best for the project
- Accept constructive criticism gracefully

Thank you for contributing to RaidPresence!
