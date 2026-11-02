// POST /api/order/cancel — guest cancels one night before 10:00.

import { NextResponse } from 'next/server';
import { cancelOrder, loadGuestById, loadOrderForRoomDate } from '@/lib/supabase';
import { sendCancellationEmail } from '@/lib/email';
import type { Guest } from '@/lib/types';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://menu.piratebynight.com';
import { isOrderingOpen } from '@/lib/time';
import { verifyToken } from '@/lib/token';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }
  const { token, serviceDate } = body ?? {};
  const payload = token ? verifyToken(String(token)) : null;
  if (!payload) return NextResponse.json({ error: 'invalid token' }, { status: 401 });
  if (!serviceDate) return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  if (!isOrderingOpen(serviceDate)) return NextResponse.json({ error: 'past cutoff' }, { status: 409 });

  let room = payload.room;
  let guest: Guest | null = null;
  if (payload.guest_id) {
    guest = await loadGuestById(payload.guest_id);
    if (!guest) return NextResponse.json({ error: 'unknown guest' }, { status: 401 });
    room = guest.room_number;
  }
  const order = await loadOrderForRoomDate(room, serviceDate);
  if (!order) return NextResponse.json({ ok: true });
  await cancelOrder(order.id);
  const emailed = await sendCancellationEmail(guest, serviceDate, order.order_ref, `${APP_URL}/my/${encodeURIComponent(String(token))}`);
  return NextResponse.json({ ok: true, emailed });
}
