import { describe, expect, test } from 'vitest';
import { LegacyPlatform } from '../src/backend/legacy.js';
import { SupabaseBackend } from '../src/backend/supabase.js';
import { articleListViewModel } from '../src/screens/article-list.js';

/**
 * The screen must render the same thing on the old platform and on Supabase.
 * The Supabase client is stubbed at the query level; the point is that the
 * screen code is untouched by the swap.
 */
const articles = [
  { id: 'a1', slug: 'one', title: 'One', body: '', authorId: 'u1', publishedAt: '2025-01-01T00:00:00Z' },
  { id: 'a2', slug: 'two', title: 'Two', body: '', authorId: 'u2', publishedAt: null },
];

function fakeSupabaseClient() {
  const rows = articles.map((a) => ({ id: a.id, slug: a.slug, title: a.title, body: a.body, author_id: a.authorId, published_at: a.publishedAt }));
  const q: any = { select: () => q, order: () => q, limit: async () => ({ data: rows, error: null }), eq: () => q, maybeSingle: async () => ({ data: rows[0], error: null }) };
  return { auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'a@example.com', user_metadata: { display_name: 'Aoife' } } } }) }, from: () => q } as any;
}

describe('one screen, two backends', () => {
  test('legacy platform', async () => {
    const legacy = new LegacyPlatform({ articles: articles.map((a) => ({ _id: a.id, _createdAt: '', slug: a.slug, headline: a.title, bodyMarkdown: a.body, author: a.authorId, published: a.publishedAt })) });
    legacy.signInAs({ id: 'u1', email: 'a@example.com', displayName: 'Aoife' });
    expect(await articleListViewModel(legacy)).toEqual({ greeting: 'Welcome back, Aoife', items: [{ title: 'One', href: '/articles/one', mine: true }] });
  });

  test('supabase', async () => {
    const sb = new SupabaseBackend('http://localhost', 'anon', fakeSupabaseClient());
    expect(await articleListViewModel(sb)).toEqual({ greeting: 'Welcome back, Aoife', items: [{ title: 'One', href: '/articles/one', mine: true }] });
  });

  test('signed out', async () => {
    const legacy = new LegacyPlatform();
    expect((await articleListViewModel(legacy)).greeting).toBe('Sign in with your email');
  });
});
