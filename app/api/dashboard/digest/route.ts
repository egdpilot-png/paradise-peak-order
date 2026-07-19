import { NextResponse } from 'next/server';
import { getDashboardUser } from '@/lib/auth';
import { buildWhatsAppDigest } from '@/lib/dashboard';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const user = await getDashboardUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  if (!date) return NextResponse.json({ error: 'missing date' }, { status: 400 });

  const digest = await buildWhatsAppDigest(date);
  const wa = process.env.NEXT_PUBLIC_KITCHEN_WHATSAPP ?? '';
  const wa_url = `https://wa.me/${wa.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(digest)}`;
  return NextResponse.json({ digest, wa_url });
}
