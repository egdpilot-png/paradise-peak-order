// One night of the stay: book, change, view or cancel.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/token';
import { loadGuestById, loadMenuForDate, loadOrderForRoomDate } from '@/lib/supabase';
import { addDays, nightKind, shortDate, todayInMarigot, windowState } from '@/lib/time';
import { NightForm } from './NightForm';
import styles from '../../guest.module.css';

interface Props { params: Promise<{ token: string; date: string }> }

export default async function NightPage({ params }: Props) {
  const { token, date } = await params;
  const payload = verifyToken(token);
  if (!payload?.guest_id) redirect('/expired');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) redirect(`/my/${token}`);

  const guest = await loadGuestById(payload.guest_id);
  if (!guest || !guest.check_in || !guest.check_out) redirect('/expired');
  const lang = guest.language === 'fr' ? 'fr' : 'en';
  const t = (en: string, fr: string) => (lang === 'fr' ? fr : en);

  // Night must be inside the stay and not in the past
  const lastNight = addDays(guest.check_out, -1);
  if (date < guest.check_in || date > lastNight || date < todayInMarigot()) redirect(`/my/${token}`);

  const kind = nightKind(date);
  const [menu, order] = await Promise.all([
    loadMenuForDate(date),
    loadOrderForRoomDate(guest.room_number, date),
  ]);
  const state = windowState(date);

  const back = (
    <Link href={`/my/${token}`} className={styles.back}>← {t('All your nights', 'Toutes vos soirées')}</Link>
  );

  if (kind === 'closed' || !menu) {
    return (
      <main className={styles.frame}>
        {back}
        <header className={styles.header}>
          <p className={styles.eyebrow}>Pirate by Night · {shortDate(date, lang)}</p>
          <h1 className={styles.title}>{kind === 'closed' ? t('No service on Sundays', 'Pas de service le dimanche') : t('Menu coming soon', 'Menu bientôt disponible')}</h1>
        </header>
        <section className={styles.body}>
          <p className={styles.lead}>
            {kind === 'closed'
              ? t('The kitchen rests on Sundays. Reception can suggest options nearby.', 'La cuisine se repose le dimanche. La réception peut vous suggérer des adresses à proximité.')
              : t('The menu for this night has not been published yet. It is usually online a few days ahead.', 'Le menu de cette soirée n\u2019est pas encore publié. Il est généralement en ligne quelques jours à l\u2019avance.')}
          </p>
        </section>
      </main>
    );
  }

  if (!order && state !== 'open') {
    return (
      <main className={styles.frame}>
        {back}
        <header className={styles.header}>
          <p className={styles.eyebrow}>Pirate by Night · {shortDate(date, lang)}</p>
          <h1 className={styles.title}>{t('Bookings closed for tonight', 'Réservations fermées pour ce soir')}</h1>
        </header>
        <section className={styles.body}>
          <p className={styles.lead}>
            {t('Bookings for each night close at 10:00 that morning. Other nights of your stay are still open.', 'Les réservations ferment à 10 h le matin même. Les autres soirées de votre séjour restent ouvertes.')}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.frame}>
      {back}
      <NightForm
        token={token}
        menu={menu}
        guest={guest}
        existing={order}
        canEdit={state === 'open'}
        lang={lang}
      />
    </main>
  );
}
