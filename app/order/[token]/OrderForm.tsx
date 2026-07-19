'use client';

// The main interactive component: pick starter, main, dessert.
// Automatically filters out items that clash with the guest's declared
// dietary flags, so a shellfish-allergic guest simply doesn't see the
// tuna tataki as an option.

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Menu, MenuItem, Guest, Course, DietaryFlag, Order } from '@/lib/types';
import styles from './styles.module.css';
import { formatServiceDate } from '@/lib/time';

interface Props {
  menu: Menu;
  guest: Guest | null;
  room: string;
  existing: Order | null;
}

const COURSES: { key: Course; label: string; label_fr: string }[] = [
  { key: 'starter', label: 'To begin',    label_fr: 'Pour commencer' },
  { key: 'main',    label: 'Main course', label_fr: 'Le plat' },
  { key: 'dessert', label: 'To finish',   label_fr: 'Pour finir' },
];

// If an item's allergens or dietary tags clash with a guest's declared flags,
// hide it. This is the single-most-important safety line in the UI.
function itemBlockedByGuest(item: MenuItem, guest: Guest | null): boolean {
  if (!guest) return false;
  const flags = new Set(guest.dietary_flags);
  const allergenMap: Record<string, DietaryFlag> = {
    shellfish: 'shellfish_allergy',
    nuts: 'nut_allergy',
  };
  for (const a of item.allergens) {
    const flag = allergenMap[a];
    if (flag && flags.has(flag)) return true;
  }
  if (flags.has('vegan') && !item.dietary_tags.includes('vegan')) return true;
  if (flags.has('vegetarian')
      && !item.dietary_tags.includes('vegetarian')
      && !item.dietary_tags.includes('vegan')) return true;
  if (flags.has('gluten_free') && item.allergens.includes('gluten')) return true;
  if (flags.has('dairy_free') && item.allergens.includes('dairy')) return true;
  return false;
}

export function OrderForm({ menu, guest, room, existing }: Props) {
  const lang = (guest?.language ?? 'en') as 'en' | 'fr';
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [selection, setSelection] = useState<Record<Course, string | null>>(() => {
    // Pre-select defaults, and any prior draft choices
    const init: Record<string, string | null> = { starter: null, main: null, dessert: null };
    for (const c of COURSES) {
      const def = menu.items.find(
        (i) => i.course === c.key && i.is_default && !itemBlockedByGuest(i, guest),
      );
      if (def) init[c.key] = def.id;
    }
    if (existing) {
      for (const oi of existing.items) init[oi.course] = oi.menu_item_id;
    }
    return init as Record<Course, string | null>;
  });

  const [coverCount, setCoverCount] = useState(existing?.cover_count ?? 2);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const itemsByCourse = useMemo(() => {
    const map: Record<Course, MenuItem[]> = {
      starter: [], main: [], dessert: [], side: [], amuse: [],
    };
    for (const it of menu.items) {
      if (!itemBlockedByGuest(it, guest)) map[it.course].push(it);
    }
    return map;
  }, [menu.items, guest]);

  async function submit() {
    setError(null);
    for (const c of COURSES) {
      if (!selection[c.key]) {
        setError(lang === 'fr'
          ? 'Merci de choisir un plat pour chaque service.'
          : 'Please choose a dish for each course.');
        return;
      }
    }
    startTransition(async () => {
      const res = await fetch('/api/order', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          room,
          guestId: guest?.id ?? null,
          menuId: menu.id,
          serviceDate: menu.service_date,
          coverCount,
          notes: notes.trim() || null,
          choices: COURSES.map((c) => ({
            menuItemId: selection[c.key],
            course: c.key,
          })),
        }),
      });
      if (!res.ok) {
        setError(lang === 'fr'
          ? 'Un problème est survenu. Merci de réessayer.'
          : 'Something went wrong. Please try again.');
        return;
      }
      router.refresh();
    });
  }

  return (
    <main className={styles.frame}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>
          {lang === 'fr' ? 'Pirate at Night · Ce soir' : 'Pirate at Night · Tonight'}
        </p>
        <h1 className={styles.title}>
          {lang === 'fr' && menu.title_fr ? menu.title_fr : menu.title}
        </h1>
        {(menu.subtitle || menu.subtitle_fr) && (
          <p className={styles.subtitle}>
            {lang === 'fr' && menu.subtitle_fr ? menu.subtitle_fr : menu.subtitle}
          </p>
        )}
        <p className={styles.meta}>
          {formatServiceDate(menu.service_date, lang)} · {lang === 'fr' ? 'Chambre' : 'Room'} {room}
        </p>
      </header>

      {guest && (guest.dietary_flags.length > 0 || guest.allergy_notes) && (
        <aside className={styles.allergyBanner}>
          <strong>
            {lang === 'fr' ? 'Nous avons noté :' : 'We have on file:'}
          </strong>{' '}
          {guest.dietary_flags.join(', ')}
          {guest.allergy_notes ? ` — ${guest.allergy_notes}` : ''}.{' '}
          {lang === 'fr'
            ? 'Le menu ci-dessous est filtré pour vous.'
            : 'The menu below is filtered accordingly.'}
        </aside>
      )}

      {COURSES.map((c) => (
        <section key={c.key} className={styles.course}>
          <h2 className={styles.courseTitle}>
            {lang === 'fr' ? c.label_fr : c.label}
          </h2>
          <div className={styles.choices}>
            {itemsByCourse[c.key].map((item) => {
              const selected = selection[c.key] === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={selected ? styles.choiceSelected : styles.choice}
                  onClick={() =>
                    setSelection((s) => ({ ...s, [c.key]: item.id }))
                  }
                  aria-pressed={selected}
                >
                  <span className={styles.choiceName}>
                    {lang === 'fr' && item.name_fr ? item.name_fr : item.name}
                  </span>
                  {item.description && (
                    <span className={styles.choiceDesc}>
                      {lang === 'fr' && item.description_fr
                        ? item.description_fr
                        : item.description}
                    </span>
                  )}
                  {item.allergens.length > 0 && (
                    <span className={styles.choiceAllergens}>
                      {item.allergens.join(' · ')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <section className={styles.footerBlock}>
        <label className={styles.field}>
          <span>{lang === 'fr' ? 'Nombre de personnes' : 'How many guests?'}</span>
          <input
            type="number"
            min={1}
            max={8}
            value={coverCount}
            onChange={(e) => setCoverCount(Number(e.target.value))}
          />
        </label>
        <label className={styles.field}>
          <span>{lang === 'fr' ? 'Une note pour le chef ?' : 'A note for the chef?'}</span>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={lang === 'fr'
              ? 'Cuisson, préférences, un mot pour un anniversaire…'
              : 'Doneness, preferences, a note for a celebration…'}
          />
        </label>

        {error && <p className={styles.error}>{error}</p>}

        <button
          type="button"
          className={styles.submit}
          disabled={isPending}
          onClick={submit}
        >
          {isPending
            ? (lang === 'fr' ? 'Envoi…' : 'Sending…')
            : (lang === 'fr' ? 'Confirmer ma commande' : 'Confirm my order')}
        </button>

        <p className={styles.finePrint}>
          {lang === 'fr'
            ? 'Vous pourrez modifier votre choix jusqu\'à 10h00 ce matin.'
            : 'You can change your choice until 10:00 AM today.'}
        </p>
      </section>
    </main>
  );
}
