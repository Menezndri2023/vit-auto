import AuditLog from "../models/AuditLog.js";
import logger from "../utils/logger.js";

// ── Log une action sensible (usage manuel dans les controllers) ──────────────
// Exemple : await logAction(req, "kyc.approve", "KycSubmission", id, { before, after })
export async function logAction(req, action, resource, resourceId = null, changes = {}) {
  try {
    await AuditLog.create({
      userId:    req.user?._id ?? null,
      userRole:  req.user?.role ?? "anonymous",
      userEmail: req.user?.email ?? null,
      action,
      resource,
      resourceId: resourceId?.toString?.() ?? null,
      changes: {
        before: changes.before ?? null,
        after:  changes.after  ?? null,
      },
      ip:        req.ip || req.headers["x-forwarded-for"] || null,
      userAgent: req.headers["user-agent"] || null,
      method:    req.method,
      path:      req.originalUrl,
      success:   true,
    });
  } catch (err) {
    // L'audit log ne doit jamais bloquer une requête
    logger.error("AuditLog erreur", { action, resource, error: err.message });
  }
}

// ── Middleware Express automatique sur les routes sensibles ──────────────────
// Exemple : router.delete("/:id", authenticate, auditMiddleware("user.delete", "User"), controller)
export function auditMiddleware(action, resource) {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = function (body) {
      const success = res.statusCode < 400;
      AuditLog.create({
        userId:    req.user?._id ?? null,
        userRole:  req.user?.role ?? "anonymous",
        userEmail: req.user?.email ?? null,
        action,
        resource,
        resourceId: req.params?.id ?? null,
        ip:        req.ip || req.headers["x-forwarded-for"] || null,
        userAgent: req.headers["user-agent"] || null,
        method:    req.method,
        path:      req.originalUrl,
        success,
        errorMessage: success ? null : body?.message ?? null,
      }).catch(() => {});
      return originalJson(body);
    };

    next();
  };
}
