// Miroir de server/constants/logistique.js (pas de dossier partagé entre
// server/ et src/ dans ce dépôt — voir constants/partnerTaxonomy.js).
// VIT-AUTO Logistique : mise en relation GRATUITE (exploitant, 2026-10-27).

import { WORLD_COUNTRIES } from "../data/worldCountries";

export const TYPES_BESOIN = [
  { code: "vehicule", libelle: "Transport de véhicule", icone: "🚗" },
  { code: "pieces",   libelle: "Transport de pièces détachées", icone: "🔩" },
  { code: "autre",    libelle: "Autre demande logistique", icone: "📦" },
];

export const MODES_TRANSPORT = [
  { code: "indifferent", libelle: "Indifférent" },
  { code: "routier",     libelle: "Routier" },
  { code: "maritime",    libelle: "Maritime" },
  { code: "aerien",      libelle: "Aérien" },
  { code: "ferroviaire", libelle: "Ferroviaire" },
  { code: "multimodal",  libelle: "Multimodal" },
];

export const LIBELLES_STATUT = {
  brouillon:              "Brouillon",
  recue:                  "Demande reçue",
  infos_requises:         "Informations complémentaires requises",
  validee:                "Validée",
  recherche_prestataires: "Recherche de prestataires",
  devis_recus:            "Devis reçus",
  devis_accepte:          "Devis accepté",
  commande_confirmee:     "Commande confirmée",
  en_preparation:         "En préparation",
  en_transport:           "En cours de transport",
  livraison_declaree:     "Livraison déclarée",
  cloturee:               "Clôturée",
  annulee:                "Annulée",
  litige:                 "Litige à traiter",
};

// Parcours nominal, pour la frise de suivi.
export const FRISE = [
  "recue", "validee", "recherche_prestataires", "devis_recus", "devis_accepte",
  "commande_confirmee", "en_preparation", "en_transport", "livraison_declaree", "cloturee",
];

// Étape que le prestataire retenu déclare ensuite.
export const ETAPE_SUIVANTE_PRESTATAIRE = {
  devis_accepte:      { statut: "commande_confirmee", libelle: "Confirmer la commande" },
  commande_confirmee: { statut: "en_preparation",     libelle: "Déclarer : en préparation" },
  en_preparation:     { statut: "en_transport",       libelle: "Déclarer : transport commencé" },
  en_transport:       { statut: "livraison_declaree", libelle: "Déclarer : livré" },
};

export const ANNULABLE_PAR_CLIENT = ["brouillon", "recue", "infos_requises", "validee", "recherche_prestataires", "devis_recus", "devis_accepte", "commande_confirmee", "en_preparation"];
export const LITIGE_OUVRABLE = ["commande_confirmee", "en_preparation", "en_transport", "livraison_declaree", "cloturee"];

export const LIBELLES_DEVIS = {
  propose: "Proposé", remplace: "Remplacé", retire: "Retiré", accepte: "Accepté",
  refuse: "Refusé", non_retenu: "Non retenu", expire: "Expiré",
};

export const PAYS = WORLD_COUNTRIES;
export const nomPays = (code) => WORLD_COUNTRIES.find((p) => p.code === code)?.name || code || "—";

// Rôles déclarés (2026-10-28) — jamais déduits de l'Incoterm.
export const DONNEURS_ORDRE = [
  { code: "a_confirmer", libelle: "À confirmer" }, { code: "acheteur", libelle: "L'acheteur" },
  { code: "vendeur", libelle: "Le vendeur / exportateur" }, { code: "autre", libelle: "Un tiers" },
];
export const PAYEURS = [
  { code: "a_confirmer", libelle: "À confirmer" }, { code: "acheteur", libelle: "L'acheteur" },
  { code: "vendeur", libelle: "Le vendeur / exportateur" }, { code: "partage", libelle: "Partagé entre les parties" }, { code: "autre", libelle: "Un tiers" },
];
export const libelleDe = (liste, code) => liste.find((x) => x.code === code)?.libelle || code || "—";

// Ce que la règle implique HABITUELLEMENT pour le transport principal —
// une indication, jamais une décision (voir constants/incoterms.js).
export const indicationTransportPrincipal = (regle) => {
  if (!regle) return null;
  if (["EXW", "FCA", "FAS", "FOB"].includes(regle)) return `Sous ${regle}, le transport principal est habituellement organisé par l'acheteur.`;
  return `Sous ${regle}, le transport principal est habituellement organisé par le vendeur.`;
};

export const POSTES_COUT = [
  { code: "preparation_manutention",   libelle: "Préparation et manutention" },
  { code: "transport_local",           libelle: "Transport local" },
  { code: "transport_international",   libelle: "Transport international" },
  { code: "frais_portuaires_terminal", libelle: "Frais portuaires et de terminal" },
  { code: "assurance",                 libelle: "Assurance" },
  { code: "droits_taxes",              libelle: "Droits et taxes éventuels" },
  { code: "autres",                    libelle: "Autres frais déclarés" },
];

export const TYPES_DOCUMENT = {
  facture_commerciale: "Facture commerciale", liste_colisage: "Liste de colisage",
  document_transport: "Document de transport", justificatif_export: "Justificatif d'exportation",
  document_import: "Document d'importation", assurance: "Document d'assurance",
  preuve_livraison: "Preuve de livraison", autre: "Autre document",
};
export const DOCUMENTS_PAR_ROLE = {
  acheteur:    ["facture_commerciale", "document_import", "assurance", "autre"],
  vendeur:     ["facture_commerciale", "liste_colisage", "justificatif_export", "autre"],
  prestataire: ["document_transport", "preuve_livraison", "assurance", "autre"],
};
