import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FOLDERS, isPrivateFolderForTest } from "../config/imagekit.js";

// Régression réelle corrigée (audit 2026-09-08).
//
// La passe de sécurité a rendu PRIVÉS sur ImageKit les dossiers contenant des
// pièces d'identité — un fichier privé n'est lisible que par URL signée. Mais
// `vit-auto/drivers` avait été rendu privé EN ENTIER, alors qu'il contient
// aussi du contenu délibérément public :
//
//   • le CV du chauffeur, que le client ouvre avant de réserver
//     (DriverBooking.jsx) et que l'admin consulte en modération ;
//   • sa photo de profil et les images de son véhicule.
//
// Conséquence : pour chaque chauffeur inscrit APRÈS le déploiement, le lien
// « Voir le CV » renvoyait une erreur d'accès — sans message, sans trace, et
// seulement pour les nouveaux profils, donc quasi indétectable.
//
// Ces tests fixent la frontière : le sensible dans `driverDocs`, le public dans
// `drivers`.

describe("Cloisonnement des dossiers privés ImageKit", () => {
  it("le dossier des chauffeurs reste PUBLIC (CV, photo de profil, véhicule)", () => {
    expect(isPrivateFolderForTest(FOLDERS.drivers)).toBe(false);
  });

  it("le sous-dossier des pièces d'identité des chauffeurs est PRIVÉ", () => {
    expect(isPrivateFolderForTest(FOLDERS.driverDocs)).toBe(true);
  });

  it("le sous-dossier privé est bien contenu dans le dossier public", () => {
    // Garantit que la règle de préfixe joue dans le bon sens : un dossier
    // public peut contenir un sous-dossier privé, jamais l'inverse.
    expect(FOLDERS.driverDocs.startsWith(`${FOLDERS.drivers}/`)).toBe(true);
  });

  it("les pièces d'identité et documents de réservation restent privés", () => {
    expect(isPrivateFolderForTest(FOLDERS.kyc)).toBe(true);
    expect(isPrivateFolderForTest(FOLDERS.docs)).toBe(true);
    expect(isPrivateFolderForTest(FOLDERS.bookingDocs)).toBe(true);
  });

  it("les dossiers d'affichage public ne sont jamais privés", () => {
    for (const f of [FOLDERS.vehicles, FOLDERS.avatars, FOLDERS.showrooms, FOLDERS.partners]) {
      expect(isPrivateFolderForTest(f), `${f} ne doit pas être privé`).toBe(false);
    }
  });

  it("le CV du chauffeur est déposé dans le dossier PUBLIC, pas dans le privé", () => {
    // Vérifié sur la source : un CV envoyé dans `driverDocs` redeviendrait
    // illisible pour le client, exactement comme la régression corrigée ici.
    const src = fs.readFileSync(
      path.join(process.cwd(), "controllers/driverController.js"), "utf8"
    );
    const lignesCv = src.split("\n").filter((l) => /uploadBase64Document\(\s*(safeUpdate\.)?cv/.test(l));
    expect(lignesCv.length, "aucun dépôt de CV trouvé — le test est devenu aveugle").toBeGreaterThan(0);
    for (const ligne of lignesCv) {
      expect(ligne, `CV déposé dans un dossier privé : ${ligne.trim()}`).toContain("FOLDERS.drivers");
      expect(ligne).not.toContain("FOLDERS.driverDocs");
    }
  });

  it("les pièces d'identité du chauffeur sont déposées dans le dossier PRIVÉ", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "controllers/driverController.js"), "utf8"
    );
    const lignes = src.split("\n").filter((l) =>
      /uploadBase64Document\(\s*(identityDocument|licenseDocument)/.test(l)
    );
    expect(lignes.length, "aucun dépôt de pièce d'identité trouvé").toBeGreaterThan(0);
    for (const ligne of lignes) {
      expect(ligne, `pièce d'identité déposée en public : ${ligne.trim()}`).toContain("FOLDERS.driverDocs");
    }
  });
});
