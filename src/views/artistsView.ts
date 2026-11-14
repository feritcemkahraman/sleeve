import type { CatalogSort } from "../components/sortOptions";
import {
  catalogImage,
  catalogSummary,
  catalogSort,
  catalogStats,
  renderCatalogSummary,
  type CatalogStats,
  compareCatalog,
} from "../components/catalogSummary";
import { renderAlbumListHeading } from "../components/albumListHeading";
import { renderCatalogHeading } from "../components/catalogHeading";
import { renderCatalogFilters } from "../components/catalogFilters";
import type { Album, Artist } from "../types/albums";
import { escapeHtml as e } from "../components/html";
import { icon } from "../components/icons";
import { renderAlbumGrid } from "../components/albumGrid";
import { matches } from "../app/search";

export const artistUrl = (id: string): string =>
  `#artist/${encodeURIComponent(id)}`;
export const artistAlbums = (albums: Album[], id: string): Album[] =>
  albums.filter((album) => album.artists.some((artist) => artist.id === id));
export const artistRoles = ["primary", "featured", "other"] as const;
export const roleLabel = (role: string): string =>
  role.charAt(0).toUpperCase() + role.slice(1);

export function renderArtistsView(
  query: string,
  unused: boolean,
  sort: CatalogSort = "updated",
  primary = false,
): string {
  return /* HTML */ `<section
    class="instrument-page catalog-page"
    aria-labelledby="page-title"
  >
    ${renderCatalogHeading("Artists", "artist")}
    <div class="instrument-toolbar genre-toolbar">
      <label class="search-field"
        >${icon("search")}<span class="sr-only">Search artists</span
        ><input
          id="artists-search"
          type="search"
          placeholder="Find an artist…"
          value="${e(query)}" /></label
      >${renderCatalogFilters(/* HTML */ `${catalogSort("artists-sort", sort)}<label><input id="artists-unused" type="checkbox" ${unused ? "checked" : ""} /> Unused only</label><label><input id="artists-primary" type="checkbox" ${primary ? "checked" : ""} /> Primary artist only</label>`, Number(unused) + Number(primary))}
    </div>
    <p id="artists-count" class="result-count" role="status"></p>
    <div id="artists-list"></div>
  </section>`;
}
export function updateArtistsView(
  artists: Artist[],
  albums: Album[],
  query: string,
  unused: boolean,
  root: ParentNode = document,
  sort: CatalogSort = "updated",
  primary = false,
): void {
  const results = artists
    .map((item) => {
      const used = artistAlbums(albums, item.id).filter(
        (album) =>
          !primary ||
          album.artists.some(
            (artist) => artist.id === item.id && artist.role === "primary",
          ),
      );
      return { item, stats: catalogStats(used) };
    })
    .filter(
      ({ item, stats }) =>
        matches(query, item.name, item.sortName ?? "", item.country ?? "") &&
        (!unused || !stats.count),
    )
    .sort(
      (a, b) =>
        compareCatalog(a.stats, b.stats, sort) ||
        (a.item.sortName || a.item.name).localeCompare(
          b.item.sortName || b.item.name,
        ),
    );
  root.querySelector("#artists-count")!.textContent =
    `${results.length} ${results.length === 1 ? "artist" : "artists"}`;
  root.querySelector("#artists-list")!.innerHTML = results.length
    ? /* HTML */ `<ul class="instrument-catalog-list">
        ${results.map(({ item, stats }) => renderArtistRow(item, stats)).join("")}
      </ul>`
    : renderArtistEmpty(Boolean(artists.length));
}
function renderArtistRow(item: Artist, stats: CatalogStats): string {
  return /* HTML */ `<li>
    <a class="instrument-catalog-row" href="${artistUrl(item.id)}"
      >${catalogImage(item.name, item.photoUrl, true)}<span
        class="catalog-card-content"
        ><span class="instrument-row-info"
          ><span
            ><strong>${e(item.name)}</strong
            >${item.country ? /* HTML */ ` <em class="artist-country">(${e(item.country)})</em>` : ""}</span
          ></span
        >${renderCatalogSummary(stats)}</span
      >${icon("chevron", 18)}</a
    >
  </li>`;
}

function renderArtistEmpty(hasItems: boolean): string {
  return /* HTML */ `<div class="empty">
    <h2>${hasItems ? "No matching artists" : "Start your artist catalog"}</h2>
    <p>Add an artist here or while editing an album.</p>
    ${hasItems ? /* HTML */ `<button class="button secondary" data-action="clear-artist-filters">Clear filters</button>` : ""}
  </div>`;
}

export function renderArtistDetail(
  item: Artist,
  albums: Album[],
  layout = "grid",
): string {
  const used = artistAlbums(albums, item.id).sort(
    (a, b) =>
      (a.releaseYear ?? Infinity) - (b.releaseYear ?? Infinity) ||
      (a.sortTitle || a.title).localeCompare(b.sortTitle || b.title),
  );
  return /* HTML */ `<section
    class="instrument-page"
    aria-labelledby="page-title"
  >
    <a class="back-link" href="#artists">${icon("back", 17)} Back to artists</a>
    <div class="artist-page-heading">
      <div class="artist-title-row">
        <h1 id="page-title">${e(item.name)}</h1>
        <button class="button secondary" data-action="edit-catalog-artist">
          ${icon("edit", 16)} Edit artist
        </button>
      </div>
      <div class="catalog-detail-summary">
        ${catalogImage(item.name, item.photoUrl, true)}${catalogSummary(used)}
      </div>
      <div class="artist-details">
        <p class="muted">
          ${item.country ? `Country: ${e(item.country)}` : ""}
        </p>
      </div>
    </div>
    <section class="instrument-albums">
      ${renderAlbumListHeading("Album credits", used.length, layout, "artist-layout")}
      ${
        used.length
          ? renderAlbumGrid(used, layout)
          : /* HTML */ `<div class="empty detail-empty">
              <h3>No album credits yet</h3>
              <p>
                This artist stays in your catalog until you use or delete it.
              </p>
            </div>`
      }
    </section>
    <div class="instrument-delete">
      <button
        class="button secondary danger"
        data-action="delete-catalog-artist"
        ${used.length ? 'disabled aria-describedby="artist-delete-help"' : ""}
      >
        Delete artist
      </button>
      <p id="artist-delete-help" class="muted">
        ${used.length ? "Remove this artist from its albums before deleting it." : "Unused artists can be deleted from your catalog."}
      </p>
    </div>
  </section>`;
}
