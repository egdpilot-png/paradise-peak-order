'use client';

import type { RoomRow, RoomStatus } from '@/lib/dashboard';
import type { ServiceType } from '@/lib/types';
import styles from '../dashboard.module.css';

const STATUS_LABEL: Record<RoomStatus, string> = {
  submitted: 'Ordered',
  buffet_confirmed: 'Buffet confirmed',
  pending: 'Draft',
  chefs_choice: "Chef's choice",
  late_window: 'Late window',
  no_order: 'No order',
};

const STATUS_TONE: Record<RoomStatus, string> = {
  submitted: styles.toneGood,
  buffet_confirmed: styles.toneGood,
  pending: styles.toneWarn,
  chefs_choice: styles.tonePending,
  late_window: styles.toneWarn,
  no_order: styles.toneCrit,
};

export function RoomStrip({ rooms, serviceType }: { rooms: RoomRow[]; serviceType: ServiceType | null }) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Rooms tonight</h2>
        <span className={styles.panelMeta}>{rooms.length} occupied</span>
      </div>

      {rooms.length === 0 ? (
        <p className={styles.emptyState}>No rooms occupied for this date.</p>
      ) : (
        <div className={styles.roomGrid}>
          {rooms.map((r) => (
            <article key={r.room} className={styles.roomCard}>
              <header className={styles.roomHead}>
                <div>
                  <p className={styles.roomLabel}>Room</p>
                  <p className={styles.roomNumber}>{r.room}</p>
                </div>
                <span className={`${styles.chip} ${STATUS_TONE[r.status]}`}>
                  {STATUS_LABEL[r.status]}
                </span>
              </header>

              <p className={styles.roomGuest}>
                {r.guest_name ?? 'Guest'} · <span className={styles.roomMeta}>party of {r.party_size} · {r.language.toUpperCase()}</span>
              </p>

              {r.dietary_flags.length > 0 && (
                <ul className={styles.roomFlags}>
                  {r.dietary_flags.map((f) => (
                    <li key={f} className={styles.roomFlag}>{f.replace(/_/g, ' ')}</li>
                  ))}
                </ul>
              )}

              {r.courses.length > 0 ? (
                <ul className={styles.roomCourses}>
                  {r.courses.map((c, i) => (
                    <li key={i} className={styles.roomCourse}>
                      <span className={styles.roomCourseType}>{c.course}</span>
                      <span className={styles.roomCourseDish}>{c.dish_name}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                serviceType === 'buffet' && r.status === 'buffet_confirmed' ? (
                  <p className={styles.roomNote}>Buffet — {r.cover_count} covers confirmed</p>
                ) : r.status === 'chefs_choice' ? (
                  <p className={styles.roomNote}>Chef's choice · {r.cover_count} covers</p>
                ) : r.status === 'no_order' ? (
                  <p className={styles.roomNoteMuted}>Awaiting order</p>
                ) : null
              )}

              {r.notes && <p className={styles.roomNoteQuote}>"{r.notes}"</p>}
              {r.order_ref && <p className={styles.roomRef}>{r.order_ref}</p>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
