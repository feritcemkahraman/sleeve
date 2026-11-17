import type { LibraryData } from "../types/library";

export type ImageImporter = (url: string) => Promise<string>;

// Import changed selections only. Existing external URLs are handled by the
// explicit, resumable migration rather than blocking unrelated library edits.
export async function importLibraryImages(
  before: LibraryData,
  candidate: LibraryData,
  importImage: ImageImporter,
): Promise<LibraryData> {
  const next = structuredClone(candidate);
  const imported = new Map<string, string>();
  const resolve = async (
    url: string | null | undefined,
    previous: string | null | undefined,
  ) => {
    if (!url || url === previous) return url;
    const cached = imported.get(url);
    if (cached) return cached;
    const managed = await importImage(url);
    imported.set(url, managed);
    return managed;
  };

  const albums = new Map(before.albums.map((item) => [item.id, item]));
  const artists = new Map(before.artists.map((item) => [item.id, item]));
  const instruments = new Map(
    before.instruments.map((item) => [item.id, item]),
  );
  for (const album of next.albums)
    album.artworkUrl =
      (await resolve(album.artworkUrl, albums.get(album.id)?.artworkUrl)) ??
      null;
  for (const artist of next.artists)
    artist.photoUrl = await resolve(
      artist.photoUrl,
      artists.get(artist.id)?.photoUrl,
    );
  for (const instrument of next.instruments)
    instrument.imageUrl = await resolve(
      instrument.imageUrl,
      instruments.get(instrument.id)?.imageUrl,
    );

  // Album associations embed catalog snapshots in the client model.
  const currentArtists = new Map(next.artists.map((item) => [item.id, item]));
  const currentInstruments = new Map(
    next.instruments.map((item) => [item.id, item]),
  );
  for (const album of next.albums) {
    for (const artist of album.artists)
      artist.photoUrl = currentArtists.get(artist.id)?.photoUrl ?? null;
    for (const instrument of album.instruments)
      instrument.imageUrl =
        currentInstruments.get(instrument.id)?.imageUrl ?? null;
  }
  return next;
}
