'use client';

import type { TonightSummary } from '@/lib/dashboard';
import styles from '../dashboard.module.css';

const WINDOW_LABEL: Record<TonightSummary['windowState'], string> = {
  not_yet_open: 'Menu not yet published',
  open: 'Ordering open · closes at 10:00',
  late: 'Late window · kitchen prepping',
  past_hard_lock: 'Hard-locked · chef\'s choice for missing',
  past_service: 'Service complete',
};

const WINDOW_TONE: Record<TonightSummary['windowState'], string> = {
  not_yet_open: styles.tonePending,
  open: styles.toneGood,
  late: styles.toneWarn,
  past_hard_lock: styles.toneCrit,
  past_service: styles.toneMuted,
};

function serviceLabel(s: string | null): string {
  if (!s) return 'No menu published';
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatLongDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z');
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function HeaderRail({
  summary,
  userName,
  lastPing,
}: {
  summary: TonightSummary;
  userName: string;
  lastPing: Date | null;
}) {
  return (
    <header className={styles.headerRail}>
      <div className={styles.headerLeft}>
        <p className={styles.eyebrow}>Pirate at Night · The Paradise Peak</p>
        <h1 className={styles.headerTitle}>{formatLongDate(summary.serviceDate)}</h1>
        <p className={styles.headerSubtitle}>
          {serviceLabel(summary.serviceType)}
          {summary.menu ? ` · ${summary.menu.title}` : ''}
        </p>
      </div>
      <div className={styles.headerRight}>
        <span className={`${styles.chip} ${WINDOW_TONE[summary.windowState]}`}>
          {WINDOW_LABEL[summary.windowState]}
        </span>
        <div className={styles.liveDot} aria-hidden />
        <span className={styles.liveText}>
          Live · {lastPing ? `updated ${timeAgo(lastPing)}` : 'awaiting first order'}
        </span>
      </div>
    </header>
  );
}

function timeAgo(d: Date): string {
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
