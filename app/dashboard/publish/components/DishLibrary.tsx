'use client';

import { useMemo, useRef, useState } from 'react';
import type { DishLibraryItem } from '@/lib/publisher';
import type { CourseType } from '@/lib/types';
import { NewDishForm } from './NewDishForm';
import styles from '../publisher.module.css';

const COURSE_ORDER: CourseType[] = ['starter', 'main', 'dessert', 'side', 'amuse'];
const COURSE_LABEL: Record<CourseType, string> = {
  amuse: 'Amuse', starter: 'Starter', main: 'Main', side: 'Side', dessert: 'Dessert',
};

interface Props {
  dishes: DishLibraryItem[];
  filter: string;
  onFilterChange: (v: string) => void;
  onAdd: (dish: DishLibraryItem) => void;
  onCreated: (dish: DishLibraryItem) => void;   // new dish saved to library
  onPriceChange: (dish: DishLibraryItem, priceEur: number | null) => void;
  onPhotoChange: (dish: DishLibraryItem, what: 'saved' | 'removed') => void;
  focusLabel: string;                            // e.g. 'Tuesday 3 Nov'
}

export function DishLibrary({ dishes, filter, onFilterChange, onAdd, onCreated, onPriceChange, onPhotoChange, focusLabel }: Props) {
  const [activeCourse, setActiveCourse] = useState<CourseType | 'all'>('all');
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return dishes.filter((d) => {
      if (activeCourse !== 'all' && d.course !== activeCourse) return false;
      if (!q) return true;
      return (
        d.name.toLowerCase().includes(q) ||
        (d.name_fr?.toLowerCase().includes(q) ?? false) ||
        d.tags.some(t => t.toLowerCase().includes(q))
      );
    });
  }, [dishes, filter, activeCourse]);

  const grouped = useMemo(() => {
    const g = new Map<CourseType, DishLibraryItem[]>();
    for (const d of filtered) {
      if (!g.has(d.course)) g.set(d.course, []);
      g.get(d.course)!.push(d);
    }
    return g;
  }, [filtered]);

  return (
    <div className={styles.libraryInner}>
      <header className={styles.libraryHead}>
        <div className={styles.libraryHeadRow}>
          <h2 className={styles.libraryTitle}>Dish library</h2>
          {!creating && (
            <button
              type="button"
              className={styles.libraryNewBtn}
              onClick={() => setCreating(true)}
              title="Create a new dish"
            >+ New dish</button>
          )}
        </div>
        <p className={styles.libraryMeta}>
          {dishes.length} dishes · click to add to <strong>{focusLabel}</strong>
        </p>
      </header>

      {creating && (
        <NewDishForm
          defaultCourse={activeCourse === 'all' ? 'starter' : activeCourse}
          onCreated={(dish) => { setCreating(false); onCreated(dish); }}
          onCancel={() => setCreating(false)}
        />
      )}

      <div className={styles.libraryControls}>
        <input
          className={styles.libraryFilter}
          placeholder="Filter by name or tag…"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
        />
        <div className={styles.libraryTabs}>
          <button
            type="button"
            className={`${styles.libraryTab} ${activeCourse === 'all' ? styles.libraryTabActive : ''}`}
            onClick={() => setActiveCourse('all')}
          >All</button>
          {COURSE_ORDER.map((c) => (
            <button
              key={c}
              type="button"
              className={`${styles.libraryTab} ${activeCourse === c ? styles.libraryTabActive : ''}`}
              onClick={() => setActiveCourse(c)}
            >{COURSE_LABEL[c]}</button>
          ))}
        </div>
      </div>

      <div className={styles.libraryList}>
        {COURSE_ORDER.filter(c => grouped.has(c)).map((course) => (
          <section key={course} className={styles.libraryCourse}>
            <h3 className={styles.libraryCourseTitle}>{COURSE_LABEL[course]}</h3>
            <ul className={styles.libraryDishes}>
              {grouped.get(course)!.map((d) => (
                <li key={d.id} className={styles.libraryDishItem}>
                  <button
                    type="button"
                    className={styles.libraryDish}
                    onClick={() => onAdd(d)}
                    title="Click to add"
                  >
                    <div className={styles.libraryDishHead}>
                      <span className={styles.libraryDishName}>{d.name}</span>
                      <PriceField dish={d} onChange={onPriceChange} />
                      {d.times_served > 0 && (
                        <span className={styles.libraryDishStat} title="Times served">×{d.times_served}</span>
                      )}
                    </div>
                    {d.description && (
                      <p className={styles.libraryDishDesc}>{d.description}</p>
                    )}
                    <div className={styles.libraryDishFoot}>
                      {d.tags.slice(0, 3).map((t) => (
                        <span key={t} className={styles.libraryTag}>{t}</span>
                      ))}
                      {d.allergens.length > 0 && (
                        <span className={styles.libraryAllergen}>
                          {d.allergens.join(' · ')}
                        </span>
                      )}
                    </div>
                  </button>
                  <PhotoBar dish={d} onChange={onPhotoChange} />
                </li>
              ))}
            </ul>
          </section>
        ))}
        {filtered.length === 0 && (
          <p className={styles.emptyState}>No dishes match your filter.</p>
        )}
      </div>
    </div>
  );
}

function PriceField({ dish, onChange }: { dish: DishLibraryItem; onChange: (d: DishLibraryItem, p: number | null) => void }) {
  const [val, setVal] = useState(dish.price_eur == null ? '' : String(dish.price_eur));
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <span
        role="button"
        tabIndex={0}
        className={`${styles.libraryPrice} ${dish.price_eur == null ? styles.libraryPriceMissing : ''}`}
        title="Click to set the price"
        onClick={(e) => { e.stopPropagation(); setVal(dish.price_eur == null ? '' : String(dish.price_eur)); setEditing(true); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setEditing(true); } }}
      >
        {dish.price_eur == null ? 'set €' : `${dish.price_eur} €`}
      </span>
    );
  }
  const commit = () => {
    setEditing(false);
    const n = val.trim() === '' ? null : Number(val.replace(',', '.'));
    if (n !== null && (!Number.isFinite(n) || n < 0)) return;
    if (n !== dish.price_eur) onChange(dish, n);
  };
  return (
    <input
      autoFocus
      className={styles.libraryPriceInput}
      value={val}
      inputMode="decimal"
      placeholder="€"
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') setEditing(false); }}
    />
  );
}

/** Demo pictures ship with the app; they are placeholders until a real photo is added. */
export function isDemoPhoto(url: string | null): boolean {
  return !!url && url.includes('/dish-photos/demo/');
}

/** Shrink a phone photo in the browser: 1000 px on the long side, JPEG. Keeps uploads small and fast. */
async function shrinkPhoto(file: File): Promise<Blob> {
  const MAX = 1000;
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    source = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
      img.src = url;
    });
  }
  const w = source.width, h = source.height;
  if (!w || !h) throw new Error('unreadable');
  const scale = Math.min(1, MAX / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('unreadable');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
  if (!blob) throw new Error('unreadable');
  return blob;
}

function PhotoBar({ dish, onChange }: { dish: DishLibraryItem; onChange: (d: DishLibraryItem, what: 'saved' | 'removed') => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'idle' | 'saving' | 'removing'>('idle');
  const [error, setError] = useState<string | null>(null);
  const demo = isDemoPhoto(dish.photo_url);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy('saving');
    try {
      let blob: Blob;
      try { blob = await shrinkPhoto(file); } catch {
        setError('This picture cannot be read. Use a JPG or PNG.');
        return;
      }
      const form = new FormData();
      form.set('dishId', dish.id);
      form.set('photo', blob, 'photo.jpg');
      const res = await fetch('/api/dashboard/publish/dish/photo', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(`Photo not saved: ${data?.error ?? res.status}`); return; }
      onChange(data.dish, 'saved');
    } catch {
      setError('Photo not saved: connection problem. Try again.');
    } finally {
      setBusy('idle');
      if (input.current) input.current.value = '';
    }
  }

  async function remove() {
    if (!window.confirm(`Remove the photo of "${dish.name}"? Guests will see the dish without a picture.`)) return;
    setError(null);
    setBusy('removing');
    try {
      const res = await fetch(`/api/dashboard/publish/dish/photo?dishId=${encodeURIComponent(dish.id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(`Photo not removed: ${data?.error ?? res.status}`); return; }
      onChange(data.dish, 'removed');
    } catch {
      setError('Photo not removed: connection problem. Try again.');
    } finally {
      setBusy('idle');
    }
  }

  return (
    <div className={styles.photoBar}>
      {dish.photo_url
        ? <img className={styles.photoBarThumb} src={dish.photo_url} alt="" loading="lazy" />
        : <span className={styles.photoBarEmpty} aria-hidden="true" />}
      <span className={styles.photoBarLabel}>
        {busy === 'saving' ? 'Saving photo…' : busy === 'removing' ? 'Removing…' : dish.photo_url ? (demo ? 'Demo photo' : 'Photo') : 'No photo'}
        {demo && busy === 'idle' && <span className={styles.photoBarDemo}>to be replaced</span>}
      </span>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className={styles.photoBarInput}
        aria-label={`Photo of ${dish.name}`}
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <span className={styles.photoBarActions}>
        <button type="button" className={styles.photoBarBtn} disabled={busy !== 'idle'} onClick={() => input.current?.click()}>
          {dish.photo_url ? 'Replace' : 'Add photo'}
        </button>
        {dish.photo_url && (
          <button type="button" className={styles.photoBarBtn} disabled={busy !== 'idle'} onClick={remove}>Remove</button>
        )}
      </span>
      {error && <p className={styles.photoBarError} role="alert">{error}</p>}
    </div>
  );
}
