'use client';

import type { TonightSummary } from '@/lib/dashboard';
import styles from '../dashboard.module.css';

export function KpiTiles({ summary }: { summary: TonightSummary }) {
  const missingCritical = summary.roomsMissing > 0 && summary.windowState !== 'open' && summary.windowState !== 'not_yet_open';

  const tiles = [
    {
      label: 'Covers tonight',
      value: summary.coversConfirmed,
      sub: `of ${summary.guestsInHouse} guests in house`,
      tone: 'default' as const,
    },
    {
      label: 'Orders in',
      value: summary.roomsSubmitted,
      sub: `${summary.roomsOccupied} rooms occupied`,
      tone: 'default' as const,
    },
    {
      label: 'Awaiting order',
      value: summary.roomsMissing,
      sub: summary.windowState === 'open' ? 'Ordering still open' : 'Follow up before 14:00',
      tone: missingCritical ? 'warn' : 'default' as const,
    },
    {
      label: 'Chef\'s choice',
      value: summary.roomsChefsChoice,
      sub: 'Rooms defaulted after hard lock',
      tone: 'muted' as const,
    },
  ];

  return (
    <section className={styles.kpiGrid} aria-label="Service KPIs">
      {tiles.map((t) => (
        <article key={t.label} className={`${styles.kpiTile} ${t.tone === 'warn' ? styles.kpiWarn : t.tone === 'muted' ? styles.kpiMuted : ''}`}>
          <p className={styles.kpiLabel}>{t.label}</p>
          <p className={styles.kpiValue}>{t.value}</p>
          <p className={styles.kpiSub}>{t.sub}</p>
        </article>
      ))}
    </section>
  );
}
