'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../guest.module.css';

export function NotDiningButton({ token, date, skipped, lang }: { token: string; date: string; skipped: boolean; lang: 'en' | 'fr' }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const t = (en: string, fr: string) => (lang === 'fr' ? fr : en);

  function toggle() {
    setErr(null);
    start(async () => {
      const res = await fetch('/api/night-skip', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, serviceDate: date, skip: !skipped }),
      });
      if (!res.ok) { setErr(t('Could not save, please try again.', 'Enregistrement impossible, réessayez.')); return; }
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" onClick={toggle} disabled={pending} className={`${styles.pill} ${skipped ? '' : styles.pillMuted}`}>
        {pending ? '…' : skipped ? t('Changed my mind', 'J\u2019ai changé d\u2019avis') : t('Not dining', 'Je ne dîne pas')}
      </button>
      {err && <span className={styles.nightStatus} style={{ color: '#8B3A2E' }}>{err}</span>}
    </>
  );
}
