// Décision produit temporaire : la vérification d'email n'est PAS exigée pour
// se connecter ni pour avancer dans le KYC, le temps de fiabiliser la délivrabilité
// des emails de vérification en production (voir authController.js/kycController.js).
// Repasser REQUIRE_EMAIL_VERIFICATION=true sur Railway pour la réactiver, sans
// redéploiement de code.
export const emailVerificationRequired = () => process.env.REQUIRE_EMAIL_VERIFICATION === "true";
