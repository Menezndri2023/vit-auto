// Connexion (authController.js login) : reste NON bloquant par défaut. 6 comptes
// réels en production n'ont jamais confirmé leur email (vérifié le 2026-07-25,
// avant de changer ce défaut) — les basculer en blocage rétroactif les aurait
// verrouillés hors de leur compte du jour au lendemain. Positionner
// REQUIRE_EMAIL_VERIFICATION_LOGIN=true pour l'activer, sans redéploiement.
export const emailVerificationRequiredForLogin = () => process.env.REQUIRE_EMAIL_VERIFICATION_LOGIN === "true";

// Poursuite du parcours KYC (KYC.jsx step 1, voir getKycStatus) : redevient
// obligatoire par défaut depuis le 2026-07-25 — un compte non confirmé ne peut
// plus avancer dans son inscription/KYC. Garde-fou conservé : en cas de nouveau
// souci de délivrabilité SMTP, positionner REQUIRE_EMAIL_VERIFICATION_KYC=false
// pour désactiver temporairement, sans redéploiement de code.
export const emailVerificationRequiredForKyc = () => process.env.REQUIRE_EMAIL_VERIFICATION_KYC !== "false";
