// Miroir de server/constants/dossierImport.js (trajets, étapes, documents) —
// libellés seulement ; le serveur reste la référence des règles.
export const ORIGINES = [
  { code: "CN", nom: "Chine" }, { code: "AE", nom: "Émirats arabes unis" },
  { code: "DE", nom: "Allemagne" }, { code: "FR", nom: "France" }, { code: "BE", nom: "Belgique" },
  { code: "NL", nom: "Pays-Bas" }, { code: "IT", nom: "Italie" }, { code: "ES", nom: "Espagne" },
];
export const DESTINATIONS = [
  { code: "MA", nom: "Maroc" }, { code: "CI", nom: "Côte d'Ivoire" }, { code: "SN", nom: "Sénégal" },
  { code: "BJ", nom: "Bénin" }, { code: "TG", nom: "Togo" },
];
export const nomPays = (code) => [...ORIGINES, ...DESTINATIONS].find((p) => p.code === code)?.nom || code || "—";

export const ETAPES = [
  { code: "demande_recue",      libelle: "Demande reçue",                 icone: "📨" },
  { code: "devis_envoye",       libelle: "Devis envoyé",                  icone: "🧾" },
  { code: "pack_regle",         libelle: "Accompagnement réglé",          icone: "💳" },
  { code: "recherche_vehicule", libelle: "Recherche du véhicule",         icone: "🔎" },
  { code: "vehicule_reserve",   libelle: "Véhicule réservé",              icone: "🚗" },
  { code: "inspection",         libelle: "Inspection avant départ",       icone: "🛠️" },
  { code: "paiement_sequestre", libelle: "Paiement sous séquestre",       icone: "🔐" },
  { code: "preparation_export", libelle: "Préparation à l'export",        icone: "📋" },
  { code: "embarque",           libelle: "Embarqué",                      icone: "🚢" },
  { code: "en_mer",             libelle: "En mer",                        icone: "🌊" },
  { code: "arrive_port",        libelle: "Arrivé au port",                icone: "⚓" },
  { code: "en_douane",          libelle: "En dédouanement",               icone: "🛃" },
  { code: "mainlevee",          libelle: "Mainlevée obtenue",             icone: "✅" },
  { code: "sorti_port",         libelle: "Sorti du port",                 icone: "🚛" },
  { code: "livre",              libelle: "Livré",                         icone: "🏁" },
  { code: "immatricule",        libelle: "Immatriculé",                   icone: "🪪" },
  { code: "cloture",            libelle: "Dossier clôturé",               icone: "📁" },
];
export const rangEtape = (code) => ETAPES.findIndex((e) => e.code === code);
export const libelleEtape = (code) => ETAPES.find((e) => e.code === code)?.libelle || code;

export const STATUTS_DOCUMENT = {
  a_fournir: { libelle: "À fournir", couleur: "#94a3b8" },
  fourni:    { libelle: "Reçu, en vérification", couleur: "#f59e0b" },
  valide:    { libelle: "Validé", couleur: "#10b981" },
  refuse:    { libelle: "Refusé", couleur: "#ef4444" },
  non_requis:{ libelle: "Non requis", couleur: "#cbd5e1" },
};
export const STATUTS_PACK = {
  a_regler: "À régler", declare: "Règlement déclaré, en vérification", regle: "Réglé", offert: "Inclus",
};

// ── Étape 3 (2026-10-09) : inspection, assurance, financement ───────────────
export const FORMULES_INSPECTION = {
  standard:  { libelle: "Inspection standard", prix: 90 },
  premium:   { libelle: "Inspection premium",  prix: 220 },
  expertise: { libelle: "Expertise complète",  prix: 490 },
};
// Gold et Platinum incluent l'inspection premium, Executive l'expertise.
const RANG_FORMULE = { standard: 1, premium: 2, expertise: 3 };
const FORMULE_INCLUSE = { Gold: "premium", Platinum: "premium", Executive: "expertise" };
export const inspectionIncluse = (formule, pack) => !!FORMULE_INCLUSE[pack] && RANG_FORMULE[FORMULE_INCLUSE[pack]] >= RANG_FORMULE[formule];
export const RUBRIQUES_INSPECTION = [
  { code: "documents", libelle: "Documents et numéro de châssis (VIN)" },
  { code: "carrosserie", libelle: "Carrosserie et peinture" },
  { code: "chassis", libelle: "Châssis, soubassement, corrosion" },
  { code: "moteur", libelle: "Moteur" },
  { code: "transmission", libelle: "Boîte et transmission" },
  { code: "freins", libelle: "Freinage" },
  { code: "pneus", libelle: "Pneus et trains roulants" },
  { code: "interieur", libelle: "Intérieur" },
  { code: "electronique", libelle: "Électronique et voyants" },
  { code: "essai", libelle: "Essai routier" },
];
export const ETATS_RUBRIQUE = { bon: "Bon", moyen: "Moyen", mauvais: "Mauvais", non_verifie: "Non vérifié" };
export const VERDICTS = {
  conforme:     { libelle: "Conforme", couleur: "#10b981" },
  reserves:     { libelle: "Conforme avec réserves", couleur: "#f59e0b" },
  non_conforme: { libelle: "Non conforme", couleur: "#ef4444" },
};
export const STATUTS_INSPECTION = { non_demandee: "Non demandée", demandee: "Demandée, inspecteur en route", realisee: "Réalisée" };

export const GARANTIES_ASSURANCE = {
  tous_risques: { libelle: "Tous risques (ICC A)", taux: 0.012 },
  fap:          { libelle: "Risques majeurs seulement (ICC C)", taux: 0.006 },
};
export const primeIndicative = (valeur, garantie) => {
  const g = GARANTIES_ASSURANCE[garantie]; const v = Number(valeur);
  return g && v > 0 ? Math.max(50, Math.round(v * 1.1 * g.taux)) : null;
};
export const STATUTS_ASSURANCE = {
  non_demandee: "Non demandée", demandee: "Demandée, en cours de chiffrage", proposee: "Proposition à accepter",
  acceptee: "Acceptée, souscription en cours", souscrite: "Souscrite", refusee: "Non aboutie",
};

export const DUREES_FINANCEMENT = [12, 24, 36, 48, 60, 72, 84];
export const SITUATIONS_PRO = {
  salarie: "Salarié(e)", fonctionnaire: "Fonctionnaire", independant: "Indépendant(e)", entreprise: "Chef d'entreprise", autre: "Autre",
};
export const STATUTS_FINANCEMENT = {
  non_demande: "Non demandé", demande: "Demande envoyée", en_etude: "À l'étude", accorde: "Accordé", refuse: "Refusé", annule: "Retiré",
};
