/**
 * The real destination. Needs the service-role key, so this runs from a
 * laptop or CI, never from the browser.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ImportedUser, MigrationTarget } from './target.js';

export class SupabaseTarget implements MigrationTarget {
  private admin: SupabaseClient;
  constructor(url: string, serviceRoleKey: string) {
    this.admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async getUserMap() {
    const { data, error } = await this.admin.from('legacy_user_map').select('legacy_id, user_id');
    if (error) throw error;
    return new Map((data ?? []).map((r) => [r.legacy_id as string, r.user_id as string]));
  }

  async findUserByEmail(email: string): Promise<ImportedUser | null> {
    // auth.users is not queryable via PostgREST; the listUsers admin call is paged, so a
    // helper RPC (see migrations) looks the email up directly.
    const { data, error } = await this.admin.rpc('admin_find_user_by_email', { p_email: email });
    if (error) throw error;
    return data?.[0] ? { id: data[0].id, email } : null;
  }

  async createUser(u: { email: string; displayName: string | null; legacyId: string; legacyCreatedAt: string }): Promise<ImportedUser> {
    const { data, error } = await this.admin.auth.admin.createUser({
      email: u.email,
      email_confirm: true,                 // no password; the login link works immediately
      user_metadata: { display_name: u.displayName, legacy_id: u.legacyId, legacy_created_at: u.legacyCreatedAt },
    });
    if (error) throw error;
    return { id: data.user.id, email: u.email };
  }

  async rememberUserMap(legacyId: string, userId: string) {
    const { error } = await this.admin.from('legacy_user_map').upsert({ legacy_id: legacyId, user_id: userId });
    if (error) throw error;
  }

  async getImportedContentIds() {
    const { data, error } = await this.admin.from('articles').select('legacy_id').not('legacy_id', 'is', null);
    if (error) throw error;
    return new Set((data ?? []).map((r) => r.legacy_id as string));
  }

  async insertContent(item: Parameters<MigrationTarget['insertContent']>[0]) {
    const { error } = await this.admin.from('articles').upsert({
      legacy_id: item.legacyId, kind: item.kind, slug: item.slug, title: item.title, body: item.body,
      author_id: item.authorId, published_at: item.publishedAt, legacy_raw: item.raw,
    }, { onConflict: 'legacy_id' });
    if (error) throw error;
  }

  async upsertRedirect(fromPath: string, toPath: string) {
    const { error } = await this.admin.from('redirects').upsert({ from_path: fromPath, to_path: toPath });
    if (error) throw error;
  }
}
