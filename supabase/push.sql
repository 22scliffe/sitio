-- Sitio: recap notifications. Run once in Supabase → SQL Editor.

-- 1. Where each phone's notification permission is kept (one row per phone)
create table if not exists public.sitio_push (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sub jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.sitio_push enable row level security;
drop policy if exists "own push rows" on public.sitio_push;
create policy "own push rows" on public.sitio_push for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 2. Every day at 11:00 UTC (12:00 in Spain in winter) ask the sitio-push function
--    whether today is a recap day. It only sends something on release days.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('sitio-recap-push') where exists (select 1 from cron.job where jobname = 'sitio-recap-push');
select cron.schedule('sitio-recap-push', '0 11 * * *', $$
  select net.http_post(
    url := 'https://bkucombtgrvoesviyxct.supabase.co/functions/v1/sitio-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'PASTE-CRON-SECRET-HERE'),
    body := '{}'::jsonb
  );
$$);
