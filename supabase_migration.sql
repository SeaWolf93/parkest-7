-- Parkest pre-launch migration
-- Run this once in Supabase > SQL Editor.

-- 1) Scheduled availability for orange pre-signals.
alter table public.parking_spots
  add column if not exists available_at timestamptz;

update public.parking_spots
set available_at = coalesce(available_at, created_at)
where available_at is null;

alter table public.parking_spots
  alter column available_at set default now();

-- 2) Lock down direct writes with RLS.
alter table public.parking_spots enable row level security;

drop policy if exists "demo read parking spots" on public.parking_spots;
drop policy if exists "demo insert parking spots" on public.parking_spots;
drop policy if exists "demo update parking spots" on public.parking_spots;
drop policy if exists "authenticated read parking spots" on public.parking_spots;
drop policy if exists "authenticated insert own parking spots" on public.parking_spots;
drop policy if exists "authenticated claim or manage parking spots" on public.parking_spots;

create policy "authenticated read parking spots"
on public.parking_spots
for select
to authenticated
using (true);

create policy "authenticated insert own parking spots"
on public.parking_spots
for insert
to authenticated
with check (
  released_by = auth.uid()::text
  and claimed_by is null
  and status = 'LIBERO'
);

-- No generic UPDATE policy is created. State transitions happen only through
-- the two controlled RPC functions below.

-- 3) Atomic claim: exactly one user can win VAI.
-- VAI is allowed for both immediate and scheduled LIBERO spots: it only signals intent to go there.
create or replace function public.claim_parking_spot(spot_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
  uid text := auth.uid()::text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.parking_spots
  set status = 'IN_ARRIVO', claimed_by = uid
  where id = spot_id
    and status = 'LIBERO'
    and claimed_by is null;

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

-- 4) Only the user who claimed the spot can mark arrival.
create or replace function public.occupy_parking_spot(spot_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
  uid text := auth.uid()::text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.parking_spots
  set status = 'OCCUPATO'
  where id = spot_id
    and status = 'IN_ARRIVO'
    and claimed_by = uid;

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.claim_parking_spot(uuid) from public;
revoke all on function public.occupy_parking_spot(uuid) from public;
grant execute on function public.claim_parking_spot(uuid) to authenticated;
grant execute on function public.occupy_parking_spot(uuid) to authenticated;
