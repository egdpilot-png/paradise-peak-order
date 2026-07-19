// Programmatic check called by the Monday-morning cron.
// Returns a decision object the caller uses to decide whether to notify.
//
// GET is idempotent and safe to retry.
// Protected by CRON_SECRET via Authorization: Bearer <secret> or ?secret=<secret>.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { nextWeekend } from '@/lib/publisher';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DayStatus = 'unpublished' | 'draft' | 'published';
type Weekday = 'saturday' | 'sunday';

interface DaySnapshot {
  service_date: string;
  weekday: Weekday;
  status: DayStatus;
  menu_id: string | null;
  title: string | null;
  published_at: string | null;
  dish_count: number;
}

interface Decision {
  ok: true;
  action: 'notify' | 'skip';
  reason:
    | 'both_published'
    | 'unpublished_but_no_guests'
    | 'unpublished_with_guests'
    | 'draft_only_with_guests';
  checked_at: string;
  weekend: { saturday: string; sunday: string };
  guests_in_house: number;
  language_breakdown: { en: number; fr: number };
  days: DaySnapshot[];
  message: {
    title: string;
    body: string;
    url: string;
  } | null;
}

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // Dev-only: allow if unset
  const auth = req.headers.get('authorization') ?? '';
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  return url.searchParams.get('secret') === secret;
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

function baseUrlFor(req: Request): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  return `${proto}://${host}`;
}

function shortDate(iso: string): string {
  // '2026-07-18' -> '18/07'
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { saturday, sunday } = nextWeekend();
  const sb = admin();

  const [menusRes, guestsRes] = await Promise.all([
    sb
      .from('menus')
      .select('id, service_date, status, title, published_at, menu_items(count)')
      .in('service_date', [saturday, sunday])
      .in('status', ['draft', 'published']),
    sb
      .from('guests')
      .select('id, language')
      .lte('check_in', sunday)
      .gt('check_out', saturday),
  ]);

  if (menusRes.error) return NextResponse.json({ error: menusRes.error.message }, { status: 500 });
  if (guestsRes.error) return NextResponse.json({ error: guestsRes.error.message }, { status: 500 });

  // Pick the freshest menu per date. Published wins over draft; then latest.
  const rank = (s: string) => (s === 'published' ? 2 : s === 'draft' ? 1 : 0);
  const bestByDate = new Map<string, any>();
  for (const m of menusRes.data ?? []) {
    const cur = bestByDate.get(m.service_date);
    if (!cur || rank(m.status) > rank(cur.status)) bestByDate.set(m.service_date, m);
  }

  const dayPairs: Array<{ date: string; weekday: Weekday }> = [
    { date: saturday, weekday: 'saturday' },
    { date: sunday, weekday: 'sunday' },
  ];

  const days: DaySnapshot[] = dayPairs.map(({ date, weekday }) => {
    const m = bestByDate.get(date);
    return {
      service_date: date,
      weekday,
      status: ((m?.status as DayStatus | undefined) ?? 'unpublished'),
      menu_id: m?.id ?? null,
      title: m?.title ?? null,
      published_at: m?.published_at ?? null,
      dish_count: m?.menu_items?.[0]?.count ?? 0,
    };
  });

  const guests = guestsRes.data ?? [];
  const breakdown = { en: 0, fr: 0 };
  for (const g of guests as Array<{ language?: string }>) {
    if (g.language === 'fr') breakdown.fr += 1; else breakdown.en += 1;
  }

  const unpublished = days.filter(d => d.status !== 'published');
  const draftsOnly = unpublished.every(d => d.status === 'draft');
  const shouldNotify = unpublished.length > 0 && guests.length > 0;

  let reason: Decision['reason'];
  let message: Decision['message'] = null;

  if (unpublished.length === 0) {
    reason = 'both_published';
  } else if (guests.length === 0) {
    reason = 'unpublished_but_no_guests';
  } else {
    reason = draftsOnly ? 'draft_only_with_guests' : 'unpublished_with_guests';

    const parts = unpublished.map(d => {
      const label = d.weekday === 'saturday' ? 'Sat' : 'Sun';
      if (d.status === 'draft') return `${label} ${shortDate(d.service_date)} draft (${d.dish_count} dishes)`;
      return `${label} ${shortDate(d.service_date)} not published`;
    });
    const guestCopy = `${guests.length} guest${guests.length === 1 ? '' : 's'} in-house · ${breakdown.en} EN / ${breakdown.fr} FR`;
    const url = `${baseUrlFor(req)}/dashboard/publish?saturday=${saturday}`;

    message = {
      title: draftsOnly ? 'Weekend menu still a draft' : 'Weekend menu not published',
      body: `${parts.join(' · ')}. ${guestCopy}. Guests expect the QR menu today.`,
      url,
    };
  }

  const decision: Decision = {
    ok: true,
    action: shouldNotify ? 'notify' : 'skip',
    reason,
    checked_at: new Date().toISOString(),
    weekend: { saturday, sunday },
    guests_in_house: guests.length,
    language_breakdown: breakdown,
    days,
    message,
  };

  return NextResponse.json(decision);
}
