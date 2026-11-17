export type Theme =
  "editorial" | "sage" | "walnut" | "prism" | "nocturne" | "soul";

interface ThemeOption {
  id: Theme;
  label: string;
}

declare global {
  interface Window {
    sleeveThemes: readonly ThemeOption[];
  }
}

export function themeOptions(): readonly ThemeOption[] {
  return window.sleeveThemes;
}

export function isTheme(value: string | undefined): value is Theme {
  return themeOptions().some(({ id }) => id === value);
}

export function currentTheme(): Theme {
  const value = document.documentElement.dataset.theme;
  return isTheme(value) ? value : "walnut";
}

export function selectTheme(value: string): void {
  if (!isTheme(value)) return;

  document.documentElement.dataset.theme = value;
  updateThemeColor();
  try {
    localStorage.setItem("sleeve-theme", value);
  } catch {
    // Keep the selection active even when persistence is unavailable.
  }
}

export function updateThemeColor(): void {
  const color = getComputedStyle(document.documentElement)
    .getPropertyValue("--color-bg")
    .trim();
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", color);
}
