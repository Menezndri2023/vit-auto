// ── Comptes de test ────────────────────────────────────────────────────────
//
// La base de production porte des comptes créés par des scripts de test et des
// audits de sécurité. Tant que rien ne les affichait publiquement, ils étaient
// seulement encombrants ; depuis que la page d'accueil met des partenaires en
// avant, ils sont visibles des visiteurs.
//
// La détection repose sur les domaines RÉSERVÉS par la norme (RFC 2606 et
// 6761) : `example.com/net/org` et les extensions `.test`, `.example`,
// `.invalid`, `.localhost`, `.local`. Ces domaines existent précisément pour ne
// jamais appartenir à personne — aucun compte légitime ne peut en porter un, ce
// qui rend ce filtre sûr, contrairement à une recherche du mot « test » dans un
// nom (« Testa », « Tester », un patronyme réel).
export const DOMAINES_RESERVES = [
  "example.com", "example.net", "example.org",
];

export const EXTENSIONS_RESERVEES = ["test", "example", "invalid", "localhost", "local"];

// Expression utilisable telle quelle dans une requête Mongo.
export const REGEX_EMAIL_DE_TEST = new RegExp(
  `@(${DOMAINES_RESERVES.map((d) => d.replace(/\./g, "\\.")).join("|")}` +
  `|[^@]*\\.(${EXTENSIONS_RESERVEES.join("|")}))$`,
  "i"
);

export const estEmailDeTest = (email) => !!email && REGEX_EMAIL_DE_TEST.test(String(email).trim());

// La clause d'exclusion RÉELLE vit dans utils/comptesDeTest.js : elle combine
// ce motif avec le drapeau explicite `User.isTestAccount`. Ne pas en réécrire
// une seconde ici — deux définitions finiraient par diverger.
