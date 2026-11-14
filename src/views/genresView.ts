import { renderCatalogHeading } from "../components/catalogHeading";
import { renderCatalogFilters } from "../components/catalogFilters";
import type { Album, Genre } from "../types/albums";
import { escapeHtml as e } from "../components/html";
import { ancestors, genreUrl, includesGenre } from "../app/genres";
import { renderAlbumListHeading } from "../components/albumListHeading";
import { renderAlbumGrid } from "../components/albumGrid";
function renderGenreLeaf(genre: Genre, count: number): string {
  return /* HTML */ `<a class="genre-leaf-link" href="${genreUrl(genre.id)}"
    ><span>${e(genre.name)}</span><span class="muted">${count} albums</span></a
  >`;
}

function renderGenreTree(
  parent: string | null,
  genres: Genre[],
  counts: Map<string, number>,
): string {
  return /* HTML */ `<ul>
    ${genres
      .filter((genre) => genre.parentGenreId === parent)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(
        (genre) =>
          /* HTML */ `<li class="genre-tree-item">
            ${
              genres.some((child) => child.parentGenreId === genre.id)
                ? /* HTML */ `<details>
                    <summary>
                      <span class="genre-toggle-label"
                        ><span>${e(genre.name)}</span
                        ><span class="muted"
                          >${counts.get(genre.id) ?? 0} albums</span
                        ></span
                      ><a
                        class="genre-view-link"
                        href="${genreUrl(genre.id)}"
                        aria-label="View ${e(genre.name)} details"
                        >View <span aria-hidden="true">↗</span></a
                      >
                    </summary>
                    ${renderGenreTree(genre.id, genres, counts)}
                  </details>`
                : renderGenreLeaf(genre, counts.get(genre.id) ?? 0)
            }
          </li>`,
      )
      .join("")}
  </ul>`;
}

function renderAlphabeticalGenres(
  results: Genre[],
  genres: Genre[],
  counts: Map<string, number>,
): string {
  return /* HTML */ `<ul>
    ${results
      .map(
        (genre) =>
          /* HTML */ `<li>
            ${renderGenreLeaf(genre, counts.get(genre.id) ?? 0)}
            <p class="muted">
              ${ancestors(genre.id, genres)
                .map((parent) => e(parent.name))
                .join(" › ")}
            </p>
          </li>`,
      )
      .join("")}
  </ul>`;
}

export function renderGenresView(
  genres: Genre[],
  albums: Album[],
  query: string,
  alphabetical: boolean,
  unused: boolean,
): string {
  const counts = new Map(
    genres.map((genre) => [
      genre.id,
      albums.filter((album) => includesGenre(album, genre.id, genres)).length,
    ]),
  );
  const results = genres
    .filter(
      (genre) =>
        genre.name.toLowerCase().includes(query.toLowerCase()) &&
        (!unused ||
          !albums.some((album) =>
            album.genres.some((assigned) => assigned.id === genre.id),
          )),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  return /* HTML */ `<section class="instrument-page catalog-page genres-page">
    ${renderCatalogHeading("Genres", "genre")}
    <div class="instrument-toolbar genre-toolbar">
      <label class="search-field"
        ><span class="sr-only">Search genres</span
        ><input
          id="genres-search"
          type="search"
          placeholder="Find a genre…"
          value="${e(query)}" /></label
      >${renderCatalogFilters(/* HTML */ `<label><input id="genres-alphabetical" type="checkbox" ${alphabetical ? "checked" : ""} /> Alphabetical view</label><label><input id="genres-unused" type="checkbox" ${unused ? "checked" : ""} /> Unused only</label>`, Number(alphabetical) + Number(unused))}
    </div>
    <div class="genre-tree">
      ${
        query || alphabetical || unused
          ? renderAlphabeticalGenres(results, genres, counts)
          : renderGenreTree(null, genres, counts)
      }${!results.length ? /* HTML */ `<p class="muted">No matching genres. Add one here or while editing an album.</p>` : ""}
    </div>
  </section>`;
}
export function renderGenreDetail(
  genre: Genre,
  genres: Genre[],
  albums: Album[],
  layout = "grid",
): string {
  const used = albums.filter((album) => includesGenre(album, genre.id, genres));
  const children = genres.filter((child) => child.parentGenreId === genre.id);
  const direct = albums.some((album) =>
    album.genres.some((assigned) => assigned.id === genre.id),
  );
  return /* HTML */ `<section class="instrument-page genre-detail">
    <a class="back-link" href="#genres">Back to genres</a>
    <p class="genre-breadcrumb">
      ${ancestors(genre.id, genres)
        .map(
          (parent) =>
            /* HTML */ `<a href="${genreUrl(parent.id)}">${e(parent.name)}</a>`,
        )
        .join(" › ")}
    </p>
    <div class="instrument-page-heading">
      <h1 id="page-title">${e(genre.name)}</h1>
      <button class="button secondary" data-action="edit-catalog-genre">
        Edit genre
      </button>
    </div>
    ${
      children.length
        ? /* HTML */ `<section
            class="genre-subgenres"
            aria-labelledby="subgenres-title"
          >
            <h2 id="subgenres-title">Subgenres</h2>
            <div class="tags">
              ${children.map((child) => /* HTML */ `<a class="chip" href="${genreUrl(child.id)}">${e(child.name)}</a>`).join("")}
            </div>
          </section>`
        : ""
    }
    <section class="genre-albums" aria-labelledby="genre-albums-title">
      ${renderAlbumListHeading("Albums", used.length, layout, "genre-layout", "genre-albums-title")}
      ${used.length ? renderAlbumGrid(used, layout) : /* HTML */ `<p>No albums yet.</p>`}
    </section>
    <div class="instrument-delete">
      <button
        class="button secondary danger"
        data-action="delete-catalog-genre"
        ${direct || children.length ? "disabled" : ""}
      >
        Delete genre
      </button>
      <p class="muted">
        Remove direct album assignments and reassign child genres before
        deleting.
      </p>
    </div>
  </section>`;
}
