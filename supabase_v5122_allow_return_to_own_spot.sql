-- Parkest v5.12.2 one-time patch
-- The user who originally released a spot may claim it again later.

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

revoke all on function public.claim_parking_spot(uuid) from public;
grant execute on function public.claim_parking_spot(uuid) to authenticated;
