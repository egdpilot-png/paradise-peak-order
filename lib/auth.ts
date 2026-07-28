// Dashboard auth: reads the Supabase Auth session from cookies (server-side)
// and cross-references the dashboard_users table for role.
//
// Only Supabase Auth (magic link) is supported — the shared-PIN fallback
// (Wave 1 auth) has been removed. A DB trigger (`enforce_dashboard_allowlist`
// on auth.users) rejects sign-ups for emails not present in dashboard_users,
// but we still re-check membership here since a user could be authenticated
// with Supabase yet not (or no longer) present in dashboard_users.

import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from './supabase-server';
import 'server-only';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export type DashboardRole = 'property_manager' | 'kitchen_ops' | 'admin';

export interface DashboardUser {
  email: string;
  role: DashboardRole;
  display_name: string | null;
}

export async function getDashboardUser(): Promise<DashboardUser | null> {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;

  // Service-role client only for this lookup — RLS is on for dashboard_users.
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
