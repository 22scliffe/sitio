-- Sitio: push notifications for friends ("lola added you", "you and lola are now friends").
-- Sent through the sitio-push function, only to people who have notifications and "Spots and friends" on.
-- Run once in Supabase → SQL Editor, after sitio-friends.sql.

create extension if not exists pg_net;

create or replace function public.sitio_friend_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare target uuid; other uuid; msg text;
begin
  other := case when new.requested_by = new.a then new.b else new.a end;
  if tg_op = 'INSERT' and new.status = 'pending' then
    target := other;
    msg := coalesce(public.sitio_name_of(new.requested_by), 'Someone') || ' added you on Sitio. Add them back to see each other''s spots.';
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    target := new.requested_by;
    msg := 'You and ' || coalesce(public.sitio_name_of(other), 'your friend') || ' are now friends on Sitio 🤝';
  elsif tg_op = 'INSERT' and new.status = 'accepted' then
    target := other;
    msg := 'You and ' || coalesce(public.sitio_name_of(new.requested_by), 'your friend') || ' are now friends on Sitio 🤝';
  else
    return new;
  end if;
  perform net.http_post(
    url := 'https://bkucombtgrvoesviyxct.supabase.co/functions/v1/sitio-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'PASTE-CRON-SECRET-HERE'),
    body := jsonb_build_object('friend', jsonb_build_object('to', target, 'body', msg)));
  return new;
end $$;

drop trigger if exists sitio_friend_notify on public.sitio_friends;
create trigger sitio_friend_notify after insert or update on public.sitio_friends
  for each row execute function public.sitio_friend_notify();
