-- 03_function_fixes.sql — applied to production 2026-11-02
-- Fixes found during the Paradise Peak season-start demo:
--  * all functions had search_path='' with unqualified table names → "relation does not exist"
--  * publish_weekend_menus: ambiguous service_date (RETURNS TABLE vs column),
--    missing FROM in notifications insert, wrong menu_publish_log columns,
--    is_published never set (guest page filters on it)

alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.assign_order_ref() set search_path = public, pg_temp;
alter function public.guests_in_house(date) set search_path = public, pg_temp;
alter function public.lock_orders_for_date(date) set search_path = public, pg_temp;
alter function public.enforce_dashboard_allowlist() set search_path = public, auth, pg_temp;
alter function public.link_dashboard_user_to_auth() set search_path = public, auth, pg_temp;

CREATE OR REPLACE FUNCTION public.publish_weekend_menus(p_menus jsonb, p_actor text)
 RETURNS TABLE(service_date date, menu_id uuid, guests_notified integer)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
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
    update menus set status = 'superseded', is_published = false where service_date = v_date and status = 'published';

    -- Collect library ids to store on the menu (for popularity + audit)
    select array_agg((i->>'dish_library_id')::uuid)
      into v_lib_ids
      from jsonb_array_elements(m->'items') i;

    -- Upsert the menu itself
    insert into menus(
      service_date, service_type, title, title_fr, subtitle, subtitle_fr,
      status, is_published, published_at, published_by, dish_library_ids
    ) values (
      v_date,
      (m->>'service_type')::service_type,
      m->>'title',
      m->>'title_fr',
      m->>'subtitle',
      m->>'subtitle_fr',
      'published',
      true,
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
      from channels c
      returning 1
    )
    select count(*) into v_notify_ct from inserted;

    -- Flag on the menu row
    update menus set notification_sent = true where id = v_menu_id;

    -- Write publish log
    insert into menu_publish_log(menu_id, action, actor, channel, recipients, created_at)
    values (v_menu_id, 'published', p_actor, '{}', '{}', now());

    service_date := v_date;
    menu_id      := v_menu_id;
    guests_notified := v_notify_ct;
    return next;
  end loop;
end;
$function$
;
