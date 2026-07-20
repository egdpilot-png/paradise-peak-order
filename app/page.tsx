import Link from 'next/link';

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 480 }}>
        <img
          src="/logo.jpg"
          alt="Pirate By Night"
          style={{
            width: 160,
            height: 160,
            objectFit: 'contain',
            marginBottom: '1rem',
          }}
        />
        <h1
          style={{
            fontFamily: 'Georgia, serif',
            fontSize: '2.5rem',
            margin: '0 0 0.5rem',
            letterSpacing: '-0.01em',
          }}
        >
          Paradise Peak
        </h1>
        <p style={{ color: 'var(--ink-soft)', margin: '0 0 2rem' }}>
          Villa ordering & kitchen operations.
        </p>
        <p style={{ color: 'var(--ink-soft)', fontSize: '0.9rem' }}>
          Guests: scan the QR card in your suite to see tonight&apos;s menu.
          <br />
          Staff:{' '}
          <Link
            href="/dashboard/tonight"
            style={{ color: 'var(--brass)', borderBottom: '1px solid currentColor' }}
          >
            open the dashboard
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
