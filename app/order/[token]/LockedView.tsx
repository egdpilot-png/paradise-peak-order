'use client';

// 10:00–14:00 window with no submitted order: kitchen is prepping,
// direct the guest to WhatsApp so we can confirm case-by-case.

import type { Menu, Guest } from '@/lib/types';
import styles from './styles.module.css';
import { formatServiceDate } from '@/lib/time';

interface Props { menu: Menu; guest: Guest | null; room: string; }

export function LockedView({ menu, guest, room }: Props) {
  const lang = (guest?.language ?? 'en') as 'en' | 'fr';
  const wa = process.env.NEXT_PUBLIC_KITCHEN_WHATSAPP ?? '+590000000000';
  const message = encodeURIComponent(
    lang === 'fr'
      ? `Bonjour, je suis en chambre ${room} au Paradise Peak. Je souhaite commander pour ce soir.`
      : `Hello, I'm in room ${room} at The Paradise Peak. I'd like to order for tonight.`,
  );

  return (
    <main className={styles.frame}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Pirate at Night</p>
        <h1 className={styles.title}>
          {lang === 'fr' ? 'Le chef est déjà aux fourneaux.' : 'The chef is already at work.'}
        </h1>
        <p className={styles.meta}>
          {formatServiceDate(menu.service_date, lang)} · {lang === 'fr' ? 'Chambre' : 'Room'} {room}
        </p>
      </header>

      <section className={styles.body}>
        <p className={styles.lead}>
          {lang === 'fr'
            ? 'La fenêtre de commande automatique s\'est fermée à 10h00, mais nous ferons de notre mieux pour vous accueillir ce soir. Envoyez-nous un mot par WhatsApp.'
            : 'The automatic ordering window closed at 10:00, but we\'ll do our best to have you tonight. Send us a note on WhatsApp.'}
        </p>

        <a
          className={styles.submit}
          href={`https://wa.me/${wa.replace(/[^0-9]/g, '')}?text=${message}`}
          target="_blank"
          rel="noopener"
        >
          {lang === 'fr' ? 'Écrire à Pirate at Night' : 'Message Pirate at Night'}
        </a>

        <p className={styles.finePrint}>
          {lang === 'fr'
            ? 'Nous vous confirmerons par retour, généralement en moins de 30 minutes.'
            : 'We\'ll confirm by return message, usually within 30 minutes.'}
        </p>
      </section>
    </main>
  );
}
