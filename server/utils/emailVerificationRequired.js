// Connexion (authController.js login).
//
// Faille corrigée (audit sécurité 2026-09) : la vérification n'était exigée
// nulle part, et `register` délivrait immédiatement une session complète. On
// pouvait donc s'inscrire avec l'adresse d'un TIERS qu'on ne contrôle pas,
// obtenir un accès valide, naviguer sous l'identité e-mail de la victime auprès
// des partenaires — et squatter l'adresse au passage, la vraie personne se
// heurtant ensuite à « adresse déjà utilisée ».
//
// La bascule ne peut pas être rétroactive : des comptes réels n'ont jamais
// confirmé leur adresse (6 recensés le 2026-07-25) et se retrouveraient
// verrouillés du jour au lendemain. L'exigence ne s'applique donc qu'aux
// comptes créés À PARTIR de cette date — les comptes antérieurs gardent
// l'accès, la faille est fermée pour tous les nouveaux.
//
// REQUIRE_EMAIL_VERIFICATION_LOGIN=true étend l'exigence à TOUS les comptes ;
// =false la désactive entièrement (garde-fou en cas de souci de délivrabilité).
export const EMAIL_VERIFICATION_CUTOFF = new Date("2026-09-08T00:00:00Z");

export function emailVerificationRequiredForLogin(user) {
  const flag = process.env.REQUIRE_EMAIL_VERIFICATION_LOGIN;
  if (flag === "true")  return true;   // exigé pour tout le monde
  if (flag === "false") return false;  // désactivé partout
  // Défaut : uniquement les comptes créés après la bascule.
  return !!user?.createdAt && new Date(user.createdAt) >= EMAIL_VERIFICATION_CUTOFF;
}

// Poursuite du parcours KYC (KYC.jsx step 1, voir getKycStatus) : redevient
// obligatoire par défaut depuis le 2026-07-25 — un compte non confirmé ne peut
// plus avancer dans son inscription/KYC. Garde-fou conservé : en cas de nouveau
// souci de délivrabilité SMTP, positionner REQUIRE_EMAIL_VERIFICATION_KYC=false
// pour désactiver temporairement, sans redéploiement de code.
export const emailVerificationRequiredForKyc = () => process.env.REQUIRE_EMAIL_VERIFICATION_KYC !== "false";
