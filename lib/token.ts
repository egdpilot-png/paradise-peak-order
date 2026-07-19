// Signed QR token — HMAC-SHA256, tiny payload, URL-safe base64.
// We deliberately avoid a full JWT library to keep dependencies minimal;
// this is a tiny, auditable implementation of the same idea.

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { QrTokenPayload } from './types';

const SECRET = process.env.QR_TOKEN_SECRET;

function b64url(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function b64urlDecode(s: string): Buffer {
  const pad = 4 - (s.length % 4);
  const padded = pad < 4 ? s + '='.repeat(pad) : s;
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function requireSecret(): string {
  if (!SECRET) throw new Error('QR_TOKEN_SECRET is not set');
  return SECRET;
}

export function signToken(payload: QrTokenPayload): string {
  const body = b64url(JSON.stringify(payload));
  const mac = createHmac('sha256', requireSecret()).update(body).digest();
  const sig = b64url(mac);
  return `${body}.${sig}`;
}

export function verifyToken(token: string): QrTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;

  const expected = createHmac('sha256', requireSecret()).update(body).digest();
  const provided = b64urlDecode(sig);
  if (expected.length !== provided.length) return null;
  if (!timingSafeEqual(expected, provided)) return null;

  let payload: QrTokenPayload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString('utf8'));
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.expires_at && payload.expires_at < now) return null;
  if (payload.property !== 'paradise_peak') return null;
  return payload;
}

// Small helper for the "issue QR tokens at check-in" admin flow.
export function issueTokenForStay(
  room: string,
  checkOutIso: string,
  guestId?: string,
): string {
  const [y, m, d] = checkOutIso.split('-').map(Number);
  // Expire at end of check-out day, Marigot time (approx UTC-4 → 04:00 UTC next day).
  const expires_at = Math.floor(Date.UTC(y, m - 1, d, 4, 0, 0) / 1000);
  return signToken({
    room,
    guest_id: guestId,
    issued_at: Math.floor(Date.now() / 1000),
    expires_at,
    property: 'paradise_peak',
  });
}
