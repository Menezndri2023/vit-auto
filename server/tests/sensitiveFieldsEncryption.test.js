import { describe, it, expect } from "vitest";
import Booking from "../models/Booking.js";
import PartnerCertification from "../models/PartnerCertification.js";
import { createBooking, getBookingDetail } from "../controllers/bookingController.js";
import { submitLevel, adminDetail } from "../controllers/partnerCertificationController.js";
import { isEncrypted } from "../utils/fieldEncryption.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Chiffrement au repos des données les plus monétisables (audit sécurité
// 2026-09). Les photos de pièce d'identité étaient chiffrées depuis 2026-07,
// mais PAS les coordonnées bancaires ni les identifiants fiscaux des
// partenaires, ni le numéro de pièce du client : une fuite de sauvegarde Mongo
// livrait les IBAN complets en clair, alors que les CNI du même dossier
// restaient illisibles. La protection était incohérente là où elle compte le plus.
//
// Ces tests vérifient les DEUX sens : la valeur est bien illisible en base, et
// elle reste correctement restituée à qui a le droit de la lire — sans quoi le
// chiffrement afficherait « enc:v1:… » à l'admin.

const FAKE_IMG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("Chiffrement au repos — coordonnées bancaires du partenaire", () => {
  it("stocke l'IBAN chiffré, illisible en base", async () => {
    const partner = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({
      user: partner,
      params: { level: "4" },
      body: { bankName: "Banque Test", accountHolder: "VIT AUTO SARL", iban: "MA64011519000001205000534921", swift: "BMCEMAMC", bankCountry: "MA" },
    });
    await submitLevel(req, res);
    expect(res.status).not.toHaveBeenCalledWith(500);

    const brut = await PartnerCertification.findOne({ userId: partner._id }).lean();
    expect(isEncrypted(brut.level4.iban), "l'IBAN doit être chiffré en base").toBe(true);
    expect(isEncrypted(brut.level4.swift)).toBe(true);
    expect(brut.level4.iban).not.toContain("MA64011519");
  });

  it("restitue l'IBAN en clair à l'administrateur qui examine le dossier", async () => {
    const partner = await createUser({ role: "partenaire" });
    const admin   = await createUser({ role: "admin", adminScope: ["super_admin"] });

    const sub = mockReqRes({
      user: partner, params: { level: "4" },
      body: { bankName: "Banque Test", accountHolder: "VIT AUTO SARL", iban: "MA64011519000001205000534921", swift: "BMCEMAMC", bankCountry: "MA" },
    });
    await submitLevel(sub.req, sub.res);

    const { req, res } = mockReqRes({ user: admin, params: { userId: partner._id.toString() } });
    await adminDetail(req, res);

    expect(res.body.certification.level4.iban).toBe("MA64011519000001205000534921");
    expect(res.body.certification.level4.swift).toBe("BMCEMAMC");
  });
});

describe("Chiffrement au repos — numéro de pièce du client", () => {
  it("stocke le numéro chiffré, et le restitue en clair sur la fiche détaillée", async () => {
    const client  = await createUser({ role: "client", emailVerified: true });
    const partner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: partner._id, withDriver: true, pricePerDay: 1000 });

    const { req, res } = mockReqRes({
      user: client,
      body: {
        type: "location",
        clientInfo: { firstName: "Jean", lastName: "Client", email: "jean@example.test", passportNumber: "P1234567" },
        documents: { identity: { type: "cni", frontImage: FAKE_IMG } },
        vehicleId: vehicle._id.toString(),
        location: { days: 2, startDate: "2027-11-01", endDate: "2027-11-03" },
      },
    });
    await createBooking(req, res);
    expect(res.status).not.toHaveBeenCalledWith(500);

    const bookingId = res.body.booking._id;
    const brut = await Booking.findById(bookingId).lean();
    expect(isEncrypted(brut.clientInfo.passportNumber), "le numéro doit être chiffré en base").toBe(true);

    // …et rester lisible pour l'admin, sinon le chiffrement casserait l'écran.
    const admin = await createUser({ role: "admin", adminScope: ["super_admin"] });
    const detail = mockReqRes({ user: admin, params: { id: bookingId.toString() } });
    await getBookingDetail(detail.req, detail.res);
    expect(detail.res.body.booking.clientInfo.passportNumber).toBe("P1234567");
  });

  it("laisse intactes les données antérieures au chiffrement (pas de migration bloquante)", async () => {
    // `decryptField` renvoie une valeur non chiffrée telle quelle : les
    // réservations existantes restent lisibles avant même que la migration
    // ne soit passée.
    const client  = await createUser({ role: "client" });
    const partner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: partner._id });
    const legacy = await Booking.create({
      type: "location", client: client._id, vehicle: vehicle._id,
      clientInfo: { firstName: "Ancien", lastName: "Dossier", email: "a@d.test", passportNumber: "EN-CLAIR-123" },
      adminValidation: { status: "approved" },
    });

    const admin = await createUser({ role: "admin", adminScope: ["super_admin"] });
    const { req, res } = mockReqRes({ user: admin, params: { id: legacy._id.toString() } });
    await getBookingDetail(req, res);
    expect(res.body.booking.clientInfo.passportNumber).toBe("EN-CLAIR-123");
  });
});
