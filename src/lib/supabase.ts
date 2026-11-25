import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { apiFetch } from './api.ts';
import type { UserProfile } from '../types.ts';

export interface PublicSupabaseConfig {
  url: string;
  anonKey: string;
}

let cachedClient: SupabaseClient | null = null;
let cachedKey = '';

export function resolvePublicSupabaseConfig(
  serverConfig?: PublicSupabaseConfig | null
): PublicSupabaseConfig | null {
  if (serverConfig?.url && serverConfig?.anonKey) {
    return serverConfig;
  }
  const envUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
  const envAnon = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (envUrl && envAnon) {
    return { url: envUrl, anonKey: envAnon };
  }
  return null;
}

export function getSupabaseBrowserClient(
  serverConfig?: PublicSupabaseConfig | null
): SupabaseClient | null {
  const cfg = resolvePublicSupabaseConfig(serverConfig);
  if (!cfg) return null;

  const cacheSignature = `${cfg.url}::${cfg.anonKey}`;
  if (cachedClient && cachedKey === cacheSignature) {
    return cachedClient;
  }

  cachedKey = cacheSignature;
  cachedClient = createClient(cfg.url, cfg.anonKey, {
    auth: {
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: false,
    },
  });
  return cachedClient;
}

export async function exchangeSupabaseAccessToken(accessToken: string): Promise<UserProfile> {
  const res = await apiFetch<{ user: UserProfile }>('/api/auth/supabase-session', {
    method: 'POST',
    body: JSON.stringify({ accessToken }),
  });
  return res.user;
}
