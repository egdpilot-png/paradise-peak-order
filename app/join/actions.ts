'use server';

// Self-registration from the property QR code or the link in the booking
// confirmation email. Creates the guest row and issues a stay token.

import { redirect } from 'next/navigation';
import { sbService } from '@/lib/supabase';
import { issueStayToken } from '@/lib/token';
import { todayInMarigot } from '@/lib/time';

const TERMS_VERSION = '2026-11-02-v0.1';

const VALID_FLAGS = new Set([
  'vegetarian', 'vegan', 'gluten_free', 'dairy_free',
  'nut_allergy', 'shellfish_allergy', 'pescatarian',
  'halal', 'kosher', 'no_pork', 'no_alcohol', 'other',
]);

export type JoinResult = { ok: false; error: string; field?: string };

export async function registerGuest(_prev: JoinResult | null, formData: FormData): Promise<JoinResult> {
  const lang = String(formData.get('lang') || 'en') === 'fr' ? 'fr' : 'en';
  const t = (en: string, fr: string) => (lang === 'fr' ? fr : en);

  const name = String(formData.get('guest_name') || '').trim();
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const phone = String(formData.get('phone') || '').trim();
  const room = String(formData.get('room') || '').trim();
  const bookingRef = String(formData.get('booking_ref') || '').trim() || null;
  const checkIn = String(formData.get('check_in') || '').trim();
  const checkOut = String(formData.get('check_out') || '').trim();
  const partySize = Math.min(8, Math.max(1, Number(formData.get('party_size') || 2)));
  const flags = formData.getAll('dietary_flags').map(String).filter((f) => VALID_FLAGS.has(f));
  const allergyNotes = String(formData.get('allergy_notes') || '').trim() || null;
  const accepted = formData.get('accept_terms') === 'on';
  const source = String(formData.get('src') || 'qr') === 'email' ? 'email_link' : 'qr';

  if (name.length < 2) return { ok: false, field: 'guest_name', error: t('Please enter your name.', 'Merci d\u2019indiquer votre nom.') };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, field: 'email', error: t('Please enter a valid email address.', 'Merci d\u2019indiquer une adresse e-mail valide.') };
  if (phone.replace(/\D/g, '').length < 8) return { ok: false, field: 'phone', error: t('Please enter a mobile number with country code.', 'Merci d\u2019indiquer un numéro de mobile avec l\u2019indicatif.') };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) return { ok: false, field: 'check_in', error: t('Please enter your arrival and departure dates.', 'Merci d\u2019indiquer vos dates d\u2019arrivée et de départ.') };
  if (checkOut <= checkIn) return { ok: false, field: 'check_out', error: t('Departure must be after arrival.', 'Le départ doit être après l\u2019arrivée.') };
  if (checkOut < todayInMarigot()) return { ok: false, field: 'check_out', error: t('This stay is already over.', 'Ce séjour est déjà terminé.') };
  if (!accepted) return { ok: false, field: 'accept_terms', error: t('Please accept the service conditions.', 'Merci d\u2019accepter les conditions du service.') };

  const sb = sbService();

  // Same email + same arrival date → update rather than duplicate.
  const { data: existing } = await sb
    .from('guests')
    .select('id, room_number')
    .eq('email', email)
    .eq('check_in', checkIn)
    .maybeSingle();

  let guestId: string;
  let roomKey: string;

  if (existing?.id) {
    guestId = existing.id;
    roomKey = room || existing.room_number;
    const { error } = await sb.from('guests').update({
      guest_name: name, phone, whatsapp_number: phone, room_number: roomKey, booking_ref: bookingRef,
      check_out: checkOut, party_size: partySize, dietary_flags: flags, allergy_notes: allergyNotes,
      language: lang, terms_accepted_at: new Date().toISOString(), terms_version: TERMS_VERSION,
    }).eq('id', guestId);
    if (error) return { ok: false, error: error.message };
  } else {
    // Room may be unknown before arrival: use a provisional key the kitchen can replace.
    const { data, error } = await sb.from('guests').insert({
      guest_name: name, email, phone, whatsapp_number: phone,
      room_number: room || 'TBA', booking_ref: bookingRef,
      check_in: checkIn, check_out: checkOut, party_size: partySize,
      dietary_flags: flags, allergy_notes: allergyNotes, language: lang,
      source, terms_accepted_at: new Date().toISOString(), terms_version: TERMS_VERSION,
      notify_preferences: ['email', 'whatsapp'],
    }).select('id').single();
    if (error || !data) return { ok: false, error: error?.message ?? 'insert failed' };
    guestId = data.id;
    roomKey = room || `G-${guestId.slice(0, 6).toUpperCase()}`;
    if (!room) await sb.from('guests').update({ room_number: roomKey }).eq('id', guestId);
  }

  const token = issueStayToken(guestId, roomKey, checkOut);
  redirect(`/my/${token}?welcome=1`);
}
