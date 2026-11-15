import type { Album } from "../types/albums";
import type { AlbumQueryRow } from "./albums";

// Convert a joined database row into the application-level album shape.
export function mapAlbum(row: AlbumQueryRow): Album {
  const artists = row.album_artists
    .flatMap((entry) =>
      entry.artists ? [{ entry, artist: entry.artists }] : [],
    )
    .sort((a, b) => a.entry.position - b.entry.position)
    .map(({ entry, artist }) => ({
      id: artist.id,
      musicbrainzId: artist.musicbrainz_id,
      name: artist.name,
      sortName: artist.sort_name,
      country: artist.country,
      photoUrl: artist.photo_url,
      role: entry.role,
      position: entry.position,
    }));

  const genres = row.album_genres
    .flatMap((entry) => (entry.genres ? [{ entry, genre: entry.genres }] : []))
    .sort(
      (a, b) =>
        Number(b.entry.is_primary) - Number(a.entry.is_primary) ||
        a.genre.name.localeCompare(b.genre.name),
    )
    .map(({ entry, genre }) => ({
      id: genre.id,
      name: genre.name,
      parentGenreId: genre.parent_genre_id,
      isPrimary: entry.is_primary,
    }));

  const instruments = row.album_instruments
    .flatMap((entry) =>
      entry.instruments ? [{ entry, instrument: entry.instruments }] : [],
    )
    .sort((a, b) => a.instrument.name.localeCompare(b.instrument.name))
    .map(({ entry, instrument }) => ({
      id: instrument.id,
      name: instrument.name,
      imageUrl: instrument.image_url,
      notes: entry.notes,
      categories: instrument.instrument_categories.map(
        (category) => category.category,
      ),
    }));

  const links = row.album_links.map((link) => ({
    id: link.id,
    url: link.url,
    label: link.label,
  }));

  const listeningEntries = [...row.listening_entries]
    .sort((a, b) => Date.parse(b.listened_at) - Date.parse(a.listened_at))
    .map((entry) => ({
      id: entry.id,
      rating: entry.rating,
      listenedAt: entry.listened_at,
      notes: entry.notes,
      createdAt: entry.created_at,
      updatedAt: entry.updated_at,
    }));

  return {
    id: row.id,
    title: row.title,
    sortTitle: row.sort_title,
    recordLabel: row.record_label ?? undefined,
    vinylStatus: row.vinyl_status,
    releaseYear: row.release_year,
    artworkUrl: row.artwork_url,
    musicbrainzReleaseGroupId: row.musicbrainz_release_group_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    artists,
    genres,
    instruments,
    links,
    listeningEntries,
  };
}
