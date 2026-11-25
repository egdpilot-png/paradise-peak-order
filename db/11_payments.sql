-- 11 — Card payments (Stripe, SAS ALLEN account)
-- Additive and safe to re-run.
--   guests.stripe_livemode   which Stripe mode saved the card (true = live, false = test)
--   guests.card_exp          MM/YY, shown to the guest next to brand + last 4
--   orders.payment_attempts  number of definitive charge attempts (drives the idempotency key)
--   orders.payment_status    gains 'charging' (claimed by a charge run, result not yet recorded)

alter table public.guests add column if not exists stripe_livemode boolean;
alter table public.guests add column if not exists card_exp text;
alter table public.orders add column if not exists payment_attempts integer not null default 0;

alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check
  check (payment_status = any (array['none','card_on_file','charging','charged','failed','refunded','waived']));

create index if not exists orders_due_for_charge on public.orders (service_date, payment_status);
