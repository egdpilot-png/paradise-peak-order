-- 05_bookable_service.sql — Season 2026/27 service redesign (agreed 2 Nov 2026)
--
--  * Weekly rhythm: Mon & Fri buffet (€55 pp), Tue/Wed/Thu/Sat plated fixed
--    menu priced per dish, Sunday closed.
--  * Guests self-register (property QR or link in booking email) and book
--    any night of their stay, before or during the stay.
--  * Card saved at booking (Stripe), charged at the 10:00 cutoff.
--  * Minimum 4 covers across the property for on-site plated service;
--    below that the dinner is delivered and served by Paradise Peak staff.
--
-- All statements are additive and idempotent.

-- ---------- Prices ----------
alter table dish_library add column if not exists price_cents int check (price_cents is null or price_cents >= 0);
alter table menu_items   add column if not exists price_cents int check (price_cents is null or price_cents >= 0);
alter table menus        add column if not exists cover_price_cents int check (cover_price_cents is null or cover_price_cents >= 0);
comment on column menus.cover_price_cents is 'Flat price per adult for buffet nights (e.g. 5500). Null on plated nights, where the bill is the sum of menu_items.price_cents.';

-- ---------- Guests: self-registration + payment method ----------
alter table guests add column if not exists booking_ref               text;
alter table guests add column if not exists whatsapp_number           text;
alter table guests add column if not exists source                    text not null default 'kitchen'
  check (source in ('kitchen','qr','email_link'));
alter table guests add column if not exists stripe_customer_id        text;
alter table guests add column if not exists stripe_payment_method_id  text;
alter table guests add column if not exists card_brand                text;
alter table guests add column if not exists card_last4                text;
alter table guests add column if not exists terms_accepted_at         timestamptz;
alter table guests add column if not exists terms_version             text;
create index if not exists guests_email_idx on guests (email);
create index if not exists guests_stay_idx  on guests (check_in, check_out);

-- ---------- Orders: money + service format ----------
alter table orders add column if not exists total_cents              int;
alter table orders add column if not exists payment_status           text not null default 'none'
  check (payment_status in ('none','card_on_file','charged','failed','refunded','waived'));
alter table orders add column if not exists stripe_payment_intent_id text;
alter table orders add column if not exists charged_at               timestamptz;
alter table orders add column if not exists payment_error            text;
alter table orders add column if not exists cancelled_at             timestamptz;
create index if not exists orders_guest_date_idx on orders (guest_id, service_date);

-- ---------- Nightly service decision ----------
create table if not exists service_nights (
  service_date      date primary key,
  total_covers      int not null default 0,
  service_format    text check (service_format in ('onsite','delivered','closed')),
  decided_at        timestamptz,
  locked_at         timestamptz,
  charged_at        timestamptz,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table service_nights is 'One row per service night. Filled by the 10:00 cutoff job: counts covers, decides on-site vs delivered (min 4), triggers charges.';

drop trigger if exists service_nights_updated_at on service_nights;
create trigger service_nights_updated_at before update on service_nights
  for each row execute function public.set_updated_at();

alter table service_nights enable row level security;
-- service role bypasses RLS; no anon policies on purpose.

-- ---------- Covers view used by dashboard ----------
create or replace view v_covers_by_date as
select o.service_date,
       m.service_type,
       m.title,
       count(*) filter (where o.status in ('submitted','locked','served'))             as orders,
       coalesce(sum(o.cover_count) filter (where o.status in ('submitted','locked','served')), 0) as covers,
       coalesce(sum(o.total_cents) filter (where o.status in ('submitted','locked','served')), 0) as total_cents
from orders o
join menus m on m.id = o.menu_id
group by o.service_date, m.service_type, m.title;

-- dish prices are maintained in euros by the kitchen; cents derived for billing
alter table dish_library drop column if exists price_cents;
alter table dish_library add column price_cents int generated always as (case when price_eur is null then null else round(price_eur*100)::int end) stored;
