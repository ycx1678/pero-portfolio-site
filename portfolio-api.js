(() => {
  const API_URL = "https://pero-portfolio-api.ycx1678.workers.dev/api/portfolio";
  const LOGIN_URL = "https://pero-portfolio-api.ycx1678.workers.dev/api/admin/login";
  const SESSION_URL = "https://pero-portfolio-api.ycx1678.workers.dev/api/admin/session";
  const PASSWORD_URL = "https://pero-portfolio-api.ycx1678.workers.dev/api/admin/password";

  const authorizationHeaders = (token) => ({ Authorization: `Bearer ${token}` });

  const readPayload = async (response) => {
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || `Portfolio API request failed (${response.status})`);
    return payload;
  };

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

  const save = async (state, sessionToken) => {
    if (!API_URL) throw new Error("Portfolio API is not configured.");
    const response = await fetch(API_URL, {
      method: "PUT",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...authorizationHeaders(sessionToken)
      },
      body: JSON.stringify(state)
    });
    return readPayload(response);
  };

  const login = async (password) => {
    if (!API_URL) throw new Error("Portfolio API is not configured.");
    const response = await fetch(LOGIN_URL, {
      method: "POST",
      headers: { Accept: "application/json", ...authorizationHeaders(password) }
    });
    return readPayload(response);
  };

  const session = async (sessionToken) => {
    if (!API_URL) throw new Error("Portfolio API is not configured.");
    const response = await fetch(SESSION_URL, {
      headers: { Accept: "application/json", ...authorizationHeaders(sessionToken) },
      cache: "no-store"
    });
    return readPayload(response);
  };

  const signOut = async (sessionToken) => {
    if (!API_URL) throw new Error("Portfolio API is not configured.");
    const response = await fetch(SESSION_URL, {
      method: "DELETE",
      headers: { Accept: "application/json", ...authorizationHeaders(sessionToken) }
    });
    return readPayload(response);
  };

  const changePassword = async (sessionToken, newPassword) => {
    if (!API_URL) throw new Error("Portfolio API is not configured.");
    const response = await fetch(PASSWORD_URL, {
      method: "PUT",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...authorizationHeaders(sessionToken)
      },
      body: JSON.stringify({ newPassword })
    });
    return readPayload(response);
  };

  const remoteState = read().catch((error) => {
    if (API_URL) console.warn("Cloud portfolio state could not be read", error);
    return null;
  });

  window.PERO_PORTFOLIO_API = Object.freeze({
    configured: Boolean(API_URL),
    read,
    save,
    login,
    session,
    signOut,
    changePassword
  });
  window.PERO_PORTFOLIO_REMOTE_STATE = remoteState;
})();
