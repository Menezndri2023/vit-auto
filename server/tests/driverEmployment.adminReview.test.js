import { describe, it, expect } from "vitest";
import {
  createEmploymentRequest,
  getReceivedEmploymentRequests,
  respondToEmploymentRequest,
  adminReviewEmploymentRequest,
} from "../controllers/driverEmploymentController.js";
import DriverEmployment from "../models/DriverEmployment.js";
import Notification from "../models/Notification.js";
import { createUser, createDriverDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Transmission DIRECTE (décision de l'exploitant, 2026-09-14) : une demande
// d'embauche CDD/CDI atteint le partenaire à l'instant où l'employeur la
// soumet — aucun service n'attend plus une validation admin. L'admin garde un
// droit de retrait a posteriori tant que le partenaire n'a pas répondu.
const makeRequest = async () => {
  const partner  = await createUser({ role: "partenaire" });
  const driver   = await createDriverDoc({ owner: partner._id });
  const employer = await createUser({ role: "client" });

  const { req, res } = mockReqRes({
    user: employer,
    body: {
      driverId: driver._id.toString(),
      contractType: "cdi",
      startDate: "2027-01-01",
      proposedSalary: 500,
      currency: "USD",
    },
  });
  await createEmploymentRequest(req, res);
  const request = res.body.request;
  return { partner, driver, employer, request };
};

describe("driverEmploymentController — transmission directe au partenaire", () => {
  it("une demande fraîchement créée est transmise et visible pour le partenaire, qui est notifié", async () => {
    const { partner, request } = await makeRequest();
    expect(request.adminReview.status).toBe("forwarded");
    expect(request.adminReview.reviewedBy).toBeNull();

    const { req, res } = mockReqRes({ user: partner });
    await getReceivedEmploymentRequests(req, res);
    expect(res.body.requests).toHaveLength(1);

    const notifs = await Notification.find({ user: partner._id }).lean();
    expect(notifs.some((n) => /proposition d'embauche/i.test(n.titre))).toBe(true);
  });

  it("le partenaire peut répondre immédiatement", async () => {
    const { partner, request } = await makeRequest();
    const { req, res } = mockReqRes({
      user: partner, params: { id: request._id }, body: { action: "accept" },
    });
    await respondToEmploymentRequest(req, res);
    expect(res.status).not.toHaveBeenCalledWith(409);
    expect(res.body.request.status).toBe("accepted");
  });

  it("« forward » n'a plus d'objet sur une demande déjà transmise (409)", async () => {
    const { request } = await makeRequest();
    const admin = await createUser({ role: "admin" });
    const { req, res } = mockReqRes({ user: admin, params: { id: request._id }, body: { action: "forward" } });
    await adminReviewEmploymentRequest(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("l'admin peut encore retirer une demande tant que le partenaire n'a pas répondu", async () => {
    const { partner, request } = await makeRequest();
    const admin = await createUser({ role: "admin" });

    const { req, res } = mockReqRes({
      user: admin, params: { id: request._id }, body: { action: "reject", reason: "Salaire trop bas" },
    });
    await adminReviewEmploymentRequest(req, res);
    expect(res.body.request.adminReview.status).toBe("rejected");
    expect(res.body.request.status).toBe("declined");

    const stored = await DriverEmployment.findById(request._id).lean();
    expect(stored.declineReason).toBe("Salaire trop bas");

    const { req: listReq, res: listRes } = mockReqRes({ user: partner });
    await getReceivedEmploymentRequests(listReq, listRes);
    expect(listRes.body.requests).toHaveLength(0);
  });

  it("une demande déjà acceptée par le partenaire ne peut plus être retirée par l'admin", async () => {
    const { partner, request } = await makeRequest();
    const admin = await createUser({ role: "admin" });
    const { req: r1, res: res1 } = mockReqRes({ user: partner, params: { id: request._id }, body: { action: "accept" } });
    await respondToEmploymentRequest(r1, res1);
    expect(res1.body.request.status).toBe("accepted");

    const { req: r2, res: res2 } = mockReqRes({ user: admin, params: { id: request._id }, body: { action: "reject" } });
    await adminReviewEmploymentRequest(r2, res2);
    expect(res2.status).toHaveBeenCalledWith(409);
  });
});
