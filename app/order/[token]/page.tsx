// Server component. Fires on every scan. Decides which view to render.

import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/token';
import {
  loadGuestByRoom,
  loadMenuForDate,
  loadOrderForRoomDate,
} from '@/lib/supabase';
import { windowState } from '@/lib/time';
import { OrderForm } from './OrderForm';
import { ConfirmationView } from './ConfirmationView';
import { BuffetView } from './BuffetView';
import { LockedView } from './LockedView';
import { PastCutoffView } from './PastCutoffView';

// Return today's service date in America/Marigot as YYYY-MM-DD.
function todayInMarigot(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Marigot',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(new Date());
}

interface Props { params: Promise<{ token: string }> }

export default async function OrderPage({ params }: Props) {
  const { token } = await params;

  const payload = verifyToken(token);
  if (!payload) redirect('/expired');

  const serviceDate = todayInMarigot();

  const [menu, guest, order] = await Promise.all([
    loadMenuForDate(serviceDate),
    loadGuestByRoom(payload.room, serviceDate),
    loadOrderForRoomDate(payload.room, serviceDate),
  ]);

  if (!menu) {
    return (
      <main className="pp-frame">
        <header className="pp-header">
          <p className="pp-eyebrow">Pirate at Night · The Paradise Peak</p>
          <h1 className="pp-title">No dinner tonight</h1>
        </header>
        <section className="pp-body">
          <p className="pp-lead">
            The kitchen is dark this evening. Please check with reception for
            options.
          </p>
        </section>
      </main>
    );
  }

  const state = windowState(serviceDate);

  // Past 14:00 hard lock — thank you screen only
  if (state === 'past_hard_lock' && !order) {
    return <PastCutoffView menu={menu} room={payload.room} />;
  }

  // Between 10:00 and 14:00 with no submitted order → send to WhatsApp
  if (state === 'late' && !order) {
    return (
      <LockedView
        menu={menu}
        room={payload.room}
        guest={guest}
      />
    );
  }

  // Buffet night — different flow entirely (no course choices)
  if (menu.service_type === 'buffet') {
    return (
      <BuffetView
        menu={menu}
        guest={guest}
        room={payload.room}
        existing={order}
        canEdit={state === 'open'}
      />
    );
  }

  // Plated / weekend special
  if (order && order.items.length > 0) {
    return (
      <ConfirmationView
        menu={menu}
        order={order}
        guest={guest}
        canEdit={state === 'open'}
      />
    );
  }

  return (
    <OrderForm
      menu={menu}
      guest={guest}
      room={payload.room}
      existing={order}
    />
  );
}
