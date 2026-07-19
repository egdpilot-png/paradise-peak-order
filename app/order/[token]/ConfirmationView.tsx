'use client';

import Link from 'next/link';
import type { Menu, Order, Guest } from '@/lib/types';
import styles from './styles.module.css';
import { formatServiceDate } from '@/lib/time';

interface Props {
  menu: Menu;
  order: Order;
  guest: Guest | null;
  canEdit: boolean;
}

export function ConfirmationView({ menu, order, guest, canEdit }: Props) {
  const lang = (guest?.language ?? 'en') as 'en' | 'fr';
  const nameOf = (id: string) => {
    const item = menu.items.find((i) => i.id === id);
    if (!item) return '';
    return lang === 'fr' && item.name_fr ? item.name_fr : item.name;
  };

  return (
    <main className={styles.frame}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>
          {lang === 'fr' ? 'C\'est confirmé' : 'You\'re booked in'}
        </p>
        <h1 className={styles.title}>
          {lang === 'fr' && menu.title_fr ? menu.title_fr : menu.title}
        </h1>
        <p className={styles.meta}>
          {formatServiceDate(menu.service_date, lang)} · 18:00 · {order.order_ref}
        </p>
      </header>

      <section className={styles.summary}>
        <p className={styles.lead}>
          {lang === 'fr'
            ? `Merci, chambre ${order.room_number}. Votre dîner est avec le chef.`
            : `Merci, room ${order.room_number}. Your dinner is with the chef.`}
        </p>

        <dl className={styles.summaryList}>
          {order.items
            .sort((a, b) => {
              const rank = { starter: 0, main: 1, dessert: 2, side: 3, amuse: 4 } as const;
              return rank[a.course] - rank[b.course];
            })
            .map((oi) => (
              <div key={oi.id} className={styles.summaryRow}>
                <dt>{oi.course}</dt>
                <dd>{nameOf(oi.menu_item_id)}</dd>
              </div>
            ))}
          <div className={styles.summaryRow}>
            <dt>{lang === 'fr' ? 'Personnes' : 'Guests'}</dt>
            <dd>{order.cover_count}</dd>
          </div>
          {order.notes && (
            <div className={styles.summaryRow}>
              <dt>{lang === 'fr' ? 'Note' : 'Note'}</dt>
              <dd>{order.notes}</dd>
            </div>
          )}
        </dl>

        {canEdit ? (
          <p className={styles.finePrint}>
            {lang === 'fr'
              ? 'Vous pouvez encore modifier votre choix jusqu\'à 10h00.'
              : 'You can still change your choice until 10:00 AM.'}
          </p>
        ) : (
          <p className={styles.finePrint}>
            {lang === 'fr'
              ? 'La cuisine a été notifiée. Pour un changement, contactez-nous par WhatsApp.'
              : 'The kitchen has been notified. To change anything, message us on WhatsApp.'}
          </p>
        )}

        {canEdit && (
          <Link className={styles.linkAction} href="?edit=1">
            {lang === 'fr' ? 'Modifier mon choix' : 'Edit my order'}
          </Link>
        )}
      </section>
    </main>
  );
}
