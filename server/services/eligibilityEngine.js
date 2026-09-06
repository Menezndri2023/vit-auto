// Booking Engine — Éligibilité (2026-09). Fonction pure (aucune écriture DB,
// aucun accès réseau) qui combine Customer + Vehicle + RentalPolicy pour
// décider si un client peut réserver un véhicule donné, et pourquoi pas
// sinon. Remplace les deux contrôles ad hoc ajoutés en Phase 1 (Niveau 1
// compte, Niveau 2 identité) par un calcul unique et extensible — mais
// produit EXACTEMENT le même résultat qu'avant pour tout véhicule sans
// `requiredVerificationLevel` élevé et sans politique partenaire configurée
// (rétrocompatibilité stricte, voir bookingController.createBooking).
//
// Aucune nouvelle vérification biométrique n'est construite ici : comme
// documenté dans kycController.js, il n'existe aucun moteur OCR/face-match
// serveur fiable — ce moteur orchestre uniquement des données déjà fiables
// (téléphone/email vérifiés par OTP, kycStatus validé manuellement par un
// admin, permis soumis).

function computeAgeYears(birthDate) {
  if (!birthDate) return null;
  const dob = new Date(birthDate);
  if (isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

function computeYearsSince(date) {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return (Date.now() - d.getTime()) / (365.25 * 86400000);
}

// `user` : document/objet User (au minimum phoneVerified, emailVerified,
// kycStatus, birthDate, kycOcrData, driverLicenseOcr).
// `vehicle` : document/objet Vehicle (ageMin, permisRequis, withDriver, requiredVerificationLevel).
// `rentalPolicy` : PartnerBusiness.rentalPolicy ou null/undefined si le
// véhicule n'est rattaché à aucune entité.
// `deliveryDistanceKm` : distance déjà calculée par
// server/services/deliveryFee.js (Phase 2) — null si retrait en agence ou non
// encore calculée.
// `bookingType` : type de réservation ("location", "essai", "leasing", ...).
// `providedDocuments` : { identity: bool, license: bool } — présence d'un
// document transmis AVEC CETTE réservation (voir bookingController.createBooking,
// restructuration 2026-09 "documents liés à la réservation"). Remplace le mur
// KYC global (compte pré-vérifié par OCR) par une pièce jointe à la commande :
// un client déjà kycStatus VERIFIE reste dispensé de la re-fournir, mais un
// nouveau client peut désormais réserver en joignant le document au lieu de
// passer par /kyc au préalable.
export function evaluateEligibility({
  user, vehicle, rentalPolicy = null, deliveryDistanceKm = null,
  bookingType = null, providedDocuments = null,
}) {
  const reasons = [];
  const requiredVerification = { identityDocument: false, drivingLicense: false };

  // ── Niveau 1 — compte vérifié (inchangé depuis la Phase 1) ────────────────
  if (!user?.phoneVerified && !user?.emailVerified) {
    reasons.push("ACCOUNT_NOT_VERIFIED");
  }

  // ── Âge minimum ────────────────────────────────────────────────────────────
  // Jamais vérifié côté serveur avant cette phase (Vehicle.ageMin existait
  // mais n'était lu qu'à l'affichage). N'échoue jamais sur une date de
  // naissance absente — pas de blocage rétroactif pour un compte sans cette
  // donnée.
  const minAge = rentalPolicy?.minimumAge ?? vehicle?.ageMin ?? null;
  const age = computeAgeYears(user?.kycOcrData?.birthDate || user?.birthDate);
  if (minAge != null && age != null && age < minAge) {
    reasons.push("AGE_BELOW_MINIMUM");
  }

  // ── Niveau 2 — pièce d'identité ────────────────────────────────────────────
  // Toute location exige une pièce d'identité (CNI/passeport), quelle que soit
  // la politique du partenaire — règle produit 2026-09 (restructuration
  // réservation). Les autres types (essai, leasing, activité, chauffeur)
  // gardent l'ancien déclenchement, opt-in par véhicule/politique.
  const identityRequired =
    vehicle?.requiredVerificationLevel === "IDENTITY_VERIFIED" ||
    vehicle?.requiredVerificationLevel === "RENTAL_VERIFIED" ||
    rentalPolicy?.identityDocumentRequired === true ||
    bookingType === "location";
  if (identityRequired) {
    requiredVerification.identityDocument = true;
    const satisfied = user?.kycStatus === "VERIFIE" || providedDocuments?.identity === true;
    if (!satisfied) reasons.push("IDENTITY_NOT_VERIFIED");
  }

  // ── Niveau 3 — permis de conduire ──────────────────────────────────────────
  // Location sans chauffeur : permis exigé, comme la pièce d'identité
  // ci-dessus. Location AVEC chauffeur (Vehicle.withDriver) : le client ne
  // conduit pas, jamais de permis à fournir, quelle que soit la politique
  // partenaire — règle produit 2026-09.
  const licenseRequired = vehicle?.withDriver
    ? false
    : (
      vehicle?.requiredVerificationLevel === "RENTAL_VERIFIED" ||
      (rentalPolicy?.drivingLicenseRequired === true && vehicle?.permisRequis !== false) ||
      (bookingType === "location" && vehicle?.permisRequis !== false)
    );
  if (licenseRequired) {
    requiredVerification.drivingLicense = true;
    const lic = user?.driverLicenseOcr;
    const licenseOkProfile = !!lic?.licenseNumber && lic?.isExpired !== true;
    const satisfied = licenseOkProfile || providedDocuments?.license === true;
    if (!satisfied) {
      reasons.push("LICENSE_NOT_VERIFIED");
    } else if (rentalPolicy?.minimumLicenseYears && licenseOkProfile) {
      const years = computeYearsSince(lic.deliveredDate);
      if (years != null && years < rentalPolicy.minimumLicenseYears) {
        reasons.push("LICENSE_TOO_RECENT");
      }
    }
  }

  // ── Zone de livraison ──────────────────────────────────────────────────────
  if (rentalPolicy?.maxDeliveryRadiusKm != null && deliveryDistanceKm != null
    && deliveryDistanceKm > rentalPolicy.maxDeliveryRadiusKm) {
    reasons.push("DELIVERY_OUT_OF_ZONE");
  }

  return { eligible: reasons.length === 0, requiredVerification, reasons };
}

// Message + code HTTP homogènes pour chaque raison — les deux premiers codes
// correspondent exactement à ceux déjà gérés par src/pages/Booking.jsx
// (redirection automatique vers /profile ou /kyc), aucun changement frontend
// requis pour ces deux cas déjà couverts depuis la Phase 1.
export const ELIGIBILITY_MESSAGES = {
  ACCOUNT_NOT_VERIFIED:  { code: "VERIFICATION_LEVEL_1_REQUIRED", message: "Vérifiez votre numéro de téléphone ou votre email avant de réserver." },
  IDENTITY_NOT_VERIFIED: { code: "VERIFICATION_LEVEL_2_REQUIRED", message: "Ce véhicule nécessite une identité vérifiée. Complétez votre vérification d'identité avant de réserver." },
  AGE_BELOW_MINIMUM:     { code: "AGE_BELOW_MINIMUM",     message: "Vous ne remplissez pas l'âge minimum requis pour réserver ce véhicule." },
  LICENSE_NOT_VERIFIED:  { code: "LICENSE_NOT_VERIFIED",  message: "Ce véhicule nécessite un permis de conduire vérifié. Complétez votre vérification de permis avant de réserver." },
  LICENSE_TOO_RECENT:    { code: "LICENSE_TOO_RECENT",    message: "Votre permis de conduire doit avoir une ancienneté minimale pour réserver ce véhicule." },
  DELIVERY_OUT_OF_ZONE:  { code: "DELIVERY_OUT_OF_ZONE",  message: "Cette adresse de livraison est hors de la zone desservie par ce partenaire." },
};
