import { readFile } from 'node:fs/promises';
import { createNodePostgresClient } from '../packages/persistence/src/node-postgres.ts';

const migrationPath = 'migrations/0001_core.sql';
const sql = await readFile(migrationPath, 'utf8');
const requiredTokens = [
  'CREATE EXTENSION IF NOT EXISTS postgis',
  'CREATE TABLE workflow_checkpoints',
  'CREATE TABLE domain_events',
  'CREATE TABLE outbox',
  'FOR UPDATE SKIP LOCKED',
];
for (const token of requiredTokens) {
  if (!sql.includes(token)) throw new Error(`Migration is missing required token: ${token}`);
}

if (process.argv.includes('--check')) {
  process.stdout.write(`${JSON.stringify({ migration: migrationPath, status: 'valid' })}\n`);
} else {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required to run migrations');
  const client = await createNodePostgresClient({ connectionString: databaseUrl, applicationName: 'tradewind-migrate' });
  try {
    const connection = await client.connect();
    try {
      await connection.query(sql);
    } finally {
      connection.release();
    }
    process.stdout.write(`${JSON.stringify({ migration: migrationPath, status: 'applied' })}\n`);
  } finally {
    await client.close();
  }
}
