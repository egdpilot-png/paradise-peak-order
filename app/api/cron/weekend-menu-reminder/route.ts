// Programmatic check called by the Monday-morning cron.
// Season 2026/27: looks at the current week's six service nights (Mon–Sat).
// Returns a decision object the caller uses to decide whether to notify.
//
// GET is idempotent and safe to retry.
// Protected by CRON_SECRET via Authorization: Bearer <secret> or ?secret=<secret>.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { defaultMonday, loadWeekContext } from '@/lib/publisher';
import { nightKind } from '@/lib/time';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DayStatus = 'unpublished' | 'draft' | 'published';
type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';

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
    | 'all_published'
    | 'unpublished_but_no_guests'
    | 'unpublished_with_guests'
    | 'draft_only_with_guests';
  checked_at: string;
  week: { monday: string; dates: string[] };
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

  const monday = defaultMonday();
  const ctx = await loadWeekContext(monday);
  const WEEKDAYS: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  const days: DaySnapshot[] = ctx.dates.map((date, i) => {
    const m = ctx.existing[date];
    return {
      service_date: date,
      weekday: WEEKDAYS[i],
      status: ((m?.status as DayStatus | undefined) ?? 'unpublished'),
      menu_id: m?.id ?? null,
      title: m?.title ?? null,
      published_at: m?.published_at ?? null,
      dish_count: m?.items.length ?? 0,
    };
  });

  const guestsCount = ctx.guestsThisWeek;
  const breakdown = ctx.languageBreakdown;

  const unpublished = days.filter(d => d.status !== 'published');
  const draftsOnly = unpublished.every(d => d.status === 'draft');
  const shouldNotify = unpublished.length > 0 && guestsCount > 0;

  let reason: Decision['reason'];
  let message: Decision['message'] = null;

  if (unpublished.length === 0) {
    reason = 'all_published';
  } else if (guestsCount === 0) {
    reason = 'unpublished_but_no_guests';
  } else {
    reason = draftsOnly ? 'draft_only_with_guests' : 'unpublished_with_guests';

    const parts = unpublished.map(d => {
      const label = d.weekday.slice(0, 3).replace(/^./, c => c.toUpperCase());
      const kind = nightKind(d.service_date) === 'buffet' ? 'buffet' : 'plated';
      if (d.status === 'draft') return `${label} ${shortDate(d.service_date)} ${kind} draft (${d.dish_count} dishes)`;
      return `${label} ${shortDate(d.service_date)} ${kind} not published`;
    });
    const guestCopy = `${guestsCount} guest${guestsCount === 1 ? '' : 's'} in-house this week · ${breakdown.en} EN / ${breakdown.fr} FR`;
    const url = `${baseUrlFor(req)}/dashboard/publish?week=${monday}`;

    message = {
      title: draftsOnly ? 'This week\'s menus are still drafts' : 'This week\'s menus are not all published',
      body: `${parts.join(' · ')}. ${guestCopy}. Guests book from the published menus.`,
      url,
    };
  }

  const decision: Decision = {
    ok: true,
    action: shouldNotify ? 'notify' : 'skip',
    reason,
    checked_at: new Date().toISOString(),
    week: { monday, dates: ctx.dates },
    guests_in_house: guestsCount,
    language_breakdown: breakdown,
    days,
    message,
  };

  return NextResponse.json(decision);
}
