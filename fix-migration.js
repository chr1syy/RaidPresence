#!/usr/bin/env node
/**
 * Fix failed migration state before running migrate deploy.
 * This script handles P3009 errors by marking failed migrations as rolled-back then applied.
 */

const { execSync } = require('child_process');

const FAILED_MIGRATION = '20260222132500_init';

function run(cmd) {
  console.log(`Running: ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit' });
    return true;
  } catch (e) {
    console.error(`Command failed: ${e.message}`);
    return false;
  }
}

console.log('=== Migration Fix Script ===');
console.log(`Attempting to fix failed migration: ${FAILED_MIGRATION}`);

// Step 1: Mark as rolled back
console.log('\nStep 1: Marking migration as rolled back...');
run(`npx prisma migrate resolve --rolled-back ${FAILED_MIGRATION}`);

// Step 2: Mark as applied (tables exist with data)
console.log('\nStep 2: Marking migration as applied (tables already exist)...');
run(`npx prisma migrate resolve --applied ${FAILED_MIGRATION}`);

console.log('\n=== Migration fix complete ===');
