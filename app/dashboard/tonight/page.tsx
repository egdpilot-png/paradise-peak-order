// Server component. Loads all four aggregates in parallel, then hands off
// to a client shell that subscribes to Supabase Realtime for live updates.

import { redirect } from 'next/navigation';
import { getDashboardUser, canAct } from '@/lib/auth';
import {
  loadTonightSummary,
  loadCourseTally,
  loadAllergyMatrix,
  loadRoomRows,
} from '@/lib/dashboard';
import { DashboardShell } from './DashboardShell';

interface Props {
  searchParams: Promise<{ date?: string }>;
}

function todayInMarigot(): string {
  const now = new Date();
  // America/Marigot is UTC-4 (no DST)
  const local = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

export default async function TonightPage({ searchParams }: Props) {
  const user = await getDashboardUser();
  if (!user) redirect('/dashboard/login');

  const params = await searchParams;
  const date = params.date ?? todayInMarigot();

  const [summary, tally, allergies, rooms] = await Promise.all([
    loadTonightSummary(date),
    loadCourseTally(date),
    loadAllergyMatrix(date),
    loadRoomRows(date),
  ]);

  return (
    <DashboardShell
      user={user}
      date={date}
      canKitchenAct={canAct(user, 'kitchen_action')}
      initialData={{ summary, tally, allergies, rooms }}
    />
  );
}
