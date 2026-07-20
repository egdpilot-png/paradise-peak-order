-- =====================================================================
-- 03_rpc_param_aliases.sql
-- Add parameter-name aliases so the app's TypeScript calls (which pass
-- {d: date}) match PostgREST's named-parameter binding.
--
-- The base functions in 00_base_schema.sql use `on_date` as their param
-- name; PostgREST requires the JSON key in an RPC call to match the
-- parameter name exactly. These wrapper functions accept `d` and simply
-- delegate to the originals.
--
-- Idempotent — safe to re-run.
-- =====================================================================

-- 1. guests_in_house(d date) → same result as guests_in_house(on_date date)
create or replace function guests_in_house(d date)
returns setof guests
language sql
stable
as $$
  select *
  from guests
  where check_in <= d and check_out >= d
  order by room_number;
$$;

-- 2. lock_orders_for_date(d date) → same result as lock_orders_for_date(on_date date)
create or replace function lock_orders_for_date(d date)
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
