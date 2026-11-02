// Kitchen TV screen: the Tonight board without login, protected by a long
// secret in the URL (KITCHEN_SCREEN_KEY). Read-only — no kitchen actions.
// Bookmark on the TV browser:  https://menu.piratebynight.com/kitchen?key=…

import { timingSafeEqual } from 'node:crypto';
import { loadTonightSummary, loadCourseTally, loadAllergyMatrix, loadRoomRows } from '@/lib/dashboard';
import { todayInMarigot } from '@/lib/time';
import { DashboardShell } from '../dashboard/tonight/DashboardShell';

export const dynamic = 'force-dynamic';

interface Props { searchParams: Promise<{ key?: string; date?: string }> }

function keyOk(given: string | undefined): boolean {
  const expected = process.env.KITCHEN_SCREEN_KEY ?? '';
  if (!expected || !given || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export default async function KitchenScreen({ searchParams }: Props) {
  const params = await searchParams;
  if (!keyOk(params.key)) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#F5F1EA', fontFamily: 'Georgia, serif', color: '#1C1A17' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ letterSpacing: 3, textTransform: 'uppercase', fontSize: 12, color: '#B8873F' }}>Pirate at Night</p>
          <h1 style={{ fontWeight: 400 }}>Kitchen screen</h1>
          <p style={{ color: '#6F6A60' }}>This screen needs its key. Open the exact link from the dashboard QR page.</p>
        </div>
      </main>
    );
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? '') ? params.date! : todayInMarigot();
  const [summary, tally, allergies, rooms] = await Promise.all([
    loadTonightSummary(date), loadCourseTally(date), loadAllergyMatrix(date), loadRoomRows(date),
  ]);
  return (
    <DashboardShell
      user={{ email: 'kitchen-screen', role: 'property_manager', display_name: 'Kitchen screen' }}
      date={date}
      canKitchenAct={false}
      kiosk
      homeHref={`/kitchen?key=${encodeURIComponent(params.key!)}`}
      initialData={{ summary, tally, allergies, rooms }}
    />
  );
}
