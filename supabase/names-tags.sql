-- Sitio: first names and tagging friends in memories. Run once in Supabase → SQL Editor
-- (after tag-override.sql and friend-search.sql).
--
-- First name: saved with your account (not unique). Friends see it; search finds people by first name or username.
-- Tags: when you add a memory you can tag friends who were with you. A tagged friend sees that photo in their
-- recaps (only if they could already see it: not in Hidden from friends, and memory sharing on). They can untag
-- themselves any time.

create or replace function public.sitio_first_of(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select nullif(trim(data->'user'->>'first'), '') from sitio_data where user_id = uid;
$$;

-- Friends list now includes first names (keeps the hand-set "De los primeros" tags)
create or replace function public.sitio_my_friends() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'count', public.sitio_friend_count(auth.uid()),
    'cap', public.sitio_friend_cap(auth.uid()),
    'unlocked', public.sitio_spot_count(auth.uid()) >= 5,
    'friends', coalesce(json_agg(json_build_object(
      'id', o.id, 'name', public.sitio_name_of(o.id), 'first', public.sitio_first_of(o.id),
      'avatar', (select d.data->'user'->>'avatar' from sitio_data d where d.user_id = o.id),
      'status', f.status, 'incoming', f.status = 'pending' and f.requested_by <> auth.uid(),
      'spots', public.sitio_spot_count(o.id), 'since', coalesce(f.accepted_at, f.created_at),
      'tag', case when public.sitio_user_is_admin(o.id) then 'founder'
                  when exists (select 1 from sitio_members m where m.user_id = o.id and m.tag = 'first') then 'first'
                  when exists (select 1 from sitio_members m where m.user_id = o.id and m.tag = 'none') then null
                  when exists (select 1 from sitio_members m where m.user_id = o.id and m.invited_by is null) then 'first' end,
      'invitedBy', (select public.sitio_name_of(m.invited_by) from sitio_members m where m.user_id = o.id))
      order by f.status desc, public.sitio_name_of(o.id)), '[]'::json))
  from sitio_friends f, lateral (select case when f.a = auth.uid() then f.b else f.a end as id) o
  where (f.a = auth.uid() or f.b = auth.uid());
$$;

-- Add a friend: search by username or first name
create extension if not exists pg_trgm with schema extensions;
create or replace function public.sitio_find_users(q text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare me uuid := auth.uid(); t text := lower(trim(both '@ ' from coalesce(q, '')));
begin
  if me is null or not public.sitio_is_member() then raise exception 'Log in first'; end if;
  if length(t) < 2 then return '[]'::json; end if;
  return coalesce((select json_agg(r) from (
    select d.user_id as id, d.data->'user'->>'name' as name, nullif(trim(d.data->'user'->>'first'), '') as first, d.data->'user'->>'avatar' as avatar,
      (select f.status || case when f.status = 'pending' and f.requested_by = me then ':out' when f.status = 'pending' then ':in' else '' end
         from sitio_friends f where f.a = least(me, d.user_id) and f.b = greatest(me, d.user_id)) as rel
    from sitio_data d join sitio_members m on m.user_id = d.user_id
    where d.user_id <> me
      and not exists (select 1 from sitio_suspended s where s.user_id = d.user_id)
      and coalesce(d.data->'user'->>'name', '') <> ''
      and (lower(d.data->'user'->>'name') like '%' || t || '%' or similarity(lower(d.data->'user'->>'name'), t) > 0.3
           or lower(coalesce(d.data->'user'->>'first', '')) like t || '%')
    order by (lower(d.data->'user'->>'name') = t or lower(coalesce(d.data->'user'->>'first', '')) = t) desc,
      (lower(d.data->'user'->>'name') like t || '%' or lower(coalesce(d.data->'user'->>'first', '')) like t || '%') desc,
      similarity(lower(d.data->'user'->>'name'), t) desc
    limit 8) r), '[]'::json);
end $$;

-- Untagging yourself is kept here, so it sticks even though the photo lives in your friend's account
create table if not exists public.sitio_untags (
  owner uuid not null references auth.users(id) on delete cascade,
  mid text not null,
  uid uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner, mid, uid)
);
alter table public.sitio_untags enable row level security;  -- only through the functions below

create or replace function public.sitio_untag(owner uuid, mid text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Log in first'; end if;
  insert into sitio_untags (owner, mid, uid) values (owner, mid, auth.uid()) on conflict do nothing;
end $$;

-- For the photo's owner: who untagged themselves from which memory (so the app stops showing them)
create or replace function public.sitio_my_untags() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('mid', mid, 'uid', uid)), '[]'::json) from sitio_untags where owner = auth.uid();
$$;

-- Memories friends tagged me in, for my recaps. Only photos I'm allowed to see anyway.
create or replace function public.sitio_tagged_memories() returns json
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or not public.sitio_is_member() then raise exception 'Log in first'; end if;
  return coalesce((select json_agg(json_build_object(
      'owner', d.user_id, 'ownerName', public.sitio_name_of(d.user_id), 'ownerFirst', public.sitio_first_of(d.user_id),
      'mid', m->>'id', 'at', m->'at', 'place', p->>'name', 'area', p->>'area', 'cat', p->>'cat',
      'city', (select c->>'name' from jsonb_array_elements(case when jsonb_typeof(d.data->'cities') = 'array' then d.data->'cities' else '[]'::jsonb end) c where c->>'id' = p->>'cityId' limit 1),
      'cc', (select c->>'cc' from jsonb_array_elements(case when jsonb_typeof(d.data->'cities') = 'array' then d.data->'cities' else '[]'::jsonb end) c where c->>'id' = p->>'cityId' limit 1)))
    from sitio_friends f, lateral (select case when f.a = me then f.b else f.a end as id) o
      join sitio_data d on d.user_id = o.id,
      lateral jsonb_array_elements(case when jsonb_typeof(d.data->'places') = 'array' then d.data->'places' else '[]'::jsonb end) p,
      lateral jsonb_array_elements(case when jsonb_typeof(p->'memories') = 'array' then p->'memories' else '[]'::jsonb end) m
    where (f.a = me or f.b = me) and f.status = 'accepted'
      and jsonb_typeof(m->'with') = 'array' and m->'with' ? me::text
      and coalesce((m->>'cloud')::boolean, false) and (m->>'at') ~ '^[0-9.]+$'
      and coalesce((d.data->'settings'->>'shareMems')::boolean, true)
      and exists (select 1 from jsonb_array_elements(public.sitio_visible_places(d.user_id)) x where x->>'id' = p->>'id')
      and not exists (select 1 from sitio_untags u where u.owner = d.user_id and u.mid = m->>'id' and u.uid = me)), '[]'::json);
end $$;

revoke all on function public.sitio_first_of(uuid) from public, anon, authenticated;
revoke all on function public.sitio_my_friends(), public.sitio_find_users(text), public.sitio_untag(uuid, text), public.sitio_my_untags(), public.sitio_tagged_memories() from public, anon;
grant execute on function public.sitio_my_friends(), public.sitio_find_users(text), public.sitio_untag(uuid, text), public.sitio_my_untags(), public.sitio_tagged_memories() to authenticated;
