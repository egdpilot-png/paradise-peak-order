// POST /api/card/setup — start saving (or replacing) the guest's card.
// Returns the URL of Stripe's hosted page. Nothing is charged there.

import { NextResponse } from 'next/server';
import { loadGuestById } from '@/lib/supabase';
import { createCardSetupSession, stripeEnabled } from '@/lib/stripe';
import { verifyToken } from '@/lib/token';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }
  const token = String(body?.token ?? '');
  const payload = token ? verifyToken(token) : null;
  if (!payload?.guest_id) return NextResponse.json({ error: 'invalid token' }, { status: 401 });
  if (!stripeEnabled()) return NextResponse.json({ error: 'card payment is not active' }, { status: 409 });

  const guest = await loadGuestById(payload.guest_id);
  if (!guest) return NextResponse.json({ error: 'unknown guest' }, { status: 401 });

  const origin = new URL(req.url).origin;
  const t = encodeURIComponent(token);
  try {
    const url = await createCardSetupSession(guest, {
      successUrl: `${origin}/my/${t}/card/done?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/my/${t}?card=cancelled`,
    });
    return NextResponse.json({ ok: true, url });
  } catch (err: any) {
    console.error('[card/setup] failed', err);
    return NextResponse.json({ error: 'could not open the card page' }, { status: 502 });
  }
}
