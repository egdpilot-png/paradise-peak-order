'use client';

import { useMemo, useState } from 'react';
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
  focusLabel: string;                            // e.g. 'Tuesday 3 Nov'
}

export function DishLibrary({ dishes, filter, onFilterChange, onAdd, onCreated, onPriceChange, focusLabel }: Props) {
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
                <li key={d.id}>
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
