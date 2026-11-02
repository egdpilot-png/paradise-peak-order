// Monthly partner statement — Paradise Peak commission on dinner sales.

import { redirect } from 'next/navigation';
import { getDashboardUser } from '@/lib/auth';
import { loadStatement } from '@/lib/statement';
import { todayInMarigot } from '@/lib/time';
import styles from './statement.module.css';

interface Props { searchParams: Promise<{ month?: string }> }

const eur = (c: number) => (c / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const shiftMonth = (m: string, n: number) => {
  const [y, mm] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mm - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

export default async function StatementPage({ searchParams }: Props) {
  const user = await getDashboardUser();
  if (!user) redirect('/dashboard/login');
  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? '') ? params.month! : todayInMarigot().slice(0, 7);
  const st = await loadStatement(month);
  const label = new Date(month + '-15T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <div>
          <p className={styles.eyebrow}>Pirate at Night · Partner statement</p>
          <h1 className={styles.title}>
            <a className={styles.nav} href={`/dashboard/statement?month=${shiftMonth(month, -1)}`}>‹</a>
            {' '}{label}{' '}
            <a className={styles.nav} href={`/dashboard/statement?month=${shiftMonth(month, 1)}`}>›</a>
          </h1>
          <p className={styles.sub}>
            The Paradise Peak · commission {st.commission_bps / 100} % on dinner sales · payable at month end
          </p>
        </div>
        <div className={styles.actions}>
          <a className={styles.btn} href={`/api/dashboard/statement.csv?month=${month}`}>Download CSV</a>
          <a className={styles.btnGhost} href="/dashboard/tonight">Back to tonight</a>
        </div>
      </header>

      <section className={styles.tiles}>
        <div className={styles.tile}><span>Nights served</span><strong>{st.nights.filter(n => n.due).length}</strong></div>
        <div className={styles.tile}><span>Covers</span><strong>{st.totals.covers}</strong></div>
        <div className={styles.tile}><span>Dinner sales</span><strong>{eur(st.totals.sales_cents)}</strong></div>
        <div className={`${styles.tile} ${styles.tileAccent}`}><span>Commission due to Paradise Peak</span><strong>{eur(st.totals.commission_cents)}</strong></div>
      </section>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Date</th><th>Night</th><th>Service</th><th className={styles.num}>Rooms</th><th className={styles.num}>Covers</th>
            <th className={styles.num}>Sales</th><th className={styles.num}>Charged</th><th className={styles.num}>Commission</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {st.nights.length === 0 && (
            <tr><td colSpan={9} className={styles.empty}>No bookings in this month.</td></tr>
          )}
          {st.nights.map((n) => (
            <tr key={n.service_date} className={n.due ? '' : styles.upcoming}>
              <td>{new Date(n.service_date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
              <td>{n.kind === 'buffet' ? 'Buffet' : 'Plated'}</td>
              <td>{n.format === 'onsite' ? 'On site' : n.format === 'delivered' ? 'Delivered' : '—'}</td>
              <td className={styles.num}>{n.rooms}</td>
              <td className={styles.num}>{n.covers}</td>
              <td className={styles.num}>{eur(n.sales_cents)}</td>
              <td className={styles.num}>{n.charged_cents ? eur(n.charged_cents) : '—'}</td>
              <td className={styles.num}>{n.due ? eur(n.commission_cents) : '—'}</td>
              <td>{n.due ? 'served' : 'upcoming'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}>Total due · {st.commission_bps / 100} % of {eur(st.totals.sales_cents)}</td>
            <td className={styles.num}>{st.totals.rooms}</td>
            <td className={styles.num}>{st.totals.covers}</td>
            <td className={styles.num}>{eur(st.totals.sales_cents)}</td>
            <td className={styles.num}>{st.totals.charged_cents ? eur(st.totals.charged_cents) : '—'}</td>
            <td className={styles.num}><strong>{eur(st.totals.commission_cents)}</strong></td>
            <td />
          </tr>
        </tfoot>
      </table>

      {st.upcoming.nights > 0 && (
        <p className={styles.note}>
          Also booked for later this month: {st.upcoming.nights} night{st.upcoming.nights === 1 ? '' : 's'}, {st.upcoming.covers} covers, {eur(st.upcoming.sales_cents)} — not yet due.
        </p>
      )}
      <p className={styles.note}>
        Sales are the totals of confirmed bookings for nights already served (cancellations excluded). “Charged” fills in once card payments are live.
        Commission rate is fixed in the application settings ({st.commission_bps / 100} %).
      </p>
    </main>
  );
}
