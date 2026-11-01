// Pure pieces of the first-run setup, shared by the renderer (<script>) and the tests (require).
(function (root) {
  // First the look (so the rest already shows in it). The region question only exists for countries that have a region list.
  const steps = hasRegions => ['look', 'country', ...(hasRegions ? ['region'] : []), 'topics', 'reddit', 'done'];
  // The bar counts the screen you are on, so it is never empty: 4 steps show 25, 50, 75, 100.
  const percent = (index, total) => Math.round(((index + 1) / total) * 100);
  const api = { steps, percent };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SetupSteps = api;
})(typeof window !== 'undefined' ? window : globalThis);
