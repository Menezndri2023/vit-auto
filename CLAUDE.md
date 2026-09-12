## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Règle absolue : tester localement avant tout push (consigne de l'exploitant, 2026-09-11/12)

Rien ne part en production sans vérification locale dans les conditions de production.
Le hook `.githooks/pre-push` la rend mécanique — l'installer une fois par clone :

    npm run hooks:install

Il enchaîne : tests front → build → **API locale** (`npm run api:local` : MongoDB en
mémoire, données semées, administrateur jetable — rien ne touche la production ni son
limiteur, aucun mot de passe réel) → `preview:csp` (dist/ servi avec les en-têtes de
vercel.json, CSP comprise, relais /api et /socket.io vers l'API locale) → balayage
navigateur (`scripts/verifierLocalement.mjs` : service worker sur 2ᵉ navigation, police,
requêtes en échec, images, débordements, visiteur qui revient, pages connectées, OCR du KYC
sous CSP, tous les onglets admin) → tests serveur ciblés.
Contre la production, à la main : `VERIF_ADMIN_ID=… VERIF_ADMIN_PWD=… node
scripts/verifierLocalement.mjs https://vit-auto.com` (attention au limiteur 200 req/5 min).

Avant une modification lourde du serveur, lancer aussi la suite complète, SEULE :
`cd server && npx vitest run --maxWorkers=1` (≈ 1 h). Ne jamais lancer deux tâches lourdes
en parallèle (conflits de port mongodb-memory-server).
`git push --no-verify` est un contournement conscient, à ne pas utiliser.
