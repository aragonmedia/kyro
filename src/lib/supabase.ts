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

/**
 * Normalize a pasted Supabase URL so common env-var mistakes don't crash the
 * app: strip surrounding quotes/whitespace, add https:// if the protocol was
 * omitted, and drop any trailing slash.
 */
function normalizeUrl(raw: string): string {
  let url = raw.trim().replace(/^["']|["']$/g, '');
  if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
  return url.replace(/\/+$/, '');
}

export function getSupabase(): SupabaseClient | null {
  const rawUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!rawUrl || !anonKey) {
    // Demo mode — no keys configured. Caller should fall back to mockApi.
    return null;
  }
  if (!_client) {
    try {
      _client = createClient(normalizeUrl(rawUrl), anonKey.trim(), {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
    } catch (e) {
      // Malformed URL / bad key — log and fall back to demo mode rather than crash.
      console.error('[kyro] Supabase client init failed — check VITE_SUPABASE_URL', e);
      return null;
    }
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

/**
 * Passwordless email OTP — step 1: send a 6-digit code to the email.
 * Real when Supabase is configured; `demo: true` signals the caller to
 * run the demo flow (no real email sent).
 *
 * NOTE for V1: in the Supabase dashboard, set the "Magic Link" email
 * template to send `{{ .Token }}` so users receive a 6-digit code
 * instead of a magic link.
 */
export async function sendEmailOtp(email: string): Promise<{ error: Error | null; demo: boolean }> {
  const supabase = getSupabase();
  if (!supabase) return { error: null, demo: true };
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  return { error, demo: false };
}

/** Passwordless email OTP — step 2: verify the 6-digit code. */
export async function verifyEmailOtp(
  email: string,
  token: string
): Promise<{ error: Error | null; demo: boolean }> {
  const supabase = getSupabase();
  if (!supabase) return { error: null, demo: true };
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  return { error, demo: false };
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
