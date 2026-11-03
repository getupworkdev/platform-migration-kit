/**
 * The "before" side: a stand-in for a proprietary app-builder SDK
 * (table API, bundled auth, bundled AI). In a real migration this file wraps
 * the vendor SDK calls that are scattered through the codebase, which is step
 * one of the assessment: find every call, put it behind the interface.
 *
 * It is in-memory here so the tests and the screens run without the vendor.
 */
import type { AI, Article, Auth, Backend, Data, Storage, User } from './types.js';

type LegacyRow = Record<string, unknown> & { _id: string; _createdAt: string };

export class LegacyPlatform implements Backend {
  private tables = new Map<string, LegacyRow[]>();
  private sessionUser: User | null = null;

  constructor(seed?: { users?: LegacyRow[]; articles?: LegacyRow[] }) {
    this.tables.set('users', seed?.users ?? []);
    this.tables.set('articles', seed?.articles ?? []);
  }

  /** Vendor-style table API, kept private: nothing outside this file calls it. */
  private table(name: string) {
    const rows = this.tables.get(name)!;
    return {
      list: (limit = 50) => rows.slice(0, limit),
      find: (pred: (r: LegacyRow) => boolean) => rows.find(pred) ?? null,
      upsert: (row: Partial<LegacyRow>) => {
        const i = rows.findIndex((r) => r._id === row._id);
        const full = { _createdAt: new Date().toISOString(), ...(i >= 0 ? rows[i] : {}), ...row, _id: row._id ?? crypto.randomUUID() } as LegacyRow;
        if (i >= 0) rows[i] = full; else rows.push(full);
        return full;
      },
    };
  }

  signInAs(user: User) { this.sessionUser = user; }

  auth: Auth = {
    currentUser: async () => this.sessionUser,
    sendLoginLink: async () => { /* vendor sent the email */ },
    signOut: async () => { this.sessionUser = null; },
  };

  data: Data = {
    listArticles: async ({ limit } = {}) => this.table('articles').list(limit).map(toArticle),
    getArticle: async (slug) => { const r = this.table('articles').find((r) => r.slug === slug); return r ? toArticle(r) : null; },
    saveArticle: async (a) => toArticle(this.table('articles').upsert({ _id: a.id, slug: a.slug, headline: a.title, bodyMarkdown: a.body, author: a.authorId, published: a.publishedAt })),
  };

  ai: AI = {
    ask: async (prompt) => `[legacy ai] ${prompt.slice(0, 40)}`,
  };

  storage: Storage = {
    publicUrl: (path) => `https://legacy-cdn.example/${path}`,
    upload: async (path) => `https://legacy-cdn.example/${path}`,
  };
}

/** The vendor's field names differ from ours; this is the only place that knows both. */
function toArticle(r: LegacyRow): Article {
  return {
    id: String(r._id),
    slug: String(r.slug),
    title: String(r.headline ?? ''),
    body: String(r.bodyMarkdown ?? ''),
    authorId: r.author ? String(r.author) : null,
    publishedAt: r.published ? String(r.published) : null,
  };
}
