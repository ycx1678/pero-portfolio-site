(() => {
  const STORAGE_KEY = "pero-portfolio-admin-v1";

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const saved = JSON.parse(raw);
    if (Array.isArray(saved?.items)) {
      window.PERO_PORTFOLIO_ITEMS = saved.items;
    }
  } catch (error) {
    console.warn("Saved portfolio state could not be applied", error);
  }
})();
