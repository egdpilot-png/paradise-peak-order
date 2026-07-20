// Server-only data-access for the property-owner dashboard.
// Pulls from Supabase views defined in paradise_peak_schema.sql:
//   v_covers_by_date, v_course_tally, v_allergy_matrix, v_the_book
// plus a few ad-hoc queries.

import { createClient } from '@supabase/supabase-js';
import 'server-only';
import type {
  Guest,
  Menu,
  Order,
  DietaryFlag,
  CourseType,
  ServiceType,
} from './types';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function admin() {
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

// ----------------------------------------------------------------------
// Public types returned to the dashboard page
// ----------------------------------------------------------------------

export interface TonightSummary {
  serviceDate: string;               // 'YYYY-MM-DD'
  serviceType: ServiceType | null;   // null if no menu published
  menu: Menu | null;
  guestsInHouse: number;
  coversConfirmed: number;
  ordersReceived: number;
  roomsOccupied: number;
  roomsSubmitted: number;
  roomsMissing: number;
  roomsChefsChoice: number;
  publishedAt: string | null;
  lockedAt: string | null;
  windowState: 'not_yet_open' | 'open' | 'late' | 'past_hard_lock' | 'past_service';
}

export interface CourseTallyRow {
  course: CourseType;
  menu_item_id: string;
  name: string;
  name_fr: string | null;
  count: number;
  covers: number; // count multiplied by cover_count where applicable
}

export interface AllergyRow {
  flag: DietaryFlag | 'note';
  label: string;          // human-readable
  guests: {
    guest_id: string;
    room: string;
    guest_name: string | null;
    allergy_notes: string | null;
    order_id: string | null;
    conflict: boolean;    // true if this guest ordered a dish flagged with this allergen
    conflict_dishes: string[];
  }[];
}

export type RoomStatus =
  | 'submitted'
  | 'buffet_confirmed'
  | 'pending'
  | 'chefs_choice'
  | 'late_window'
  | 'no_order';

export interface RoomRow {
  room: string;
  guest_id: string | null;
  guest_name: string | null;
  language: 'en' | 'fr';
  party_size: number;
  dietary_flags: DietaryFlag[];
  allergy_notes: string | null;
  status: RoomStatus;
  order_ref: string | null;
  order_id: string | null;
  cover_count: number | null;
  courses: { course: CourseType; dish_name: string }[];
  notes: string | null;
  last_updated: string | null;
}

// ----------------------------------------------------------------------
// Queries
// ----------------------------------------------------------------------

export async function loadTonightSummary(date: string): Promise<TonightSummary> {
  const sb = admin();

  const [menuRes, guestsRes, ordersRes, publishRes] = await Promise.all([
    sb.from('menus').select('*, menu_items(*)').eq('service_date', date).maybeSingle(),
    sb.rpc('guests_in_house', { d: date }),
    sb.from('orders').select('id, room_number, status, cover_count').eq('service_date', date),
    sb.from('menu_publish_log').select('*').eq('service_date', date).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const menu: Menu | null = menuRes.data ? {
    id: menuRes.data.id,
    service_date: menuRes.data.service_date,
    service_type: menuRes.data.service_type,
    title: menuRes.data.title,
    title_fr: menuRes.data.title_fr,
    subtitle: menuRes.data.subtitle,
    subtitle_fr: menuRes.data.subtitle_fr,
    items: menuRes.data.menu_items ?? [],
  } : null;

  const guests = (guestsRes.data ?? []) as any[];
  const orders = (ordersRes.data ?? []) as any[];

  const roomsOccupied = guests.length;
  const submittedOrders = orders.filter(o => o.status === 'submitted' || o.status === 'locked' || o.status === 'delivered');
  const chefsChoice = orders.filter(o => o.status === 'chefs_choice');

  const coversConfirmed = submittedOrders.reduce((s, o) => s + (o.cover_count ?? 0), 0)
    + chefsChoice.reduce((s, o) => s + (o.cover_count ?? 0), 0);

  return {
    serviceDate: date,
    serviceType: menu?.service_type ?? null,
    menu,
    guestsInHouse: guests.reduce((s, g) => s + (g.party_size ?? 1), 0),
    coversConfirmed,
    ordersReceived: submittedOrders.length,
    roomsOccupied,
    roomsSubmitted: submittedOrders.length,
    roomsMissing: Math.max(0, roomsOccupied - submittedOrders.length - chefsChoice.length),
    roomsChefsChoice: chefsChoice.length,
    publishedAt: publishRes.data?.created_at ?? null,
    lockedAt: publishRes.data?.locked_at ?? null,
    windowState: computeWindow(date),
  };
}

export async function loadCourseTally(date: string): Promise<CourseTallyRow[]> {
  const sb = admin();
  const { data, error } = await sb
    .from('v_course_tally')
    .select('*')
    .eq('service_date', date)
    .order('course')
    .order('count', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CourseTallyRow[];
}

export async function loadAllergyMatrix(date: string): Promise<AllergyRow[]> {
  const sb = admin();
  const { data, error } = await sb
    .from('v_allergy_matrix')
    .select('*')
    .eq('service_date', date);
  if (error) throw error;

  // The view returns one row per (flag, guest); we group by flag here.
  const byFlag = new Map<string, AllergyRow>();
  for (const row of (data ?? []) as any[]) {
    const key = row.flag;
    if (!byFlag.has(key)) {
      byFlag.set(key, {
        flag: key,
        label: prettyFlag(key),
        guests: [],
      });
    }
    byFlag.get(key)!.guests.push({
      guest_id: row.guest_id,
      room: row.room_number,
      guest_name: row.guest_name,
      allergy_notes: row.allergy_notes,
      order_id: row.order_id ?? null,
      conflict: Boolean(row.conflict),
      conflict_dishes: row.conflict_dishes ?? [],
    });
  }

  // Priority: allergies with conflicts first, then by guest count desc
  return [...byFlag.values()].sort((a, b) => {
    const ac = a.guests.filter(g => g.conflict).length;
    const bc = b.guests.filter(g => g.conflict).length;
    if (ac !== bc) return bc - ac;
    return b.guests.length - a.guests.length;
  });
}

export async function loadRoomRows(date: string): Promise<RoomRow[]> {
  const sb = admin();
  const { data, error } = await sb
    .from('v_the_book')
    .select('*')
    .eq('service_date', date)
    .order('room_number');
  if (error) throw error;
  return ((data ?? []) as any[]).map(mapRoomRow);
}

// ----------------------------------------------------------------------
// Actions
// ----------------------------------------------------------------------

export async function markChefsChoiceForMissing(date: string): Promise<number> {
  const sb = admin();
  const { data: guests, error: gErr } = await sb.rpc('guests_in_house', { d: date });
  if (gErr) throw gErr;

  const { data: existing, error: eErr } = await sb
    .from('orders')
    .select('room_number')
    .eq('service_date', date);
  if (eErr) throw eErr;

  const covered = new Set((existing ?? []).map((o: any) => o.room_number));
  const missing = (guests ?? []).filter((g: any) => !covered.has(g.room_number));

  if (missing.length === 0) return 0;

  const rows = missing.map((g: any) => ({
    room_number: g.room_number,
    guest_id: g.guest_id,
    service_date: date,
    status: 'chefs_choice',
    cover_count: g.party_size ?? 1,
    entry_channel: 'chefs_choice',
    notes: 'Auto-assigned by kitchen after 14:00 hard lock',
  }));

  const { error } = await sb.from('orders').insert(rows);
  if (error) throw error;
  return rows.length;
}

export async function lockOrders(date: string): Promise<number> {
  const sb = admin();
  const { data, error } = await sb.rpc('lock_orders_for_date', { d: date });
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function buildWhatsAppDigest(date: string): Promise<string> {
  const summary = await loadTonightSummary(date);
  const rooms = await loadRoomRows(date);
  const allergies = await loadAllergyMatrix(date);

  const lines: string[] = [];
  lines.push(`*Paradise Peak · ${formatDateShort(date)}*`);
  lines.push(`Service 18:00 — ${summary.coversConfirmed} covers, ${summary.roomsSubmitted}/${summary.roomsOccupied} rooms in.`);
  lines.push('');

  const submitted = rooms.filter(r => r.status === 'submitted' || r.status === 'buffet_confirmed');
  for (const r of submitted) {
    const dishes = r.courses.map(c => c.dish_name).join(' · ');
    const flags = r.dietary_flags.length ? ` (${r.dietary_flags.join(', ')})` : '';
    lines.push(`*Room ${r.room}* × ${r.cover_count}${flags}`);
    if (dishes) lines.push(`  ${dishes}`);
    if (r.notes) lines.push(`  _Note: ${r.notes}_`);
    lines.push('');
  }

  const chefs = rooms.filter(r => r.status === 'chefs_choice');
  if (chefs.length) {
    lines.push(`*Chef's choice:* ${chefs.map(r => `Room ${r.room}×${r.cover_count}`).join(', ')}`);
    lines.push('');
  }

  const critical = allergies.filter(a => a.guests.some(g => g.conflict));
  if (critical.length) {
    lines.push('*⚠️ Allergy alerts*');
    for (const a of critical) {
      const gs = a.guests.filter(g => g.conflict).map(g => `Room ${g.room}`).join(', ');
      lines.push(`  ${a.label}: ${gs}`);
    }
  }

  return lines.join('\n');
}

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

function computeWindow(date: string): TonightSummary['windowState'] {
  const now = new Date();
  const [Y, M, D] = date.split('-').map(Number);
  // service date at America/Marigot midnight is UTC 04:00
  const cutoff10 = new Date(Date.UTC(Y, M - 1, D, 14, 0)); // 10:00 local = 14:00 UTC
  const hardLock14 = new Date(Date.UTC(Y, M - 1, D, 18, 0)); // 14:00 local = 18:00 UTC
  const service22 = new Date(Date.UTC(Y, M - 1, D, 26 % 24, 0)); // 22:00 local = 02:00 UTC next day
  service22.setUTCDate(service22.getUTCDate() + 1);

  if (now < new Date(Date.UTC(Y, M - 1, D - 1, 10, 0))) return 'not_yet_open';
  if (now < cutoff10) return 'open';
  if (now < hardLock14) return 'late';
  if (now < service22) return 'past_hard_lock';
  return 'past_service';
}

const FLAG_LABELS: Record<string, string> = {
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  gluten_free: 'Gluten-free',
  dairy_free: 'Dairy-free',
  nut_allergy: 'Nut allergy',
  shellfish_allergy: 'Shellfish allergy',
  fish_allergy: 'Fish allergy',
  egg_allergy: 'Egg allergy',
  halal: 'Halal',
  kosher: 'Kosher',
  pescatarian: 'Pescatarian',
  low_sodium: 'Low sodium',
  no_pork: 'No pork',
  no_alcohol: 'No alcohol',
  note: 'Free-text note',
};
function prettyFlag(f: string): string {
  return FLAG_LABELS[f] ?? f.replace(/_/g, ' ');
}

function formatDateShort(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
}

function mapRoomRow(r: any): RoomRow {
  return {
    room: r.room_number,
    guest_id: r.guest_id,
    guest_name: r.guest_name,
    language: (r.language ?? 'en') as 'en' | 'fr',
    party_size: r.party_size ?? 1,
    dietary_flags: r.dietary_flags ?? [],
    allergy_notes: r.allergy_notes,
    status: (r.derived_status ?? 'no_order') as RoomStatus,
    order_ref: r.order_ref,
    order_id: r.order_id,
    cover_count: r.cover_count,
    courses: r.courses ?? [],
    notes: r.notes,
    last_updated: r.last_updated,
  };
}
