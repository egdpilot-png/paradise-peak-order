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
    .select('id, service_date, service_type, title, title_fr, subtitle, subtitle_fr')
    .eq('service_date', serviceDate)
    .eq('is_published', true)
    .maybeSingle();

  if (mErr || !menu) return null;

  const { data: items } = await sbService()
    .from('menu_items')
    .select('*')
    .eq('menu_id', menu.id)
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
  choices: { menuItemId: string; course: string }[];
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
    await svc.from('order_items').insert(
      input.choices.map((c) => ({
        order_id: orderId,
        menu_item_id: c.menuItemId,
        course: c.course,
        quantity: input.coverCount,
      })),
    );
  }

  const full = await loadOrderForRoomDate(input.room, input.serviceDate);
  if (!full) throw new Error('order reload failed');
  return full;
}
