import Link from 'next/link';

export default function NotFound() {
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
      <div>
        <h1 style={{ fontFamily: 'Georgia, serif', margin: '0 0 0.5rem' }}>
          Not found
        </h1>
        <p style={{ color: 'var(--ink-soft)' }}>
          That page doesn&apos;t exist.{' '}
          <Link href="/" style={{ color: 'var(--brass)' }}>
            Go home
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
