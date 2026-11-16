-- Run on a disposable migrated database with psql -v ON_ERROR_STOP=1.
begin;
insert into auth.users (id) values
    ('33333333-3333-4333-8333-333333333333'),
    ('44444444-4444-4444-8444-444444444444');
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';

select public.save_library_changes('{
  "genres": {"saved": [
    {"id": "10000000-0000-4000-8000-000000000001", "name": "Jazz"},
    {"id": "10000000-0000-4000-8000-000000000002", "name": "House"},
    {"id": "10000000-0000-4000-8000-000000000003", "name": "Jazz House"}
  ]},
  "genre_parents": {"saved": [
    {"parent_genre_id": "10000000-0000-4000-8000-000000000001", "child_genre_id": "10000000-0000-4000-8000-000000000003"},
    {"parent_genre_id": "10000000-0000-4000-8000-000000000002", "child_genre_id": "10000000-0000-4000-8000-000000000003"}
  ]}
}');
set constraints all immediate;

do $$
begin
    if (select count(*) from public.genre_parents) <> 2 then
        raise exception 'Multiple parents did not persist';
    end if;
    -- Direct writes must enforce cycles too, not just the RPC.
    begin
        insert into public.genre_parents (parent_genre_id, child_genre_id) values
          ('10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001');
        raise exception 'Cycle accepted';
    exception when raise_exception then
        if sqlerrm <> 'Genre parents cannot create a cycle' then raise; end if;
    end;
    begin
        insert into public.genre_parents (parent_genre_id, child_genre_id) values
          ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001');
        raise exception 'Self-parent accepted';
    exception when check_violation then null;
    end;
    begin
        insert into public.genre_parents (parent_genre_id, child_genre_id) values
          ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003');
        raise exception 'Duplicate edge accepted';
    exception when unique_violation then null;
    end;
end;
$$;

-- Validate the final graph after a batch reversal, not its temporary state.
set constraints all deferred;
insert into public.genre_parents (parent_genre_id, child_genre_id) values
  ('10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001');
delete from public.genre_parents where parent_genre_id = '10000000-0000-4000-8000-000000000001';
set constraints all immediate;

set local request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';
do $$
begin
    if exists (select 1 from public.genre_parents) then raise exception 'RLS exposed edges'; end if;
    begin
        insert into public.genre_parents (parent_genre_id, child_genre_id) values
          ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002');
        raise exception 'Cross-account edge accepted';
    exception when foreign_key_violation then null;
    end;
end;
$$;
rollback;
