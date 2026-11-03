/**
 * The boundary between the screens and whatever backend they run on.
 *
 * Screens import only this file. The legacy platform and Supabase each
 * implement it, so moving the app means swapping one import, not rewriting
 * the UI. Keep it small: only what the screens actually call.
 */

export type User = { id: string; email: string; displayName: string | null };

export type Article = {
  id: string;
  slug: string;
  title: string;
  body: string;
  authorId: string | null;
  publishedAt: string | null;
};

export interface Auth {
  currentUser(): Promise<User | null>;
  /** Passwordless sign-in: the migrated users never had to set a new password. */
  sendLoginLink(email: string): Promise<void>;
  signOut(): Promise<void>;
}

export interface Data {
  listArticles(opts?: { limit?: number }): Promise<Article[]>;
  getArticle(slug: string): Promise<Article | null>;
  saveArticle(a: Omit<Article, 'id'> & { id?: string }): Promise<Article>;
}

export interface AI {
  /** The legacy platform bundled an AI call; afterwards it goes through our own server function. */
  ask(prompt: string, context?: string): Promise<string>;
}

export interface Storage {
  publicUrl(path: string): string;
  upload(path: string, file: Blob | Uint8Array, contentType: string): Promise<string>;
}

export interface Backend {
  auth: Auth;
  data: Data;
  ai: AI;
  storage: Storage;
}
