-- Sitio: choose who shows "De los primeros" by hand. Run once in Supabase → SQL Editor.
-- Moves the tag from martita to gabriel. Check the two usernames below first: if either name doesn't
-- match exactly one account, nothing is changed and you get an error saying which one.

alter table public.sitio_members add column if not exists tag text check (tag in ('first', 'none'));

do $$
declare take_from text := 'martita'; give_to text := 'gabriel'; a uuid; b uuid; n int;
begin
  select count(*), min(user_id::text)::uuid into n, a from sitio_data where lower(data->'user'->>'name') = lower(take_from);
  if n <> 1 then raise exception 'No single account called %', take_from; end if;
  select count(*), min(user_id::text)::uuid into n, b from sitio_data where lower(data->'user'->>'name') = lower(give_to);
  if n <> 1 then raise exception 'No single account called %', give_to; end if;
  insert into sitio_members (user_id) values (a), (b) on conflict do nothing;
  update sitio_members set tag = 'none' where user_id = a;
  update sitio_members set tag = 'first' where user_id = b;
end $$;

-- Friends lists: a hand-set tag wins over the automatic one
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
