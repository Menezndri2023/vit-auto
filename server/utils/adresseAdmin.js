// ── L'adresse du compte administrateur ─────────────────────────────────────
//
// Elle valait « admin@vitauto.ci » par défaut dans quatre scripts. Ce domaine
// n'a jamais existé : mesuré le 2026-09-25 sur les journaux d'envoi, **57
// e-mails y ont rebondi en 90 jours** — de loin la première adresse en échec,
// et la seule qui ne soit pas un compte de test. Litiges, KYC, signalements,
// rapports : tout ce que la plateforme adressait à son propre administrateur
// tombait dans le vide, sans que rien ne le signale à l'écran.
//
// Pire que les notifications perdues : le compte administrateur était UNIQUE,
// et « mot de passe oublié » part vers l'adresse DU COMPTE. Une adresse morte
// y rendait le compte irrécupérable autrement que par un script.
//
// Précision de l'exploitant, le même jour : « admin@vitauto.ci n'est rattaché
// à aucun e-mail, le seul mail de VIT AUTO est contact@vit-auto.com ».
export const ADRESSE_VIT_AUTO = "contact@vit-auto.com";

// Un défaut qui ne peut pas recevoir est pire que pas de défaut : il marche en
// apparence et échoue en silence. Les scripts exigent donc une adresse, plutôt
// que d'en inventer une.
export function adresseAdminRequise(fournie, { variable = "ADMIN_SEED_EMAIL" } = {}) {
  const valeur = String(fournie || "").trim();
  if (!valeur) {
    throw new Error(
      `Aucune adresse d'administrateur fournie.\n` +
      `  Passez-la en argument, ou définissez ${variable}.\n` +
      `  Adresse de la plateforme : ${ADRESSE_VIT_AUTO}`,
    );
  }
  return valeur.toLowerCase();
}
