import User from "../../models/User.js";
import ImporterPartnerProfile from "../../models/ImporterPartnerProfile.js";
import ImportExportListing from "../../models/ImportExportListing.js";
import IETransaction from "../../models/IETransaction.js";
import Vehicle from "../../models/Vehicle.js";
import Activity from "../../models/Activity.js";
import PartnerBusiness from "../../models/PartnerBusiness.js";

let counter = 0;
const uniq = (prefix) => `${prefix}${++counter}`;

export async function createUser(overrides = {}) {
  return User.create({
    firstName: "Test",
    lastName: uniq("User"),
    email: `${uniq("user")}@example.test`,
    password: "not-hashed-fixture-password",
    role: "client",
    ...overrides,
  });
}

export async function createImporterProfile(userId, overrides = {}) {
  return ImporterPartnerProfile.create({
    userId,
    companyName: uniq("Company"),
    status: "verified",
    badgeLevel: "gold",
    ...overrides,
  });
}

export async function createListing(overrides = {}) {
  let { partner, importerProfile, ...rest } = overrides;
  if (!partner) partner = (await createUser({ isFounder: true }))._id;
  if (!importerProfile) importerProfile = (await createImporterProfile(partner))._id;

  return ImportExportListing.create({
    partner,
    importerProfile,
    title: "Toyota Land Cruiser V8 Import",
    make: "Toyota",
    model: "Land Cruiser",
    year: 2022,
    sourceCountry: "Émirats Arabes Unis",
    availableIn: ["Côte d'Ivoire"],
    price: 25000,
    currency: "EUR",
    status: "approved",
    ...rest,
  });
}

export async function createIETransaction(overrides = {}) {
  let { listing, client, partner, ...rest } = overrides;
  if (!listing) {
    const l = await createListing();
    listing = l._id;
    partner = partner || l.partner;
  }
  if (!client) client = (await createUser())._id;
  if (!partner) partner = (await createUser({ isFounder: true }))._id;

  return IETransaction.create({
    listing,
    client,
    partner,
    ...rest,
  });
}

// Le Founding Partner Program est désormais par entité (voir
// PartnerOnboarding.businessId) — tout test créant un PartnerOnboarding "à la
// main" doit rattacher une PartnerBusiness réelle pour que le contrôleur
// (resolveBusinessIdForRead/resolveOrCreateBusinessId) la retrouve.
export async function makeTestPartnerBusiness(ownerId, overrides = {}) {
  return PartnerBusiness.create({
    owner: ownerId,
    companyName: uniq("Entreprise"),
    country: "CI",
    ville: "Abidjan",
    isDefault: true,
    ...overrides,
  });
}

// Nom distinct du controller `createVehicle` (vehicleController.js) pour
// éviter toute collision quand les deux sont importés dans le même fichier.
export async function createVehicleDoc(overrides = {}) {
  let { owner, ...rest } = overrides;
  if (!owner) owner = (await createUser({ role: "partenaire" }))._id;

  return Vehicle.create({
    title: "Toyota Corolla 2020",
    type: "location",
    marque: "Toyota",
    modele: "Corolla",
    annee: 2020,
    pricePerDay: 15000,
    caution: 50000,
    available: true,
    status: "approved",
    owner,
    ...rest,
  });
}

// Section OTHERS (activités culturelles/loisir — Quad, Surf, Montgolfière,
// Jetski, Jet privé, Bateau...) — même principe que createVehicleDoc.
export async function createActivityDoc(overrides = {}) {
  let { owner, ...rest } = overrides;
  if (!owner) owner = (await createUser({ role: "partenaire" }))._id;

  return Activity.create({
    activityType: "QUAD",
    title: "Sortie Quad 2h",
    price: 50,
    priceUnit: "per_person",
    durationMinutes: 120,
    capacity: 4,
    images: ["https://example.test/quad.jpg"],
    status: "approved",
    available: true,
    owner,
    ...rest,
  });
}
