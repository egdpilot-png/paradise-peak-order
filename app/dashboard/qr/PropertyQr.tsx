'use client';

import { useState } from 'react';
import { WEEK_LINES } from '@/lib/week';

const card: React.CSSProperties = {
  background: '#FBF8F1', border: '1px solid #E2D8C3', borderRadius: 16, padding: '1.25rem 1.5rem',
};

export function PropertyQr({ qrDataUrl, emailQrDataUrl, joinUrl, emailUrl }: {
  qrDataUrl: string; emailQrDataUrl: string; joinUrl: string; emailUrl: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(v: string) {
    try { await navigator.clipboard.writeText(v); setCopied(v); setTimeout(() => setCopied(null), 1800); } catch {}
  }
  function printCard() {
    const w = window.open('', '_blank', 'width=720,height=960');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Dinner at the Peak · QR</title>
      <style>
        @page { size: A5; margin: 12mm; }
        body { font-family: Georgia, serif; color: #28251D; background: #FBF8F1; margin: 0; padding: 10px 16px; text-align: center; }
        .eyebrow { font-family: Inter, sans-serif; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: #7A6E56; }
        h1 { font-size: 30px; margin: 6px 0 2px; }
        h2 { font-size: 15px; font-weight: normal; margin: 0 0 12px; color: #4a463f; }
        img { width: 200px; height: 200px; }
        .rules { font-family: Inter, sans-serif; font-size: 11px; line-height: 1.4; text-align: left; margin: 12px auto 0; max-width: 440px; color: #4a463f; }
        .rules p { margin: 0 0 5px; }
        .rules table { border-collapse: collapse; width: 100%; margin: 6px 0 8px; }
        .rules td { padding: 2px 0; vertical-align: top; border-bottom: 1px dotted #d8cfbd; line-height: 1.25; }
        .rules td.d { width: 84px; font-weight: 600; padding-right: 10px; }
        .rules td.d i { font-weight: 400; }
        .rules i { color: #7a7468; }
        .url { font-family: Inter, sans-serif; font-size: 12px; color: #8B3A2E; margin-top: 10px; }
      </style></head><body>
      <div class="eyebrow">Pirate by Night · The Paradise Peak</div>
      <h1>Dinner at the Peak</h1>
      <h2>Dîner au Peak · Monday to Saturday · du lundi au samedi</h2>
      <img src="${qrDataUrl}" alt="QR" />
      <div class="url">${joinUrl.replace('https://', '')}</div>
      <div class="rules">
        <p><b>Scan to register and book your nights.</b> <b>Scannez pour vous inscrire et réserver vos soirées.</b></p>
        <table>${WEEK_LINES.map((w) => `<tr><td class="d">${w.day}<br><i>${w.day_fr}</i></td><td>${w.text}<br><i>${w.text_fr}</i></td></tr>`).join('')}</table>
        <p>Served from 19:00. Change or cancel free until 10:00 on the day. <i>Service à partir de 19 h. Modification ou annulation gratuite jusqu'à 10 h le jour même.</i></p>
        <p>Fewer than 4 guests dining that night: dinner delivered and served by the Paradise Peak team · Adults only · Allergies: tell us when you register.</p>
      </div>
      <script>window.onload=()=>{window.print();}</script>
      </body></html>`);
    w.document.close();
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1.25rem' }}>
      <section style={card}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', margin: '0 0 0.25rem' }}>Property QR code</h2>
        <p style={{ color: '#7A6E56', fontSize: '0.9rem', margin: '0 0 1rem' }}>
          Print and place at reception, the pool terrace, the breakfast area and in each suite. The same code for everyone.
        </p>
        <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <img src={qrDataUrl} alt="Property QR" style={{ width: 180, height: 180, borderRadius: 8, border: '1px solid #E2D8C3' }} />
          <div style={{ fontSize: '0.9rem', lineHeight: 1.5 }}>
            <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.85rem', wordBreak: 'break-all' }}>{joinUrl}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button onClick={printCard} style={btn(true)}>Print A5 card</button>
              <button onClick={() => copy(joinUrl)} style={btn(false)}>{copied === joinUrl ? 'Copied' : 'Copy link'}</button>
            </div>
          </div>
        </div>
      </section>

      <section style={card}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', margin: '0 0 0.25rem' }}>Link for booking confirmation emails</h2>
        <p style={{ color: '#7A6E56', fontSize: '0.9rem', margin: '0 0 1rem' }}>
          Hugh and Thess paste this into every confirmation email so guests can book before arrival. It is tracked separately from the QR.
        </p>
        <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <img src={emailQrDataUrl} alt="Email link QR" style={{ width: 120, height: 120, borderRadius: 8, border: '1px solid #E2D8C3', opacity: 0.85 }} />
          <div style={{ fontSize: '0.9rem', lineHeight: 1.5, flex: 1, minWidth: 220 }}>
            <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.85rem', wordBreak: 'break-all' }}>{emailUrl}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button onClick={() => copy(emailUrl)} style={btn(true)}>{copied === emailUrl ? 'Copied' : 'Copy link'}</button>
              <button onClick={() => copy(SNIPPET_EN(emailUrl))} style={btn(false)}>{copied === SNIPPET_EN(emailUrl) ? 'Copied' : 'Copy email paragraph (EN)'}</button>
              <button onClick={() => copy(SNIPPET_FR(emailUrl))} style={btn(false)}>{copied === SNIPPET_FR(emailUrl) ? 'Copied' : 'Copier le paragraphe (FR)'}</button>
            </div>
            <p style={{ color: '#7A6E56', fontSize: '0.82rem', marginTop: 12, marginBottom: 0, whiteSpace: 'pre-line' }}>{SNIPPET_EN(emailUrl)}</p>
          </div>
        </div>
      </section>
    </div>
  );
}

const bullets = (lang: 'en' | 'fr') =>
  WEEK_LINES.map((w) => `• ${lang === 'fr' ? w.day_fr : w.day}${lang === 'fr' ? ' : ' : ': '}${lang === 'fr' ? w.text_fr : w.text}`).join('\n');
const SNIPPET_EN = (url: string) =>
  `Dinner at the Peak: private dinners by Pirate by Night, served at the property from 19:00.\n${bullets('en')}\nRegister and book your nights before you arrive: ${url}\nFree changes until 10:00 on the day. A card is requested with your first booking and charged at 10:00 on the day of each dinner.`;
const SNIPPET_FR = (url: string) =>
  `Dîner au Peak : des dîners privés signés Pirate by Night, servis sur place à partir de 19 h.\n${bullets('fr')}\nInscrivez-vous et réservez vos soirées avant votre arrivée : ${url}\nModification gratuite jusqu'à 10 h le jour même. Une carte est demandée à la première réservation et débitée à 10 h le jour de chaque dîner.`;

function btn(primary: boolean): React.CSSProperties {
  return {
    font: 'inherit', fontSize: '0.85rem', padding: '8px 14px', borderRadius: 999, cursor: 'pointer',
    background: primary ? '#28251D' : 'transparent', color: primary ? '#FBF8F1' : '#28251D',
    border: `1px solid ${primary ? '#28251D' : '#B8A98A'}`,
  };
}
