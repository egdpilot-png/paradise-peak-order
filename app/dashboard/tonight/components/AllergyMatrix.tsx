'use client';

import type { AllergyRow } from '@/lib/dashboard';
import styles from '../dashboard.module.css';

export function AllergyMatrix({ allergies }: { allergies: AllergyRow[] }) {
  const anyConflict = allergies.some(a => a.guests.some(g => g.conflict));

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Allergy matrix</h2>
        {anyConflict && <span className={`${styles.chip} ${styles.toneCrit}`}>Conflict flagged</span>}
      </div>

      {allergies.length === 0 ? (
        <p className={styles.emptyState}>No dietary flags for tonight's guests.</p>
      ) : (
        <ul className={styles.allergyList}>
          {allergies.map((a) => (
            <li key={a.flag} className={`${styles.allergyRow} ${a.guests.some(g => g.conflict) ? styles.allergyRowConflict : ''}`}>
              <div className={styles.allergyFlag}>{a.label}</div>
              <div className={styles.allergyGuests}>
                {a.guests.map((g) => (
                  <div key={g.guest_id} className={styles.allergyGuest}>
                    <span className={styles.allergyRoom}>Room {g.room}</span>
                    <span className={styles.allergyName}>
                      {g.guest_name ?? '—'}
                      {g.allergy_notes && <em className={styles.allergyNote}> · {g.allergy_notes}</em>}
                    </span>
                    {g.conflict && (
                      <span className={`${styles.chip} ${styles.toneCrit}`}>
                        Conflict: {g.conflict_dishes.join(', ')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
