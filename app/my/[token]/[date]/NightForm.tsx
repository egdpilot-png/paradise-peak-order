'use client';

// Booking form for one night. Handles both formats:
//   buffet → covers only, flat price per adult
//   plated → each person in the party picks their own starter / main / dessert

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Menu, MenuItem, Guest, Course, DietaryFlag, Order } from '@/lib/types';
import { formatServiceDate, formatEuro, BUFFET_PRICE_CENTS } from '@/lib/time';
import styles from '../../guest.module.css';

interface Props {
  token: string;
  menu: Menu;
  guest: Guest;
  existing: Order | null;
  canEdit: boolean;
  lang: 'en' | 'fr';
}

const COURSES: { key: Course; label: string; label_fr: string }[] = [
  { key: 'starter', label: 'To begin', label_fr: 'Pour commencer' },
  { key: 'main', label: 'Main course', label_fr: 'Le plat' },
  { key: 'dessert', label: 'To finish', label_fr: 'Pour finir' },
];

function itemBlockedByGuest(item: MenuItem, guest: Guest | null): boolean {
  if (!guest) return false;
  const flags = new Set(guest.dietary_flags);
  const allergenMap: Record<string, DietaryFlag> = { shellfish: 'shellfish_allergy', nuts: 'nut_allergy' };
  for (const a of item.allergens) {
    const flag = allergenMap[a];
    if (flag && flags.has(flag)) return true;
  }
  if (flags.has('vegan') && !item.dietary_tags.includes('vegan')) return true;
  if (flags.has('vegetarian') && !item.dietary_tags.includes('vegetarian') && !item.dietary_tags.includes('vegan')) return true;
  if (flags.has('gluten_free') && item.allergens.includes('gluten')) return true;
  if (flags.has('dairy_free') && item.allergens.includes('dairy')) return true;
  return false;
}

export function NightForm({ token, menu, guest, existing, canEdit, lang }: Props) {
  const t = (en: string, fr: string) => (lang === 'fr' ? fr : en);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isBuffet = menu.service_type === 'buffet';
  const coverPrice = menu.cover_price_cents ?? BUFFET_PRICE_CENTS;

  const itemsByCourse = useMemo(() => {
    const map: Record<Course, MenuItem[]> = { starter: [], main: [], dessert: [], side: [], amuse: [] };
    for (const it of menu.items) if (!itemBlockedByGuest(it, guest)) map[it.course].push(it);
    return map;
  }, [menu.items, guest]);


  type Seat = Record<Course, string | null>;
  const emptySeat = (): Seat => ({ starter: null, main: null, dessert: null, side: null, amuse: null });

  const [coverCount, setCoverCountRaw] = useState(existing?.cover_count ?? guest.party_size ?? 2);
  const [seats, setSeats] = useState<Seat[]>(() => {
    const n = existing?.cover_count ?? guest.party_size ?? 2;
    const arr: Seat[] = Array.from({ length: n }, emptySeat);
    if (existing) {
      for (const oi of existing.items) {
        const idx = Math.max(1, Math.min(n, oi.seat ?? 1)) - 1;
        arr[idx][oi.course] = oi.menu_item_id;
      }
      // Legacy orders stored one line for the whole party: mirror seat 1 to the others.
      if (existing.items.every((oi) => (oi.seat ?? 1) === 1)) for (let i = 1; i < n; i++) arr[i] = { ...arr[0] };
    }
    return arr;
  });
  const [activeSeat, setActiveSeat] = useState(0);
  const [seatNotes, setSeatNotes] = useState<string[]>(() => {
    const n = existing?.cover_count ?? guest.party_size ?? 2;
    const arr = Array.from({ length: n }, () => '');
    if (existing) for (const oi of existing.items) if (oi.guest_note) arr[Math.max(1, Math.min(n, oi.seat ?? 1)) - 1] = oi.guest_note;
    return arr;
  });

  function setCoverCount(n: number) {
    n = Math.min(8, Math.max(1, n));
    setCoverCountRaw(n);
    setSeats((prev) => {
      const next = prev.slice(0, n);
      while (next.length < n) next.push(emptySeat());
      return next;
    });
    setSeatNotes((prev) => { const next = prev.slice(0, n); while (next.length < n) next.push(''); return next; });
    setActiveSeat((a) => Math.min(a, n - 1));
  }

  function choose(seatIdx: number, course: Course, itemId: string) {
    setSeats((prev) => prev.map((st, i) => (i === seatIdx ? { ...st, [course]: itemId } : st)));
  }

  function copySeat(from: number, to: number) {
    setSeats((prev) => prev.map((st, i) => (i === to ? { ...prev[from] } : st)));
  }

  const seatComplete = (st: Seat) => COURSES.every((c) => itemsByCourse[c.key].length === 0 || !!st[c.key]);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Order | null>(null);

  const seatTotal = (st: Seat) =>
    COURSES.reduce((acc, c) => acc + (menu.items.find((i) => i.id === st[c.key])?.price_cents ?? 0), 0);
  const total = isBuffet ? coverPrice * coverCount : seats.reduce((acc, st) => acc + seatTotal(st), 0);

  function submit() {
    setError(null);
    if (!isBuffet) {
      const missing = seats.findIndex((st) => !seatComplete(st));
      if (missing >= 0) {
        setActiveSeat(missing);
        setError(t(`Guest ${missing + 1} still needs a dish for each course.`, `Il manque un plat pour le convive ${missing + 1}.`));
        return;
      }
    }
    startTransition(async () => {
      const res = await fetch('/api/order', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          menuId: menu.id,
          serviceDate: menu.service_date,
          coverCount,
          notes: notes.trim() || null,
          choices: isBuffet
            ? []
            : seats.flatMap((st, idx) =>
                COURSES.filter((c) => st[c.key]).map((c) => ({
                  menuItemId: st[c.key], course: c.key, seat: idx + 1,
                  note: c.key === 'main' ? (seatNotes[idx].trim() || null) : null,
                })),
              ),
        }),
      });
      if (!res.ok) {
        setError(t('Something went wrong. Please try again.', 'Un problème est survenu. Merci de réessayer.'));
        return;
      }
      const data = await res.json();
      setDone(data.order);
      router.refresh();
    });
  }

  function cancel() {
    if (!existing) return;
    if (!confirm(t('Cancel this night? Free of charge before 10:00.', 'Annuler cette soirée ? Sans frais avant 10 h.'))) return;
    startTransition(async () => {
      const res = await fetch('/api/order/cancel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, serviceDate: menu.service_date }),
      });
      if (!res.ok) { setError(t('Could not cancel. Please try again.', 'Annulation impossible. Merci de réessayer.')); return; }
      router.push(`/my/${token}`);
      router.refresh();
    });
  }

  const title = lang === 'fr' && menu.title_fr ? menu.title_fr : menu.title;
  const subtitle = lang === 'fr' && menu.subtitle_fr ? menu.subtitle_fr : menu.subtitle;

  if (done) {
    return (
      <>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Pirate by Night · {formatServiceDate(menu.service_date, lang)}</p>
          <h1 className={styles.title}>{t('You are booked', 'C\u2019est réservé')}</h1>
          <p className={styles.meta}>{done.order_ref} · {done.cover_count} {t('covers', 'couverts')} · {formatEuro(done.total_cents ?? total, lang)}</p>
        </header>
        <section className={styles.body}>
          <p className={styles.lead}>
            {t(
              'A confirmation is on its way to your email. You can change or cancel this night until 10:00 that morning; your card is charged at 10:00.',
              'Une confirmation part vers votre e-mail. Vous pouvez modifier ou annuler cette soirée jusqu\u2019à 10 h le matin même ; votre carte est débitée à 10 h.',
            )}
          </p>
          <a href={`/my/${token}`} className={styles.submit} style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
            {t('Back to your nights', 'Retour à vos soirées')}
          </a>
        </section>
      </>
    );
  }

  return (
    <>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Pirate by Night · {isBuffet ? t('Buffet night', 'Soirée buffet') : t('Menu of the day', 'Menu du jour')}</p>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        <p className={styles.meta}>{formatServiceDate(menu.service_date, lang)} · {t('from 19:00', 'à partir de 19 h')}</p>
      </header>

      {(guest.dietary_flags.length > 0 || guest.allergy_notes) && (
        <aside className={styles.allergyBanner}>
          <strong>{t('We have on file:', 'Nous avons noté :')}</strong>{' '}
          {guest.dietary_flags.join(', ')}{guest.allergy_notes ? ` — ${guest.allergy_notes}` : ''}.{' '}
          {isBuffet ? t('The buffet is labelled for allergens.', 'Le buffet est étiqueté pour les allergènes.') : t('The menu below is filtered accordingly.', 'Le menu ci-dessous est filtré pour vous.')}
        </aside>
      )}

      {isBuffet ? (
        <section className={styles.course}>
          <h2 className={styles.courseTitle}>{t('The buffet', 'Le buffet')}</h2>
          <div className={styles.choices}>
            {menu.items.map((item) => (
              <div key={item.id} className={styles.choice} style={{ cursor: 'default' }}>
                <span className={styles.choiceName}>{lang === 'fr' && item.name_fr ? item.name_fr : item.name}</span>
                {item.description && <span className={styles.choiceDesc}>{lang === 'fr' && item.description_fr ? item.description_fr : item.description}</span>}
                {item.allergens.length > 0 && <span className={styles.choiceAllergens}>{item.allergens.join(' · ')}</span>}
              </div>
            ))}
          </div>
          <p className={styles.finePrint}>{formatEuro(coverPrice, lang)} {t('per adult, all included except drinks.', 'par adulte, tout compris sauf boissons.')}</p>
        </section>
      ) : (
        <>
          <section className={styles.course} style={{ marginBottom: 24 }}>
            <label className={styles.field}>
              <span>{t('Adults dining', 'Adultes à table')}</span>
              <input type="number" min={1} max={8} value={coverCount} disabled={!canEdit} onChange={(e) => setCoverCount(Number(e.target.value))} />
            </label>
            <p className={styles.finePrint} style={{ marginTop: 8 }}>
              {t('Each guest chooses their own starter, main and dessert.', 'Chaque convive choisit son entrée, son plat et son dessert.')}
            </p>
          </section>

          <nav className={styles.seatTabs} aria-label={t('Guests', 'Convives')}>
            {seats.map((st, idx) => (
              <button
                key={idx}
                type="button"
                className={idx === activeSeat ? styles.seatTabActive : styles.seatTab}
                onClick={() => setActiveSeat(idx)}
              >
                <span>{t('Guest', 'Convive')} {idx + 1}</span>
                <small>{seatComplete(st) ? formatEuro(seatTotal(st), lang) : t('to choose', 'à choisir')}</small>
              </button>
            ))}
          </nav>

          {activeSeat > 0 && canEdit && (
            <p className={styles.finePrint} style={{ marginTop: -8, marginBottom: 20 }}>
              <button type="button" className={styles.linkBtn} onClick={() => copySeat(0, activeSeat)}>
                {t('Same as Guest 1', 'Comme le convive 1')}
              </button>
            </p>
          )}

          {COURSES.map((c) => itemsByCourse[c.key].length > 0 && (
            <section key={`${activeSeat}-${c.key}`} className={styles.course}>
              <h2 className={styles.courseTitle}>{lang === 'fr' ? c.label_fr : c.label}</h2>
              <div className={styles.choices}>
                {itemsByCourse[c.key].map((item) => {
                  const selected = seats[activeSeat][c.key] === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={!canEdit}
                      className={selected ? styles.choiceSelected : styles.choice}
                      onClick={() => choose(activeSeat, c.key, item.id)}
                      aria-pressed={selected}
                    >
                      <span className={styles.choiceName}>{lang === 'fr' && item.name_fr ? item.name_fr : item.name}</span>
                      {item.description && <span className={styles.choiceDesc}>{lang === 'fr' && item.description_fr ? item.description_fr : item.description}</span>}
                      {item.allergens.length > 0 && <span className={styles.choiceAllergens}>{item.allergens.join(' · ')}</span>}
                      {item.price_cents != null && <span className={styles.choicePrice}>{formatEuro(item.price_cents, lang)}</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}

          <section className={styles.course}>
            <label className={styles.field}>
              <span>{t(`Guest ${activeSeat + 1} · cooking or preference`, `Convive ${activeSeat + 1} · cuisson ou préférence`)}</span>
              <input
                type="text"
                maxLength={200}
                value={seatNotes[activeSeat]}
                disabled={!canEdit}
                onChange={(e) => setSeatNotes((prev) => prev.map((n, i) => (i === activeSeat ? e.target.value : n)))}
                placeholder={t('e.g. medium rare, no cilantro', 'ex. à point, sans coriandre')}
              />
            </label>
          </section>

          {activeSeat < seats.length - 1 && (
            <p className={styles.finePrint}>
              <button type="button" className={styles.linkBtn} onClick={() => setActiveSeat(activeSeat + 1)}>
                {t(`Next: Guest ${activeSeat + 2} →`, `Suivant : convive ${activeSeat + 2} →`)}
              </button>
            </p>
          )}
        </>
      )}

      <section className={styles.footerBlock}>
        {isBuffet && (
          <label className={styles.field}>
            <span>{t('Adults dining', 'Adultes à table')}</span>
            <input type="number" min={1} max={8} value={coverCount} disabled={!canEdit} onChange={(e) => setCoverCount(Number(e.target.value))} />
          </label>
        )}
        <label className={styles.field}>
          <span>{t('A note for the table?', 'Une note pour la table ?')}</span>
          <textarea rows={3} value={notes} disabled={!canEdit} onChange={(e) => setNotes(e.target.value)}
            placeholder={t('Doneness, preferences, a celebration…', 'Cuisson, préférences, une occasion à fêter…')} />
        </label>

        <div className={styles.totalRow}>
          <span>{t('Total for this night', 'Total pour cette soirée')}</span>
          <span className={styles.price}>{formatEuro(total, lang)}</span>
        </div>
        {!isBuffet && (
          <ul className={styles.seatSummary}>
            {seats.map((st, idx) => (
              <li key={idx}>
                <span>{t('Guest', 'Convive')} {idx + 1} · {COURSES.map((c) => menu.items.find((i) => i.id === st[c.key])).filter(Boolean).map((i) => (lang === 'fr' && i!.name_fr ? i!.name_fr : i!.name)).join(', ') || t('nothing chosen yet', 'rien de choisi')}</span>
                <span>{formatEuro(seatTotal(st), lang)}</span>
              </li>
            ))}
          </ul>
        )}

        {error && <p className={styles.error}>{error}</p>}

        {canEdit ? (
          <>
            <button type="button" className={styles.submit} disabled={isPending} onClick={submit}>
              {isPending ? t('Sending…', 'Envoi…') : existing ? t('Save changes', 'Enregistrer') : t('Confirm this night', 'Confirmer cette soirée')}
            </button>
            {existing && (
              <p className={styles.finePrint}>
                <button type="button" className={styles.danger} onClick={cancel} disabled={isPending}>{t('Cancel this night', 'Annuler cette soirée')}</button>
              </p>
            )}
            <p className={styles.finePrint}>
              {t('Free changes until 10:00 on the day. Your card is charged at 10:00; no refund after that.', 'Modification gratuite jusqu\u2019à 10 h le jour même. Carte débitée à 10 h ; pas de remboursement ensuite.')}
            </p>
          </>
        ) : (
          <p className={styles.finePrint}>
            {t('This night is final: bookings closed at 10:00.', 'Cette soirée est définitive : les réservations ont fermé à 10 h.')}
          </p>
        )}
      </section>
    </>
  );
}
