// GET /my/<token>/card/done?session_id=… — the guest is back from Stripe.
// Stores the card (brand + last 4), confirms the bookings that were waiting
// for it, sends the confirmations, then returns the guest to their stay page.

import { NextResponse } from 'next/server';
import { loadGuestById } from '@/lib/supabase';
import { finishCardSetup, stripeEnabled } from '@/lib/stripe';
import { applySavedCard } from '@/lib/payments';
import { verifyToken } from '@/lib/token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://menu.piratebynight.com';

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const url = new URL(req.url);
  const t = encodeURIComponent(token);
  const back = (q: string) => NextResponse.redirect(`${url.origin}/my/${t}?${q}`, 303);

  const payload = verifyToken(token);
  if (!payload?.guest_id) return NextResponse.redirect(`${url.origin}/expired`, 303);
  const sessionId = url.searchParams.get('session_id');
  if (!sessionId || !stripeEnabled()) return back('card=error');

  try {
    const guest = await loadGuestById(payload.guest_id);
    if (!guest) return NextResponse.redirect(`${url.origin}/expired`, 303);
    const card = await finishCardSetup(guest, sessionId);
    const res = await applySavedCard(guest.id, card, `${APP_URL}/my/${t}`);
    const q = new URLSearchParams({ card: 'saved', n: String(res.confirmed.length) });
    if (res.charged.length) q.set('paid', String(res.charged.length));
    if (res.chargeFailed.length) q.set('declined', String(res.chargeFailed.length));
    return back(q.toString());
  } catch (err) {
    console.error('[card/done] failed', err);
    return back('card=error');
  }
}
