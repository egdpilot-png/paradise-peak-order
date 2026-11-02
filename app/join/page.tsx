// Public registration page. Reached from the property QR code (/join) or the
// link Paradise Peak adds to its booking confirmation emails (/join?src=email).

import type { Metadata } from 'next';
import { JoinForm } from './JoinForm';

export const metadata: Metadata = {
  title: 'Dinner at the Peak · Pirate by Night',
  description: 'Register for private dinners at The Paradise Peak, Saint-Martin.',
};

interface Props { searchParams: Promise<{ src?: string; lang?: string }> }

export default async function JoinPage({ searchParams }: Props) {
  const sp = await searchParams;
  const src = sp.src === 'email' ? 'email' : 'qr';
  const lang = sp.lang === 'fr' ? 'fr' : 'en';
  return <JoinForm src={src} initialLang={lang} />;
}
