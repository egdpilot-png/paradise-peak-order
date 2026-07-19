'use client';

import styles from '../publisher.module.css';

interface Props {
  status: string | null;
  busy: boolean;
  onSaveDraft: () => void;
  onPublish: () => void;
  hasExistingPublished: boolean;
}

export function PublishRail({ status, busy, onSaveDraft, onPublish, hasExistingPublished }: Props) {
  return (
    <div className={styles.publishRail}>
      {status && (
        <p className={`${styles.publishStatus} ${status.startsWith('Published') || status.startsWith('Draft saved') ? styles.publishStatusOk : styles.publishStatusWarn}`}>
          {status}
        </p>
      )}
      <button
        type="button"
        className={styles.btnGhostLight}
        onClick={onSaveDraft}
        disabled={busy}
      >
        Save draft
      </button>
      <button
        type="button"
        className={styles.btnPrimaryLight}
        onClick={onPublish}
        disabled={busy}
      >
        {hasExistingPublished ? 'Publish update' : 'Publish & notify'}
      </button>
    </div>
  );
}
