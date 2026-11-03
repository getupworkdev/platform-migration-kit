/**
 * Usage:
 *   npx tsx migrate/run.ts --export fixtures/legacy-export.json --dry-run
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx migrate/run.ts --export export.json
 *
 * Safe to run more than once: the second run reports everything as already migrated.
 */
import { readFileSync } from 'node:fs';
import type { LegacyExport } from './export-format.js';
import { migrate } from './migrate.js';
import { MemoryTarget } from './target.js';
import { SupabaseTarget } from './supabase-target.js';

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const exportPath = flag('--export');
if (!exportPath) { console.error('Missing --export <file>'); process.exit(1); }
const dry = args.includes('--dry-run');

const exp = JSON.parse(readFileSync(exportPath, 'utf8')) as LegacyExport;
const target = dry
  ? new MemoryTarget()
  : new SupabaseTarget(need('SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'));

const report = await migrate(exp, target);
console.log(JSON.stringify({ dryRun: dry, exportedAt: exp.exportedAt, ...report }, null, 2));

function need(k: string) { const v = process.env[k]; if (!v) { console.error(`Missing env ${k}`); process.exit(1); } return v; }
