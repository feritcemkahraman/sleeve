import { z } from "zod";

export interface EditorDialog {
  element: HTMLDialogElement;
  show: (
    title: string,
    content: string,
    focusSelector: string,
    backToSearch?: boolean,
  ) => void;
  formError: (message: string, input: HTMLElement) => void;
}

export interface PickerInteraction {
  deferRender: () => boolean;
  closeSearch: () => void;
}

export const albumEditorModeSchema = z.enum([
  "manual",
  "edit",
  "review",
  "links",
]);
export type AlbumEditorMode = z.infer<typeof albumEditorModeSchema>;

export function isAlbumEditorMode(value: unknown): value is AlbumEditorMode {
  return albumEditorModeSchema.safeParse(value).success;
}
