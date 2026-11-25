// Card payments through the SAS ALLEN Stripe account, via Stripe's REST API
// (no SDK dependency).
//
// Flow:
//   1. The guest confirms a night. With no card on file, the booking waits as
//      a draft and the guest is sent to Stripe's hosted page (Checkout, setup
//      mode) to save a card. Nothing is charged there.
//   2. Back from Stripe, the card is stored against the guest (brand + last 4
//      only; the number stays with Stripe) and waiting bookings are confirmed.
//   3. At 10:00 on the day of each dinner the saved card is charged
//      (/api/cron/charge).
//
// Env:
//   STRIPE_SECRET_KEY  — sk_test_… while testing, sk_live_… in production.
//                        Unset = payments off, bookings confirm without a card.
//   STRIPE_API_BASE    — tests only (points at a local stripe-mock).

import { sbService } from './supabase';
import type { Guest, Order } from './types';

const BASE = process.env.STRIPE_API_BASE || 'https://api.stripe.com';

export function stripeEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** True when the configured key is a live key (real money). */
export function stripeLive(): boolean {
  const k = process.env.STRIPE_SECRET_KEY || '';
  return k.startsWith('sk_live') || k.startsWith('rk_live');
}

export class StripeError extends Error {
  code: string | null;
  declineCode: string | null;
  status: number;
  paymentIntentId: string | null;
  constructor(message: string, status: number, code: string | null, declineCode: string | null, paymentIntentId: string | null) {
    super(message);
    this.name = 'StripeError';
    this.status = status;
    this.code = code;
    this.declineCode = declineCode;
    this.paymentIntentId = paymentIntentId;
  }
}

/** Stripe expects application/x-www-form-urlencoded with bracketed keys. */
export function encodeForm(params: Record<string, unknown>, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === 'object') out.push(...encodeForm(item as Record<string, unknown>, `${key}[${i}]`));
        else out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof v === 'object') {
      out.push(...encodeForm(v as Record<string, unknown>, key));
    } else {
      out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return out;
}

async function call<T = any>(method: 'GET' | 'POST', path: string, params?: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  const qs = params ? encodeForm(params).join('&') : '';
  const url = `${BASE}${path}${method === 'GET' && qs ? `?${qs}` : ''}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
  if (method === 'POST') headers['Content-Type'] = 'application/x-www-form-urlencoded';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const res = await fetch(url, { method, headers, body: method === 'POST' ? qs : undefined, cache: 'no-store' });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = json?.error ?? {};
    throw new StripeError(e.message || `Stripe error ${res.status}`, res.status, e.code ?? null, e.decline_code ?? null, e.payment_intent?.id ?? null);
  }
  return json as T;
}

// ---------------------------------------------------------------------------
// Card on file
// ---------------------------------------------------------------------------

/** A card the current key can actually charge (same mode as the key that saved it). */
export function hasUsableCard(guest: Guest | null): boolean {
  if (!guest?.stripe_customer_id || !guest.stripe_payment_method_id) return false;
  return (guest.stripe_livemode ?? null) === stripeLive();
}

async function ensureCustomer(guest: Guest): Promise<string> {
  if (guest.stripe_customer_id && (guest.stripe_livemode ?? null) === stripeLive()) return guest.stripe_customer_id;
  const customer = await call<{ id: string }>('POST', '/v1/customers', {
    name: guest.guest_name,
    email: guest.email || undefined,
    phone: guest.phone || undefined,
    preferred_locales: [guest.language === 'fr' ? 'fr' : 'en'],
    metadata: { guest_id: guest.id, property: 'paradise_peak', booking_ref: guest.booking_ref || undefined },
  }, `ppo-customer-${guest.id}-${stripeLive() ? 'live' : 'test'}`);
  await sbService().from('guests').update({
    stripe_customer_id: customer.id, stripe_livemode: stripeLive(),
    stripe_payment_method_id: null, card_brand: null, card_last4: null, card_exp: null,
  }).eq('id', guest.id);
  return customer.id;
}

/** Stripe-hosted page where the guest saves a card. Returns the URL to send them to. */
export async function createCardSetupSession(guest: Guest, opts: { successUrl: string; cancelUrl: string }): Promise<string> {
  const customer = await ensureCustomer(guest);
  const fr = guest.language === 'fr';
  const session = await call<{ url: string }>('POST', '/v1/checkout/sessions', {
    mode: 'setup',
    customer,
    currency: 'eur',
    payment_method_types: ['card'],
    locale: fr ? 'fr' : 'en',
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    metadata: { guest_id: guest.id },
    setup_intent_data: { metadata: { guest_id: guest.id, property: 'paradise_peak' } },
    custom_text: {
      submit: {
        message: fr
          ? 'Rien n\u2019est débité maintenant. Votre carte est débitée à 10 h le jour de chaque dîner réservé.'
          : 'Nothing is charged now. Your card is charged at 10:00 on the day of each dinner you book.',
      },
    },
  });
  if (!session.url) throw new Error('Stripe returned no checkout URL');
  return session.url;
}

export interface SavedCard { paymentMethodId: string; brand: string; last4: string; exp: string; isNew: boolean }

/** Called when the guest comes back from Stripe: store the card against the guest. */
export async function finishCardSetup(guest: Guest, sessionId: string): Promise<SavedCard> {
  const session: any = await call('GET', `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, { expand: ['setup_intent.payment_method'] });
  if (session.mode !== 'setup' || session.status !== 'complete') throw new Error('card setup not completed');
  const sessionCustomer = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  if (!guest.stripe_customer_id || sessionCustomer !== guest.stripe_customer_id) throw new Error('card setup does not belong to this guest');
  const si = session.setup_intent;
  const pm = si && typeof si === 'object' ? si.payment_method : null;
  if (!si || si.status !== 'succeeded' || !pm || typeof pm !== 'object' || !pm.card) throw new Error('no card on the completed setup');

  const exp = `${String(pm.card.exp_month).padStart(2, '0')}/${String(pm.card.exp_year).slice(-2)}`;
  const brand = String(pm.card.brand || 'card');
  const brandLabel = brand.charAt(0).toUpperCase() + brand.slice(1);
  const isNew = guest.stripe_payment_method_id !== pm.id;

  await call('POST', `/v1/customers/${encodeURIComponent(guest.stripe_customer_id)}`, {
    invoice_settings: { default_payment_method: pm.id },
  });
  await sbService().from('guests').update({
    stripe_payment_method_id: pm.id, card_brand: brandLabel, card_last4: pm.card.last4, card_exp: exp,
    stripe_livemode: stripeLive(),
  }).eq('id', guest.id);

  return { paymentMethodId: pm.id, brand: brandLabel, last4: pm.card.last4, exp, isNew };
}

// ---------------------------------------------------------------------------
// Charging a night
// ---------------------------------------------------------------------------

export type ChargeOutcome =
  | { ok: true; paymentIntentId: string }
  | { ok: false; reason: string; code: string | null; paymentIntentId: string | null };

/**
 * Charge one night to the guest's saved card, off-session.
 * `attempt` makes the idempotency key unique per try, so a cron retry of the
 * same attempt can never charge twice, while a later retry after a new card can.
 */
export async function chargeOrder(order: Pick<Order, 'id' | 'order_ref' | 'service_date' | 'total_cents' | 'cover_count'>, guest: Guest, attempt: number): Promise<ChargeOutcome> {
  if (!hasUsableCard(guest)) return { ok: false, reason: 'No card on file', code: 'no_card', paymentIntentId: null };
  const amount = order.total_cents ?? 0;
  if (amount <= 0) return { ok: false, reason: 'Nothing to charge', code: 'zero_amount', paymentIntentId: null };
  const body = {
    amount,
    currency: 'eur',
    customer: guest.stripe_customer_id,
    payment_method: guest.stripe_payment_method_id,
    off_session: true,
    confirm: true,
    description: `Dinner at the Peak — ${order.service_date} — ${order.order_ref} — ${order.cover_count} cover(s)`,
    metadata: {
      order_id: order.id, order_ref: order.order_ref, service_date: order.service_date,
      guest_id: guest.id, property: 'paradise_peak',
    },
  };
  const key = `ppo-charge-${order.id}-a${attempt}`;
  let last = 'Stripe unreachable';
  // Same idempotency key on every try: a repeat can never charge twice.
  for (let i = 0; i < 3; i++) {
    try {
      const pi: any = await call('POST', '/v1/payment_intents', body, key);
      if (pi.status === 'succeeded') return { ok: true, paymentIntentId: pi.id };
      return { ok: false, reason: `Payment not completed (${pi.status})`, code: pi.status, paymentIntentId: pi.id ?? null };
    } catch (err) {
      if (err instanceof StripeError && err.status < 500 && err.status !== 409 && err.status !== 429) {
        return { ok: false, reason: err.message, code: err.declineCode || err.code || 'declined', paymentIntentId: err.paymentIntentId };
      }
      last = err instanceof Error ? err.message : String(err);
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  return { ok: false, reason: last, code: 'network', paymentIntentId: null };
}
