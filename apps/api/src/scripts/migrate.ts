/**
 * Apply SQL migrations in filename order.
 * Reads SUPABASE_DB (postgres connection string) from env — find it under
 * Supabase → Project Settings → Database → Connection string → URI.
 *
 * Usage: npm run db:migrate -w @samity/api
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

async function main() {
  const connectionString = process.env['SUPABASE_DB'];
  if (!connectionString) {
    console.error('❌ SUPABASE_DB is required (postgres://... connection string).');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });

  await pool.query(`
    create table if not exists _migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const { rows } = await pool.query<{ name: string }>('select name from _migrations');
  const applied = new Set(rows.map((r) => r.name));

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`↷ skipped ${file}`);
      continue;
    }
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`▶ applying ${file}`);
    try {
      await pool.query('begin');
      await pool.query(sql);
      await pool.query('insert into _migrations (name) values ($1)', [file]);
      await pool.query('commit');
    } catch (err) {
      await pool.query('rollback');
      throw err;
    }
  }

  await pool.end();
  console.log('✅ migrations up to date');
}

main().catch((err) => {
  console.error('❌ migration failed:', err);
  process.exit(1);
});
