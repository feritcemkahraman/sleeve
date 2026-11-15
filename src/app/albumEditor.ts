import {
  albumSubmissionSchema,
  importMappingsSchema,
  musicLinkSubmissionSchema,
} from "./formValidation";
import {
  isAlbumEditorMode,
  type AlbumEditorMode,
  type EditorDialog,
} from "./editorContracts";
import { today } from "./date";
import type { DraftTarget } from "./editorDrafts";
import type { LibraryData } from "../types/library";
import {
  catalogImageField,
  updateCatalogImage,
  field,
  linkRow,
} from "../components/formFields";
import { formValue } from "./formValues";
import {
  findAppleMusicAlbums,
  relevantAppleMusicAlbums,
  type AppleMusicAlbum,
} from "../services/appleMusic";
import { commitAlbumArtists } from "./artistIdentity";
import { makeId } from "./id";
import type { Genre, AlbumGenre } from "../types/albums";
import type {
  Album,
  AlbumArtist,
  AlbumLink,
  AlbumInstrument,
} from "../types/albums";
import { icon } from "../components/icons";
import { escapeHtml } from "../components/html";
import { webUrl, cover } from "../components/presentation";
import { focusForTyping } from "./device";

type SuggestionKind = "genre" | "instrument";

interface AlbumEditorDrafts {
  begin: (target: DraftTarget) => boolean;
  capture: () => void;
}

interface AlbumEditorPersistence {
  finishSave: (id: string, message: string) => Promise<void>;
  finishCatalogSave: (message: string, destination: string) => Promise<void>;
}

interface AlbumEditorPickers {
  selections: {
    selectedArtists: AlbumArtist[];
    selectedGenres: AlbumGenre[];
    selectedInstruments: AlbumInstrument[];
    genreChoices: Genre[];
    instrumentChoices: AlbumInstrument[];
  };
  artistPicker: (items: AlbumArtist[]) => string;
  genrePicker: (
    items: AlbumGenre[],
    renderSuggestions?: () => string,
  ) => string;
  instrumentPicker: (
    items: AlbumInstrument[],
    renderSuggestions?: () => string,
  ) => string;
  updateArtists: () => void;
  updateGenres: () => void;
  updateInstruments: () => void;
  commitInstrumentChoices: () => void;
  applySuggestion: (
    kind: SuggestionKind,
    id: string | null,
    name: string,
  ) => void;
}

export interface AlbumEditorDependencies {
  accountId: string;
  dialog: EditorDialog;
  drafts: AlbumEditorDrafts;
  persistence: AlbumEditorPersistence;
  pickers: AlbumEditorPickers;
  library: Pick<LibraryData, "albums" | "artists" | "genres">;
  lifecycle: { isActive: () => boolean; isSaving: () => boolean };
}

function savedArtwork(
  artwork: string,
  original: string | null | undefined,
): string {
  if (artwork) return artwork;
  if (webUrl(original)) return "";

  return original || "";
}

function readMappings(key: string): Record<string, string> {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
    const parsed = importMappingsSchema.safeParse(data);
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

function readMusicLinks(
  form: HTMLFormElement,
  formError: EditorDialog["formError"],
): AlbumLink[] | undefined {
  const links: AlbumLink[] = [];

  for (const row of form.querySelectorAll(".link-fields")) {
    const input = row.querySelector<HTMLInputElement>('[name="linkUrl"]')!;
    const url = input.value.trim();
    const label = row
      .querySelector<HTMLInputElement>('[name="linkLabel"]')!
      .value.trim();
    if (!url && !label) continue;

    const parsed = musicLinkSubmissionSchema.safeParse({ url, label });
    if (!parsed.success) {
      formError("Enter an HTTP or HTTPS URL for each music link.", input);
      return undefined;
    }

    links.push({ id: makeId(), ...parsed.data });
  }

  return links;
}

export class AlbumEditor {
  private readonly dependencies: AlbumEditorDependencies;
  private readonly mappingKey: string;
  private reviewAlbum: Album | undefined;
  private appleVersion = 0;
  private appleResults: AppleMusicAlbum[] = [];

  constructor(dependencies: AlbumEditorDependencies) {
    this.dependencies = dependencies;
    this.mappingKey = `jazzlog:import-mappings:v1:${dependencies.accountId}`;
  }

  private suggestions(
    kind: SuggestionKind,
    items: { id: string; name: string }[] = [],
  ): string {
    if (!items.length) return "";

    const choices =
      kind === "genre"
        ? this.dependencies.pickers.selections.genreChoices
        : this.dependencies.pickers.selections.instrumentChoices;
    const mappings = readMappings(this.mappingKey);

    return /* HTML */ `<div class="import-suggestions">
      <p class="form-hint">
        Suggested ${kind === "genre" ? "genres" : "instruments"} from Wikipedia.
        Match to your library or create a new entry. Choices are remembered on
        this device.
      </p>
      ${items
        .map((item) => {
          const mapped = mappings[`${kind}:${item.id}`];
          const match =
            choices.find((choice) => choice.id === mapped) ??
            choices.find(
              (choice) =>
                choice.name.trim().toLowerCase() ===
                item.name.trim().toLowerCase(),
            );

          return /* HTML */ `<div class="field-grid" data-suggestion-row>
            <label class="field"
              ><span>${escapeHtml(item.name)}</span>
              <select name="suggestion-${kind}-${escapeHtml(item.id)}">
                <option value="">Choose a match…</option>
                <option value="__done" hidden>Reviewed</option>
                ${choices.map((choice) => /* HTML */ `<option value="${escapeHtml(choice.id)}" ${choice.id === match?.id ? "selected" : ""}>${escapeHtml(choice.name)}</option>`).join("")}
                <option value="__create">
                  Create “${escapeHtml(item.name)}”
                </option>
              </select>
            </label>
            <div>
              <button
                type="button"
                class="button secondary compact"
                data-action="apply-import-suggestion"
                data-kind="${kind}"
                data-source="${escapeHtml(item.id)}"
                data-name="${escapeHtml(item.name)}"
              >
                Add
              </button>
              <button
                type="button"
                class="button secondary compact"
                data-action="skip-import-suggestion"
              >
                Skip
              </button>
            </div>
          </div>`;
        })
        .join("")}
    </div>`;
  }

  private hasAppleLink(): boolean {
    return [
      ...this.dependencies.dialog.element.querySelectorAll<HTMLInputElement>(
        '[name="linkUrl"]',
      ),
    ].some((input) => {
      try {
        return ["music.apple.com", "itunes.apple.com"].includes(
          new URL(input.value).hostname,
        );
      } catch {
        return false;
      }
    });
  }

  private addAppleLink(item: AppleMusicAlbum): void {
    if (this.hasAppleLink()) return;

    this.dependencies.dialog.element
      .querySelector("#link-rows")
      ?.insertAdjacentHTML(
        "beforeend",
        linkRow({ url: item.url, label: "Apple Music" }),
      );

    this.dependencies.drafts.capture();
  }

  private async searchAppleMusic(): Promise<void> {
    const version = ++this.appleVersion;
    const form =
      this.dependencies.dialog.element.querySelector<HTMLFormElement>(
        "#album-form",
      );
    const status = this.dependencies.dialog.element.querySelector<HTMLElement>(
      "#apple-music-status",
    );
    const button =
      this.dependencies.dialog.element.querySelector<HTMLButtonElement>(
        '[data-action="find-apple-music"]',
      );
    if (!form || !status || !button) return;

    this.appleResults = [];

    const title = form
      .querySelector<HTMLInputElement>('[name="title"]')!
      .value.trim();
    const names = this.dependencies.pickers.selections.selectedArtists
      .filter((artist) => artist.role === "primary")
      .map((artist) => artist.name);

    if (this.hasAppleLink()) {
      status.textContent =
        "Remove the existing Apple Music link to choose a different album.";
      return;
    }

    if (!title || !names.length) {
      status.textContent =
        "Add an album title and primary artist before searching.";
      return;
    }

    const current = () =>
      this.dependencies.lifecycle.isActive() &&
      version === this.appleVersion &&
      this.dependencies.dialog.element.open &&
      !this.dependencies.lifecycle.isSaving() &&
      this.dependencies.dialog.element.querySelector("#album-form") === form;

    button.disabled = true;
    button.textContent = "Searching…";
    status.textContent = `Searching Apple Music (US) for ${title} by ${names.join(", ")}…`;

    try {
      const results = relevantAppleMusicAlbums(
        await findAppleMusicAlbums(title, names.join(" ")),
        title,
        names,
      );
      if (!current()) return;

      if (this.hasAppleLink()) {
        status.textContent = "An Apple Music link is already added.";
        return;
      }

      this.appleResults = results;
      status.innerHTML = results.length
        ? /* HTML */ `<p class="form-hint">Choose the album to add its link.</p>
            <div class="apple-music-results">
              ${results
                .map(
                  (item, index) =>
                    /* HTML */ `<button
                      type="button"
                      class="apple-music-result"
                      data-action="pick-apple-music"
                      data-index="${index}"
                    >
                      <span
                        ><strong>${escapeHtml(item.title)}</strong
                        ><small
                          >${escapeHtml(item.artist)}${item.year ? ` · ${item.year}` : ""}</small
                        ></span
                      ><span class="apple-music-add"
                        >${icon("plus", 15)} Add</span
                      >
                    </button>`,
                )
                .join("")}
            </div>`
        : "No albums found. Try updating the title or artist, or add a link manually.";
    } catch (error) {
      if (current())
        status.textContent =
          error instanceof Error
            ? error.message
            : "Couldn’t search Apple Music. Try again or add a link manually.";
    } finally {
      button.disabled = false;
      button.innerHTML = /* HTML */ `${icon("music", 15)} Search Apple Music`;
    }
  }

  private renderLinksForm(album: Partial<Album>): string {
    return /* HTML */ `<form id="links-form" data-id="${escapeHtml(album.id)}">
      <div class="dialog-body">
        <p class="dialog-intro">${escapeHtml(album.title)}</p>
        <div id="link-rows">
          ${(album.links?.length ? album.links : [{}]).map(linkRow).join("")}
        </div>
        <button
          type="button"
          class="button secondary compact"
          data-action="add-link"
        >
          ${icon("plus", 15)} Add link manually
        </button>
        <p class="form-error" id="form-error" role="alert" hidden></p>
      </div>
      <div class="dialog-footer">
        <button type="button" class="button secondary" data-action="close">
          Cancel
        </button>
        <button type="submit" class="button primary">Save links</button>
      </div>
    </form>`;
  }

  private renderAlbumForm(
    album: Partial<Album>,
    mode: AlbumEditorMode,
  ): string {
    const isEdit = mode === "edit";
    const fromSearch = mode === "review";

    return /* HTML */ `<form
      id="album-form"
      data-mode="${mode}"
      data-id="${escapeHtml(album.id)}"
    >
      <div class="dialog-body">
        ${
          fromSearch
            ? /* HTML */ `<div class="review-preview">
                ${cover(album)}
                <div>
                  <strong>${escapeHtml(album.title)}</strong>
                  <p class="muted">
                    Imported album. Review the artwork, details, and artist
                    roles before saving.
                  </p>
                </div>
              </div>`
            : ""
        }
        ${isEdit ? "" : /* HTML */ `<p class="form-hint">Album title is required. The other fields are optional.</p>`}
        <div class="field-grid">
          ${field("Album title", "title", album.title, { attributes: 'required maxlength="150"', placeholder: "Album title" })}
          <label class="field"
            ><span id="album-vinyl-label">Vinyl</span
            ><select name="vinylStatus" aria-labelledby="album-vinyl-label">
              <option value="">None</option>
              <option
                value="owned"
                ${album.vinylStatus === "owned" ? "selected" : ""}
              >
                Owned
              </option>
              <option
                value="wishlisted"
                ${album.vinylStatus === "wishlisted" ? "selected" : ""}
              >
                Wishlisted
              </option>
            </select></label
          >
          ${field("Release year", "year", album.releaseYear, { type: "number", attributes: 'min="1000" max="9999" step="1"', placeholder: "e.g. 1976" })}
        </div>
        ${this.dependencies.pickers.artistPicker(album.artists ?? [])}
        ${this.dependencies.pickers.genrePicker(album.genres ?? [], () => this.suggestions("genre", album.genreSuggestions))}
        ${this.dependencies.pickers.instrumentPicker(album.instruments ?? [], () => this.suggestions("instrument", album.instrumentSuggestions))}
        <section class="link-form" aria-labelledby="music-links-title">
          <h3 id="music-links-title">Music links</h3>
          <div class="apple-music-search">
            <button
              type="button"
              class="button secondary compact"
              data-action="find-apple-music"
            >
              ${icon("music", 15)} Search Apple Music
            </button>
            <div
              id="apple-music-status"
              class="apple-music-status"
              role="status"
              aria-live="polite"
            ></div>
          </div>
          <div id="link-rows">${(album.links ?? []).map(linkRow).join("")}</div>
          <button
            type="button"
            class="button secondary compact"
            data-action="add-link"
          >
            ${icon("plus", 15)} Add link manually
          </button>
        </section>
        <section class="extra-fields" aria-labelledby="album-details-title">
          <h3 id="album-details-title">More album details</h3>
          ${field("Record label", "label", album.recordLabel, { attributes: 'maxlength="100"', placeholder: "Optional" })}
          ${catalogImageField("Artwork URL", album.title ?? "", webUrl(album.artworkUrl)?.href, false, [], "artwork")}
        </section>
        <p class="form-error" id="form-error" role="alert" hidden></p>
      </div>
      <div class="dialog-footer">
        <button type="button" class="button secondary" data-action="close">
          Cancel</button
        ><button type="submit" class="button primary">
          ${isEdit ? "Save changes" : "Save album"}
        </button>
      </div>
    </form>`;
  }

  public openAlbumForm(
    album: Partial<Album> = {},
    mode: AlbumEditorMode = "manual",
  ): void {
    if (!this.dependencies.drafts.begin({ kind: "album", item: album, mode }))
      return;

    if (mode === "review") this.reviewAlbum = album as Album;

    if (mode === "links") {
      this.dependencies.dialog.show(
        "Edit music links",
        this.renderLinksForm(album),
        '[name="linkUrl"]',
      );
      return;
    }

    const isEdit = mode === "edit";
    const title = isEdit ? "Edit album" : "Create album";

    this.dependencies.dialog.show(
      title,
      this.renderAlbumForm(album, mode),
      '[name="title"]',
      !isEdit,
    );

    this.dependencies.dialog.element
      .querySelector<HTMLInputElement>('[name="artwork"]')!
      .addEventListener("input", (event) => {
        updateCatalogImage(event.currentTarget as HTMLInputElement);
      });

    this.dependencies.pickers.updateInstruments();
    this.dependencies.pickers.updateArtists();
    this.dependencies.pickers.updateGenres();
  }

  private originalAlbum(
    mode: AlbumEditorMode,
    id: string | undefined,
  ): Album | undefined {
    switch (mode) {
      case "edit":
        return this.dependencies.library.albums.find(
          (album) => album.id === id,
        );
      case "review":
        return this.reviewAlbum;
      default:
        return undefined;
    }
  }

  public saveAlbumForm(form: HTMLFormElement): void {
    const data = new FormData(form);
    const value = (name: string) => formValue(data, name);

    const mode = form.dataset.mode;
    if (!isAlbumEditorMode(mode)) return;
    const original = this.originalAlbum(mode, form.dataset.id);
    if ((mode === "edit" || mode === "review") && !original) return;

    const parsed = albumSubmissionSchema.safeParse({
      title: value("title"),
      artwork: value("artwork"),
      year: value("year"),
      label: value("label"),
      vinylStatus: value("vinylStatus"),
    });
    if (!parsed.success) {
      let field: string;
      let message: string;
      switch (parsed.error.issues[0].path[0]) {
        case "title":
          field = "title";
          message = "Enter an album title.";
          break;
        case "vinylStatus":
          field = "vinylStatus";
          message = "Choose a valid vinyl status.";
          break;
        default:
          field = "artwork";
          message = "Enter an HTTP or HTTPS artwork URL.";
      }

      return this.dependencies.dialog.formError(
        message,
        form.querySelector<HTMLInputElement | HTMLSelectElement>(
          `[name=${field}]`,
        )!,
      );
    }

    const { title, artwork, year, label, vinylStatus } = parsed.data;
    const mbid = original?.musicbrainzReleaseGroupId;

    if (
      mbid &&
      this.dependencies.library.albums.some(
        (album) =>
          album.id !== (mode === "edit" ? original?.id : undefined) &&
          album.musicbrainzReleaseGroupId?.toLowerCase() === mbid.toLowerCase(),
      )
    )
      return this.dependencies.dialog.formError(
        "This MusicBrainz album is already in your library.",
        form.querySelector<HTMLInputElement>("[name=title]")!,
      );

    const links = readMusicLinks(form, this.dependencies.dialog.formError);
    if (!links) return;

    this.dependencies.pickers.commitInstrumentChoices();
    const committedArtists = commitAlbumArtists(
      this.dependencies.library.artists,
      this.dependencies.pickers.selections.selectedArtists,
    );
    this.dependencies.library.artists = committedArtists.artists;
    this.dependencies.library.genres = structuredClone(
      this.dependencies.pickers.selections.genreChoices,
    );

    const saved: Album = {
      id: mode === "edit" ? original!.id : makeId(),
      sourceId: mode === "edit" ? original?.sourceId : undefined,
      title,
      sortTitle: original?.sortTitle ?? null,
      artists: committedArtists.credits,
      releaseYear: year,
      genres: structuredClone(
        this.dependencies.pickers.selections.selectedGenres,
      ),
      recordLabel: label,
      vinylStatus,
      artworkUrl: savedArtwork(artwork, original?.artworkUrl),
      musicbrainzReleaseGroupId: mbid || null,
      links,
      createdAt: mode === "edit" ? original!.createdAt : today(),
      instruments: structuredClone(
        this.dependencies.pickers.selections.selectedInstruments,
      ),
      updatedAt: new Date().toISOString(),
      listeningEntries: mode === "edit" ? original!.listeningEntries : [],
    };

    this.dependencies.library.albums =
      mode === "edit"
        ? this.dependencies.library.albums.map((album) =>
            album.id === saved.id ? saved : album,
          )
        : [saved, ...this.dependencies.library.albums];

    this.dependencies.persistence.finishSave(
      saved.id,
      mode === "edit" ? "Album updated." : "Album added to your library.",
    );
  }

  public saveLinks(form: HTMLFormElement): void {
    const album = this.dependencies.library.albums.find(
      (item) => item.id === form.dataset.id,
    );
    if (!album) return;

    const links = readMusicLinks(form, this.dependencies.dialog.formError);
    if (!links) return;

    album.links = links;
    album.updatedAt = new Date().toISOString();

    this.dependencies.persistence.finishSave(
      album.id,
      "Album music links updated.",
    );
  }

  public click(button: HTMLButtonElement, album?: Album): boolean {
    switch (button.dataset.action) {
      case "skip-import-suggestion": {
        const row = button.closest<HTMLElement>("[data-suggestion-row]")!;
        row.querySelector<HTMLSelectElement>("select")!.value = "__done";
        row.hidden = true;

        this.dependencies.drafts.capture();
        break;
      }

      case "apply-import-suggestion": {
        const row = button.closest("[data-suggestion-row]")!;
        const select = row.querySelector<HTMLSelectElement>("select")!;

        if (!select.value) {
          select.focus();
          break;
        }

        const kind = button.dataset.kind;
        const name = button.dataset.name;
        if ((kind !== "genre" && kind !== "instrument") || !name) return true;
        const choices =
          kind === "genre"
            ? this.dependencies.pickers.selections.genreChoices
            : this.dependencies.pickers.selections.instrumentChoices;
        const chosen =
          select.value === "__create"
            ? choices.find(
                (item) => item.name.toLowerCase() === name.toLowerCase(),
              )
            : choices.find((item) => item.id === select.value);

        this.dependencies.pickers.applySuggestion(
          kind,
          chosen?.id ?? (select.value === "__create" ? null : select.value),
          name,
        );

        const added =
          chosen ??
          choices.find(
            (item) => item.name.toLowerCase() === name.toLowerCase(),
          );
        if (added) {
          const mappings = readMappings(this.mappingKey);
          mappings[`${kind}:${button.dataset.source}`] = added.id;

          try {
            localStorage.setItem(this.mappingKey, JSON.stringify(mappings));
          } catch {
            /* Storage is optional. */
          }
        }

        select.value = "__done";
        (row as HTMLElement).hidden = true;

        this.dependencies.drafts.capture();
        break;
      }

      case "edit-links":
        if (album) this.openAlbumForm(album, "links");
        break;

      case "edit":
        if (album) this.openAlbumForm(album, "edit");
        break;

      case "delete-album":
        if (album)
          this.dependencies.dialog.show(
            "Delete album?",
            /* HTML */ `<div class="dialog-body">
                <p>
                  Delete <strong>${escapeHtml(album.title)}</strong> from your
                  library? All of its listening history, ratings, notes, and
                  music links will also be deleted. This cannot be undone.
                </p>
                <p id="form-error" class="form-error" role="alert" hidden></p>
              </div>
              <div class="dialog-footer">
                <button class="button secondary" data-action="close">
                  Cancel
                </button>
                <button
                  class="button primary danger"
                  data-action="confirm-delete-album"
                  data-id="${escapeHtml(album.id)}"
                >
                  Delete album
                </button>
              </div>`,
            '.dialog-footer [data-action="close"]',
          );
        break;

      case "confirm-delete-album":
        if (
          this.dependencies.library.albums.some(
            (item) => item.id === button.dataset.id,
          )
        ) {
          this.dependencies.library.albums =
            this.dependencies.library.albums.filter(
              (item) => item.id !== button.dataset.id,
            );

          this.dependencies.persistence.finishCatalogSave(
            "Album deleted.",
            "#",
          );
        }
        break;

      case "find-apple-music":
        this.searchAppleMusic();
        break;

      case "pick-apple-music": {
        const item = this.appleResults[Number(button.dataset.index)];
        if (item) {
          this.addAppleLink(item);
          this.dependencies.dialog.element
            .querySelector("#apple-music-status")!
            .replaceChildren();
          this.appleResults = [];
        }
        break;
      }

      case "add-link": {
        const rows =
          this.dependencies.dialog.element.querySelector<HTMLElement>(
            "#link-rows",
          )!;

        rows.insertAdjacentHTML("beforeend", linkRow());
        focusForTyping(
          rows.lastElementChild!.querySelector<HTMLInputElement>("input"),
        );
        break;
      }

      case "remove-link":
        button.closest(".link-fields")?.remove();
        this.dependencies.dialog.element
          .querySelector<HTMLElement>('[data-action="add-link"]')
          ?.focus();
        break;

      default:
        return false;
    }

    return true;
  }

  public dispose(): void {
    this.appleVersion++;
    this.appleResults = [];
    this.reviewAlbum = undefined;
  }
}
