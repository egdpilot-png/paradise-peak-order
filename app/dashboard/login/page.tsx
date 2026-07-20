// PIN login for the dashboard (Wave 1 shared-PIN auth).
// On correct PIN, sets a signed cookie and redirects to /dashboard/tonight.

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'crypto';
import 'server-only';

export const dynamic = 'force-dynamic';

const COOKIE_NAME = 'pp_dash';

function sign(value: string): string {
  const secret = process.env.DASHBOARD_COOKIE_SECRET || '';
  return createHmac('sha256', secret).update(value).digest('hex');
}

async function login(formData: FormData) {
  'use server';
  const submittedPin = String(formData.get('pin') || '').trim();
  const expectedPin = (process.env.DASHBOARD_PIN || '').trim();

  if (!expectedPin || !submittedPin) {
    redirect('/dashboard/login?error=1');
  }

  // constant-time compare
  const a = Buffer.from(submittedPin.padEnd(32, '\0'));
  const b = Buffer.from(expectedPin.padEnd(32, '\0'));
  const ok = a.length === b.length && timingSafeEqual(a, b);

  if (!ok) {
    redirect('/dashboard/login?error=1');
  }

  const token = `admin.${Date.now()}`;
  const value = `${token}.${sign(token)}`;

  const store = await cookies();
  store.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  redirect('/dashboard/tonight');
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const showError = sp?.error === '1';

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#F5EFE4',
        color: '#28251D',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 380,
          background: '#FBF8F1',
          border: '1px solid #E0D8C6',
          borderRadius: 16,
          padding: '2rem 2rem 1.75rem',
          boxShadow: '0 12px 32px rgba(40, 37, 29, 0.06)',
        }}
      >
        <h1
          style={{
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: '2rem',
            margin: '0 0 0.25rem',
            color: '#28251D',
          }}
        >
          Paradise Peak
        </h1>
        <p style={{ margin: '0 0 1.5rem', color: '#7A6E56', fontSize: '0.95rem' }}>
          Kitchen &amp; ops dashboard
        </p>

        <form action={login}>
          <label
            htmlFor="pin"
            style={{
              display: 'block',
              fontSize: '0.85rem',
              fontWeight: 600,
              marginBottom: '0.5rem',
              color: '#28251D',
            }}
          >
            Enter PIN
          </label>
          <input
            id="pin"
            name="pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            required
            style={{
              width: '100%',
              padding: '0.75rem 0.9rem',
              fontSize: '1.1rem',
              border: `1px solid ${showError ? '#B84E3A' : '#D6CCB6'}`,
              borderRadius: 10,
              background: '#FFFFFF',
              color: '#28251D',
              outline: 'none',
              boxSizing: 'border-box',
              letterSpacing: '0.15em',
            }}
          />
          {showError && (
            <p
              style={{
                color: '#B84E3A',
                fontSize: '0.85rem',
                margin: '0.5rem 0 0',
              }}
            >
              Wrong PIN. Try again.
            </p>
          )}

          <button
            type="submit"
            style={{
              marginTop: '1.25rem',
              width: '100%',
              padding: '0.85rem 1rem',
              fontSize: '1rem',
              fontWeight: 600,
              color: '#FBF8F1',
              background: '#28251D',
              border: 'none',
              borderRadius: 10,
              cursor: 'pointer',
            }}
          >
            Continue
          </button>
        </form>
      </div>
    </main>
  );
}
