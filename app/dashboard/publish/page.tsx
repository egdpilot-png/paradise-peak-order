// Server component. Resolves the weekend dates, loads context, hands off
// to the client editor.

import { redirect } from 'next/navigation';
import { getDashboardUser, canAct } from '@/lib/auth';
import { loadWeekendContext, nextWeekend } from '@/lib/publisher';
import { PublisherEditor } from './PublisherEditor';

interface Props {
  searchParams: Promise<{ saturday?: string }>;
}

export default async function PublishPage({ searchParams }: Props) {
  const user = await getDashboardUser();
  if (!user) redirect('/dashboard/login');
  if (!canAct(user, 'kitchen_action')) redirect('/dashboard/tonight?error=forbidden');

  const params = await searchParams;
  const saturday = params.saturday ?? nextWeekend().saturday;
  const ctx = await loadWeekendContext(saturday);

  return <PublisherEditor context={ctx} user={user} />;
}
