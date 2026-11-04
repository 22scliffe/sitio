-- Sitio: keeps people logged in when they add Sitio to their iPhone home screen.
-- iPhone keeps Safari and home-screen apps separate, so right after signing up in Safari the app
-- leaves a one-time code in the address the home-screen icon opens. The first open swaps it for a login.
-- Codes work once and expire after 2 hours. Run once in Supabase → SQL Editor.

create table if not exists public.sitio_handoff (
  code text primary key,
  rt text not null,
  created_at timestamptz not null default now()
);
alter table public.sitio_handoff enable row level security;  -- only reachable through the two functions below

create or replace function public.sitio_handoff_put(rt text) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if auth.uid() is null then raise exception 'Log in first'; end if;
  delete from sitio_handoff where created_at < now() - interval '2 hours';
  c := md5(random()::text || clock_timestamp()::text || auth.uid()::text);
  insert into sitio_handoff (code, rt) values (c, rt);
  return c;
end $$;

create or replace function public.sitio_handoff_take(c text) returns text
language plpgsql security definer set search_path = public as $$
declare r text;
begin
  delete from sitio_handoff where code = c and created_at > now() - interval '2 hours' returning rt into r;
  return r;
end $$;

revoke all on function public.sitio_handoff_put(text), public.sitio_handoff_take(text) from public;
grant execute on function public.sitio_handoff_put(text) to authenticated;
grant execute on function public.sitio_handoff_take(text) to anon, authenticated;
