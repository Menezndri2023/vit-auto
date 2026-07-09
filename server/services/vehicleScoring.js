// ══════════════════════════════════════════════════════════════════════════════
// MOTEUR DE VALIDATION AUTOMATIQUE DES ANNONCES
// Score sur 100 — décision : approved / pending / rejected
// Utilisé par vehicleController.createVehicle (saisie manuelle) et par
// vehicleImportService.processImportBatch (import en masse).
// ══════════════════════════════════════════════════════════════════════════════
export const scoreAnnonce = (data) => {
  const errors   = [];
  const warnings = [];
  let score = 0;

  // ── 1. IDENTITÉ (20 pts) ──────────────────────────────────────────────────
  // Nom du contact
  if ((data.contactNom || "").trim().length >= 3) score += 7;
  else warnings.push("Nom du contact incomplet");

  // Téléphone
  const tel = (data.contactTel || data.telephone || "").replace(/[\s\-().+]/g, "");
  if (tel.length >= 8) score += 8;
  else errors.push("Numéro de téléphone manquant ou invalide");

  // Ville
  if ((data.ville || "").trim().length >= 2) score += 5;
  else errors.push("Ville de publication manquante");

  // ── 2. INFORMATIONS DU VÉHICULE (25 pts) ──────────────────────────────────
  const titleLen = (data.title || "").trim().length;
  if (titleLen >= 10) score += 8;
  else if (titleLen >= 5) { score += 4; warnings.push("Titre trop court (min. 10 caractères recommandés)"); }
  else errors.push("Titre manquant ou trop court (minimum 5 caractères)");

  if ((data.marque || "").trim().length >= 2) score += 6;
  else errors.push("Marque du véhicule manquante");

  if ((data.modele || "").trim().length >= 1) score += 6;
  else errors.push("Modèle du véhicule manquant");

  const year        = Number(data.annee);
  const currentYear = new Date().getFullYear();
  if (year >= 1990 && year <= currentYear + 1) score += 3;
  else warnings.push("Année du véhicule absente ou invalide");

  if (data.etat) score += 2;

  // ── 3. CARACTÉRISTIQUES TECHNIQUES (20 pts) ───────────────────────────────
  if (data.vehicleType)  score += 4; else warnings.push("Catégorie du véhicule non spécifiée");
  if (data.carburant)    score += 4; else warnings.push("Type de carburant non spécifié");
  if (data.transmission) score += 4; else warnings.push("Transmission non précisée");

  const seats = Number(data.nombrePlaces);
  if (seats >= 1 && seats <= 20) score += 4;
  else warnings.push("Nombre de places invalide");

  if ((data.couleur || "").trim().length >= 2) score += 4;

  // ── 4. TARIFICATION (15 pts) ──────────────────────────────────────────────
  const price = Number(data.pricePerDay || data.priceForSale || 0);
  if (price >= 1000) {
    score += 12;
    if (data.pricePerDay  > 1_500_000) warnings.push("Tarif journalier très élevé — vérifiez le montant");
    if (data.priceForSale > 300_000_000) warnings.push("Prix de vente très élevé — vérifiez le montant");
  } else {
    errors.push("Prix manquant ou invalide (minimum 1 000 FCFA)");
  }
  if (Number(data.caution) > 0) score += 3;

  // ── 5. DESCRIPTION (15 pts) ───────────────────────────────────────────────
  const descLen = (data.description || "").trim().length;
  if (descLen >= 100)      score += 15;
  else if (descLen >= 50)  { score += 10; warnings.push("Description courte — décrivez davantage votre véhicule"); }
  else if (descLen >= 10)  { score += 5;  warnings.push("Description trop courte (50 caractères minimum recommandés)"); }
  else warnings.push("Ajoutez une description (50 caractères min. recommandés pour un meilleur score)");

  // ── 6. PHOTOS ─────────────────────────────────────────────────────────────
  const photoCount = (data.images || []).filter(Boolean).length;
  if (photoCount === 0) {
    score -= 10; // Pénalité forte
    errors.push("Aucune photo — au moins 1 photo est requise pour valider l'annonce");
  } else if (photoCount >= 3) {
    score += 5; // Bonus qualité
  }

  // Normaliser le score
  score = Math.max(0, Math.min(100, score));

  // ── DÉCISION AUTOMATIQUE ──────────────────────────────────────────────────
  // Erreurs critiques bloquant la publication immédiate
  const criticalErrors = errors.filter((e) =>
    e.includes("Téléphone") ||
    e.includes("Prix") ||
    e.includes("photo") ||
    e.includes("Marque") ||
    e.includes("Modèle")
  );

  // Rejet automatique uniquement si plusieurs erreurs critiques simultanées
  // (téléphone manquant + prix manquant, etc.) — sinon toujours pending pour examen admin
  const autoRejected = criticalErrors.length >= 3;

  return {
    score,
    status:   autoRejected ? "rejected" : "pending",
    errors,
    warnings,
  };
};

// ── Whitelist des champs légitimes d'une annonce véhicule ────────────────────
// Reproduit exactement le destructuring historique de vehicleController.createVehicle
// (anti mass-assignment : owner/status/stats ne viennent jamais d'ici).
export const buildVehicleWhitelist = (data) => {
  const {
    title, marque, modele, annee, couleur, kilometrage, etat,
    type: vType, vehicleType, carburant, transmission,
    nombrePlaces, nombrePortes, climatisation, withDriver,
    pricePerDay, priceForSale, caution, leasing,
    ageMin, permisRequis, assuranceOptionnelle,
    contactNom, contactTel, ville, adresse, coordonnees,
    images, description,
  } = data;

  return {
    title, marque, modele, annee, couleur, kilometrage, etat,
    type: vType, vehicleType, carburant, transmission,
    nombrePlaces, nombrePortes, climatisation, withDriver,
    pricePerDay, priceForSale, caution, leasing,
    ageMin, permisRequis, assuranceOptionnelle,
    contactNom, contactTel, ville, adresse, coordonnees,
    images: images || [], description,
  };
};
