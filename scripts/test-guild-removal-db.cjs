#!/usr/bin/env node
// Starts a NEW local PostgreSQL cluster; never reads DATABASE_URL or .env.
// Supply existing PostgreSQL binaries: node scripts/test-guild-removal-db.cjs /path/to/bin
const { spawnSync } = require('node:child_process');
const { mkdirSync, mkdtempSync, realpathSync, writeFileSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { randomBytes } = require('node:crypto');
const net = require('node:net');

const root = resolve(__dirname, '..');
const bin = process.argv[2];
if (!bin) throw new Error('Pass the directory containing initdb, pg_ctl and createdb. No existing DB URL is accepted.');
const pgBin = realpathSync(bin);
const artifacts = join(root, '.maestro', 'raidpresence-data-deletion-20261022', 'db-runs');
mkdirSync(artifacts, { recursive: true });
const runDir = mkdtempSync(join(artifacts, 'isolated-'));
const dataDir = join(runDir, 'data');
const database = `raidpresence_deletion_test_${randomBytes(8).toString('hex')}`;
const env = { ...process.env, NODE_ENV: 'test' };
delete env.DATABASE_URL;
delete env.DISCORD_TOKEN;
delete env.PGHOST;
delete env.PGPORT;
delete env.PGUSER;
delete env.PGPASSWORD;
delete env.PGSERVICE;
delete env.PGSERVICEFILE;
delete env.PGOPTIONS;
delete env.RAIDPRESENCE_DELETION_TEST_URL;

function command(executable, args, log, childEnv = env) {
  const result = spawnSync(executable, args, { cwd: root, env: childEnv, encoding: 'utf8' });
  writeFileSync(join(runDir, log), (result.stdout || '') + (result.stderr || ''));
  if (result.error || result.status !== 0) throw new Error(`${log} failed: ${result.error || result.status}; see ${runDir}`);
}

async function freePort() {
  const server = net.createServer();
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
  const port = server.address().port;
  await new Promise((ok) => server.close(ok));
  return port;
}

(async () => {
  const port = await freePort();
  let started = false;
  let status = 'failed';
  try {
    command(join(pgBin, 'initdb'), ['-D', dataDir, '--no-locale', '--encoding=UTF8', '--auth-local=trust', '--auth-host=trust'], 'initdb.log');
    // No Unix socket; all files stay within the repository; TCP is loopback only.
    command(join(pgBin, 'pg_ctl'), ['-D', dataDir, '-l', join(runDir, 'server.log'), '-o', `-h 127.0.0.1 -p ${port} -k ''`, '-w', 'start'], 'start.log');
    started = true;
    command(join(pgBin, 'createdb'), ['-h', '127.0.0.1', '-p', String(port), database], 'createdb.log');
    const url = `postgresql://${encodeURIComponent(require('node:os').userInfo().username)}@127.0.0.1:${port}/${database}?schema=public`;
    const testEnv = {
      ...env, DATABASE_URL: url, RAIDPRESENCE_DELETION_TEST_URL: url,
      RAIDPRESENCE_DELETION_TEST_DATA_DIR: dataDir,
    };
    command(join(root, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], 'migrations.log', testEnv);
    command(join(root, 'node_modules/.bin/jest'), [
      '--runInBand', '--runTestsByPath', 'src/__tests__/integration/guildRemoval.postgres.test.ts',
      '--json', `--outputFile=${join(runDir, 'jest.json')}`,
    ], 'jest.log', testEnv);
    status = 'passed';
  } finally {
    if (started) command(join(pgBin, 'pg_ctl'), ['-D', dataDir, '-m', 'fast', '-w', 'stop'], 'stop.log');
    writeFileSync(join(runDir, 'isolation.json'), JSON.stringify({ status, database, port, host: '127.0.0.1', dataDir, stopped: started, fixtures: 'synthetic only', envDatabaseUrlUsed: false }, null, 2));
    console.log(`${status}: ${runDir}`);
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
