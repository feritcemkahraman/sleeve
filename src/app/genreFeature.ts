import type { EditorDialog, PickerInteraction } from "./editorContracts";
import { renderGenresView } from "../views/genresView";
import type { DraftTarget } from "./editorDrafts";
import type { LibraryData } from "../types/library";
import { field } from "../components/formFields";
import { makeId } from "./id";
import { ancestors, genreUrl, normalizeGenres } from "./genres";
import type { Genre, AlbumGenre } from "../types/albums";
import { icon } from "../components/icons";
import { escapeHtml } from "../components/html";
import { matches } from "./search";
import { focusForTyping } from "./device";

export interface GenrePickerSnapshot {
  selectedGenres: AlbumGenre[];
  genreChoices: Genre[];
}

export interface GenreFeatureDependencies {
  dialog: EditorDialog;
  drafts: { begin: (target: DraftTarget) => boolean };
  persistence: {
    finishCatalogSave: (message: string, destination: string) => Promise<void>;
  };
  picker: PickerInteraction;
  library: {
    readonly albums: LibraryData["albums"];
    genres: LibraryData["genres"];
  };
  navigation: {
    main: HTMLElement;
    announce: (message: string) => void;
    renderRoute: (focus?: boolean) => void;
    updateCatalogFilters: (id: string) => void;
  };
}

function renderGenreForm(genres: Genre[], item?: Genre): string {
  return /* HTML */ `<form
    id="catalog-genre-form"
    data-id="${escapeHtml(item?.id ?? "")}"
  >
    <div class="dialog-body">
      ${field("Genre name", "genreName", item?.name ?? "", { attributes: 'required maxlength="80"' })}<label
        class="field"
        ><span>Parent genre (optional)</span
        ><select name="parentGenreId">
          <option value="">No parent</option>
          ${genres
            .filter(
              (g) =>
                g.id !== item?.id &&
                !ancestors(g.id, genres).some((p) => p.id === item?.id),
            )
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(
              (g) =>
                /* HTML */ `<option
                  value="${escapeHtml(g.id)}"
                  ${g.id === item?.parentGenreId ? "selected" : ""}
                >
                  ${escapeHtml([...ancestors(g.id, genres), g].map((p) => p.name).join(" › "))}
                </option>`,
            )
            .join("")}
        </select></label
      >
      <p id="form-error" class="form-error" role="alert" hidden></p>
    </div>
    <div class="dialog-footer">
      <button type="button" class="button secondary" data-action="close">
        Cancel</button
      ><button class="button primary" type="submit">Save genre</button>
    </div>
  </form>`;
}

function readGenreForm(
  form: HTMLFormElement,
  genres: Genre[],
  formError: EditorDialog["formError"],
): Genre | void {
  const data = new FormData(form);
  const input = form.querySelector<HTMLInputElement>('[name="genreName"]')!;
  const name = input.value.trim();
  const id = form.dataset.id || makeId();
  const parentGenreId = String(data.get("parentGenreId") || "") || null;

  if (
    !name ||
    genres.some(
      (g) => g.id !== id && g.name.toLowerCase() === name.toLowerCase(),
    )
  )
    return formError("Enter a unique genre name.", input);
  if (
    parentGenreId &&
    (parentGenreId === id ||
      ancestors(parentGenreId, genres).some((g) => g.id === id))
  )
    return formError("Choose a parent that does not create a cycle.", input);

  return { id, name, parentGenreId };
}

export class GenreFeature {
  private readonly dependencies: GenreFeatureDependencies;
  private selectedGenres: AlbumGenre[] = [];
  private genreChoices: Genre[] = [];
  private genreQuery = "";
  private genreAlphabetical = false;
  private genreUnused = false;

  constructor(dependencies: GenreFeatureDependencies) {
    this.dependencies = dependencies;
  }

  public get selections(): AlbumGenre[] {
    return this.selectedGenres;
  }

  public get choices(): Genre[] {
    return this.genreChoices;
  }

  public snapshotPicker(): GenrePickerSnapshot {
    return structuredClone({
      selectedGenres: this.selectedGenres,
      genreChoices: this.genreChoices,
    });
  }

  public restorePicker(snapshot: GenrePickerSnapshot): void {
    this.selectedGenres = structuredClone(snapshot.selectedGenres);
    this.genreChoices = structuredClone(snapshot.genreChoices);
  }

  public openCatalogGenre(item?: Genre): void {
    if (!this.dependencies.drafts.begin({ kind: "genre", item })) return;

    this.dependencies.dialog.show(
      item ? "Edit genre" : "Add genre",
      renderGenreForm(this.dependencies.library.genres, item),
      '[name="genreName"]',
    );
  }

  public genrePicker(
    selected: AlbumGenre[],
    renderSuggestions: () => string = () => "",
  ): string {
    this.genreChoices = structuredClone(this.dependencies.library.genres);
    this.selectedGenres = normalizeGenres(
      selected.map((g) => ({
        ...g,
        id:
          this.dependencies.library.genres.find(
            (c) => c.name.toLowerCase() === g.name.toLowerCase(),
          )?.id ?? g.id,
      })),
      [
        ...this.genreChoices,
        ...selected.filter(
          (g) => !this.genreChoices.some((c) => c.id === g.id),
        ),
      ],
    );
    for (const g of this.selectedGenres)
      if (!this.genreChoices.some((c) => c.id === g.id))
        this.genreChoices.push({
          id: g.id,
          name: g.name,
          parentGenreId: g.parentGenreId,
        });

    return /* HTML */ `<div class="instrument-picker">
      <label class="field" for="genre-query"
        ><span>Genres <span class="muted">(optional)</span></span></label
      >
      <div id="genre-selected" aria-live="polite"></div>
      ${renderSuggestions()}
      <div class="catalog-search">
        <input
          id="genre-query"
          type="search"
          maxlength="80"
          autocomplete="off"
          placeholder="Search or create a genre…"
          aria-controls="genre-results"
        />
        <div
          id="genre-results"
          class="instrument-results"
          aria-label="Available genres"
        ></div>
      </div>
    </div>`;
  }

  public updateGenres(): void {
    if (this.dependencies.picker.deferRender()) return;

    const input =
      this.dependencies.dialog.element.querySelector<HTMLInputElement>(
        "#genre-query",
      );
    if (!input) return;

    const query = input.value.trim();
    this.dependencies.dialog.element.querySelector(
      "#genre-selected",
    )!.innerHTML = this.selectedGenres
      .map(
        (g) =>
          /* HTML */ `<div class="genre-credit-row">
            <strong>${escapeHtml(g.name)}</strong
            ><button
              type="button"
              class="icon-button"
              data-action="remove-genre"
              data-id="${escapeHtml(g.id)}"
              aria-label="Remove ${escapeHtml(g.name)}"
            >
              ${icon("close", 16)}
            </button>
          </div>`,
      )
      .join("");

    const choices = this.genreChoices
      .filter(
        (g) =>
          !this.selectedGenres.some((c) => c.id === g.id) &&
          matches(
            query,
            g.name,
            ...ancestors(g.id, this.genreChoices).map((p) => p.name),
          ),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
    this.dependencies.dialog.element.querySelector(
      "#genre-results",
    )!.innerHTML =
      choices
        .slice(0, 20)
        .map((g) => {
          const descendant = this.selectedGenres.find((c) =>
            ancestors(c.id, this.genreChoices).some((p) => p.id === g.id),
          );
          return /* HTML */ `<button
            type="button"
            class="button secondary compact"
            data-action="select-genre"
            data-id="${escapeHtml(g.id)}"
            ${descendant ? "disabled" : ""}
          >
            ${escapeHtml(g.name)}${
              descendant
                ? ` — Included through ${escapeHtml(descendant.name)}`
                : ancestors(g.id, this.genreChoices).length
                  ? ` (${ancestors(g.id, this.genreChoices)
                      .map((p) => escapeHtml(p.name))
                      .join(" › ")})`
                  : ""
            }
          </button>`;
        })
        .join("") +
      (!choices.length && !query
        ? /* HTML */ `<p class="form-hint">Type a name to create one.</p>`
        : "") +
      (choices.length > 20
        ? /* HTML */ `<p class="form-hint">Type to narrow the results.</p>`
        : "") +
      (query &&
      !this.genreChoices.some(
        (g) => g.name.toLowerCase() === query.toLowerCase(),
      )
        ? /* HTML */ `<button
            type="button"
            class="button secondary compact"
            data-action="create-genre"
          >
            ${icon("plus", 14)} Create “${escapeHtml(query)}”
          </button>`
        : "");
  }

  public click(button: HTMLButtonElement): boolean {
    switch (button.dataset.action) {
      case "new-catalog-genre":
        this.openCatalogGenre();
        break;
      case "edit-catalog-genre":
        this.openCatalogGenre(
          this.dependencies.library.genres.find(
            (g) => genreUrl(g.id) === location.hash,
          ),
        );
        break;
      case "delete-catalog-genre": {
        const item = this.dependencies.library.genres.find(
          (g) => genreUrl(g.id) === location.hash,
        );
        if (
          !item ||
          this.dependencies.library.genres.some(
            (g) => g.parentGenreId === item.id,
          ) ||
          this.dependencies.library.albums.some((a) =>
            a.genres.some((g) => g.id === item.id),
          )
        )
          break;

        this.dependencies.dialog.show(
          "Delete genre?",
          /* HTML */ `<div class="dialog-body">
              Delete ${escapeHtml(item.name)}?
            </div>
            <div class="dialog-footer">
              <button class="button secondary" data-action="close">
                Cancel</button
              ><button
                class="button primary danger"
                data-action="confirm-delete-genre"
                data-id="${escapeHtml(item.id)}"
              >
                Delete genre
              </button>
            </div>`,
          '[data-action="close"]',
        );
        break;
      }
      case "confirm-delete-genre":
        if (
          !this.dependencies.library.genres.some(
            (g) => g.parentGenreId === button.dataset.id,
          ) &&
          !this.dependencies.library.albums.some((a) =>
            a.genres.some((g) => g.id === button.dataset.id),
          )
        ) {
          this.dependencies.library.genres =
            this.dependencies.library.genres.filter(
              (g) => g.id !== button.dataset.id,
            );
          this.dependencies.persistence.finishCatalogSave(
            "Genre deleted.",
            "#genres",
          );
        }
        break;
      case "select-genre":
      case "create-genre": {
        const input =
          this.dependencies.dialog.element.querySelector<HTMLInputElement>(
            "#genre-query",
          )!;
        let item = this.genreChoices.find((g) => g.id === button.dataset.id);
        if (button.dataset.action === "create-genre") {
          const name = input.value.trim();
          if (!name) break;
          item = this.genreChoices.find(
            (g) => g.name.toLowerCase() === name.toLowerCase(),
          );
          if (!item) {
            item = { id: makeId(), name, parentGenreId: null };
            this.genreChoices.push(item);
          }
        }
        if (
          !item ||
          this.selectedGenres.some(
            (g) =>
              g.id === item.id ||
              ancestors(g.id, this.genreChoices).some((p) => p.id === item!.id),
          )
        )
          break;

        const replaced = this.selectedGenres.filter((g) =>
          ancestors(item!.id, this.genreChoices).some((p) => p.id === g.id),
        );
        this.selectedGenres = normalizeGenres(
          [...this.selectedGenres, { ...item, isPrimary: false }],
          this.genreChoices,
        );
        if (replaced.length)
          this.dependencies.navigation.announce(
            `${replaced.map((g) => g.name).join(", ")} replaced by ${item.name}.`,
          );
        input.value = "";
        this.updateGenres();
        focusForTyping(input);
        this.dependencies.picker.closeSearch();
        break;
      }
      case "remove-genre":
        this.selectedGenres = this.selectedGenres.filter(
          (g) => g.id !== button.dataset.id,
        );
        this.updateGenres();
        break;
      default:
        return false;
    }

    return true;
  }

  public submit(form: HTMLFormElement): void {
    const item = readGenreForm(
      form,
      this.dependencies.library.genres,
      this.dependencies.dialog.formError,
    );
    if (!item) return;

    const { id, name, parentGenreId } = item;
    const next = this.dependencies.library.genres
      .filter((g) => g.id !== id)
      .concat({ id, name, parentGenreId });
    const affected = this.dependencies.library.albums.filter(
      (a) => normalizeGenres(a.genres, next).length < a.genres.length,
    );
    const apply = () => {
      this.dependencies.library.genres = next;
      this.dependencies.persistence.finishCatalogSave(
        "Genre saved.",
        genreUrl(id),
      );
    };

    if (affected.length) {
      this.dependencies.dialog.show(
        "Review genre changes",
        /* HTML */ `<div class="dialog-body">
            <p>
              This change removes redundant parent assignments from these
              albums, keeping their more specific genres:
            </p>
            <ul>
              ${affected.map((a) => /* HTML */ `<li>${escapeHtml(a.title)}</li>`).join("")}
            </ul>
          </div>
          <div class="dialog-footer">
            <button class="button secondary" data-action="close">Cancel</button
            ><button class="button primary" id="apply-genre-change">
              Apply changes
            </button>
          </div>`,
        "#apply-genre-change",
      );
      this.dependencies.dialog.element
        .querySelector("#apply-genre-change")!
        .addEventListener("click", apply);
    } else apply();
  }

  public input(input: HTMLInputElement): void {
    if (input.id === "genre-query") this.updateGenres();

    if (input.id === "genres-search") {
      this.genreQuery = input.value;
      const start = input.selectionStart;
      this.dependencies.navigation.renderRoute();
      const next =
        this.dependencies.navigation.main.querySelector<HTMLInputElement>(
          "#genres-search",
        )!;
      next.focus();
      next.setSelectionRange(start, start);
    }
  }

  public change(input: HTMLInputElement): void {
    if (input.id === "genres-alphabetical") {
      this.genreAlphabetical = input.checked;
      this.dependencies.navigation.updateCatalogFilters(input.id);
    }

    if (input.id === "genres-unused") {
      this.genreUnused = input.checked;
      this.dependencies.navigation.updateCatalogFilters(input.id);
    }
  }

  public renderList(root: HTMLElement): void {
    root.innerHTML = renderGenresView(
      this.dependencies.library.genres,
      this.dependencies.library.albums,
      this.genreQuery,
      this.genreAlphabetical,
      this.genreUnused,
    );
  }
}
