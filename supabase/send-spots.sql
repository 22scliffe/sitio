-- Sitio: send a spot to friends inside the app. Run once in Supabase → SQL Editor (after friends-memories.sql).
-- A sent spot goes straight to the top of the friend's To try, credited "via <sender>".
-- Limit: 3 spots a day to each friend (Madrid time). Admin accounts have no limit.
-- Only name, category, area, location, Google ID and city are sent: never notes, prices or photos.
-- Rows are deleted 2 days after the friend's phone has picked them up, or after 30 days if never picked up.

create extension if not exists pg_net;

create table if not exists public.sitio_shares (
  id bigserial primary key,
  sender uuid not null references auth.users(id) on delete cascade,
  receiver uuid not null references auth.users(id) on delete cascade,
  place jsonb not null,
  created_at timestamptz not null default now(),
  taken_at timestamptz
);
alter table public.sitio_shares enable row level security;  -- only reachable through the functions below
create index if not exists sitio_shares_inbox on public.sitio_shares (receiver) where taken_at is null;
create index if not exists sitio_shares_daily on public.sitio_shares (sender, receiver, created_at);

create or replace function public.sitio_share_day_start() returns timestamptz
language sql stable as $$ select (date_trunc('day', now() at time zone 'Europe/Madrid')) at time zone 'Europe/Madrid'; $$;

-- How many spots I've sent each friend today (cap is null for admins)
create or replace function public.sitio_share_today() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'cap', case when public.sitio_user_is_admin(auth.uid()) then null else 3 end,
    'counts', coalesce((select json_object_agg(receiver, n) from (select receiver, count(*) n from sitio_shares
       where sender = auth.uid() and created_at >= public.sitio_share_day_start() group by receiver) s), '{}'::json));
$$;

create or replace function public.sitio_send_spot(to_ids uuid[], place jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t uuid; res jsonb := '{}'::jsonb; clean jsonb; unlimited boolean;
begin
  if me is null or not public.sitio_is_member() then raise exception 'Log in first'; end if;
  if coalesce(array_length(to_ids, 1), 0) = 0 or array_length(to_ids, 1) > 25 then raise exception 'Pick who to send it to'; end if;
  if coalesce(trim(place->>'name'), '') = '' then raise exception 'That spot has no name'; end if;
  unlimited := public.sitio_user_is_admin(me);
  clean := jsonb_strip_nulls(jsonb_build_object(
    'name', left(place->>'name', 120), 'cat', left(place->>'cat', 20), 'cats', place->'cats', 'cuisine', left(place->>'cuisine', 40),
    'area', left(place->>'area', 80), 'lat', place->'lat', 'lng', place->'lng', 'googleId', left(place->>'googleId', 300),
    'city', case when jsonb_typeof(place->'city') = 'object' then jsonb_build_object('name', left(place->'city'->>'name', 80),
      'lat', place->'city'->'lat', 'lng', place->'city'->'lng', 'cc', left(place->'city'->>'cc', 4), 'currency', left(place->'city'->>'currency', 4)) end));
  foreach t in array to_ids loop
    if t = me or not public.sitio_are_friends(me, t) then res := res || jsonb_build_object(t::text, 'notfriends');
    elsif not unlimited and (select count(*) from sitio_shares where sender = me and receiver = t and created_at >= public.sitio_share_day_start()) >= 3 then
      res := res || jsonb_build_object(t::text, 'limit');
    else
      insert into sitio_shares (sender, receiver, place) values (me, t, clean);
      res := res || jsonb_build_object(t::text, 'sent');
    end if;
  end loop;
  return res;
end $$;

-- The receiver's phone picks up new spots (and old rows get cleaned up)
create or replace function public.sitio_take_shares() returns json
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); out_ json;
begin
  if me is null then raise exception 'Log in first'; end if;
  delete from sitio_shares where (taken_at is not null and taken_at < now() - interval '2 days') or created_at < now() - interval '30 days';
  with taken as (
    update sitio_shares s set taken_at = now() where s.receiver = me and s.taken_at is null
      and public.sitio_are_friends(s.sender, me)
    returning s.id, s.sender, s.place, s.created_at)
  select coalesce(json_agg(json_build_object('id', id, 'from', sender, 'fromName', public.sitio_name_of(sender),
    'place', place, 'at', (extract(epoch from created_at) * 1000)::bigint) order by created_at), '[]'::json) into out_ from taken;
  return out_;
end $$;

-- Push: "marta sent you Bodega Rubio" (only if they have notifications and Spots and friends on)
create or replace function public.sitio_share_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://bkucombtgrvoesviyxct.supabase.co/functions/v1/sitio-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'PASTE-CRON-SECRET-HERE'),
    body := jsonb_build_object('friend', jsonb_build_object('to', new.receiver, 'url', './#totry',
      'body', coalesce(public.sitio_name_of(new.sender), 'A friend') || ' sent you ' || (new.place->>'name') || '. It’s at the top of your To try.')));
  return new;
end $$;
drop trigger if exists sitio_share_notify on public.sitio_shares;
create trigger sitio_share_notify after insert on public.sitio_shares for each row execute function public.sitio_share_notify();

revoke all on function public.sitio_share_today(), public.sitio_send_spot(uuid[], jsonb), public.sitio_take_shares() from public, anon;
grant execute on function public.sitio_share_today(), public.sitio_send_spot(uuid[], jsonb), public.sitio_take_shares() to authenticated;
