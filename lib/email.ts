// Transactional guest emails via Resend's REST API (no SDK dependency).
// Every send is best-effort: a missing RESEND_API_KEY or a provider error is
// logged and never blocks the guest flow.
//
// Env:
//   RESEND_API_KEY        — from resend.com (domain piratebynight.com verified)
//   EMAIL_FROM            — default "Dinner at the Peak <contact@piratebynight.com>"
//   EMAIL_REPLY_TO        — default contact@piratebynight.com (Pirate by Night)
//   PARADISE_PEAK_EMAIL   — default contact@theparadisepeak.com (shown in footer)
//   PARADISE_PEAK_CC      — set to "true" to cc Paradise Peak on bookings/cancellations
//                           (off until the service is tested end to end)
//   NEXT_PUBLIC_APP_URL   — default https://menu.piratebynight.com

import { sbService } from './supabase';
import type { Guest, Menu, Order } from './types';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://menu.piratebynight.com';
const FROM = process.env.EMAIL_FROM || 'Dinner at the Peak <contact@piratebynight.com>';
const REPLY_TO = process.env.EMAIL_REPLY_TO || 'contact@piratebynight.com';
export const PARADISE_PEAK_EMAIL = process.env.PARADISE_PEAK_EMAIL || 'contact@theparadisepeak.com';
// Copy Paradise Peak only once explicitly enabled — test phase sends to the guest alone.
const PARTNER_CC: string[] | undefined = process.env.PARADISE_PEAK_CC === 'true' ? [PARADISE_PEAK_EMAIL] : undefined;

type Lang = 'en' | 'fr';

interface Mail { to: string; cc?: string[]; subject: string; html: string; text: string }

export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

async function send(mail: Mail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.info('[email] RESEND_API_KEY not set — skipped:', mail.subject, '→', mail.to); return false; }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [mail.to], cc: mail.cc, reply_to: REPLY_TO, subject: mail.subject, html: mail.html, text: mail.text }),
    });
    if (!res.ok) { console.error('[email] resend error', res.status, await res.text()); return false; }
    return true;
  } catch (err) {
    console.error('[email] send failed', err);
    return false;
  }
}

// -------------------- formatting --------------------

function fmtDate(iso: string, lang: Lang): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
function eur(cents: number): string { return `${(cents / 100).toFixed(2).replace('.00', '')} €`; }
function esc(s: string): string { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string)); }

function layout(lang: Lang, title: string, bodyHtml: string): string {
  const footer = lang === 'fr'
    ? `Dinner at the Peak est assuré par Pirate by Night (SAS ALLEN, Grand Case) pour les hôtes de The Paradise Peak. Questions sur le dîner : ${REPLY_TO}. Questions sur votre séjour : ${PARADISE_PEAK_EMAIL}. <a href="${APP_URL}/terms">Conditions du service</a>.`
    : `Dinner at the Peak is run by Pirate by Night (SAS ALLEN, Grand Case) for guests of The Paradise Peak. Questions about dinner: ${REPLY_TO}. Questions about your stay: ${PARADISE_PEAK_EMAIL}. <a href="${APP_URL}/terms">Service conditions</a>.`;
  return `<!doctype html><html><body style="margin:0;background:#F5F1EA;font-family:Georgia,serif;color:#1C1A17">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
  <p style="letter-spacing:3px;text-transform:uppercase;font-size:11px;color:#B8873F;margin:0 0 6px">Pirate by Night × The Paradise Peak</p>
  <h1 style="font-weight:400;font-size:26px;margin:0 0 18px">${esc(title)}</h1>
  <div style="background:#FBF8F1;border:1px solid #E6DFD0;border-radius:12px;padding:20px 22px;font-size:15px;line-height:1.55">${bodyHtml}</div>
  <p style="font-size:12px;color:#6F6A60;line-height:1.5;margin-top:22px">${footer}</p>
</div></body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:18px 0 6px"><a href="${href}" style="display:inline-block;background:#8B3A2E;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-family:Helvetica,Arial,sans-serif;font-size:14px">${esc(label)}</a></p><p style="font-size:12px;color:#6F6A60;word-break:break-all">${href}</p>`;
}

// -------------------- 1. Welcome / personal link --------------------

export async function sendWelcomeEmail(guest: Pick<Guest, 'guest_name' | 'email' | 'language' | 'check_in' | 'check_out' | 'party_size'>, stayUrl: string): Promise<boolean> {
  if (!guest.email) return false;
  const lang: Lang = guest.language === 'fr' ? 'fr' : 'en';
  const first = guest.guest_name.split(' ')[0];
  const dates = guest.check_in && guest.check_out ? `${fmtDate(guest.check_in, lang)} → ${fmtDate(guest.check_out, lang)}` : '';
  const subject = lang === 'fr' ? 'Votre page Dinner at the Peak' : 'Your Dinner at the Peak page';
  const html = lang === 'fr'
    ? `<p>Bonjour ${esc(first)},</p>
<p>Vous êtes inscrit(e) au service de dîner de The Paradise Peak${dates ? ` pour votre séjour du ${esc(dates)}` : ''}${guest.party_size ? `, ${guest.party_size} adulte(s)` : ''}.</p>
<p>Voici votre page personnelle. Elle liste chaque soir de votre séjour : réservez, modifiez ou annulez jusqu'à <strong>10h00 le jour même</strong>.</p>
${button(stayUrl, 'Ouvrir ma page')}
<p>Lundi et vendredi : buffet (55 € par personne). Mardi, mercredi, jeudi, samedi : menu servi à l'assiette, chaque convive choisit ses plats. Dimanche : pas de service. Dîner à partir de 19h00.</p>`
    : `<p>Hello ${esc(first)},</p>
<p>You are registered for dinner at The Paradise Peak${dates ? ` for your stay ${esc(dates)}` : ''}${guest.party_size ? `, ${guest.party_size} adult(s)` : ''}.</p>
<p>This is your personal page. It lists every night of your stay: book, change or cancel until <strong>10:00 on the day</strong>.</p>
${button(stayUrl, 'Open my page')}
<p>Monday and Friday: buffet (€55 per person). Tuesday, Wednesday, Thursday, Saturday: plated menu, each guest picks their own courses. Sunday: no service. Dinner from 19:00.</p>`;
  const text = `${subject}\n\n${stayUrl}\n`;
  return send({ to: guest.email, subject, html: layout(lang, subject, html), text });
}

// -------------------- 2. Booking confirmed / updated --------------------

export async function sendBookingEmail(order: Order, guest: Guest | null, stayUrl: string, kind: 'new' | 'updated'): Promise<boolean> {
  if (!guest?.email) return false;
  const lang: Lang = guest.language === 'fr' ? 'fr' : 'en';
  const svc = sbService();
  const [{ data: menu }, { data: items }] = await Promise.all([
    svc.from('menus').select('*').eq('id', order.menu_id).single(),
    svc.from('menu_items').select('id, name, name_fr').in('id', Array.from(new Set((order.items ?? []).map((i) => i.menu_item_id)))),
  ]);
  const m = menu as Menu | null;
  const names = new Map((items ?? []).map((it: any) => [it.id, lang === 'fr' ? (it.name_fr ?? it.name) : it.name]));
  const date = fmtDate(order.service_date, lang);
  const isBuffet = m?.service_type === 'buffet';
  const total = order.total_cents ?? 0;

  let plates = '';
  if (!isBuffet) {
    const order3 = ['starter', 'main', 'dessert'];
    for (let seat = 1; seat <= order.cover_count; seat++) {
      const rows = (order.items ?? []).filter((i) => (i.seat ?? 1) === seat).sort((a, b) => order3.indexOf(a.course) - order3.indexOf(b.course));
      if (!rows.length) continue;
      plates += `<p style="margin:8px 0 2px"><strong>${lang === 'fr' ? 'Convive' : 'Guest'} ${seat}</strong><br>${rows.map((r) => esc(String(names.get(r.menu_item_id) ?? r.course)) + (r.guest_note ? ` <em>(${esc(r.guest_note)})</em>` : '')).join('<br>')}</p>`;
    }
  }

  const subject = lang === 'fr'
    ? `${kind === 'new' ? 'Dîner réservé' : 'Dîner modifié'} — ${date}`
    : `${kind === 'new' ? 'Dinner booked' : 'Dinner updated'} — ${date}`;
  const html = lang === 'fr'
    ? `<p>Référence <strong>${esc(order.order_ref)}</strong></p>
<p><strong>${esc(date)}</strong> · ${isBuffet ? 'Buffet' : 'Menu à l\u2019assiette'}${m ? ` · ${esc((lang === 'fr' ? m.title_fr : null) ?? m.title)}` : ''}<br>${order.cover_count} adulte(s) · total <strong>${eur(total)}</strong></p>
${plates}
${order.notes ? `<p>Note : ${esc(order.notes)}</p>` : ''}
<p>Modifiable ou annulable sans frais jusqu'à <strong>10h00 le ${esc(date)}</strong>. Après 10h00 la soirée est ferme et facturée. Si moins de 4 couverts sont réservés sur la propriété ce soir-là, le dîner est préparé par Pirate by Night et servi par l'équipe de The Paradise Peak ; vous en êtes informé(e) avant 10h30.</p>
${button(stayUrl, 'Voir ou modifier')}`
    : `<p>Reference <strong>${esc(order.order_ref)}</strong></p>
<p><strong>${esc(date)}</strong> · ${isBuffet ? 'Buffet' : 'Plated menu'}${m ? ` · ${esc(m.title)}` : ''}<br>${order.cover_count} adult(s) · total <strong>${eur(total)}</strong></p>
${plates}
${order.notes ? `<p>Note: ${esc(order.notes)}</p>` : ''}
<p>Change or cancel free of charge until <strong>10:00 on ${esc(date)}</strong>. After 10:00 the night is final and charged. If fewer than 4 covers are booked across the property that night, dinner is prepared by Pirate by Night and served by the Paradise Peak team; you are told by 10:30.</p>
${button(stayUrl, 'View or change')}`;
  const text = `${subject}\n${order.order_ref}\n${order.cover_count} × ${isBuffet ? 'buffet' : 'plated'} — ${eur(total)}\n${stayUrl}\n`;
  return send({ to: guest.email, cc: PARTNER_CC, subject, html: layout(lang, subject, html), text });
}

// -------------------- 3. Cancellation --------------------

export async function sendCancellationEmail(guest: Guest | null, serviceDate: string, orderRef: string | null, stayUrl: string): Promise<boolean> {
  if (!guest?.email) return false;
  const lang: Lang = guest.language === 'fr' ? 'fr' : 'en';
  const date = fmtDate(serviceDate, lang);
  const subject = lang === 'fr' ? `Dîner annulé — ${date}` : `Dinner cancelled — ${date}`;
  const html = lang === 'fr'
    ? `<p>Votre dîner du <strong>${esc(date)}</strong>${orderRef ? ` (réf. ${esc(orderRef)})` : ''} est annulé. Rien ne vous sera facturé pour cette soirée.</p><p>Vous pouvez réserver à nouveau jusqu'à 10h00 le jour même.</p>${button(stayUrl, 'Ma page')}`
    : `<p>Your dinner on <strong>${esc(date)}</strong>${orderRef ? ` (ref. ${esc(orderRef)})` : ''} is cancelled. Nothing will be charged for this night.</p><p>You can book again until 10:00 on the day.</p>${button(stayUrl, 'My page')}`;
  return send({ to: guest.email, cc: PARTNER_CC, subject, html: layout(lang, subject, html), text: `${subject}\n${stayUrl}\n` });
}
