import logger from "../../../utils/logger.js";
import { GoogleAuth } from "google-auth-library";

// ── Firebase Cloud Messaging — API HTTP v1 ────────────────────────────────────
// L'ancienne API "Legacy HTTP" (fcm.googleapis.com/fcm/send, authentifiée par
// un simple FCM_SERVER_KEY) a été définitivement fermée par Google mi-2024 —
// même avec une clé valide, aucun envoi n'aurait jamais abouti. HTTP v1
// s'authentifie par compte de service (OAuth2), pas par clé serveur, et
// n'accepte qu'un seul token par requête (pas de multicast natif).
// Nécessite : FIREBASE_PROJECT_ID + FIREBASE_SERVICE_ACCOUNT_JSON (le JSON
// complet de la clé de compte de service, en une ligne, dans la variable
// d'env — Firebase Console → Paramètres du projet → Comptes de service →
// Générer une nouvelle clé privée).
let cachedAuthClient = null;

function getServiceAccountCredentials() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    logger.error("[PushChannel] FIREBASE_SERVICE_ACCOUNT_JSON invalide (JSON.parse a échoué)", { error: err.message });
    return null;
  }
}

async function getAuthClient() {
  if (cachedAuthClient) return cachedAuthClient;
  const credentials = getServiceAccountCredentials();
  if (!credentials) return null;
  const auth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/firebase.messaging"] });
  cachedAuthClient = await auth.getClient();
  return cachedAuthClient;
}

export function isAvailable() {
  return !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
}

export async function sendPush({ to, title, body, data = {}, imageUrl, badge = 1 }) {
  const tokens = Array.isArray(to) ? to : [to];
  if (!tokens.length) return { sent: false, reason: "no_tokens" };

  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!isAvailable()) {
    logger.warn("[PushChannel] FIREBASE_PROJECT_ID/FIREBASE_SERVICE_ACCOUNT_JSON absent — push ignoré", { title });
    return { sent: false, provider: "fcm", reason: "not_configured" };
  }

  try {
    const client = await getAuthClient();
    if (!client) return { sent: false, provider: "fcm", reason: "not_configured" };
    const { token: accessToken } = await client.getAccessToken();
    if (!accessToken) throw new Error("Impossible d'obtenir un token d'accès Google (compte de service invalide ?)");

    const { default: fetch } = await import("node-fetch").catch(() => ({ default: globalThis.fetch }));
    const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
    // Pas de multicast natif en v1 (contrairement à Legacy) — un appel par token.
    const stringData = Object.fromEntries(
      Object.entries({ ...data, click_action: "FLUTTER_NOTIFICATION_CLICK" }).map(([k, v]) => [k, String(v)])
    );

    const outcomes = await Promise.allSettled(tokens.map(async (token) => {
      const res = await fetch(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body, ...(imageUrl ? { image: imageUrl } : {}) },
            data: stringData,
            android: { priority: "high", notification: { sound: "default", channel_id: "vitauto_default" } },
            apns:    { payload: { aps: { badge, sound: "default" } } },
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error?.message || `FCM error ${res.status}`);
      return json;
    }));

    const successCount = outcomes.filter((o) => o.status === "fulfilled").length;
    const failCount    = outcomes.length - successCount;

    if (failCount > 0) {
      logger.warn("[PushChannel] Tokens invalides ou échecs", {
        failCount, successCount,
        errors: outcomes.filter((o) => o.status === "rejected").map((o) => o.reason?.message),
      });
    }

    logger.info("[PushChannel] Push envoyé", { title, successCount, failCount, tokens: tokens.length });
    return { sent: successCount > 0, provider: "fcm", successCount, failCount };
  } catch (err) {
    logger.error("[PushChannel] Erreur FCM", { error: err.message });
    return { sent: false, provider: "fcm", error: err.message };
  }
}
