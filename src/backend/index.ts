/**
 * The one line the screens care about. During the migration both backends
 * exist side by side; the env flag picks one, so the new version can be
 * tested on a private staging link while the old site keeps running.
 */
import type { Backend } from './types.js';
import { LegacyPlatform } from './legacy.js';
import { SupabaseBackend } from './supabase.js';

export function createBackend(env: Record<string, string | undefined>): Backend {
  if (env.VITE_BACKEND === 'supabase') {
    if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required');
    return new SupabaseBackend(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  }
  return new LegacyPlatform();
}

export type { Backend, Article, User } from './types.js';
