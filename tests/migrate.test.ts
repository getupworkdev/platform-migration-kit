import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { migrate } from '../migrate/migrate.js';
import { MemoryTarget } from '../migrate/target.js';
import type { LegacyExport } from '../migrate/export-format.js';

const load = () => JSON.parse(readFileSync('fixtures/legacy-export.json', 'utf8')) as LegacyExport;

describe('users: accounts kept, passwords not', () => {
  test('valid users are created once, duplicates by email are linked, invalid rows are reported', async () => {
    const t = new MemoryTarget();
    const r = await migrate(load(), t);
    expect(r.users).toEqual({ created: 3, alreadyMapped: 0, matchedByEmail: 0, skippedInvalid: ['u_003', 'u_004'] });
    expect(t.users.map((u) => u.email)).toEqual(['aoife.byrne@example.com', 'cian@example.com', 'niamh@example.com']);
    expect(t.users.find((u) => u.email === 'niamh@example.com')!.displayName).toBeNull();
  });

  test('no password hash is ever passed to the target', async () => {
    const t = new MemoryTarget();
    await migrate(load(), t);
    expect(JSON.stringify(t.users)).not.toContain('vendor$opaque');
  });

  test('an account that already exists in the target (user signed up before cutover) is linked, not duplicated', async () => {
    const t = new MemoryTarget();
    t.users.push({ id: 'existing-id', email: 'cian@example.com', displayName: 'Cian', legacyId: '' });
    const r = await migrate(load(), t);
    expect(r.users.matchedByEmail).toBe(1);
    expect(t.userMap.get('u_002')).toBe('existing-id');
    expect(t.users.filter((u) => u.email === 'cian@example.com')).toHaveLength(1);
  });
});

describe('content: nothing lost, ready for restructuring later', () => {
  test('every record is imported with its raw export preserved byte for byte', async () => {
    const t = new MemoryTarget();
    const exp = load();
    await migrate(exp, t);
    expect(t.content).toHaveLength(5);
    const circle = t.content.find((c) => c.legacyId === 'c_100')!;
    expect(circle.raw).toEqual(exp.content[0]);                     // tags, hero image, AI metadata, coordinates: all still there
    expect(circle).toMatchObject({ slug: 'stone-circle-of-the-valley', title: 'The Stone Circle of the Valley', publishedAt: '2025-04-01T09:00:00Z' });
    expect(circle.authorId).toBe(t.userMap.get('u_001'));
  });

  test('missing slugs are generated, duplicate slugs are made unique, unknown authors are reported not invented', async () => {
    const t = new MemoryTarget();
    const r = await migrate(load(), t);
    const slugs = t.content.map((c) => c.slug);
    expect(slugs).toContain('draft-harvest-festivals');
    expect(slugs.filter((s) => s.startsWith('the-well-at-dawn'))).toEqual(['the-well-at-dawn', 'the-well-at-dawn-c_103']);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(r.content.unresolvedAuthors).toBe(1);
    expect(t.content.find((c) => c.legacyId === 'c_103')!.authorId).toBeNull();
  });

  test('old URLs get a redirect to the new path; routes to missing content are ignored', async () => {
    const t = new MemoryTarget();
    const r = await migrate(load(), t);
    expect(r.redirects).toBe(2);
    expect(t.redirects.get('/post/stone-circle-of-the-valley')).toBe('/articles/stone-circle-of-the-valley');
    expect(t.redirects.get('/post/the-well-at-dawn')).toBe('/articles/the-well-at-dawn');
    expect(t.redirects.has('/about')).toBe(false);                   // same path before and after
  });
});

describe('idempotency: safe to re-run after a crash or a second export', () => {
  test('running twice produces the same state and reports everything as already done', async () => {
    const t = new MemoryTarget();
    await migrate(load(), t);
    const before = JSON.stringify({ u: t.users, m: [...t.userMap], c: t.content, r: [...t.redirects] });
    const r2 = await migrate(load(), t);
    expect(r2.users).toMatchObject({ created: 0, alreadyMapped: 3 });
    expect(r2.content).toMatchObject({ imported: 0, alreadyImported: 5 });
    expect(JSON.stringify({ u: t.users, m: [...t.userMap], c: t.content, r: [...t.redirects] })).toBe(before);
  });

  test('a later export with one new article only adds that article', async () => {
    const t = new MemoryTarget();
    await migrate(load(), t);
    const exp = load();
    exp.content.push({ _id: 'c_105', type: 'article', slug: 'new-one', headline: 'New', bodyMarkdown: '...', author: 'u_001', published: '2026-01-01T00:00:00Z' });
    const r = await migrate(exp, t);
    expect(r.content).toMatchObject({ imported: 1, alreadyImported: 5 });
    expect(t.content).toHaveLength(6);
  });
});
