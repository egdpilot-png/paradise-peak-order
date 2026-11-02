// POST /api/order — guest booking for one night.
// Authenticated by the signed stay/room token; room and guest come from the
// token, never from the body. Enforces the 10:00 window server-side.

import { NextResponse } from 'next/server';
import { upsertOrder, loadGuestById, loadOrderForRoomDate } from '@/lib/supabase';
import { sendBookingEmail } from '@/lib/email';
import type { Guest } from '@/lib/types';
import { isOrderingOpen, nightKind } from '@/lib/time';
import { verifyToken } from '@/lib/token';

export const runtime = 'nodejs';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://menu.piratebynight.com';

export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }

  const { token, menuId, serviceDate, coverCount, notes, choices } = body ?? {};
  const payload = token ? verifyToken(String(token)) : null;
  if (!payload) return NextResponse.json({ error: 'invalid token' }, { status: 401 });

  if (!menuId || !serviceDate || !coverCount) return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  if (typeof coverCount !== 'number' || coverCount < 1 || coverCount > 8) return NextResponse.json({ error: 'invalid cover_count' }, { status: 400 });
  if (!Array.isArray(choices)) return NextResponse.json({ error: 'invalid choices' }, { status: 400 });
  const seen = new Set<string>();
  for (const c of choices) {
    if (!c || typeof c.menuItemId !== 'string' || typeof c.course !== 'string') return NextResponse.json({ error: 'invalid choice' }, { status: 400 });
    const seat = c.seat ?? 1;
    if (!Number.isInteger(seat) || seat < 1 || seat > coverCount) return NextResponse.json({ error: 'seat outside party' }, { status: 400 });
    const key = `${seat}:${c.course}`;
    if (seen.has(key)) return NextResponse.json({ error: 'duplicate course for a seat' }, { status: 400 });
    seen.add(key);
    if (c.note != null && (typeof c.note !== 'string' || c.note.length > 200)) return NextResponse.json({ error: 'note too long' }, { status: 400 });
  }
  if (nightKind(serviceDate) === 'closed') return NextResponse.json({ error: 'no service on this date' }, { status: 409 });
  if (!isOrderingOpen(serviceDate)) return NextResponse.json({ error: 'ordering window has closed for this date' }, { status: 409 });

  // Resolve room + guest from the token
  let room = payload.room;
  let guestId: string | null = payload.guest_id ?? null;
  let guest: Guest | null = null;
  if (guestId) {
    guest = await loadGuestById(guestId);
    if (!guest) return NextResponse.json({ error: 'unknown guest' }, { status: 401 });
    room = guest.room_number;
    if (guest.check_in && guest.check_out && (serviceDate < guest.check_in || serviceDate >= guest.check_out)) {
      return NextResponse.json({ error: 'date outside stay' }, { status: 409 });
    }
  }

  try {
    const before = await loadOrderForRoomDate(room, serviceDate);
    const order = await upsertOrder({ room, guestId, menuId, serviceDate, coverCount, notes, choices, entryChannel: 'guest_qr' });
    // Confirmation to the guest (cc Paradise Peak). Best-effort, never blocks the booking.
    const emailed = await sendBookingEmail(order, guest, `${APP_URL}/my/${encodeURIComponent(String(token))}`, before ? 'updated' : 'new');
    return NextResponse.json({ ok: true, order, emailed });
  } catch (err: any) {
    return NextResponse.json({ error: 'failed to save order', detail: err?.message ?? String(err) }, { status: 500 });
  }
}
