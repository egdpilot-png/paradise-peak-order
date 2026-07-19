// POST /api/order — accepts a guest submission and persists to Supabase.
// Enforces the 10:00 ordering window server-side (belt & braces with the UI).

import { NextResponse } from 'next/server';
import { upsertOrder } from '@/lib/supabase';
import { isOrderingOpen } from '@/lib/time';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const { room, guestId, menuId, serviceDate, coverCount, notes, choices } = body ?? {};

  if (!room || !menuId || !serviceDate || !coverCount) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  }
  if (typeof coverCount !== 'number' || coverCount < 1 || coverCount > 8) {
    return NextResponse.json({ error: 'invalid cover_count' }, { status: 400 });
  }
  if (!Array.isArray(choices)) {
    return NextResponse.json({ error: 'invalid choices' }, { status: 400 });
  }

  if (!isOrderingOpen(serviceDate)) {
    return NextResponse.json(
      { error: 'ordering window has closed for this date' },
      { status: 409 },
    );
  }

  try {
    const order = await upsertOrder({
      room,
      guestId,
      menuId,
      serviceDate,
      coverCount,
      notes,
      choices,
      entryChannel: 'guest_qr',
    });
    return NextResponse.json({ ok: true, order });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'failed to save order', detail: err?.message ?? String(err) },
      { status: 500 },
    );
  }
}
