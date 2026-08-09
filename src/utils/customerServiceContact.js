// Contact centralisé VIT AUTO — les appels ne passent plus jamais directement
// chez un partenaire, uniquement sur le numéro de service client dédié au
// pays de l'annonce/du profil (Maroc ou Côte d'Ivoire). Valeurs reprises
// telles quelles de la refonte initiale (VehicleDetails.jsx) pour centraliser
// la source de vérité plutôt que de la dupliquer à chaque nouvel écran
// (PartnerProfile, PartnerShowroomPublic...).
export function getCustomerServiceContact(country) {
  const isCI = country === "CI";
  return {
    tel: isCI ? "+2250748124635" : "+2120607742672",
    display: isCI ? "🇨🇮 +225 07 48 12 46 35" : "🇲🇦 +212 06 07 74 26 72",
  };
}
