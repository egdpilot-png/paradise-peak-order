import { NextResponse } from 'next/server';
import { getDashboardUser, canAct } from '@/lib/auth';
import { markChefsChoiceForMissing } from '@/lib/dashboard';

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
    const assigned = await markChefsChoiceForMissing(date);
    return NextResponse.json({ ok: true, assigned });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
