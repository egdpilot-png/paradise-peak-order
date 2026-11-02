'use client';

import type { TonightSummary } from '@/lib/dashboard';
import styles from '../dashboard.module.css';

export function KpiTiles({ summary }: { summary: TonightSummary }) {
  const missingCritical = summary.roomsMissing > 0 && summary.windowState !== 'open' && summary.windowState !== 'not_yet_open';

  const belowMin = summary.coversConfirmed < summary.minCoversOnsite;
  const formatLabel = summary.serviceFormat === 'closed' ? 'Closed (Sunday)'
    : summary.serviceFormat === 'pending' ? (belowMin ? `Below ${summary.minCoversOnsite} — delivered if unchanged` : 'On-site plated service')
    : summary.serviceFormat === 'onsite' ? 'On-site plated service' : 'Delivered — Paradise Peak serves';
  const euro = (c: number) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(c / 100);

  const tiles = [
    {
      label: 'Covers tonight',
      value: summary.coversConfirmed,
      sub: `min ${summary.minCoversOnsite} for on-site · ${formatLabel}`,
      tone: (belowMin && summary.serviceFormat !== 'closed' ? 'warn' : 'default') as 'warn' | 'default',
    },
    {
      label: 'Booked value',
      value: euro(summary.revenueCents),
      sub: summary.chargedCents > 0 ? `${euro(summary.chargedCents)} charged` : 'Charged at 10:00',
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
      sub: (summary.roomsNotDining ? `${summary.roomsNotDining} not dining · ` : '') + (summary.windowState === 'open' ? 'Ordering still open' : 'Follow up before 14:00'),
      tone: missingCritical ? 'warn' : 'default' as const,
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
