-- Parkest v6.1 — safely bind a device push endpoint to the current account.

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
