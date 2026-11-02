// Server-only data layer for the weekly menu publisher (Mon–Sat).
// Talks to dish_library, menus, menu_items, guest_notifications.

import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { CourseType, ServiceType, DietaryFlag } from './types';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
function admin() {
  return createClient(url, service, { auth: { persistSession: false } });
}

// -------- Types --------

export interface DishLibraryItem {
  id: string;
  name: string;
  name_fr: string | null;
  description: string | null;
  description_fr: string | null;
  course: CourseType;
  tags: string[];
  allergens: string[];
  dietary_ok: DietaryFlag[];
  cost_est_eur: number | null;
  price_eur: number | null;
  photo_url: string | null;
  active: boolean;
  times_served: number;
  last_served_on: string | null;
}

export interface MenuDraft {
  service_date: string;      // 'YYYY-MM-DD'
  service_type: ServiceType;
  title: string;
  title_fr: string | null;
  subtitle: string | null;
  subtitle_fr: string | null;
  cover_price_cents?: number | null;   // buffet nights only
  items: Array<{ dish_library_id: string; sort_order: number }>;
}

export interface PublishResult {
  service_date: string;
  menu_id: string;
  guests_notified: number;
}

/** Season 2026/27: one menu per service night, Monday to Saturday. */
export interface WeekContext {
  monday: string;
  dates: string[];                       // Mon..Sat (6)
  existing: Record<string, LoadedMenu | null>;
  guestsThisWeek: number;
  languageBreakdown: { en: number; fr: number };
  dishLibrary: DishLibraryItem[];
}

export interface LoadedMenu {
  id: string;
  service_date: string;
  service_type: ServiceType;
  title: string;
  title_fr: string | null;
  subtitle: string | null;
  subtitle_fr: string | null;
  status: 'draft' | 'published' | 'superseded';
  published_at: string | null;
  cover_price_cents?: number | null;
  items: Array<{
    dish_library_id: string;
    course: CourseType;
    name: string;
    sort_order: number;
  }>;
}

// -------- Queries --------

export async function loadDishLibrary(): Promise<DishLibraryItem[]> {
  const sb = admin();
  const { data, error } = await sb
    .from('dish_library')
    .select('*')
    .eq('active', true)
    .order('times_served', { ascending: false })
    .order('name');
  if (error) throw error;
  return (data ?? []) as DishLibraryItem[];
}

export async function loadMenuForDate(date: string): Promise<LoadedMenu | null> {
  const sb = admin();
  const [draftRes, menuRes] = await Promise.all([
    sb.from('menu_drafts').select('payload, updated_at').eq('service_date', date).maybeSingle(),
    sb.from('menus')
      .select('*, menu_items(dish_library_id, course, name, sort_order, is_active)')
      .eq('service_date', date)
      .maybeSingle(),
  ]);
  if (draftRes.error) throw draftRes.error;
  if (menuRes.error) throw menuRes.error;

  if (draftRes.data) {
    const d = draftRes.data.payload as MenuDraft;
    const ids = d.items.map(i => i.dish_library_id);
    const { data: lib } = ids.length
      ? await sb.from('dish_library').select('id, course, name').in('id', ids)
      : { data: [] as any[] };
    const byId = new Map((lib ?? []).map((x: any) => [x.id, x]));
    return {
      id: menuRes.data?.id ?? 'draft',
      service_date: date,
      service_type: d.service_type,
      title: d.title,
      title_fr: d.title_fr,
      subtitle: d.subtitle,
      subtitle_fr: d.subtitle_fr,
      status: 'draft',
      published_at: menuRes.data?.published_at ?? null,
      cover_price_cents: d.cover_price_cents ?? null,
      items: [...d.items].sort((a, b) => a.sort_order - b.sort_order).flatMap(i => {
        const x = byId.get(i.dish_library_id);
        return x ? [{ dish_library_id: i.dish_library_id, course: x.course, name: x.name, sort_order: i.sort_order }] : [];
      }),
    };
  }

  const data = menuRes.data;
  if (!data || !data.is_published) return null;
  return {
    id: data.id,
    service_date: data.service_date,
    service_type: data.service_type,
    title: data.title,
    title_fr: data.title_fr,
    subtitle: data.subtitle,
    subtitle_fr: data.subtitle_fr,
    status: 'published',
    published_at: data.published_at,
    cover_price_cents: data.cover_price_cents ?? null,
    items: (data.menu_items ?? [])
      .filter((i: any) => i.is_active !== false)
      .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
  };
}

// -------- Actions --------

export async function saveDraft(draft: MenuDraft, actor: string): Promise<string> {
  const sb = admin();
  const { error } = await sb
    .from('menu_drafts')
    .upsert({ service_date: draft.service_date, payload: draft, actor, updated_at: new Date().toISOString() });
  if (error) throw error;
  return draft.service_date;
}

export async function publishWeekend(
  drafts: MenuDraft[],
  actor: string,
): Promise<PublishResult[]> {
  const sb = admin();
  const { data, error } = await sb.rpc('publish_weekend_menus', {
    p_menus: drafts,
    p_actor: actor,
  });
  if (error) throw error;
  return (data ?? []) as PublishResult[];
}

export async function upsertDish(dish: Partial<DishLibraryItem> & { name: string; course: CourseType }): Promise<DishLibraryItem> {
  const sb = admin();
  const { data, error } = await sb
    .from('dish_library')
    .upsert({
      id: dish.id,
      name: dish.name,
      name_fr: dish.name_fr ?? null,
      description: dish.description ?? null,
      description_fr: dish.description_fr ?? null,
      course: dish.course,
      tags: dish.tags ?? [],
      allergens: dish.allergens ?? [],
      dietary_ok: dish.dietary_ok ?? [],
      cost_est_eur: dish.cost_est_eur ?? null,
      price_eur: dish.price_eur ?? null,
      photo_url: dish.photo_url ?? null,
      active: dish.active ?? true,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as DishLibraryItem;
}

// -------- Utility for the client --------



export async function loadWeekContext(monday: string): Promise<WeekContext> {
  const [Y, M, D] = monday.split('-').map(Number);
  const dates = Array.from({ length: 6 }, (_, i) => new Date(Date.UTC(Y, M - 1, D + i)).toISOString().slice(0, 10));
  const sunday = new Date(Date.UTC(Y, M - 1, D + 6)).toISOString().slice(0, 10);

  const sb = admin();
  const [lib, guestsRes, ...menus] = await Promise.all([
    loadDishLibrary(),
    sb.from('guests').select('id, language').lte('check_in', sunday).gt('check_out', monday),
    ...dates.map((d) => loadMenuForDate(d)),
  ]);

  const guests = (guestsRes.data ?? []) as any[];
  const breakdown = { en: 0, fr: 0 };
  for (const g of guests) { if (g.language === 'fr') breakdown.fr += 1; else breakdown.en += 1; }

  const existing: Record<string, LoadedMenu | null> = {};
  dates.forEach((d, i) => { existing[d] = (menus[i] as LoadedMenu | null) ?? null; });

  return { monday, dates, existing, guestsThisWeek: guests.length, languageBreakdown: breakdown, dishLibrary: lib };
}

/** Monday of the week to edit by default: this week until Saturday 10:00, then next week. */
export function defaultMonday(): string {
  const now = new Date();
  const local = new Date(now.toLocaleString('en-US', { timeZone: 'America/Marigot' }));
  const wd = local.getDay(); // 0 Sun .. 6 Sat
  const toMonday = wd === 0 ? -6 : 1 - wd;
  const monday = new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate() + toMonday));
  if (wd === 0 || (wd === 6 && local.getHours() >= 10)) monday.setUTCDate(monday.getUTCDate() + 7);
  return monday.toISOString().slice(0, 10);
}


export interface SeasonPublishResult {
  weeks: number;
  published: number;
  skippedExisting: number;
  skippedPast: number;
  firstDate: string | null;
  lastDate: string | null;
}

/**
 * Repeat a week's drafts for every week from `monday` until `until` (inclusive).
 * Nights before today are never touched. Nights that already have a published
 * menu are left alone unless `overwrite` is true.
 */
export async function publishSeason(
  drafts: MenuDraft[],
  monday: string,
  until: string,
  actor: string,
  overwrite = false,
): Promise<SeasonPublishResult> {
  const sb = admin();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Marigot', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const shift = (iso: string, days: number) => {
    const d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };

  // Build every candidate night
  const candidates: MenuDraft[] = [];
  let weeks = 0;
  for (let w = 0; ; w++) {
    const weekMonday = shift(monday, 7 * w);
    if (weekMonday > until) break;
    weeks += 1;
    for (const d of drafts) {
      const offset = Math.round((Date.parse(d.service_date + 'T12:00:00Z') - Date.parse(monday + 'T12:00:00Z')) / 86400000);
      const date = shift(weekMonday, offset);
      if (date > until) continue;
      candidates.push({ ...d, service_date: date });
    }
    if (w > 60) break; // safety: ~14 months
  }

  const skippedPast = candidates.filter((c) => c.service_date < today).length;
  let todo = candidates.filter((c) => c.service_date >= today);

  let skippedExisting = 0;
  if (!overwrite && todo.length) {
    const { data: existing } = await sb
      .from('menus')
      .select('service_date')
      .eq('is_published', true)
      .gte('service_date', todo[0].service_date)
      .lte('service_date', until);
    const have = new Set((existing ?? []).map((m: any) => m.service_date));
    skippedExisting = todo.filter((c) => have.has(c.service_date)).length;
    todo = todo.filter((c) => !have.has(c.service_date));
  }

  // Publish in chunks of ~4 weeks per call
  const CHUNK = 24;
  for (let i = 0; i < todo.length; i += CHUNK) {
    const { error } = await sb.rpc('publish_weekend_menus', { p_menus: todo.slice(i, i + CHUNK), p_actor: actor });
    if (error) throw error;
  }

  return {
    weeks,
    published: todo.length,
    skippedExisting,
    skippedPast,
    firstDate: todo[0]?.service_date ?? null,
    lastDate: todo[todo.length - 1]?.service_date ?? null,
  };
}
