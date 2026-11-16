import type { QueryData } from "@supabase/supabase-js";
import { readAll } from "./readAll";
import { supabase } from "./supabase";
import type { Album } from "../types/albums";
import { mapAlbum } from "./albumMapper";

const ALBUM_SELECT = `
    id,
    title,
    sort_title,
    record_label,
    vinyl_status,
    release_year,
    artwork_url,
    musicbrainz_release_group_id,
    created_at,
    updated_at,
    album_artists (
        role,
        position,
        artists (
            id,
            musicbrainz_id,
            name,
            sort_name,
            country,
            photo_url
        )
    ),
    album_genres (
        is_primary,
        genres (
            id,
            name,
            genre_parents!genre_parents_child_genre_id_user_id_fkey(parent_genre_id)
        )
    ),
    album_instruments (
        notes,
        instruments (
            id,
            name,
            image_url,
            instrument_categories (
                category
            )
        )
    ),
    album_links (
        id,
        url,
        label
    ),
    listening_entries (
        id,
        rating,
        listened_at,
        notes,
        created_at,
        updated_at
    )
`;

// Build a fresh query for each read so concurrent callers cannot share URL state.
function selectAlbums() {
  return supabase.from("albums").select(ALBUM_SELECT);
}

export type AlbumQueryRow = QueryData<ReturnType<typeof selectAlbums>>[number];

// Retrieve the current user's albums with their related records.
export async function getAlbums(): Promise<Album[]> {
  const data = await readAll((from, to) =>
    selectAlbums()
      .order("sort_title", { ascending: true })
      .order("title", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );

  return data.map(mapAlbum);
}
