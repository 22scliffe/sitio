-- Sitio: friends v2. Run once in Supabase → SQL Editor (after friends.sql and suspend.sql).
-- 1. Friends can see your memory photos (and their dates) at places they can already see,
--    unless you switch off "Share memories with friends". Never anything in "Hidden from friends".
-- 2. Places come with their memories newest first, so a friend's page can show the latest at the top.
-- 3. Friend limit: 25 each, no limit for admin accounts.

create or replace function public.sitio_user_is_admin(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from sitio_admins a where to_jsonb(a)::text like '%' || uid::text || '%');
$$;

create or replace function public.sitio_friend_cap(uid uuid) returns integer
language sql stable security definer set search_path = public as $$
  select case when public.sitio_user_is_admin(uid) then 100000 else 25 end;
$$;

-- What a friend may see of someone's places, now with memories (id + date) unless the owner turned sharing off
create or replace function public.sitio_visible_places(owner uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with d as (select data from sitio_data where user_id = owner),
  share as (select coalesce((select (data->'settings'->>'shareMems')::boolean from d), true) as on_),
  hidden as (select coalesce((select l->'ids' from d, jsonb_array_elements(case when jsonb_typeof(d.data->'lists') = 'array' then d.data->'lists' else '[]'::jsonb end) l where l->>'id' = 'l-hidden' limit 1), '[]'::jsonb) as ids)
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p->>'id', 'name', p->>'name', 'cat', p->>'cat', 'cats', p->'cats', 'cuisine', p->>'cuisine', 'area', p->>'area',
      'lat', p->'lat', 'lng', p->'lng', 'googleId', p->>'googleId', 'price', p->'price', 'status', p->>'status',
      'cityId', p->>'cityId', 'addedAt', p->'addedAt',
      'note', case when coalesce((p->>'notePrivate')::boolean, false) then null else p->>'note' end,
      'mem', case when jsonb_typeof(p->'memories') = 'array' then jsonb_array_length(p->'memories') else 0 end,
      'mems', case when share.on_ then mm.mems else '[]'::jsonb end,
      'lastMem', case when share.on_ then mm.last_at else null end)), '[]'::jsonb)
  from d, share, hidden, jsonb_array_elements(case when jsonb_typeof(d.data->'places') = 'array' then d.data->'places' else '[]'::jsonb end) p,
    lateral (select coalesce(jsonb_agg(jsonb_build_object('id', m->>'id', 'at', m->'at') order by (m->>'at')::numeric desc), '[]'::jsonb) as mems,
                    max((m->>'at')::numeric) as last_at
             from jsonb_array_elements(case when jsonb_typeof(p->'memories') = 'array' then p->'memories' else '[]'::jsonb end) m
             where coalesce((m->>'cloud')::boolean, false) and (m->>'at') ~ '^[0-9.]+$') mm
  where p->>'status' in ('spot', 'totry') and not (hidden.ids ? (p->>'id')) and not coalesce((p->>'sample')::boolean, false);
$$;

-- Storage rule: a friend may open a memory photo only if it belongs to a place they can see
create or replace function public.sitio_can_see_memory(path text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from sitio_data d
    where d.user_id::text = split_part(path, '/', 1)
      and d.user_id <> auth.uid()
      and public.sitio_are_friends(auth.uid(), d.user_id)
      and exists (select 1 from jsonb_array_elements(public.sitio_visible_places(d.user_id)) x, jsonb_array_elements(x->'mems') m
                  where (m->>'id') || '.jpg' = split_part(path, '/', 2)));
$$;
revoke all on function public.sitio_can_see_memory(text) from public, anon;
grant execute on function public.sitio_can_see_memory(text) to authenticated;

drop policy if exists "sitio friends read memories" on storage.objects;
create policy "sitio friends read memories" on storage.objects for select to authenticated
  using (bucket_id = 'memories' and public.sitio_can_see_memory(name));

create or replace function public.sitio_my_friends() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'count', public.sitio_friend_count(auth.uid()),
    'cap', public.sitio_friend_cap(auth.uid()),
    'unlocked', public.sitio_spot_count(auth.uid()) >= 5,
    'friends', coalesce(json_agg(json_build_object(
      'id', o.id, 'name', public.sitio_name_of(o.id),
      'avatar', (select d.data->'user'->>'avatar' from sitio_data d where d.user_id = o.id),
      'status', f.status, 'incoming', f.status = 'pending' and f.requested_by <> auth.uid(),
      'spots', public.sitio_spot_count(o.id), 'since', coalesce(f.accepted_at, f.created_at))
      order by f.status desc, public.sitio_name_of(o.id)), '[]'::json))
  from sitio_friends f, lateral (select case when f.a = auth.uid() then f.b else f.a end as id) o
  where (f.a = auth.uid() or f.b = auth.uid());
$$;

create or replace function public.sitio_friend_request(name text) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); other uuid; fr sitio_friends%rowtype;
begin
  if me is null or not public.sitio_is_member() then raise exception 'Log in first'; end if;
  select d.user_id into other from sitio_data d join sitio_members m on m.user_id = d.user_id
    where lower(d.data->'user'->>'name') = lower(trim(name)) and d.user_id <> me
      and not exists (select 1 from sitio_suspended s where s.user_id = d.user_id) limit 1;
  if other is null then raise exception 'No one on Sitio has that username'; end if;
  select * into fr from sitio_friends where a = least(me, other) and b = greatest(me, other);
  if found and fr.status = 'accepted' then return 'already'; end if;
  if public.sitio_friend_count(me) >= public.sitio_friend_cap(me) then raise exception 'You already have 25 friends, the most Sitio allows'; end if;
  if found and fr.requested_by = other then
    if public.sitio_friend_count(other) >= public.sitio_friend_cap(other) then raise exception 'They already have 25 friends'; end if;
    update sitio_friends set status = 'accepted', accepted_at = now() where a = fr.a and b = fr.b; return 'accepted';
  end if;
  if found then return 'pending'; end if;
  insert into sitio_friends (a, b, requested_by) values (least(me, other), greatest(me, other), me);
  return 'sent';
end $$;

create or replace function public.sitio_friend_inviter() returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); inv uuid;
begin
  if me is null or not public.sitio_is_member() then raise exception 'Log in first'; end if;
  select invited_by into inv from sitio_members where user_id = me;
  if inv is null then return 'none'; end if;
  if public.sitio_friend_count(me) >= public.sitio_friend_cap(me) or public.sitio_friend_count(inv) >= public.sitio_friend_cap(inv) then raise exception 'One of you already has 25 friends'; end if;
  insert into sitio_friends (a, b, requested_by, status, accepted_at) values (least(me, inv), greatest(me, inv), me, 'accepted', now())
    on conflict (a, b) do update set status = 'accepted', accepted_at = now();
  return 'accepted';
end $$;

create or replace function public.sitio_friend_respond(other uuid, accept boolean) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Log in first'; end if;
  if accept then
    if public.sitio_friend_count(me) >= public.sitio_friend_cap(me) then raise exception 'You already have 25 friends, the most Sitio allows'; end if;
    if public.sitio_friend_count(other) >= public.sitio_friend_cap(other) then raise exception 'They already have 25 friends'; end if;
    update sitio_friends set status = 'accepted', accepted_at = now()
      where a = least(me, other) and b = greatest(me, other) and status = 'pending' and requested_by = other;
    return 'accepted';
  end if;
  delete from sitio_friends where a = least(me, other) and b = greatest(me, other);
  return 'removed';
end $$;

revoke all on function public.sitio_user_is_admin(uuid), public.sitio_friend_cap(uuid), public.sitio_visible_places(uuid) from public, anon, authenticated;
revoke all on function public.sitio_my_friends(), public.sitio_friend_request(text), public.sitio_friend_inviter(), public.sitio_friend_respond(uuid, boolean) from public, anon;
grant execute on function public.sitio_my_friends(), public.sitio_friend_request(text), public.sitio_friend_inviter(), public.sitio_friend_respond(uuid, boolean) to authenticated;
