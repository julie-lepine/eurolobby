/**
 * Client Supabase — Phase 3
 * Installer : npm install @supabase/supabase-js
 * Puis décommenter l'import et le createClient ci-dessous.
 */

// import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
export const supabase = null;

/*
if (isSupabaseConfigured) {
  supabase = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  });
}
*/

export function getSupabaseConfig() {
  return {
    url: url || '',
    hasAnonKey: Boolean(anonKey),
    configured: isSupabaseConfigured,
  };
}
