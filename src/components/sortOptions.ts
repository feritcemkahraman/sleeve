export const catalogSortOptions = [
  "albums",
  "rating",
  "recent",
  "updated",
  "name",
] as const;

export type CatalogSort = (typeof catalogSortOptions)[number];

export function isCatalogSort(value: string): value is CatalogSort {
  return catalogSortOptions.some((option) => option === value);
}

const sortLabels = {
  albums: "Most albums",
  rating: "Highest rated",
  recent: "Recently logged",
  updated: "Recently updated",
  name: "Name",
  title: "Album title",
  year: "Release year",
};

export function renderSortOptions(
  options: readonly (keyof typeof sortLabels)[],
  selected: string,
): string {
  return options
    .map(
      (value) =>
        /* HTML */ `<option
          value="${value}"
          ${value === selected ? "selected" : ""}
        >
          ${sortLabels[value]}
        </option>`,
    )
    .join("");
}
