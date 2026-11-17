/* Loaded synchronously in <head> so the saved palette is applied before paint.
 * Add theme IDs and labels here; put their visual tokens in styles/themes/. */
window.sleeveThemes = [
  { id: "editorial", label: "Editorial" },
  { id: "sage", label: "Sage" },
  { id: "walnut", label: "Walnut" },
  { id: "prism", label: "Prism" },
];
(() => {
  let theme = "walnut";
  try {
    const saved = localStorage.getItem("sleeve-theme");
    if (window.sleeveThemes.some(({ id }) => id === saved)) theme = saved;
  } catch {
    // Storage may be unavailable; the default still works.
  }
  document.documentElement.dataset.theme = theme;
})();
