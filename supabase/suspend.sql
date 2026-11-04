-- Sitio: remove invites and suspend accounts from the admin area. Run once in Supabase → SQL Editor,
-- after sitio-invite-gifts.sql and sitio-admin-invite-tree.sql.

create table if not exists public.sitio_suspended (
  user_id uuid primary key references auth.users(id) on delete cascade,
  at timestamptz not null default now()
);
alter table public.sitio_suspended enable row level security;  -- only reachable through the functions below

-- Is this user one of the admins? (works whatever the admin table's column is called)
create or replace function public.sitio_user_is_admin(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from sitio_admins a where to_jsonb(a)::text like '%' || uid::text || '%');
$$;

-- Members who are suspended stop being members: they can't read or save anything
create or replace function public.sitio_is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from sitio_members where user_id = auth.uid())
     and not exists (select 1 from sitio_suspended where user_id = auth.uid());
$$;

create or replace function public.sitio_my_status() returns text
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from sitio_suspended where user_id = auth.uid()) then 'suspended'
              when exists (select 1 from sitio_members where user_id = auth.uid()) then 'member' else 'none' end;
$$;

-- Extra invites can now be negative (the admin took some away). Never below zero in total.
create or replace function public.sitio_invite_allowance_for(uid uuid) returns integer
language sql stable security definer set search_path = public as $$
  with n as (
    select count(*) as spots from sitio_data d,
      jsonb_array_elements(case when jsonb_typeof(d.data->'places') = 'array' then d.data->'places' else '[]'::jsonb end) p
    where d.user_id = uid and p->>'status' = 'spot')
  select greatest(0, least(100000, 3 + case when spots >= 5 then 2 else 0 end + case when spots >= 50 then 3 else 0 end
    + coalesce((select extra from sitio_invite_bonus where user_id = uid), 0)))::integer from n;
$$;

create or replace function public.sitio_admin_give_invites(uid uuid, n integer) returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public.sitio_is_admin() then raise exception 'Admins only'; end if;
  insert into sitio_invite_bonus (user_id, extra) values (uid, greatest(-100000, least(100000, n)))
    on conflict (user_id) do update set extra = greatest(-100000, least(100000, sitio_invite_bonus.extra + n)), updated_at = now();
  return public.sitio_admin_invites(uid);
end $$;

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
    'by', (select d.data->'user'->>'name' from sitio_members m join sitio_data d on d.user_id = m.invited_by where m.user_id = uid),
    'suspended', exists (select 1 from sitio_suspended where user_id = uid),
    'is_admin', public.sitio_user_is_admin(uid));
end $$;

-- Suspend (logs them out everywhere and blocks their data) or reinstate. Admin accounts can't be suspended.
create or replace function public.sitio_admin_suspend(uid uuid, on_off boolean) returns json
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.sitio_is_admin() then raise exception 'Admins only'; end if;
  if uid = auth.uid() or public.sitio_user_is_admin(uid) then raise exception 'Admin accounts can''t be suspended'; end if;
  if on_off then
    insert into sitio_suspended (user_id) values (uid) on conflict do nothing;
    delete from auth.sessions where user_id = uid;  -- ends every login they have
  else
    delete from sitio_suspended where user_id = uid;
  end if;
  return public.sitio_admin_invites(uid);
end $$;

revoke all on function public.sitio_user_is_admin(uuid), public.sitio_admin_suspend(uuid, boolean), public.sitio_my_status() from public, anon;
grant execute on function public.sitio_admin_suspend(uuid, boolean), public.sitio_my_status() to authenticated;
-- Sitio: invite links from a suspended account are paused until the account is reinstated.
-- Links already used before the suspension are unaffected. Run once in Supabase → SQL Editor.

create or replace function public.sitio_check_invite(c text) returns json
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from sitio_suspended s where s.user_id = i.inviter)
    then json_build_object('ok', false, 'paused', true)
    else json_build_object('ok', true, 'from', (select d.data->'user'->>'name' from sitio_data d where d.user_id = i.inviter)) end
  from sitio_invites i where i.code = lower(trim(c)) and i.used_by is null;
$$;

create or replace function public.sitio_redeem_invite(c text) returns boolean
language plpgsql security definer set search_path = public as $$
declare inv uuid;
begin
  if auth.uid() is null then raise exception 'Log in first'; end if;
  if public.sitio_is_member() then return true; end if;
  if exists (select 1 from sitio_invites i join sitio_suspended s on s.user_id = i.inviter where i.code = lower(trim(c)) and i.used_by is null)
    then raise exception 'This invite is paused at the moment. Try again later or ask for another one.'; end if;
  update sitio_invites set used_by = auth.uid(), used_at = now()
    where code = lower(trim(c)) and used_by is null returning inviter into inv;
  if inv is null then raise exception 'That invite has already been used or doesn''t exist'; end if;
  insert into sitio_members (user_id, invited_by) values (auth.uid(), inv);
  return true;
end $$;

grant execute on function public.sitio_check_invite(text) to anon, authenticated;
