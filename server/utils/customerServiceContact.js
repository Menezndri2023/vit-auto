// Contact centralisé VIT AUTO (backend) — miroir de src/utils/customerServiceContact.js.
// Numéro + adresse dédiée au pays d'inscription du destinataire, jamais un
// placeholder générique. CI = agence Abidjan, tout le reste (dont MA) bascule
// sur le siège Casablanca — même logique que côté front (VehicleDetails,
// Booking, PartnerProfile...).
export function getCustomerServiceContact(country) {
  const isCI = country === "CI";
  return {
    tel: isCI ? "+2250748124635" : "+2120607742672",
    display: isCI ? "🇨🇮 +225 07 48 12 46 35" : "🇲🇦 +212 06 07 74 26 72",
    address: isCI ? "Abidjan, Côte d'Ivoire" : "Route 1029, Hay Sidi Maârouf, Casablanca, Maroc",
  };
}
