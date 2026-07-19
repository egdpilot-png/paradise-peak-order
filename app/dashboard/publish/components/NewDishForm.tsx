'use client';

import { useState } from 'react';
import type { CourseType } from '@/lib/types';
import type { DishLibraryItem } from '@/lib/publisher';
import styles from '../publisher.module.css';

interface Props {
  defaultCourse: CourseType;
  onCreated: (dish: DishLibraryItem) => void;
  onCancel: () => void;
}

const COURSES: Array<{ v: CourseType; label: string }> = [
  { v: 'starter', label: 'Starter' },
  { v: 'main', label: 'Main' },
  { v: 'dessert', label: 'Dessert' },
  { v: 'side', label: 'Side' },
  { v: 'amuse', label: 'Amuse' },
];

const COMMON_ALLERGENS = ['fish', 'shellfish', 'dairy', 'gluten', 'egg', 'nuts', 'sesame', 'soy'];
const COMMON_TAGS = ['signature', 'veg', 'vegan', 'raw', 'caribbean', 'chilled', 'summer', 'tropical'];

export function NewDishForm({ defaultCourse, onCreated, onCancel }: Props) {
  const [name, setName] = useState('');
  const [nameFr, setNameFr] = useState('');
  const [description, setDescription] = useState('');
  const [course, setCourse] = useState<CourseType>(
    defaultCourse === 'amuse' || defaultCourse === 'side' ? 'starter' : defaultCourse,
  );
  const [tags, setTags] = useState<string[]>([]);
  const [allergens, setAllergens] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(list: string[], setter: (v: string[]) => void, val: string) {
    setter(list.includes(val) ? list.filter(x => x !== val) : [...list, val]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Give it a name'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard/publish/dish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          name_fr: nameFr.trim() || null,
          description: description.trim() || null,
          course,
          tags,
          allergens,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j?.error ?? 'Save failed');
        setBusy(false);
        return;
      }
      const { dish } = await res.json();
      onCreated(dish as DishLibraryItem);
    } catch (e: any) {
      setError(e?.message ?? 'Save failed');
      setBusy(false);
    }
  }

  return (
    <form className={styles.newDishForm} onSubmit={submit}>
      <div className={styles.newDishHead}>
        <h3 className={styles.newDishTitle}>New dish</h3>
        <button type="button" className={styles.newDishClose} onClick={onCancel} aria-label="Cancel">×</button>
      </div>

      <label className={styles.newDishField}>
        <span className={styles.newDishLabel}>Name</span>
        <input
          className={styles.newDishInput}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          placeholder="e.g. Grilled mahi, sauce vierge"
          maxLength={120}
        />
      </label>

      <label className={styles.newDishField}>
        <span className={styles.newDishLabel}>Nom (FR) · optional</span>
        <input
          className={styles.newDishInput}
          value={nameFr}
          onChange={(e) => setNameFr(e.target.value)}
          placeholder="Mahi grillé, sauce vierge"
          maxLength={120}
        />
      </label>

      <label className={styles.newDishField}>
        <span className={styles.newDishLabel}>Description</span>
        <textarea
          className={styles.newDishTextarea}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="One line the guest reads"
          rows={2}
          maxLength={240}
        />
      </label>

      <div className={styles.newDishField}>
        <span className={styles.newDishLabel}>Course</span>
        <div className={styles.newDishCourseRow}>
          {COURSES.map(({ v, label }) => (
            <button
              type="button"
              key={v}
              className={`${styles.newDishCourseBtn} ${course === v ? styles.newDishCourseBtnActive : ''}`}
              onClick={() => setCourse(v)}
            >{label}</button>
          ))}
        </div>
      </div>

      <div className={styles.newDishField}>
        <span className={styles.newDishLabel}>Tags</span>
        <div className={styles.newDishChipRow}>
          {COMMON_TAGS.map(t => (
            <button
              type="button"
              key={t}
              className={`${styles.newDishChip} ${tags.includes(t) ? styles.newDishChipOn : ''}`}
              onClick={() => toggle(tags, setTags, t)}
            >{t}</button>
          ))}
        </div>
      </div>

      <div className={styles.newDishField}>
        <span className={styles.newDishLabel}>Allergens</span>
        <div className={styles.newDishChipRow}>
          {COMMON_ALLERGENS.map(a => (
            <button
              type="button"
              key={a}
              className={`${styles.newDishChip} ${styles.newDishChipAllergen} ${allergens.includes(a) ? styles.newDishChipAllergenOn : ''}`}
              onClick={() => toggle(allergens, setAllergens, a)}
            >{a}</button>
          ))}
        </div>
      </div>

      {error && <p className={styles.newDishError}>{error}</p>}

      <div className={styles.newDishActions}>
        <button type="button" className={styles.newDishCancel} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className={styles.newDishSave} disabled={busy || !name.trim()}>
          {busy ? 'Saving…' : 'Save & add to menu'}
        </button>
      </div>
    </form>
  );
}
