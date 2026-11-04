-- Sitio: suggest usernames as you type in "Add a friend" (members only, up to 6, typo-tolerant).
-- Run once in Supabase → SQL Editor, after sitio-friends.sql.
create extension if not exists pg_trgm with schema extensions;

create or replace function public.sitio_find_users(q text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare me uuid := auth.uid(); t text := lower(trim(both '@ ' from coalesce(q, '')));
begin
  if me is null or not public.sitio_is_member() then raise exception 'Log in first'; end if;
  if length(t) < 2 then return '[]'::json; end if;
  return coalesce((select json_agg(r) from (
    select d.user_id as id, d.data->'user'->>'name' as name, d.data->'user'->>'avatar' as avatar,
      (select f.status || case when f.status = 'pending' and f.requested_by = me then ':out' when f.status = 'pending' then ':in' else '' end
         from sitio_friends f where f.a = least(me, d.user_id) and f.b = greatest(me, d.user_id)) as rel
    from sitio_data d join sitio_members m on m.user_id = d.user_id
    where d.user_id <> me
      and not exists (select 1 from sitio_suspended s where s.user_id = d.user_id)
      and coalesce(d.data->'user'->>'name', '') <> ''
      and (lower(d.data->'user'->>'name') like '%' || t || '%' or similarity(lower(d.data->'user'->>'name'), t) > 0.3)
    order by (lower(d.data->'user'->>'name') = t) desc, (lower(d.data->'user'->>'name') like t || '%') desc,
      similarity(lower(d.data->'user'->>'name'), t) desc
    limit 6) r), '[]'::json);
end $$;
revoke all on function public.sitio_find_users(text) from public, anon;
grant execute on function public.sitio_find_users(text) to authenticated;
