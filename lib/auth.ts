// Dashboard auth: reads the Supabase Auth session from cookies (server-side)
// and cross-references the dashboard_users table for role.
//
// Fallback: also accepts a signed shared-PIN cookie (Wave 1 auth). If the
// cookie is valid we return a synthetic admin user so pages render.

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';
import 'server-only';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const PIN_COOKIE = 'pp_dash';

export type DashboardRole = 'property_manager' | 'kitchen_ops' | 'admin';

export interface DashboardUser {
  email: string;
  role: DashboardRole;
  display_name: string | null;
}

function verifyPinCookie(raw: string | undefined): boolean {
  if (!raw) return false;
  const secret = process.env.DASHBOARD_COOKIE_SECRET || '';
  if (!secret) return false;
  const idx = raw.lastIndexOf('.');
  if (idx < 0) return false;
  const token = raw.slice(0, idx);
  const sig = raw.slice(idx + 1);
  const expected = createHmac('sha256', secret).update(token).digest('hex');
  try {
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function getDashboardUser(): Promise<DashboardUser | null> {
  const store = await cookies();

  // 1. Shared-PIN fallback (Wave 1)
  const pinCookie = store.get(PIN_COOKIE)?.value;
  if (verifyPinCookie(pinCookie)) {
    return {
      email: 'egdpilot@gmail.com',
      role: 'admin',
      display_name: 'Eugene Duzant',
    };
  }

  // 2. Supabase Auth session (used once magic-link auth is wired up)
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: () => {},
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data } = await admin
    .from('dashboard_users')
    .select('email, role, display_name')
    .eq('email', user.email.toLowerCase())
    .maybeSingle();

  if (!data) return null;
  return data as DashboardUser;
}

export function canAct(user: DashboardUser | null, action: 'view' | 'kitchen_action'): boolean {
  if (!user) return false;
  if (action === 'view') return true;
  return user.role === 'kitchen_ops' || user.role === 'admin';
}
