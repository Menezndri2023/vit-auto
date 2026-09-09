import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.js"],
    hookTimeout: 30000, // MongoMemoryReplSet démarre un vrai replica set mongod au 1er run de chaque fichier
    // 30 s et non 15 : plusieurs tests font du VRAI travail — hachage bcrypt,
    // TOTP, écritures successives sur un replica set en mémoire. Le fichier
    // d'authentification à lui seul dure ~55 s au total. À 15 s, un test
    // légitime dépassait dès que la machine était chargée (suite complète en
    // arrière-plan, autre session sur le poste) : trois fausses alertes dans la
    // seule journée du 2026-09-09, chacune coûtant une suite de 65 minutes pour
    // être écartée. Un test qui échoue par manque de temps CPU n'apprend rien —
    // il apprend seulement à ne plus croire la suite.
    //
    // Ce plafond ne masque aucun défaut produit : une boucle infinie ou un
    // blocage réel dépasse 30 s aussi sûrement que 15.
    testTimeout: 30000,
    // Chaque fichier démarre déjà sa PROPRE instance MongoMemoryReplSet (voir
    // tests/setup.js) — aucun état n'est partagé entre fichiers, donc les
    // exécuter en parallèle est sûr en principe. Un parallélisme non borné
    // (14 fichiers = 14 replica sets mongod simultanés) a cependant saturé la
    // machine de dev et fait timeout des tests par manque de ressources —
    // maxWorkers plafonne le nombre de fichiers exécutés en même temps.
    maxWorkers: 4,
  },
});
