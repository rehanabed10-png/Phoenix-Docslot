import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Validates and retrieves the public Supabase configuration from Vite environment variables.
 */
export function getSupabaseConfig(): { url: string | null; anonKey: string | null } {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim() || null;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || null;

  return { url, anonKey };
}

/**
 * Checks if the public Supabase credentials are configured in the frontend environment.
 */
export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSupabaseConfig();
  return Boolean(
    url &&
      anonKey &&
      !url.includes('[YOUR-PROJECT-REF]') &&
      !anonKey.includes('...'),
  );
}

let clientInstance: SupabaseClient | null = null;

/**
 * Returns a singleton instance of the typed Supabase client, or null if unconfigured.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (clientInstance) {
    return clientInstance;
  }

  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    return null;
  }

  try {
    clientInstance = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    return clientInstance;
  } catch (error) {
    console.error('Failed to initialize Supabase client:', error);
    return null;
  }
}

/**
 * Allows injecting a mock or custom Supabase client for unit testing.
 */
export function setSupabaseClientForTesting(client: SupabaseClient | null): void {
  clientInstance = client;
}
