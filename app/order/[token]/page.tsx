// Legacy per-room QR links (season 2026 Wave 1). Stay tokens go to the stay
// page; anything else is invited to register via the property QR flow.

import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/token';

interface Props { params: Promise<{ token: string }> }

export default async function LegacyOrderPage({ params }: Props) {
  const { token } = await params;
  const payload = verifyToken(token);
  if (payload?.guest_id) redirect(`/my/${token}`);
  redirect('/join');
}
