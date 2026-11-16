import type { Album, AlbumGenre, Genre } from "../types/albums";

export const genreUrl = (id: string): string =>
  `#genre/${encodeURIComponent(id)}`;

export function ancestors(id: string, genres: Genre[]): Genre[] {
  const result: Genre[] = [];
  const catalog = new Map(genres.map((genre) => [genre.id, genre]));
  const seen = new Set([id]);
  const pending = [...(catalog.get(id)?.parentGenreIds ?? [])];

  while (pending.length) {
    const parentId = pending.pop()!;
    if (seen.has(parentId)) continue;
    seen.add(parentId);

    const parent = catalog.get(parentId);
    if (!parent) continue;
    result.push(parent);
    pending.push(...parent.parentGenreIds);
  }

  return result;
}

// Keep separate paths through shared ancestors: a DAG has no single breadcrumb.
export function genrePaths(id: string, genres: Genre[]): Genre[][] {
  const catalog = new Map(genres.map((genre) => [genre.id, genre]));
  const genre = catalog.get(id);
  if (!genre) return [];

  const paths: Genre[][] = [];
  const pending: Genre[][] = [[genre]];
  while (pending.length) {
    const path = pending.pop()!;
    const first = path[0]!;
    if (!first.parentGenreIds.length) {
      paths.push(path);
      continue;
    }

    for (const parentId of new Set(first.parentGenreIds)) {
      const parent = catalog.get(parentId);
      if (parent && !path.some((item) => item.id === parentId))
        pending.push([parent, ...path]);
    }
  }

  return paths.sort((a, b) =>
    a
      .map((item) => item.name)
      .join(" › ")
      .localeCompare(b.map((item) => item.name).join(" › ")),
  );
}

// Multi-source breadth-first search gives every reachable genre its shortest
// distance from any root in O(genres + parent links) time.
export function genreDepths(genres: Genre[]): Map<string, number> {
  const children = new Map<string, string[]>();
  const depths = new Map<string, number>();
  const queue: string[] = [];

  for (const genre of genres) {
    if (!genre.parentGenreIds.length) {
      depths.set(genre.id, 0);
      queue.push(genre.id);
    }
    for (const parentId of genre.parentGenreIds) {
      const siblings = children.get(parentId) ?? [];
      siblings.push(genre.id);
      children.set(parentId, siblings);
    }
  }

  for (let index = 0; index < queue.length; index++) {
    const parentId = queue[index]!;
    for (const childId of children.get(parentId) ?? []) {
      if (depths.has(childId)) continue;
      depths.set(childId, depths.get(parentId)! + 1);
      queue.push(childId);
    }
  }

  return depths;
}

export const includesGenre = (
  album: Album,
  id: string,
  genres: Genre[],
): boolean =>
  album.genres.some(
    (g) => g.id === id || ancestors(g.id, genres).some((p) => p.id === id),
  );

export function normalizeGenres(
  selected: AlbumGenre[],
  genres: Genre[],
): AlbumGenre[] {
  const unique = [
    ...new Map(selected.map((genre) => [genre.id, genre])).values(),
  ];
  const catalog = new Map(genres.map((genre) => [genre.id, genre]));
  const primaryId = unique.find((genre) => genre.isPrimary)?.id;

  return unique.map((genre) => ({
    ...(catalog.get(genre.id) ?? genre),
    parentGenreIds: [
      ...(catalog.get(genre.id)?.parentGenreIds ?? genre.parentGenreIds ?? []),
    ],
    isPrimary: genre.id === primaryId,
  }));
}

export function syncAlbumGenres(albums: Album[], genres: Genre[]): void {
  for (const album of albums)
    album.genres = normalizeGenres(album.genres, genres);
}

type LegacyGenre = Omit<Genre, "parentGenreIds"> & {
  parentGenreId?: string | null;
  parentGenreIds?: string[];
};

// Upgrade persisted trees at the read boundary; an explicit empty array stays empty.
export function upgradeGenre(genre: LegacyGenre): Genre {
  const { parentGenreId, ...rest } = genre;
  let parents = genre.parentGenreIds;
  if (!Array.isArray(parents))
    parents = typeof parentGenreId === "string" ? [parentGenreId] : [];

  return {
    ...rest,
    parentGenreIds: [
      ...new Set(parents.filter((id) => typeof id === "string")),
    ],
  };
}
