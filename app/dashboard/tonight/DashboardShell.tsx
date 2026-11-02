'use client';

// Client shell for /dashboard/tonight — owns realtime subscription and
// router.refresh() calls when orders change.

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import type {
  TonightSummary,
  CourseTallyRow,
  AllergyRow,
  RoomRow,
} from '@/lib/dashboard';
import type { DashboardUser } from '@/lib/auth';
import { HeaderRail } from './components/HeaderRail';
import { KpiTiles } from './components/KpiTiles';
import { CourseTally } from './components/CourseTally';
import { AllergyMatrix } from './components/AllergyMatrix';
import { RoomStrip } from './components/RoomStrip';
import { ActionRail } from './components/ActionRail';
import styles from './dashboard.module.css';

interface Props {
  user: DashboardUser;
  date: string;
  canKitchenAct: boolean;
  /** Kitchen TV mode: no navigation, no sign-out, reload target keeps the key. */
  kiosk?: boolean;
  homeHref?: string;
  initialData: {
    summary: TonightSummary;
    tally: CourseTallyRow[];
    allergies: AllergyRow[];
    rooms: RoomRow[];
  };
}

export function DashboardShell({ user, date, canKitchenAct, initialData, kiosk = false, homeHref = '/dashboard/tonight' }: Props) {
  const router = useRouter();
  const [lastPing, setLastPing] = useState<Date | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const channel = supabase
      .channel(`orders:${date}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `service_date=eq.${date}` },
        () => {
          setLastPing(new Date());
          startTransition(() => router.refresh());
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_items' },
        () => {
          setLastPing(new Date());
          startTransition(() => router.refresh());
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [date, router]);

  // Kitchen TV: the page is pinned to one date. Roll over to the new day at
  // midnight (Marigot) and refresh every 5 minutes in case realtime drops.
  useEffect(() => {
    const todayMarigot = () =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Marigot', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const pinned = new URLSearchParams(window.location.search).has('date');
    const id = setInterval(() => {
      if (!pinned && todayMarigot() !== date) {
        window.location.href = homeHref;
        return;
      }
      startTransition(() => router.refresh());
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [date, router, homeHref]);

  const { summary, tally, allergies, rooms } = initialData;

  return (
    <div className={`${styles.page} ${kiosk ? styles.kiosk : ''}`}>
      <HeaderRail
        summary={summary}
        userName={user.display_name ?? user.email}
        lastPing={lastPing}
        kiosk={kiosk}
      />
      <main className={styles.main}>
        <KpiTiles summary={summary} />
        <div className={styles.twoCol}>
          <CourseTally tally={tally} menu={summary.menu} />
          <AllergyMatrix allergies={allergies} />
        </div>
        <RoomStrip rooms={rooms} serviceType={summary.serviceType} />
        {canKitchenAct && (
          <ActionRail date={date} summary={summary} />
        )}
        <footer className={styles.footer}>
          {kiosk
            ? 'Pirate at Night × The Paradise Peak · Kitchen screen · read only'
            : `Pirate at Night × The Paradise Peak · Signed in as ${user.display_name ?? user.email} (${user.role.replace('_', ' ')})`}
        </footer>
      </main>
    </div>
  );
}
