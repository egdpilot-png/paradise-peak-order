-- ============================================================================
-- Publisher migration — additive on top of paradise_peak_schema.sql and
-- dashboard_views.sql. Adds the dish library, menu draft/publish state,
-- and the guest notification queue.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Dish library — reusable master list of every dish the kitchen can serve
-- ----------------------------------------------------------------------------
create table if not exists dish_library (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  name_fr        text,
  description    text,
  description_fr text,
  course         course_type not null,
  tags           text[] default '{}',      -- e.g. {'caribbean','signature','summer'}
  allergens      text[] default '{}',       -- e.g. {'fish','soy'} (matches menu_items.allergens)
  dietary_ok     dietary_flag[] default '{}',-- flags this dish is safe for
  cost_est_eur   numeric(6,2),              -- ingredient cost estimate
  price_eur      numeric(6,2),              -- menu price if à la carte
  photo_url      text,
  active         boolean not null default true,
  times_served   int not null default 0,    -- popularity counter (updated on publish)
  last_served_on date,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create index if not exists dish_library_course_idx on dish_library(course) where active;
create index if not exists dish_library_tags_idx   on dish_library using gin(tags);

-- Backfill from any existing menu_items so the library isn't empty
insert into dish_library (name, name_fr, description, description_fr, course, allergens)
select distinct on (name, course)
  name, name_fr, description, description_fr, course, coalesce(allergens, '{}')
from menu_items
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 2. Menu status: draft / published / superseded
-- ----------------------------------------------------------------------------
do $$ begin
  create type menu_status as enum ('draft', 'published', 'superseded');
exception when duplicate_object then null; end $$;

alter table menus add column if not exists status         menu_status not null default 'draft';
alter table menus add column if not exists published_at   timestamptz;
alter table menus add column if not exists published_by   text;
alter table menus add column if not exists notification_sent boolean not null default false;
alter table menus add column if not exists dish_library_ids uuid[] default '{}';

alter table menu_items add column if not exists dish_library_id uuid references dish_library(id);
alter table menu_items add column if not exists sort_order int not null default 0;

-- ----------------------------------------------------------------------------
-- 3. Guest notification queue — populated on publish, worker sends async
-- ----------------------------------------------------------------------------
create table if not exists guest_notifications (
  id             uuid primary key default gen_random_uuid(),
  guest_id       uuid not null references guests(id) on delete cascade,
  service_date   date not null,
  menu_id        uuid not null references menus(id),
  channel        text not null check (channel in ('email','sms','whatsapp')),
  status         text not null default 'queued'
                  check (status in ('queued','sending','sent','failed')),
  payload        jsonb,
  external_id    text,
  error          text,
  scheduled_for  timestamptz default now(),
  sent_at        timestamptz,
  created_at     timestamptz default now()
);

create index if not exists guest_notifications_pending_idx
  on guest_notifications(status, scheduled_for) where status in ('queued','sending');

-- ----------------------------------------------------------------------------
-- 4. RPC — publish_weekend_menu(sat_date, menus_json)
--    Publishes one or more service dates atomically and queues notifications.
--    menus_json is [{service_date, service_type, title, title_fr, subtitle,
--    subtitle_fr, items:[{dish_library_id, sort_order}]}, ...]
-- ----------------------------------------------------------------------------
create or replace function publish_weekend_menus(
  p_menus jsonb,
  p_actor text
) returns table(service_date date, menu_id uuid, guests_notified int)
language plpgsql
as $$
declare
  m           jsonb;
  v_menu_id   uuid;
  v_date      date;
  it          jsonb;
  v_notify_ct int;
  v_lib_ids   uuid[];
begin
  for m in select * from jsonb_array_elements(p_menus)
  loop
    v_date := (m->>'service_date')::date;

    -- Supersede any published menu for this date
    update menus set status = 'superseded' where service_date = v_date and status = 'published';

    -- Collect library ids to store on the menu (for popularity + audit)
    select array_agg((i->>'dish_library_id')::uuid)
      into v_lib_ids
      from jsonb_array_elements(m->'items') i;

    -- Upsert the menu itself
    insert into menus(
      service_date, service_type, title, title_fr, subtitle, subtitle_fr,
      status, published_at, published_by, dish_library_ids
    ) values (
      v_date,
      (m->>'service_type')::service_type,
      m->>'title',
      m->>'title_fr',
      m->>'subtitle',
      m->>'subtitle_fr',
      'published',
      now(),
      p_actor,
      coalesce(v_lib_ids, '{}')
    )
    returning id into v_menu_id;

    -- Rebuild items from the dish library snapshot
    for it in select * from jsonb_array_elements(m->'items')
    loop
      insert into menu_items(
        menu_id, dish_library_id, course, name, name_fr,
        description, description_fr, allergens, sort_order
      )
      select
        v_menu_id, dl.id, dl.course, dl.name, dl.name_fr,
        dl.description, dl.description_fr, dl.allergens,
        coalesce((it->>'sort_order')::int, 0)
      from dish_library dl
      where dl.id = (it->>'dish_library_id')::uuid;
    end loop;

    -- Popularity counters
    update dish_library
       set times_served  = times_served + 1,
           last_served_on = v_date,
           updated_at    = now()
     where id = any(v_lib_ids);

    -- Queue guest notifications (one row per guest × channel)
    with in_house as (
      select id, guest_name, email, phone, whatsapp_number, language, notify_preferences
      from guests
      where check_in <= v_date and check_out > v_date
    ),
    channels as (
      select ih.id as guest_id,
             c as channel,
             ih.language,
             ih.guest_name,
             ih.email, ih.phone, ih.whatsapp_number
      from in_house ih,
           lateral unnest(coalesce(ih.notify_preferences, array['email'])) as c
      where c in ('email','sms','whatsapp')
    ),
    inserted as (
      insert into guest_notifications(guest_id, service_date, menu_id, channel, payload)
      select
        c.guest_id, v_date, v_menu_id, c.channel,
        jsonb_build_object(
          'guest_name', c.guest_name,
          'email',      c.email,
          'phone',      c.phone,
          'whatsapp',   c.whatsapp_number,
          'language',   c.language,
          'menu_title', m->>(case when c.language = 'fr' then 'title_fr' else 'title' end),
          'service_date', v_date
        )
      returning 1
    )
    select count(*) into v_notify_ct from inserted;

    -- Flag on the menu row
    update menus set notification_sent = true where id = v_menu_id;

    -- Write publish log
    insert into menu_publish_log(service_date, menu_id, published_by, created_at)
    values (v_date, v_menu_id, p_actor, now())
    on conflict do nothing;

    service_date := v_date;
    menu_id      := v_menu_id;
    guests_notified := v_notify_ct;
    return next;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Notify prefs on guests table
-- ----------------------------------------------------------------------------
alter table guests add column if not exists notify_preferences text[] default '{email}';
alter table guests add column if not exists whatsapp_number text;
