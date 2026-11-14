export interface EditorDialog {
  element: HTMLDialogElement;
  show: (
    title: string,
    content: string,
    focusSelector: string,
    backToSearch?: boolean,
  ) => void;
  formError: (message: string, input: HTMLInputElement) => void;
}

export interface PickerInteraction {
  deferRender: () => boolean;
  closeSearch: () => void;
}

export type AlbumEditorMode = "manual" | "edit" | "review" | "links";

export function isAlbumEditorMode(value: unknown): value is AlbumEditorMode {
  return (
    value === "manual" ||
    value === "edit" ||
    value === "review" ||
    value === "links"
  );
}
