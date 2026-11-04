-- Sitio: lets the admin give people extra invites from the admin area. Run once in Supabase → SQL Editor.

create table if not exists public.sitio_invite_bonus (
  user_id uuid primary key references auth.users(id) on delete cascade,
  extra integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.sitio_invite_bonus enable row level security;  -- only reachable through the functions below

-- Anyone's allowance: 3, +2 at 5 spots, +3 at 50 spots, plus anything the admin gave them (max 100,000)
create or replace function public.sitio_invite_allowance_for(uid uuid) returns integer
language sql stable security definer set search_path = public as $$
  with n as (
    select count(*) as spots from sitio_data d,
      jsonb_array_elements(case when jsonb_typeof(d.data->'places') = 'array' then d.data->'places' else '[]'::jsonb end) p
    where d.user_id = uid and p->>'status' = 'spot')
  select least(100000, 3 + case when spots >= 5 then 2 else 0 end + case when spots >= 50 then 3 else 0 end
    + coalesce((select extra from sitio_invite_bonus where user_id = uid), 0))::integer from n;
$$;

create or replace function public.sitio_invite_allowance() returns integer
language sql stable security definer set search_path = public as $$
  select case when public.sitio_is_admin() then 100000 else public.sitio_invite_allowance_for(auth.uid()) end;
$$;

create or replace function public.sitio_admin_invites(uid uuid) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sitio_is_admin() then raise exception 'Admins only'; end if;
  return json_build_object(
    'allowance', public.sitio_invite_allowance_for(uid),
    'used', (select count(*) from sitio_invites where inviter = uid),
    'joined', (select count(*) from sitio_invites where inviter = uid and used_by is not null),
    'extra', coalesce((select extra from sitio_invite_bonus where user_id = uid), 0),
    'pending', (select count(*) from sitio_invites where inviter = uid and used_by is null),
    'people', coalesce((select json_agg(json_build_object('id', i.used_by, 'at', i.used_at,
        'name', (select d.data->'user'->>'name' from sitio_data d where d.user_id = i.used_by)) order by i.used_at)
      from sitio_invites i where i.inviter = uid and i.used_by is not null), '[]'::json),
    'by_id', (select invited_by from sitio_members where user_id = uid),
    'by', (select d.data->'user'->>'name' from sitio_members m join sitio_data d on d.user_id = m.invited_by where m.user_id = uid));
end $$;

-- Give (or with a negative number, take back) extra invites. 100000 or more counts as unlimited.
create or replace function public.sitio_admin_give_invites(uid uuid, n integer) returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public.sitio_is_admin() then raise exception 'Admins only'; end if;
  insert into sitio_invite_bonus (user_id, extra) values (uid, greatest(0, least(100000, n)))
    on conflict (user_id) do update set extra = greatest(0, least(100000, sitio_invite_bonus.extra + n)), updated_at = now();
  return public.sitio_admin_invites(uid);
end $$;

revoke all on function public.sitio_invite_allowance_for(uuid), public.sitio_admin_invites(uuid), public.sitio_admin_give_invites(uuid, integer) from public, anon;
grant execute on function public.sitio_admin_invites(uuid), public.sitio_admin_give_invites(uuid, integer) to authenticated;
