'use client';

// Mirrors what the guest sees on their phone after scanning the QR.

import type { DishLibraryItem } from '@/lib/publisher';
import type { CourseType } from '@/lib/types';
import styles from '../publisher.module.css';

interface Props {
  state: {
    service_date: string;
    title: string;
    subtitle: string;
    items: Record<CourseType, string[]>;
  };
  label: string;
  dishById: Map<string, DishLibraryItem>;
}

const COURSES_IN_ORDER: CourseType[] = ['starter', 'main', 'dessert'];
const COURSE_LABEL: Record<CourseType, string> = {
  amuse: 'To awaken', starter: 'To begin', main: 'Main course', side: 'On the side', dessert: 'To finish',
};

export function GuestPreview({ state, label, dishById }: Props) {
  return (
    <div className={styles.previewInner}>
      <p className={styles.previewLabel}>Guest preview · {label}</p>

      <div className={styles.previewPhone}>
        <div className={styles.previewFrame}>
          <p className={styles.previewEyebrow}>Pirate at Night · Tonight</p>
          <h2 className={styles.previewTitle}>{state.title || 'Untitled menu'}</h2>
          {state.subtitle && <p className={styles.previewSubtitle}>{state.subtitle}</p>}
          <p className={styles.previewMeta}>{formatDate(state.service_date)}</p>

          {COURSES_IN_ORDER.map((course) => {
            const ids = state.items[course];
            if (!ids.length) return null;
            return (
              <section key={course} className={styles.previewCourse}>
                <h3 className={styles.previewCourseTitle}>{COURSE_LABEL[course]}</h3>
                <div className={styles.previewChoices}>
                  {ids.map((id, i) => {
                    const d = dishById.get(id);
                    if (!d) return null;
                    return (
                      <div key={id} className={i === 0 ? styles.previewChoiceOn : styles.previewChoice}>
                        <span className={styles.previewChoiceName}>{d.name}</span>
                        {d.description && (
                          <span className={styles.previewChoiceDesc}>{d.description}</span>
                        )}
                        {d.allergens.length > 0 && (
                          <span className={styles.previewChoiceAllergens}>
                            {d.allergens.join(' · ')}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {COURSES_IN_ORDER.every(c => state.items[c].length === 0) && (
            <p className={styles.previewEmpty}>
              Add dishes from the library to preview the guest view.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z');
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) + ' · 18:00';
}
