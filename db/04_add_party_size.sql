-- =====================================================================
-- 04_add_party_size.sql — add party_size to guests
-- =====================================================================
-- Run this in the Supabase SQL Editor once. Safe to re-run (idempotent
-- via `if not exists`).
--
-- Why: the dashboard code (lib/dashboard.ts) and the QR issuer read
-- g.party_size to compute expected covers per room and default chef's
-- choice covers. Adding the column matches what the code already
-- expects (it falls back to 1 if missing, but the QR insert path needs
-- the column to actually exist in the schema cache).
-- =====================================================================

alter table guests
  add column if not exists party_size int not null default 1;

-- Optional sanity constraint — a party is 1..20 people.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'guests_party_size_range'
  ) then
    alter table guests
      add constraint guests_party_size_range
      check (party_size between 1 and 20);
  end if;
end $$;

-- Reload PostgREST schema cache so the new column is visible to the API.
notify pgrst, 'reload schema';
