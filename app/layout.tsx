import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Paradise Peak',
  description: 'Villa ordering and kitchen operations',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
