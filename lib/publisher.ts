// Server-only data layer for the weekend-menu publisher.
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
  items: Array<{ dish_library_id: string; sort_order: number }>;
}

export interface PublishResult {
  service_date: string;
  menu_id: string;
  guests_notified: number;
}

export interface WeekendContext {
  saturday: string;
  sunday: string;
  guestsThisWeekend: number;
  languageBreakdown: { en: number; fr: number };
  existingSat: LoadedMenu | null;
  existingSun: LoadedMenu | null;
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
  const { data, error } = await sb
    .from('menus')
    .select('*, menu_items(dish_library_id, course, name, sort_order)')
    .eq('service_date', date)
    .in('status', ['draft', 'published'])
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    service_date: data.service_date,
    service_type: data.service_type,
    title: data.title,
    title_fr: data.title_fr,
    subtitle: data.subtitle,
    subtitle_fr: data.subtitle_fr,
    status: data.status,
    published_at: data.published_at,
    items: (data.menu_items ?? []).sort(
      (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
    ),
  };
}

export async function loadWeekendContext(saturday: string): Promise<WeekendContext> {
  const [Y, M, D] = saturday.split('-').map(Number);
  const sun = new Date(Date.UTC(Y, M - 1, D + 1));
  const sunday = sun.toISOString().slice(0, 10);

  const sb = admin();
  const [lib, sat, sunM, guestsRes] = await Promise.all([
    loadDishLibrary(),
    loadMenuForDate(saturday),
    loadMenuForDate(sunday),
    sb().from('guests')
      .select('id, language')
      .lte('check_in', sunday)
      .gt('check_out', saturday),
  ]);

  const guests = (guestsRes.data ?? []) as any[];
  const breakdown = { en: 0, fr: 0 };
  for (const g of guests) {
    if (g.language === 'fr') breakdown.fr += 1;
    else breakdown.en += 1;
  }

  return {
    saturday,
    sunday,
    guestsThisWeekend: guests.length,
    languageBreakdown: breakdown,
    existingSat: sat,
    existingSun: sunM,
    dishLibrary: lib,
  };
}

// -------- Actions --------

export async function saveDraft(draft: MenuDraft, actor: string): Promise<string> {
  const sb = admin();

  // Delete any existing draft for this date
  await sb().from('menus').delete().eq('service_date', draft.service_date).eq('status', 'draft');

  const { data, error } = await sb
    .from('menus')
    .insert({
      service_date: draft.service_date,
      service_type: draft.service_type,
      title: draft.title,
      title_fr: draft.title_fr,
      subtitle: draft.subtitle,
      subtitle_fr: draft.subtitle_fr,
      status: 'draft',
      published_by: actor,
      dish_library_ids: draft.items.map(i => i.dish_library_id),
    })
    .select('id')
    .single();
  if (error) throw error;
  const menuId = data.id;

  if (draft.items.length) {
    // Snapshot dishes into menu_items
    const { data: lib, error: lErr } = await sb
      .from('dish_library')
      .select('*')
      .in('id', draft.items.map(i => i.dish_library_id));
    if (lErr) throw lErr;
    const byId = new Map((lib ?? []).map((d: any) => [d.id, d]));

    const rows = draft.items.map((it) => {
      const d = byId.get(it.dish_library_id);
      if (!d) throw new Error(`dish ${it.dish_library_id} not in library`);
      return {
        menu_id: menuId,
        dish_library_id: d.id,
        course: d.course,
        name: d.name,
        name_fr: d.name_fr,
        description: d.description,
        description_fr: d.description_fr,
        allergens: d.allergens ?? [],
        sort_order: it.sort_order,
      };
    });
    const { error: iErr } = await sb().from('menu_items').insert(rows);
    if (iErr) throw iErr;
  }

  return menuId;
}

export async function publishWeekend(
  drafts: MenuDraft[],
  actor: string,
): Promise<PublishResult[]> {
  const sb = admin();
  const { data, error } = await sb().rpc('publish_weekend_menus', {
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

export function nextWeekend(from?: Date): { saturday: string; sunday: string } {
  const now = from ?? new Date();
  // Convert to Marigot (UTC-4)
  const local = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  const dow = local.getUTCDay();       // 0 Sun … 6 Sat
  const daysToSat = (6 - dow + 7) % 7 || 7;
  const sat = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + daysToSat));
  const sun = new Date(sat.getTime() + 86400000);
  return {
    saturday: sat.toISOString().slice(0, 10),
    sunday: sun.toISOString().slice(0, 10),
  };
}
