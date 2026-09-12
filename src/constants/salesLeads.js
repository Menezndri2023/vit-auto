// Miroir de server/constants/leadWorkflows.js — libellés et regroupements du
// parcours « vente par demande d'essai » (docs/vente-demande-essai.md).
// Le serveur reste seul juge des transitions ; ici uniquement de l'affichage.

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

// Couleur de badge par statut (fond, texte).
export const SALE_LEAD_COLORS = {
  NEW:                  ["#e0e7ff", "#3730a3"],
  QUALIFYING:           ["#e0e7ff", "#3730a3"],
  SENT_TO_PARTNER:      ["#fef3c7", "#92400e"],
  PARTNER_ACCEPTED:     ["#dcfce7", "#166534"],
  ALTERNATIVE_PROPOSED: ["#fde68a", "#78350f"],
  CUSTOMER_CONFIRMED:   ["#dcfce7", "#166534"],
  TEST_DRIVE_SCHEDULED: ["#dcfce7", "#166534"],
  TEST_DRIVE_COMPLETED: ["#dbeafe", "#1e40af"],
  CUSTOMER_INTERESTED:  ["#ede9fe", "#5b21b6"],
  NEGOTIATION:          ["#ede9fe", "#5b21b6"],
  SALE_PENDING:         ["#fef3c7", "#92400e"],
  SOLD:                 ["#bbf7d0", "#14532d"],
  LOST:                 ["#fee2e2", "#991b1b"],
  CUSTOMER_NO_SHOW:     ["#fee2e2", "#991b1b"],
  CANCELLED:            ["#e5e7eb", "#374151"],
};

// Filtres « Mes opportunités » (§15) — chaque entrée regroupe des statuts.
export const PARTNER_LEAD_FILTERS = [
  { key: "all",        label: "Tout" },
  { key: "new",        label: "Nouveau lead",       statuses: ["SENT_TO_PARTNER"] },
  { key: "requests",   label: "Demande d'essai",    statuses: ["SENT_TO_PARTNER", "ALTERNATIVE_PROPOSED", "PARTNER_ACCEPTED", "CUSTOMER_CONFIRMED"] },
  { key: "scheduled",  label: "Essai confirmé",     statuses: ["TEST_DRIVE_SCHEDULED"] },
  { key: "completed",  label: "Essai réalisé",      statuses: ["TEST_DRIVE_COMPLETED", "CUSTOMER_NO_SHOW"] },
  { key: "interested", label: "Client intéressé",   statuses: ["CUSTOMER_INTERESTED"] },
  { key: "negotiation",label: "Négociation",        statuses: ["NEGOTIATION", "SALE_PENDING"] },
  { key: "sold",       label: "Vente conclue",      statuses: ["SOLD"] },
  { key: "lost",       label: "Opportunité perdue", statuses: ["LOST", "CANCELLED"] },
];

export const SLOT_LABELS = { morning: "Matin", afternoon: "Après-midi", evening: "Soir", custom: "Créneau personnalisé" };

export const HISTORY_LABELS = {
  lead_created:                  "Demande envoyée",
  lead_qualified:                "Lead qualifié",
  qualification_required:        "Qualification par VIT AUTO",
  lead_qualified_by_admin:       "Qualifié par VIT AUTO",
  lead_sent_to_partner:          "Transmise au vendeur",
  partner_reminder_1:            "Rappel envoyé au vendeur",
  partner_reminder_2:            "Rappel renforcé envoyé au vendeur",
  partner_response_escalated:    "Intervention VIT AUTO",
  partner_accepted:              "Vendeur : demande acceptée",
  contact_disclosed:             "Coordonnées transmises au vendeur",
  appointment_confirmed:         "Rendez-vous confirmé",
  alternative_proposed:          "Vendeur : autre créneau proposé",
  customer_confirmed_alternative:"Client : créneau accepté",
  customer_chose_other_slot:     "Client : autre créneau souhaité",
  partner_refused:               "Vendeur : demande refusée",
  lead_cancelled:                "Demande annulée",
  outcome_requested:             "Résultat demandé au vendeur",
  test_drive_postponed:          "Essai reporté",
  customer_no_show:              "Client absent à l'essai",
  test_drive_rescheduled:        "Essai reprogrammé",
  test_drive_completed:          "Essai réalisé",
  test_drive_completed_by_client:"Essai réalisé (confirmé par le client)",
  outcome_interested:            "Client intéressé",
  outcome_negotiation:           "Négociation en cours",
  outcome_not_interested:        "Client non intéressé",
  outcome_sold_elsewhere:        "Véhicule vendu à un autre client",
  outcome_other:                 "Autre résultat",
  customer_follow_up_sent:       "Message de suivi envoyé au client",
  customer_interested:           "Client : souhaite poursuivre",
  customer_wants_to_make_offer:  "Client : souhaite faire une offre",
  customer_thinking:             "Client : réfléchit encore",
  customer_not_interested:       "Client : plus intéressé",
  sale_declared:                 "Vente déclarée par le vendeur",
  commission_computed:           "Commission calculée",
  sale_confirmed:                "Vente confirmée par VIT AUTO",
  sale_rejected:                 "Déclaration de vente non confirmée",
  admin_status_override:         "Statut modifié par VIT AUTO",
  admin_assigned:                "Prise en charge VIT AUTO",
  partner_note:                  "Note du vendeur",
};

export function fmtLeadDate(d, withTime = false) {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date)) return "";
  return date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    + (withTime ? ` ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : "");
}

export function fmtResponseTime(ms) {
  if (!Number.isFinite(ms)) return "—";
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 48 ? `${h} h ${String(min % 60).padStart(2, "0")}` : `${Math.round(h / 24)} j`;
}
