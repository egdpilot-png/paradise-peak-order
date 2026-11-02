// Two Supabase clients:
//   • `sb`         — anon client, safe for public reads of published menus
//   • `sbService`  — service-role client, server-only, bypasses RLS
//
// We only ever create `sbService` inside server code (route handlers,
// server components). Never import it into a client component.

import { createClient } from '@supabase/supabase-js';
import type { Menu, MenuItem, Order, OrderItem, Guest } from './types';

// Lazy client factories — we do NOT create clients at module import time so
// that Next's build phase (which runs without env vars) doesn't crash.

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

let _sb: ReturnType<typeof createClient> | null = null;
export function sb() {
  if (!_sb) {
    _sb = createClient(
      envOrThrow('NEXT_PUBLIC_SUPABASE_URL'),
      envOrThrow('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    );
  }
  return _sb;
}

export function sbService() {
  return createClient(
    envOrThrow('NEXT_PUBLIC_SUPABASE_URL'),
    envOrThrow('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// -------------------- Reads --------------------

export async function loadMenuForDate(serviceDate: string): Promise<Menu | null> {
  const { data: menu, error: mErr } = await sbService()
    .from('menus')
    .select('id, service_date, service_type, title, title_fr, subtitle, subtitle_fr, cover_price_cents')
    .eq('service_date', serviceDate)
    .eq('is_published', true)
    .maybeSingle();

  if (mErr || !menu) return null;

  const { data: items } = await sbService()
    .from('menu_items')
    .select('*')
    .eq('menu_id', menu.id)
    .eq('is_active', true)
    .order('course')
    .order('display_order');

  return { ...menu, items: (items ?? []) as MenuItem[] } as Menu;
}

export async function loadGuestByRoom(room: string, onDate: string): Promise<Guest | null> {
  const { data } = await sbService()
    .from('guests')
    .select('*')
    .eq('room_number', room)
    .lte('check_in', onDate)
    .gte('check_out', onDate)
    .order('check_in', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Guest) ?? null;
}

export async function loadOrderForRoomDate(
  room: string,
  serviceDate: string,
): Promise<Order | null> {
  const { data: order } = await sbService()
    .from('orders')
    .select('*')
    .eq('room_number', room)
    .eq('service_date', serviceDate)
    .neq('status', 'cancelled')
    .maybeSingle();

  if (!order) return null;

  const { data: items } = await sbService()
    .from('order_items')
    .select('*')
    .eq('order_id', order.id);

  return { ...order, items: (items ?? []) as OrderItem[] } as Order;
}

// -------------------- Writes --------------------

interface SubmitOrderInput {
  room: string;
  guestId?: string | null;
  menuId: string;
  serviceDate: string;
  coverCount: number;
  notes?: string;
  // One entry per person × course. `seat` is 1-based; omitted seat = 1.
  choices: { menuItemId: string; course: string; seat?: number; note?: string | null }[];
  entryChannel?: 'guest_qr' | 'staff_tablet' | 'whatsapp';
}

export async function upsertOrder(input: SubmitOrderInput): Promise<Order> {
  const svc = sbService();

  // Upsert order (one active per room per date, enforced by DB constraint).
  const { data: existing } = await svc
    .from('orders')
    .select('id')
    .eq('room_number', input.room)
    .eq('service_date', input.serviceDate)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let orderId: string;
  if (existing?.id) {
    orderId = existing.id;
    await svc
      .from('orders')
      .update({
        cover_count: input.coverCount,
        notes: input.notes ?? null,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        cancelled_at: null,
        guest_id: input.guestId ?? null,
        entry_channel: input.entryChannel ?? 'guest_qr',
      })
      .eq('id', orderId);
    // Clear old items — simpler than diffing
    await svc.from('order_items').delete().eq('order_id', orderId);
  } else {
    const { data: created, error } = await svc
      .from('orders')
      .insert({
        room_number: input.room,
        guest_id: input.guestId ?? null,
        menu_id: input.menuId,
        service_date: input.serviceDate,
        cover_count: input.coverCount,
        notes: input.notes ?? null,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        entry_channel: input.entryChannel ?? 'guest_qr',
      })
      .select('id')
      .single();
    if (error || !created) throw error ?? new Error('order insert failed');
    orderId = created.id;
  }

  if (input.choices.length > 0) {
    const { error: iErr } = await svc.from('order_items').insert(
      input.choices.map((c) => ({
        order_id: orderId,
        menu_item_id: c.menuItemId,
        course: c.course,
        seat: c.seat ?? 1,
        quantity: 1,
        guest_note: c.note?.trim() || null,
      })),
    );
    if (iErr) throw iErr;
  }

  // Price the order: buffet = flat cover price × covers; plated = Σ of every chosen plate.
  const total = await computeOrderTotal(input.menuId, input.coverCount, input.choices.map((c) => c.menuItemId));
  await svc.from('orders').update({ total_cents: total }).eq('id', orderId);

  const full = await loadOrderForRoomDate(input.room, input.serviceDate);
  if (!full) throw new Error('order reload failed');
  return full;
}

export async function computeOrderTotal(menuId: string, covers: number, menuItemIds: string[]): Promise<number> {
  const svc = sbService();
  const { data: menu } = await svc.from('menus').select('service_type, cover_price_cents').eq('id', menuId).single();
  if (!menu) return 0;
  if (menu.service_type === 'buffet') return (menu.cover_price_cents ?? 0) * covers;
  if (menuItemIds.length === 0) return 0;
  // menuItemIds may repeat (two guests choosing the same dish): price each occurrence.
  const unique = Array.from(new Set(menuItemIds));
  const { data: items } = await svc.from('menu_items').select('id, price_cents').in('id', unique);
  const price = new Map((items ?? []).map((it: any) => [it.id, it.price_cents ?? 0]));
  return menuItemIds.reduce((acc, id) => acc + (price.get(id) ?? 0), 0);
}

export async function cancelOrder(orderId: string): Promise<void> {
  await sbService()
    .from('orders')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', orderId);
}

// -------------------- Stay-level reads (self-registered guests) --------------------

export async function loadGuestById(id: string): Promise<Guest | null> {
  const { data } = await sbService().from('guests').select('*').eq('id', id).maybeSingle();
  return (data as Guest) ?? null;
}

/** Published menus between two dates (inclusive), without items. */
export async function loadMenusBetween(from: string, to: string): Promise<Menu[]> {
  const { data } = await sbService()
    .from('menus')
    .select('id, service_date, service_type, title, title_fr, subtitle, subtitle_fr, cover_price_cents')
    .eq('is_published', true)
    .gte('service_date', from)
    .lte('service_date', to)
    .order('service_date');
  return ((data ?? []) as any[]).map((m) => ({ ...m, items: [] })) as Menu[];
}

/** All non-cancelled orders for a room between two dates (inclusive), with items. */
export async function loadOrdersForRoomBetween(room: string, from: string, to: string): Promise<Order[]> {
  const svc = sbService();
  const { data: orders } = await svc
    .from('orders')
    .select('*')
    .eq('room_number', room)
    .gte('service_date', from)
    .lte('service_date', to)
    .neq('status', 'cancelled')
    .order('service_date');
  if (!orders || orders.length === 0) return [];
  const ids = orders.map((o: any) => o.id);
  const { data: items } = await svc.from('order_items').select('*').in('order_id', ids);
  return (orders as any[]).map((o) => ({
    ...o,
    items: ((items ?? []) as any[]).filter((i) => i.order_id === o.id),
  })) as Order[];
}
