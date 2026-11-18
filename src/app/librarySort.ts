import type { LibrarySort } from "../components/sortOptions.ts";
import { latest, latestRatedListen } from "../components/presentation.ts";
import type { Album } from "../types/albums.ts";

export interface LibrarySortSelection {
  category: LibrarySort;
  direction: "ascending" | "descending";
}

export function cycleLibrarySort(
  current: LibrarySortSelection | null,
  category: LibrarySort,
): LibrarySortSelection | null {
  if (current?.category !== category)
    return { category, direction: "ascending" };
  if (current.direction === "ascending")
    return { category, direction: "descending" };
  return null;
}

function sortValue(
  album: Album,
  category: LibrarySort,
): string | number | null {
  switch (category) {
    case "recent":
      return latest(album)?.listenedAt ?? null;
    case "updated":
      return album.updatedAt;
    case "title":
      return album.sortTitle || album.title;
    case "rating":
      return latestRatedListen(album)?.rating ?? null;
    case "year":
      return album.releaseYear;
  }
}

export function compareLibraryAlbums(
  a: Album,
  b: Album,
  sort: LibrarySortSelection,
): number {
  const left = sortValue(a, sort.category);
  const right = sortValue(b, sort.category);

  if (left === null && right !== null) return 1;
  if (right === null && left !== null) return -1;

  let comparison = 0;
  if (typeof left === "number" && typeof right === "number")
    comparison = left - right;
  if (typeof left === "string" && typeof right === "string")
    comparison = left.localeCompare(right);

  const direction = sort.direction === "ascending" ? 1 : -1;
  return (
    comparison * direction ||
    (a.sortTitle || a.title).localeCompare(b.sortTitle || b.title)
  );
}
