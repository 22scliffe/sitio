-- Sitio: a "testfriend" account for the admin, to see what friends see and to test sending spots.
-- Run once in Supabase → SQL Editor. Safe to run again (it refreshes testfriend's spots).
-- testfriend can also log in (email testfriend@example.com, the password below) on another browser to see the other side.
-- To remove it later: delete from auth.users where id = '00000000-0000-4000-8000-00000000f00d';

do $$
declare tf uuid := '00000000-0000-4000-8000-00000000f00d'; me uuid; pw text := 'PASTE-TEST-PASSWORD-HERE';
begin
  select u.id into me from auth.users u where exists (select 1 from sitio_admins a where to_jsonb(a)::text like '%' || u.id::text || '%') order by u.created_at limit 1;
  if me is null then raise exception 'No admin account found'; end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', tf, 'authenticated', 'authenticated', 'testfriend@example.com',
          extensions.crypt(pw, extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}',
          now(), now(), '', '', '', '')
  on conflict (id) do update set encrypted_password = excluded.encrypted_password;

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), tf, tf::text, jsonb_build_object('sub', tf::text, 'email', 'testfriend@example.com', 'email_verified', true), 'email', now(), now(), now())
  on conflict do nothing;

  insert into sitio_members (user_id, invited_by) values (tf, me) on conflict (user_id) do nothing;

  insert into sitio_data (user_id, data, updated_at) values (tf, '{"user": {"name": "testfriend", "photo": null}, "settings": {"hours": true, "darkMap": true, "dirApp": "google", "shareMems": true, "memsNotice": 1}, "cities": [{"id": "c-madrid", "name": "Madrid", "currency": "€", "lat": 40.4168, "lng": -3.7038, "cc": "ES"}], "currentCityId": "c-madrid", "places": [{"id": "tf-1", "cityId": "c-madrid", "name": "Casa Labra", "area": "Sol", "cat": "bar", "cats": ["bar"], "cuisine": "Spanish", "status": "spot", "price": 1, "note": "Bacalao croqueta, eaten standing at the bar", "photos": [], "memories": [], "lat": 40.41778, "lng": -3.70452, "googleId": null, "hours": null, "hoursSrc": null, "addedAt": 1790348144886}, {"id": "tf-2", "cityId": "c-madrid", "name": "Bodega de la Ardosa", "area": "Malasaña", "cat": "bar", "cats": ["bar"], "cuisine": "Spanish", "status": "spot", "price": 1, "note": "Get the tortilla", "photos": [], "memories": [], "lat": 40.42672, "lng": -3.70201, "googleId": null, "hours": null, "hoursSrc": null, "addedAt": 1791212144886}, {"id": "tf-3", "cityId": "c-madrid", "name": "Sala Equis", "area": "Centro", "cat": "chill", "cats": ["chill"], "cuisine": "", "status": "spot", "price": 1, "note": "", "photos": [], "memories": [], "lat": 40.41197, "lng": -3.70671, "googleId": null, "hours": null, "hoursSrc": null, "addedAt": 1792076144886}, {"id": "tf-4", "cityId": "c-madrid", "name": "Café Comercial", "area": "Chamberí", "cat": "cafe", "cats": ["cafe"], "cuisine": "", "status": "spot", "price": 2, "note": "Where I meet people from work", "photos": [], "memories": [], "lat": 40.42897, "lng": -3.70258, "googleId": null, "hours": null, "hoursSrc": null, "addedAt": 1792767344886, "notePrivate": true}, {"id": "tf-5", "cityId": "c-madrid", "name": "Mercado de San Fernando", "area": "Lavapiés", "cat": "restaurant", "cats": ["restaurant"], "cuisine": "", "status": "spot", "price": 1, "note": "Lots of little stalls, go hungry", "photos": [], "memories": [], "lat": 40.40866, "lng": -3.70083, "googleId": null, "hours": null, "hoursSrc": null, "addedAt": 1793285744886}, {"id": "tf-6", "cityId": "c-madrid", "name": "La Venencia", "area": "Huertas", "cat": "bar", "cats": ["bar"], "cuisine": "", "status": "spot", "price": 1, "note": "This one is in Hidden from friends, you should never see it", "photos": [], "memories": [], "lat": 40.41552, "lng": -3.69884, "googleId": null, "hours": null, "hoursSrc": null, "addedAt": 1793544944886}, {"id": "tf-7", "cityId": "c-madrid", "name": "Clamores", "area": "Chamberí", "cat": "club", "cats": ["club"], "cuisine": "", "status": "totry", "price": 0, "note": "Live jazz", "photos": [], "memories": [], "lat": 40.43098, "lng": -3.70003, "googleId": null, "hours": null, "hoursSrc": null, "addedAt": 1793631344886}, {"id": "tf-8", "cityId": "c-madrid", "name": "Toma Café", "area": "Malasaña", "cat": "cafe", "cats": ["cafe"], "cuisine": "", "status": "totry", "price": 0, "note": "", "photos": [], "memories": [], "lat": 40.42493, "lng": -3.70651, "googleId": null, "hours": null, "hoursSrc": null, "addedAt": 1793717744886}], "lists": [{"id": "l-hidden", "name": "Hidden from friends", "emoji": "🔒", "ids": ["tf-6"], "createdAt": 1793804144886, "updatedAt": 1, "system": true}], "v": 12}'::jsonb, now())
  on conflict (user_id) do update set data = excluded.data, updated_at = now();

  insert into sitio_friends (a, b, requested_by, status, accepted_at) values (least(me, tf), greatest(me, tf), tf, 'accepted', now())
  on conflict (a, b) do update set status = 'accepted', accepted_at = now();
end $$;
