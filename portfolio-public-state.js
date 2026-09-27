(() => {
  const STORAGE_KEY = "pero-portfolio-admin-v1";

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (Array.isArray(saved?.items)) {
        window.PERO_PORTFOLIO_ITEMS = saved.items;
      }
    }
  } catch (error) {
    console.warn("Saved portfolio state could not be applied", error);
  }

  const applyRemoteState = (state) => {
    if (!Array.isArray(state?.items)) return null;
    window.PERO_PORTFOLIO_ITEMS = state.items;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items: state.items }));
    } catch (error) {
      console.warn("Cloud portfolio state could not be cached", error);
    }
    return state;
  };

  const remote = window.PERO_PORTFOLIO_REMOTE_STATE;
  window.PERO_PORTFOLIO_STATE_READY = remote?.then(applyRemoteState).catch(() => null) || Promise.resolve(null);
})();
