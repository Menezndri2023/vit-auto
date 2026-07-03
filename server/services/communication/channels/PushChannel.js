import logger from "../../../utils/logger.js";

// ── Firebase Cloud Messaging (FCM) ────────────────────────────────────────────
// Nécessite: FCM_SERVER_KEY ou FCM_PROJECT_ID + service account

export async function sendPush({ to, title, body, data = {}, imageUrl, badge = 1 }) {
  const tokens = Array.isArray(to) ? to : [to];
  if (!tokens.length) return { sent: false, reason: "no_tokens" };

  const fcmKey = process.env.FCM_SERVER_KEY;
  if (!fcmKey) {
    logger.warn("[PushChannel] FCM_SERVER_KEY absent — push ignoré", { title });
    return { sent: false, provider: "fcm", reason: "not_configured" };
  }

  try {
    const { default: fetch } = await import("node-fetch").catch(() => ({ default: globalThis.fetch }));

    const payload = {
      registration_ids: tokens,
      notification: {
        title,
        body,
        ...(imageUrl ? { image: imageUrl } : {}),
        badge,
        sound: "default",
      },
      data: { ...data, click_action: "FLUTTER_NOTIFICATION_CLICK" },
      android: { priority: "high", notification: { sound: "default", channel_id: "vitauto_default" } },
      apns: { payload: { aps: { badge, sound: "default" } } },
    };

    const res = await fetch("https://fcm.googleapis.com/fcm/send", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `key=${fcmKey}` },
      body:    JSON.stringify(payload),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "FCM error");

    const successCount = json.success || 0;
    const failCount    = json.failure || 0;

    if (failCount > 0) {
      logger.warn("[PushChannel] Tokens invalides", { failCount, successCount });
    }

    logger.info("[PushChannel] Push envoyé", { title, successCount, tokens: tokens.length });
    return { sent: true, provider: "fcm", successCount, failCount, multicast_id: json.multicast_id };
  } catch (err) {
    logger.error("[PushChannel] Erreur FCM", { error: err.message });
    return { sent: false, provider: "fcm", error: err.message };
  }
}

export function isAvailable() {
  return !!process.env.FCM_SERVER_KEY;
}
