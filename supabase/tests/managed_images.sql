-- Run against a disposable, migrated database. Everything is rolled back.
begin;
create function pg_temp.assert_true(ok boolean, message text)
returns void language plpgsql as $$
begin
    if ok is distinct from true then raise exception '%', message; end if;
end;
$$;
insert into auth.users(id) values
    ('11111111-1111-4111-8111-111111111111'),
    ('22222222-2222-4222-8222-222222222222');
insert into public.image_assets(id, user_id, storage_path, public_url, source_url, byte_size, width, height, pipeline_version, ready_at, last_used_at)
select asset_id, owner_id, owner_id::text || '/' || asset_id::text || '.webp',
    'https://storage.example/' || asset_id::text || '.webp', 'https://source.example/original',
    40000, 512, 512, 1, now(), used
from (values
    ('aaaaaaaa-0000-4000-8000-000000000001'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, now() - interval '8 days'),
    ('aaaaaaaa-0000-4000-8000-000000000002'::uuid, '22222222-2222-4222-8222-222222222222'::uuid, now() - interval '8 days'),
    ('aaaaaaaa-0000-4000-8000-000000000003'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, now() - interval '8 days'),
    ('aaaaaaaa-0000-4000-8000-000000000004'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, now())
) assets(asset_id, owner_id, used);

-- A pre-migration URL must survive the INSERT and UPDATE sides of an upsert.
alter table public.albums disable trigger validate_album_image;
insert into public.albums(id, user_id, title, artwork_url)
values ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Legacy', 'https://legacy.example/art.jpg');
alter table public.albums enable trigger validate_album_image;
update public.image_assets set ready_at = null where id = 'aaaaaaaa-0000-4000-8000-000000000004';
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select pg_temp.assert_true((select count(*) = 3 from public.image_assets), 'Registry RLS must hide other owners');
select public.save_library_changes('{"albums":{"saved":[{"id":"bbbbbbbb-0000-4000-8000-000000000001","title":"Legacy edit","artwork_url":"https://legacy.example/art.jpg"}]}}'::jsonb);
select pg_temp.assert_true((select title = 'Legacy edit' and artwork_url = 'https://legacy.example/art.jpg' from public.albums), 'Legacy image blocked an unrelated save');

-- A newly created album must accept the same ready image as an existing album.
select public.save_library_changes('{"albums":{"saved":[{"id":"bbbbbbbb-0000-4000-8000-000000000002","title":"New managed album","artwork_url":"https://storage.example/aaaaaaaa-0000-4000-8000-000000000001.webp"}]}}'::jsonb);
select pg_temp.assert_true((select artwork_url = 'https://storage.example/aaaaaaaa-0000-4000-8000-000000000001.webp' from public.albums where id = 'bbbbbbbb-0000-4000-8000-000000000002'), 'New album image must use its ready asset');
delete from public.albums where id = 'bbbbbbbb-0000-4000-8000-000000000002';

do $$
begin
    begin
        update public.albums set artwork_url = 'https://new.example/art.jpg';
        raise exception 'New external URLs must require import';
    exception when raise_exception then
        if sqlerrm not like 'Import the image%' then raise; end if;
    end;
    begin
        update public.albums set artwork_url = 'https://storage.example/aaaaaaaa-0000-4000-8000-000000000002.webp';
        raise exception 'Other-account assets must be rejected';
    exception when raise_exception then
        if sqlerrm not like 'Import the image%' then raise; end if;
    end;
    begin
        update public.albums set artwork_url = 'https://storage.example/aaaaaaaa-0000-4000-8000-000000000004.webp';
        raise exception 'Pending assets must be rejected';
    exception when raise_exception then
        if sqlerrm not like 'Import the image%' then raise; end if;
    end;
    begin
        delete from public.image_assets;
        raise exception 'Client must not delete the registry';
    exception when insufficient_privilege then null;
    end;
    begin
        perform public.claim_unused_image_assets();
        raise exception 'Client must not claim cleanup';
    exception when insufficient_privilege then null;
    end;
end;
$$;
update public.albums set artwork_url = 'https://storage.example/aaaaaaaa-0000-4000-8000-000000000001.webp';
reset role;
set local role service_role;
create temporary table claimed as select * from public.claim_unused_image_assets();
select pg_temp.assert_true((select count(*) = 2 from claimed), 'Only old unreferenced assets may be claimed');
select pg_temp.assert_true(not exists(select 1 from claimed where id in ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000004')), 'Referenced and fresh assets must survive');
select pg_temp.assert_true((select count(*) = 2 from public.claim_unused_image_assets()), 'Failed deletions must be retried');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$
begin
    begin
        update public.albums set artwork_url = 'https://storage.example/aaaaaaaa-0000-4000-8000-000000000003.webp';
        raise exception 'Claimed assets must not be attached';
    exception when raise_exception then
        if sqlerrm not like 'Import the image%' then raise; end if;
    end;
end;
$$;
update public.albums set artwork_url = null;
select pg_temp.assert_true((select artwork_url is null from public.albums), 'Clearing the image must succeed');
reset role;
delete from auth.users where id = '11111111-1111-4111-8111-111111111111';
select pg_temp.assert_true((select count(*) = 3 from public.image_assets where user_id is null), 'Account deletion must retain cleanup metadata');
rollback;
