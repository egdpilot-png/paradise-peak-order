'use client';

// Mon & Thu — Caribbean buffet. Guest doesn't pick courses; they just
// confirm headcount and any dietary flags the property should know about.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Menu, Guest, Order } from '@/lib/types';
import styles from './styles.module.css';
import { formatServiceDate } from '@/lib/time';

interface Props {
  menu: Menu;
  guest: Guest | null;
  room: string;
  existing: Order | null;
  canEdit: boolean;
}

export function BuffetView({ menu, guest, room, existing, canEdit }: Props) {
  const lang = (guest?.language ?? 'en') as 'en' | 'fr';
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [coverCount, setCoverCount] = useState(existing?.cover_count ?? 2);
  const [notes, setNotes] = useState(existing?.notes ?? '');

  async function submit() {
    startTransition(async () => {
      await fetch('/api/order', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          room,
          guestId: guest?.id ?? null,
          menuId: menu.id,
          serviceDate: menu.service_date,
          coverCount,
          notes: notes.trim() || null,
          choices: [], // buffet: no course choices
        }),
      });
      router.refresh();
    });
  }

  const confirmed = !!existing && !canEdit;

  return (
    <main className={styles.frame}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>
          {lang === 'fr' ? 'Ce soir · Buffet Caraïbe' : 'Tonight · Caribbean Buffet'}
        </p>
        <h1 className={styles.title}>
          {lang === 'fr' && menu.title_fr ? menu.title_fr : menu.title}
        </h1>
        <p className={styles.meta}>
          {formatServiceDate(menu.service_date, lang)} · 18:00 · {lang === 'fr' ? 'Chambre' : 'Room'} {room}
        </p>
      </header>

      <section className={styles.body}>
        <p className={styles.lead}>
          {lang === 'fr'
            ? 'Un buffet en libre-service. Servez-vous quand vous voulez entre 18h00 et 22h00. Nous avons juste besoin de savoir combien vous serez.'
            : 'A self-serve buffet. Help yourself any time between 18:00 and 22:00. All we need to know is how many of you are joining.'}
        </p>

        {guest && (guest.dietary_flags.length > 0 || guest.allergy_notes) && (
          <aside className={styles.allergyBanner}>
            <strong>
              {lang === 'fr' ? 'Nous avons noté :' : 'We have on file:'}
            </strong>{' '}
            {guest.dietary_flags.join(', ')}
            {guest.allergy_notes ? ` — ${guest.allergy_notes}` : ''}.{' '}
            {lang === 'fr'
              ? 'Le buffet inclura une option adaptée, clairement étiquetée.'
              : 'The buffet will include a clearly labelled option for you.'}
          </aside>
        )}
      </section>

      <section className={styles.footerBlock}>
        <label className={styles.field}>
          <span>{lang === 'fr' ? 'Nombre de personnes' : 'How many guests?'}</span>
          <input
            type="number"
            min={1}
            max={8}
            value={coverCount}
            disabled={confirmed}
            onChange={(e) => setCoverCount(Number(e.target.value))}
          />
        </label>
        <label className={styles.field}>
          <span>{lang === 'fr' ? 'Une note pour nous ?' : 'A note for us?'}</span>
          <textarea
            rows={3}
            value={notes}
            disabled={confirmed}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={lang === 'fr'
              ? 'Un enfant, une allergie, une préférence…'
              : 'A child, an allergy, a preference…'}
          />
        </label>

        {canEdit && (
          <button
            type="button"
            className={styles.submit}
            disabled={isPending}
            onClick={submit}
          >
            {isPending
              ? (lang === 'fr' ? 'Envoi…' : 'Sending…')
              : existing
                ? (lang === 'fr' ? 'Mettre à jour' : 'Update')
                : (lang === 'fr' ? 'Confirmer' : 'Confirm')}
          </button>
        )}

        {confirmed && (
          <p className={styles.finePrint}>
            {lang === 'fr'
              ? 'Confirmé. À ce soir.'
              : 'Confirmed. See you tonight.'}
          </p>
        )}
      </section>
    </main>
  );
}
