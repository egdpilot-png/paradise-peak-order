// POST /api/order — guest booking for one night.
// Authenticated by the signed stay/room token; room and guest come from the
// token, never from the body. Enforces the 10:00 window server-side.

import { NextResponse } from 'next/server';
import { upsertOrder, loadGuestById, loadOrderForRoomDate } from '@/lib/supabase';
import { sendBookingEmail } from '@/lib/email';
import type { Guest } from '@/lib/types';
import { isOrderingOpen, nightKind } from '@/lib/time';
import { verifyToken } from '@/lib/token';
import { createCardSetupSession, hasUsableCard, stripeEnabled } from '@/lib/stripe';

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

  // With payments on, a guest's first booking waits for a card: it is saved as
  // a draft, the guest goes to Stripe's secure page, and it is confirmed on
  // their return. Guests with a card on file are confirmed straight away.
  const paymentsOn = stripeEnabled() && Boolean(guest);
  const cardOk = paymentsOn && hasUsableCard(guest);
  const needsCard = paymentsOn && !cardOk;

  try {
    const before = await loadOrderForRoomDate(room, serviceDate);
    if (before && ['charged', 'charging'].includes(before.payment_status ?? '')) {
      return NextResponse.json({ error: 'this night has already been charged' }, { status: 409 });
    }
    const order = await upsertOrder({
      room, guestId, menuId, serviceDate, coverCount, notes, choices, entryChannel: 'guest_qr',
      status: needsCard ? 'draft' : 'submitted',
      paymentStatus: cardOk ? 'card_on_file' : 'none',
    });

    if (needsCard && guest) {
      const origin = new URL(req.url).origin;
      const t = encodeURIComponent(String(token));
      try {
        const checkoutUrl = await createCardSetupSession(guest, {
          successUrl: `${origin}/my/${t}/card/done?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${origin}/my/${t}?card=cancelled`,
        });
        return NextResponse.json({ ok: true, order, needsCard: true, checkoutUrl, emailed: false });
      } catch (err: any) {
        console.error('[order] card setup session failed', err);
        // The draft is kept; the stay page offers "Add card" to finish.
        return NextResponse.json({ ok: true, order, needsCard: true, checkoutUrl: null, emailed: false });
      }
    }

    // Confirmation to the guest. Best-effort, never blocks the booking.
    const wasConfirmed = before && before.status !== 'draft';
    const emailed = await sendBookingEmail(order, guest, `${APP_URL}/my/${encodeURIComponent(String(token))}`, wasConfirmed ? 'updated' : 'new');
    return NextResponse.json({ ok: true, order, emailed, card: cardOk && guest ? { brand: guest.card_brand, last4: guest.card_last4 } : null });
  } catch (err: any) {
    return NextResponse.json({ error: 'failed to save order', detail: err?.message ?? String(err) }, { status: 500 });
  }
}
