'use client';

// Editor for two menu drafts (Saturday + Sunday). State kept locally,
// persisted to the server on Save Draft / Publish.

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { DashboardUser } from '@/lib/auth';
import type {
  WeekendContext,
  DishLibraryItem,
  MenuDraft,
} from '@/lib/publisher';
import type { CourseType } from '@/lib/types';
import { DishLibrary } from './components/DishLibrary';
import { MenuBuilder } from './components/MenuBuilder';
import { GuestPreview } from './components/GuestPreview';
import { PublishRail } from './components/PublishRail';
import styles from './publisher.module.css';

interface Props {
  context: WeekendContext;
  user: DashboardUser;
}

type BuilderState = {
  service_date: string;
  service_type: 'weekend_special' | 'plated' | 'buffet';
  title: string;
  title_fr: string;
  subtitle: string;
  subtitle_fr: string;
  items: Record<CourseType, string[]>;   // dish_library_ids in order
};

const EMPTY_ITEMS: BuilderState['items'] = {
  amuse: [], starter: [], main: [], side: [], dessert: [],
};

function seedFrom(loaded: WeekendContext['existingSat'], date: string, defaultTitle: string): BuilderState {
  if (!loaded) {
    return {
      service_date: date,
      service_type: 'weekend_special',
      title: defaultTitle,
      title_fr: '',
      subtitle: '',
      subtitle_fr: '',
      items: { ...EMPTY_ITEMS, starter: [], main: [], dessert: [] },
    };
  }
  const items: BuilderState['items'] = { amuse: [], starter: [], main: [], side: [], dessert: [] };
  for (const it of loaded.items) {
    items[it.course] = items[it.course] ?? [];
    items[it.course].push(it.dish_library_id);
  }
  return {
    service_date: loaded.service_date,
    service_type: loaded.service_type as any,
    title: loaded.title,
    title_fr: loaded.title_fr ?? '',
    subtitle: loaded.subtitle ?? '',
    subtitle_fr: loaded.subtitle_fr ?? '',
    items,
  };
}

export function PublisherEditor({ context, user }: Props) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [focusDay, setFocusDay] = useState<'sat' | 'sun'>('sat');
  const [libFilter, setLibFilter] = useState('');

  const [sat, setSat] = useState<BuilderState>(() =>
    seedFrom(context.existingSat, context.saturday, `Menu Marigot · Saturday`),
  );
  const [sun, setSun] = useState<BuilderState>(() =>
    seedFrom(context.existingSun, context.sunday, `Menu Marigot · Sunday`),
  );

  // Library is stateful so newly-created dishes appear without a page reload.
  const [library, setLibrary] = useState<DishLibraryItem[]>(context.dishLibrary);

  const dishById = useMemo(() => {
    const m = new Map<string, DishLibraryItem>();
    for (const d of library) m.set(d.id, d);
    return m;
  }, [library]);

  function updateDay(day: 'sat' | 'sun', mut: (b: BuilderState) => BuilderState) {
    if (day === 'sat') setSat(mut);
    else setSun(mut);
  }

  function addDish(day: 'sat' | 'sun', dish: DishLibraryItem) {
    updateDay(day, (b) => ({
      ...b,
      items: {
        ...b.items,
        [dish.course]: b.items[dish.course].includes(dish.id)
          ? b.items[dish.course]
          : [...b.items[dish.course], dish.id],
      },
    }));
  }

  function onDishCreated(dish: DishLibraryItem) {
    // Merge into library (upsert by id), then auto-add to the focused day.
    setLibrary(prev => {
      const idx = prev.findIndex(d => d.id === dish.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = dish;
        return next;
      }
      return [dish, ...prev];
    });
    addDish(focusDay, dish);
    setStatus(`Added "${dish.name}" to library and ${focusDay === 'sat' ? 'Saturday' : 'Sunday'}`);
  }

  function removeDish(day: 'sat' | 'sun', dishId: string, course: CourseType) {
    updateDay(day, (b) => ({
      ...b,
      items: {
        ...b.items,
        [course]: b.items[course].filter(id => id !== dishId),
      },
    }));
  }

  function reorderDish(day: 'sat' | 'sun', course: CourseType, from: number, to: number) {
    updateDay(day, (b) => {
      const arr = [...b.items[course]];
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return { ...b, items: { ...b.items, [course]: arr } };
    });
  }

  function toDrafts(): MenuDraft[] {
    const flatten = (b: BuilderState): MenuDraft => {
      const items: MenuDraft['items'] = [];
      let order = 0;
      for (const course of ['amuse', 'starter', 'main', 'side', 'dessert'] as CourseType[]) {
        for (const id of b.items[course]) {
          items.push({ dish_library_id: id, sort_order: order++ });
        }
      }
      return {
        service_date: b.service_date,
        service_type: b.service_type,
        title: b.title.trim(),
        title_fr: b.title_fr.trim() || null,
        subtitle: b.subtitle.trim() || null,
        subtitle_fr: b.subtitle_fr.trim() || null,
        items,
      };
    };
    return [flatten(sat), flatten(sun)];
  }

  function validate(): string | null {
    for (const [label, b] of [['Saturday', sat], ['Sunday', sun]] as const) {
      if (!b.title.trim()) return `${label} needs a title.`;
      if (b.items.starter.length === 0) return `${label} needs at least one starter.`;
      if (b.items.main.length === 0) return `${label} needs at least one main.`;
      if (b.items.dessert.length === 0) return `${label} needs at least one dessert.`;
    }
    return null;
  }

  function saveDraft() {
    startTransition(async () => {
      setStatus(null);
      const res = await fetch('/api/dashboard/publish/draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ drafts: toDrafts() }),
      });
      if (res.ok) {
        setStatus('Draft saved · you can close and return later');
        router.refresh();
      } else {
        const e = await res.json().catch(() => ({}));
        setStatus(`Draft failed · ${e?.error ?? 'unknown'}`);
      }
    });
  }

  function publish() {
    const err = validate();
    if (err) { setStatus(err); return; }
    if (!confirm(`Publish both menus and notify ${context.guestsThisWeekend} guest${context.guestsThisWeekend === 1 ? '' : 's'}?`)) return;

    startTransition(async () => {
      setStatus(null);
      const res = await fetch('/api/dashboard/publish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ drafts: toDrafts() }),
      });
      if (res.ok) {
        const { results } = await res.json();
        const totalNotified = results.reduce((s: number, r: any) => s + (r.guests_notified ?? 0), 0);
        setStatus(`Published · ${totalNotified} guest notifications queued`);
        router.refresh();
      } else {
        const e = await res.json().catch(() => ({}));
        setStatus(`Publish failed · ${e?.error ?? 'unknown'}`);
      }
    });
  }

  return (
    <div className={styles.page}>
      <header className={styles.headerRail}>
        <div className={styles.headerLeft}>
          <p className={styles.eyebrow}>Pirate at Night · Publisher</p>
          <h1 className={styles.headerTitle}>Weekend menu · {formatWeekendLabel(context.saturday, context.sunday)}</h1>
          <p className={styles.headerSubtitle}>
            {context.guestsThisWeekend} guest{context.guestsThisWeekend === 1 ? '' : 's'} in house
            {' '}· {context.languageBreakdown.en} EN / {context.languageBreakdown.fr} FR
          </p>
        </div>
        <PublishRail
          status={status}
          busy={busy}
          onSaveDraft={saveDraft}
          onPublish={publish}
          hasExistingPublished={
            context.existingSat?.status === 'published' ||
            context.existingSun?.status === 'published'
          }
        />
      </header>

      <div className={styles.workspace}>
        <aside className={styles.library}>
          <DishLibrary
            dishes={library}
            filter={libFilter}
            onFilterChange={setLibFilter}
            onAdd={(dish) => addDish(focusDay, dish)}
            onCreated={onDishCreated}
            focusDay={focusDay}
          />
        </aside>

        <section className={styles.builder}>
          <MenuBuilder
            day="sat"
            label="Saturday"
            state={sat}
            focused={focusDay === 'sat'}
            onFocus={() => setFocusDay('sat')}
            onChangeMeta={(patch) => setSat(prev => ({ ...prev, ...patch }))}
            onRemove={(dishId, course) => removeDish('sat', dishId, course)}
            onReorder={(course, from, to) => reorderDish('sat', course, from, to)}
            dishById={dishById}
          />
          <MenuBuilder
            day="sun"
            label="Sunday"
            state={sun}
            focused={focusDay === 'sun'}
            onFocus={() => setFocusDay('sun')}
            onChangeMeta={(patch) => setSun(prev => ({ ...prev, ...patch }))}
            onRemove={(dishId, course) => removeDish('sun', dishId, course)}
            onReorder={(course, from, to) => reorderDish('sun', course, from, to)}
            dishById={dishById}
          />
        </section>

        <aside className={styles.previewCol}>
          <GuestPreview
            state={focusDay === 'sat' ? sat : sun}
            label={focusDay === 'sat' ? 'Saturday' : 'Sunday'}
            dishById={dishById}
          />
        </aside>
      </div>
    </div>
  );
}

function formatWeekendLabel(sat: string, sun: string): string {
  const s = new Date(sat + 'T12:00:00Z');
  const u = new Date(sun + 'T12:00:00Z');
  const monthOpts: Intl.DateTimeFormatOptions = { month: 'long' };
  const dayOpts: Intl.DateTimeFormatOptions = { day: 'numeric' };
  const sameMonth = s.getUTCMonth() === u.getUTCMonth();
  const sd = s.toLocaleDateString('en-GB', dayOpts);
  const ud = u.toLocaleDateString('en-GB', dayOpts);
  const month = u.toLocaleDateString('en-GB', monthOpts);
  return sameMonth ? `${sd}–${ud} ${month} ${u.getUTCFullYear()}` : `${sd} ${s.toLocaleDateString('en-GB', monthOpts)}–${ud} ${month}`;
}
