'use client';

import type { RoomRow, RoomStatus } from '@/lib/dashboard';
import type { ServiceType } from '@/lib/types';
import styles from '../dashboard.module.css';

const STATUS_LABEL: Record<RoomStatus, string> = {
  submitted: 'Ordered',
  buffet_confirmed: 'Buffet confirmed',
  pending: 'Awaiting card',
  chefs_choice: "Chef's choice",
  late_window: 'Late window',
  not_dining: 'Not dining',
  no_order: 'No order',
};

const STATUS_TONE: Record<RoomStatus, string> = {
  submitted: styles.toneGood,
  buffet_confirmed: styles.toneGood,
  pending: styles.toneWarn,
  chefs_choice: styles.tonePending,
  late_window: styles.toneWarn,
  not_dining: styles.toneMuted,
  no_order: styles.toneCrit,
};

const PAY_LABEL: Record<string, string> = {
  card_on_file: 'Card on file',
  charging: 'Charging',
  charged: 'Paid',
  failed: 'Payment declined',
  refunded: 'Refunded',
};
const PAY_TONE: Record<string, string> = {
  card_on_file: styles.toneMuted,
  charging: styles.tonePending,
  charged: styles.toneGood,
  failed: styles.toneCrit,
  refunded: styles.toneMuted,
};
const euro = (c: number) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', minimumFractionDigits: c % 100 === 0 ? 0 : 2 }).format(c / 100);

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
                      <span className={styles.roomCourseDish}>
                        {c.qty && c.qty > 1 ? `${c.qty}× ` : ''}{c.dish_name}
                        {c.notes ? <em style={{ color: '#8B867B' }}> — {c.notes}</em> : null}
                      </span>
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
                ) : r.status === 'not_dining' ? (
                  <p className={styles.roomNoteMuted}>Guest declared: not dining tonight</p>
                ) : null
              )}

              {r.status === 'pending' && (
                <p className={styles.roomNoteMuted}>Not confirmed: the guest has not added a card yet. Do not prepare.</p>
              )}
              {PAY_LABEL[r.payment_status ?? ''] && r.status !== 'pending' && (
                <p className={styles.roomNote}>
                  <span className={`${styles.chip} ${PAY_TONE[r.payment_status ?? '']}`}>{PAY_LABEL[r.payment_status ?? '']}</span>
                  {r.total_cents != null ? ` ${euro(r.total_cents)}` : ''}
                  {r.payment_status === 'failed' && r.payment_error ? <em style={{ color: '#8B867B' }}> — {r.payment_error}</em> : null}
                </p>
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
