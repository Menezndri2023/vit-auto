// ── Workflows de prospects (leads) ──────────────────────────────────────────
//
// Un lead VIT AUTO suit une machine à états propre à son activité. La première
// est la vente par demande d'essai (SALE_TEST_DRIVE) ; d'autres pourront
// s'ajouter ici (demande de devis flotte, financement…) sans toucher au modèle
// SalesLead ni au service : chacun ne lit que la table du workflow porté par le
// lead (voir salesLeadService.transition).
//
// Volontairement séparé de la machine à états de Booking (bookingController
// VALID_TRANSITIONS) : un lead n'est pas une commande — pas de paiement, pas de
// validation admin obligatoire, pas de contrat. Voir docs/vente-demande-essai.md.

export const SALE_LEAD_STATUSES = [
  "NEW",
  "QUALIFYING",
  "SENT_TO_PARTNER",
  "PARTNER_ACCEPTED",
  "ALTERNATIVE_PROPOSED",
  "CUSTOMER_CONFIRMED",
  "TEST_DRIVE_SCHEDULED",
  "TEST_DRIVE_COMPLETED",
  "CUSTOMER_INTERESTED",
  "NEGOTIATION",
  "SALE_PENDING",
  "SOLD",
  "LOST",
  "CUSTOMER_NO_SHOW",
  "CANCELLED",
];

// Libellés affichés (partenaire, client, admin) — une seule source pour les
// trois surfaces.
export const SALE_LEAD_LABELS = {
  NEW:                  "Nouvelle demande",
  QUALIFYING:           "Qualification en cours",
  SENT_TO_PARTNER:      "Transmise au vendeur",
  PARTNER_ACCEPTED:     "Acceptée par le vendeur",
  ALTERNATIVE_PROPOSED: "Nouveau créneau proposé",
  CUSTOMER_CONFIRMED:   "Confirmée par le client",
  TEST_DRIVE_SCHEDULED: "Essai confirmé",
  TEST_DRIVE_COMPLETED: "Essai réalisé",
  CUSTOMER_INTERESTED:  "Client intéressé",
  NEGOTIATION:          "Négociation en cours",
  SALE_PENDING:         "Vente en attente de confirmation",
  SOLD:                 "Vente conclue",
  LOST:                 "Opportunité perdue",
  CUSTOMER_NO_SHOW:     "Client absent",
  CANCELLED:            "Demande annulée",
};

// Étapes du funnel admin (§17) : chaque statut appartient à UNE étape, la
// dernière atteinte l'emportant.
export const SALE_LEAD_FUNNEL = [
  { key: "leads",         label: "Leads",            statuses: ["NEW", "QUALIFYING"] },
  { key: "requests",      label: "Demandes d'essai", statuses: ["SENT_TO_PARTNER", "PARTNER_ACCEPTED", "ALTERNATIVE_PROPOSED", "CUSTOMER_CONFIRMED"] },
  { key: "test_drives",   label: "Essais",           statuses: ["TEST_DRIVE_SCHEDULED", "TEST_DRIVE_COMPLETED", "CUSTOMER_NO_SHOW"] },
  { key: "opportunities", label: "Opportunités",     statuses: ["CUSTOMER_INTERESTED"] },
  { key: "negotiations",  label: "Négociations",     statuses: ["NEGOTIATION", "SALE_PENDING"] },
  { key: "sales",         label: "Ventes",           statuses: ["SOLD"] },
];

const SALE_LEAD_TRANSITIONS = {
  NEW:                  ["QUALIFYING", "SENT_TO_PARTNER", "CANCELLED"],
  QUALIFYING:           ["SENT_TO_PARTNER", "LOST", "CANCELLED"],
  SENT_TO_PARTNER:      ["PARTNER_ACCEPTED", "ALTERNATIVE_PROPOSED", "LOST", "CANCELLED"],
  // L'acceptation du créneau demandé vaut confirmation client (c'est SON
  // créneau) : le lead passe aussitôt à l'essai programmé, en une transaction.
  // Une demande de RAPPEL (sans date) s'arrête ici : le vendeur rappelle puis
  // déclare directement le résultat commercial.
  PARTNER_ACCEPTED:     ["TEST_DRIVE_SCHEDULED", "CUSTOMER_INTERESTED", "NEGOTIATION", "SALE_PENDING", "LOST", "CANCELLED"],
  ALTERNATIVE_PROPOSED: ["CUSTOMER_CONFIRMED", "SENT_TO_PARTNER", "LOST", "CANCELLED"],
  CUSTOMER_CONFIRMED:   ["TEST_DRIVE_SCHEDULED", "CANCELLED"],
  TEST_DRIVE_SCHEDULED: ["TEST_DRIVE_COMPLETED", "CUSTOMER_NO_SHOW", "SALE_PENDING", "LOST", "CANCELLED"],
  CUSTOMER_NO_SHOW:     ["TEST_DRIVE_SCHEDULED", "LOST", "CANCELLED"],
  TEST_DRIVE_COMPLETED: ["CUSTOMER_INTERESTED", "NEGOTIATION", "SALE_PENDING", "LOST"],
  CUSTOMER_INTERESTED:  ["NEGOTIATION", "SALE_PENDING", "LOST"],
  NEGOTIATION:          ["SALE_PENDING", "LOST"],
  SALE_PENDING:         ["SOLD", "NEGOTIATION", "LOST"],
  SOLD:                 [],
  LOST:                 ["NEGOTIATION"], // réouverture (admin uniquement — voir service)
  CANCELLED:            [],
};

// Résultats déclarés par le partenaire après la date d'essai (§9).
export const TEST_DRIVE_OUTCOMES = ["completed", "no_show", "postponed"];
export const COMMERCIAL_OUTCOMES = ["interested", "negotiation", "sold", "not_interested", "sold_elsewhere", "other"];

// Réponses du client au suivi automatique (§10).
export const FOLLOW_UP_RESPONSES = ["interested", "offer", "thinking", "not_interested"];

export const LEAD_WORKFLOWS = {
  SALE_TEST_DRIVE: {
    statuses:    SALE_LEAD_STATUSES,
    labels:      SALE_LEAD_LABELS,
    transitions: SALE_LEAD_TRANSITIONS,
    initial:     "NEW",
    terminal:    ["SOLD", "LOST", "CANCELLED"],
    funnel:      SALE_LEAD_FUNNEL,
  },
};

export function getWorkflow(key) {
  return LEAD_WORKFLOWS[key] || LEAD_WORKFLOWS.SALE_TEST_DRIVE;
}

export function canTransition(workflowKey, from, to) {
  const wf = getWorkflow(workflowKey);
  return (wf.transitions[from] || []).includes(to);
}

export function funnelStageOf(workflowKey, status) {
  const wf = getWorkflow(workflowKey);
  return wf.funnel.find((s) => s.statuses.includes(status))?.key || null;
}
