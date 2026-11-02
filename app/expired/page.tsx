import Link from 'next/link';
import styles from '@/app/my/guest.module.css';

export default function ExpiredPage() {
  return (
    <main className={styles.frame}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Pirate by Night · The Paradise Peak</p>
        <h1 className={styles.title}>This link has expired</h1>
        <p className={styles.subtitle}>Ce lien a expiré</p>
      </header>
      <section className={styles.body}>
        <p className={styles.lead}>
          Links are valid for the duration of a stay. If you are staying with us, register again in a minute
          and we will send you a fresh link. · Les liens sont valables le temps du séjour ; inscrivez-vous à
          nouveau pour recevoir un nouveau lien.
        </p>
        <Link href="/join" className={styles.submit} style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
          Register · S&apos;inscrire
        </Link>
      </section>
    </main>
  );
}
