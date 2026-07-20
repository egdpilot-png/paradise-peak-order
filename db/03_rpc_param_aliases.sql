-- =====================================================================
-- 03_rpc_param_aliases.sql
--
-- Rename the RPC parameter names from `on_date` → `d` so PostgREST's
-- named-argument binding matches what the TypeScript code sends:
--   sb.rpc('guests_in_house',       { d: date })
--   sb.rpc('lock_orders_for_date',  { d: date })
--
-- Postgres won't rename input parameters via CREATE OR REPLACE, so we
-- DROP the existing functions first, then recreate with the new name.
-- Safe to re-run.
-- =====================================================================

-- 1. guests_in_house(d date)
drop function if exists guests_in_house(date);

create function guests_in_house(d date)
returns setof guests
language sql
stable
as $$
  select *
  from guests
  where check_in <= d and check_out >= d
  order by room_number;
$$;

-- 2. lock_orders_for_date(d date)
drop function if exists lock_orders_for_date(date);

create function lock_orders_for_date(d date)
returns int
language plpgsql
as $$
declare
  locked_count int;
begin
  update orders
     set status = 'locked',
         locked_at = now()
   where service_date = d
     and status = 'submitted';

  get diagnostics locked_count = row_count;
  return locked_count;
end;
$$;

-- End of 03_rpc_param_aliases.sql
