// Shared Supabase SSR client factories.
//
//   • createSupabaseServerClient() — for use in server components / server
//     actions where cookies() may be read-only (e.g. rendering a page). The
//     setAll implementation swallows write errors since Next.js forbids
//     setting cookies outside a Server Action or Route Handler.
//   • createSupabaseRouteClient() — for use in Route Handlers, where cookies
//     can be both read and written (needed to persist refreshed sessions).
//
// Both use the anon key — RLS still applies. Never use these for privileged
// service-role queries; that stays on the dedicated service-role client.

import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

type CookieToSet = { name: string; value: string; options: CookieOptions };

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function createSupabaseServerClient() {
  const store = await cookies();

  return createServerClient(url, anon, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (cookiesToSet: CookieToSet[]) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            store.set(name, value, options);
          });
        } catch {
          // Called from a Server Component render — cookies are read-only
          // there. Session refresh will be handled by middleware instead.
        }
      },
    },
  });
}

export async function createSupabaseRouteClient() {
  const store = await cookies();

  return createServerClient(url, anon, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (cookiesToSet: CookieToSet[]) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          store.set(name, value, options);
        });
      },
    },
  });
}
