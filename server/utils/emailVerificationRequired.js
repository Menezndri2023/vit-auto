// RÈGLE DE VÉRIFICATION DE L'ADRESSE E-MAIL — décision du 2026-09-08.
//
// L'adresse e-mail est vérifiée UNE SEULE FOIS, à l'INSCRIPTION. La connexion
// ne l'exige jamais.
//
// Un portillon `emailVerificationRequiredForLogin()` a existé ici brièvement,
// posé lors de l'audit de sécurité au motif qu'on pouvait s'inscrire avec
// l'adresse d'un tiers. Il était redondant : l'inscription est DÉJÀ bloquante
// sur la saisie du code reçu par e-mail (Register.jsx, étape « code », qui
// résiste même à un rechargement de page). La vérification a donc bien lieu, au
// bon endroit, une seule fois. L'exiger de nouveau à chaque connexion
// n'apportait aucune sécurité supplémentaire — seulement le risque d'enfermer
// dehors un compte légitime le jour où un e-mail de confirmation se perd.
// Fonction supprimée plutôt que neutralisée : une garde désactivée finit
// toujours par être réactivée par mégarde.

// Poursuite du parcours KYC (KYC.jsx step 1, voir getKycStatus) : obligatoire
// par défaut depuis le 2026-07-25 — un compte non confirmé ne peut pas avancer
// dans son parcours d'identité. Garde-fou conservé : en cas de souci de
// délivrabilité SMTP, positionner REQUIRE_EMAIL_VERIFICATION_KYC=false pour
// désactiver temporairement, sans redéploiement de code.
export const emailVerificationRequiredForKyc = () => process.env.REQUIRE_EMAIL_VERIFICATION_KYC !== "false";
