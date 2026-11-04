-- Sitio: friends. Run once in Supabase → SQL Editor (after the invite scripts).
-- Mutual friendships, max 50 each. Friends see each other's Spots and To try, never anything in
-- "Hidden from friends" and never notes marked private. Memories show only as a count.
-- Friends' full maps unlock once you have 5 spots of your own; before that you get a teaser.

create table if not exists public.sitio_friends (
  a uuid not null references auth.users(id) on delete cascade,
  b uuid not null references auth.users(id) on delete cascade,
  requested_by uuid not null,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (a, b),
  check (a < b)
);
alter table public.sitio_friends enable row level security;  -- only reachable through the functions below

create or replace function public.sitio_name_of(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select d.data->'user'->>'name' from sitio_data d where d.user_id = uid;
$$;

create or replace function public.sitio_spot_count(uid uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from sitio_data d,
    jsonb_array_elements(case when jsonb_typeof(d.data->'places') = 'array' then d.data->'places' else '[]'::jsonb end) p
  where d.user_id = uid and p->>'status' = 'spot';
$$;

create or replace function public.sitio_friend_count(uid uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from sitio_friends where (a = uid or b = uid) and status = 'accepted';
$$;

create or replace function public.sitio_are_friends(x uuid, y uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from sitio_friends where a = least(x, y) and b = greatest(x, y) and status = 'accepted');
$$;

create or replace function public.sitio_my_friends() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'count', public.sitio_friend_count(auth.uid()),
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

-- Send a request by username (or accept theirs if they already asked you)
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
  if public.sitio_friend_count(me) >= 50 then raise exception 'You already have 50 friends, the most Sitio allows'; end if;
  if found and fr.requested_by = other then
    if public.sitio_friend_count(other) >= 50 then raise exception 'They already have 50 friends'; end if;
    update sitio_friends set status = 'accepted', accepted_at = now() where a = fr.a and b = fr.b; return 'accepted';
  end if;
  if found then return 'pending'; end if;
  insert into sitio_friends (a, b, requested_by) values (least(me, other), greatest(me, other), me);
  return 'sent';
end $$;

-- New members: become friends with whoever invited you (both said yes by inviting / accepting the invite)
create or replace function public.sitio_friend_inviter() returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); inv uuid;
begin
  if me is null or not public.sitio_is_member() then raise exception 'Log in first'; end if;
  select invited_by into inv from sitio_members where user_id = me;
  if inv is null then return 'none'; end if;
  if public.sitio_friend_count(me) >= 50 or public.sitio_friend_count(inv) >= 50 then raise exception 'One of you already has 50 friends'; end if;
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
    if public.sitio_friend_count(me) >= 50 then raise exception 'You already have 50 friends, the most Sitio allows'; end if;
    if public.sitio_friend_count(other) >= 50 then raise exception 'They already have 50 friends'; end if;
    update sitio_friends set status = 'accepted', accepted_at = now()
      where a = least(me, other) and b = greatest(me, other) and status = 'pending' and requested_by = other;
    return 'accepted';
  end if;
  delete from sitio_friends where a = least(me, other) and b = greatest(me, other);
  return 'removed';
end $$;

create or replace function public.sitio_friend_remove(other uuid) returns text
language sql security definer set search_path = public as $$
  delete from sitio_friends where a = least(auth.uid(), other) and b = greatest(auth.uid(), other) returning 'removed';
$$;

-- What a friend may see of someone's places (Spots and To try, minus hidden ones and private notes)
create or replace function public.sitio_visible_places(owner uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with d as (select data from sitio_data where user_id = owner),
  hidden as (select coalesce((select l->'ids' from d, jsonb_array_elements(case when jsonb_typeof(d.data->'lists') = 'array' then d.data->'lists' else '[]'::jsonb end) l where l->>'id' = 'l-hidden' limit 1), '[]'::jsonb) as ids)
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p->>'id', 'name', p->>'name', 'cat', p->>'cat', 'cats', p->'cats', 'cuisine', p->>'cuisine', 'area', p->>'area',
      'lat', p->'lat', 'lng', p->'lng', 'googleId', p->>'googleId', 'price', p->'price', 'status', p->>'status',
      'cityId', p->>'cityId', 'addedAt', p->'addedAt',
      'note', case when coalesce((p->>'notePrivate')::boolean, false) then null else p->>'note' end,
      'mem', case when jsonb_typeof(p->'memories') = 'array' then jsonb_array_length(p->'memories') else 0 end)), '[]'::jsonb)
  from d, hidden, jsonb_array_elements(case when jsonb_typeof(d.data->'places') = 'array' then d.data->'places' else '[]'::jsonb end) p
  where p->>'status' in ('spot', 'totry') and not (hidden.ids ? (p->>'id')) and not coalesce((p->>'sample')::boolean, false);
$$;

create or replace function public.sitio_friend_map(other uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); vis jsonb; cities jsonb;
begin
  if me is null or not public.sitio_is_member() then raise exception 'Log in first'; end if;
  if not public.sitio_are_friends(me, other) then raise exception 'You’re not friends'; end if;
  vis := public.sitio_visible_places(other);
  select coalesce(d.data->'cities', '[]'::jsonb) into cities from sitio_data d where d.user_id = other;
  if public.sitio_spot_count(me) < 5 then
    return json_build_object('locked', true, 'name', public.sitio_name_of(other),
      'spots', (select count(*) from jsonb_array_elements(vis) x where x->>'status' = 'spot'),
      'places', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select x from jsonb_array_elements(vis) x where x->>'status' = 'spot' limit 3) s),
      'cities', cities);
  end if;
  return json_build_object('locked', false, 'name', public.sitio_name_of(other), 'places', vis, 'cities', cities);
end $$;

-- All friends' Spots for the map layer (only once you have 5 spots)
create or replace function public.sitio_friends_spots() returns json
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or not public.sitio_is_member() then raise exception 'Log in first'; end if;
  if public.sitio_spot_count(me) < 5 then return json_build_object('locked', true, 'places', '[]'::json); end if;
  return json_build_object('locked', false, 'places', coalesce((
    select json_agg(x || jsonb_build_object('owner', o.id, 'ownerName', public.sitio_name_of(o.id),
      'city', (select c from sitio_data d, jsonb_array_elements(coalesce(d.data->'cities', '[]'::jsonb)) c where d.user_id = o.id and c->>'id' = x->>'cityId' limit 1)))
    from sitio_friends f, lateral (select case when f.a = me then f.b else f.a end as id) o,
      lateral jsonb_array_elements(public.sitio_visible_places(o.id)) x
    where (f.a = me or f.b = me) and f.status = 'accepted' and x->>'status' = 'spot'), '[]'::json));
end $$;

revoke all on function public.sitio_name_of(uuid), public.sitio_spot_count(uuid), public.sitio_friend_count(uuid), public.sitio_are_friends(uuid, uuid), public.sitio_visible_places(uuid) from public, anon, authenticated;
revoke all on function public.sitio_my_friends(), public.sitio_friend_request(text), public.sitio_friend_inviter(), public.sitio_friend_respond(uuid, boolean), public.sitio_friend_remove(uuid), public.sitio_friend_map(uuid), public.sitio_friends_spots() from public, anon;
grant execute on function public.sitio_my_friends(), public.sitio_friend_request(text), public.sitio_friend_inviter(), public.sitio_friend_respond(uuid, boolean), public.sitio_friend_remove(uuid), public.sitio_friend_map(uuid), public.sitio_friends_spots() to authenticated;
