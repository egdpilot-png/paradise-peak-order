-- ============================================================================
-- Dashboard views — additive migration on top of paradise_peak_schema.sql
-- Run this once against the same Supabase project.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- v_the_book — one row per occupied room per service date
-- ----------------------------------------------------------------------------
drop view if exists v_the_book cascade;

create view v_the_book as
with rooms as (
  -- occupied rooms for every service date currently in the reservation ledger
  select
    g.id            as guest_id,
    g.room_number,
    g.guest_name,
    g.language,
    g.dietary_flags,
    g.allergy_notes,
    d::date         as service_date
  from guests g
  cross join lateral generate_series(g.check_in, g.check_out - interval '1 day', interval '1 day') as d
),
courses as (
  select
    o.id as order_id,
    jsonb_agg(
      jsonb_build_object(
        'course', mi.course,
        'dish_name', mi.name
      ) order by
        case mi.course
          when 'amuse' then 0
          when 'starter' then 1
          when 'main' then 2
          when 'side' then 3
          when 'dessert' then 4
        end
    ) as courses
  from order_items oi
  join menu_items mi on mi.id = oi.menu_item_id
  join orders o on o.id = oi.order_id
  group by o.id
)
select
  r.service_date,
  r.room_number,
  r.guest_id,
  r.guest_name,
  r.language,
  r.dietary_flags,
  r.allergy_notes,
  o.id            as order_id,
  o.order_ref,
  o.cover_count,
  o.notes,
  o.updated_at    as last_updated,
  coalesce(c.courses, '[]'::jsonb) as courses,
  case
    when o.entry_channel = 'chef_choice' then 'chefs_choice'
    when o.status in ('locked', 'served') then 'submitted'
    when o.status = 'submitted' and coalesce(jsonb_array_length(c.courses), 0) = 0 then 'buffet_confirmed'
    when o.status = 'submitted' then 'submitted'
    when o.status = 'draft' then 'pending'
    when now() > (r.service_date::timestamp + interval '14 hours' + interval '4 hours') then 'no_order' -- past 14:00 local
    when now() > (r.service_date::timestamp + interval '10 hours' + interval '4 hours') then 'late_window'
    else 'no_order'
  end as derived_status
from rooms r
left join orders o
  on o.service_date = r.service_date
  and o.room_number = r.room_number
left join courses c on c.order_id = o.id;

-- ----------------------------------------------------------------------------
-- v_course_tally — count of each dish selected per service date
-- ----------------------------------------------------------------------------
drop view if exists v_course_tally cascade;

create view v_course_tally as
select
  o.service_date,
  mi.course,
  mi.id       as menu_item_id,
  mi.name,
  mi.name_fr,
  count(*)::int                     as count,
  sum(o.cover_count)::int           as covers
from order_items oi
join orders o     on o.id = oi.order_id and o.status in ('submitted', 'locked', 'served')
join menu_items mi on mi.id = oi.menu_item_id
group by o.service_date, mi.course, mi.id, mi.name, mi.name_fr;

-- ----------------------------------------------------------------------------
-- v_allergy_matrix — one row per (guest, flag) with any conflicts flagged
-- ----------------------------------------------------------------------------
drop view if exists v_allergy_matrix cascade;

create view v_allergy_matrix as
with rooms as (
  select
    g.id            as guest_id,
    g.room_number,
    g.guest_name,
    g.dietary_flags,
    g.allergy_notes,
    d::date         as service_date
  from guests g
  cross join lateral generate_series(g.check_in, g.check_out - interval '1 day', interval '1 day') as d
),
flagged as (
  select
    r.service_date,
    r.guest_id,
    r.room_number,
    r.guest_name,
    r.allergy_notes,
    unnest(r.dietary_flags) as flag
  from rooms r
),
conflicts as (
  -- For each (guest, flag), find any ordered dish that carries the matching allergen
  select
    f.service_date,
    f.guest_id,
    f.flag,
    o.id as order_id,
    array_agg(mi.name) as conflict_dishes
  from flagged f
  join orders o
    on o.service_date = f.service_date
    and o.room_number = f.room_number
    and o.status in ('submitted', 'locked', 'served')
  join order_items oi on oi.order_id = o.id
  join menu_items mi on mi.id = oi.menu_item_id
  where mi.allergens ? (
    case f.flag
      when 'shellfish_allergy' then 'shellfish'
      when 'nut_allergy' then 'nuts'
      when 'dairy_free' then 'dairy'
      when 'gluten_free' then 'gluten'
      when 'vegan' then 'animal'
      when 'vegetarian' then 'meat'
      else f.flag::text
    end
  )
  group by f.service_date, f.guest_id, f.flag, o.id
)
select
  f.service_date,
  f.flag,
  f.guest_id,
  f.room_number,
  f.guest_name,
  f.allergy_notes,
  c.order_id,
  case when c.order_id is not null then true else false end as conflict,
  coalesce(c.conflict_dishes, '{}') as conflict_dishes
from flagged f
left join conflicts c
  on c.service_date = f.service_date
  and c.guest_id    = f.guest_id
  and c.flag        = f.flag;

-- ----------------------------------------------------------------------------
-- v_covers_by_date — simple aggregate for the dashboard header
-- ----------------------------------------------------------------------------
drop view if exists v_covers_by_date cascade;

create view v_covers_by_date as
select
  o.service_date,
  sum(o.cover_count) filter (where o.status in ('submitted', 'locked', 'served'))::int as covers,
  count(*) filter (where o.status in ('submitted', 'locked', 'served'))::int as orders_submitted,
  count(*) filter (where o.entry_channel = 'chef_choice')::int as orders_chefs_choice
from orders o
group by o.service_date;

-- ----------------------------------------------------------------------------
-- Roles table for dashboard auth
-- ----------------------------------------------------------------------------
create table if not exists dashboard_users (
  id            uuid primary key default gen_random_uuid(),
  email         citext unique not null,
  role          text not null check (role in ('property_manager', 'kitchen_ops', 'admin')),
  display_name  text,
  created_at    timestamptz default now()
);

-- Seed
insert into dashboard_users (email, role, display_name) values
  ('manager@theparadisepeak.com', 'property_manager', 'Property Manager'),
  ('eugene@pirateatnight.com',    'kitchen_ops',     'Eugene Duzant')
on conflict (email) do nothing;
