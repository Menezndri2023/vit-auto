import { describe, it, expect } from "vitest";
import {
  createEmploymentRequest,
  getReceivedEmploymentRequests,
  respondToEmploymentRequest,
  adminReviewEmploymentRequest,
} from "../controllers/driverEmploymentController.js";
import DriverEmployment from "../models/DriverEmployment.js";
import { createUser, createDriverDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Une demande d'embauche CDD/CDI ne doit jamais atteindre le partenaire tant
// qu'un admin ne l'a pas explicitement transmise (voir DriverEmployment.js
// adminReview / driverEmploymentController.adminReviewEmploymentRequest) —
// avant ce correctif, createEmploymentRequest notifiait et rendait la demande
// visible au partenaire immédiatement, sans aucun filtre admin.
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

describe("driverEmploymentController — validation admin obligatoire avant transmission", () => {
  it("une demande fraîchement créée est invisible pour le partenaire (adminReview.status = pending)", async () => {
    const { partner, request } = await makeRequest();
    expect(request.adminReview.status).toBe("pending");

    const { req, res } = mockReqRes({ user: partner });
    await getReceivedEmploymentRequests(req, res);
    expect(res.body.requests).toHaveLength(0);
  });

  it("le partenaire ne peut pas répondre à une demande non transmise", async () => {
    const { partner, request } = await makeRequest();
    const { req, res } = mockReqRes({
      user: partner, params: { id: request._id }, body: { action: "accept" },
    });
    await respondToEmploymentRequest(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("après transmission admin, la demande devient visible et le partenaire peut y répondre", async () => {
    const { partner, request } = await makeRequest();
    const admin = await createUser({ role: "admin" });

    const { req: fwdReq, res: fwdRes } = mockReqRes({
      user: admin, params: { id: request._id }, body: { action: "forward" },
    });
    await adminReviewEmploymentRequest(fwdReq, fwdRes);
    expect(fwdRes.body.request.adminReview.status).toBe("forwarded");

    const { req: listReq, res: listRes } = mockReqRes({ user: partner });
    await getReceivedEmploymentRequests(listReq, listRes);
    expect(listRes.body.requests).toHaveLength(1);

    const { req: respReq, res: respRes } = mockReqRes({
      user: partner, params: { id: request._id }, body: { action: "accept" },
    });
    await respondToEmploymentRequest(respReq, respRes);
    expect(respRes.status).not.toHaveBeenCalledWith(409);
    expect(respRes.body.request.status).toBe("accepted");
  });

  it("un rejet admin refuse la demande sans jamais la rendre visible au partenaire", async () => {
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

  it("une demande déjà validée/rejetée ne peut pas être revalidée", async () => {
    const { request } = await makeRequest();
    const admin = await createUser({ role: "admin" });

    const { req: r1, res: res1 } = mockReqRes({ user: admin, params: { id: request._id }, body: { action: "forward" } });
    await adminReviewEmploymentRequest(r1, res1);

    const { req: r2, res: res2 } = mockReqRes({ user: admin, params: { id: request._id }, body: { action: "reject" } });
    await adminReviewEmploymentRequest(r2, res2);
    expect(res2.status).toHaveBeenCalledWith(409);
  });
});
