import { COMPANY, COMPANY_ADDRESS } from "../constants/company.js";
// Contact centralisé VIT AUTO (backend) — miroir de src/utils/customerServiceContact.js.
// Numéro + adresse dédiée au pays d'inscription du destinataire, jamais un
// placeholder générique. CI = agence Abidjan, tout le reste (dont MA) bascule
// sur le siège Casablanca — même logique que côté front (VehicleDetails,
// Booking, PartnerProfile...).
export function getCustomerServiceContact(country) {
  const isCI = country === "CI";
  return {
    tel:     isCI ? COMPANY.phoneCI : COMPANY.phoneMA,
    display: isCI ? `🇨🇮 ${COMPANY.phoneCIDisplay}` : `🇲🇦 ${COMPANY.phoneMADisplay}`,
    address: isCI ? "Abidjan, Côte d'Ivoire" : COMPANY_ADDRESS,
  };
}
