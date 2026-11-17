/* Loaded synchronously in <head> so the saved palette is applied before paint.
 * Add theme IDs and labels here; put their visual tokens in styles/themes/. */
window.sleeveThemes = [
  { id: "walnut", label: "Walnut" },
  { id: "sage", label: "Sage" },
  { id: "prism", label: "Prism" },
  { id: "soul", label: "Soul" },
  { id: "nocturne", label: "Nocturne" },
  { id: "editorial", label: "Editorial" },
];
(() => {
  let theme = "walnut";
  try {
    const stored = localStorage.getItem("sleeve-theme");
    const saved = stored === "retro" ? "soul" : stored;
    if (window.sleeveThemes.some(({ id }) => id === saved)) theme = saved;
  } catch {
    // Storage may be unavailable; the default still works.
  }
  document.documentElement.dataset.theme = theme;
})();
