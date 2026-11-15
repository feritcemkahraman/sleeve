import type { LibraryData } from "../types/library";
import { includesGenre } from "./genres.ts";

export const categoryFields = ["genres", "artists", "instruments"] as const;
export type CategoryField = (typeof categoryFields)[number];
export interface CategoryChoice {
  id: string;
  name: string;
  count: number;
}

export function categoryChoices(
  data: LibraryData,
  field: CategoryField,
  selected: readonly string[],
  query: string,
): CategoryChoice[] {
  const selection = new Set(selected);
  const search = query.trim().toLocaleLowerCase();

  return data[field]
    .filter(
      (item) =>
        !selection.has(item.id) &&
        item.name.toLocaleLowerCase().includes(search),
    )
    .map((item) => {
      const count = data.albums.filter((album) => {
        switch (field) {
          case "genres":
            return includesGenre(album, item.id, data.genres);
          case "artists":
            return album.artists.some(
              (artist) => artist.id === item.id && artist.role === "primary",
            );
          case "instruments":
            return album.instruments.some(
              (instrument) => instrument.id === item.id,
            );
        }
      }).length;
      return { id: item.id, name: item.name, count };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
