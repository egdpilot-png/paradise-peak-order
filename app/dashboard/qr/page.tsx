import { redirect } from 'next/navigation';
import { getDashboardUser } from '@/lib/auth';
import QRCode from 'qrcode';
import { QrForm } from './QrForm';

export const dynamic = 'force-dynamic';

export default async function QrPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getDashboardUser();
  if (!user) redirect('/dashboard/login');

  // Support ?token=... to just render a QR without going through the form
  // (used by the internal issue action's redirect).
  const sp = await searchParams;
  const previewUrl = typeof sp.url === 'string' ? sp.url : null;
  let previewDataUrl: string | null = null;
  if (previewUrl) {
    previewDataUrl = await QRCode.toDataURL(previewUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 400,
      color: { dark: '#28251D', light: '#FBF8F1' },
    });
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#F5EFE4',
        padding: '2rem 1.5rem 4rem',
        fontFamily:
          'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: '#28251D',
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <header style={{ marginBottom: '1.5rem' }}>
          <a
            href="/dashboard/tonight"
            style={{
              color: '#8B3A2E',
              fontSize: '0.85rem',
              textDecoration: 'none',
            }}
          >
            ← Back to Tonight
          </a>
          <h1
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: '2rem',
              margin: '0.5rem 0 0.25rem',
            }}
          >
            Issue Guest QR
          </h1>
          <p
            style={{
              color: '#7A6E56',
              fontSize: '0.95rem',
              margin: 0,
            }}
          >
            Create a guest record and generate a printable QR card for the room.
          </p>
        </header>

        <QrForm initialPreviewDataUrl={previewDataUrl} initialUrl={previewUrl} />
      </div>
    </div>
  );
}
