// Dashboard auth: reads the Supabase Auth session from cookies (server-side)
// and cross-references the dashboard_users table for role.

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import 'server-only';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export type DashboardRole = 'property_manager' | 'kitchen_ops' | 'admin';

export interface DashboardUser {
  email: string;
  role: DashboardRole;
  display_name: string | null;
}

export async function getDashboardUser(): Promise<DashboardUser | null> {
  const store = await cookies();

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
