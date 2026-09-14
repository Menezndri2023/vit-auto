// Unités de facturation d'une mission chauffeur (miroir de
// bookingController, type "chauffeur") et libellé de durée affiché sur les
// commandes : « 2 jours », « 1 demi-journée », « 4 h ».
export const UNITES_CHAUFFEUR = {
  heure:        { label: "À l'heure",        unite: "h",             heures: 1 },
  demi_journee: { label: "Demi-journée",     unite: "demi-journée",  heures: 4 },
  journee:      { label: "Journée complète", unite: "jour",          heures: 24 },
};

export function libelleDureeChauffeur(chauffeur) {
  if (!chauffeur) return "—";
  const { unite, quantite, heures } = chauffeur;
  const n = Number(quantite) || 0;
  if (unite === "journee" && n)      return `${n} jour${n > 1 ? "s" : ""}`;
  if (unite === "demi_journee" && n) return `${n} demi-journée${n > 1 ? "s" : ""}`;
  if (heures) return `${heures} h`;
  return "—";
}
