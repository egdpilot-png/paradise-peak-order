import { NextResponse } from 'next/server';
import { getDashboardUser, canAct } from '@/lib/auth';
import { saveDraft } from '@/lib/publisher';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const user = await getDashboardUser();
  if (!canAct(user, 'kitchen_action')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }
  const drafts = body?.drafts;
  if (!Array.isArray(drafts) || drafts.length === 0) {
    return NextResponse.json({ error: 'no drafts' }, { status: 400 });
  }
  try {
    const ids: string[] = [];
    for (const d of drafts) {
      ids.push(await saveDraft(d, user!.email));
    }
    return NextResponse.json({ ok: true, ids });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
