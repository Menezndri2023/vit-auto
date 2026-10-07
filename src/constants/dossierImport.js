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
