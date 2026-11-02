'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { registerGuest, type JoinResult } from './actions';
import styles from '@/app/my/guest.module.css';

const FLAGS: { key: string; en: string; fr: string }[] = [
  { key: 'vegetarian', en: 'Vegetarian', fr: 'Végétarien' },
  { key: 'vegan', en: 'Vegan', fr: 'Végan' },
  { key: 'pescatarian', en: 'Pescatarian', fr: 'Pescétarien' },
  { key: 'gluten_free', en: 'Gluten-free', fr: 'Sans gluten' },
  { key: 'dairy_free', en: 'Dairy-free', fr: 'Sans lactose' },
  { key: 'nut_allergy', en: 'Nut allergy', fr: 'Allergie fruits à coque' },
  { key: 'shellfish_allergy', en: 'Shellfish allergy', fr: 'Allergie crustacés' },
  { key: 'no_pork', en: 'No pork', fr: 'Sans porc' },
  { key: 'no_alcohol', en: 'No alcohol', fr: 'Sans alcool' },
  { key: 'halal', en: 'Halal', fr: 'Halal' },
];

export function JoinForm({ src, initialLang }: { src: string; initialLang: 'en' | 'fr' }) {
  const [lang, setLang] = useState<'en' | 'fr'>(initialLang);
  const [state, action] = useFormState<JoinResult | null, FormData>(registerGuest, null);
  const t = (en: string, fr: string) => (lang === 'fr' ? fr : en);

  return (
    <main className={styles.frame}>
      <div className={styles.langSwitch}>
        <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>English</button>
        <button type="button" aria-pressed={lang === 'fr'} onClick={() => setLang('fr')}>Français</button>
      </div>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Pirate by Night · The Paradise Peak</p>
        <h1 className={styles.title}>{t('Dinner at the Peak', 'Dîner au Peak')}</h1>
        <p className={styles.subtitle}>
          {t(
            'Private dinners served at the property, Monday to Saturday. Register once, then book any night of your stay.',
            'Dîners privés servis sur place, du lundi au samedi. Inscrivez-vous une fois, puis réservez les soirées de votre choix.',
          )}
        </p>
      </header>

      <section className={styles.card}>
        <p className={styles.cardTitle}>{t('How it works', 'Comment ça marche')}</p>
        <p className={styles.lead} style={{ margin: 0 }}>
          {t(
            'Monday and Friday: Caribbean buffet, €55 per person. Tuesday to Saturday (except Friday): fixed menu of the day, served plated, priced per dish. No service on Sundays. Change or cancel free of charge until 10:00 on the day.',
            'Lundi et vendredi : buffet caribéen, 55 € par personne. Du mardi au samedi (sauf vendredi) : menu du jour servi à l\u2019assiette, prix par plat. Pas de service le dimanche. Modification ou annulation gratuite jusqu\u2019à 10 h le jour même.',
          )}
        </p>
      </section>

      <form action={action} className={styles.body}>
        <input type="hidden" name="lang" value={lang} />
        <input type="hidden" name="src" value={src} />

        <div className={styles.grid2}>
          <label className={styles.field}>
            <span>{t('Your name', 'Votre nom')}</span>
            <input name="guest_name" required autoComplete="name" />
          </label>
          <label className={styles.field}>
            <span>{t('Adults dining', 'Adultes à table')}</span>
            <input name="party_size" type="number" min={1} max={8} defaultValue={2} />
          </label>
        </div>

        <div className={styles.grid2} style={{ marginTop: 14 }}>
          <label className={styles.field}>
            <span>Email</span>
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <label className={styles.field}>
            <span>{t('Mobile / WhatsApp', 'Mobile / WhatsApp')}</span>
            <input name="phone" type="tel" required placeholder="+33 6 …" autoComplete="tel" />
          </label>
        </div>

        <div className={styles.grid2} style={{ marginTop: 14 }}>
          <label className={styles.field}>
            <span>{t('Arrival', 'Arrivée')}</span>
            <input name="check_in" type="date" required />
          </label>
          <label className={styles.field}>
            <span>{t('Departure', 'Départ')}</span>
            <input name="check_out" type="date" required />
          </label>
        </div>

        <div className={styles.grid2} style={{ marginTop: 14 }}>
          <label className={styles.field}>
            <span>{t('Room (if you know it)', 'Chambre (si connue)')}</span>
            <input name="room" placeholder={t('e.g. 5', 'ex. 5')} />
          </label>
          <label className={styles.field}>
            <span>{t('Booking reference (optional)', 'Référence de réservation (facultatif)')}</span>
            <input name="booking_ref" />
          </label>
        </div>

        <div className={styles.field} style={{ marginTop: 18 }}>
          <span>{t('Allergies and preferences', 'Allergies et préférences')}</span>
          <div className={styles.checks}>
            {FLAGS.map((f) => (
              <label key={f.key} className={styles.check}>
                <input type="checkbox" name="dietary_flags" value={f.key} />
                {lang === 'fr' ? f.fr : f.en}
              </label>
            ))}
          </div>
        </div>
        <label className={styles.field} style={{ marginTop: 14 }}>
          <span>{t('Anything the chef must know?', 'Quelque chose que le chef doit savoir ?')}</span>
          <textarea name="allergy_notes" rows={2} placeholder={t('Severity, other allergies, celebrations…', 'Gravité, autres allergies, occasions à fêter…')} />
        </label>

        <label className={styles.consent} style={{ marginTop: 18 }}>
          <input type="checkbox" name="accept_terms" required />
          <span>
            {t('I am an adult and I accept the ', 'Je suis majeur(e) et j\u2019accepte les ')}
            <a href={`/terms?lang=${lang}`} target="_blank" rel="noreferrer">
              {t('dinner service conditions', 'conditions du service de dîner')}
            </a>
            {t(
              ': free changes until 10:00 on the day, charged at 10:00, no refund after; dinner delivered and served by the Paradise Peak team if fewer than 4 guests dine that night.',
              ' : modification gratuite jusqu\u2019à 10 h le jour même, prélèvement à 10 h, pas de remboursement ensuite ; dîner livré et servi par l\u2019équipe Paradise Peak si moins de 4 convives ce soir-là.',
            )}
          </span>
        </label>

        {state && !state.ok && <p className={styles.error}>{state.error}</p>}

        <SubmitButton label={t('Continue to the menus', 'Voir les menus')} pendingLabel={t('One moment…', 'Un instant…')} />
        <p className={styles.finePrint}>
          {t(
            'A card will be requested before your first booking is confirmed. Nothing is charged until 10:00 on the day of the dinner.',
            'Une carte vous sera demandée avant la confirmation de votre première réservation. Rien n\u2019est prélevé avant 10 h le jour du dîner.',
          )}
        </p>
      </form>
    </main>
  );
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.submit} disabled={pending} style={{ marginTop: 18 }}>
      {pending ? pendingLabel : label}
    </button>
  );
}
