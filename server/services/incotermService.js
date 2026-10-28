import { INCOTERM_CODES, getIncoterm, isIncotermCompatible } from "../constants/incoterms.js";

// ═══════════════════════════════════════════════════════════════════════════
// Incoterms® 2020 — conditions convenues sur une commande Trade ou Parts
// (exploitant, 2026-10-28). Le référentiel (11 règles, responsabilités par
// étape, groupe maritime/multimodal) vit dans constants/incoterms.js ; ce
// module ajoute ce qu'une COMMANDE exige : lieu nommé, version, libellé,
// avertissements de compatibilité et aide au choix.
//
// L'aide au choix est une aide à la décision, jamais un avis juridique : les
// parties confirment elles-mêmes la règle retenue. FOB n'est conseillé que
// lorsqu'il est adapté (maritime, marchandise chargée à bord, acheteur qui
// organise le transport principal) ; FCA est proposé pour un conteneur remis
// au terminal.

export const VERSION_INCOTERMS = "2020";
export const MODES_TRANSPORT = ["maritime", "routier", "aerien", "ferroviaire", "multimodal"];

export const AVERTISSEMENT_AIDE =
  "Aide à la décision : ne remplace pas le conseil d'un professionnel du commerce international. Les parties confirment elles-mêmes la règle retenue.";

// Mode de l'assistant → vocabulaire de isIncotermCompatible (shippingType).
const MODE_VERS_SHIPPING = { maritime: "maritime", routier: "terrestre", ferroviaire: "terrestre", aerien: "aerien", multimodal: "multiple" };

// « FOB Port de Casablanca, Incoterms® 2020 »
export function libelleIncoterm({ regle, lieuNomme, version = VERSION_INCOTERMS } = {}) {
  if (!regle) return "";
  return `${regle}${lieuNomme ? ` ${lieuNomme}` : ""}, Incoterms® ${version || VERSION_INCOTERMS}`;
}

export function avertissementsCompatibilite(regle, modeTransport) {
  const avert = [];
  if (!regle || !modeTransport) return avert;
  const inc = getIncoterm(regle);
  if (!inc) return avert;
  if (!isIncotermCompatible(regle, MODE_VERS_SHIPPING[modeTransport])) {
    avert.push(`${regle} est une règle réservée au transport maritime et fluvial ; pour un transport ${modeTransport}, une règle « tous modes » (FCA, CPT, CIP, DAP…) est généralement plus adaptée.`);
  }
  return avert;
}

/**
 * Valide les conditions saisies. Le lieu nommé est OBLIGATOIRE : « FOB »
 * seul ne dit pas où la marchandise est livrée ni où le risque passe.
 * @returns {{ erreurs: string[], avertissements: string[], valeurs: object }}
 */
export function validerConditions(body = {}, { modeTransport = null } = {}) {
  const regle = String(body.regle || "").trim().toUpperCase();
  const lieuNomme = String(body.lieuNomme || "").trim().slice(0, 160);
  const pays = String(body.pays || "").trim().toUpperCase().slice(0, 2);
  const erreurs = [];
  if (!INCOTERM_CODES.includes(regle)) erreurs.push("regle");
  if (lieuNomme.length < 2) erreurs.push("lieuNomme");
  if (pays && !/^[A-Z]{2}$/.test(pays)) erreurs.push("pays");
  const mode = MODES_TRANSPORT.includes(body.modeTransport) ? body.modeTransport : modeTransport;
  return {
    erreurs,
    avertissements: avertissementsCompatibilite(regle, mode),
    valeurs: {
      regle, lieuNomme, pays: pays || null, version: VERSION_INCOTERMS,
      modeTransport: mode || null,
      referenceDevis: String(body.referenceDevis || "").trim().slice(0, 120),
      referenceContrat: String(body.referenceContrat || "").trim().slice(0, 120),
      notes: String(body.notes || "").trim().slice(0, 1000),
    },
  };
}

const entree = (code, statut, raison) => ({ code, statut, raison, libelle: getIncoterm(code)?.label || code, resume: getIncoterm(code)?.summary || "" });

/**
 * Propose des règles adaptées à un scénario. Ne sélectionne rien : renvoie une
 * liste classée (recommande / alternative / a_examiner) et des avertissements.
 *
 * scenario = {
 *   modeTransport: maritime | routier | aerien | ferroviaire | multimodal,
 *   conteneurise: boolean,              // marchandise en conteneur remise au terminal
 *   organisateurTransport: acheteur | vendeur,   // qui organise le transport principal
 *   formalitesExport: vendeur | acheteur,
 *   formalitesImport: acheteur | vendeur,
 *   assuranceParVendeur: boolean,       // le vendeur doit souscrire l'assurance transport
 *   vendeurLivreADestination: boolean,  // le vendeur prend le risque jusqu'à destination
 *   vendeurDecharge: boolean,           // le vendeur décharge à destination
 * }
 */
export function recommanderIncoterms(scenario = {}) {
  const mode = MODES_TRANSPORT.includes(scenario.modeTransport) ? scenario.modeTransport : null;
  const maritime = mode === "maritime";
  const conteneur = !!scenario.conteneurise;
  const propositions = [];
  const avertissements = [];

  if (!mode) avertissements.push("Précisez le mode de transport : plusieurs règles en dépendent.");

  if (scenario.formalitesExport === "acheteur") {
    propositions.push(entree("EXW", "recommande", "L'acheteur prend tout en charge dès les locaux du vendeur, formalités d'exportation comprises."));
    propositions.push(entree("FCA", "alternative", "Si le vendeur peut réaliser les formalités d'exportation et remettre la marchandise au transporteur de l'acheteur."));
    avertissements.push("Sous EXW, l'acheteur doit pouvoir accomplir les formalités d'exportation dans le pays du vendeur, ce qui est souvent difficile : vérifiez-le avant de retenir cette règle.");
  } else if (scenario.organisateurTransport !== "vendeur") {
    // L'acheteur organise le transport principal.
    if (maritime && !conteneur) {
      propositions.push(entree("FOB", "recommande", "Transport maritime organisé par l'acheteur, marchandise chargée à bord : le vendeur livre à bord du navire désigné par l'acheteur au port d'expédition convenu, après les formalités d'exportation ; le risque passe à l'acheteur une fois la marchandise à bord."));
      propositions.push(entree("FAS", "alternative", "Si le vendeur livre le long du navire plutôt qu'à bord (marchandise en vrac, colis lourds)."));
      propositions.push(entree("FCA", "alternative", "Si la marchandise est en fait remise au transporteur avant le chargement à bord."));
    } else if (maritime && conteneur) {
      propositions.push(entree("FCA", "recommande", "Conteneur remis au transporteur dans un terminal avant son chargement à bord : FCA fait passer le risque à cette remise, là où le vendeur perd effectivement la main sur la marchandise."));
      propositions.push(entree("FOB", "a_examiner", "Possible, mais le vendeur garderait le risque entre la remise au terminal et le chargement à bord, période qu'il ne maîtrise plus."));
      avertissements.push("Pour une marchandise conteneurisée remise au terminal, FOB est souvent mal adapté ; FCA est l'alternative à examiner.");
    } else {
      propositions.push(entree("FCA", "recommande", "Transport non maritime organisé par l'acheteur : le vendeur remet la marchandise dédouanée à l'export au transporteur désigné par l'acheteur."));
      propositions.push(entree("EXW", "alternative", "Si l'acheteur peut aussi charger la marchandise et accomplir les formalités d'exportation."));
    }
  } else if (scenario.vendeurLivreADestination) {
    // Le vendeur organise le transport et prend le risque jusqu'à destination.
    if (scenario.formalitesImport === "vendeur") {
      propositions.push(entree("DDP", "recommande", "Le vendeur livre à destination, dédouané à l'import, droits et taxes à sa charge."));
      avertissements.push("Sous DDP, le vendeur doit pouvoir accomplir le dédouanement d'importation et acquitter les droits et taxes dans le pays de l'acheteur.");
    } else if (scenario.vendeurDecharge) {
      propositions.push(entree("DPU", "recommande", "Le vendeur livre la marchandise déchargée au lieu de destination convenu ; l'import reste à l'acheteur."));
      propositions.push(entree("DAP", "alternative", "Si le déchargement reste à la charge de l'acheteur."));
    } else {
      propositions.push(entree("DAP", "recommande", "Le vendeur livre la marchandise prête à être déchargée au lieu de destination convenu ; l'import reste à l'acheteur."));
      propositions.push(entree("DPU", "alternative", "Si le vendeur doit aussi décharger."));
    }
  } else {
    // Le vendeur paie le transport principal, le risque passe au départ.
    if (maritime && !conteneur) {
      propositions.push(scenario.assuranceParVendeur
        ? entree("CIF", "recommande", "Le vendeur paie le fret maritime et une assurance jusqu'au port de destination ; le risque passe à l'acheteur à bord, au départ.")
        : entree("CFR", "recommande", "Le vendeur paie le fret maritime jusqu'au port de destination ; le risque passe à l'acheteur à bord, au départ, sans assurance à la charge du vendeur."));
      propositions.push(entree(scenario.assuranceParVendeur ? "CIP" : "CPT", "alternative", "Si la marchandise est remise au transporteur avant le chargement à bord (conteneur, terminal)."));
    } else {
      propositions.push(scenario.assuranceParVendeur
        ? entree("CIP", "recommande", "Le vendeur paie le transport principal et une assurance (couverture « tous risques » par défaut sous CIP 2020) ; le risque passe à la remise au premier transporteur.")
        : entree("CPT", "recommande", "Le vendeur paie le transport principal jusqu'au lieu convenu ; le risque passe à la remise au premier transporteur."));
      if (maritime && conteneur) avertissements.push("Pour un conteneur, CPT/CIP sont en principe préférables à CFR/CIF.");
    }
  }

  for (const p of propositions) {
    for (const a of avertissementsCompatibilite(p.code, mode)) if (!avertissements.includes(a)) avertissements.push(a);
  }
  return { propositions, avertissements, version: VERSION_INCOTERMS, avertissementAide: AVERTISSEMENT_AIDE };
}
