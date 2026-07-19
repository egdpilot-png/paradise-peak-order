'use client';

import type { CourseTallyRow } from '@/lib/dashboard';
import type { Menu, CourseType } from '@/lib/types';
import styles from '../dashboard.module.css';

const COURSE_ORDER: CourseType[] = ['amuse', 'starter', 'main', 'side', 'dessert'];
const COURSE_LABEL: Record<CourseType, string> = {
  amuse: 'Amuse',
  starter: 'Starter',
  main: 'Main',
  side: 'Side',
  dessert: 'Dessert',
};

export function CourseTally({ tally, menu }: { tally: CourseTallyRow[]; menu: Menu | null }) {
  if (!menu) {
    return (
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Course tally</h2>
        <p className={styles.emptyState}>No menu published for tonight.</p>
      </section>
    );
  }

  const byCourse = new Map<CourseType, CourseTallyRow[]>();
  for (const row of tally) {
    if (!byCourse.has(row.course)) byCourse.set(row.course, []);
    byCourse.get(row.course)!.push(row);
  }

  const activeCourses = COURSE_ORDER.filter(c => byCourse.has(c));
  const totalOrders = tally.reduce((s, r) => s + r.count, 0);

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Course tally</h2>
        <span className={styles.panelMeta}>{totalOrders} selections</span>
      </div>

      {activeCourses.length === 0 ? (
        <p className={styles.emptyState}>No orders received yet.</p>
      ) : (
        <div className={styles.tallyGrid}>
          {activeCourses.map((course) => {
            const rows = byCourse.get(course)!;
            const max = Math.max(...rows.map(r => r.count));
            return (
              <div key={course} className={styles.tallyCourse}>
                <h3 className={styles.tallyCourseTitle}>{COURSE_LABEL[course]}</h3>
                <ul className={styles.tallyList}>
                  {rows.map((r) => (
                    <li key={r.menu_item_id} className={styles.tallyRow}>
                      <div className={styles.tallyRowText}>
                        <span className={styles.tallyName}>{r.name}</span>
                        <span className={styles.tallyCount}>×{r.count}</span>
                      </div>
                      <div className={styles.tallyBar} aria-hidden>
                        <div
                          className={styles.tallyBarFill}
                          style={{ width: `${(r.count / max) * 100}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
