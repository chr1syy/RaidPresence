# Contributing to RaidPresence

Thank you for your interest in contributing to RaidPresence! This document provides guidelines and instructions for contributors.

## Development Setup

1. **Fork and clone the repository:**

   ```bash
   git clone https://github.com/yourusername/RaidPresence.git
   cd RaidPresence
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Set up environment variables:**

   Create a `.env` file in the root directory with the following variables (see `.env.example` if available):

   ```
   DISCORD_TOKEN=your_bot_token
   CLIENT_ID=your_client_id
   GUILD_ID=your_guild_id
   DATABASE_URL=your_database_url
   ```

4. **Set up the database:**

   ```bash
   npm run db:migrate
   ```

5. **Run the bot in development mode:**

   ```bash
   npm run dev
   ```

## Testing

Run tests with:

```bash
npm run test:jest
```

## Pull Request Process

1. Ensure your code follows the project's coding standards and passes all tests.
2. Add tests for new features or bug fixes.
3. Update documentation as needed.
4. Create a pull request with a clear title and description of the changes.
5. Wait for review and address any feedback.

## Code Style

- Use TypeScript for all new code.
- Follow existing code patterns and conventions.
- Run `npm run lint` before committing.

## Reporting Issues

Please report bugs or request features via GitHub Issues.

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.