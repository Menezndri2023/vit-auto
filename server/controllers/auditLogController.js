import logger from "../utils/logger.js";
import AuditLog from "../models/AuditLog.js";

// GET /api/audit-log/admin/list — consultation du journal d'audit (admin uniquement)
// Filtres optionnels : action, resource, userId, success, dateFrom, dateTo
export const adminListAuditLog = async (req, res) => {
  try {
    const {
      action, resource, userId, success,
      dateFrom, dateTo,
      page = 1, limit = 50,
    } = req.query;

    const filter = {};
    if (action)   filter.action   = action;
    if (resource) filter.resource = resource;
    if (userId)   filter.userId   = userId;
    if (success === "true" || success === "false") filter.success = success === "true";
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   filter.createdAt.$lte = new Date(dateTo);
    }

    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const skip = (Math.max(Number(page), 1) - 1) * safeLimit;

    const [entries, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
      AuditLog.countDocuments(filter),
    ]);

    res.json({ entries, total, page: Number(page), pages: Math.ceil(total / safeLimit) });
  } catch (err) {
    logger.error("adminListAuditLog:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// GET /api/audit-log/admin/actions — distinct actions/resources pour peupler les filtres
export const adminAuditLogFacets = async (_req, res) => {
  try {
    const [actions, resources] = await Promise.all([
      AuditLog.distinct("action"),
      AuditLog.distinct("resource"),
    ]);
    res.json({ actions: actions.sort(), resources: resources.sort() });
  } catch (err) {
    logger.error("adminAuditLogFacets:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
