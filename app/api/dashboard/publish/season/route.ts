import { NextResponse } from 'next/server';
import { getDashboardUser, canAct } from '@/lib/auth';
import { publishSeason } from '@/lib/publisher';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const user = await getDashboardUser();
  if (!canAct(user, 'kitchen_action')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }
  const { drafts, monday, until, overwrite } = body ?? {};
  if (!Array.isArray(drafts) || drafts.length === 0) return NextResponse.json({ error: 'no drafts' }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(monday ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(until ?? '')) {
    return NextResponse.json({ error: 'bad dates' }, { status: 400 });
  }
  if (until < monday) return NextResponse.json({ error: 'season end is before the week' }, { status: 400 });
  try {
    const result = await publishSeason(drafts, monday, until, user!.email, overwrite === true);
    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
