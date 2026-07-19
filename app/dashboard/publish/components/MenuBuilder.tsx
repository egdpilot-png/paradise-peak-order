'use client';

import type { DishLibraryItem } from '@/lib/publisher';
import type { CourseType } from '@/lib/types';
import styles from '../publisher.module.css';

const COURSES_IN_ORDER: CourseType[] = ['starter', 'main', 'dessert'];
const COURSE_LABEL: Record<CourseType, string> = {
  amuse: 'Amuse', starter: 'Starter', main: 'Main', side: 'Side', dessert: 'Dessert',
};

interface Props {
  day: 'sat' | 'sun';
  label: string;
  state: {
    service_date: string;
    service_type: string;
    title: string;
    title_fr: string;
    subtitle: string;
    subtitle_fr: string;
    items: Record<CourseType, string[]>;
  };
  focused: boolean;
  onFocus: () => void;
  onChangeMeta: (patch: Partial<Props['state']>) => void;
  onRemove: (dishId: string, course: CourseType) => void;
  onReorder: (course: CourseType, from: number, to: number) => void;
  dishById: Map<string, DishLibraryItem>;
}

export function MenuBuilder({
  label, state, focused, onFocus, onChangeMeta, onRemove, onReorder, dishById,
}: Props) {
  const totalDishes =
    state.items.starter.length + state.items.main.length + state.items.dessert.length;

  return (
    <section
      className={`${styles.builderCard} ${focused ? styles.builderCardFocused : ''}`}
      onClickCapture={onFocus}
    >
      <header className={styles.builderHead}>
        <div>
          <p className={styles.builderDay}>{label} · {formatDateShort(state.service_date)}</p>
          <input
            className={styles.builderTitle}
            value={state.title}
            onChange={(e) => onChangeMeta({ title: e.target.value })}
            placeholder="Menu title (e.g. Menu Marigot)"
          />
          <input
            className={styles.builderSubtitle}
            value={state.subtitle}
            onChange={(e) => onChangeMeta({ subtitle: e.target.value })}
            placeholder="Optional subtitle · e.g. 'Sunset tasting menu'"
          />
        </div>
        <div className={styles.builderMeta}>
          <span className={styles.builderCount}>{totalDishes} dishes</span>
        </div>
      </header>

      <div className={styles.builderCourses}>
        {COURSES_IN_ORDER.map((course) => (
          <div key={course} className={styles.builderCourse}>
            <div className={styles.builderCourseHead}>
              <h4 className={styles.builderCourseTitle}>{COURSE_LABEL[course]}</h4>
              <span className={styles.builderCourseCount}>
                {state.items[course].length} · min 1
              </span>
            </div>
            {state.items[course].length === 0 ? (
              <div className={styles.builderEmpty}>
                Click a {COURSE_LABEL[course].toLowerCase()} in the library to add
              </div>
            ) : (
              <ul className={styles.builderDishes}>
                {state.items[course].map((id, idx) => {
                  const d = dishById.get(id);
                  if (!d) return null;
                  return (
                    <li key={id} className={styles.builderDish}>
                      <div className={styles.builderDishGrip} aria-hidden>≡</div>
                      <div className={styles.builderDishBody}>
                        <span className={styles.builderDishName}>{d.name}</span>
                        {d.description && (
                          <span className={styles.builderDishDesc}>{d.description}</span>
                        )}
                        {d.allergens.length > 0 && (
                          <span className={styles.builderDishAllergens}>
                            {d.allergens.join(' · ')}
                          </span>
                        )}
                      </div>
                      <div className={styles.builderDishActions}>
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={(e) => { e.stopPropagation(); onReorder(course, idx, idx - 1); }}
                          className={styles.builderDishBtn}
                          aria-label="Move up"
                        >↑</button>
                        <button
                          type="button"
                          disabled={idx === state.items[course].length - 1}
                          onClick={(e) => { e.stopPropagation(); onReorder(course, idx, idx + 1); }}
                          className={styles.builderDishBtn}
                          aria-label="Move down"
                        >↓</button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onRemove(id, course); }}
                          className={styles.builderDishBtnDanger}
                          aria-label="Remove"
                        >×</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function formatDateShort(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}
