import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedAdminClient: SupabaseClient | null = null;
let cachedAuthClient: SupabaseClient | null = null;

export function getPublicSupabaseConfig(): { url: string; anonKey: string } | null {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function isSupabaseDbConfigured(): boolean {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return Boolean(url && serviceRoleKey);
}

export function getSupabaseStorageBucket(): string {
  return (process.env.SUPABASE_STORAGE_BUCKET || 'aulapro-files').trim() || 'aulapro-files';
}

export function getSupabaseAdminClient(): SupabaseClient {
  if (cachedAdminClient) return cachedAdminClient;
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar configurados.');
  }
  cachedAdminClient = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cachedAdminClient;
}

export function getSupabaseAuthVerifierClient(): SupabaseClient | null {
  if (isSupabaseDbConfigured()) {
    return getSupabaseAdminClient();
  }
  if (cachedAuthClient) return cachedAuthClient;
  const pub = getPublicSupabaseConfig();
  if (!pub) return null;
  cachedAuthClient = createClient(pub.url, pub.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cachedAuthClient;
}

export async function verifySupabaseAccessToken(accessToken: string): Promise<{
  id: string;
  email: string;
  name: string;
} | null> {
  const client = getSupabaseAuthVerifierClient();
  if (!client || !accessToken) return null;

  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user || !data.user.email) {
    return null;
  }

  const meta = (data.user.user_metadata || {}) as Record<string, unknown>;
  const fullName =
    (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
    (typeof meta.name === 'string' && meta.name.trim()) ||
    data.user.email.split('@')[0];

  return {
    id: data.user.id,
    email: data.user.email.trim().toLowerCase(),
    name: fullName.slice(0, 120),
  };
}
