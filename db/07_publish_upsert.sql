-- 07_publish_upsert.sql — one menu row per service night, publish = upsert in place.
-- Orders reference menu_items, so items removed from a republished menu are
-- deactivated rather than deleted. Drafts live in their own table.

alter table menu_items add column if not exists is_active boolean not null default true;
create unique index if not exists menu_items_menu_dish_uidx
  on menu_items (menu_id, dish_library_id) where dish_library_id is not null;

create table if not exists menu_drafts (
  service_date date primary key,
  payload      jsonb not null,
  actor        text,
  updated_at   timestamptz not null default now()
);
alter table menu_drafts enable row level security;

create or replace function public.publish_weekend_menus(p_menus jsonb, p_actor text)
returns table(service_date date, menu_id uuid, guests_notified int)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
#variable_conflict use_column
declare
  m           jsonb;
  it          jsonb;
  v_date      date;
  v_menu_id   uuid;
  v_lib_ids   uuid[];
  v_notify_ct int;
begin
  for m in select * from jsonb_array_elements(p_menus) loop
    v_date := (m->>'service_date')::date;

    select array_agg((i->>'dish_library_id')::uuid)
      into v_lib_ids
      from jsonb_array_elements(m->'items') i;

    insert into menus(
      service_date, service_type, title, title_fr, subtitle, subtitle_fr,
      status, is_published, published_at, published_by, dish_library_ids, cover_price_cents
    ) values (
      v_date, (m->>'service_type')::service_type, m->>'title', m->>'title_fr', m->>'subtitle', m->>'subtitle_fr',
      'published', true, now(), p_actor, coalesce(v_lib_ids, '{}'), nullif(m->>'cover_price_cents','')::int
    )
    on conflict (service_date) do update set
      service_type      = excluded.service_type,
      title             = excluded.title,
      title_fr          = excluded.title_fr,
      subtitle          = excluded.subtitle,
      subtitle_fr       = excluded.subtitle_fr,
      status            = 'published',
      is_published      = true,
      published_at      = now(),
      published_by      = excluded.published_by,
      dish_library_ids  = excluded.dish_library_ids,
      cover_price_cents = excluded.cover_price_cents,
      updated_at        = now()
    returning id into v_menu_id;

    -- Items no longer on the menu: hide, keep for existing orders
    update menu_items
       set is_active = false
     where menu_id = v_menu_id
       and (dish_library_id is null or not (dish_library_id = any(coalesce(v_lib_ids, '{}'))));

    -- Upsert items from the dish library snapshot
    for it in select * from jsonb_array_elements(m->'items') loop
      insert into menu_items(
        menu_id, dish_library_id, course, name, name_fr, description, description_fr,
        allergens, sort_order, display_order, price_cents, dietary_tags, is_active
      )
      select v_menu_id, dl.id, dl.course, dl.name, dl.name_fr, dl.description, dl.description_fr,
             dl.allergens, coalesce((it->>'sort_order')::int, 0), coalesce((it->>'sort_order')::int, 0),
             dl.price_cents, coalesce(dl.dietary_ok, '{}'), true
        from dish_library dl
       where dl.id = (it->>'dish_library_id')::uuid
      on conflict (menu_id, dish_library_id) where dish_library_id is not null do update set
        course = excluded.course, name = excluded.name, name_fr = excluded.name_fr,
        description = excluded.description, description_fr = excluded.description_fr,
        allergens = excluded.allergens, sort_order = excluded.sort_order, display_order = excluded.display_order,
        price_cents = excluded.price_cents, dietary_tags = excluded.dietary_tags, is_active = true;
    end loop;

    update dish_library
       set times_served = times_served + 1, last_served_on = v_date, updated_at = now()
     where id = any(coalesce(v_lib_ids, '{}'));

    -- Queue guest notifications (one row per in-house guest × channel), skip duplicates
    with in_house as (
      select id, guest_name, email, phone, whatsapp_number, language, notify_preferences
        from guests
       where check_in <= v_date and check_out > v_date
    ),
    channels as (
      select ih.id as guest_id, c as channel, ih.language, ih.guest_name, ih.email, ih.phone, ih.whatsapp_number
        from in_house ih, lateral unnest(coalesce(ih.notify_preferences, array['email'])) as c
       where c in ('email','sms','whatsapp')
    ),
    inserted as (
      insert into guest_notifications(guest_id, service_date, menu_id, channel, payload)
      select c.guest_id, v_date, v_menu_id, c.channel,
             jsonb_build_object(
               'guest_name', c.guest_name, 'email', c.email, 'phone', c.phone, 'whatsapp', c.whatsapp_number,
               'language', c.language,
               'menu_title', m->>(case when c.language = 'fr' then 'title_fr' else 'title' end),
               'service_date', v_date)
        from channels c
       where not exists (
         select 1 from guest_notifications gn
          where gn.guest_id = c.guest_id and gn.service_date = v_date and gn.channel = c.channel and gn.status = 'pending')
      returning 1
    )
    select count(*) into v_notify_ct from inserted;

    insert into menu_publish_log(menu_id, action, actor, channel, recipients, created_at)
    values (v_menu_id, 'published', p_actor, '{}', '{}', now());

    delete from menu_drafts where service_date = v_date;

    service_date := v_date;
    menu_id := v_menu_id;
    guests_notified := coalesce(v_notify_ct, 0);
    return next;
  end loop;
end;
$function$;
