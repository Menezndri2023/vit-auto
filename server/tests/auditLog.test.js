import { describe, it, expect } from "vitest";
import { adminListAuditLog, adminAuditLogFacets } from "../controllers/auditLogController.js";
import AuditLog from "../models/AuditLog.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

async function seedLogs(userId) {
  await AuditLog.create([
    { userId, userRole: "admin", action: "user.role_change", resource: "User", resourceId: "1", success: true, method: "PATCH", path: "/x" },
    { userId, userRole: "admin", action: "user.delete",      resource: "User", resourceId: "2", success: false, method: "DELETE", path: "/y" },
    { userId, userRole: "admin", action: "identity.verified", resource: "User", resourceId: "3", success: true, method: "PATCH", path: "/z" },
  ]);
}

describe("adminListAuditLog", () => {
  it("filtre par action et par succès", async () => {
    const admin = await createUser({ role: "admin" });
    await seedLogs(admin._id);

    const { req, res } = mockReqRes({ query: { action: "user.role_change" } });
    await adminListAuditLog(req, res);
    expect(res.body.total).toBe(1);

    const { req: req2, res: res2 } = mockReqRes({ query: { success: "false" } });
    await adminListAuditLog(req2, res2);
    expect(res2.body.total).toBe(1);
    expect(res2.body.entries[0].action).toBe("user.delete");
  });

  it("plafonne la limite à 200 et pagine", async () => {
    const admin = await createUser({ role: "admin" });
    await seedLogs(admin._id);

    const { req, res } = mockReqRes({ query: { limit: "1", page: "2" } });
    await adminListAuditLog(req, res);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.total).toBe(3);
    expect(res.body.pages).toBe(3);
  });

  it("filtre par plage de dates", async () => {
    const admin = await createUser({ role: "admin" });
    await AuditLog.create({ userId: admin._id, userRole: "admin", action: "old", resource: "User", success: true, method: "GET", path: "/x", createdAt: new Date("2020-01-01") });
    await AuditLog.create({ userId: admin._id, userRole: "admin", action: "recent", resource: "User", success: true, method: "GET", path: "/x", createdAt: new Date() });

    const { req, res } = mockReqRes({ query: { dateFrom: "2025-01-01" } });
    await adminListAuditLog(req, res);
    expect(res.body.total).toBe(1);
    expect(res.body.entries[0].action).toBe("recent");
  });
});

describe("adminAuditLogFacets", () => {
  it("renvoie les actions et ressources distinctes, triées", async () => {
    const admin = await createUser({ role: "admin" });
    await seedLogs(admin._id);

    const { req, res } = mockReqRes({});
    await adminAuditLogFacets(req, res);
    expect(res.body.actions).toEqual(["identity.verified", "user.delete", "user.role_change"]);
    expect(res.body.resources).toEqual(["User"]);
  });
});
