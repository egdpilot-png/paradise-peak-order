import { redirect } from 'next/navigation';
import { getDashboardUser } from '@/lib/auth';
import QRCode from 'qrcode';
import { QrForm } from './QrForm';
import { PropertyQr } from './PropertyQr';

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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://menu.piratebynight.com';
  const joinUrl = `${appUrl}/join`;
  const emailUrl = `${appUrl}/join?src=email`;
  const kitchenKey = process.env.KITCHEN_SCREEN_KEY ?? '';
  const kitchenUrl = kitchenKey ? `${appUrl}/kitchen?key=${encodeURIComponent(kitchenKey)}` : null;
  const qrOpts = { errorCorrectionLevel: 'M' as const, margin: 1, width: 480, color: { dark: '#28251D', light: '#FBF8F1' } };
  const [propertyQr, emailQr] = await Promise.all([QRCode.toDataURL(joinUrl, qrOpts), QRCode.toDataURL(emailUrl, qrOpts)]);

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
            Guest access
          </h1>
          <p
            style={{
              color: '#7A6E56',
              fontSize: '0.95rem',
              margin: 0,
            }}
          >
            One QR code for the whole property, plus the link for booking confirmation emails.
            Guests register themselves; use the manual form only when a guest cannot.
          </p>
        </header>

        <PropertyQr qrDataUrl={propertyQr} emailQrDataUrl={emailQr} joinUrl={joinUrl} emailUrl={emailUrl} />

        {user.role === 'admin' && (
          <>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem', margin: '2.5rem 0 0.25rem' }}>Kitchen TV screen</h2>
            {kitchenUrl ? (
              <p style={{ fontSize: '0.92rem', lineHeight: 1.5 }}>
                Open this link once in the TV browser and bookmark it. It shows tonight's board without a login, read-only, and rolls over at midnight by itself.
                Keep it private — anyone with the link can see the orders.<br />
                <code style={{ display: 'inline-block', marginTop: 6, padding: '6px 10px', background: '#F4EFE4', borderRadius: 6, wordBreak: 'break-all' }}>{kitchenUrl}</code>
              </p>
            ) : (
              <p style={{ fontSize: '0.92rem', color: '#8B3A2E' }}>No KITCHEN_SCREEN_KEY is set in the environment yet; the kitchen screen link is disabled.</p>
            )}
          </>
        )}

        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem', margin: '2.5rem 0 0.25rem' }}>Register a guest manually</h2>
        <p style={{ color: '#7A6E56', fontSize: '0.95rem', margin: '0 0 1rem' }}>
          For guests who cannot use the QR or the link. Produces their personal stay link.
        </p>
        <QrForm initialPreviewDataUrl={previewDataUrl} initialUrl={previewUrl} />
      </div>
    </div>
  );
}
