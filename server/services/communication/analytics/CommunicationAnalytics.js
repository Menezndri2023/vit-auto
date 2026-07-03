import logger from "../../../utils/logger.js";

async function getLog() {
  return (await import("../../../models/CommunicationLog.js")).default;
}

// ── Tracking ouvertures email ─────────────────────────────────────────────────
export async function trackOpen(trackingId) {
  if (!trackingId) return;
  try {
    const Log = await getLog();
    await Log.updateOne(
      { trackingId, openedAt: null },
      { $set: { openedAt: new Date(), status: "delivered" }, $inc: { openCount: 1 } }
    );
    logger.debug("[Analytics] Email ouvert", { trackingId });
  } catch (err) {
    logger.error("[Analytics] trackOpen error", { error: err.message });
  }
}

// ── Tracking clics email ──────────────────────────────────────────────────────
export async function trackClick(trackingId, url) {
  if (!trackingId) return;
  try {
    const Log = await getLog();
    await Log.updateOne(
      { trackingId },
      { $set: { clickedAt: new Date(), clickedUrl: url }, $inc: { clickCount: 1 } }
    );
    logger.debug("[Analytics] Lien cliqué", { trackingId, url });
  } catch (err) {
    logger.error("[Analytics] trackClick error", { error: err.message });
  }
}

// ── Enregistrer un envoi ──────────────────────────────────────────────────────
export async function logSend({
  userId, to, channel, template, subject, preview,
  provider, messageId, status, errorMessage, trackingId,
  context = {}, tags = [], priority = "normal",
}) {
  try {
    const Log = await getLog();
    await Log.create({
      userId: userId || null,
      to: Array.isArray(to) ? to.join(", ") : to,
      channel, template, subject,
      preview: preview ? String(preview).slice(0, 100) : null,
      provider: provider || "console",
      messageId: messageId || null,
      status: status || "sent",
      errorMessage: errorMessage || null,
      trackingId: trackingId || null,
      context, tags, priority,
      sentAt: new Date(),
    });
  } catch (err) {
    logger.error("[Analytics] logSend error", { error: err.message });
  }
}

// ── Statistiques globales ─────────────────────────────────────────────────────
export async function getStats({ from, to: toDate, channel, template } = {}) {
  try {
    const Log = await getLog();
    const match = {};
    if (from || toDate) {
      match.createdAt = {};
      if (from)    match.createdAt.$gte = new Date(from);
      if (toDate)  match.createdAt.$lte = new Date(toDate);
    }
    if (channel)  match.channel  = channel;
    if (template) match.template = template;

    const [byChannel, byStatus, byProvider, openRateAgg, clickRateAgg] = await Promise.all([
      Log.aggregate([{ $match: match }, { $group: { _id: "$channel",  count: { $sum: 1 } } }]),
      Log.aggregate([{ $match: match }, { $group: { _id: "$status",   count: { $sum: 1 } } }]),
      Log.aggregate([{ $match: match }, { $group: { _id: "$provider", count: { $sum: 1 } } }]),
      Log.aggregate([
        { $match: { ...match, channel: "email" } },
        { $group: { _id: null, total: { $sum: 1 }, opened: { $sum: { $cond: [{ $ne: ["$openedAt", null] }, 1, 0] } } } },
      ]),
      Log.aggregate([
        { $match: { ...match, channel: "email" } },
        { $group: { _id: null, total: { $sum: 1 }, clicked: { $sum: { $cond: [{ $ne: ["$clickedAt", null] }, 1, 0] } } } },
      ]),
    ]);

    const openAgg  = openRateAgg[0]  || { total: 0, opened:  0 };
    const clickAgg = clickRateAgg[0] || { total: 0, clicked: 0 };

    return {
      byChannel:  Object.fromEntries(byChannel.map((x)  => [x._id, x.count])),
      byStatus:   Object.fromEntries(byStatus.map((x)   => [x._id, x.count])),
      byProvider: Object.fromEntries(byProvider.map((x) => [x._id, x.count])),
      email: {
        openRate:  openAgg.total  ? Math.round((openAgg.opened   / openAgg.total)  * 100) : 0,
        clickRate: clickAgg.total ? Math.round((clickAgg.clicked / clickAgg.total) * 100) : 0,
        totalSent:   openAgg.total,
        totalOpened: openAgg.opened,
        totalClicked: clickAgg.clicked,
      },
    };
  } catch (err) {
    logger.error("[Analytics] getStats error", { error: err.message });
    return null;
  }
}

// ── Top templates les plus utilisés ──────────────────────────────────────────
export async function getTopTemplates(limit = 10) {
  try {
    const Log = await getLog();
    return Log.aggregate([
      { $match: { template: { $ne: null } } },
      { $group: { _id: "$template", count: { $sum: 1 }, channel: { $first: "$channel" } } },
      { $sort:  { count: -1 } },
      { $limit: limit },
    ]);
  } catch (err) {
    logger.error("[Analytics] getTopTemplates error", { error: err.message });
    return [];
  }
}
