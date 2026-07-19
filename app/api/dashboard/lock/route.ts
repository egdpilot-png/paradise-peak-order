import { NextResponse } from 'next/server';
import { getDashboardUser, canAct } from '@/lib/auth';
import { lockOrders } from '@/lib/dashboard';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const user = await getDashboardUser();
  if (!canAct(user, 'kitchen_action')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  if (!date) return NextResponse.json({ error: 'missing date' }, { status: 400 });
  try {
    const locked = await lockOrders(date);
    return NextResponse.json({ ok: true, locked });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
