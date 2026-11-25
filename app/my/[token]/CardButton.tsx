'use client';

// Opens Stripe's hosted page so the guest can save or replace their card.

import { useState, useTransition } from 'react';
import styles from '../guest.module.css';

export function CardButton({ token, label, lang, solid }: { token: string; label: string; lang: 'en' | 'fr'; solid?: boolean }) {
  const [pending, start] = useTransition();
  const [leaving, setLeaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const t = (en: string, fr: string) => (lang === 'fr' ? fr : en);

  function open() {
    setErr(null);
    start(async () => {
      const res = await fetch('/api/card/setup', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) { setErr(t('The card page could not be opened. Please try again.', 'La page de carte n\u2019a pas pu s\u2019ouvrir. Merci de réessayer.')); return; }
      setLeaving(true);
      window.location.assign(data.url);
    });
  }

  return (
    <>
      <button type="button" onClick={open} disabled={pending || leaving} className={`${styles.pill} ${solid ? styles.pillSolid : ''}`} style={{ cursor: 'pointer' }}>
        {pending || leaving ? t('Opening…', 'Ouverture…') : label}
      </button>
      {err && <p className={styles.error} style={{ marginTop: 8 }}>{err}</p>}
    </>
  );
}
