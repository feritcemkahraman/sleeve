import type { LibrarySortSelection } from "../app/librarySort";
import { icon } from "./icons.ts";

export const librarySortOptions = [
  "recent",
  "updated",
  "title",
  "rating",
  "year",
] as const;
export type LibrarySort = (typeof librarySortOptions)[number];

export function isLibrarySort(value: string): value is LibrarySort {
  return librarySortOptions.some((option) => option === value);
}

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

const librarySortLabels: Record<LibrarySort, string> = {
  recent: "Last logged",
  updated: "Last updated",
  title: "Album title",
  rating: "Rating",
  year: "Release year",
};

export function renderLibrarySortChoices(
  selected: LibrarySortSelection | null,
): string {
  const nextActions = {
    ascending: "Sort descending",
    descending: "Turn off sorting",
    off: "Sort ascending",
  };
  const choices = librarySortOptions
    .map((value) => {
      const direction =
        selected?.category === value ? selected.direction : null;
      return /* HTML */ `<button
        type="button"
        class="library-sort-choice"
        data-action="library-sort"
        data-sort="${value}"
        aria-pressed="${direction !== null}"
        aria-label="${librarySortLabels[value]}, ${direction ?? "off"}"
        title="${nextActions[direction ?? "off"]}"
      >
        <span>${librarySortLabels[value]}</span>
        <span
          class="library-sort-direction ${direction ?? ""}"
          aria-hidden="true"
          >${direction ? icon("arrow", 14) : ""}</span
        >
      </button>`;
    })
    .join("");
  return /* HTML */ `<p class="library-sort-hint">Sort</p>
    ${choices}`;
}

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
