-- Sitio: invite-only accounts. Run once in Supabase → SQL Editor.
-- Everyone who already has an account becomes a member. New people need an invite link from a member.
-- Each member can create 3 invites, plus 2 more once they have 5 spots (Local amateur). Admins have no limit.

create table if not exists public.sitio_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now()
);
insert into public.sitio_members (user_id) select id from auth.users on conflict do nothing;
alter table public.sitio_members enable row level security;
drop policy if exists "own membership" on public.sitio_members;
create policy "own membership" on public.sitio_members for select to authenticated using (user_id = auth.uid());

create table if not exists public.sitio_invites (
  code text primary key,
  inviter uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz
);
alter table public.sitio_invites enable row level security;  -- no direct access: only through the functions below

create or replace function public.sitio_is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from sitio_members where user_id = auth.uid());
$$;

create or replace function public.sitio_invite_allowance() returns integer
language sql stable security definer set search_path = public as $$
  select case when public.sitio_is_admin() then 100000 else 3 + case when (
    select count(*) from sitio_data d, jsonb_array_elements(case when jsonb_typeof(d.data->'places') = 'array' then d.data->'places' else '[]'::jsonb end) p
    where d.user_id = auth.uid() and p->>'status' = 'spot') >= 5 then 2 else 0 end end;
$$;

create or replace function public.sitio_my_invites() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'allowance', public.sitio_invite_allowance(),
    'invites', coalesce((select json_agg(json_build_object(
        'code', i.code, 'created_at', i.created_at, 'used_at', i.used_at,
        'name', (select d.data->'user'->>'name' from sitio_data d where d.user_id = i.used_by))
      order by i.created_at desc) from sitio_invites i where i.inviter = auth.uid()), '[]'::json));
$$;

create or replace function public.sitio_create_invite() returns text
language plpgsql security definer set search_path = public as $$
declare n integer; c text;
begin
  if auth.uid() is null then raise exception 'Log in first'; end if;
  if not public.sitio_is_member() then raise exception 'Only members can invite'; end if;
  select count(*) into n from sitio_invites where inviter = auth.uid();
  if n >= public.sitio_invite_allowance() then raise exception 'No invites left'; end if;
  c := substr(md5(random()::text || clock_timestamp()::text || auth.uid()::text), 1, 10);
  insert into sitio_invites (code, inviter) values (c, auth.uid());
  return c;
end $$;

-- Anyone can check an invite before signing up (says who it's from, nothing else)
create or replace function public.sitio_check_invite(c text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('ok', true, 'from', (select d.data->'user'->>'name' from sitio_data d where d.user_id = i.inviter))
  from sitio_invites i where i.code = lower(trim(c)) and i.used_by is null;
$$;

create or replace function public.sitio_redeem_invite(c text) returns boolean
language plpgsql security definer set search_path = public as $$
declare inv uuid;
begin
  if auth.uid() is null then raise exception 'Log in first'; end if;
  if public.sitio_is_member() then return true; end if;
  update sitio_invites set used_by = auth.uid(), used_at = now()
    where code = lower(trim(c)) and used_by is null returning inviter into inv;
  if inv is null then raise exception 'That invite has already been used or doesn''t exist'; end if;
  insert into sitio_members (user_id, invited_by) values (auth.uid(), inv);
  return true;
end $$;

revoke all on function public.sitio_create_invite(), public.sitio_redeem_invite(text), public.sitio_my_invites(), public.sitio_invite_allowance() from public, anon;
grant execute on function public.sitio_create_invite(), public.sitio_redeem_invite(text), public.sitio_my_invites(), public.sitio_invite_allowance(), public.sitio_is_member() to authenticated;
grant execute on function public.sitio_check_invite(text) to anon, authenticated;

-- Only members can save data or share links (stops sign-ups that skip the invite)
drop policy if exists "members only" on public.sitio_data;
create policy "members only" on public.sitio_data as restrictive for all to authenticated
  using (public.sitio_is_member()) with check (public.sitio_is_member());
drop policy if exists "members only" on public.sitio_shares;
create policy "members only" on public.sitio_shares as restrictive for insert to authenticated
  with check (public.sitio_is_member());
