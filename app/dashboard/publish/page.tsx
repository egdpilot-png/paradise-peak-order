// Server component. Resolves the week (Monday) to edit, loads context,
// hands off to the client editor.

import { redirect } from 'next/navigation';
import { getDashboardUser, canAct } from '@/lib/auth';
import { loadWeekContext, defaultMonday } from '@/lib/publisher';
import { PublisherEditor } from './PublisherEditor';

interface Props {
  searchParams: Promise<{ week?: string }>;
}

export default async function PublishPage({ searchParams }: Props) {
  const user = await getDashboardUser();
  if (!user) redirect('/dashboard/login');
  if (!canAct(user, 'kitchen_action')) redirect('/dashboard/tonight?error=forbidden');

  const params = await searchParams;
  const monday = /^\d{4}-\d{2}-\d{2}$/.test(params.week ?? '') ? params.week! : defaultMonday();
  const ctx = await loadWeekContext(monday);

  return <PublisherEditor context={ctx} user={user} />;
}
