import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.js"],
    hookTimeout: 30000, // MongoMemoryReplSet démarre un vrai replica set mongod au 1er run de chaque fichier
    testTimeout: 15000,
    // Chaque fichier démarre déjà sa PROPRE instance MongoMemoryReplSet (voir
    // tests/setup.js) — aucun état n'est partagé entre fichiers, donc les
    // exécuter en parallèle est sûr en principe. Un parallélisme non borné
    // (14 fichiers = 14 replica sets mongod simultanés) a cependant saturé la
    // machine de dev et fait timeout des tests par manque de ressources —
    // maxWorkers plafonne le nombre de fichiers exécutés en même temps.
    maxWorkers: 4,
  },
});
