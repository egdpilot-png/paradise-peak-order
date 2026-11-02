'use client';

// Week builder: one menu per service night, Monday to Saturday.
// Monday + Friday = buffet (cover price per person); Tue/Wed/Thu/Sat = plated
// fixed menu priced by dish. Sunday is closed.

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { DashboardUser } from '@/lib/auth';
import type { WeekContext, DishLibraryItem, MenuDraft, LoadedMenu } from '@/lib/publisher';
import type { CourseType } from '@/lib/types';
import { nightKind, BUFFET_PRICE_CENTS } from '@/lib/time';
import { DishLibrary } from './components/DishLibrary';
import { MenuBuilder } from './components/MenuBuilder';
import { GuestPreview } from './components/GuestPreview';
import { PublishRail } from './components/PublishRail';
import styles from './publisher.module.css';

interface Props {
  context: WeekContext;
  user: DashboardUser;
}

type BuilderState = {
  service_date: string;
  service_type: 'buffet' | 'plated';
  title: string;
  title_fr: string;
  subtitle: string;
  subtitle_fr: string;
  cover_price_cents: number | null;
  items: Record<CourseType, string[]>;   // dish_library_ids in order
  publishedAt: string | null;
  isDraft: boolean;
};

const COURSES: CourseType[] = ['amuse', 'starter', 'main', 'side', 'dessert'];
const emptyItems = (): BuilderState['items'] => ({ amuse: [], starter: [], main: [], side: [], dessert: [] });

const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_FULL_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const weekdayIdx = (iso: string) => new Date(iso + 'T12:00:00Z').getUTCDay();
const dayName = (iso: string) => DAY_FULL[weekdayIdx(iso)];
const shortLabel = (iso: string) =>
  new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

function seedFrom(loaded: LoadedMenu | null, date: string): BuilderState {
  const kind = nightKind(date);
  const type: BuilderState['service_type'] = kind === 'buffet' ? 'buffet' : 'plated';
  const defaultTitle = kind === 'buffet'
    ? `Buffet Pirate at Night · ${dayName(date)}`
    : `Menu Pirate at Night · ${dayName(date)}`;
  const defaultTitleFr = kind === 'buffet'
    ? `Buffet Pirate at Night · ${DAY_FULL_FR[weekdayIdx(date)]}`
    : `Menu Pirate at Night · ${DAY_FULL_FR[weekdayIdx(date)]}`;

  if (!loaded) {
    return {
      service_date: date, service_type: type,
      title: defaultTitle, title_fr: defaultTitleFr, subtitle: '', subtitle_fr: '',
      cover_price_cents: type === 'buffet' ? BUFFET_PRICE_CENTS : null,
      items: emptyItems(), publishedAt: null, isDraft: false,
    };
  }
  const items = emptyItems();
  for (const it of loaded.items) {
    const c = (it.course || 'main') as CourseType;
    (items[c] ??= []).push(it.dish_library_id);
  }
  return {
    service_date: loaded.service_date,
    service_type: type,                       // the calendar decides, not the stored row
    title: loaded.title || defaultTitle,
    title_fr: loaded.title_fr ?? defaultTitleFr,
    subtitle: loaded.subtitle ?? '',
    subtitle_fr: loaded.subtitle_fr ?? '',
    cover_price_cents: type === 'buffet' ? (loaded.cover_price_cents ?? BUFFET_PRICE_CENTS) : null,
    items,
    publishedAt: loaded.published_at,
    isDraft: loaded.status === 'draft',
  };
}

export function PublisherEditor({ context }: Props) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [libFilter, setLibFilter] = useState('');
  const [focusDate, setFocusDate] = useState<string>(context.dates[0]);

  const [days, setDays] = useState<Record<string, BuilderState>>(() => {
    const m: Record<string, BuilderState> = {};
    for (const d of context.dates) m[d] = seedFrom(context.existing[d], d);
    return m;
  });
  const [library, setLibrary] = useState<DishLibraryItem[]>(context.dishLibrary);

  const dishById = useMemo(() => {
    const m = new Map<string, DishLibraryItem>();
    for (const d of library) m.set(d.id, d);
    return m;
  }, [library]);

  const focused = days[focusDate];

  function updateDay(date: string, mut: (b: BuilderState) => BuilderState) {
    setDays(prev => ({ ...prev, [date]: mut(prev[date]) }));
  }

  // Library items are fixed to a course; on a plated night we need the dish's
  // course to be one of the fixed-menu courses.
  function addDish(date: string, dish: DishLibraryItem) {
    const b = days[date];
    if (b.service_type === 'plated' && !['starter', 'main', 'dessert'].includes(dish.course)) {
      setStatus(`"${dish.name}" is a ${dish.course} — plated nights use starter, main and dessert only.`);
      return;
    }
    updateDay(date, (s) => ({
      ...s,
      items: {
        ...s.items,
        [dish.course]: s.items[dish.course].includes(dish.id) ? s.items[dish.course] : [...s.items[dish.course], dish.id],
      },
    }));
  }

  function mergeLibrary(dish: DishLibraryItem) {
    setLibrary(prev => {
      const idx = prev.findIndex(d => d.id === dish.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = dish; return next; }
      return [dish, ...prev];
    });
  }

  function onDishCreated(dish: DishLibraryItem) {
    mergeLibrary(dish);
    addDish(focusDate, dish);
    setStatus(`Added "${dish.name}" to the library and to ${shortLabel(focusDate)}`);
  }

  function onPriceChange(dish: DishLibraryItem, priceEur: number | null) {
    startTransition(async () => {
      const res = await fetch('/api/dashboard/publish/dish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...dish, price_eur: priceEur }),
      });
      if (res.ok) {
        const { dish: saved } = await res.json();
        mergeLibrary(saved);
        setStatus(`Price saved · ${saved.name} ${saved.price_eur == null ? '(no price)' : saved.price_eur + ' €'}`);
      } else {
        const e = await res.json().catch(() => ({}));
        setStatus(`Price not saved · ${e?.error ?? 'unknown'}`);
      }
    });
  }

  function removeDish(date: string, dishId: string, course: CourseType) {
    updateDay(date, (s) => ({ ...s, items: { ...s.items, [course]: s.items[course].filter(id => id !== dishId) } }));
  }

  function reorderDish(date: string, course: CourseType, from: number, to: number) {
    updateDay(date, (s) => {
      const arr = [...s.items[course]];
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return { ...s, items: { ...s.items, [course]: arr } };
    });
  }

  function copyFrom(srcDate: string) {
    const src = days[srcDate];
    updateDay(focusDate, (s) => ({ ...s, items: { ...src.items, amuse: [...src.items.amuse], starter: [...src.items.starter], main: [...src.items.main], side: [...src.items.side], dessert: [...src.items.dessert] } }));
    setStatus(`Copied dishes from ${shortLabel(srcDate)} to ${shortLabel(focusDate)}`);
  }

  function toDraft(b: BuilderState): MenuDraft {
    const items: MenuDraft['items'] = [];
    let order = 0;
    for (const course of COURSES) for (const id of b.items[course]) items.push({ dish_library_id: id, sort_order: order++ });
    return {
      service_date: b.service_date,
      service_type: b.service_type,
      title: b.title.trim(),
      title_fr: b.title_fr.trim() || null,
      subtitle: b.subtitle.trim() || null,
      subtitle_fr: b.subtitle_fr.trim() || null,
      cover_price_cents: b.service_type === 'buffet' ? b.cover_price_cents : null,
      items,
    };
  }

  const hasContent = (b: BuilderState) => COURSES.some(c => b.items[c].length > 0);

  function validate(b: BuilderState): string | null {
    const label = shortLabel(b.service_date);
    if (!b.title.trim()) return `${label} needs a title.`;
    if (b.service_type === 'buffet') {
      if (!hasContent(b)) return `${label} (buffet) needs at least one dish.`;
      if (!b.cover_price_cents || b.cover_price_cents <= 0) return `${label} (buffet) needs a price per person.`;
      return null;
    }
    if (b.items.starter.length === 0) return `${label} needs at least one starter.`;
    if (b.items.main.length === 0) return `${label} needs at least one main.`;
    if (b.items.dessert.length === 0) return `${label} needs at least one dessert.`;
    const unpriced = (['starter', 'main', 'dessert'] as CourseType[])
      .flatMap(c => b.items[c]).map(id => dishById.get(id)).filter(d => d && d.price_eur == null);
    if (unpriced.length) return `${label}: set a price for ${unpriced.map(d => d!.name).join(', ')}.`;
    return null;
  }

  async function post(url: string, drafts: MenuDraft[]) {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ drafts }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
    return json;
  }

  function saveDraft() {
    const drafts = context.dates.map(d => days[d]).filter(hasContent).map(toDraft);
    if (!drafts.length) { setStatus('Nothing to save yet — add dishes first.'); return; }
    startTransition(async () => {
      setStatus(null);
      try {
        await post('/api/dashboard/publish/draft', drafts);
        setStatus(`Draft saved · ${drafts.length} night${drafts.length === 1 ? '' : 's'} · you can close and return later`);
        router.refresh();
      } catch (e: any) { setStatus(`Draft failed · ${e.message}`); }
    });
  }

  function publishDrafts(drafts: MenuDraft[], what: string) {
    if (!confirm(`Publish ${what}? Guests in house this week (${context.guestsThisWeek}) will be notified.`)) return;
    startTransition(async () => {
      setStatus(null);
      try {
        const { results } = await post('/api/dashboard/publish', drafts);
        const notified = (results as any[]).reduce((s, r) => s + (r.guests_notified ?? 0), 0);
        setStatus(`Published ${what} · ${notified} guest notification${notified === 1 ? '' : 's'} queued`);
        setDays(prev => {
          const next = { ...prev };
          for (const d of drafts) next[d.service_date] = { ...next[d.service_date], publishedAt: new Date().toISOString(), isDraft: false };
          return next;
        });
        router.refresh();
      } catch (e: any) { setStatus(`Publish failed · ${e.message}`); }
    });
  }

  function publishFocused() {
    const err = validate(focused);
    if (err) { setStatus(err); return; }
    publishDrafts([toDraft(focused)], shortLabel(focusDate));
  }

  function publishWeek() {
    const ready: MenuDraft[] = [];
    for (const d of context.dates) {
      const b = days[d];
      if (!hasContent(b)) continue;
      const err = validate(b);
      if (err) { setStatus(err); setFocusDate(d); return; }
      ready.push(toDraft(b));
    }
    if (!ready.length) { setStatus('No night is ready to publish yet.'); return; }
    publishDrafts(ready, `${ready.length} night${ready.length === 1 ? '' : 's'}`);
  }

  const weekLabel = formatWeekLabel(context.dates[0], context.dates[5]);
  const prevWeek = shiftIso(context.monday, -7);
  const nextWeek = shiftIso(context.monday, 7);

  return (
    <div className={styles.page}>
      <header className={styles.headerRail}>
        <div className={styles.headerLeft}>
          <p className={styles.eyebrow}>Pirate at Night · Publisher</p>
          <h1 className={styles.headerTitle}>
            <a className={styles.weekNav} href={`/dashboard/publish?week=${prevWeek}`} aria-label="Previous week">‹</a>
            {' '}Week of {weekLabel}{' '}
            <a className={styles.weekNav} href={`/dashboard/publish?week=${nextWeek}`} aria-label="Next week">›</a>
          </h1>
          <p className={styles.headerSubtitle}>
            {context.guestsThisWeek} guest{context.guestsThisWeek === 1 ? '' : 's'} in house this week
            {' '}· {context.languageBreakdown.en} EN / {context.languageBreakdown.fr} FR
            {' '}· Buffet Mon & Fri · Plated Tue–Thu & Sat · Closed Sun
          </p>
        </div>
        <PublishRail
          status={status}
          busy={busy}
          onSaveDraft={saveDraft}
          onPublish={publishFocused}
          onPublishWeek={publishWeek}
          publishLabel={shortLabel(focusDate)}
          hasExistingPublished={!!focused.publishedAt}
        />
      </header>

      <nav className={styles.dayTabs} aria-label="Service nights">
        {context.dates.map((d) => {
          const b = days[d];
          const state = b.publishedAt && !b.isDraft ? 'live' : b.isDraft ? 'draft' : hasContent(b) ? 'edited' : 'empty';
          return (
            <button
              key={d}
              type="button"
              className={`${styles.dayTab} ${d === focusDate ? styles.dayTabActive : ''}`}
              onClick={() => setFocusDate(d)}
            >
              <span className={styles.dayTabName}>{shortLabel(d)}</span>
              <span className={styles.dayTabKind}>{b.service_type === 'buffet' ? 'Buffet' : 'Plated'}</span>
              <span className={`${styles.dayTabState} ${styles['dayTabState_' + state]}`}>
                {state === 'live' ? 'Published' : state === 'draft' ? 'Draft' : state === 'edited' ? 'Unsaved' : 'Empty'}
              </span>
            </button>
          );
        })}
        <div className={`${styles.dayTab} ${styles.dayTabClosed}`}>
          <span className={styles.dayTabName}>{shortLabel(shiftIso(context.monday, 6))}</span>
          <span className={styles.dayTabKind}>Closed</span>
        </div>
      </nav>

      <div className={styles.workspace}>
        <aside className={styles.library}>
          <DishLibrary
            dishes={library}
            filter={libFilter}
            onFilterChange={setLibFilter}
            onAdd={(dish) => addDish(focusDate, dish)}
            onCreated={onDishCreated}
            onPriceChange={onPriceChange}
            focusLabel={shortLabel(focusDate)}
          />
        </aside>

        <section className={styles.builder}>
          <MenuBuilder
            key={focusDate}
            label={dayName(focusDate)}
            state={focused}
            focused
            onFocus={() => {}}
            onChangeMeta={(patch) => updateDay(focusDate, prev => ({ ...prev, ...(patch as Partial<BuilderState>) }))}
            onRemove={(dishId, course) => removeDish(focusDate, dishId, course)}
            onReorder={(course, from, to) => reorderDish(focusDate, course, from, to)}
            dishById={dishById}
          />
          <div className={styles.copyRow}>
            <span>Copy dishes from:</span>
            {context.dates.filter(d => d !== focusDate && hasContent(days[d]) && days[d].service_type === focused.service_type).map(d => (
              <button key={d} type="button" className={styles.copyBtn} onClick={() => copyFrom(d)}>{shortLabel(d)}</button>
            ))}
            {context.dates.filter(d => d !== focusDate && hasContent(days[d]) && days[d].service_type === focused.service_type).length === 0 && (
              <span className={styles.copyNone}>no other {focused.service_type} night filled yet</span>
            )}
          </div>
        </section>

        <aside className={styles.previewCol}>
          <GuestPreview state={focused} label={dayName(focusDate)} dishById={dishById} />
        </aside>
      </div>
    </div>
  );
}

function shiftIso(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatWeekLabel(mon: string, sat: string): string {
  const s = new Date(mon + 'T12:00:00Z');
  const u = new Date(sat + 'T12:00:00Z');
  const sameMonth = s.getUTCMonth() === u.getUTCMonth();
  const sd = s.toLocaleDateString('en-GB', { day: 'numeric' });
  const ud = u.toLocaleDateString('en-GB', { day: 'numeric' });
  const month = u.toLocaleDateString('en-GB', { month: 'long' });
  return sameMonth
    ? `${sd}–${ud} ${month} ${u.getUTCFullYear()}`
    : `${sd} ${s.toLocaleDateString('en-GB', { month: 'long' })} – ${ud} ${month} ${u.getUTCFullYear()}`;
}
