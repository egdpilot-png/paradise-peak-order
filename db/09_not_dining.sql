-- 09 — "Not dining" marker: a guest can declare that they will not dine on a
-- given night. No order, no charge; the kitchen sees "Not dining" instead of
-- "Awaiting order" and chef's choice never touches that room/night.

create table if not exists guest_night_skips (
  guest_id     uuid not null references guests(id) on delete cascade,
  service_date date not null,
  created_at   timestamptz not null default now(),
  primary key (guest_id, service_date)
);
alter table guest_night_skips enable row level security;
-- Service role only (no policies): the app writes through the signed stay token.

create or replace view v_the_book as
with rooms as (
  select g.id as guest_id, g.room_number, g.guest_name, g.language, g.dietary_flags, g.allergy_notes,
         d.d::date as service_date
    from guests g
    cross join lateral generate_series(g.check_in::timestamp, g.check_out - interval '1 day', interval '1 day') d(d)
),
per_dish as (
  select oi.order_id, mi.course, mi.name as dish_name,
         sum(oi.quantity)::int as qty,
         array_agg(oi.seat order by oi.seat) as seats,
         string_agg(nullif(oi.guest_note,''), ' / ' order by oi.seat) as notes
    from order_items oi
    join menu_items mi on mi.id = oi.menu_item_id
   group by oi.order_id, mi.course, mi.name
),
courses as (
  select order_id,
         jsonb_agg(jsonb_build_object('course', course, 'dish_name', dish_name, 'qty', qty, 'seats', seats, 'notes', notes)
                   order by case course when 'amuse' then 0 when 'starter' then 1 when 'main' then 2 when 'side' then 3 when 'dessert' then 4 end, dish_name) as courses
    from per_dish
   group by order_id
)
select r.service_date, r.room_number, r.guest_id, r.guest_name, r.language, r.dietary_flags, r.allergy_notes,
       o.id as order_id, o.order_ref, o.cover_count, o.notes, o.updated_at as last_updated,
       coalesce(c.courses, '[]'::jsonb) as courses,
       case
         when o.entry_channel = 'chef_choice' then 'chefs_choice'
         when o.status in ('locked','served') then 'submitted'
         when o.status = 'submitted' and coalesce(jsonb_array_length(c.courses),0) = 0 then 'buffet_confirmed'
         when o.status = 'submitted' then 'submitted'
         when o.status = 'draft' then 'pending'
         when s.guest_id is not null then 'not_dining'
         when now() > (r.service_date::timestamp + interval '14:00' + interval '4 hours') then 'no_order'
         when now() > (r.service_date::timestamp + interval '10:00' + interval '4 hours') then 'late_window'
         else 'no_order'
       end as derived_status
  from rooms r
  left join orders o on o.service_date = r.service_date and o.room_number = r.room_number
                    and o.status <> 'cancelled'
  left join guest_night_skips s on s.guest_id = r.guest_id and s.service_date = r.service_date
  left join courses c on c.order_id = o.id;
