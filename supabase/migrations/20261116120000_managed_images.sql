-- Optimized catalog images are publicly readable; only the Worker writes objects.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('library-images', 'library-images', true, 100000, array['image/webp'])
on conflict (id) do update set public = excluded.public,
    file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table public.image_assets (
    id uuid primary key,
    -- Retain metadata after account deletion so scheduled cleanup removes objects.
    user_id uuid references auth.users(id) on delete set null,
    storage_path text not null unique,
    public_url text not null unique,
    source_url text not null,
    byte_size integer not null check (byte_size between 1 and 100000),
    width integer not null check (width between 1 and 768),
    height integer not null check (height between 1 and 768),
    pipeline_version integer not null,
    created_at timestamptz not null default now(),
    last_used_at timestamptz not null default now(),
    deleting_at timestamptz,
    ready_at timestamptz,
    check (storage_path = user_id::text || '/' || id::text || '.webp')
);
create index image_assets_owner_version_idx on public.image_assets (user_id, pipeline_version)
    where deleting_at is null;

alter table public.image_assets enable row level security;
create policy "Users can inspect their own image metadata" on public.image_assets
    for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.image_assets from anon, authenticated;
grant select on public.image_assets to authenticated;
grant all on public.image_assets to service_role;
-- Deliberately no client INSERT/UPDATE/DELETE policies on storage.objects.
-- Public bucket downloads do not require a SELECT policy.

-- Existing external URLs remain valid until explicitly replaced/migrated. New
-- selections must be an owned, ready asset. Row locks coordinate with cleanup.
create function public.validate_image_reference()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
    image_url text;
    old_url text;
    asset_id uuid;
begin
    image_url := to_jsonb(new)->>tg_argv[0];
    if tg_op = 'UPDATE' then
        old_url := to_jsonb(old)->>tg_argv[0];
        if image_url is not distinct from old_url then return new; end if;
    end if;
    if image_url is null then return new; end if;
    -- BEFORE INSERT also runs on the INSERT side of an upsert. Preserve an
    -- existing legacy URL there; the UPDATE trigger validates any actual change.
    if tg_op = 'INSERT' then
        case tg_table_name
            when 'albums' then select artwork_url into old_url from public.albums where id = new.id and user_id = new.user_id;
            when 'artists' then select photo_url into old_url from public.artists where id = new.id and user_id = new.user_id;
            when 'instruments' then select i.image_url into old_url from public.instruments i where i.id = new.id and i.user_id = new.user_id;
        end case;
        if image_url is not distinct from old_url then return new; end if;
    end if;

    select id into asset_id from public.image_assets
    where public_url = image_url and user_id = new.user_id and deleting_at is null and ready_at is not null
    for share;
    if asset_id is null then
        raise exception 'Import the image before saving it, or clear the image field.';
    end if;
    return new;
end;
$$;
revoke all on function public.validate_image_reference() from public, anon, authenticated;
create trigger validate_album_image before insert or update of artwork_url on public.albums
    for each row execute function public.validate_image_reference('artwork_url');
create trigger validate_artist_image before insert or update of photo_url on public.artists
    for each row execute function public.validate_image_reference('photo_url');
create trigger validate_instrument_image before insert or update of image_url on public.instruments
    for each row execute function public.validate_image_reference('image_url');

-- Claim before deleting remote objects. Claimed assets can no longer be attached
-- or reused; failed Storage deletions are retried by the next scheduled run.
create function public.claim_unused_image_assets()
returns table(id uuid, storage_path text)
language plpgsql security definer set search_path = '' as $$
declare
    asset public.image_assets;
    claimed integer := 0;
begin
    for asset in select a.* from public.image_assets a
        where a.deleting_at is not null or (
            a.last_used_at < now() - interval '7 days'
            and not exists (select 1 from public.albums where artwork_url = a.public_url)
            and not exists (select 1 from public.artists where photo_url = a.public_url)
            and not exists (select 1 from public.instruments where image_url = a.public_url)
        )
        order by a.created_at limit 500 for update skip locked
    loop
        -- A fresh statement after acquiring the lock sees any just-committed save.
        if not exists (select 1 from public.albums where artwork_url = asset.public_url)
            and not exists (select 1 from public.artists where photo_url = asset.public_url)
            and not exists (select 1 from public.instruments where image_url = asset.public_url) then
            update public.image_assets a set deleting_at = coalesce(a.deleting_at, now()) where a.id = asset.id;
            id := asset.id;
            storage_path := asset.storage_path;
            return next;
            claimed := claimed + 1;
            if claimed >= 100 then return; end if;
        end if;
    end loop;
end;
$$;
revoke all on function public.claim_unused_image_assets() from public, anon, authenticated;
grant execute on function public.claim_unused_image_assets() to service_role;

create index albums_artwork_url_idx on public.albums (artwork_url) where artwork_url is not null;
create index artists_photo_url_idx on public.artists (photo_url) where photo_url is not null;
create index instruments_image_url_idx on public.instruments (image_url) where image_url is not null;
