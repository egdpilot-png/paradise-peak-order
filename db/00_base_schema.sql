-- =====================================================================
-- Pirate at Night × The Paradise Peak
-- Supabase / Postgres schema — Wave 1 (guest QR ordering + kitchen dashboard)
-- Version 1.0 · 2026 season
--
-- HOW TO USE
--   1. Open Supabase → SQL editor → paste this file → Run.
--   2. This is idempotent-ish: safe to re-run in a fresh project.
--      For an existing project, review the DROPs at the bottom first.
--   3. Sample seed data lives in section 9 — comment it out for production.
-- =====================================================================


-- =====================================================================
-- 1. EXTENSIONS
-- =====================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "citext";        -- case-insensitive email


-- =====================================================================
-- 2. ENUMS
-- =====================================================================

create type service_type as enum (
  'buffet',           -- Mon & Thu — Caribbean buffet, self-serve
  'plated',           -- Tue, Wed, Fri — 3-course fixed menu
  'weekend_special'   -- Sat & Sun — chef's weekly special
);

create type course_type as enum ('starter', 'main', 'dessert', 'side', 'amuse');

create type order_status as enum (
  'draft',      -- guest opened the page but did not submit
  'submitted',  -- guest submitted; may still edit until 10:00
  'locked',     -- 10:00 cutoff hit; sent to kitchen
  'served',     -- confirmed delivered at 22:00
  'cancelled'   -- guest cancelled (no-show, checkout, override)
);

create type entry_channel as enum (
  'guest_qr',       -- guest scanned QR and self-ordered
  'staff_tablet',   -- server took verbal order and entered it
  'whatsapp',       -- late order sent via WhatsApp
  'chef_choice'     -- past 14:00 cutoff — chef assigned
);

create type dietary_flag as enum (
  'vegetarian', 'vegan', 'gluten_free', 'dairy_free',
  'nut_allergy', 'shellfish_allergy', 'pescatarian',
  'halal', 'kosher', 'no_pork', 'no_alcohol', 'other'
);


-- =====================================================================
-- 3. CORE TABLES
-- =====================================================================

-- 3.1 Guests / rooms currently in-house
-- Populated at check-in — either via a shared Google Sheet, or from the
-- Paradise Peak PMS if/when they give us access. One row per guest,
-- linked by room. Multiple guests can share a room.
create table guests (
  id                uuid primary key default gen_random_uuid(),
  room_number       text not null,
  guest_name        text not null,
  email             citext,
  phone             text,
  check_in          date not null,
  check_out         date not null,
  dietary_flags     dietary_flag[] not null default '{}',
  allergy_notes     text,                          -- free text: "severe peanut, mild lactose"
  vip_notes         text,                          -- "anniversary night 21 Jul", "honeymoon"
  language          text not null default 'en',    -- 'en' | 'fr' — for menu rendering
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint stay_dates_valid check (check_out >= check_in)
);

create index guests_room_idx     on guests (room_number);
create index guests_stay_idx     on guests (check_in, check_out);
create index guests_current_idx  on guests (check_in, check_out)
  where check_out >= current_date;


-- 3.2 Menus — one row per service date
-- The kitchen (Eugene) publishes menus via /admin/menus.
-- Weekend specials are pushed every Monday for the upcoming Sat + Sun.
create table menus (
  id             uuid primary key default gen_random_uuid(),
  service_date   date not null unique,             -- one menu per calendar day
  service_type   service_type not null,
  title          text not null,                    -- e.g. "Menu Grand Case · Tuesday 21 July"
  title_fr       text,
  subtitle       text,                             -- e.g. "A tribute to Caribbean summer"
  subtitle_fr    text,
  cover_price    numeric(10,2),                    -- informational; not shown to guest
  is_published   boolean not null default false,
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index menus_date_idx      on menus (service_date);
create index menus_published_idx on menus (is_published, service_date)
  where is_published = true;


-- 3.3 Menu items — the dishes on each menu
create table menu_items (
  id               uuid primary key default gen_random_uuid(),
  menu_id          uuid not null references menus(id) on delete cascade,
  course           course_type not null,
  name             text not null,
  name_fr          text,
  description      text,
  description_fr   text,
  allergens        text[] not null default '{}',   -- ['gluten','shellfish','dairy']
  dietary_tags     dietary_flag[] not null default '{}',
  is_default       boolean not null default false, -- pre-selected choice; also = chef's-choice fallback
  display_order    int not null default 0,
  photo_url        text,
  created_at       timestamptz not null default now(),

  constraint one_default_per_course
    exclude using btree (menu_id with =, course with =)
    where (is_default = true)
);

create index menu_items_menu_idx      on menu_items (menu_id);
create index menu_items_menu_course   on menu_items (menu_id, course, display_order);


-- 3.4 Orders — one per guest per service date
create table orders (
  id               uuid primary key default gen_random_uuid(),
  service_date     date not null,
  menu_id          uuid not null references menus(id),
  guest_id         uuid references guests(id),      -- may be null for walk-ins
  room_number      text not null,                   -- denormalized: room may outlive guest row
  cover_count      int not null default 1 check (cover_count between 1 and 8),
  status           order_status not null default 'draft',
  entry_channel    entry_channel not null default 'guest_qr',
  notes            text,                            -- free text from guest: "no cilantro, please"
  submitted_at     timestamptz,
  locked_at        timestamptz,
  served_at        timestamptz,
  order_ref        text unique,                     -- human-friendly: "PP-2026-0721-04"
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- one active (non-cancelled) order per room per date
  constraint one_order_per_room_per_date
    unique (service_date, room_number)
);

create index orders_date_idx    on orders (service_date);
create index orders_status_idx  on orders (status, service_date);
create index orders_guest_idx   on orders (guest_id);


-- 3.5 Order items — the chosen courses for a given order
-- A "buffet" order has zero rows here — the order itself carries the cover count.
create table order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references orders(id) on delete cascade,
  menu_item_id   uuid not null references menu_items(id),
  course         course_type not null,             -- denormalized for fast course tallies
  quantity       int not null default 1 check (quantity between 1 and 8),
  guest_note     text,                             -- "medium rare", "no cilantro"
  created_at     timestamptz not null default now(),

  constraint one_choice_per_course_per_order
    unique (order_id, course)
);

create index order_items_order_idx  on order_items (order_id);
create index order_items_menu_idx   on order_items (menu_item_id);


-- 3.6 Menu publish log — audit trail for the weekly Sat/Sun push
create table menu_publish_log (
  id             uuid primary key default gen_random_uuid(),
  menu_id        uuid not null references menus(id),
  action         text not null,                    -- 'published' | 'revised' | 'unpublished'
  channel        text[] not null default '{}',     -- ['whatsapp','email','dashboard']
  recipients     text[] not null default '{}',     -- ['owner@paradisepeak.com', '+590...']
  actor          text,                             -- who did it (email or 'system')
  payload_hash   text,                             -- sha256 of the payload sent, for dispute resolution
  created_at     timestamptz not null default now()
);

create index publish_log_menu_idx on menu_publish_log (menu_id, created_at desc);


-- 3.7 Delivery log — audit trail for the daily 10:00 fire
-- One row per channel per day; makes it trivial to prove "we sent it at 10:00:03".
create table delivery_log (
  id             uuid primary key default gen_random_uuid(),
  service_date   date not null,
  channel        text not null,                    -- 'whatsapp' | 'email' | 'dashboard' | 'print'
  status         text not null,                    -- 'sent' | 'failed' | 'retried'
  recipients     text[] not null default '{}',
  cover_count    int,
  payload_hash   text,
  error_message  text,
  sent_at        timestamptz not null default now()
);

create index delivery_log_date_idx on delivery_log (service_date, channel);


-- =====================================================================
-- 4. TRIGGERS — updated_at hygiene + order_ref generation
-- =====================================================================

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger t_guests_updated_at   before update on guests
  for each row execute function set_updated_at();
create trigger t_menus_updated_at    before update on menus
  for each row execute function set_updated_at();
create trigger t_orders_updated_at   before update on orders
  for each row execute function set_updated_at();


-- Human-readable order reference: PP-YYYY-MMDD-<seq>
create or replace function assign_order_ref()
returns trigger
language plpgsql
as $$
declare
  seq int;
begin
  if new.order_ref is null then
    select coalesce(max(
      nullif(regexp_replace(order_ref, '^PP-\d{4}-\d{4}-', ''), '')::int
    ), 0) + 1
    into seq
    from orders
    where service_date = new.service_date;

    new.order_ref := 'PP-' ||
      to_char(new.service_date, 'YYYY') || '-' ||
      to_char(new.service_date, 'MMDD') || '-' ||
      lpad(seq::text, 2, '0');
  end if;
  return new;
end;
$$;

create trigger t_orders_order_ref before insert on orders
  for each row execute function assign_order_ref();


-- =====================================================================
-- 5. HELPER VIEWS — power the dashboard & the 10:00 WhatsApp message
-- =====================================================================

-- 5.1 Today's cover summary — used by the phone dashboard header
create or replace view v_covers_by_date as
select
  o.service_date,
  m.service_type,
  m.title,
  sum(o.cover_count) filter (where o.status in ('submitted','locked','served')) as covers_confirmed,
  count(*) filter (where o.status = 'draft')                                    as drafts_open,
  count(*) filter (where o.status = 'cancelled')                                as cancellations
from orders o
join menus m on m.id = o.menu_id
group by o.service_date, m.service_type, m.title;


-- 5.2 Course tallies per day — the body of the WhatsApp message
create or replace view v_course_tally as
select
  o.service_date,
  oi.course,
  mi.name,
  sum(oi.quantity) as qty
from orders o
join order_items oi on oi.order_id = o.id
join menu_items  mi on mi.id = oi.menu_item_id
where o.status in ('submitted','locked','served')
group by o.service_date, oi.course, mi.name
order by o.service_date, oi.course, qty desc;


-- 5.3 Allergy matrix per day — the "⚠️ ALLERGIES / NOTES" block
create or replace view v_allergy_matrix as
select
  o.service_date,
  o.room_number,
  g.guest_name,
  g.dietary_flags,
  g.allergy_notes,
  g.vip_notes
from orders o
left join guests g on g.id = o.guest_id
where (
  array_length(g.dietary_flags, 1) > 0
  or g.allergy_notes is not null
  or g.vip_notes    is not null
)
and o.status in ('submitted','locked','served');


-- 5.4 The Book (staff-facing per-day order sheet)
-- One row per room, columns per course. Used by /print/today.
create or replace view v_the_book as
select
  o.service_date,
  o.room_number,
  o.order_ref,
  g.guest_name,
  o.cover_count,
  max(mi.name) filter (where oi.course = 'starter') as starter,
  max(mi.name) filter (where oi.course = 'main')    as main,
  max(mi.name) filter (where oi.course = 'dessert') as dessert,
  g.dietary_flags,
  g.allergy_notes,
  o.notes,
  o.status,
  o.entry_channel
from orders o
left join guests      g  on g.id = o.guest_id
left join order_items oi on oi.order_id = o.id
left join menu_items  mi on mi.id = oi.menu_item_id
group by o.service_date, o.room_number, o.order_ref, g.guest_name,
         o.cover_count, g.dietary_flags, g.allergy_notes, o.notes,
         o.status, o.entry_channel
order by o.service_date, o.room_number;


-- 5.5 In-house guests for a given date — feeds the daily print header
create or replace function guests_in_house(on_date date)
returns setof guests
language sql stable
as $$
  select *
  from guests
  where check_in <= on_date and check_out >= on_date
  order by room_number;
$$;


-- =====================================================================
-- 6. ORDER-LOCK FUNCTION — call from the 10:00 cron
-- =====================================================================

-- Locks all submitted orders for a date, timestamps them, and returns
-- the number of orders locked. Idempotent within the day.
create or replace function lock_orders_for_date(on_date date)
returns int
language plpgsql
as $$
declare
  locked_count int;
begin
  update orders
     set status = 'locked',
         locked_at = now()
   where service_date = on_date
     and status = 'submitted';

  get diagnostics locked_count = row_count;
  return locked_count;
end;
$$;


-- =====================================================================
-- 7. ROW-LEVEL SECURITY
-- =====================================================================
-- Access model:
--   • Anon (guest QR link)  — can read the menu for their date, insert/update
--                             one order tied to their room until it's locked.
--   • authenticated (staff) — full access via server-side service role only.
--   • Public dashboard      — served via signed URLs, backed by service role.
--
-- We keep RLS strict: no anon read of guests, no anon read of other rooms'
-- orders, no anon write after lock.

alter table guests           enable row level security;
alter table menus            enable row level security;
alter table menu_items       enable row level security;
alter table orders           enable row level security;
alter table order_items      enable row level security;
alter table menu_publish_log enable row level security;
alter table delivery_log     enable row level security;

-- Menus: anon may read only published menus.
create policy menus_read_published
  on menus for select
  to anon
  using (is_published = true);

create policy menu_items_read_published
  on menu_items for select
  to anon
  using (
    exists (
      select 1 from menus m
      where m.id = menu_items.menu_id
        and m.is_published = true
    )
  );

-- Orders: anon may INSERT and UPDATE only when tied to a signed link
-- (the link carries room_number + service_date; the API enforces it).
-- We do NOT allow anon SELECT across orders — the API returns just their
-- own order object. So no anon SELECT policy on orders/order_items.

-- All writes from the app go through the service role (server-side),
-- which bypasses RLS. No anon policies needed for writes because the
-- Next.js API routes are the only entry point.

-- Guests, publish log, delivery log: no anon access at all (default deny).


-- =====================================================================
-- 8. INDEXES FOR THE DASHBOARD (query patterns you'll hit hardest)
-- =====================================================================

create index if not exists orders_service_date_status_idx
  on orders (service_date, status);

create index if not exists order_items_course_idx
  on order_items (order_id, course);


-- =====================================================================
-- 9. SEED DATA — safe to delete for production
-- =====================================================================
-- Two example menus (one plated Tuesday, one weekend special Saturday)
-- plus three sample in-house guests, so you can hit /kitchen and see
-- real numbers on first boot.

insert into guests (room_number, guest_name, email, check_in, check_out,
                    dietary_flags, allergy_notes, vip_notes, language)
values
  ('4',  'Marchetti family',   'marchetti@example.com', '2026-07-19', '2026-07-26',
   '{gluten_free}', 'child (age 6) — no spice', null, 'en'),
  ('7',  'David & Amina Roux', 'roux@example.com',      '2026-07-20', '2026-07-25',
   '{shellfish_allergy}', 'severe shellfish', 'anniversary night 21 July', 'fr'),
  ('12', 'Sofia Herrera',      'sofia@example.com',     '2026-07-18', '2026-08-01',
   '{vegan}', null, null, 'en');

insert into menus (service_date, service_type, title, title_fr, subtitle, subtitle_fr, is_published, published_at)
values
  ('2026-07-21', 'plated', 'Menu Grand Case · Tuesday',
   'Menu Grand Case · mardi',
   'A three-course tribute to French Caribbean summer',
   'Un menu trois plats en hommage à l''été antillais',
   true, now()),
  ('2026-07-25', 'weekend_special', 'Weekend Special · Saturday',
   'Menu du week-end · samedi',
   'Chef''s catch of the day, market-driven',
   'La pêche du jour du chef',
   true, now());

-- Menu items for Tuesday 21 July
with tue as (select id from menus where service_date = '2026-07-21')
insert into menu_items (menu_id, course, name, name_fr, description, description_fr, allergens, dietary_tags, is_default, display_order)
select tue.id, x.course, x.name, x.name_fr, x.description, x.description_fr, x.allergens, x.dietary_tags, x.is_default, x.display_order
from tue,
(values
  ('starter'::course_type, 'Tuna tataki',    'Tataki de thon',
   'Seared yellowfin, passion-fruit ponzu, micro-shiso',
   'Thon rouge saisi, ponzu au fruit de la passion',
   array['fish','soy'], '{}'::dietary_flag[], true, 10),
  ('starter'::course_type, 'Chilled melon gazpacho', 'Gaspacho de melon',
   'Charentais melon, basil oil, cucumber caviar',
   'Melon charentais, huile de basilic',
   array[]::text[], array['vegan','gluten_free']::dietary_flag[], false, 20),
  ('starter'::course_type, 'Burrata & heirloom tomato', 'Burrata et tomates anciennes',
   'Puglia burrata, aged balsamic pearls, black lava salt',
   'Burrata des Pouilles, perles de balsamique',
   array['dairy'], array['vegetarian']::dietary_flag[], false, 30),

  ('main'::course_type, 'Sous-vide mahi',   'Mahi-mahi sous-vide',
   'Sauce chien beurre blanc, breadfruit purée, plantain crisp',
   'Sauce chien beurre blanc, purée de fruit à pain',
   array['fish','dairy'], '{}'::dietary_flag[], true, 10),
  ('main'::course_type, 'Filet mignon',     'Filet de bœuf',
   '140g grass-fed, sauce au poivre vert, pommes grenaille',
   '140g, sauce au poivre vert, pommes grenaille',
   array['dairy'], '{}'::dietary_flag[], false, 20),
  ('main'::course_type, 'King-oyster mushroom', 'Pleurotes du panicaut',
   'Miso-glazed, quinoa-freekeh, yuzu-avocado emulsion',
   'Glacé au miso, quinoa-freekeh',
   array['soy'], array['vegan','gluten_free']::dietary_flag[], false, 30),

  ('dessert'::course_type, 'Coconut panna cotta', 'Panna cotta coco',
   'Roasted pineapple-rum, tuile of cane sugar',
   'Ananas rôti au rhum',
   array['dairy'], array['vegetarian']::dietary_flag[], true, 10),
  ('dessert'::course_type, 'Chocolate fondant',   'Fondant chocolat',
   'Madagascar vanilla crème anglaise, gold leaf',
   'Crème anglaise vanille de Madagascar',
   array['dairy','egg','gluten'], array['vegetarian']::dietary_flag[], false, 20),
  ('dessert'::course_type, 'Fresh fruit plate',   'Assiette de fruits',
   'Local seasonal fruit, lime-mint syrup',
   'Fruits locaux de saison',
   array[]::text[], array['vegan','gluten_free']::dietary_flag[], false, 30)
) as x(course, name, name_fr, description, description_fr, allergens, dietary_tags, is_default, display_order);


-- Menu items for Saturday 25 July (weekend special)
with sat as (select id from menus where service_date = '2026-07-25')
insert into menu_items (menu_id, course, name, description, allergens, dietary_tags, is_default, display_order)
select sat.id, x.course, x.name, x.description, x.allergens, x.dietary_tags, x.is_default, x.display_order
from sat,
(values
  ('starter'::course_type, 'Lobster bisque',
   'Cognac-flambéed, tarragon crème fraîche',
   array['shellfish','dairy'], '{}'::dietary_flag[], true, 10),
  ('starter'::course_type, 'Beetroot carpaccio',
   'Goat cheese mousse, candied walnut',
   array['dairy','nuts'], array['vegetarian']::dietary_flag[], false, 20),

  ('main'::course_type, 'Whole grilled snapper',
   'Market catch, creole sauce, ti-nain green banana',
   array['fish'], '{}'::dietary_flag[], true, 10),
  ('main'::course_type, 'Duck breast à l''orange',
   'Roasted rosemary jus, dauphinoise potato',
   array['dairy'], '{}'::dietary_flag[], false, 20),
  ('main'::course_type, 'Sweet-potato gnocchi',
   'Sage brown butter, toasted pecan',
   array['gluten','dairy','nuts'], array['vegetarian']::dietary_flag[], false, 30),

  ('dessert'::course_type, 'Passion-fruit soufflé',
   'Warm, house-made, served 10 minutes from oven',
   array['dairy','egg','gluten'], array['vegetarian']::dietary_flag[], true, 10),
  ('dessert'::course_type, 'Rum baba',
   'Barbancourt-soaked, chantilly',
   array['dairy','egg','gluten','alcohol'], array['vegetarian']::dietary_flag[], false, 20)
) as x(course, name, description, allergens, dietary_tags, is_default, display_order);


-- Sample orders for Tuesday 21 July so the dashboard has something to show
insert into orders (service_date, menu_id, guest_id, room_number, cover_count,
                    status, entry_channel, submitted_at)
select
  '2026-07-21',
  m.id,
  g.id,
  g.room_number,
  case g.room_number when '4' then 3 when '7' then 2 else 1 end,
  'submitted',
  'guest_qr',
  now()
from menus m, guests g
where m.service_date = '2026-07-21'
  and g.room_number in ('4','7','12');

-- Attach course choices to the sample orders
insert into order_items (order_id, menu_item_id, course, quantity)
select o.id, mi.id, mi.course, o.cover_count
from orders o
join menu_items mi on mi.menu_id = o.menu_id
where o.service_date = '2026-07-21'
  and mi.is_default = true;


-- =====================================================================
-- 10. QUICK SMOKE TEST — run these to confirm everything hangs together
-- =====================================================================
-- select * from v_covers_by_date       where service_date = '2026-07-21';
-- select * from v_course_tally         where service_date = '2026-07-21';
-- select * from v_allergy_matrix       where service_date = '2026-07-21';
-- select * from v_the_book             where service_date = '2026-07-21';
-- select * from guests_in_house('2026-07-21');
-- select lock_orders_for_date('2026-07-21');


-- =====================================================================
-- 11. TEARDOWN (for local resets — DO NOT run in production)
-- =====================================================================
-- drop view if exists v_the_book, v_allergy_matrix, v_course_tally, v_covers_by_date cascade;
-- drop function if exists guests_in_house(date), lock_orders_for_date(date), assign_order_ref(), set_updated_at() cascade;
-- drop table if exists delivery_log, menu_publish_log, order_items, orders, menu_items, menus, guests cascade;
-- drop type  if exists dietary_flag, entry_channel, order_status, course_type, service_type;
