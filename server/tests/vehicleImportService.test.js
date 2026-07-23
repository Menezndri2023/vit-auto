import { describe, it, expect } from "vitest";
import { parseUploadedFile, mapRowToVehicleInput, countRecognizedColumns } from "../services/vehicleImportService.js";

// Fonctions pures (aucune DB) — reproduisent le bug de production signalé :
// un fichier rempli à partir du template affichait "0 créé, 0 doublon, 299
// erreur" sur la quasi-totalité du batch, sans qu'aucun message ne dise
// pourquoi. Cause la plus probable : un CSV réexporté depuis Excel/LibreOffice
// en locale française (séparateur ";" au lieu de ",") était lu comme une seule
// colonne géante par ligne — aucun champ ne correspondait plus jamais à un
// en-tête attendu.
describe("vehicleImportService — parsing robuste", () => {
  it("parse un CSV séparé par des virgules (cas standard)", async () => {
    const csv = "Titre,Marque,Modele,Annee,TypeAnnonce\nToyota Corolla 2020,Toyota,Corolla,2020,location\n";
    const rows = await parseUploadedFile(Buffer.from(csv, "utf8"), "flotte.csv");

    expect(rows).toHaveLength(1);
    const { data } = mapRowToVehicleInput(rows[0]);
    expect(data.type).toBe("location");
    expect(data.marque).toBe("Toyota");
  });

  it("parse un CSV séparé par des points-virgules (export Excel/LibreOffice FR)", async () => {
    const csv = "Titre;Marque;Modele;Annee;TypeAnnonce\nToyota Corolla 2020;Toyota;Corolla;2020;location\n";
    const rows = await parseUploadedFile(Buffer.from(csv, "utf8"), "flotte.csv");

    expect(rows).toHaveLength(1);
    const { data } = mapRowToVehicleInput(rows[0]);
    expect(data.type).toBe("location");
    expect(data.marque).toBe("Toyota");
  });

  it("mapRowToVehicleInput tolère la casse et les espaces superflus dans les en-têtes", () => {
    const { data } = mapRowToVehicleInput({ " typeannonce ": "Location", "MARQUE": "Toyota" });
    expect(data.type).toBe("location");
    expect(data.marque).toBe("Toyota");
  });

  it("countRecognizedColumns détecte 0 colonne reconnue sur un fichier hors-template", () => {
    const { recognized } = countRecognizedColumns([{ ColonneInconnue: "x", AutreColonne: "y" }], "vehicle");
    expect(recognized).toBe(0);
  });

  it("countRecognizedColumns reconnaît les colonnes d'un fichier basé sur le template", () => {
    const { recognized, expected } = countRecognizedColumns(
      [{ Titre: "x", Marque: "y", TypeAnnonce: "location" }],
      "vehicle"
    );
    expect(recognized).toBe(3);
    expect(expected).toBeGreaterThan(3);
  });
});
