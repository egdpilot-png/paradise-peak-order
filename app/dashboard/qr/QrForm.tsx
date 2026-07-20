'use client';

import { useState, useTransition } from 'react';
import { issueQrForRoom, type IssueResult } from './actions';

type SuccessResult = Extract<IssueResult, { ok: true }>;

const CARD_ID = 'qr-print-card';

export function QrForm({
  initialPreviewDataUrl,
  initialUrl,
}: {
  initialPreviewDataUrl: string | null;
  initialUrl: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SuccessResult | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(
    initialPreviewDataUrl,
  );
  const [initialFallback] = useState<string | null>(initialUrl);
  const [copied, setCopied] = useState(false);

  async function generateQrImage(url: string): Promise<string> {
    // Generate on server via a tiny fetch to keep bundle small? Easier: use client lib.
    // But qrcode is a big dep — instead, ask server to produce data URL.
    const resp = await fetch(
      `/api/dashboard/qr-image?url=${encodeURIComponent(url)}`,
    );
    if (!resp.ok) throw new Error('QR image generation failed');
    const j = (await resp.json()) as { data_url: string };
    return j.data_url;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      try {
        const res = await issueQrForRoom(fd);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setResult(res);
        const img = await generateQrImage(res.order_url);
        setQrDataUrl(img);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function onPrint() {
    // Only print the card element
    const card = document.getElementById(CARD_ID);
    if (!card) return;
    window.print();
  }

  async function onCopy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.order_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  const showResult = !!result || !!qrDataUrl;
  const displayUrl = result?.order_url ?? initialFallback;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
      <style>{`
        @media (max-width: 800px) {
          .qr-grid { grid-template-columns: 1fr !important; }
        }
        @media print {
          body * { visibility: hidden !important; }
          #${CARD_ID}, #${CARD_ID} * { visibility: visible !important; }
          #${CARD_ID} {
            position: absolute !important;
            left: 0; top: 0;
            width: 100% !important;
            padding: 2rem !important;
          }
        }
      `}</style>

      {/* FORM CARD */}
      <div
        className="qr-grid-col"
        style={{
          background: '#FBF8F1',
          border: '1px solid #E0D8C6',
          borderRadius: 12,
          padding: '1.5rem',
        }}
      >
        <h2
          style={{
            fontFamily: 'Georgia, serif',
            fontSize: '1.1rem',
            margin: '0 0 1rem',
          }}
        >
          Guest details
        </h2>
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
          <Row2>
            <Field label="Room number *">
              <input
                name="room"
                required
                placeholder="e.g. 12"
                style={inputStyle}
              />
            </Field>
            <Field label="Party size">
              <input
                name="party_size"
                type="number"
                min={1}
                max={20}
                defaultValue={2}
                style={inputStyle}
              />
            </Field>
          </Row2>

          <Field label="Guest name *">
            <input
              name="guest_name"
              required
              placeholder="e.g. Marchetti family"
              style={inputStyle}
            />
          </Field>

          <Row2>
            <Field label="Check-in *">
              <input
                name="check_in"
                type="date"
                required
                defaultValue={todayIso()}
                style={inputStyle}
              />
            </Field>
            <Field label="Check-out *">
              <input
                name="check_out"
                type="date"
                required
                defaultValue={addDaysIso(7)}
                style={inputStyle}
              />
            </Field>
          </Row2>

          <Row2>
            <Field label="Language">
              <select name="language" defaultValue="en" style={inputStyle}>
                <option value="en">English</option>
                <option value="fr">Français</option>
              </select>
            </Field>
            <Field label="&nbsp;">
              <span style={{ ...inputStyle, opacity: 0, pointerEvents: 'none' }}>
                spacer
              </span>
            </Field>
          </Row2>

          <Field label="Dietary flags (comma-separated)">
            <input
              name="dietary_flags"
              placeholder="e.g. vegan, gluten_free"
              style={inputStyle}
            />
            <small style={{ color: '#7A6E56', fontSize: '0.75rem' }}>
              Options: vegetarian, vegan, gluten_free, dairy_free,
              nut_allergy, shellfish_allergy, pescatarian, halal, kosher,
              no_pork, no_alcohol, other
            </small>
          </Field>

          <Field label="Allergy notes">
            <textarea
              name="allergy_notes"
              rows={3}
              placeholder="e.g. Severe sesame allergy for child (age 8)"
              style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
            />
          </Field>

          {error && (
            <div
              style={{
                background: '#FDE9E5',
                border: '1px solid #E8B3AA',
                color: '#8B2A1F',
                padding: '0.6rem 0.75rem',
                borderRadius: 8,
                fontSize: '0.9rem',
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            style={{
              background: pending ? '#B8A18A' : '#28251D',
              color: '#FBF8F1',
              border: 'none',
              borderRadius: 8,
              padding: '0.75rem 1rem',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: pending ? 'wait' : 'pointer',
            }}
          >
            {pending ? 'Generating…' : 'Generate QR'}
          </button>
        </form>
      </div>

      {/* RESULT CARD */}
      <div
        style={{
          background: '#FBF8F1',
          border: '1px solid #E0D8C6',
          borderRadius: 12,
          padding: '1.5rem',
        }}
      >
        {!showResult ? (
          <div style={{ color: '#7A6E56', textAlign: 'center', padding: '3rem 1rem' }}>
            Fill the form and click Generate QR.
            <br />
            The card will appear here, ready to print.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button onClick={onPrint} style={secondaryBtn}>
                Print card
              </button>
              <button onClick={onCopy} style={secondaryBtn}>
                {copied ? 'Copied ✓' : 'Copy URL'}
              </button>
            </div>

            {/* Printable card (also visible on screen) */}
            <div
              id={CARD_ID}
              style={{
                background: '#FBF8F1',
                border: '2px solid #28251D',
                borderRadius: 12,
                padding: '1.5rem',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontFamily: 'Georgia, serif',
                  fontSize: '1.6rem',
                  fontWeight: 'bold',
                  color: '#28251D',
                  marginBottom: '0.25rem',
                }}
              >
                Paradise Peak
              </div>
              <div
                style={{
                  color: '#7A6E56',
                  fontSize: '0.85rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  marginBottom: '1.25rem',
                }}
              >
                Dinner ordering · Room {result?.room ?? '—'}
              </div>

              {qrDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrDataUrl}
                  alt="Guest QR code"
                  style={{
                    width: 280,
                    height: 280,
                    margin: '0 auto',
                    display: 'block',
                    borderRadius: 8,
                  }}
                />
              )}

              <div
                style={{
                  marginTop: '1.25rem',
                  fontSize: '0.95rem',
                  fontFamily: 'Georgia, serif',
                }}
              >
                Scan to view tonight's menu and place your order.
              </div>
              <div
                style={{
                  color: '#7A6E56',
                  fontSize: '0.8rem',
                  marginTop: '0.35rem',
                }}
              >
                Order by 10:00 AM · Service at 6:00 PM
              </div>

              {result && (
                <div
                  style={{
                    marginTop: '1rem',
                    fontSize: '0.75rem',
                    color: '#7A6E56',
                    borderTop: '1px dashed #D4C8AF',
                    paddingTop: '0.75rem',
                  }}
                >
                  {result.guest_name && (
                    <div>
                      <strong>{result.guest_name}</strong> · Party of{' '}
                      {result.party_size}
                    </div>
                  )}
                  <div>
                    Valid {result.check_in} → {result.check_out}
                  </div>
                </div>
              )}
            </div>

            {displayUrl && (
              <div
                style={{
                  marginTop: '1rem',
                  fontSize: '0.75rem',
                  color: '#7A6E56',
                  wordBreak: 'break-all',
                  background: '#F5EFE4',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 6,
                  fontFamily: 'monospace',
                }}
              >
                {displayUrl}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// -------- Helpers --------
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'block' }}>
      <div
        style={{
          fontSize: '0.8rem',
          fontWeight: 600,
          color: '#28251D',
          marginBottom: '0.3rem',
        }}
        dangerouslySetInnerHTML={{ __html: label }}
      />
      {children}
    </label>
  );
}

function Row2({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}
    >
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.55rem 0.7rem',
  border: '1px solid #D4C8AF',
  borderRadius: 6,
  background: '#FFFFFF',
  fontSize: '0.95rem',
  color: '#28251D',
  boxSizing: 'border-box',
};

const secondaryBtn: React.CSSProperties = {
  background: '#F5EFE4',
  border: '1px solid #D4C8AF',
  borderRadius: 6,
  padding: '0.5rem 0.85rem',
  fontSize: '0.85rem',
  color: '#28251D',
  cursor: 'pointer',
  fontWeight: 600,
};

function todayIso(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
function addDaysIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
