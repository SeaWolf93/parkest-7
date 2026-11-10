-- Parkest v6.0 — Web Push subscriptions and server-side search sessions.

alter table public.parking_spots add column if not exists address text;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.search_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default false,
  lat double precision,
  lng double precision,
  radius integer not null default 500 check (radius between 100 and 10000),
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
alter table public.search_sessions enable row level security;

drop policy if exists "users manage own push subscriptions" on public.push_subscriptions;
create policy "users manage own push subscriptions" on public.push_subscriptions
for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "users manage own search session" on public.search_sessions;
create policy "users manage own search session" on public.search_sessions
for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create index if not exists search_sessions_active_idx on public.search_sessions(active, updated_at desc);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

-- A push endpoint belongs to the device/browser, not permanently to one
-- Parkest account. Move it safely when another account signs in on the same
-- device; ordinary RLS correctly prevents clients doing this directly.
create or replace function public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if coalesce(p_endpoint, '') = '' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'Invalid push subscription';
  end if;

  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth, user_agent, updated_at)
  values(v_user_id, p_endpoint, p_p256dh, p_auth, p_user_agent, now());
end;
$$;

revoke all on function public.register_push_subscription(text,text,text,text) from public;
grant execute on function public.register_push_subscription(text,text,text,text) to authenticated;
