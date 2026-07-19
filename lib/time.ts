// Cutoff logic. All times are interpreted in America/Marigot (UTC-4 year-round,
// St Martin does not observe DST). We compare to the current wall time
// on the service date, not to now() in whatever server timezone.

const TZ = 'America/Marigot';

export const ORDER_CUTOFF_HOUR = 10;   // 10:00 — orders lock, kitchen fires
export const HARD_LOCK_HOUR = 14;      // 14:00 — no more changes, chef's choice

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
