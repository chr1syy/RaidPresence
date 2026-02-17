const fs = require('fs');
const path = require('path');

const dbEnv = process.env.DB_ENV || 'dev';
const provider = dbEnv === 'prod' ? 'postgresql' : 'sqlite';
const schemaPath = path.join(__dirname, 'prisma', 'schema.prisma');

console.log(`Switching database provider to ${provider} for ${dbEnv}`);

try {
  let schema = fs.readFileSync(schemaPath, 'utf-8');

  // More robust pattern that handles various formatting
  const datasourcePattern = /datasource\s+db\s*\{[^}]*provider\s*=\s*"[^"]*"[^}]*\}/s;
  
  if (!datasourcePattern.test(schema)) {
    throw new Error('Could not find datasource block in schema.prisma');
  }

  // Replace entire datasource block
  const newDatasource = dbEnv === 'prod' 
    ? `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}`
    : `datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}`;

  schema = schema.replace(datasourcePattern, newDatasource);

  // Validate replacement worked
  if (!schema.includes(`provider = "${provider}"`)) {
    throw new Error(`Failed to set database provider to ${provider}`);
  }

  fs.writeFileSync(schemaPath, schema);
  console.log(`✓ Switched to ${provider} successfully`);
} catch (error) {
  console.error(`✗ Failed to switch database provider: ${error.message}`);
  process.exit(1);
}
