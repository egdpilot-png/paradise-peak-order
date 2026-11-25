// GET /api/cron/charge — the 10:00 charge run (America/Marigot).
// Scheduled in vercel.json at 14:00 UTC, with a backup run an hour later that
// only picks up anything the first run missed. Charges every confirmed night of
// today that has a card on file, emails each guest a receipt (or a "payment
// declined" notice) and sends the office a summary.
//
// Safe to call again: charged nights are skipped and an interrupted charge is
// resumed with the same idempotency key, so no night is charged twice.
//
//   ?date=YYYY-MM-DD   catch up an earlier date (never a future one)
//   ?retry=1           also retry nights whose charge was declined
//   ?backup=1          backup run: no second report of nights without a card
//
// Protected by CRON_SECRET (Authorization: Bearer <secret>, which Vercel Cron
// sends automatically, or ?secret=<secret>).

import { NextResponse } from 'next/server';
import { chargeDueOrders } from '@/lib/payments';
import { todayInMarigot } from '@/lib/time';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if ((req.headers.get('authorization') ?? '') === `Bearer ${secret}`) return true;
  return new URL(req.url).searchParams.get('secret') === secret;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const date = url.searchParams.get('date') || todayInMarigot();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'invalid date' }, { status: 400 });
  try {
    const run = await chargeDueOrders(date, { retryFailed: url.searchParams.get('retry') === '1', backup: url.searchParams.get('backup') === '1' });
    return NextResponse.json({ ok: true, ...run });
  } catch (err: any) {
    console.error('[cron/charge] failed', err);
    return NextResponse.json({ error: 'charge run failed', detail: err?.message ?? String(err) }, { status: 500 });
  }
}
