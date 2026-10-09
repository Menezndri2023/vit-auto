// Référentiel des dossiers d'import (2026-10-07) — décision de l'exploitant :
// l'import est un SERVICE rendu par VIT AUTO au client (accompagnement suivi
// par un conseiller), les partenaires de la niche sont des exportateurs.
// Trajets de démarrage : Chine, Émirats et Europe vers le Maroc et quatre pays
// d'Afrique de l'Ouest. Miroir côté site : src/constants/dossierImport.js.

// ── Trajets ─────────────────────────────────────────────────────────────────
export const ORIGINES = [
  { code: "CN", nom: "Chine",            zone: "Asie" },
  { code: "AE", nom: "Émirats arabes unis", zone: "Golfe" },
  { code: "DE", nom: "Allemagne",        zone: "Europe" },
  { code: "FR", nom: "France",           zone: "Europe" },
  { code: "BE", nom: "Belgique",         zone: "Europe" },
  { code: "NL", nom: "Pays-Bas",         zone: "Europe" },
  { code: "IT", nom: "Italie",           zone: "Europe" },
  { code: "ES", nom: "Espagne",          zone: "Europe" },
];

export const DESTINATIONS = [
  { code: "MA", nom: "Maroc" },
  { code: "CI", nom: "Côte d'Ivoire" },
  { code: "SN", nom: "Sénégal" },
  { code: "BJ", nom: "Bénin" },
  { code: "TG", nom: "Togo" },
];

// Ports usuels (code UN/LOCODE). Liste de départ : la zone Transit permettra
// à l'admin de la compléter.
export const PORTS = [
  { code: "CNSHA", nom: "Shanghai",     pays: "CN" },
  { code: "CNTXG", nom: "Tianjin",      pays: "CN" },
  { code: "CNNSA", nom: "Guangzhou (Nansha)", pays: "CN" },
  { code: "AEJEA", nom: "Jebel Ali (Dubaï)",  pays: "AE" },
  { code: "BEANR", nom: "Anvers",       pays: "BE" },
  { code: "NLRTM", nom: "Rotterdam",    pays: "NL" },
  { code: "DEBRV", nom: "Bremerhaven",  pays: "DE" },
  { code: "DEHAM", nom: "Hambourg",     pays: "DE" },
  { code: "FRLEH", nom: "Le Havre",     pays: "FR" },
  { code: "FRMRS", nom: "Marseille",    pays: "FR" },
  { code: "ITGOA", nom: "Gênes",        pays: "IT" },
  { code: "ESVLC", nom: "Valence",      pays: "ES" },
  { code: "MACAS", nom: "Casablanca",   pays: "MA" },
  { code: "MAPTM", nom: "Tanger Med",   pays: "MA" },
  { code: "CIABJ", nom: "Abidjan",      pays: "CI" },
  { code: "CISPY", nom: "San-Pédro",    pays: "CI" },
  { code: "SNDKR", nom: "Dakar",        pays: "SN" },
  { code: "BJCOO", nom: "Cotonou",      pays: "BJ" },
  { code: "TGLFW", nom: "Lomé",         pays: "TG" },
];

export const codesOrigines = () => ORIGINES.map((o) => o.code);
export const codesDestinations = () => DESTINATIONS.map((d) => d.code);

// Les formulaires historiques envoient un nom de pays libre (« Côte d'Ivoire »,
// « cote d'ivoire », « CI »…) : on le ramène au code quand on le reconnaît.
const sansAccents = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
export function codePays(valeur, liste = [...ORIGINES, ...DESTINATIONS]) {
  const v = sansAccents(valeur);
  if (!v) return null;
  const trouve = liste.find((p) => p.code.toLowerCase() === v || sansAccents(p.nom) === v);
  if (trouve) return trouve.code;
  if (v === "dubai" || v === "uae" || v === "eau" || v === "emirats") return "AE";
  if (v === "china") return "CN";
  if (v === "morocco") return "MA";
  if (v === "ivory coast" || v === "cote divoire") return "CI";
  if (v === "senegal") return "SN";
  if (v === "benin") return "BJ";
  return null;
}

// ── Packs d'accompagnement (prix affichés sur la page Import/Export) ─────────
export const PACKS = {
  Silver:    { prix: 390,  devise: "USD" },
  Gold:      { prix: 890,  devise: "USD" },
  Platinum:  { prix: 1790, devise: "USD" },
  Executive: { prix: null, devise: "USD" }, // sur devis
};

// ── Étapes du suivi, dans l'ordre ───────────────────────────────────────────
// `transit: true` : étape qu'un prestataire de la zone Transit (transitaire,
// commissionnaire en douane) peut faire avancer lui-même.
export const ETAPES = [
  { code: "demande_recue",      libelle: "Demande reçue" },
  { code: "devis_envoye",       libelle: "Devis envoyé" },
  { code: "pack_regle",         libelle: "Frais d'accompagnement réglés" },
  { code: "recherche_vehicule", libelle: "Recherche du véhicule" },
  { code: "vehicule_reserve",   libelle: "Véhicule réservé" },
  { code: "inspection",         libelle: "Inspection avant départ" },
  { code: "paiement_sequestre", libelle: "Paiement sous séquestre" },
  { code: "preparation_export", libelle: "Préparation à l'export",          transit: true },
  { code: "embarque",           libelle: "Embarqué (connaissement émis)",   transit: true },
  { code: "en_mer",             libelle: "En mer",                          transit: true },
  { code: "arrive_port",        libelle: "Arrivé au port de destination",   transit: true },
  { code: "en_douane",          libelle: "En dédouanement",                 transit: true },
  { code: "mainlevee",          libelle: "Mainlevée obtenue",               transit: true },
  { code: "sorti_port",         libelle: "Sorti du port",                   transit: true },
  { code: "livre",              libelle: "Livré au client",                 transit: true },
  { code: "immatricule",        libelle: "Immatriculé" },
  { code: "cloture",            libelle: "Dossier clôturé" },
];
export const CODES_ETAPES = ETAPES.map((e) => e.code);
export const rangEtape = (code) => CODES_ETAPES.indexOf(code);
export const libelleEtape = (code) => ETAPES.find((e) => e.code === code)?.libelle || code;

// ── Documents ───────────────────────────────────────────────────────────────
// BSC/ECTN : bordereau de suivi des cargaisons, exigé à l'entrée en Côte
// d'Ivoire, au Sénégal, au Bénin et au Togo — pas au Maroc.
const BSC_PAYS = ["CI", "SN", "BJ", "TG"];
export const DOCUMENTS = [
  { code: "facture_commerciale",  libelle: "Facture commerciale" },
  { code: "carte_grise_origine",  libelle: "Carte grise du pays d'origine" },
  { code: "certificat_export",    libelle: "Certificat d'export / de radiation" },
  { code: "certificat_origine",   libelle: "Certificat d'origine" },
  { code: "rapport_inspection",   libelle: "Rapport d'inspection avant départ" },
  { code: "connaissement",        libelle: "Connaissement (B/L)" },
  { code: "attestation_assurance", libelle: "Attestation d'assurance transport" },
  { code: "bsc_ectn",             libelle: "BSC / ECTN (bordereau de suivi des cargaisons)", pays: BSC_PAYS },
  { code: "declaration_douane",   libelle: "Déclaration en douane" },
  { code: "quittance_droits",     libelle: "Quittance des droits et taxes" },
  { code: "mainlevee",            libelle: "Bon de mainlevée / bon à enlever" },
  { code: "carte_grise_destination", libelle: "Carte grise du pays de destination" },
];
export const CODES_DOCUMENTS = DOCUMENTS.map((d) => d.code);

// Liste des documents d'un dossier selon son pays de destination.
export function documentsPour(destination) {
  return DOCUMENTS
    .filter((d) => !d.pays || d.pays.includes(destination))
    .map((d) => ({ code: d.code, libelle: d.libelle, statut: "a_fournir" }));
}

// ── Étape 3 (2026-10-09) : inspection indépendante, assurance, financement ──
// Tarifs à l'unité affichés sur la page Import/Export (« Services
// additionnels »). L'inspection est faite par un inspecteur de la zone Transit,
// jamais par l'exportateur qui vend le véhicule. Les packs Gold et Platinum
// incluent l'inspection premium, Executive l'expertise complète.
export const FORMULES_INSPECTION = {
  standard:  { libelle: "Inspection standard", prix: 90 },
  premium:   { libelle: "Inspection premium",  prix: 220 },
  expertise: { libelle: "Expertise complète",  prix: 490 },
};
const RANG_FORMULE = { standard: 1, premium: 2, expertise: 3 };
const FORMULE_INCLUSE = { Gold: "premium", Platinum: "premium", Executive: "expertise" };
// Prix à facturer pour une formule, compte tenu du pack du dossier.
export function prixInspection(formule, pack) {
  const f = FORMULES_INSPECTION[formule];
  if (!f) return null;
  const incluse = FORMULE_INCLUSE[pack];
  return incluse && RANG_FORMULE[incluse] >= RANG_FORMULE[formule] ? 0 : f.prix;
}
export const RUBRIQUES_INSPECTION = [
  { code: "documents",    libelle: "Documents et numéro de châssis (VIN)" },
  { code: "carrosserie",  libelle: "Carrosserie et peinture" },
  { code: "chassis",      libelle: "Châssis, soubassement, corrosion" },
  { code: "moteur",       libelle: "Moteur" },
  { code: "transmission", libelle: "Boîte et transmission" },
  { code: "freins",       libelle: "Freinage" },
  { code: "pneus",        libelle: "Pneus et trains roulants" },
  { code: "interieur",    libelle: "Intérieur" },
  { code: "electronique", libelle: "Électronique et voyants" },
  { code: "essai",        libelle: "Essai routier" },
];
export const ETATS_RUBRIQUE = ["bon", "moyen", "mauvais", "non_verifie"];
export const VERDICTS_INSPECTION = ["conforme", "reserves", "non_conforme"];
// Étapes interdites tant qu'une inspection a conclu « non conforme » : on ne
// paie pas et on n'embarque pas un véhicule refusé par l'inspecteur.
export const ETAPES_BLOQUEES_SI_NON_CONFORME = CODES_ETAPES.slice(rangEtape("paiement_sequestre"));

// Assurance transport (garanties de l'Institute Cargo Clauses) : la prime
// indicative est calculée sur 110 % de la valeur, usage du marché ; l'admin
// propose ensuite la prime réelle obtenue de l'assureur.
export const GARANTIES_ASSURANCE = {
  tous_risques: { libelle: "Tous risques (ICC A)", taux: 0.012 },
  fap:          { libelle: "Risques majeurs seulement (ICC C)", taux: 0.006 },
};
export const PRIME_MINIMALE = 50;
export function primeIndicative(valeur, garantie) {
  const g = GARANTIES_ASSURANCE[garantie];
  const v = Number(valeur);
  if (!g || !Number.isFinite(v) || v <= 0) return null;
  return Math.max(PRIME_MINIMALE, Math.round(v * 1.1 * g.taux));
}

// Financement : étudié par VIT AUTO avec un organisme partenaire, frais de
// dossier de 110 à 2 200 $ (page Import/Export).
export const DUREES_FINANCEMENT = [12, 24, 36, 48, 60, 72, 84];
export const SITUATIONS_PRO = ["salarie", "fonctionnaire", "independant", "entreprise", "autre"];
// Mensualité d'un prêt amortissable à taux fixe.
export function mensualite(capital, tauxAnnuelPourcent, dureeMois) {
  const c = Number(capital), n = Number(dureeMois), t = Number(tauxAnnuelPourcent) / 100 / 12;
  if (!(c > 0) || !(n > 0) || !Number.isFinite(t) || t < 0) return null;
  const m = t === 0 ? c / n : (c * t) / (1 - Math.pow(1 + t, -n));
  return Math.round(m * 100) / 100;
}
