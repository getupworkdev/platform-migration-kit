import type { LegacyExport } from './export-format.js';
import type { MigrationTarget } from './target.js';

export type Report = {
  users: { created: number; alreadyMapped: number; matchedByEmail: number; skippedInvalid: string[] };
  content: { imported: number; alreadyImported: number; unresolvedAuthors: number };
  redirects: number;
};

const normEmail = (e: string) => e.trim().toLowerCase();
const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/**
 * Users: accounts are kept, passwords are not. Every migrated user signs in
 * with a one-time email link and may set a password afterwards.
 *
 * Idempotent: a legacy id that is already mapped is skipped; an email that
 * already exists in the target is linked rather than duplicated. Running the
 * script twice, or after a crash halfway, produces the same end state.
 */
export async function migrateUsers(exp: LegacyExport, target: MigrationTarget, report: Report) {
  const map = await target.getUserMap();
  const seen = new Set<string>();
  for (const u of exp.users) {
    const email = normEmail(u.email ?? '');
    if (!isEmail(email) || seen.has(email)) { report.users.skippedInvalid.push(u._id); continue; }
    seen.add(email);
    if (map.has(u._id)) { report.users.alreadyMapped++; continue; }

    let created = await target.findUserByEmail(email);
    if (created) report.users.matchedByEmail++;
    else {
      created = await target.createUser({ email, displayName: u.name?.trim() || null, legacyId: u._id, legacyCreatedAt: u.createdAt });
      report.users.created++;
    }
    await target.rememberUserMap(u._id, created.id);
    map.set(u._id, created.id);
  }
  return map;
}

/**
 * Content: every record is stored twice on purpose.
 *   raw   = the legacy record exactly as exported (jsonb). Nothing is lost,
 *           even fields nobody has looked at yet; Phase 3 restructures from this.
 *   fields= the handful the current screens need (title, slug, body, author, date).
 */
export async function migrateContent(exp: LegacyExport, userMap: Map<string, string>, target: MigrationTarget, report: Report) {
  const done = await target.getImportedContentIds();
  const slugs = new Set<string>();
  for (const c of exp.content) {
    if (done.has(c._id)) { report.content.alreadyImported++; continue; }
    const authorId = c.author ? userMap.get(c.author) ?? null : null;
    if (c.author && !authorId) report.content.unresolvedAuthors++;
    let slug = c.slug?.trim() || slugify(c.headline ?? c._id);
    while (slugs.has(slug)) slug = `${slug}-${c._id.slice(0, 6)}`;   // the old platform allowed duplicates; the new schema does not
    slugs.add(slug);
    await target.insertContent({
      legacyId: c._id,
      kind: c.type,
      slug,
      title: c.headline ?? '',
      body: c.bodyMarkdown ?? '',
      authorId,
      publishedAt: c.published ?? null,
      raw: c,
    });
    report.content.imported++;
  }
}

/** Old URL → new URL, so links already shared and indexed keep working after cutover. */
export async function migrateRedirects(exp: LegacyExport, target: MigrationTarget, report: Report) {
  const byId = new Map(exp.content.map((c) => [c._id, c]));
  for (const r of exp.routes ?? []) {
    const c = byId.get(r.contentId);
    if (!c) continue;
    const slug = c.slug ?? slugify(c.headline ?? c._id);
    const to = c.type === 'page' ? `/${slug}` : `/${c.type === 'article' ? 'articles' : c.type}/${slug}`;
    if (r.path !== to) { await target.upsertRedirect(r.path, to); report.redirects++; }
  }
}

export async function migrate(exp: LegacyExport, target: MigrationTarget): Promise<Report> {
  const report: Report = {
    users: { created: 0, alreadyMapped: 0, matchedByEmail: 0, skippedInvalid: [] },
    content: { imported: 0, alreadyImported: 0, unresolvedAuthors: 0 },
    redirects: 0,
  };
  const userMap = await migrateUsers(exp, target, report);
  await migrateContent(exp, userMap, target, report);
  await migrateRedirects(exp, target, report);
  return report;
}

export function slugify(s: string) {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'untitled';
}
