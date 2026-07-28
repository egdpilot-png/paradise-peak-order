'use client';

// Browser Supabase client used by the login page for the magic-link (PKCE) flow.
// `createBrowserClient` from `@supabase/ssr` stores the PKCE code_verifier in
// the browser (localStorage) so only the user's browser can complete the
// exchange when the callback route receives `?code=...`. This prevents Gmail's
// link scanner from consuming the login token.

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  client = createBrowserClient(url, anon);
  return client;
}
