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
  focusDay: 'sat' | 'sun';
}

export function DishLibrary({ dishes, filter, onFilterChange, onAdd, onCreated, focusDay }: Props) {
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
          {dishes.length} dishes · click to add to <strong>{focusDay === 'sat' ? 'Saturday' : 'Sunday'}</strong>
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
