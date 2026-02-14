#!/usr/bin/env node

// Production Migration Helper
// Ensures you have the right DATABASE_URL before generating migrations

require('dotenv').config();
const { execSync } = require('child_process');

console.log("🚀 Production Migration Generator");
console.log("=================================");
console.log("");

// Check if DATABASE_URL is set and looks like PostgreSQL
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    console.error("❌ ERROR: DATABASE_URL environment variable is not set!");
    console.log("");
    console.log("Set it to your production PostgreSQL URL:");
    console.log("export DATABASE_URL='postgresql://username:password@host:5432/dbname'");
    console.log("");
    process.exit(1);
}

if (databaseUrl.startsWith('file:')) {
    console.error("❌ ERROR: DATABASE_URL points to SQLite file, but we need PostgreSQL!");
    console.log("");
    console.log("For production migrations, set DATABASE_URL to your PostgreSQL connection:");
    console.log("export DATABASE_URL='postgresql://username:password@host:5432/dbname'");
    console.log("");
    process.exit(1);
}

if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) {
    console.error("❌ ERROR: DATABASE_URL doesn't look like a PostgreSQL URL!");
    console.log("");
    console.log("Expected format: postgresql://username:password@host:5432/dbname");
    console.log(`Current value: ${databaseUrl}`);
    console.log("");
    process.exit(1);
}

console.log(`✅ DATABASE_URL looks good: ${databaseUrl.split('@')[0]}@[HIDDEN]`);
console.log("");
console.log("Generating PostgreSQL migrations...");
console.log("");

// Run the actual migration generation
try {
    execSync('node prisma/generate-schema.js --create-migrations', { stdio: 'inherit' });
} catch (error) {
    console.error("❌ Failed to generate migrations:", error.message);
    process.exit(1);
}

console.log("");
console.log("✅ Success! PostgreSQL migrations created in prisma/migrations/");
console.log("");
console.log("Next steps:");
console.log("1. Review the generated migration files");
console.log("2. Commit them: git add prisma/migrations/");
console.log("3. Push to main: git push origin main");
console.log("4. Deploy to production (migrations run automatically)");
console.log("");