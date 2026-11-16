-- A genre may have several broader genres. Album assignments remain explicit.
create table public.genre_parents (
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    parent_genre_id uuid not null,
    child_genre_id uuid not null,
    primary key (user_id, parent_genre_id, child_genre_id),
    foreign key (parent_genre_id, user_id) references public.genres(id, user_id) on delete cascade,
    foreign key (child_genre_id, user_id) references public.genres(id, user_id) on delete cascade,
    check (parent_genre_id <> child_genre_id)
);
create index genre_parents_parent_idx on public.genre_parents(parent_genre_id, user_id);
create index genre_parents_child_idx on public.genre_parents(child_genre_id, user_id);

insert into public.genre_parents (user_id, parent_genre_id, child_genre_id)
select user_id, parent_genre_id, id from public.genres where parent_genre_id is not null;

-- Refuse to migrate corrupt legacy data rather than silently dropping links.
do $$
begin
    if exists (
        with recursive reach as (
            select user_id, parent_genre_id as ancestor, child_genre_id as descendant from public.genre_parents
            union
            select r.user_id, r.ancestor, e.child_genre_id from reach r
            join public.genre_parents e on e.user_id = r.user_id and e.parent_genre_id = r.descendant
        ) select 1 from reach where ancestor = descendant
    ) then raise exception 'Existing genre parents contain a cycle'; end if;
end;
$$;

alter table public.genres drop column parent_genre_id;
alter table public.genre_parents enable row level security;
create policy "Users manage their own genre parents" on public.genre_parents
    for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.genre_parents from public, anon;
grant select, insert, update, delete on public.genre_parents to authenticated;

-- Direct writes use the same lock as the save RPC. READ COMMITTED ensures the
-- deferred validation sees commits made by a writer we waited for.
create function public.lock_genre_graph() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
    if current_setting('transaction_isolation') <> 'read committed' then
        raise exception 'Genre graph edits require READ COMMITTED isolation';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 517));
    return null;
end;
$$;
create trigger lock_genre_graph before insert or update or delete on public.genre_parents
    for each statement execute function public.lock_genre_graph();

create function public.validate_genre_graph() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
    if exists (
        with recursive reach as (
            select parent_genre_id as ancestor, child_genre_id as descendant
            from public.genre_parents where user_id = new.user_id
            union
            select r.ancestor, e.child_genre_id from reach r
            join public.genre_parents e on e.parent_genre_id = r.descendant
            where e.user_id = new.user_id
        ) select 1 from reach where ancestor = descendant
    ) then raise exception 'Genre parents cannot create a cycle'; end if;
    return null;
end;
$$;
create constraint trigger validate_genre_graph after insert or update on public.genre_parents
    deferrable initially deferred for each row execute function public.validate_genre_graph();
revoke all on function public.lock_genre_graph(), public.validate_genre_graph() from public, anon;

create or replace function public.save_library_changes(changes jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    result jsonb := '{}'::jsonb;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;
    -- Every save takes the same per-user graph lock, before any changes.
    perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 517));
    delete from public.genre_parents t
    using jsonb_populate_recordset(null::public.genre_parents, coalesce(changes->'genre_parents'->'deleted', '[]'::jsonb)) r
    where t.parent_genre_id = r.parent_genre_id and t.child_genre_id = r.child_genre_id;
    delete from public.listening_entries t
    using jsonb_populate_recordset(null::public.listening_entries, coalesce(changes->'listening_entries'->'deleted', '[]'::jsonb)) r
    where t.id = r.id;
    delete from public.album_links t
    using jsonb_populate_recordset(null::public.album_links, coalesce(changes->'album_links'->'deleted', '[]'::jsonb)) r
    where t.id = r.id;
    delete from public.album_instruments t
    using jsonb_populate_recordset(null::public.album_instruments, coalesce(changes->'album_instruments'->'deleted', '[]'::jsonb)) r
    where t.album_id = r.album_id and t.instrument_id = r.instrument_id;
    delete from public.album_genres t
    using jsonb_populate_recordset(null::public.album_genres, coalesce(changes->'album_genres'->'deleted', '[]'::jsonb)) r
    where t.album_id = r.album_id and t.genre_id = r.genre_id;
    delete from public.album_artists t
    using jsonb_populate_recordset(null::public.album_artists, coalesce(changes->'album_artists'->'deleted', '[]'::jsonb)) r
    where t.album_id = r.album_id and t.artist_id = r.artist_id;
    delete from public.instrument_categories t
    using jsonb_populate_recordset(null::public.instrument_categories, coalesce(changes->'instrument_categories'->'deleted', '[]'::jsonb)) r
    where t.instrument_id = r.instrument_id and t.category = r.category;
    delete from public.albums t
    using jsonb_populate_recordset(null::public.albums, coalesce(changes->'albums'->'deleted', '[]'::jsonb)) r
    where t.id = r.id;
    delete from public.instruments t
    using jsonb_populate_recordset(null::public.instruments, coalesce(changes->'instruments'->'deleted', '[]'::jsonb)) r
    where t.id = r.id;
    delete from public.genres t
    using jsonb_populate_recordset(null::public.genres, coalesce(changes->'genres'->'deleted', '[]'::jsonb)) r
    where t.id = r.id;
    delete from public.artists t
    using jsonb_populate_recordset(null::public.artists, coalesce(changes->'artists'->'deleted', '[]'::jsonb)) r
    where t.id = r.id;
    with saved as (
        insert into public.artists (id, name, sort_name, country, musicbrainz_id, photo_url, user_id)
        select r.id, r.name, r.sort_name, r.country, r.musicbrainz_id, r.photo_url, auth.uid()
        from jsonb_populate_recordset(null::public.artists, coalesce(changes->'artists'->'saved', '[]'::jsonb)) r
        on conflict (id) do update set name = excluded.name, sort_name = excluded.sort_name, country = excluded.country, musicbrainz_id = excluded.musicbrainz_id, photo_url = excluded.photo_url
        returning *
    ) select result || jsonb_build_object('artists', coalesce(jsonb_agg(to_jsonb(saved)), '[]'::jsonb)) into result from saved;
    with saved as (
        insert into public.genres (id, name, user_id)
        select r.id, r.name, auth.uid()
        from jsonb_populate_recordset(null::public.genres, coalesce(changes->'genres'->'saved', '[]'::jsonb)) r
        on conflict (id) do update set name = excluded.name
        returning *
    ) select result || jsonb_build_object('genres', coalesce(jsonb_agg(to_jsonb(saved)), '[]'::jsonb)) into result from saved;
    with saved as (
        insert into public.genre_parents (parent_genre_id, child_genre_id, user_id)
        select r.parent_genre_id, r.child_genre_id, auth.uid()
        from jsonb_populate_recordset(null::public.genre_parents, coalesce(changes->'genre_parents'->'saved', '[]'::jsonb)) r
        on conflict do nothing returning *
    ) select result || jsonb_build_object('genre_parents', coalesce(jsonb_agg(to_jsonb(saved)), '[]'::jsonb)) into result from saved;
    with saved as (
        insert into public.instruments (id, name, image_url, user_id)
        select r.id, r.name, r.image_url, auth.uid()
        from jsonb_populate_recordset(null::public.instruments, coalesce(changes->'instruments'->'saved', '[]'::jsonb)) r
        on conflict (id) do update set name = excluded.name, image_url = excluded.image_url
        returning *
    ) select result || jsonb_build_object('instruments', coalesce(jsonb_agg(to_jsonb(saved)), '[]'::jsonb)) into result from saved;
    with saved as (
        insert into public.albums (id, title, sort_title, release_year, artwork_url, musicbrainz_release_group_id, record_label, vinyl_status, user_id)
        select r.id, r.title, r.sort_title, r.release_year, r.artwork_url, r.musicbrainz_release_group_id, r.record_label, r.vinyl_status, auth.uid()
        from jsonb_populate_recordset(null::public.albums, coalesce(changes->'albums'->'saved', '[]'::jsonb)) r
        on conflict (id) do update set title = excluded.title, sort_title = excluded.sort_title, release_year = excluded.release_year, artwork_url = excluded.artwork_url, musicbrainz_release_group_id = excluded.musicbrainz_release_group_id, record_label = excluded.record_label,
            -- Older clients omit this field; explicit null clears the status.
            vinyl_status = case when exists (
                select 1
                from jsonb_array_elements(changes->'albums'->'saved') item
                where (item->>'id')::uuid = excluded.id and item ? 'vinyl_status'
            ) then excluded.vinyl_status else albums.vinyl_status end
        returning *
    ) select result || jsonb_build_object('albums', coalesce(jsonb_agg(to_jsonb(saved)), '[]'::jsonb)) into result from saved;
    with saved as (
        insert into public.instrument_categories (instrument_id, category, user_id)
        select r.instrument_id, r.category, auth.uid()
        from jsonb_populate_recordset(null::public.instrument_categories, coalesce(changes->'instrument_categories'->'saved', '[]'::jsonb)) r
        on conflict (instrument_id, category) do nothing
        returning *
    ) select result || jsonb_build_object('instrument_categories', coalesce(jsonb_agg(to_jsonb(saved)), '[]'::jsonb)) into result from saved;
    with saved as (
        insert into public.album_artists (album_id, artist_id, role, position, user_id)
        select r.album_id, r.artist_id, r.role, r.position, auth.uid()
        from jsonb_populate_recordset(null::public.album_artists, coalesce(changes->'album_artists'->'saved', '[]'::jsonb)) r
        on conflict (album_id, artist_id) do update set role = excluded.role, position = excluded.position
        returning *
    ) select result || jsonb_build_object('album_artists', coalesce(jsonb_agg(to_jsonb(saved)), '[]'::jsonb)) into result from saved;
    with saved as (
        insert into public.album_genres (album_id, genre_id, is_primary, user_id)
        select r.album_id, r.genre_id, r.is_primary, auth.uid()
        from jsonb_populate_recordset(null::public.album_genres, coalesce(changes->'album_genres'->'saved', '[]'::jsonb)) r
        on conflict (album_id, genre_id) do update set is_primary = excluded.is_primary
        returning *
    ) select result || jsonb_build_object('album_genres', coalesce(jsonb_agg(to_jsonb(saved)), '[]'::jsonb)) into result from saved;
    with saved as (
        insert into public.album_instruments (album_id, instrument_id, notes, user_id)
        select r.album_id, r.instrument_id, r.notes, auth.uid()
        from jsonb_populate_recordset(null::public.album_instruments, coalesce(changes->'album_instruments'->'saved', '[]'::jsonb)) r
        on conflict (album_id, instrument_id) do update set notes = excluded.notes
        returning *
    ) select result || jsonb_build_object('album_instruments', coalesce(jsonb_agg(to_jsonb(saved)), '[]'::jsonb)) into result from saved;
    with saved as (
        insert into public.album_links (id, album_id, url, label, user_id)
        select r.id, r.album_id, r.url, r.label, auth.uid()
        from jsonb_populate_recordset(null::public.album_links, coalesce(changes->'album_links'->'saved', '[]'::jsonb)) r
        on conflict (id) do update set album_id = excluded.album_id, url = excluded.url, label = excluded.label
        returning *
    ) select result || jsonb_build_object('album_links', coalesce(jsonb_agg(to_jsonb(saved)), '[]'::jsonb)) into result from saved;
    with saved as (
        insert into public.listening_entries (id, album_id, rating, listened_at, notes, user_id)
        select r.id, r.album_id, r.rating, r.listened_at, r.notes, auth.uid()
        from jsonb_populate_recordset(null::public.listening_entries, coalesce(changes->'listening_entries'->'saved', '[]'::jsonb)) r
        on conflict (id) do update set album_id = excluded.album_id, rating = excluded.rating, listened_at = excluded.listened_at, notes = excluded.notes
        returning *
    ) select result || jsonb_build_object('listening_entries', coalesce(jsonb_agg(to_jsonb(saved)), '[]'::jsonb)) into result from saved;
    -- Related edits also change the album's last-modified time.
    with touched as (
        update public.albums a set updated_at = now()
        where a.id in (
            select (entry->>'album_id')::uuid
            from jsonb_each(changes) change
            cross join lateral jsonb_array_elements(
                coalesce(change.value->'saved', '[]'::jsonb) ||
                coalesce(change.value->'deleted', '[]'::jsonb)
            ) entry
            where change.key in ('album_artists', 'album_genres',
                'album_instruments', 'album_links', 'listening_entries')
        )
        returning a.*
    ) select jsonb_set(result, '{albums}',
        (result->'albums') || coalesce(jsonb_agg(to_jsonb(touched)), '[]'::jsonb))
      into result from touched;

    return result;
end;
$$;
revoke all on function public.save_library_changes(jsonb) from public, anon;
grant execute on function public.save_library_changes(jsonb) to authenticated;
