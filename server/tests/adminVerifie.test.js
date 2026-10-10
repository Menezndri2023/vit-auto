import { describe, it, expect } from "vitest";
import User from "../models/User.js";
import { createUser } from "./helpers/fixtures.js";

// Décision de l'exploitant (2026-10-09) : un administrateur est vérifié
// d'office, sans document tiers — aucun message de vérification ne le vise.
describe("compte administrateur vérifié d'office", () => {
  it("à la création comme à la promotion", async () => {
    const admin = await createUser({ role: "admin", emailVerified: false });
    let u = await User.findById(admin._id).lean();
    expect(u.kycStatus).toBe("VERIFIE");
    expect(u.identity.status).toBe("verified");
    expect(u.emailVerified).toBe(true);

    const client = await createUser({ role: "client" });
    expect((await User.findById(client._id).lean()).kycStatus).not.toBe("VERIFIE");
    client.role = "admin";
    await client.save();
    u = await User.findById(client._id).lean();
    expect(u.kycStatus).toBe("VERIFIE");
    expect(u.documentsVerified).toBe(true);
  });
});
