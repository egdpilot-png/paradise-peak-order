// POST /api/night-skip — guest marks a night as "Not dining" (or undoes it).
// Body: { token, serviceDate, skip: boolean }. Only for nights without an
// active order; nights with a booking are cancelled through /api/order/cancel.

import { NextResponse } from 'next/server';
import { sbService, loadGuestById, loadOrderForRoomDate } from '@/lib/supabase';
import { verifyToken } from '@/lib/token';
import { nightKind, todayInMarigot } from '@/lib/time';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }
  const { token, serviceDate, skip } = body ?? {};
  const payload = token ? verifyToken(String(token)) : null;
  if (!payload?.guest_id) return NextResponse.json({ error: 'invalid token' }, { status: 401 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(serviceDate ?? ''))) return NextResponse.json({ error: 'invalid date' }, { status: 400 });
  if (nightKind(serviceDate) === 'closed') return NextResponse.json({ error: 'closed night' }, { status: 409 });
  if (serviceDate < todayInMarigot()) return NextResponse.json({ error: 'past date' }, { status: 409 });

  const guest = await loadGuestById(payload.guest_id);
  if (!guest) return NextResponse.json({ error: 'unknown guest' }, { status: 401 });
  if (guest.check_in && guest.check_out && (serviceDate < guest.check_in || serviceDate >= guest.check_out)) {
    return NextResponse.json({ error: 'date outside stay' }, { status: 409 });
  }

  const svc = sbService();
  if (skip) {
    const order = await loadOrderForRoomDate(guest.room_number, serviceDate);
    if (order) return NextResponse.json({ error: 'night is booked — cancel the booking first' }, { status: 409 });
    const { error } = await svc.from('guest_night_skips').upsert({ guest_id: guest.id, service_date: serviceDate }, { onConflict: 'guest_id,service_date' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await svc.from('guest_night_skips').delete().eq('guest_id', guest.id).eq('service_date', serviceDate);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, skip: Boolean(skip) });
}
