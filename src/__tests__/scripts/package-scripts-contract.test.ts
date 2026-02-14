export {};

const fs = require('fs');
const path = require('path');

function readScripts() {
  const packageJsonPath = path.join(__dirname, '../../../package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return packageJson.scripts;
}

describe('package script contract for dev/prod database toggle', () => {
  it('ensures db:generate regenerates schema before prisma generate', () => {
    const scripts = readScripts();
    expect(scripts['db:generate']).toBe('node prisma/generate-schema.js --schema-only && prisma generate');
  });

  it('ensures db:migrate:deploy regenerates schema before deploying migrations', () => {
    const scripts = readScripts();
    expect(scripts['db:migrate:deploy']).toBe(
      'node prisma/generate-schema.js --schema-only && prisma migrate deploy'
    );
  });

  it('ensures start uses db:migrate:deploy as startup migration contract', () => {
    const scripts = readScripts();
    expect(scripts.start).toBe('npm run db:migrate:deploy && node dist/deploy-commands.js && node dist/index.js');
  });
});
