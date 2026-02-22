#!/usr/bin/env node
/**
 * Cross-platform utility to remove migration_lock.toml
 * Replaces non-portable 'rm -f' command for Windows compatibility
 */
const fs = require('fs');
const path = require('path');

const lockFile = path.join(__dirname, '..', 'prisma', 'migration_lock.toml');

try {
  if (fs.existsSync(lockFile)) {
    fs.unlinkSync(lockFile);
    console.log('✓ Removed stale migration_lock.toml');
  } else {
    console.log('ℹ migration_lock.toml not found (first deployment)');
  }
} catch (error) {
  console.error('❌ Failed to remove migration_lock.toml:', error.message);
  process.exit(1);
}
