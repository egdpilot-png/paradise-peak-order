# Guest QR Ordering Page — Paradise Peak × Pirate at Night

Drop-in Next.js 14 (App Router) prototype for the guest-facing dinner-ordering page.

## What's here

```
paradise-peak-order/
├── app/
│   ├── order/[token]/
│   │   ├── page.tsx              ← Server component: loads menu + existing order
│   │   ├── OrderForm.tsx         ← Client component: interactive picker
│   │   ├── ConfirmationView.tsx  ← Post-submit summary
│   │   ├── BuffetView.tsx        ← Mon/Thu buffet flow (headcount + dietary)
│   │   ├── LockedView.tsx        ← After 10:00 read-only
│   │   ├── PastCutoffView.tsx    ← After 14:00 hard lock
│   │   └── styles.module.css     ← Elegant editorial styling
│   └── api/order/route.ts        ← POST/PUT order submission
├── lib/
│   ├── supabase.ts               ← Server + service-role clients
│   ├── token.ts                  ← Sign/verify short-lived QR tokens
│   ├── time.ts                   ← Cutoff calculation (America/Marigot)
│   └── types.ts                  ← Shared TypeScript types
└── preview/
    └── index.html                ← Standalone HTML mock that you can open
                                     in a browser to see the exact UX
```

## Environment variables

Add to `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
QR_TOKEN_SECRET=some-64-char-random-hex
NEXT_PUBLIC_KITCHEN_WHATSAPP=+590XXXXXXXXX
```

## Dashboard auth

The kitchen/ops dashboard (`/dashboard/*`) uses **magic-link (Supabase Auth)**. Only emails present in `public.dashboard_users` can sign in — a DB trigger rejects sign-ups for any other address. To add staff, insert a row into `public.dashboard_users` in Supabase (email, role, display_name).

Sign-in flow: `/dashboard/login` → email → `supabase.auth.signInWithOtp` → link lands on `/auth/callback` → session cookie set → redirected to `/dashboard/tonight`. Sign out via `/dashboard/logout`.

## Route flow

1. Guest scans QR sticker → hits `https://order.pirateatnight.com/order/eyJhbGciOi...`
2. `page.tsx` (server component) verifies the token, looks up today's menu for that room, checks whether the guest already has an order in progress, and picks which view to render:
   - Past 14:00 → `PastCutoffView`
   - Between 10:00 and 14:00 with no submitted order → `LockedView`
   - Buffet night (Mon/Thu) → `BuffetView`
   - Plated / weekend special, order exists → `ConfirmationView` (with edit)
   - Plated / weekend special, no order yet → `OrderForm`
3. Guest picks courses → client POST to `/api/order` → order saved to Supabase, status = `submitted`
4. Guest can edit up until 10:00; after that, the page flips to `LockedView` automatically

## Preview

Open `preview/index.html` in a browser. It renders the exact production UX with mock data — no build required. Use this to show the property owners what the guest will actually see.

## Next steps to ship

- Install: `npx create-next-app@latest paradise-peak-order --typescript --app --tailwind`
- Copy the files from this folder into the generated project
- Run `paradise_peak_schema.sql` in Supabase
- QR codes: use `next-qrcode` or an external generator to bake `https://order.pirateatnight.com/order/{signed_token}` into a printed sticker per room
