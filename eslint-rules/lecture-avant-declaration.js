// ── Lecture SYNCHRONE d'une constante avant sa déclaration (zone morte temporelle)
//
// `no-use-before-define` signale aussi les usages différés (une fonction
// déclarée plus haut qui appelle un setter déclaré plus bas), inoffensifs et
// nombreux : 130 faux positifs dans ce dépôt, la règle était donc inutilisable.
// Celle-ci ne retient qu'une référence évaluée DANS LE MÊME CORPS DE FONCTION
// que la déclaration (ni dans une fonction imbriquée, ni dans une classe), et
// située avant elle : c'est exactement ce qui lève « Cannot access 'x' before
// initialization » au rendu d'un composant — panne totale de l'admin le
// 2026-09-08 (tableau de dépendances), page de secours sur la réservation d'un
// chauffeur pour tout visiteur le 2026-09-15 (`a || !!b` avec b déclaré plus bas).
const FONCTIONS = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression", "ClassBody", "StaticBlock"]);
const fonctionEnglobante = (node) => { for (let n = node.parent; n; n = n.parent) if (FONCTIONS.has(n.type)) return n; return null; };

export default {
  meta: { type: "problem", docs: { description: "constante lue avant sa déclaration dans la même fonction (TDZ au rendu)" }, schema: [] },
  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();
    return {
      "Program:exit"() {
        const parcourir = (scope) => {
          for (const variable of scope.variables) {
            const def = variable.defs[0];
            if (!def || def.type !== "Variable" || !["const", "let"].includes(def.parent?.kind)) continue;
            const declFn = fonctionEnglobante(def.node);
            const debut = def.node.range[0];
            for (const ref of variable.references) {
              if (ref.init) continue;
              const id = ref.identifier;
              if (id.range[0] >= debut) continue;
              if (fonctionEnglobante(id) !== declFn) continue; // usage différé : sans risque
              context.report({ node: id, message: `« ${id.name} » est lu avant sa déclaration (ligne ${def.node.loc.start.line}) dans la même fonction : erreur « Cannot access before initialization » à l'exécution.` });
            }
          }
          for (const enfant of scope.childScopes) parcourir(enfant);
        };
        parcourir(sourceCode.scopeManager.globalScope);
      },
    };
  },
};
