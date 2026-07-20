// Serves a printable HTML page ("The Book") — one page per room.
// Users hit browser's Print → Save as PDF for a physical backup service sheet.
// This is a Wave-1 implementation. A true server-side PDF binary will come later.

import { NextResponse } from 'next/server';
import { getDashboardUser } from '@/lib/auth';
import { loadTonightSummary, loadRoomRows, loadAllergyMatrix } from '@/lib/dashboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function courseLabel(c: string): string {
  const map: Record<string, string> = {
    amuse: 'Amuse',
    starter: 'Starter',
    main: 'Main',
    side: 'Side',
    dessert: 'Dessert',
  };
  return map[c] ?? c;
}

function flagLabel(f: string): string {
  const map: Record<string, string> = {
    vegan: 'VEGAN',
    vegetarian: 'VEGETARIAN',
    gluten_free: 'GLUTEN-FREE',
    dairy_free: 'DAIRY-FREE',
    nut_free: 'NUT-FREE',
    shellfish_free: 'SHELLFISH-FREE',
    pescatarian: 'PESCATARIAN',
    halal: 'HALAL',
    kosher: 'KOSHER',
    low_sodium: 'LOW-SODIUM',
    diabetic: 'DIABETIC',
  };
  return map[f] ?? f.replace(/_/g, ' ').toUpperCase();
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    submitted: 'Submitted',
    buffet_confirmed: 'Buffet confirmed',
    pending: 'Pending',
    chefs_choice: "Chef's choice",
    late_window: 'Late window',
    no_order: 'No order',
  };
  return map[s] ?? s;
}

export async function GET(req: Request) {
  const user = await getDashboardUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  if (!date) return new NextResponse('Missing date', { status: 400 });

  const [summary, rooms, allergies] = await Promise.all([
    loadTonightSummary(date),
    loadRoomRows(date),
    loadAllergyMatrix(date),
  ]);

  const dateObj = new Date(date + 'T12:00:00Z');
  const dateLabel = dateObj.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const roomsHtml = rooms.length === 0
    ? `<section class="page"><div class="empty">No rooms occupied for ${esc(dateLabel)}.</div></section>`
    : rooms.map(r => {
      const coursesHtml = (r.courses ?? []).length === 0
        ? '<div class="no-order">— no order submitted —</div>'
        : `<ul class="courses">` +
          r.courses.map(c => `<li><span class="course-label">${esc(courseLabel(c.course))}</span> <span class="course-dish">${esc(c.dish_name)}</span></li>`).join('') +
          `</ul>`;

      const flagsHtml = (r.dietary_flags ?? []).length > 0
        ? `<div class="flags">` + r.dietary_flags.map(f => `<span class="flag">${esc(flagLabel(f))}</span>`).join('') + `</div>`
        : '';

      const notesHtml = r.allergy_notes
        ? `<div class="allergy-notes"><strong>Notes:</strong> ${esc(r.allergy_notes)}</div>`
        : '';

      const kitchenNotesHtml = r.notes
        ? `<div class="kitchen-notes"><strong>Kitchen notes:</strong> ${esc(r.notes)}</div>`
        : '';

      return `
        <section class="page">
          <div class="room-mark">
            <img src="/logo.jpg" alt="" class="room-mark-img" />
            <span>Pirate By Night · Paradise Peak</span>
          </div>
          <header class="room-header">
            <div class="room-num">Room ${esc(r.room)}</div>
            <div class="status status-${esc(r.status)}">${esc(statusLabel(r.status))}</div>
          </header>
          <div class="guest">
            <div class="guest-name">${esc(r.guest_name ?? '—')}</div>
            <div class="guest-meta">Party of ${esc(r.cover_count ?? r.party_size ?? 1)} · ${esc((r.language ?? 'en').toUpperCase())}${r.order_ref ? ` · Order ${esc(r.order_ref)}` : ''}</div>
          </div>
          ${flagsHtml}
          ${notesHtml}
          <div class="section-label">Courses</div>
          ${coursesHtml}
          ${kitchenNotesHtml}
          <footer class="page-footer">
            <span>Paradise Peak · ${esc(dateLabel)}</span>
            <span>Kitchen The Book · Room ${esc(r.room)}</span>
          </footer>
        </section>
      `;
    }).join('');

  // Optional summary page (cover)
  const coverHtml = `
    <section class="page cover">
      <div class="cover-logo-wrap">
        <img src="/logo.jpg" alt="Pirate By Night" class="cover-logo" />
      </div>
      <div class="cover-brand">Paradise Peak</div>
      <div class="cover-subtitle">Kitchen · The Book</div>
      <div class="cover-date">${esc(dateLabel)}</div>
      <div class="cover-stats">
        <div class="stat"><div class="stat-num">${esc(summary.roomsOccupied)}</div><div class="stat-label">Rooms occupied</div></div>
        <div class="stat"><div class="stat-num">${esc(summary.coversConfirmed)}</div><div class="stat-label">Covers confirmed</div></div>
        <div class="stat"><div class="stat-num">${esc(summary.ordersReceived)}</div><div class="stat-label">Orders in</div></div>
        <div class="stat"><div class="stat-num">${esc(summary.roomsMissing)}</div><div class="stat-label">Awaiting</div></div>
      </div>
      ${allergies.length > 0 ? `
        <div class="cover-section-label">Allergy overview</div>
        <ul class="allergy-list">
          ${allergies.map(a => `
            <li>
              <div class="allergy-flag">${esc(a.label)}</div>
              <div class="allergy-guests">
                ${a.guests.map(g => `Room ${esc(g.room)} · ${esc(g.guest_name ?? '—')}${g.allergy_notes ? ` — ${esc(g.allergy_notes)}` : ''}${g.conflict ? ' ⚠️ CONFLICT' : ''}`).join('<br/>')}
              </div>
            </li>
          `).join('')}
        </ul>
      ` : ''}
      <footer class="page-footer">
        <span>Paradise Peak · The Book</span>
        <span>${esc(dateLabel)}</span>
      </footer>
    </section>
  `;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Paradise Peak · The Book · ${esc(dateLabel)}</title>
<style>
  @page { size: A4; margin: 15mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    color: #28251D;
    background: #F5EFE4;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    background: #FBF8F1;
    padding: 24mm 20mm;
    min-height: 267mm;
    page-break-after: always;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .page:last-child { page-break-after: auto; }

  .cover-logo-wrap {
    text-align: center;
    margin-bottom: 12pt;
  }
  .cover-logo {
    width: 90pt;
    height: 90pt;
    object-fit: contain;
  }
  .cover { text-align: center; }
  .cover .cover-brand {
    font-size: 42pt;
    font-family: Georgia, serif;
    margin: 0 0 4pt;
  }
  .cover .cover-subtitle {
    font-size: 14pt;
    color: #7A6E56;
    margin-bottom: 24pt;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .cover .cover-date {
    font-size: 20pt;
    margin-bottom: 32pt;
  }
  .cover-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12pt;
    margin-bottom: 24pt;
    text-align: left;
  }
  .cover-section-label, .allergy-list { text-align: left; }
  .stat {
    background: #F5EFE4;
    border: 1px solid #E0D8C6;
    border-radius: 6pt;
    padding: 12pt;
    text-align: center;
  }
  .stat-num {
    font-size: 32pt;
    font-family: Georgia, serif;
  }
  .stat-label {
    font-size: 9pt;
    color: #7A6E56;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
  .cover-section-label {
    font-size: 10pt;
    color: #7A6E56;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    margin: 16pt 0 8pt;
  }
  .allergy-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .allergy-list li {
    border-left: 3px solid #C8B58C;
    padding: 6pt 10pt;
    margin-bottom: 6pt;
    background: #F5EFE4;
  }
  .allergy-flag {
    font-size: 10pt;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #7A6E56;
    margin-bottom: 3pt;
  }
  .allergy-guests {
    font-size: 11pt;
  }

  .room-mark {
    display: flex;
    align-items: center;
    gap: 8pt;
    font-size: 9pt;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #7A6E56;
    margin-bottom: 12pt;
  }
  .room-mark-img { width: 22pt; height: 22pt; object-fit: contain; opacity: 0.9; }
  .room-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-bottom: 2px solid #28251D;
    padding-bottom: 8pt;
    margin-bottom: 14pt;
  }
  .room-num {
    font-size: 32pt;
    font-family: Georgia, serif;
    letter-spacing: 0.02em;
  }
  .status {
    font-size: 10pt;
    padding: 4pt 10pt;
    border-radius: 20pt;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    background: #F5EFE4;
    border: 1px solid #E0D8C6;
  }
  .status-submitted { background: #EAF3E7; border-color: #B4CFA8; }
  .status-chefs_choice { background: #F3EDDA; border-color: #D6C58C; }
  .status-no_order { background: #F5E4E4; border-color: #D6A8A8; }

  .guest-name {
    font-size: 18pt;
    margin-bottom: 2pt;
  }
  .guest-meta {
    font-size: 10pt;
    color: #7A6E56;
  }
  .flags {
    margin-top: 10pt;
    display: flex;
    flex-wrap: wrap;
    gap: 6pt;
  }
  .flag {
    background: #F5EFE4;
    border: 1px solid #C8B58C;
    padding: 3pt 8pt;
    border-radius: 4pt;
    font-size: 9pt;
    letter-spacing: 0.1em;
  }
  .allergy-notes, .kitchen-notes {
    margin-top: 10pt;
    padding: 8pt 10pt;
    background: #FAF3E3;
    border: 1px solid #E0D8C6;
    border-radius: 4pt;
    font-size: 11pt;
  }
  .section-label {
    margin-top: 18pt;
    font-size: 10pt;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: #7A6E56;
    border-bottom: 1px solid #E0D8C6;
    padding-bottom: 4pt;
    margin-bottom: 10pt;
  }
  .courses {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .courses li {
    padding: 6pt 0;
    border-bottom: 1px dotted #D6CCB6;
    display: flex;
    gap: 14pt;
    align-items: baseline;
  }
  .course-label {
    display: inline-block;
    min-width: 70pt;
    font-size: 9pt;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #7A6E56;
  }
  .course-dish { font-size: 14pt; }
  .no-order {
    color: #7A6E56;
    font-style: italic;
    padding: 12pt 0;
  }
  .empty {
    text-align: center;
    margin-top: 60pt;
    color: #7A6E56;
    font-style: italic;
  }
  .page-footer {
    margin-top: auto;
    padding-top: 16pt;
    border-top: 1px solid #E0D8C6;
    display: flex;
    justify-content: space-between;
    font-size: 9pt;
    color: #7A6E56;
  }

  .print-bar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    padding: 10pt 16pt;
    background: #28251D;
    color: #FBF8F1;
    display: flex;
    justify-content: space-between;
    align-items: center;
    z-index: 1000;
    font-family: system-ui, -apple-system, sans-serif;
  }
  .print-bar button {
    padding: 8pt 16pt;
    background: #FBF8F1;
    color: #28251D;
    border: none;
    border-radius: 4pt;
    font-weight: 600;
    cursor: pointer;
    font-size: 11pt;
  }
  @media print {
    .print-bar { display: none; }
    body { background: #FFF; }
    .page { background: #FFF; padding: 0; }
  }
</style>
</head>
<body>
  <div class="print-bar">
    <span>Paradise Peak · The Book · ${esc(dateLabel)} · ${rooms.length} room${rooms.length === 1 ? '' : 's'}</span>
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>
  <div style="height: 44pt;"></div>
  ${coverHtml}
  ${roomsHtml}
  <script>
    // Auto-open print dialog after brief delay so styles settle
    setTimeout(function(){ window.print(); }, 400);
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
    },
  });
}
