// ── Composant JSX jamais importé ────────────────────────────────────────────
//
// `no-undef` (ESLint) ne regarde PAS les noms de balises JSX : `<ClientDocuments />`
// sans import passe le lint, passe le build (Vite/esbuild ne résolvent pas les
// identifiants), et explose en production au premier rendu — ReferenceError,
// page entière remplacée par la frontière d'erreur. Vu le 2026-09-16 sur
// l'onglet KYC de l'admin (« Afficher les pièces justificatives ») après la
// découpe d'AdminPanel en sections : l'extraction avait emporté l'appel, pas
// l'import. Cette règle fait pour les balises JSX ce que no-undef fait pour
// le reste : une balise dont le nom commence par une majuscule doit résoudre
// vers une déclaration (import, const, function, paramètre) dans la portée.
export default {
  meta: {
    type: "problem",
    docs: { description: "Balise JSX en majuscule sans déclaration dans la portée (composant jamais importé)." },
    schema: [],
    messages: { nonDefini: "« {{nom}} » est utilisé comme composant mais n'est ni importé ni déclaré : ReferenceError au rendu." },
  },
  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();
    const estDefini = (scope, nom) => {
      for (let s = scope; s; s = s.upper) {
        if (s.set && s.set.has(nom)) return true;
        if (s.variables && s.variables.some((v) => v.name === nom)) return true;
      }
      return false;
    };
    return {
      JSXOpeningElement(node) {
        let racine = node.name;
        // <Foo.Bar /> : seule la racine « Foo » doit exister.
        while (racine.type === "JSXMemberExpression") racine = racine.object;
        if (racine.type !== "JSXIdentifier") return;
        const nom = racine.name;
        if (!/^[A-Z]/.test(nom)) return; // <div>, <svg> : balises natives
        const scope = sourceCode.getScope ? sourceCode.getScope(node) : context.getScope();
        if (estDefini(scope, nom)) return;
        context.report({ node: racine, messageId: "nonDefini", data: { nom } });
      },
    };
  },
};
