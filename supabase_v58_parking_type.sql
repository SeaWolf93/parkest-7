-- Parkest v5.8 — tipologia parcheggio
alter table public.parking_spots
  add column if not exists parking_type text;

update public.parking_spots
set parking_type = 'LIBERO'
where parking_type is null;

alter table public.parking_spots
  alter column parking_type set default 'LIBERO';

alter table public.parking_spots
  alter column parking_type set not null;

alter table public.parking_spots
  drop constraint if exists parking_spots_parking_type_check;

alter table public.parking_spots
  add constraint parking_spots_parking_type_check
  check (parking_type in ('LIBERO','DISCO_ORARIO','A_PAGAMENTO','DISABILI'));
