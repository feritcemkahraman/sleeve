-- Track vinyl ownership at the album level, without individual pressings.
create type public.vinyl_status as enum ('owned', 'wishlisted');

alter table public.albums add column vinyl_status public.vinyl_status;

comment on column public.albums.vinyl_status is
    'Vinyl collection status: owned, wishlisted, or null for neither.';
