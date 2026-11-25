// Transactional guest emails via Resend's REST API (no SDK dependency).
// Every send is best-effort: a missing RESEND_API_KEY or a provider error is
// logged and never blocks the guest flow.
//
// Env:
//   RESEND_API_KEY        — from resend.com (domain piratebynight.com verified)
//   EMAIL_FROM            — default "Dinner at the Peak <contact@piratebynight.com>"
//   EMAIL_REPLY_TO        — default contact@piratebynight.com (Pirate by Night)
//   PARADISE_PEAK_EMAIL   — default contact@theparadisepeak.com (shown in footer)
//   EMAIL_ADMIN           — default contact@piratebynight.com (charge-run summaries)
//   PARADISE_PEAK_CC      — set to "true" to cc Paradise Peak on bookings/cancellations
//   RESEND_API_BASE       — tests only (points at a local stand-in)
//                           (off until the service is tested end to end)
//   NEXT_PUBLIC_APP_URL   — default https://menu.piratebynight.com

import { sbService } from './supabase';
import type { Guest, Menu, Order } from './types';
import { WEEK_LINES, WEEK_FOOT } from './week';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://menu.piratebynight.com';
const FROM = process.env.EMAIL_FROM || 'Dinner at the Peak <contact@piratebynight.com>';
const REPLY_TO = process.env.EMAIL_REPLY_TO || 'contact@piratebynight.com';
export const PARADISE_PEAK_EMAIL = process.env.PARADISE_PEAK_EMAIL || 'contact@theparadisepeak.com';
// Copy Paradise Peak only once explicitly enabled — test phase sends to the guest alone.
const ADMIN_EMAIL = process.env.EMAIL_ADMIN || 'contact@piratebynight.com';
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
    const res = await fetch(`${process.env.RESEND_API_BASE || 'https://api.resend.com'}/emails`, {
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

function weekTable(lang: Lang): string {
  const rows = WEEK_LINES.map((w) => `<tr><td style="padding:5px 14px 5px 0;font-weight:bold;white-space:nowrap;vertical-align:top">${esc(lang === 'fr' ? w.day_fr : w.day)}</td><td style="padding:5px 0;vertical-align:top">${esc(lang === 'fr' ? w.text_fr : w.text)}</td></tr>`).join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;line-height:1.45;margin:14px 0 4px">${rows}</table><p style="font-size:13px;color:#6F6A60;margin:6px 0 0">${esc(lang === 'fr' ? WEEK_FOOT.fr : WEEK_FOOT.en)}</p>`;
}

function cardLabel(guest: Pick<Guest, 'card_brand' | 'card_last4'> | null): string | null {
  return guest?.card_last4 ? `${guest.card_brand ?? 'Card'} •••• ${guest.card_last4}` : null;
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
${weekTable('fr')}`
    : `<p>Hello ${esc(first)},</p>
<p>You are registered for dinner at The Paradise Peak${dates ? ` for your stay ${esc(dates)}` : ''}${guest.party_size ? `, ${guest.party_size} adult(s)` : ''}.</p>
<p>This is your personal page. It lists every night of your stay: book, change or cancel until <strong>10:00 on the day</strong>.</p>
${button(stayUrl, 'Open my page')}
${weekTable('en')}`;
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

  const card = cardLabel(guest);
  const payFr = card
    ? `<p>Paiement : votre carte <strong>${esc(card)}</strong> sera débitée de <strong>${eur(total)}</strong> à 10h00 le ${esc(date)}. Rien n'est débité avant.</p>`
    : '';
  const payEn = card
    ? `<p>Payment: your card <strong>${esc(card)}</strong> will be charged <strong>${eur(total)}</strong> at 10:00 on ${esc(date)}. Nothing is charged before then.</p>`
    : '';

  const subject = lang === 'fr'
    ? `${kind === 'new' ? 'Dîner réservé' : 'Dîner modifié'} — ${date}`
    : `${kind === 'new' ? 'Dinner booked' : 'Dinner updated'} — ${date}`;
  const html = lang === 'fr'
    ? `<p>Référence <strong>${esc(order.order_ref)}</strong></p>
<p><strong>${esc(date)}</strong> · ${isBuffet ? 'Buffet' : 'Menu à l\u2019assiette'}${m ? ` · ${esc((lang === 'fr' ? m.title_fr : null) ?? m.title)}` : ''}<br>${order.cover_count} adulte(s) · total <strong>${eur(total)}</strong></p>
${plates}
${order.notes ? `<p>Note : ${esc(order.notes)}</p>` : ''}
${payFr}
<p>Modifiable ou annulable sans frais jusqu'à <strong>10h00 le ${esc(date)}</strong>. Après 10h00 la soirée est ferme et facturée. Si moins de 4 couverts sont réservés sur la propriété ce soir-là, le dîner est préparé par Pirate by Night et servi par l'équipe de The Paradise Peak ; vous en êtes informé(e) avant 10h30.</p>
${button(stayUrl, 'Voir ou modifier')}`
    : `<p>Reference <strong>${esc(order.order_ref)}</strong></p>
<p><strong>${esc(date)}</strong> · ${isBuffet ? 'Buffet' : 'Plated menu'}${m ? ` · ${esc(m.title)}` : ''}<br>${order.cover_count} adult(s) · total <strong>${eur(total)}</strong></p>
${plates}
${order.notes ? `<p>Note: ${esc(order.notes)}</p>` : ''}
${payEn}
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

// -------------------- 4. Card saved --------------------

export async function sendCardSavedEmail(
  guest: Guest | null,
  card: { brand: string; last4: string; exp: string },
  nights: Pick<Order, 'service_date' | 'order_ref' | 'cover_count' | 'total_cents'>[],
  stayUrl: string,
): Promise<boolean> {
  if (!guest?.email) return false;
  const lang: Lang = guest.language === 'fr' ? 'fr' : 'en';
  const first = guest.guest_name.split(' ')[0];
  const label = `${card.brand} •••• ${card.last4}`;
  const rows = nights.map((n) => `<tr><td style="padding:5px 14px 5px 0;vertical-align:top">${esc(fmtDate(n.service_date, lang))}</td><td style="padding:5px 14px 5px 0;vertical-align:top;white-space:nowrap">${n.cover_count} ${lang === 'fr' ? 'adulte(s)' : 'adult(s)'}</td><td style="padding:5px 0;vertical-align:top;text-align:right;white-space:nowrap"><strong>${eur(n.total_cents ?? 0)}</strong></td></tr>`).join('');
  const table = nights.length ? `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;line-height:1.45;margin:10px 0;width:100%">${rows}</table>` : '';
  const subject = lang === 'fr' ? 'Carte enregistrée — Dinner at the Peak' : 'Card saved — Dinner at the Peak';
  const html = lang === 'fr'
    ? `<p>Bonjour ${esc(first)},</p>
<p>Votre carte <strong>${esc(label)}</strong> (exp. ${esc(card.exp)}) est enregistrée pour vos dîners à The Paradise Peak. <strong>Rien n'a été débité.</strong></p>
${nights.length ? `<p>Soirées confirmées avec cette carte :</p>${table}` : ''}
<p>Chaque soirée est débitée séparément, à <strong>10h00 le jour du dîner</strong>. Jusqu'à 10h00 ce jour-là, vous pouvez la modifier ou l'annuler sans frais. Un reçu vous est envoyé par e-mail après chaque débit.</p>
<p>Le numéro complet de la carte est conservé par Stripe uniquement ; ni Pirate by Night ni The Paradise Peak ne le voient.</p>
${button(stayUrl, 'Ma page')}`
    : `<p>Hello ${esc(first)},</p>
<p>Your card <strong>${esc(label)}</strong> (exp. ${esc(card.exp)}) is saved for your dinners at The Paradise Peak. <strong>Nothing has been charged.</strong></p>
${nights.length ? `<p>Nights confirmed with this card:</p>${table}` : ''}
<p>Each night is charged separately, at <strong>10:00 on the day of the dinner</strong>. Until 10:00 that day you can change or cancel it free of charge. A receipt is emailed to you after each charge.</p>
<p>The full card number is held by Stripe only; neither Pirate by Night nor The Paradise Peak sees it.</p>
${button(stayUrl, 'My page')}`;
  return send({ to: guest.email, subject, html: layout(lang, subject, html), text: `${subject}\n${label}\n${stayUrl}\n` });
}

// -------------------- 5. Charge receipt --------------------

export async function sendChargeReceiptEmail(order: Pick<Order, 'service_date' | 'order_ref' | 'cover_count' | 'total_cents'>, guest: Guest | null, stayUrl: string): Promise<boolean> {
  if (!guest?.email) return false;
  const lang: Lang = guest.language === 'fr' ? 'fr' : 'en';
  const date = fmtDate(order.service_date, lang);
  const card = cardLabel(guest) ?? (lang === 'fr' ? 'votre carte' : 'your card');
  const amount = eur(order.total_cents ?? 0);
  const subject = lang === 'fr' ? `Reçu — dîner du ${date}` : `Receipt — dinner on ${date}`;
  const html = lang === 'fr'
    ? `<p>Référence <strong>${esc(order.order_ref)}</strong></p>
<p>Nous avons débité <strong>${amount}</strong> sur ${esc(card)} pour votre dîner du <strong>${esc(date)}</strong>, ${order.cover_count} adulte(s).</p>
<p>La soirée est maintenant ferme. Le dîner est servi à partir de 19h00.</p>
<p style="font-size:13px;color:#6F6A60">Vendeur : SAS ALLEN (Pirate by Night), Grand Case, Saint-Martin.</p>
${button(stayUrl, 'Ma page')}`
    : `<p>Reference <strong>${esc(order.order_ref)}</strong></p>
<p>We charged <strong>${amount}</strong> to ${esc(card)} for your dinner on <strong>${esc(date)}</strong>, ${order.cover_count} adult(s).</p>
<p>The night is now final. Dinner is served from 19:00.</p>
<p style="font-size:13px;color:#6F6A60">Seller: SAS ALLEN (Pirate by Night), Grand Case, Saint-Martin.</p>
${button(stayUrl, 'My page')}`;
  return send({ to: guest.email, subject, html: layout(lang, subject, html), text: `${subject}\n${order.order_ref} — ${amount}\n${stayUrl}\n` });
}

// -------------------- 6. Charge failed --------------------

export async function sendChargeFailedEmail(order: Pick<Order, 'service_date' | 'order_ref' | 'total_cents'>, guest: Guest | null, stayUrl: string): Promise<boolean> {
  if (!guest?.email) return false;
  const lang: Lang = guest.language === 'fr' ? 'fr' : 'en';
  const date = fmtDate(order.service_date, lang);
  const amount = eur(order.total_cents ?? 0);
  const subject = lang === 'fr' ? `Paiement refusé — dîner du ${date}` : `Payment declined — dinner on ${date}`;
  const html = lang === 'fr'
    ? `<p>Référence <strong>${esc(order.order_ref)}</strong></p>
<p>Le débit de <strong>${amount}</strong> pour votre dîner de ce soir (${esc(date)}) a été refusé par votre banque.</p>
<p>Merci d'enregistrer une autre carte <strong>avant 12h00 aujourd'hui</strong> : le montant est débité dès que la carte est enregistrée et votre dîner est maintenu. Sans paiement à 12h00, la soirée est annulée.</p>
${button(stayUrl, 'Mettre à jour ma carte')}`
    : `<p>Reference <strong>${esc(order.order_ref)}</strong></p>
<p>The charge of <strong>${amount}</strong> for your dinner tonight (${esc(date)}) was declined by your bank.</p>
<p>Please save another card <strong>before 12:00 today</strong>: the amount is charged as soon as the card is saved and your dinner goes ahead. Without payment by 12:00, the night is cancelled.</p>
${button(stayUrl, 'Update my card')}`;
  return send({ to: guest.email, subject, html: layout(lang, subject, html), text: `${subject}\n${order.order_ref} — ${amount}\n${stayUrl}\n` });
}

// -------------------- 7. Charge-run summary for the kitchen office --------------------

export interface ChargeRunLine { order_ref: string; room: string; guest_name: string | null; total_cents: number; result: 'charged' | 'failed' | 'no_card'; detail?: string | null }

export async function sendChargeRunSummary(serviceDate: string, lines: ChargeRunLine[]): Promise<boolean> {
  if (!lines.length) return false;
  const date = fmtDate(serviceDate, 'en');
  const charged = lines.filter((l) => l.result === 'charged');
  const problems = lines.filter((l) => l.result !== 'charged');
  const sum = (ls: ChargeRunLine[]) => eur(ls.reduce((a, l) => a + l.total_cents, 0));
  const row = (l: ChargeRunLine) => `<tr><td style="padding:4px 12px 4px 0">${esc(l.order_ref)}</td><td style="padding:4px 12px 4px 0">${esc(l.room)}${l.guest_name ? ` · ${esc(l.guest_name)}` : ''}</td><td style="padding:4px 12px 4px 0;text-align:right">${eur(l.total_cents)}</td><td style="padding:4px 0">${l.result === 'charged' ? 'Charged' : l.result === 'no_card' ? 'No card on file' : `Declined${l.detail ? ` — ${esc(l.detail)}` : ''}`}</td></tr>`;
  const subject = `${problems.length ? `${problems.length} payment problem(s) — ` : ''}10:00 charge run, ${date}`;
  const html = `<p><strong>${charged.length}</strong> night(s) charged, total <strong>${sum(charged)}</strong>.${problems.length ? ` <strong>${problems.length}</strong> not charged (${sum(problems)}): the guest has been emailed and has until 12:00 to save another card.` : ''}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;line-height:1.4;width:100%">${[...problems, ...charged].map(row).join('')}</table>
${button(`${APP_URL}/dashboard/tonight?date=${serviceDate}`, 'Open the dashboard')}`;
  return send({ to: ADMIN_EMAIL, subject, html: layout('en', subject, html), text: `${subject}\n` });
}
