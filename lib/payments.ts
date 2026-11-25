// Payment orchestration: what happens to bookings when a card is saved, and
// the 10:00 charge run. Stripe calls live in ./stripe, emails in ./email.

import { sbService, loadGuestById } from './supabase';
import { chargeOrder, hasUsableCard, stripeEnabled, stripeLive, type SavedCard } from './stripe';
import {
  sendBookingEmail, sendCardSavedEmail, sendChargeFailedEmail, sendChargeReceiptEmail, sendChargeRunSummary,
  type ChargeRunLine,
} from './email';
import { isOrderingOpen, todayInMarigot } from './time';
import type { Guest, Order, OrderItem } from './types';

const ACTIVE = ['submitted', 'locked', 'served'];

async function withItems(orders: any[]): Promise<Order[]> {
  if (!orders.length) return [];
  const { data: items } = await sbService().from('order_items').select('*').in('order_id', orders.map((o) => o.id));
  return orders.map((o) => ({ ...o, items: ((items ?? []) as any[]).filter((i) => i.order_id === o.id) as OrderItem[] })) as Order[];
}

// ---------------------------------------------------------------------------
// After the guest saves a card
// ---------------------------------------------------------------------------

export interface CardSavedResult { confirmed: Order[]; charged: Order[]; chargeFailed: Order[] }

/**
 * - bookings waiting for a card (draft) and still open → confirmed
 * - confirmed bookings without a card yet → card attached
 * - a night whose 10:00 charge failed today → charged again on the new card
 * Sends the booking confirmation(s) and the card confirmation.
 */
export async function applySavedCard(guestId: string, card: SavedCard, stayUrl: string): Promise<CardSavedResult> {
  const svc = sbService();
  const guest = await loadGuestById(guestId);
  if (!guest) throw new Error('unknown guest');
  const today = todayInMarigot();

  const { data: rows } = await svc.from('orders').select('*')
    .eq('guest_id', guestId).gte('service_date', today).neq('status', 'cancelled').order('service_date');
  const orders = (rows ?? []) as any[];

  // 1. Drafts that are still open become real bookings.
  const drafts = orders.filter((o) => o.status === 'draft' && isOrderingOpen(o.service_date));
  const confirmedIds: string[] = [];
  for (const o of drafts) {
    const { data: upd } = await svc.from('orders')
      .update({ status: 'submitted', submitted_at: new Date().toISOString(), payment_status: 'card_on_file', payment_error: null })
      .eq('id', o.id).eq('status', 'draft').select('id');
    if (upd && upd.length) confirmedIds.push(o.id);
  }

  // 2. Bookings confirmed before a card existed now have one.
  await svc.from('orders').update({ payment_status: 'card_on_file' })
    .eq('guest_id', guestId).gte('service_date', today).in('status', ACTIVE).eq('payment_status', 'none');

  // 3. Tonight's dinner, already past the 10:00 charge time, is charged on the
  //    new card straight away: a night declined this morning, or a night that
  //    was confirmed before a card existed.
  const lateToday = (o: any) => ACTIVE.includes(o.status) && o.service_date === today && !isOrderingOpen(o.service_date);
  const retry = orders.filter((o) => lateToday(o) && (o.payment_status === 'failed' || o.payment_status === 'none'));
  const charged: Order[] = [];
  const chargeFailed: Order[] = [];
  for (const o of retry) {
    const r = await chargeOne(o.id, ['failed', 'card_on_file'], guest);
    if (r?.result === 'charged') charged.push(o as Order);
    else if (r) chargeFailed.push(o as Order);
  }

  const confirmed = await withItems(orders.filter((o) => confirmedIds.includes(o.id)).map((o) => ({ ...o, status: 'submitted', payment_status: 'card_on_file' })));

  // Emails: one per newly confirmed night, then the card confirmation.
  for (const o of confirmed) await sendBookingEmail(o, guest, stayUrl, 'new');
  if (card.isNew || confirmed.length) await sendCardSavedEmail(guest, card, confirmed, stayUrl);

  return { confirmed, charged, chargeFailed };
}

// ---------------------------------------------------------------------------
// Charging
// ---------------------------------------------------------------------------

/**
 * Charge one order. `from` lists the payment states this call may start from;
 * the state is claimed atomically so two runs can never charge the same night.
 */
export async function chargeOne(orderId: string, from: string[], knownGuest?: Guest | null): Promise<ChargeRunLine | null> {
  const svc = sbService();
  const { data: o } = await svc.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (!o || !ACTIVE.includes(o.status) || !from.includes(o.payment_status)) return null;

  const guest = knownGuest ?? (o.guest_id ? await loadGuestById(o.guest_id) : null);
  const line = (result: ChargeRunLine['result'], detail?: string | null): ChargeRunLine => ({
    order_ref: o.order_ref, room: o.room_number, guest_name: guest?.guest_name ?? null, total_cents: o.total_cents ?? 0, result, detail,
  });
  const stayUrl = guest ? await stayUrlFor(guest) : null;

  // A card saved with the other Stripe mode (test vs live) belongs to the other
  // environment: leave the order alone rather than failing it from here.
  if (guest?.stripe_payment_method_id && (guest.stripe_livemode ?? null) !== stripeLive()) return null;

  if (!guest || !hasUsableCard(guest)) {
    await svc.from('orders').update({ payment_status: 'failed', payment_error: 'No card on file' }).eq('id', o.id).eq('payment_status', o.payment_status);
    if (guest && stayUrl && o.payment_status !== 'failed') await sendChargeFailedEmail(o, guest, stayUrl);
    return line('no_card');
  }
  if ((o.total_cents ?? 0) <= 0) return null;

  // Claim: only one run gets past this line for a given order.
  const { data: claimed } = await svc.from('orders').update({ payment_status: 'charging' })
    .eq('id', o.id).eq('payment_status', o.payment_status).select('id');
  if (!claimed || !claimed.length) return null;

  const attempt = (o.payment_attempts ?? 0) + 1;
  const outcome = await chargeOrder(o, guest, attempt);

  if (outcome.ok) {
    await svc.from('orders').update({
      payment_status: 'charged', charged_at: new Date().toISOString(),
      stripe_payment_intent_id: outcome.paymentIntentId, payment_error: null, payment_attempts: attempt,
    }).eq('id', o.id);
    if (stayUrl) await sendChargeReceiptEmail(o, guest, stayUrl);
    return line('charged');
  }

  if (outcome.code === 'network') {
    // Outcome unknown: release the claim without using up the attempt number,
    // so the next run repeats the same idempotency key and cannot double charge.
    await svc.from('orders').update({ payment_status: o.payment_status === 'charging' ? 'card_on_file' : o.payment_status, payment_error: `Retry pending: ${outcome.reason}`.slice(0, 300) }).eq('id', o.id);
    return line('failed', 'Stripe unreachable, will retry');
  }

  await svc.from('orders').update({
    payment_status: 'failed', payment_error: outcome.reason.slice(0, 300),
    stripe_payment_intent_id: outcome.paymentIntentId, payment_attempts: attempt,
  }).eq('id', o.id);
  if (stayUrl) await sendChargeFailedEmail(o, guest, stayUrl);
  return line('failed', outcome.code);
}

export interface ChargeRun { date: string; skipped?: string; lines: ChargeRunLine[]; charged_cents: number; failed: number; without_card: number }

/**
 * The 10:00 run: charge every confirmed night of `date` that has a card on
 * file. Safe to call again — charged nights are skipped, and an interrupted
 * charge is resumed with the same idempotency key.
 */
export async function chargeDueOrders(date: string, opts: { retryFailed?: boolean; backup?: boolean } = {}): Promise<ChargeRun> {
  const empty = { date, lines: [], charged_cents: 0, failed: 0, without_card: 0 };
  if (!stripeEnabled()) return { ...empty, skipped: 'payments are not configured' };
  if (date > todayInMarigot()) return { ...empty, skipped: 'date is in the future' };
  if (isOrderingOpen(date)) return { ...empty, skipped: 'before 10:00 — bookings are still open' };

  const svc = sbService();
  const from = ['card_on_file', ...(opts.retryFailed ? ['failed'] : [])];
  const { data: due } = await svc.from('orders').select('id, payment_status, updated_at')
    .eq('service_date', date).in('status', ACTIVE).in('payment_status', [...from, 'charging']).gt('total_cents', 0);

  const lines: ChargeRunLine[] = [];
  for (const o of (due ?? []) as any[]) {
    let start = from;
    if (o.payment_status === 'charging') {
      // Left over from an interrupted run: resume once it is clearly stale.
      if (Date.now() - new Date(o.updated_at).getTime() < 5 * 60 * 1000) continue;
      start = ['charging'];
    }
    const line = await chargeOne(o.id, start);
    if (line) lines.push(line);
  }

  // Confirmed nights that never had a card (booked before payments were on).
  // Reported once, by the main run; the backup run only picks up what was missed.
  const { data: bare } = opts.backup ? { data: [] } : await svc.from('orders').select('order_ref, room_number, total_cents, guest_id')
    .eq('service_date', date).in('status', ACTIVE).eq('payment_status', 'none').gt('total_cents', 0);
  for (const o of (bare ?? []) as any[]) {
    lines.push({ order_ref: o.order_ref, room: o.room_number, guest_name: null, total_cents: o.total_cents ?? 0, result: 'no_card' });
  }

  await sendChargeRunSummary(date, lines);
  return {
    date, lines,
    charged_cents: lines.filter((l) => l.result === 'charged').reduce((a, l) => a + l.total_cents, 0),
    failed: lines.filter((l) => l.result === 'failed').length,
    without_card: lines.filter((l) => l.result === 'no_card').length,
  };
}

async function stayUrlFor(guest: Guest): Promise<string | null> {
  if (!guest.check_out) return null;
  const { issueStayToken } = await import('./token');
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://menu.piratebynight.com';
  return `${base}/my/${issueStayToken(guest.id, guest.room_number, guest.check_out)}`;
}
