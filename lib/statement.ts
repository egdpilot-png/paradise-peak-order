// Monthly partner statement: dinner sales per service night and the
// Paradise Peak commission (PARTNER_COMMISSION_BPS), settled at month end.
// Sales = total of every non-cancelled booking for nights already served
// (service date < today). Future nights are listed as "booked, not yet due".

import { createClient } from '@supabase/supabase-js';
import { PARTNER_COMMISSION_BPS, MIN_COVERS_ONSITE, nightKind, todayInMarigot } from './time';

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

export interface StatementNight {
  service_date: string;
  kind: 'buffet' | 'plated' | 'closed';
  format: 'onsite' | 'delivered' | 'none';
  rooms: number;
  covers: number;
  sales_cents: number;
  charged_cents: number;
  commission_cents: number;
  due: boolean;            // service date has passed
}

export interface Statement {
  month: string;           // YYYY-MM
  from: string;
  to: string;
  commission_bps: number;
  nights: StatementNight[];
  totals: { rooms: number; covers: number; sales_cents: number; charged_cents: number; commission_cents: number };
  upcoming: { nights: number; covers: number; sales_cents: number };
}

export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

export async function loadStatement(month: string): Promise<Statement> {
  const { from, to } = monthBounds(month);
  const sb = admin();
  const today = todayInMarigot();

  const [ordersRes, nightsRes] = await Promise.all([
    sb.from('orders')
      .select('service_date, room_number, cover_count, total_cents, status, payment_status')
      .gte('service_date', from).lte('service_date', to)
      .in('status', ['submitted', 'locked', 'served']),
    sb.from('service_nights').select('service_date, service_format, total_covers').gte('service_date', from).lte('service_date', to),
  ]);
  if (ordersRes.error) throw ordersRes.error;

  const formats = new Map<string, string | null>((nightsRes.data ?? []).map((n: any) => [n.service_date, n.service_format]));
  const byDate = new Map<string, StatementNight>();
  for (const o of (ordersRes.data ?? []) as any[]) {
    let n = byDate.get(o.service_date);
    if (!n) {
      n = {
        service_date: o.service_date, kind: nightKind(o.service_date), format: 'none',
        rooms: 0, covers: 0, sales_cents: 0, charged_cents: 0, commission_cents: 0, due: o.service_date < today,
      };
      byDate.set(o.service_date, n);
    }
    n.rooms += 1;
    n.covers += o.cover_count ?? 0;
    n.sales_cents += o.total_cents ?? 0;
    if (o.payment_status === 'charged') n.charged_cents += o.total_cents ?? 0;
  }
  const nights = [...byDate.values()].sort((a, b) => a.service_date.localeCompare(b.service_date));
  for (const n of nights) {
    const f = formats.get(n.service_date);
    n.format = f === 'onsite' || f === 'delivered' ? f : n.covers >= MIN_COVERS_ONSITE ? 'onsite' : 'delivered';
    n.commission_cents = n.due ? Math.round((n.sales_cents * PARTNER_COMMISSION_BPS) / 10000) : 0;
  }

  const due = nights.filter((n) => n.due);
  const future = nights.filter((n) => !n.due);
  const sum = (arr: StatementNight[], k: keyof StatementNight) => arr.reduce((s, n) => s + (n[k] as number), 0);

  return {
    month, from, to, commission_bps: PARTNER_COMMISSION_BPS, nights,
    totals: {
      rooms: sum(due, 'rooms'), covers: sum(due, 'covers'), sales_cents: sum(due, 'sales_cents'),
      charged_cents: sum(due, 'charged_cents'), commission_cents: sum(due, 'commission_cents'),
    },
    upcoming: { nights: future.length, covers: sum(future, 'covers'), sales_cents: sum(future, 'sales_cents') },
  };
}

export function statementCsv(st: Statement): string {
  const eur = (c: number) => (c / 100).toFixed(2);
  const rows = [
    ['service_date', 'weekday', 'kind', 'format', 'rooms', 'covers', 'sales_eur', 'charged_eur', 'commission_eur', 'status'].join(';'),
    ...st.nights.map((n) => [
      n.service_date,
      new Date(n.service_date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short' }),
      n.kind, n.format, n.rooms, n.covers, eur(n.sales_cents), eur(n.charged_cents), eur(n.commission_cents),
      n.due ? 'served' : 'upcoming',
    ].join(';')),
    '',
    ['TOTAL DUE', '', '', '', st.totals.rooms, st.totals.covers, eur(st.totals.sales_cents), eur(st.totals.charged_cents), eur(st.totals.commission_cents), `${st.commission_bps / 100} % commission`].join(';'),
  ];
  return rows.join('\n');
}
