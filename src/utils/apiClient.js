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

const KEY_TOKEN   = "vit-auto-token";
const KEY_REFRESH = "vit-auto-refresh";

let isRefreshing = false;
let refreshQueue = [];

function getToken()        { try { return localStorage.getItem(KEY_TOKEN)   || ""; } catch { return ""; } }
function getRefreshToken() { try { return localStorage.getItem(KEY_REFRESH) || ""; } catch { return ""; } }
function setToken(t)       { try { t ? localStorage.setItem(KEY_TOKEN, t)   : localStorage.removeItem(KEY_TOKEN);   } catch { /* ignore */ } }
function setRefreshTok(rt) { try { rt ? localStorage.setItem(KEY_REFRESH, rt) : localStorage.removeItem(KEY_REFRESH); } catch { /* ignore */ } }

async function doRefresh() {
  const rt = getRefreshToken();
  if (!rt) return null;
  try {
    const res  = await fetch("/api/auth/refresh-token", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ refreshToken: rt }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.token) {
      setToken(data.token);
      if (data.refreshToken) setRefreshTok(data.refreshToken);
      return data.token;
    }
    return null;
  } catch { return null; }
}

function forceLogout() {
  setToken(null);
  setRefreshTok(null);
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
    if (isRefreshing) {
      // Mettre en queue et attendre le refresh en cours
      return new Promise((resolve, reject) => {
        refreshQueue.push(async (newToken) => {
          try {
            const retryHeaders = { ...reqHeaders, Authorization: `Bearer ${newToken}` };
            resolve(await fetch(url, { ...opts, headers: retryHeaders }));
          } catch (e) { reject(e); }
        });
      }).then(parseResponse);
    }

    isRefreshing = true;
    const newToken = await doRefresh();
    isRefreshing  = false;

    // Résoudre la queue
    const queue = refreshQueue;
    refreshQueue = [];
    queue.forEach((cb) => cb(newToken));

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
