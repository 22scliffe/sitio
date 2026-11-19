-- Sitio: Admin → Recent activity. Run once in Supabase → SQL Editor.
-- Admins only. Returns the latest events across all members (newest first):
--   spot      someone saved a Spot (starter places left out)
--   friends   two people became friends (only once both have added each other)
--   invite    someone created an invite link
--   joined    someone joined Sitio through someone's invite
--   sent      someone sent a friend a spot inside Sitio
-- Level-ups are worked out in the app from the Spots list (each "spot" row carries that person's running total).

create or replace function public.sitio_admin_activity(lim integer default 300) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sitio_is_admin() then raise exception 'Admins only'; end if;
  return coalesce((select json_agg(e order by e.at desc) from (
    (select 'spot' as kind, s.at, s.uid as a, public.sitio_name_of(s.uid) as a_name, null::uuid as b, null::text as b_name,
            s.name as place, s.city as city, s.n as total
       from (select d.user_id as uid, p->>'name' as name,
                    (select c->>'name' from jsonb_array_elements(case when jsonb_typeof(d.data->'cities') = 'array' then d.data->'cities' else '[]'::jsonb end) c where c->>'id' = p->>'cityId' limit 1) as city,
                    to_timestamp(((p->>'addedAt')::numeric) / 1000) as at,
                    row_number() over (partition by d.user_id order by (p->>'addedAt')::numeric) as n
               from sitio_data d, jsonb_array_elements(case when jsonb_typeof(d.data->'places') = 'array' then d.data->'places' else '[]'::jsonb end) p
              where p->>'status' = 'spot' and not coalesce((p->>'sample')::boolean, false) and p->>'id' not like 'p-%'
                and (p->>'addedAt') ~ '^[0-9.]+$') s
      order by s.at desc limit lim)
    union all
    (select 'friends', f.accepted_at, f.a, public.sitio_name_of(f.a), f.b, public.sitio_name_of(f.b), null, null, null
       from sitio_friends f where f.status = 'accepted' and f.accepted_at is not null order by f.accepted_at desc limit lim)
    union all
    (select 'invite', i.created_at, i.inviter, public.sitio_name_of(i.inviter), null, null, null, null, null
       from sitio_invites i order by i.created_at desc limit lim)
    union all
    (select 'joined', i.used_at, i.used_by, public.sitio_name_of(i.used_by), i.inviter, public.sitio_name_of(i.inviter), null, null, null
       from sitio_invites i where i.used_by is not null and i.used_at is not null order by i.used_at desc limit lim)
    union all
    (select 'sent', x.created_at, x.sender, public.sitio_name_of(x.sender), x.receiver, public.sitio_name_of(x.receiver), x.place->>'name', null, null
       from sitio_sent_spots x order by x.created_at desc limit lim)
  ) e), '[]'::json);
end $$;

revoke all on function public.sitio_admin_activity(integer) from public, anon;
grant execute on function public.sitio_admin_activity(integer) to authenticated;
