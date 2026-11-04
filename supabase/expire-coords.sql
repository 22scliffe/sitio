-- Sitio: Google's terms allow keeping coordinates from Google Places for up to 30 days.
-- Every night this removes Google coordinates older than 30 days from everyone's saved data.
-- The place's Google ID is kept, and the app fetches fresh coordinates the next time it opens.
-- Places added with "Drop a pin" have no Google ID and are never touched. Run once in SQL Editor.

create or replace function public.sitio_expire_coords() returns integer
language plpgsql security definer set search_path = public as $$
declare
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
  cutoff bigint := now_ms - 30::bigint * 86400000;
  n integer;
begin
  update sitio_data d set data = jsonb_set(d.data, '{places}', (
    select coalesce(jsonb_agg(
      case when coalesce(p->>'googleId', '') <> '' and p ? 'lat'
                and coalesce(nullif(p->>'coordsAt', '')::bigint, 0) < cutoff
           then (p - 'lat' - 'lng') || jsonb_build_object('coordsAt', 0, 'updatedAt', now_ms)
           else p end order by ord), '[]'::jsonb)
    from jsonb_array_elements(d.data->'places') with ordinality as t(p, ord)))
  where jsonb_typeof(d.data->'places') = 'array'
    and exists (select 1 from jsonb_array_elements(d.data->'places') p
                where coalesce(p->>'googleId', '') <> '' and p ? 'lat'
                  and coalesce(nullif(p->>'coordsAt', '')::bigint, 0) < cutoff);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.sitio_expire_coords() from public, anon, authenticated;

select cron.unschedule('sitio-expire-coords') where exists (select 1 from cron.job where jobname = 'sitio-expire-coords');
select cron.schedule('sitio-expire-coords', '30 3 * * *', 'select public.sitio_expire_coords()');
