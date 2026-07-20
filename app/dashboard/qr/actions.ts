'use server';

import { createClient } from '@supabase/supabase-js';
import { issueTokenForStay } from '@/lib/token';
import { getDashboardUser, canAct } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || 'https://menu.piratebynight.com';

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });
}

export type IssueResult =
  | {
      ok: true;
      room: string;
      guest_name: string | null;
      check_in: string;
      check_out: string;
      language: string;
      party_size: number;
      dietary_flags: string[];
      allergy_notes: string | null;
      token: string;
      order_url: string;
      guest_id: string | null;
    }
  | { ok: false; error: string };

export async function issueQrForRoom(formData: FormData): Promise<IssueResult> {
  const user = await getDashboardUser();
  if (!canAct(user, 'kitchen_action')) {
    return { ok: false, error: 'Not authorized' };
  }

  const room = String(formData.get('room') || '').trim();
  const guestName = String(formData.get('guest_name') || '').trim() || null;
  const checkIn = String(formData.get('check_in') || '').trim();
  const checkOut = String(formData.get('check_out') || '').trim();
  const language = String(formData.get('language') || 'en').trim();
  const partySize = Math.max(1, Number(formData.get('party_size') || 2));
  const flagsRaw = String(formData.get('dietary_flags') || '').trim();
  const allergyNotes =
    String(formData.get('allergy_notes') || '').trim() || null;

  if (!room) return { ok: false, error: 'Room number is required' };
  if (!checkIn) return { ok: false, error: 'Check-in date is required' };
  if (!checkOut) return { ok: false, error: 'Check-out date is required' };
  if (checkOut <= checkIn)
    return { ok: false, error: 'Check-out must be after check-in' };

  const dietary_flags = flagsRaw
    ? flagsRaw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    : [];

  const sb = admin();

  // Upsert the guest row by (room_number, check_in) so re-running
  // for the same stay updates in place.
  const { data: existing } = await sb
    .from('guests')
    .select('id')
    .eq('room_number', room)
    .eq('check_in', checkIn)
    .maybeSingle();

  let guestId: string | null = existing?.id ?? null;

  if (guestId) {
    const { error } = await sb
      .from('guests')
      .update({
        guest_name: guestName,
        check_out: checkOut,
        language,
        party_size: partySize,
        dietary_flags,
        allergy_notes: allergyNotes,
      })
      .eq('id', guestId);
    if (error) return { ok: false, error: `Update guest: ${error.message}` };
  } else {
    const { data, error } = await sb
      .from('guests')
      .insert({
        room_number: room,
        guest_name: guestName,
        check_in: checkIn,
        check_out: checkOut,
        language,
        party_size: partySize,
        dietary_flags,
        allergy_notes: allergyNotes,
      })
      .select('id')
      .single();
    if (error) return { ok: false, error: `Insert guest: ${error.message}` };
    guestId = data.id;
  }

  const token = issueTokenForStay(room, checkOut, guestId ?? undefined);
  const order_url = `${APP_URL}/order/${token}`;

  revalidatePath('/dashboard/tonight');
  revalidatePath('/dashboard/qr');

  return {
    ok: true,
    room,
    guest_name: guestName,
    check_in: checkIn,
    check_out: checkOut,
    language,
    party_size: partySize,
    dietary_flags,
    allergy_notes: allergyNotes,
    token,
    order_url,
    guest_id: guestId,
  };
}
