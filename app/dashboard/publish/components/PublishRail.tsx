'use client';

import styles from '../publisher.module.css';

interface Props {
  status: string | null;
  busy: boolean;
  onSaveDraft: () => void;
  onPublish: () => void;
  onPublishWeek: () => void;
  publishLabel: string;
  hasExistingPublished: boolean;
}

export function PublishRail({ status, busy, onSaveDraft, onPublish, onPublishWeek, publishLabel, hasExistingPublished }: Props) {
  const ok = status?.startsWith('Published') || status?.startsWith('Draft saved') || status?.startsWith('Price');
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
      <button type="button" className={styles.btnGhostLight} onClick={onPublishWeek} disabled={busy} title="Publish every night of the week that is complete">
        Publish week
      </button>
      <button type="button" className={styles.btnPrimaryLight} onClick={onPublish} disabled={busy}>
        {hasExistingPublished ? `Update ${publishLabel}` : `Publish ${publishLabel}`}
      </button>
    </div>
  );
}
