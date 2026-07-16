// Référentiel Incoterms® 2020 (ICC) appliqué aux annonces Import/Export
// (ImportExportListing.incoterm / IETransaction.incoterm). Dupliqué à
// l'identique dans src/constants/incoterms.js (pas de dossier partagé entre
// server/ et src/ dans ce repo).
//
// group "multimodal" = applicable à tout mode de transport (y compris
// multimodal) — EXW, FCA, CPT, CIP, DAP, DPU, DDP.
// group "maritime"   = réservé au transport maritime et par voies navigables
// intérieures — FAS, FOB, CFR, CIF.

export const INCOTERM_STAGES = [
  ["loadingAtOrigin", "Chargement au départ"],
  ["exportCustoms", "Dédouanement export"],
  ["mainCarriage", "Transport principal"],
  ["insurance", "Assurance transport"],
  ["importCustoms", "Dédouanement import"],
  ["deliveryAtDestination", "Livraison / déchargement à destination"],
];

export const INCOTERMS = [
  {
    code: "EXW",
    group: "multimodal",
    label: "EXW — À l'usine (Ex Works)",
    summary: "Le vendeur met la marchandise à disposition dans ses locaux ; l'acheteur assume tout le reste (chargement, formalités, transport, assurance).",
    responsibilities: {
      loadingAtOrigin: "acheteur",
      exportCustoms: "acheteur",
      mainCarriage: "acheteur",
      insurance: "acheteur",
      importCustoms: "acheteur",
      deliveryAtDestination: "acheteur",
    },
  },
  {
    code: "FCA",
    group: "multimodal",
    label: "FCA — Franco transporteur (Free Carrier)",
    summary: "Le vendeur charge la marchandise et la remet dédouanée export au transporteur désigné par l'acheteur ; l'acheteur prend en charge le transport principal et la suite.",
    responsibilities: {
      loadingAtOrigin: "vendeur",
      exportCustoms: "vendeur",
      mainCarriage: "acheteur",
      insurance: "acheteur",
      importCustoms: "acheteur",
      deliveryAtDestination: "acheteur",
    },
  },
  {
    code: "CPT",
    group: "multimodal",
    label: "CPT — Port payé jusqu'à (Carriage Paid To)",
    summary: "Le vendeur organise et paie le transport principal jusqu'au lieu convenu, mais le risque passe à l'acheteur dès la remise au premier transporteur.",
    responsibilities: {
      loadingAtOrigin: "vendeur",
      exportCustoms: "vendeur",
      mainCarriage: "vendeur",
      insurance: "acheteur",
      importCustoms: "acheteur",
      deliveryAtDestination: "acheteur",
    },
  },
  {
    code: "CIP",
    group: "multimodal",
    label: "CIP — Port payé, assurance comprise (Carriage and Insurance Paid To)",
    summary: "Comme CPT, mais le vendeur souscrit en plus une assurance transport (couverture étendue, minimum Institute Cargo Clauses A) au bénéfice de l'acheteur.",
    responsibilities: {
      loadingAtOrigin: "vendeur",
      exportCustoms: "vendeur",
      mainCarriage: "vendeur",
      insurance: "vendeur",
      importCustoms: "acheteur",
      deliveryAtDestination: "acheteur",
    },
  },
  {
    code: "DAP",
    group: "multimodal",
    label: "DAP — Rendu au lieu de destination (Delivered At Place)",
    summary: "Le vendeur assume transport et risques jusqu'au lieu de destination convenu, prêt à être déchargé ; l'acheteur gère le déchargement et le dédouanement import.",
    responsibilities: {
      loadingAtOrigin: "vendeur",
      exportCustoms: "vendeur",
      mainCarriage: "vendeur",
      insurance: "vendeur",
      importCustoms: "acheteur",
      deliveryAtDestination: "acheteur",
    },
  },
  {
    code: "DPU",
    group: "multimodal",
    label: "DPU — Rendu au lieu déchargé (Delivered at Place Unloaded)",
    summary: "Comme DAP, mais le vendeur assume aussi le déchargement à destination. Seul Incoterm où le vendeur décharge la marchandise.",
    responsibilities: {
      loadingAtOrigin: "vendeur",
      exportCustoms: "vendeur",
      mainCarriage: "vendeur",
      insurance: "vendeur",
      importCustoms: "acheteur",
      deliveryAtDestination: "vendeur",
    },
  },
  {
    code: "DDP",
    group: "multimodal",
    label: "DDP — Rendu droits acquittés (Delivered Duty Paid)",
    summary: "Obligation maximale pour le vendeur : il assume tout jusqu'à la livraison, y compris le dédouanement import et les droits de douane.",
    responsibilities: {
      loadingAtOrigin: "vendeur",
      exportCustoms: "vendeur",
      mainCarriage: "vendeur",
      insurance: "vendeur",
      importCustoms: "vendeur",
      deliveryAtDestination: "vendeur",
    },
  },
  {
    code: "FAS",
    group: "maritime",
    label: "FAS — Franco le long du navire (Free Alongside Ship)",
    summary: "Le vendeur livre la marchandise le long du navire au port d'embarquement convenu ; l'acheteur assume le chargement à bord et tout le reste.",
    responsibilities: {
      loadingAtOrigin: "vendeur",
      exportCustoms: "vendeur",
      mainCarriage: "acheteur",
      insurance: "acheteur",
      importCustoms: "acheteur",
      deliveryAtDestination: "acheteur",
    },
  },
  {
    code: "FOB",
    group: "maritime",
    label: "FOB — Franco à bord (Free On Board)",
    summary: "Le vendeur charge la marchandise à bord du navire désigné par l'acheteur ; l'acheteur prend en charge le fret maritime et la suite.",
    responsibilities: {
      loadingAtOrigin: "vendeur",
      exportCustoms: "vendeur",
      mainCarriage: "acheteur",
      insurance: "acheteur",
      importCustoms: "acheteur",
      deliveryAtDestination: "acheteur",
    },
  },
  {
    code: "CFR",
    group: "maritime",
    label: "CFR — Coût et fret (Cost and Freight)",
    summary: "Le vendeur paie le fret maritime jusqu'au port de destination, mais le risque passe à l'acheteur dès le chargement à bord au port de départ.",
    responsibilities: {
      loadingAtOrigin: "vendeur",
      exportCustoms: "vendeur",
      mainCarriage: "vendeur",
      insurance: "acheteur",
      importCustoms: "acheteur",
      deliveryAtDestination: "acheteur",
    },
  },
  {
    code: "CIF",
    group: "maritime",
    label: "CIF — Coût, assurance et fret (Cost, Insurance and Freight)",
    summary: "Comme CFR, mais le vendeur souscrit en plus une assurance transport minimale (Institute Cargo Clauses C) au bénéfice de l'acheteur.",
    responsibilities: {
      loadingAtOrigin: "vendeur",
      exportCustoms: "vendeur",
      mainCarriage: "vendeur",
      insurance: "vendeur",
      importCustoms: "acheteur",
      deliveryAtDestination: "acheteur",
    },
  },
];

export const INCOTERM_CODES = INCOTERMS.map((i) => i.code);

export const INCOTERM_GROUP_LABELS = {
  multimodal: "Tous modes de transport",
  maritime: "Maritime / voies navigables uniquement",
};

export const getIncoterm = (code) => INCOTERMS.find((i) => i.code === code) || null;

// FAS/FOB/CFR/CIF sont réservés au transport maritime — les 7 autres Incoterms
// sont valables quel que soit shippingType (y compris "multiple", puisqu'un
// trajet multimodal peut inclure une jambe maritime).
export const isIncotermCompatible = (code, shippingType) => {
  if (!code) return true;
  const inc = getIncoterm(code);
  if (!inc) return false;
  if (inc.group !== "maritime") return true;
  return shippingType === "maritime" || !shippingType;
};
