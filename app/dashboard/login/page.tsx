// Magic-link login for the dashboard (Supabase Auth).
// Only emails present in `dashboard_users` are authorized — the DB trigger
// `enforce_dashboard_allowlist` rejects sign-ups for anyone else.

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

async function sendMagicLink(formData: FormData) {
  'use server';

  const email = String(formData.get('email') || '').trim().toLowerCase();
  if (!email) {
    redirect('/dashboard/login?error=send');
  }

  const hdrs = await headers();
  const host = hdrs.get('x-forwarded-host') ?? hdrs.get('host');
  const proto = hdrs.get('x-forwarded-proto') ?? 'https';
  const origin = `${proto}://${host}`;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/dashboard/tonight`,
      shouldCreateUser: true,
    },
  });

  if (error) {
    const msg = error.message || '';
    const code = (error as { code?: string }).code;
    if (msg.includes('Access denied') || code === '42501') {
      redirect('/dashboard/login?error=notauthorized');
    }
    redirect('/dashboard/login?error=send');
  }

  redirect('/dashboard/login?sent=1');
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const sent = sp?.sent === '1';
  const showNotAuthorized = sp?.error === 'notauthorized';
  const showSendError = sp?.error === 'send';

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
        <div style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
          <img
            src="/logo.jpg"
            alt="Pirate By Night"
            style={{ width: 96, height: 96, objectFit: 'contain' }}
          />
        </div>
        <h1
          style={{
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: '2rem',
            margin: '0 0 0.25rem',
            color: '#28251D',
            textAlign: 'center',
          }}
        >
          Paradise Peak
        </h1>
        <p style={{ margin: '0 0 1.5rem', color: '#7A6E56', fontSize: '0.95rem', textAlign: 'center' }}>
          Sign in with your email
        </p>

        {sent && (
          <p
            role="status"
            style={{
              background: '#E7F0E3',
              border: '1px solid #A9C79A',
              color: '#33622B',
              borderRadius: 10,
              padding: '0.75rem 0.9rem',
              fontSize: '0.9rem',
              margin: '0 0 1.25rem',
            }}
          >
            Check your inbox for a sign-in link from Supabase.
          </p>
        )}

        {showNotAuthorized && (
          <p
            role="alert"
            style={{
              background: '#F6E3DE',
              border: '1px solid #DDA593',
              color: '#B84E3A',
              borderRadius: 10,
              padding: '0.75rem 0.9rem',
              fontSize: '0.9rem',
              margin: '0 0 1.25rem',
            }}
          >
            This email isn&apos;t authorized. Contact an administrator.
          </p>
        )}

        {showSendError && (
          <p
            role="alert"
            style={{
              background: '#F6E3DE',
              border: '1px solid #DDA593',
              color: '#B84E3A',
              borderRadius: 10,
              padding: '0.75rem 0.9rem',
              fontSize: '0.9rem',
              margin: '0 0 1.25rem',
            }}
          >
            Couldn&apos;t send the link. Try again.
          </p>
        )}

        <form action={sendMagicLink}>
          <label
            htmlFor="email"
            style={{
              display: 'block',
              fontSize: '0.85rem',
              fontWeight: 600,
              marginBottom: '0.5rem',
              color: '#28251D',
            }}
          >
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            autoFocus
            required
            style={{
              width: '100%',
              padding: '0.75rem 0.9rem',
              fontSize: '1.1rem',
              border: '1px solid #D6CCB6',
              borderRadius: 10,
              background: '#FFFFFF',
              color: '#28251D',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />

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
            Send magic link
          </button>
        </form>
      </div>
    </main>
  );
}
