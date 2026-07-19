'use client';

// After 14:00: kitchen mise-en-place is locked. Guest with no order
// will receive chef's choice per §5.3 of the SLA.

import type { Menu } from '@/lib/types';
import styles from './styles.module.css';

interface Props { menu: Menu; room: string; }

export function PastCutoffView({ menu, room }: Props) {
  return (
    <main className={styles.frame}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Pirate at Night · Tonight</p>
        <h1 className={styles.title}>Room {room}, you're taken care of.</h1>
      </header>

      <section className={styles.body}>
        <p className={styles.lead}>
          You haven't placed an order today, so the chef is choosing for you.
          Expect three courses at 18:00 — a starter, a main, and something
          sweet to finish.
        </p>
        <p className={styles.lead}>
          Tomorrow's menu will be at your table at breakfast. Sleep well.
        </p>
      </section>
    </main>
  );
}
