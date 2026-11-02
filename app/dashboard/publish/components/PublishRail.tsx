'use client';

import { useState } from 'react';
import styles from '../publisher.module.css';

interface Props {
  status: string | null;
  busy: boolean;
  onSaveDraft: () => void;
  onPublish: () => void;
  onPublishWeek: () => void;
  onPublishSeason: (until: string, overwrite: boolean) => void;
  seasonEndDefault: string;
  publishLabel: string;
  hasExistingPublished: boolean;
}

export function PublishRail({
  status, busy, onSaveDraft, onPublish, onPublishWeek, onPublishSeason, seasonEndDefault, publishLabel, hasExistingPublished,
}: Props) {
  const ok = status?.startsWith('Published') || status?.startsWith('Draft saved') || status?.startsWith('Price') || status?.startsWith('Season');
  const [seasonOpen, setSeasonOpen] = useState(false);
  const [until, setUntil] = useState(seasonEndDefault);
  const [overwrite, setOverwrite] = useState(false);

  return (
    <div className={styles.publishRail}>
      {status && (
        <p className={`${styles.publishStatus} ${ok ? styles.publishStatusOk : styles.publishStatusWarn}`}>
          {status}
        </p>
      )}
      <button type="button" className={styles.btnGhostLight} onClick={onSaveDraft} disabled={busy}>
        Save drafts
      </button>
      <button type="button" className={styles.btnGhostLight} onClick={onPublishWeek} disabled={busy} title="Publish every night of this week that is complete">
        Publish week
      </button>
      <button type="button" className={styles.btnGhostLight} onClick={() => setSeasonOpen((v) => !v)} disabled={busy} title="Repeat this week every week until the end of the season">
        Publish season…
      </button>
      <button type="button" className={styles.btnPrimaryLight} onClick={onPublish} disabled={busy}>
        {hasExistingPublished ? `Update ${publishLabel}` : `Publish ${publishLabel}`}
      </button>

      {seasonOpen && (
        <div className={styles.seasonBox}>
          <p className={styles.seasonTitle}>Repeat this week for the season</p>
          <p className={styles.seasonHelp}>
            Every complete night of this week is published on the same weekday of every week up to the date below.
            Nights already published are kept unless you tick overwrite. Past nights are never touched.
          </p>
          <label className={styles.seasonField}>
            <span>Until</span>
            <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
          </label>
          <label className={styles.seasonCheck}>
            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
            <span>Overwrite nights already published (keeps existing bookings)</span>
          </label>
          <div className={styles.seasonActions}>
            <button type="button" className={styles.btnGhostLight} onClick={() => setSeasonOpen(false)}>Close</button>
            <button type="button" className={styles.btnPrimaryLight} disabled={busy || !until} onClick={() => { onPublishSeason(until, overwrite); }}>
              Publish season
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
