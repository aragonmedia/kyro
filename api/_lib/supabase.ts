/**
 * KYRO — service-role Supabase client
 *
 * Bypasses row-level security, so it is the only way to write `orders`,
 * `order_attributions`, `earnings` and `platform_credentials`. It must never
 * be imported by anything under src/ — that code ships to the browser.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { required } from './env.js';

let cached: SupabaseClient | null = null;

export function serviceClient(): SupabaseClient {
  if (cached) return cached;
  const url = required('VITE_SUPABASE_URL');
  const key = required('SUPABASE_SERVICE_ROLE_KEY');
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
