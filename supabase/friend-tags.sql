-- Sitio: friends show their profile tag (Founder / De los primeros / invited by), and admins can remove a
-- profile photo. Run once in Supabase → SQL Editor (after friends-memories.sql).

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
                  when exists (select 1 from sitio_members m where m.user_id = o.id and m.invited_by is null) then 'first' end,
      'invitedBy', (select public.sitio_name_of(m.invited_by) from sitio_members m where m.user_id = o.id))
      order by f.status desc, public.sitio_name_of(o.id)), '[]'::json))
  from sitio_friends f, lateral (select case when f.a = auth.uid() then f.b else f.a end as id) o
  where (f.a = auth.uid() or f.b = auth.uid());
$$;

-- Admin: remove someone's profile photo (e.g. inappropriate). Their phone picks up the change on next sync.
create or replace function public.sitio_admin_remove_avatar(uid uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.sitio_is_admin() then raise exception 'Admins only'; end if;
  update sitio_data set
    data = jsonb_set(jsonb_set(data, '{user}', coalesce(data->'user', '{}'::jsonb) || '{"avatar": null, "photo": null}'::jsonb),
                     '{metaAt}', to_jsonb((extract(epoch from now()) * 1000)::bigint)),
    updated_at = now()
  where user_id = uid;
  return 'removed';
end $$;

revoke all on function public.sitio_admin_remove_avatar(uuid) from public, anon;
grant execute on function public.sitio_admin_remove_avatar(uuid) to authenticated;
