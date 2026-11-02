// Cutoff logic. All times are interpreted in America/Marigot (UTC-4 year-round,
// St Martin does not observe DST). We compare to the current wall time
// on the service date, not to now() in whatever server timezone.

const TZ = 'America/Marigot';

export const ORDER_CUTOFF_HOUR = 10;   // 10:00 — orders lock, kitchen fires
export const HARD_LOCK_HOUR = 14;      // 14:00 — no more changes, chef's choice

// Demo/rehearsal switch. Set ORDER_WINDOW_OVERRIDE=open on the server to force
// the guest ordering window open regardless of the clock. Leave unset in
// normal operation.
export function windowOverride(): WindowState | null {
  const v = process.env.ORDER_WINDOW_OVERRIDE;
  return v === 'open' ? 'open' : null;
}

interface WallTime {
  y: number; m: number; d: number; h: number; min: number;
}

function nowInMarigot(): WallTime {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    h: Number(parts.hour === '24' ? '0' : parts.hour),
    min: Number(parts.minute),
  };
}

function serviceDateAsWall(iso: string): WallTime {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d, h: 0, min: 0 };
}

// Returns true if the current Marigot time is before <hour>:00 on service_date.
function isBeforeCutoff(serviceDate: string, hour: number): boolean {
  if (windowOverride() === 'open') return true;
  const now = nowInMarigot();
  const svc = serviceDateAsWall(serviceDate);
  if (now.y !== svc.y || now.m !== svc.m || now.d !== svc.d) {
    // Different day: if today is before service_date → ordering open.
    // If today is after → ordering closed.
    const nowStamp = now.y * 10000 + now.m * 100 + now.d;
    const svcStamp = svc.y * 10000 + svc.m * 100 + svc.d;
    return nowStamp < svcStamp;
  }
  return now.h < hour || (now.h === hour && now.min < 0);
}

export function isOrderingOpen(serviceDate: string): boolean {
  return isBeforeCutoff(serviceDate, ORDER_CUTOFF_HOUR);
}

export function isBeforeHardLock(serviceDate: string): boolean {
  return isBeforeCutoff(serviceDate, HARD_LOCK_HOUR);
}

export type WindowState = 'open' | 'late' | 'past_hard_lock' | 'past_service';

export function windowState(serviceDate: string): WindowState {
  const forced = windowOverride();
  if (forced) return forced;
  const now = nowInMarigot();
  const svc = serviceDateAsWall(serviceDate);
  const nowStamp = now.y * 10000 + now.m * 100 + now.d;
  const svcStamp = svc.y * 10000 + svc.m * 100 + svc.d;

  if (nowStamp < svcStamp) return 'open';        // ordering the future
  if (nowStamp > svcStamp) return 'past_service'; // service date has passed

  if (now.h < ORDER_CUTOFF_HOUR) return 'open';
  if (now.h < HARD_LOCK_HOUR) return 'late';
  return 'past_hard_lock';
}

export function formatServiceDate(iso: string, lang: 'en' | 'fr' = 'en'): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

// ---------------------------------------------------------------------
// Weekly service rhythm (season 2026/27, agreed 2 Nov 2026)
//   Mon & Fri  → buffet, flat price per adult
//   Tue/Wed/Thu/Sat → plated fixed menu, priced per dish
//   Sun        → closed
// ---------------------------------------------------------------------

export type NightKind = 'buffet' | 'plated' | 'closed';

export const BUFFET_PRICE_CENTS = 5500;
export const MIN_COVERS_ONSITE = 4;

/** 0 = Sunday … 6 = Saturday, computed on the calendar date itself. */
export function weekdayOf(serviceDate: string): number {
  const [y, m, d] = serviceDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function nightKind(serviceDate: string): NightKind {
  const wd = weekdayOf(serviceDate);
  if (wd === 0) return 'closed';
  if (wd === 1 || wd === 5) return 'buffet';
  return 'plated';
}

export function addDays(serviceDate: string, n: number): string {
  const [y, m, d] = serviceDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function todayInMarigot(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Marigot', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/** Every calendar date from `from` (inclusive) to `to` (exclusive). */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d < to && out.length < 60; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Monday of the ISO week containing `serviceDate`. */
export function mondayOf(serviceDate: string): string {
  const wd = weekdayOf(serviceDate);
  return addDays(serviceDate, wd === 0 ? -6 : 1 - wd);
}

export function formatEuro(cents: number | null | undefined, lang: 'en' | 'fr' = 'en'): string {
  if (cents == null) return '';
  return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-IE', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function shortDate(iso: string, lang: 'en' | 'fr' = 'en'): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
