// Public conditions page, rendered from the markdown source in /public so the
// document Hugh, Thess and Eugene review is the one guests accept.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import styles from '@/app/my/guest.module.css';

export const metadata = { title: 'Dinner service conditions · Pirate by Night at The Paradise Peak' };

interface Props { searchParams: Promise<{ lang?: string }> }

// Minimal markdown → HTML for headings, paragraphs, tables, lists, bold.
function md(src: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const lines = src.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith('|')) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].startsWith('|')) { rows.push(lines[i]); i++; }
      const cells = (r: string) => r.split('|').slice(1, -1).map((c) => c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      out.push('<table><thead><tr>' + head.map((h) => `<th>${inline(h)}</th>`).join('') + '</tr></thead><tbody>'
        + body.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table>');
      continue;
    }
    if (l.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith('- ')) { items.push(lines[i].slice(2)); i++; }
      out.push('<ul>' + items.map((x) => `<li>${inline(x)}</li>`).join('') + '</ul>');
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) { out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`); i++; continue; }
    if (l.trim() === '---' || l.trim() === '') { i++; continue; }
    // paragraph: merge consecutive numbered clauses as separate paragraphs
    out.push(`<p>${inline(l)}</p>`);
    i++;
  }
  return out.join('\n');
}

export default async function TermsPage({ searchParams }: Props) {
  const { lang } = await searchParams;
  const file = await fs.readFile(path.join(process.cwd(), 'public', 'terms-v0.1.md'), 'utf8');
  const [, rest] = file.split('## Part A — English');
  const [en, fr] = rest.split('## Partie B — Français');
  const html = md(lang === 'fr' ? fr : en);
  const other = lang === 'fr' ? '/terms?lang=en' : '/terms?lang=fr';
  return (
    <main className={styles.frame}>
      <div className={styles.langSwitch}>
        <a href={other} className={styles.pill}>{lang === 'fr' ? 'English' : 'Français'}</a>
      </div>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Pirate by Night · The Paradise Peak</p>
        <h1 className={styles.title}>{lang === 'fr' ? 'Conditions du service de dîner' : 'Dinner service conditions'}</h1>
        <p className={styles.meta}>{lang === 'fr' ? 'Version 0.1 — 2 novembre 2026 (projet)' : 'Version 0.1 — 2 November 2026 (draft)'}</p>
      </header>
      <section className={`${styles.body} terms`} dangerouslySetInnerHTML={{ __html: html }} />
      <style>{`
        .terms h3 { font-size: 1.1rem; margin: 28px 0 10px; }
        .terms h4 { font-size: 0.95rem; margin: 20px 0 8px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-soft); }
        .terms p { margin: 0 0 10px; line-height: 1.55; }
        .terms table { width: 100%; border-collapse: collapse; margin: 12px 0 16px; font-size: 0.95rem; }
        .terms th, .terms td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--rule); }
        .terms ul { padding-left: 20px; line-height: 1.55; }
      `}</style>
    </main>
  );
}
