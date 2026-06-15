/**
 * Kyro — Supabase Client
 *
 * Initializes the Supabase client used by the entire app for auth, DB reads
 * (via RLS), and Storage access.
 *
 * For V1 wiring: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your
 * Vercel environment (and .env.local for local dev). The current demo is
 * mocked, so the client is initialized lazily and used only when keys exist.
 *
 * The service_role key MUST NEVER be referenced from this file — it only
 * lives in server-side Vercel functions.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    // Demo mode — no keys configured. Caller should fall back to mockApi.
    return null;
  }
  if (!_client) {
    _client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return _client;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
  );
}

/**
 * Convenience: sign up a new user with email/password.
 * Returns { user, error }.
 */
export async function signUp(email: string, password: string, role: 'creator' | 'brand') {
  const supabase = getSupabase();
  if (!supabase) return { user: null, error: new Error('Supabase not configured') };

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { role },
    },
  });
  return { user: data.user, error };
}

export async function signIn(email: string, password: string) {
  const supabase = getSupabase();
  if (!supabase) return { user: null, error: new Error('Supabase not configured') };

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { user: data.user, error };
}

export async function signOut() {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getCurrentUser() {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user;
}
