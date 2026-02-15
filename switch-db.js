const fs = require('fs');
const path = require('path');

const dbEnv = process.env.DB_ENV || 'dev';
const provider = dbEnv === 'prod' ? 'postgresql' : 'sqlite';

const schemaPath = path.join(__dirname, 'prisma', 'schema.prisma');
let schema = fs.readFileSync(schemaPath, 'utf8');

schema = schema.replace(/provider = "[^"]*"/, `provider = "${provider}"`);

fs.writeFileSync(schemaPath, schema);

console.log(`Switched database provider to ${provider} for ${dbEnv}`);