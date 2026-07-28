import { NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/supabase-server';

export async function GET(req: Request) {
  const supabase = await createSupabaseRouteClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/dashboard/login', req.url));
}

export async function POST(req: Request) {
  const supabase = await createSupabaseRouteClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/dashboard/login', req.url), { status: 303 });
}
