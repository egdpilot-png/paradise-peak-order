// Stay overview: one row per night of the stay, with menu, price, booking
// state and the action the guest can take right now.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/token';
import { loadGuestById, loadMenusBetween, loadOrdersForRoomBetween } from '@/lib/supabase';
import {
  addDays, datesBetween, formatEuro, nightKind, shortDate, todayInMarigot, windowState,
  BUFFET_PRICE_CENTS, MIN_COVERS_ONSITE,
} from '@/lib/time';
import styles from '../guest.module.css';

interface Props { params: Promise<{ token: string }>; searchParams: Promise<{ welcome?: string; mail?: string }> }

export default async function StayPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { welcome, mail } = await searchParams;
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

  const [menus, orders] = await Promise.all([
    loadMenusBetween(from, lastNight),
    loadOrdersForRoomBetween(guest.room_number, from, lastNight),
  ]);
  const menuByDate = new Map(menus.map((m) => [m.service_date, m]));
  const orderByDate = new Map(orders.map((o) => [o.service_date, o]));

  const bookedTotal = orders.reduce((acc, o) => acc + (o.total_cents ?? 0), 0);

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

      <section className={styles.card}>
        <p className={styles.cardTitle}>{t('Payment card', 'Carte bancaire')}</p>
        {guest.card_last4 ? (
          <p style={{ margin: 0 }}>
            {guest.card_brand} •••• {guest.card_last4} —{' '}
            {t('charged at 10:00 on each dinner day.', 'débitée à 10 h le jour de chaque dîner.')}
          </p>
        ) : (
          <p style={{ margin: 0 }} className={styles.lead}>
            {t(
              'No card on file yet. You will be asked for one when you confirm your first night; nothing is charged before 10:00 on the day.',
              'Aucune carte enregistrée. Elle vous sera demandée à la confirmation de votre première soirée ; rien n\u2019est prélevé avant 10 h le jour même.',
            )}
          </p>
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
              : t('Fixed menu, plated · priced per dish', 'Menu fixe à l\u2019assiette · prix par plat');

            let status: string;
            let statusClass = styles.nightStatus;
            let action: { label: string; solid: boolean } | null = null;

            if (order) {
              statusClass = styles.nightStatusBooked;
              status = `${t('Booked', 'Réservé')} · ${order.cover_count} ${t('covers', 'couverts')} · ${formatEuro(order.total_cents ?? 0, lang)}`
                + (order.status === 'locked' || !canEdit ? ` · ${t('final', 'définitif')}` : '');
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
                {action ? (
                  <Link href={href} className={`${styles.pill} ${action.solid ? styles.pillSolid : ''}`}>{action.label}</Link>
                ) : <span />}
                <span className={statusClass}>{status}</span>
              </div>
            );
          })}
        </div>

        {orders.length > 0 && (
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
