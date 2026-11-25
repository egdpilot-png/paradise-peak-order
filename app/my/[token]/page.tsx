// Stay overview: one row per night of the stay, with menu, price, booking
// state and the action the guest can take right now.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/token';
import { loadGuestById, loadMenusBetween, loadOrdersForRoomBetween, loadSkippedNights } from '@/lib/supabase';
import { NotDiningButton } from './NotDiningButton';
import { CardButton } from './CardButton';
import { hasUsableCard, stripeEnabled } from '@/lib/stripe';
import {
  addDays, datesBetween, formatEuro, isPizzaNight, nightKind, shortDate, todayInMarigot, windowState,
  BUFFET_PRICE_CENTS, MIN_COVERS_ONSITE,
} from '@/lib/time';
import styles from '../guest.module.css';

interface Props { params: Promise<{ token: string }>; searchParams: Promise<{ welcome?: string; mail?: string; card?: string; n?: string; paid?: string; declined?: string }> }

export default async function StayPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { welcome, mail, card: cardFlag, n: confirmedN, paid, declined } = await searchParams;
  const payload = verifyToken(token);
  if (!payload?.guest_id) redirect('/expired');

  const guest = await loadGuestById(payload.guest_id);
  if (!guest || !guest.check_in || !guest.check_out) redirect('/expired');

  const lang = guest.language === 'fr' ? 'fr' : 'en';
  const t = (en: string, fr: string) => (lang === 'fr' ? fr : en);

  const today = todayInMarigot();
  const from = guest.check_in < today ? today : guest.check_in;
  const lastNight = addDays(guest.check_out, -1);
  const nights = datesBetween(from, guest.check_out);

  const [menus, orders, skipped] = await Promise.all([
    loadMenusBetween(from, lastNight),
    loadOrdersForRoomBetween(guest.room_number, from, lastNight),
    loadSkippedNights(guest.id, from, lastNight),
  ]);
  const menuByDate = new Map(menus.map((m) => [m.service_date, m]));
  const orderByDate = new Map(orders.map((o) => [o.service_date, o]));

  const paymentsOn = stripeEnabled();
  const hasCard = hasUsableCard(guest);
  const confirmedOrders = orders.filter((o) => o.status !== 'draft');
  const waiting = orders.filter((o) => o.status === 'draft' && windowState(o.service_date) === 'open');
  const bookedTotal = confirmedOrders.reduce((acc, o) => acc + (o.total_cents ?? 0), 0);
  const nConfirmed = Number(confirmedN ?? 0);

  return (
    <main className={styles.frame}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Pirate by Night · The Paradise Peak</p>
        <h1 className={styles.title}>
          {t('Good evening', 'Bonsoir')}, {guest.guest_name.split(' ')[0]}
        </h1>
        <p className={styles.meta}>
          {shortDate(guest.check_in, lang)} → {shortDate(guest.check_out, lang)}
          {guest.room_number && !guest.room_number.startsWith('G-') && guest.room_number !== 'TBA'
            ? ` · ${t('Room', 'Chambre')} ${guest.room_number}`
            : ''}
          {guest.party_size ? ` · ${guest.party_size} ${t('adults', 'adultes')}` : ''}
        </p>
      </header>

      {welcome && (
        <div className={styles.notice}>
          {t(
            'You are registered. Bookmark this page or save the link: it is your personal page for the whole stay (registered email: ',
            'Votre inscription est enregistrée. Ajoutez cette page à vos favoris ou conservez le lien : c\u2019est votre page personnelle pour tout le séjour (e-mail enregistré : ',
          )}
          <strong>{guest.email}</strong>).{' '}
          {mail
            ? t('We have emailed you this link.', 'Nous vous avons envoyé ce lien par e-mail.')
            : t('Save this link now — no email is sent yet.', 'Conservez ce lien dès maintenant — aucun e-mail n\u2019est envoyé pour l\u2019instant.')}
        </div>
      )}

      {cardFlag === 'saved' && (
        <div className={styles.notice}>
          <strong>{t('Card saved.', 'Carte enregistrée.')}</strong>{' '}
          {nConfirmed > 0
            ? t(`${nConfirmed} night${nConfirmed > 1 ? 's are' : ' is'} now confirmed.`, `${nConfirmed} soirée${nConfirmed > 1 ? 's sont' : ' est'} maintenant confirmée${nConfirmed > 1 ? 's' : ''}.`)
            : ''}{' '}
          {paid ? t('Your dinner tonight has been paid. ', 'Votre dîner de ce soir est payé. ') : ''}
          {declined ? t('This card was also declined for tonight\u2019s dinner: please try another one. ', 'Cette carte a aussi été refusée pour le dîner de ce soir : merci d\u2019en essayer une autre. ') : ''}
          {t('Nothing is charged until 10:00 on the day of each dinner. A confirmation is sent to ', 'Rien n\u2019est débité avant 10 h le jour de chaque dîner. Une confirmation est envoyée à ')}
          <strong>{guest.email}</strong>.
        </div>
      )}
      {cardFlag === 'cancelled' && (
        <div className={styles.notice}>
          {t(
            'No card was saved, so your booking is not confirmed yet. Your choices are kept: use "Add card" below to finish.',
            'Aucune carte n\u2019a été enregistrée : votre réservation n\u2019est pas encore confirmée. Vos choix sont conservés : utilisez « Ajouter une carte » ci-dessous pour terminer.',
          )}
        </div>
      )}
      {cardFlag === 'error' && (
        <div className={styles.notice}>
          {t(
            'We could not confirm your card. Nothing was charged. Please try again with "Add card" below.',
            'Nous n\u2019avons pas pu confirmer votre carte. Rien n\u2019a été débité. Merci de réessayer avec « Ajouter une carte » ci-dessous.',
          )}
        </div>
      )}

      <section className={styles.card}>
        <p className={styles.cardTitle}>{t('Payment card', 'Carte bancaire')}</p>
        {!paymentsOn ? (
          <p style={{ margin: 0 }} className={styles.lead}>
            {t(
              'Card payment is not active yet: your bookings confirm without a card for now.',
              'Le paiement par carte n\u2019est pas encore actif : vos réservations sont confirmées sans carte pour le moment.',
            )}
          </p>
        ) : hasCard ? (
          <>
            <p style={{ margin: '0 0 10px' }}>
              <strong>{guest.card_brand} •••• {guest.card_last4}</strong>
              {guest.card_exp ? ` · ${t('exp.', 'exp.')} ${guest.card_exp}` : ''} —{' '}
              {t('charged at 10:00 on the day of each dinner you book, never before.', 'débitée à 10 h le jour de chaque dîner réservé, jamais avant.')}
            </p>
            <CardButton token={token} lang={lang} label={t('Replace card', 'Changer de carte')} />
          </>
        ) : (
          <>
            <p style={{ margin: '0 0 10px' }} className={styles.lead}>
              {waiting.length > 0
                ? t(
                    `${waiting.length} night${waiting.length > 1 ? 's are' : ' is'} waiting for a card to be confirmed. Nothing is charged when you add it: the card is charged at 10:00 on the day of each dinner.`,
                    `${waiting.length} soirée${waiting.length > 1 ? 's attendent' : ' attend'} une carte pour être confirmée${waiting.length > 1 ? 's' : ''}. Rien n\u2019est débité à l\u2019enregistrement : la carte est débitée à 10 h le jour de chaque dîner.`,
                  )
                : t(
                    'No card yet. You will be asked for one when you book your first night. Nothing is charged until 10:00 on the day of each dinner.',
                    'Pas encore de carte. Elle vous sera demandée à votre première réservation. Rien n\u2019est débité avant 10 h le jour de chaque dîner.',
                  )}
            </p>
            <CardButton token={token} lang={lang} solid={waiting.length > 0} label={t('Add card', 'Ajouter une carte')} />
          </>
        )}
      </section>

      <section className={styles.body}>
        <h2 className={styles.courseTitle}>{t('Your nights', 'Vos soirées')}</h2>
        <div className={styles.nights}>
          {nights.map((date) => {
            const kind = nightKind(date);
            const menu = menuByDate.get(date);
            const order = orderByDate.get(date);
            const state = windowState(date);
            const canEdit = state === 'open';
            const href = `/my/${token}/${date}`;

            if (kind === 'closed') {
              return (
                <div key={date} className={`${styles.night} ${styles.nightClosed}`}>
                  <span className={styles.nightDate}>{shortDate(date, lang)}</span>
                  <span className={styles.pill + ' ' + styles.pillMuted}>{t('Closed', 'Fermé')}</span>
                  <span className={styles.nightStatus}>{t('No dinner service on Sundays.', 'Pas de service le dimanche.')}</span>
                </div>
              );
            }

            const kindLabel = kind === 'buffet'
              ? `${t('Caribbean buffet', 'Buffet caribéen')} · ${formatEuro(menu?.cover_price_cents ?? BUFFET_PRICE_CENTS, lang)} ${t('pp', 'pp')}`
              : isPizzaNight(date)
                ? t('Pizza night · delivered from Sandy\u2019s Orange · priced per pizza', 'Soirée pizza · livrée par Sandy\u2019s Orange · prix par pizza')
                : t('Fixed menu, plated · priced per dish', 'Menu fixe à l\u2019assiette · prix par plat');

            let status: string;
            let statusClass = styles.nightStatus;
            let action: { label: string; solid: boolean } | null = null;
            const isSkipped = skipped.has(date);
            const canSkip = !order && state === 'open' && date >= today;

            if (!order && isSkipped) {
              status = t('No dinner this night — nothing is booked or charged.', 'Pas de dîner ce soir-là — rien n\u2019est réservé ni facturé.');
            } else if (order && order.status === 'draft') {
              // Dishes chosen, card still missing: not a booking yet.
              status = canEdit
                ? `${t('Not confirmed — card needed', 'Non confirmé — carte requise')} · ${order.cover_count} ${t('covers', 'couverts')} · ${formatEuro(order.total_cents ?? 0, lang)}`
                : t('Not booked: no card was added before 10:00.', 'Non réservé : aucune carte ajoutée avant 10 h.');
              action = canEdit ? { label: t('Finish', 'Terminer'), solid: true } : null;
            } else if (order) {
              statusClass = styles.nightStatusBooked;
              const pay = order.payment_status === 'charged' ? ` · ${t('paid', 'payé')}`
                : order.payment_status === 'failed' ? ` · ${t('payment declined — update your card', 'paiement refusé — mettez à jour votre carte')}`
                : '';
              status = `${t('Booked', 'Réservé')} · ${order.cover_count} ${t('covers', 'couverts')} · ${formatEuro(order.total_cents ?? 0, lang)}`
                + (order.status === 'locked' || !canEdit ? ` · ${t('final', 'définitif')}` : '') + pay;
              action = { label: canEdit ? t('Change', 'Modifier') : t('View', 'Voir'), solid: false };
            } else if (!menu) {
              status = t('Menu not published yet. Check back soon.', 'Menu pas encore publié. Revenez bientôt.');
            } else if (state === 'open') {
              status = lang === 'fr' && menu.title_fr ? menu.title_fr : menu.title;
              action = { label: t('Book', 'Réserver'), solid: true };
            } else if (state === 'late') {
              status = t('Bookings for tonight closed at 10:00.', 'Les réservations pour ce soir ont fermé à 10 h.');
            } else {
              status = t('Past', 'Passé');
            }

            return (
              <div key={date} className={styles.night}>
                <div>
                  <div className={styles.nightDate}>{shortDate(date, lang)}</div>
                  <div className={styles.nightKind}>{kindLabel}</div>
                </div>
                {isSkipped && !order ? (
                  <NotDiningButton token={token} date={date} skipped lang={lang} />
                ) : action ? (
                  <span className={styles.nightActions}>
                    {canSkip && <NotDiningButton token={token} date={date} skipped={false} lang={lang} />}
                    <Link href={href} className={`${styles.pill} ${action.solid ? styles.pillSolid : ''}`}>{action.label}</Link>
                  </span>
                ) : <span />}
                <span className={statusClass}>{status}</span>
              </div>
            );
          })}
        </div>

        {confirmedOrders.length > 0 && (
          <div className={styles.totalRow}>
            <span>{t('Booked so far', 'Total réservé')}</span>
            <span className={styles.price}>{formatEuro(bookedTotal, lang)}</span>
          </div>
        )}

        <p className={styles.finePrint} style={{ marginTop: 24 }}>
          {t(
            `Dinner is served from 19:00. Change or cancel any night free of charge until 10:00 that day; the card is charged at 10:00. If fewer than ${MIN_COVERS_ONSITE} guests dine on a given night, dinner is delivered and served by the Paradise Peak team; you are told by 10:30.`,
            `Le dîner est servi à partir de 19 h. Modification ou annulation gratuite jusqu\u2019à 10 h le jour même ; la carte est débitée à 10 h. Si moins de ${MIN_COVERS_ONSITE} convives dînent un soir donné, le dîner est livré et servi par l\u2019équipe Paradise Peak ; vous êtes prévenu avant 10 h 30.`,
          )}{' '}
          <a href={`/terms?lang=${lang}`} target="_blank" rel="noreferrer">{t('Full conditions', 'Conditions complètes')}</a>
        </p>
      </section>
    </main>
  );
}
