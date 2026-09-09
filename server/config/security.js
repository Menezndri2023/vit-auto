// ── Coût de hachage bcrypt ───────────────────────────────────────────────────
//
// Deux coûts distincts, et ce n'est pas un hasard :
//   • PASSWORD_ROUNDS (12) — mots de passe. Ils vivent des années, un vol de
//     base doit rester inexploitable le plus longtemps possible.
//   • CODE_ROUNDS (10) — codes e-mail, OTP, codes de secours 2FA. Ils expirent
//     en minutes et sont à usage unique : la lenteur y protège beaucoup moins,
//     et se paie à chaque envoi.
//
// EN TEST, les deux tombent à 4. bcrypt est délibérément lent, et c'est lui qui
// domine le temps d'exécution de la suite : à coût 12, le seul fichier de tests
// d'authentification prend 67 s et dépasse la limite de 15 s par test dès que la
// machine est chargée — trois fausses alertes rien que dans la journée du
// 2026-09-09, chacune coûtant une suite complète de 65 minutes pour être
// écartée.
//
// Baisser le coût en test ne fausse rien : bcrypt lit le coût DANS le hash au
// moment de la comparaison. Un hash produit à 12 en production se vérifie
// normalement, quel que soit le réglage utilisé ailleurs.
const EN_TEST = process.env.NODE_ENV === "test";

export const PASSWORD_ROUNDS = EN_TEST ? 4 : 12;
export const CODE_ROUNDS     = EN_TEST ? 4 : 10;
