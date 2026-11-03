/**
 * A screen's data logic, written once against the Backend interface.
 * (The React component around it is the existing UI and is not what changes
 * in a migration; this is the part that must behave identically on both sides.)
 */
import type { Backend } from '../backend/types.js';

export async function articleListViewModel(backend: Backend) {
  const [user, articles] = await Promise.all([backend.auth.currentUser(), backend.data.listArticles({ limit: 20 })]);
  return {
    greeting: user ? `Welcome back, ${user.displayName ?? user.email}` : 'Sign in with your email',
    items: articles.filter((a) => a.publishedAt).map((a) => ({ title: a.title, href: `/articles/${a.slug}`, mine: !!user && a.authorId === user.id })),
  };
}
