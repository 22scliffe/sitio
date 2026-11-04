-- Sitio: shared lists and group lists. Run once in Supabase → SQL Editor (after send-spots.sql).
--
-- Private list: only you see the list (the places in it still show on your map for friends, as before).
-- Shared list: your friends see the list on your profile, with only the places they can already see.
-- Group list: you and up to 9 friends add places to one list together. Each place says who added it.
--
-- A group place is a copy of the basics only: name, category, area, location, Google ID, price, city
-- and the note (never a private note). Photos and memories are never copied.
-- Group notifications only go to people who switched "Group lists" on (off by default).

create extension if not exists pg_net;

create table if not exists public.sitio_groups (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  emoji text not null default '👥',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.sitio_group_members (
  group_id uuid not null references public.sitio_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create table if not exists public.sitio_group_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.sitio_groups(id) on delete cascade,
  added_by uuid not null references auth.users(id) on delete cascade,
  place jsonb not null,
  created_at timestamptz not null default now()
);
-- Only reachable through the functions below
alter table public.sitio_groups enable row level security;
alter table public.sitio_group_members enable row level security;
alter table public.sitio_group_items enable row level security;
create index if not exists sitio_group_members_user on public.sitio_group_members (user_id);
create index if not exists sitio_group_items_group on public.sitio_group_items (group_id, created_at);

create or replace function public.sitio_in_group(g uuid, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from sitio_group_members where group_id = g and user_id = u);
$$;

-- Keep only the basics of a place
create or replace function public.sitio_group_clean(p jsonb) returns jsonb
language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'name', left(trim(p->>'name'), 80), 'cat', left(p->>'cat', 20),
    'cats', case when jsonb_typeof(p->'cats') = 'array' then p->'cats' else null end,
    'cuisine', left(p->>'cuisine', 80), 'area', left(p->>'area', 80),
    'lat', case when jsonb_typeof(p->'lat') = 'number' then p->'lat' else null end,
    'lng', case when jsonb_typeof(p->'lng') = 'number' then p->'lng' else null end,
    'googleId', left(p->>'googleId', 200),
    'price', case when jsonb_typeof(p->'price') = 'number' then p->'price' else null end,
    'cityName', left(p->>'cityName', 80), 'currency', left(p->>'currency', 4),
    'note', left(p->>'note', 500), 'srcId', left(p->>'srcId', 60)));
$$;

-- All my group lists, with members and places
create or replace function public.sitio_my_groups() returns json
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or not public.sitio_is_member() then raise exception 'Log in first'; end if;
  return coalesce((select json_agg(json_build_object(
      'id', g.id, 'name', g.name, 'emoji', g.emoji, 'owner', g.owner, 'updatedAt', extract(epoch from g.updated_at) * 1000,
      'members', (select json_agg(json_build_object('id', m.user_id, 'name', public.sitio_name_of(m.user_id),
                    'avatar', (select d.data->'user'->>'avatar' from sitio_data d where d.user_id = m.user_id)) order by m.joined_at)
                  from sitio_group_members m where m.group_id = g.id),
      'items', coalesce((select json_agg(json_build_object('id', i.id, 'by', i.added_by, 'byName', public.sitio_name_of(i.added_by),
                    'at', extract(epoch from i.created_at) * 1000, 'p', i.place) order by i.created_at desc)
                  from sitio_group_items i where i.group_id = g.id), '[]'::json)) order by g.updated_at desc)
    from sitio_groups g where public.sitio_in_group(g.id, me)), '[]'::json);
end $$;

create or replace function public.sitio_group_create(gname text, gemoji text, members uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g uuid; u uuid;
begin
  if me is null or not public.sitio_is_member() then raise exception 'Log in first'; end if;
  if coalesce(trim(gname), '') = '' then raise exception 'Give the list a name'; end if;
  if (select count(*) from sitio_group_members where user_id = me) >= 30 then raise exception 'You’re in 30 group lists already. Leave one first'; end if;
  if coalesce(array_length(members, 1), 0) > 9 then raise exception 'A group list can have up to 10 people'; end if;
  insert into sitio_groups (owner, name, emoji) values (me, left(trim(gname), 40), coalesce(nullif(left(gemoji, 8), ''), '👥')) returning id into g;
  insert into sitio_group_members (group_id, user_id, added_by) values (g, me, me);
  foreach u in array coalesce(members, '{}') loop
    if u <> me and public.sitio_are_friends(me, u) then
      insert into sitio_group_members (group_id, user_id, added_by) values (g, u, me) on conflict do nothing;
    end if;
  end loop;
  return g;
end $$;

create or replace function public.sitio_group_invite(g uuid, members uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); u uuid; n int := 0;
begin
  if me is null or not public.sitio_is_member() then raise exception 'Log in first'; end if;
  if not public.sitio_in_group(g, me) then raise exception 'You’re not in this list'; end if;
  foreach u in array coalesce(members, '{}') loop
    if (select count(*) from sitio_group_members where group_id = g) >= 10 then raise exception 'A group list can have up to 10 people'; end if;
    if u <> me and public.sitio_are_friends(me, u) and not public.sitio_in_group(g, u) then
      insert into sitio_group_members (group_id, user_id, added_by) values (g, u, me); n := n + 1;
    end if;
  end loop;
  update sitio_groups set updated_at = now() where id = g;
  return n;
end $$;

create or replace function public.sitio_group_add(g uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c jsonb := public.sitio_group_clean(p); r uuid;
begin
  if me is null or not public.sitio_is_member() then raise exception 'Log in first'; end if;
  if not public.sitio_in_group(g, me) then raise exception 'You’re not in this list'; end if;
  if coalesce(c->>'name', '') = '' then raise exception 'That spot has no name'; end if;
  if (select count(*) from sitio_group_items where group_id = g) >= 300 then raise exception 'This list is full (300 places)'; end if;
  select id into r from sitio_group_items where group_id = g and (
    (c->>'googleId' is not null and place->>'googleId' = c->>'googleId') or
    (place->>'name' = c->>'name' and abs(coalesce((place->>'lat')::numeric, 0) - coalesce((c->>'lat')::numeric, 0)) < 0.0005)) limit 1;
  if r is not null then return r; end if;
  insert into sitio_group_items (group_id, added_by, place) values (g, me, c) returning id into r;
  update sitio_groups set updated_at = now() where id = g;
  return r;
end $$;

-- Whoever added a place, or the list's owner, can take it out
create or replace function public.sitio_group_remove_item(item uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Log in first'; end if;
  delete from sitio_group_items i using sitio_groups g
    where i.id = item and g.id = i.group_id and (i.added_by = me or g.owner = me);
end $$;

-- Leaving takes your places with you. If the owner leaves, the longest-standing member takes over.
create or replace function public.sitio_group_leave(g uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); nxt uuid;
begin
  if me is null then raise exception 'Log in first'; end if;
  delete from sitio_group_items where group_id = g and added_by = me;
  delete from sitio_group_members where group_id = g and user_id = me;
  select user_id into nxt from sitio_group_members where group_id = g order by joined_at limit 1;
  if nxt is null then delete from sitio_groups where id = g;
  else update sitio_groups set owner = nxt, updated_at = now() where id = g and owner = me; end if;
end $$;

create or replace function public.sitio_group_update(g uuid, gname text, gemoji text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(gname), '') = '' then raise exception 'Give the list a name'; end if;
  update sitio_groups set name = left(trim(gname), 40), emoji = coalesce(nullif(left(gemoji, 8), ''), '👥'), updated_at = now()
    where id = g and owner = auth.uid();
  if not found then raise exception 'Only the person who made the list can rename it'; end if;
end $$;

create or replace function public.sitio_group_delete(g uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from sitio_groups where id = g and owner = auth.uid();
  if not found then raise exception 'Only the person who made the list can delete it'; end if;
end $$;

-- Owner can take someone out of the list (their places go with them)
create or replace function public.sitio_group_kick(g uuid, who uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from sitio_groups where id = g and owner = auth.uid()) or who = auth.uid() then raise exception 'Only the person who made the list can do that'; end if;
  delete from sitio_group_items where group_id = g and added_by = who;
  delete from sitio_group_members where group_id = g and user_id = who;
end $$;

-- A friend's profile also shows their Shared lists (only with places you can already see)
create or replace function public.sitio_friend_map(other uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); vis jsonb; cities jsonb; lists jsonb;
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
  select coalesce(jsonb_agg(jsonb_build_object('id', l->>'id', 'name', l->>'name', 'emoji', l->>'emoji', 'ids', ids.v)), '[]'::jsonb) into lists
    from sitio_data d, jsonb_array_elements(case when jsonb_typeof(d.data->'lists') = 'array' then d.data->'lists' else '[]'::jsonb end) l,
      lateral (select coalesce(jsonb_agg(i), '[]'::jsonb) v from jsonb_array_elements_text(case when jsonb_typeof(l->'ids') = 'array' then l->'ids' else '[]'::jsonb end) i
               where exists (select 1 from jsonb_array_elements(vis) x where x->>'id' = i)) ids
    where d.user_id = other and coalesce((l->>'share')::boolean, false) and l->>'id' <> 'l-hidden' and jsonb_array_length(ids.v) > 0;
  return json_build_object('locked', false, 'name', public.sitio_name_of(other), 'places', vis, 'cities', cities, 'lists', lists);
end $$;

-- Notifications (only for people who turned on "Group lists")
create or replace function public.sitio_group_notify_push(target uuid, msg text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://bkucombtgrvoesviyxct.supabase.co/functions/v1/sitio-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'PASTE-CRON-SECRET-HERE'),
    body := jsonb_build_object('friend', jsonb_build_object('to', target, 'body', msg, 'kind', 'lists', 'url', './#lists')));
end $$;

create or replace function public.sitio_group_member_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.added_by is not null and new.added_by <> new.user_id then
    perform public.sitio_group_notify_push(new.user_id, coalesce(public.sitio_name_of(new.added_by), 'A friend') || ' added you to the group list ' ||
      (select emoji || ' ' || name from sitio_groups where id = new.group_id));
  end if;
  return new;
end $$;
drop trigger if exists sitio_group_member_notify on public.sitio_group_members;
create trigger sitio_group_member_notify after insert on public.sitio_group_members
  for each row execute function public.sitio_group_member_notify();

-- One notification per person per list every 15 minutes, so adding ten places doesn't send ten
create or replace function public.sitio_group_item_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare m record; lname text;
begin
  if exists (select 1 from sitio_group_items where group_id = new.group_id and added_by = new.added_by and id <> new.id
             and created_at > now() - interval '15 minutes') then return new; end if;
  select emoji || ' ' || name into lname from sitio_groups where id = new.group_id;
  for m in select user_id from sitio_group_members where group_id = new.group_id and user_id <> new.added_by loop
    perform public.sitio_group_notify_push(m.user_id, coalesce(public.sitio_name_of(new.added_by), 'A friend') || ' added ' || (new.place->>'name') || ' to ' || lname);
  end loop;
  return new;
end $$;
drop trigger if exists sitio_group_item_notify on public.sitio_group_items;
create trigger sitio_group_item_notify after insert on public.sitio_group_items
  for each row execute function public.sitio_group_item_notify();

revoke all on function public.sitio_in_group(uuid, uuid), public.sitio_group_notify_push(uuid, text) from public, anon, authenticated;
revoke all on function public.sitio_my_groups(), public.sitio_group_create(text, text, uuid[]), public.sitio_group_invite(uuid, uuid[]),
  public.sitio_group_add(uuid, jsonb), public.sitio_group_remove_item(uuid), public.sitio_group_leave(uuid),
  public.sitio_group_update(uuid, text, text), public.sitio_group_delete(uuid), public.sitio_group_kick(uuid, uuid), public.sitio_friend_map(uuid) from public, anon;
grant execute on function public.sitio_my_groups(), public.sitio_group_create(text, text, uuid[]), public.sitio_group_invite(uuid, uuid[]),
  public.sitio_group_add(uuid, jsonb), public.sitio_group_remove_item(uuid), public.sitio_group_leave(uuid),
  public.sitio_group_update(uuid, text, text), public.sitio_group_delete(uuid), public.sitio_group_kick(uuid, uuid), public.sitio_friend_map(uuid) to authenticated;
