'use client';

// Magic-link login for the dashboard (Supabase Auth, PKCE flow).
//
// This page is a client component so the PKCE code_verifier is stored in the
// user's browser. That means:
//   • The magic-link email contains a `?code=...` in the URL, NOT a one-time
//     token — Gmail's link scanner cannot burn the login by pre-fetching it.
//   • Only the user's browser (which holds the verifier) can complete the
//     exchange at /auth/callback.
//
// Only emails present in `dashboard_users` are authorized — the DB trigger
// `enforce_dashboard_allowlist` rejects sign-ups for anyone else.

import { useState, type FormEvent } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'sent' }
  | { kind: 'error'; message: string };

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status.kind === 'submitting' || status.kind === 'sent') return;

    const cleaned = email.trim().toLowerCase();
    if (!cleaned) {
      setStatus({ kind: 'error', message: 'Enter your email address.' });
      return;
    }

    setStatus({ kind: 'submitting' });

    try {
      const supabase = getSupabaseBrowserClient();
      const origin = window.location.origin;
      const { error } = await supabase.auth.signInWithOtp({
        email: cleaned,
        options: {
          emailRedirectTo: `${origin}/auth/callback?next=/dashboard/tonight`,
          shouldCreateUser: true,
        },
      });

      if (error) {
        const msg = error.message || '';
        const code = (error as { code?: string }).code;
        if (msg.includes('Access denied') || code === '42501') {
          setStatus({
            kind: 'error',
            message: "This email isn't authorized. Contact an administrator.",
          });
          return;
        }
        if (/rate limit|only request this after/i.test(msg)) {
          setStatus({
            kind: 'error',
            message:
              'A link was already requested recently. Wait about a minute and try again.',
          });
          return;
        }
        setStatus({
          kind: 'error',
          message: "Couldn't send the link. Try again.",
        });
        return;
      }

      setStatus({ kind: 'sent' });
    } catch {
      setStatus({
        kind: 'error',
        message: "Couldn't send the link. Try again.",
      });
    }
  }

  const disabled = status.kind === 'submitting' || status.kind === 'sent';

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
          {/* eslint-disable-next-line @next/next/no-img-element */}
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
        <p
          style={{
            margin: '0 0 1.5rem',
            color: '#7A6E56',
            fontSize: '0.95rem',
            textAlign: 'center',
          }}
        >
          Sign in with your email
        </p>

        {status.kind === 'sent' && (
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
            Check your inbox for a sign-in link. It expires in about 1 hour.
          </p>
        )}

        {status.kind === 'error' && (
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
            {status.message}
          </p>
        )}

        <form onSubmit={handleSubmit}>
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={disabled}
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
              opacity: disabled ? 0.7 : 1,
            }}
          />

          <button
            type="submit"
            disabled={disabled}
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
              cursor: disabled ? 'default' : 'pointer',
              opacity: disabled ? 0.7 : 1,
            }}
          >
            {status.kind === 'submitting'
              ? 'Sending…'
              : status.kind === 'sent'
              ? 'Link sent'
              : 'Send magic link'}
          </button>
        </form>
      </div>
    </main>
  );
}
