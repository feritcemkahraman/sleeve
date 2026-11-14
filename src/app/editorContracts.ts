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
