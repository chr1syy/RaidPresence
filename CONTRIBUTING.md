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

Currently, testing is done manually in Discord. When testing:

1. **Test in a Test Server**: Use a dedicated Discord server for testing
2. **Test All Paths**: Test success cases, error cases, and edge cases
3. **Test Permissions**: Verify permission checks work correctly
4. **Test Database**: Ensure data is stored and retrieved correctly
5. **Test Multi-Server**: If applicable, test with multiple servers

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
