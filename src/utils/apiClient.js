/**
 * apiClient — Centralized fetch wrapper for VIT AUTO
 *
 * Usage:
 *   import { api } from '../utils/apiClient';
 *   const data = await api.get('/api/vehicles');
 *   const data = await api.post('/api/bookings', { body: payload });
 *
 * Features:
 * - Auto-injects Authorization header from localStorage
 * - On 401 → auto-refreshes token via /api/auth/refresh-token and retries once
 * - On second 401 → clears auth and dispatches 'vit:logout' event
 * - Returns parsed JSON or throws Error with server message
 */

import { refreshAccessTokenOnce } from "./tokenRefreshLock.js";

const KEY_TOKEN   = "vit-auto-token";
const KEY_REFRESH = "vit-auto-refresh";

function getToken() { try { return localStorage.getItem(KEY_TOKEN) || ""; } catch { return ""; } }
function setToken(t) { try { t ? localStorage.setItem(KEY_TOKEN, t) : localStorage.removeItem(KEY_TOKEN); } catch { /* ignore */ } }

function forceLogout() {
  setToken(null);
  try { localStorage.removeItem(KEY_REFRESH); } catch { /* ignore */ }
  try { localStorage.removeItem("vit-auto-user"); } catch { /* ignore */ }
  window.dispatchEvent(new Event("vit:logout"));
}

async function request(url, { method = "GET", body, headers = {}, signal } = {}) {
  const token  = getToken();
  const reqHeaders = {
    "Content-Type": "application/json",
    ...headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const opts = { method, headers: reqHeaders, signal };
  if (body !== undefined) opts.body = typeof body === "string" ? body : JSON.stringify(body);

  let res = await fetch(url, opts);

  if (res.status === 401) {
    // refreshAccessTokenOnce() coalesce tout appelant concurrent (ce module,
    // AuthContext.jsx) sur le MÊME appel HTTP en vol — plus de verrou local
    // à gérer ici, voir tokenRefreshLock.js.
    const newToken = await refreshAccessTokenOnce();

    if (newToken) {
      const retryHeaders = { ...reqHeaders, Authorization: `Bearer ${newToken}` };
      res = await fetch(url, { ...opts, headers: retryHeaders });
    } else {
      forceLogout();
      throw new Error("Session expirée. Veuillez vous reconnecter.");
    }
  }

  return parseResponse(res);
}

async function parseResponse(res) {
  const ct = res.headers.get("content-type") || "";
  if (!res.ok) {
    let msg = `Erreur ${res.status}`;
    let code;
    try {
      if (ct.includes("application/json")) {
        const err = await res.json();
        msg  = err.message || msg;
        code = err.code;
      }
    } catch { /* ignore */ }
    const error  = new Error(msg);
    error.status = res.status;
    error.code   = code;
    throw error;
  }
  if (ct.includes("application/json")) return res.json();
  if (ct.includes("text/"))            return res.text();
  return res;
}

export const api = {
  get:    (url, opts)        => request(url, { method: "GET",    ...opts }),
  post:   (url, body, opts)  => request(url, { method: "POST",   body, ...opts }),
  patch:  (url, body, opts)  => request(url, { method: "PATCH",  body, ...opts }),
  put:    (url, body, opts)  => request(url, { method: "PUT",    body, ...opts }),
  delete: (url, opts)        => request(url, { method: "DELETE", ...opts }),
};

export default api;
