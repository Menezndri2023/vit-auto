// ══════════════════════════════════════════════════════════════════════════════
// DROIT DE PUBLIER — garde unique
// ══════════════════════════════════════════════════════════════════════════════
// La même règle était recopiée à CINQ endroits : création de véhicule, de
// chauffeur, d'activité de loisir, import de flotte, publication de showroom.
// Cinq copies d'une règle de sécurité, c'est quatre qui suivent une évolution
// et une qui ne la suit pas — et la cinquième est un trou qu'aucun test
// existant ne montre, puisque chaque contrôleur teste le sien.
//
// La règle :
//  • un particulier publie dès que son identité est vérifiée (KYC) ;
//  • un professionnel/une entreprise doit être certifié ;
//  • un Founding Partner est dispensé (vérifié à la signature) ;
//  • une autorisation provisoire, à durée limitée, peut ouvrir la publication
//    à un professionnel non encore certifié — sans lui donner de badge.

// L'autorisation provisoire ne couvre QUE la certification d'entité, jamais le
// KYC d'identité d'un particulier. Les deux ne pèsent pas le même risque :
// l'un atteste d'une entreprise, l'autre de la personne physique responsable.
export function autorisationProvisoireActive(user, now = new Date()) {
  const jusquA = user?.provisionalPublishingUntil;
  return !!jusquA && new Date(jusquA).getTime() > now.getTime();
}

// « avant de publier » mais « avant d'importer » : l'élision devant voyelle.
// Les cinq messages d'origine étaient écrits à la main et l'avaient chacun ;
// une phrase composée mécaniquement la perd, et « avant de importer » se
// remarque immédiatement dans un message d'erreur montré à un partenaire.
const avantDe = (action) => (/^[aeiouyâàéèêëîïôöûü]/i.test(action) ? `avant d'${action}` : `avant de ${action}`);

// Renvoie `null` quand la publication est permise, sinon le refus prêt à être
// renvoyé tel quel : `{ code, message }`. `action` complète la phrase
// « … avant de <action>. » — c'est la seule chose qui variait entre les cinq
// copies.
export function refusDePublication(user, action = "publier une annonce", now = new Date()) {
  if (!user || user.role !== "partenaire" || user.isFounder) return null;

  if (user.sellerType === "particulier") {
    if (user.kycStatus !== "VERIFIE") {
      return {
        code: "KYC_REQUIRED",
        message: `Complétez votre vérification d'identité (pièce d'identité + selfie) ${avantDe(action)}.`,
      };
    }
    return null;
  }

  if (user.certificationBadge !== "none") return null;
  if (autorisationProvisoireActive(user, now)) return null;

  return {
    code: "CERTIFICATION_REQUIRED",
    message: `Complétez votre vérification partenaire ${avantDe(action)}.`,
  };
}
