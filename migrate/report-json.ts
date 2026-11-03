/** Writes the dry-run result plus per-record detail to docs/report.json for the visual report page. */
import { readFileSync, writeFileSync } from 'node:fs';
import type { LegacyExport } from './export-format.js';
import { migrate } from './migrate.js';
import { MemoryTarget } from './target.js';

const exp = JSON.parse(readFileSync('fixtures/legacy-export.json', 'utf8')) as LegacyExport;
const t = new MemoryTarget();
const report = await migrate(exp, t);
const second = await migrate(exp, t);
const byLegacy = new Map(t.userMap);
const users = exp.users.map((u) => {
  const id = byLegacy.get(u._id);
  const dup = exp.users.find((o) => o !== u && o.email.toLowerCase() === u.email.toLowerCase() && exp.users.indexOf(o) < exp.users.indexOf(u));
  const status = id ? 'created' : dup ? `skipped: duplicate of ${dup._id}` : 'skipped: invalid email';
  return { legacyId: u._id, email: u.email, name: u.name ?? null, hadPasswordHash: !!u.passwordHash, status };
});
const content = t.content.map((c) => ({ legacyId: c.legacyId, kind: c.kind, slug: c.slug, title: c.title, authorResolved: !!c.authorId, published: !!c.publishedAt, rawFields: Object.keys(c.raw as object).length, extractedFields: 5 }));
writeFileSync('docs/report.json', JSON.stringify({ exportedAt: exp.exportedAt, firstRun: report, secondRun: second, users, content, redirects: [...t.redirects].map(([from, to]) => ({ from, to })) }, null, 2));
console.log('wrote docs/report.json');
