import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { getDashboardUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await getDashboardUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  }

  // Only issue QRs for our own domain to avoid abuse of the endpoint.
  try {
    const parsed = new URL(url);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://menu.piratebynight.com';
    const appHost = new URL(appUrl).host;
    if (parsed.host !== appHost) {
      return NextResponse.json({ error: 'Refusing to encode external URL' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
  }

  const data_url = await QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 400,
    color: { dark: '#28251D', light: '#FBF8F1' },
  });

  return NextResponse.json({ data_url });
}
