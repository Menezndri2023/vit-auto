import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseUploadedFile, mapRowToVehicleInput, countRecognizedColumns, isTypeColumnRecognized, buildColumnMappingSuggestion } from "../services/vehicleImportService.js";

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

  it("reconnaît la colonne type sous un intitulé reformulé (\"Type d'annonce\")", async () => {
    const csv = "Titre,Marque,Modele,Annee,Type d'annonce\nToyota Corolla 2020,Toyota,Corolla,2020,location\n";
    const rows = await parseUploadedFile(Buffer.from(csv, "utf8"), "flotte.csv");

    expect(isTypeColumnRecognized(rows)).toBe(true);
    expect(mapRowToVehicleInput(rows[0]).data.type).toBe("location");
  });

  it("reconnaît la colonne type sous un intitulé reformulé + séparateur point-virgule", async () => {
    const csv = "Titre;Marque;Modele;Annee;Type Annonce\nBMW X5;BMW;X5;2021;Vente\n";
    const rows = await parseUploadedFile(Buffer.from(csv, "utf8"), "flotte.csv");

    expect(isTypeColumnRecognized(rows)).toBe(true);
    expect(mapRowToVehicleInput(rows[0]).data.type).toBe("vente");
  });

  it("isTypeColumnRecognized détecte l'absence totale de la colonne type", () => {
    expect(isTypeColumnRecognized([{ Titre: "x", Marque: "y" }])).toBe(false);
  });

  it("accepte des valeurs de type en texte libre (Louer/À vendre/Rent/Sale) plutôt que le mot-clé exact", () => {
    expect(mapRowToVehicleInput({ TypeAnnonce: "Louer" }).data.type).toBe("location");
    expect(mapRowToVehicleInput({ TypeAnnonce: "À vendre" }).data.type).toBe("vente");
    expect(mapRowToVehicleInput({ TypeAnnonce: "Rent" }).data.type).toBe("location");
    expect(mapRowToVehicleInput({ TypeAnnonce: "for sale" }).data.type).toBe("vente");
  });

  it("laisse type indéfini pour une valeur réellement non reconnue (ni alias ni enum)", () => {
    expect(mapRowToVehicleInput({ TypeAnnonce: "Chauffeur" }).data.type).toBeUndefined();
  });

  it("rejette un .xls (Excel 97-2003) avec un message actionnable — ExcelJS ne sait lire que .xlsx", async () => {
    // Signature OLE2/CFB réelle d'un .xls (D0 CF 11 E0...) — pas un ZIP du tout,
    // contrairement à .xlsx, donc ExcelJS échoue systématiquement dessus.
    const fakeXls = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, ...Array(100).fill(0)]);
    await expect(parseUploadedFile(fakeXls, "flotte.xls")).rejects.toThrow(/\.xls.*n'est pas pris en charge/);
  });

  it("rejette un .xlsx corrompu/invalide avec un message clair plutôt que l'erreur JSZip brute", async () => {
    const corrupted = Buffer.from("ceci n'est pas un vrai fichier excel");
    await expect(parseUploadedFile(corrupted, "flotte.xlsx")).rejects.toThrow(/Impossible de lire ce fichier/);
  });

  it("lit la première feuille non vide plutôt que de supposer que c'est toujours la première", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Vide");
    const data = wb.addWorksheet("Données");
    data.addRow(["Titre", "Marque", "TypeAnnonce"]);
    data.addRow(["Toyota Corolla", "Toyota", "location"]);
    const buf = await wb.xlsx.writeBuffer();

    const rows = await parseUploadedFile(Buffer.from(buf), "flotte.xlsx");
    expect(rows).toHaveLength(1);
    expect(rows[0].Titre).toBe("Toyota Corolla");
  });
});

// Bug réel découvert en production : un fichier partenaire avait sa PROPRE
// colonne "Type" (carrosserie/catégorie, sans rapport avec location/vente).
// La clé technique "type" étant toujours acceptée comme en-tête valide (en
// plus des alias), cette colonne était reconnue à tort — mais ses valeurs
// ("Berline", "SUV"...) ne correspondaient jamais à location/vente : 100% des
// lignes échouaient quand même, sans qu'aucun garde-fou ne le détecte. Fixé en
// donnant au partenaire un écran de mappage explicite (voir
// buildColumnMappingSuggestion + columnMapping) plutôt qu'en devinant.
describe("vehicleImportService — mappage explicite des colonnes", () => {
  it("reproduit le bug réel : une colonne 'Type' sans rapport est suggérée à tort par l'auto-détection", () => {
    const rows = [{ Marque: "VOLKSWAGEN", Modele: "Golf", Type: "Berline" }];
    const { suggestion } = buildColumnMappingSuggestion(rows, "vehicle");
    // Documente le comportement actuel de la suggestion (avant confirmation
    // partenaire) — c'est justement pourquoi ce n'est qu'une SUGGESTION.
    expect(suggestion.type).toBe("Type");
    // Sans mappage explicite, la valeur "Berline" ne matche ni l'enum ni les
    // alias location/vente : le champ reste indéfini (pas de faux succès).
    expect(mapRowToVehicleInput(rows[0]).data.type).toBeUndefined();
  });

  it("un mappage explicite type:null (colonne inexistante confirmée) n'utilise plus la détection automatique", () => {
    const rows = [{ Marque: "VOLKSWAGEN", Modele: "Golf", Type: "Berline" }];
    // Le partenaire a vu la suggestion incorrecte et l'a corrigée à "Aucune colonne".
    const { data } = mapRowToVehicleInput(rows[0], { type: null, marque: "Marque", modele: "Modele" });
    expect(data.type).toBeUndefined();
    expect(data.marque).toBe("VOLKSWAGEN");
  });

  it("applique le type par défaut de l'import quand aucune colonne type n'est mappée", () => {
    const rows = [
      { Marque: "VOLKSWAGEN", Modele: "Golf", Type: "Berline" },
      { Marque: "HYUNDAI", Modele: "Tucson", Type: "SUV" },
    ];
    const columnMapping = { type: null, marque: "Marque", modele: "Modele" };
    for (const row of rows) {
      expect(mapRowToVehicleInput(row, columnMapping, "location").data.type).toBe("location");
    }
  });

  it("un mappage explicite vers la bonne colonne prime sur la détection automatique", () => {
    const row = { Marque: "KIA", Modele: "Sportage", Transaction: "Louer" };
    const { data } = mapRowToVehicleInput(row, { type: "Transaction", marque: "Marque", modele: "Modele" });
    expect(data.type).toBe("location");
  });

  it("buildColumnMappingSuggestion retourne null pour un champ sans colonne correspondante", () => {
    const { suggestion } = buildColumnMappingSuggestion([{ Marque: "Toyota" }], "vehicle");
    expect(suggestion.title).toBeNull();
    expect(suggestion.marque).toBe("Marque");
  });
});
