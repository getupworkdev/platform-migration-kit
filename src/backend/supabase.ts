/**
 * The "after" side: the same interface on Supabase.
 * Auth is passwordless (magic link), which is what migrated users get.
 * AI goes through an Edge Function so the provider key never ships to the browser.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AI, Article, Auth, Backend, Data, Storage } from './types.js';

export class SupabaseBackend implements Backend {
  readonly client: SupabaseClient;

  constructor(url: string, anonKey: string, client?: SupabaseClient) {
    this.client = client ?? createClient(url, anonKey);
  }

  auth: Auth = {
    currentUser: async () => {
      const { data } = await this.client.auth.getUser();
      const u = data.user;
      return u ? { id: u.id, email: u.email ?? '', displayName: (u.user_metadata?.display_name as string) ?? null } : null;
    },
    sendLoginLink: async (email) => {
      const { error } = await this.client.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
      if (error) throw error;
    },
    signOut: async () => { await this.client.auth.signOut(); },
  };

  data: Data = {
    listArticles: async ({ limit = 50 } = {}) => {
      const { data, error } = await this.client.from('articles').select('*').order('published_at', { ascending: false, nullsFirst: false }).limit(limit);
      if (error) throw error;
      return (data ?? []).map(fromRow);
    },
    getArticle: async (slug) => {
      const { data, error } = await this.client.from('articles').select('*').eq('slug', slug).maybeSingle();
      if (error) throw error;
      return data ? fromRow(data) : null;
    },
    saveArticle: async (a) => {
      const { data, error } = await this.client.from('articles')
        .upsert({ id: a.id, slug: a.slug, title: a.title, body: a.body, author_id: a.authorId, published_at: a.publishedAt })
        .select().single();
      if (error) throw error;
      return fromRow(data);
    },
  };

  ai: AI = {
    ask: async (prompt, context) => {
      const { data, error } = await this.client.functions.invoke('ask', { body: { prompt, context } });
      if (error) throw error;
      return data.answer as string;
    },
  };

  storage: Storage = {
    publicUrl: (path) => this.client.storage.from('public').getPublicUrl(path).data.publicUrl,
    upload: async (path, file, contentType) => {
      const { error } = await this.client.storage.from('public').upload(path, file, { contentType, upsert: true });
      if (error) throw error;
      return this.client.storage.from('public').getPublicUrl(path).data.publicUrl;
    },
  };
}

function fromRow(r: any): Article {
  return { id: r.id, slug: r.slug, title: r.title, body: r.body, authorId: r.author_id, publishedAt: r.published_at };
}
