(() => {
  const API_URL = "https://pero-portfolio-api.ycx1678.workers.dev/api/portfolio";
  const PASSWORD_URL = "https://pero-portfolio-api.ycx1678.workers.dev/api/admin/password";

  const read = async () => {
    if (!API_URL) return null;
    const response = await fetch(API_URL, {
      headers: { Accept: "application/json" },
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`Portfolio API request failed (${response.status})`);
    const payload = await response.json();
    return payload.state ? { ...payload.state, version: payload.version, updatedAt: payload.updatedAt } : null;
  };

  const save = async (state, password) => {
    if (!API_URL) throw new Error("Portfolio API is not configured.");
    const response = await fetch(API_URL, {
      method: "PUT",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${password}`
      },
      body: JSON.stringify(state)
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || `Portfolio API request failed (${response.status})`);
    return payload;
  };

  const changePassword = async (currentPassword, newPassword) => {
    if (!API_URL) throw new Error("Portfolio API is not configured.");
    const response = await fetch(PASSWORD_URL, {
      method: "PUT",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentPassword}`
      },
      body: JSON.stringify({ newPassword })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || `Portfolio API request failed (${response.status})`);
    return payload;
  };

  const remoteState = read().catch((error) => {
    if (API_URL) console.warn("Cloud portfolio state could not be read", error);
    return null;
  });

  window.PERO_PORTFOLIO_API = Object.freeze({
    configured: Boolean(API_URL),
    read,
    save,
    changePassword
  });
  window.PERO_PORTFOLIO_REMOTE_STATE = remoteState;
})();
