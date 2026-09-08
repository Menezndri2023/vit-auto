import { COMPANY } from "../constants/company.js";

// Contact centralisé VIT AUTO — les appels ne passent plus jamais directement
// chez un partenaire, uniquement sur le numéro de service client dédié au
// pays de l'annonce/du profil (Maroc ou Côte d'Ivoire).
//
// Les numéros eux-mêmes vivent désormais dans constants/company.js, avec le
// reste de l'identité de l'entreprise : ils étaient recopiés à la main ici, au
// pied de page, dans l'aide, la politique de confidentialité et les mentions
// légales. Le lien marocain y traînait le préfixe national « 0 » — invalide en
// composition internationale — dans les cinq endroits à la fois.
export function getCustomerServiceContact(country) {
  const isCI = country === "CI";
  return {
    tel:     isCI ? COMPANY.phoneCI : COMPANY.phoneMA,
    display: isCI ? `🇨🇮 ${COMPANY.phoneCIDisplay}` : `🇲🇦 ${COMPANY.phoneMADisplay}`,
  };
}
