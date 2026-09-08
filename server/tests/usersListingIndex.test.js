import { describe, it, expect, beforeAll } from "vitest";
import User from "../models/User.js";
import { getUsers } from "../controllers/usersController.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Signalement : « Comptes — Erreur serveur » dans l'administration, alors que
// toutes les autres sections fonctionnaient.
//
// Cause : usersController.getUsers trie par { createdAt: -1 }, mais le modèle
// User était le SEUL modèle listé par l'admin sans index sur createdAt
// (Booking, Vehicle et Driver l'ont tous). Sans index, MongoDB doit trier la
// collection ENTIÈRE en mémoire — une étape SORT bloquante, refusée au-delà de
// 32 Mo (« Sort exceeded memory limit … did not opt in to external sorting »).
// Les comptes portant une photo de profil ou un logo en base64, cette limite
// est atteinte dès quelques centaines d'utilisateurs : l'onglet renvoyait 500
// en production tout en fonctionnant en développement sur un petit jeu de
// données — ce qui rendait le bug invisible aux tests classiques.
//
// Ces tests vérifient la CAUSE (le plan d'exécution), pas seulement le
// symptôme : un tri qui repasserait en mémoire les ferait échouer, même sur
// une base minuscule.

describe("Liste des comptes admin — le tri doit passer par un index", () => {
  beforeAll(async () => {
    await User.init(); // garantit que les index déclarés sont construits
  });

  const hasBlockingSort = (plan) => {
    if (!plan || typeof plan !== "object") return false;
    if (plan.stage === "SORT") return true;
    return Object.values(plan).some((v) =>
      Array.isArray(v) ? v.some(hasBlockingSort) : hasBlockingSort(v)
    );
  };

  it("le tri par date de création n'est jamais fait en mémoire", async () => {
    const explain = await User.find({}).sort({ createdAt: -1 }).limit(200).explain();
    expect(
      hasBlockingSort(explain.queryPlanner?.winningPlan),
      "étape SORT bloquante détectée : l'index { createdAt: -1 } manque sur User"
    ).toBe(false);
  });

  it("le tri reste indexé quand l'admin filtre par rôle", async () => {
    const explain = await User.find({ role: "partenaire" }).sort({ createdAt: -1 }).limit(200).explain();
    expect(
      hasBlockingSort(explain.queryPlanner?.winningPlan),
      "étape SORT bloquante détectée : l'index { role: 1, createdAt: -1 } manque sur User"
    ).toBe(false);
  });

  it("la liste ne renvoie aucun champ volumineux inutile à l'affichage", async () => {
    // Ces champs (photos, logo, OCR intégral) pèsent plusieurs Mo une fois
    // multipliés par des centaines de comptes, et aucune colonne ne les affiche.
    const admin = await createUser({ role: "admin", adminScope: ["super_admin"] });
    await createUser({
      role: "partenaire",
      profilePhoto: "data:image/png;base64,AAAA",
      business: { companyName: "Test SARL", logo: "data:image/png;base64,BBBB" },
      kycOcrData: { rawText: "x".repeat(500) },
    });

    const { req, res } = mockReqRes({ user: admin, query: { limit: "200" } });
    await getUsers(req, res);

    expect(res.status).not.toHaveBeenCalledWith(500);
    const partenaire = res.body.users.find((u) => u.role === "partenaire");
    expect(partenaire).toBeTruthy();
    expect(partenaire.kycOcrData).toBeUndefined();
    expect(partenaire.business?.logo).toBeUndefined();
    // La photo de profil reste renvoyée : la liste l'affiche en vignette.
    expect(partenaire.profilePhoto).toBeTruthy();
    // Le nom de l'entreprise, lui, est conservé.
    expect(partenaire.business?.companyName).toBe("Test SARL");
  });
});
