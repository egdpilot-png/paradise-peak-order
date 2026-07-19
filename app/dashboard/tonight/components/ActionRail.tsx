'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { TonightSummary } from '@/lib/dashboard';
import styles from '../dashboard.module.css';

interface Props { date: string; summary: TonightSummary; }

export function ActionRail({ date, summary }: Props) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [modal, setModal] = useState<null | { title: string; body: string; onConfirm: () => void }>(null);

  function call(url: string, label: string) {
    return () => startTransition(async () => {
      setStatus(null);
      const res = await fetch(url, { method: 'POST' });
      if (res.ok) {
        setStatus(`${label} · done`);
        router.refresh();
      } else {
        const err = await res.json().catch(() => ({}));
        setStatus(`${label} · ${err?.error ?? 'failed'}`);
      }
    });
  }

  async function whatsapp() {
    const res = await fetch(`/api/dashboard/digest?date=${date}`);
    const { digest, wa_url } = await res.json();
    setModal({
      title: 'WhatsApp digest for kitchen',
      body: digest,
      onConfirm: () => {
        window.open(wa_url, '_blank', 'noopener');
        setModal(null);
      },
    });
  }

  return (
    <section className={styles.actionRail} aria-label="Kitchen actions">
      <h2 className={styles.actionTitle}>Kitchen actions</h2>
      <div className={styles.actionGrid}>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={whatsapp}
          disabled={busy}
        >
          <span className={styles.actionLabel}>Send WhatsApp digest</span>
          <span className={styles.actionSub}>Push tonight's covers & allergies to kitchen line</span>
        </button>

        <button
          type="button"
          className={styles.actionBtn}
          onClick={call(`/api/dashboard/chefs-choice?date=${date}`, 'Chef\'s choice assigned')}
          disabled={busy || summary.roomsMissing === 0}
        >
          <span className={styles.actionLabel}>Assign chef's choice ({summary.roomsMissing})</span>
          <span className={styles.actionSub}>Auto-order for rooms with no submission</span>
        </button>

        <button
          type="button"
          className={styles.actionBtn}
          onClick={call(`/api/dashboard/lock?date=${date}`, 'Orders locked')}
          disabled={busy || summary.lockedAt != null}
        >
          <span className={styles.actionLabel}>{summary.lockedAt ? 'Orders locked' : 'Lock orders now'}</span>
          <span className={styles.actionSub}>Freezes menu — no further guest edits</span>
        </button>

        <a
          className={styles.actionBtn}
          href={`/api/dashboard/book.pdf?date=${date}`}
          target="_blank"
          rel="noopener"
        >
          <span className={styles.actionLabel}>Print The Book (PDF)</span>
          <span className={styles.actionSub}>Backup service sheet · one page per room</span>
        </a>
      </div>

      {status && <p className={styles.actionStatus}>{status}</p>}

      {modal && (
        <div className={styles.modalBackdrop} onClick={() => setModal(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>{modal.title}</h3>
            <pre className={styles.modalBody}>{modal.body}</pre>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnGhost} onClick={() => setModal(null)}>Close</button>
              <button type="button" className={styles.btnPrimary} onClick={modal.onConfirm}>Open in WhatsApp</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
