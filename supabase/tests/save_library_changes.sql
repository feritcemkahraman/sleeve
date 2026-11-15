-- Run against a disposable, migrated database:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/save_library_changes.sql
-- All fixture data and changes are rolled back.
begin;

create function pg_temp.assert_true(ok boolean, message text)
returns void language plpgsql as $$
begin
    if ok is distinct from true then raise exception '%', message; end if;
end;
$$;

insert into auth.users (id) values
    ('11111111-1111-4111-8111-111111111111'),
    ('22222222-2222-4222-8222-222222222222');
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select public.save_library_changes('{
    "artists": {"saved": [{"id": "00000000-0000-4000-8000-000000000001", "name": "Artist", "photo_url": "https://example.com/artist.jpg"}]},
    "genres": {"saved": [
        {"id": "00000000-0000-4000-8000-000000000002", "name": "Child", "parent_genre_id": "00000000-0000-4000-8000-000000000003"},
        {"id": "00000000-0000-4000-8000-000000000003", "name": "Parent"}
    ]},
    "instruments": {"saved": [{"id": "00000000-0000-4000-8000-000000000004", "name": "Sax", "image_url": "https://example.com/sax.jpg"}]},
    "albums": {"saved": [{"id": "00000000-0000-4000-8000-000000000005", "title": "Album", "record_label": "Blue Note"}]},
    "album_artists": {"saved": [{"album_id": "00000000-0000-4000-8000-000000000005", "artist_id": "00000000-0000-4000-8000-000000000001", "position": 0, "role": "primary"}]},
    "album_genres": {"saved": [{"album_id": "00000000-0000-4000-8000-000000000005", "genre_id": "00000000-0000-4000-8000-000000000002", "is_primary": true}]},
    "album_instruments": {"saved": [{"album_id": "00000000-0000-4000-8000-000000000005", "instrument_id": "00000000-0000-4000-8000-000000000004", "notes": "Solo"}]},
    "instrument_categories": {"saved": [{"instrument_id": "00000000-0000-4000-8000-000000000004", "category": "woodwind"}]},
    "album_links": {"saved": [{"id": "00000000-0000-4000-8000-000000000006", "album_id": "00000000-0000-4000-8000-000000000005", "url": "https://example.com"}]},
    "listening_entries": {"saved": [{"id": "00000000-0000-4000-8000-000000000007", "album_id": "00000000-0000-4000-8000-000000000005", "rating": 9, "listened_at": "2026-11-07"}]}
}'::jsonb);
set constraints all immediate;
select pg_temp.assert_true((select photo_url = 'https://example.com/artist.jpg' from public.artists), 'Artist photo insert missing');
select pg_temp.assert_true((select image_url = 'https://example.com/sax.jpg' from public.instruments), 'Instrument image insert missing');
select public.save_library_changes('{
    "artists": {"saved": [{"id": "00000000-0000-4000-8000-000000000001", "name": "Artist", "photo_url": "https://example.com/new.jpg"}]},
    "instruments": {"saved": [{"id": "00000000-0000-4000-8000-000000000004", "name": "Sax", "image_url": null}]}
}'::jsonb);
select pg_temp.assert_true((select photo_url = 'https://example.com/new.jpg' from public.artists), 'Artist photo update missing');
select pg_temp.assert_true((select image_url is null from public.instruments), 'Instrument image clear failed');
select pg_temp.assert_true((select record_label = 'Blue Note' from public.albums), 'Record label missing');
-- Existing/older payloads default to null; new clients can set and clear status.
select pg_temp.assert_true((select vinyl_status is null from public.albums), 'Vinyl status must default to null');
do $$
declare
    desired text;
    result jsonb;
begin
    foreach desired in array array['wishlisted', 'owned', null, 'owned'] loop
        result := public.save_library_changes(jsonb_build_object('albums', jsonb_build_object('saved',
            jsonb_build_array(jsonb_build_object(
                'id', '00000000-0000-4000-8000-000000000005',
                'title', 'Album', 'record_label', 'Blue Note', 'vinyl_status', desired
            )))));
        perform pg_temp.assert_true(
            (select vinyl_status::text is not distinct from desired from public.albums),
            'Vinyl status did not persist');
        perform pg_temp.assert_true(
            (result->'albums'->0->>'vinyl_status') is not distinct from desired,
            'Save result omitted vinyl status');
    end loop;

    perform public.save_library_changes('{
        "albums": {"saved": [{"id": "00000000-0000-4000-8000-000000000005", "title": "Album", "record_label": "Blue Note"}]}
    }'::jsonb);
    perform pg_temp.assert_true((select vinyl_status = 'owned' from public.albums), 'Older client cleared vinyl status');

    begin
        perform public.save_library_changes('{
            "albums": {"saved": [{"id": "00000000-0000-4000-8000-000000000005", "title": "Must roll back", "vinyl_status": "invalid"}]}
        }'::jsonb);
        raise exception 'Invalid vinyl status was accepted';
    exception when invalid_text_representation then null;
    end;
    perform pg_temp.assert_true((select title = 'Album' and vinyl_status = 'owned' from public.albums), 'Invalid status changed album');

    -- Also exercise insertion with each enum value, then remove the fixtures.
    foreach desired in array array['owned', 'wishlisted'] loop
        perform public.save_library_changes(jsonb_build_object('albums', jsonb_build_object('saved',
            jsonb_build_array(jsonb_build_object(
                'id', '00000000-0000-4000-8000-000000000008',
                'title', 'Vinyl insert', 'vinyl_status', desired
            )))));
        perform pg_temp.assert_true(
            (select vinyl_status::text = desired from public.albums where id = '00000000-0000-4000-8000-000000000008'),
            'Vinyl status insert failed');
        perform public.save_library_changes('{
            "albums": {"deleted": [{"id": "00000000-0000-4000-8000-000000000008"}]}
        }'::jsonb);
    end loop;

end;
$$;

select pg_temp.assert_true(
    (select count(*) = 1 from public.album_links), 'Related album records were not saved');
select pg_temp.assert_true(
    (select created_at is not null and updated_at is not null from public.listening_entries), 'Server timestamps missing');

select public.save_library_changes('{
    "artists": {"saved": [{"id": "00000000-0000-4000-8000-000000000001", "name": "Renamed"}]},
    "listening_entries": {"saved": [{"id": "00000000-0000-4000-8000-000000000007", "album_id": "00000000-0000-4000-8000-000000000005", "rating": 10, "listened_at": "2026-11-06"}]}
}'::jsonb);
select pg_temp.assert_true((select name = 'Renamed' from public.artists), 'Artist update missing');
select pg_temp.assert_true((select rating = 10 from public.listening_entries), 'Listen update missing');

do $$
begin
    begin
        perform public.save_library_changes('{
            "albums": {"saved": [{"id": "00000000-0000-4000-8000-000000000005", "title": "Must roll back"}]},
            "listening_entries": {"saved": [{"id": "00000000-0000-4000-8000-000000000007", "album_id": "00000000-0000-4000-8000-000000000005", "rating": 99, "listened_at": "2026-11-07"}]}
        }'::jsonb);
        raise exception 'Invalid rating was accepted';
    exception when check_violation then null;
    end;
    begin
        perform public.save_library_changes('{
            "genres": {"saved": [{"id": "00000000-0000-4000-8000-000000000003", "name": "Parent", "parent_genre_id": "00000000-0000-4000-8000-000000000002"}]}
        }'::jsonb);
        raise exception 'Cycle was accepted';
    exception when raise_exception then
        if sqlerrm <> 'Genre parents cannot create a cycle' then raise; end if;
    end;
end;
$$;
select pg_temp.assert_true((select title = 'Album' from public.albums), 'Failed save did not roll back');

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select pg_temp.assert_true((select count(*) = 0 from public.albums), 'RLS exposed another user album');
do $$
begin
    begin
        perform public.save_library_changes('{
            "albums": {"saved": [{"id": "00000000-0000-4000-8000-000000000005", "title": "Stolen", "vinyl_status": "wishlisted"}]}
        }'::jsonb);
        raise exception 'Cross-user write was accepted';
    exception when insufficient_privilege then null;
    end;
end;
$$;
select public.save_library_changes('{
    "albums": {"deleted": [{"id": "00000000-0000-4000-8000-000000000005"}]}
}'::jsonb);
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select pg_temp.assert_true((select title = 'Album' from public.albums), 'Cross-user delete succeeded');
rollback;
