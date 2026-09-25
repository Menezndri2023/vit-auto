/* global process */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ═══════════════════════════════════════════════════════════════════════════
// LA VITRINE PARTENAIRE DOIT MONTRER LA FLOTTE ENTIÈRE
// ═══════════════════════════════════════════════════════════════════════════
// Demande de l'exploitant (2026-09-24) : faire du profil partenaire partageable
// une fonctionnalité vendable — le partenaire donne une adresse, le client y
// voit tout et y réserve.
//
// La page filtrait `useVehicles()`, c'est-à-dire le catalogue DÉJÀ CHARGÉ :
// paginé à 100 annonces et filtré sur le pays du visiteur. Mesuré en production
// sur le partenaire le plus fourni (270 annonces) :
//
//     visiteur au Maroc ............. 32 annonces (12 %)
//     visiteur en Côte d'Ivoire ......  0 annonce  (0 %)
//     sans pays détecté .............   3 annonces (1 %)
//
// Un partenaire qui partageait son lien à un client à l'étranger l'envoyait sur
// une page vide. Rien ne peut se vendre au-dessus de ça.

const source = fs.readFileSync(path.join(process.cwd(), "src", "pages", "PartnerProfile.jsx"), "utf8");

describe("PartnerProfile — la flotte vient du serveur", () => {
  it("interroge l'API par propriétaire", () => {
    expect(source).toMatch(/\/api\/vehicles\?owner=/);
  });

  // `country=INTL` n'est pas un détail : sans lui, le filtre pays du catalogue
  // s'applique et on retombe exactement sur le défaut corrigé. On regarde CE
  // partenaire — le pays du visiteur n'a rien à faire là.
  it("demande explicitement l'absence de filtre pays", () => {
    const appel = source.match(/`\/api\/vehicles\?owner=[^`]*`/)?.[0] || "";
    expect(appel, "ajouter country=INTL à la requête").toMatch(/country=INTL/);
  });

  it("ne reconstruit plus la flotte en filtrant le catalogue chargé", () => {
    // Le repli sur le contexte reste permis PENDANT le chargement, mais la
    // flotte servie doit venir de l'état alimenté par l'API.
    expect(source).toMatch(/const partnerVehicles = \(flotte \?\?/);
  });

  // Chauffeurs, activités et pièces se comptent en dizaines : les servir depuis
  // le contexte reste acceptable. Cette attente le DIT, pour qu'un futur
  // lecteur sache que c'est un choix et non un oubli.
  it("laisse chauffeurs, activités et pièces au contexte — volumes faibles", () => {
    for (const nom of ["partnerDrivers", "partnerActivities", "partnerParts"]) {
      expect(source).toMatch(new RegExp(`const ${nom}\\s*=\\s*\\(`));
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LA VITRINE DOIT SE PRÉSENTER ELLE-MÊME AUX MOTEURS ET AUX PARTAGES
// ═══════════════════════════════════════════════════════════════════════════
// Constaté le 2026-09-25, le lendemain de la mise en service du lien
// partageable : la page n'appelait pas `useDocumentMeta`. Elle héritait donc
// du titre, de la description ET de l'adresse canonique de la page d'accueil.
//
// Un partenaire qui envoyait son lien sur WhatsApp — l'usage même pour lequel
// la fonction a été construite — affichait l'aperçu générique de VIT AUTO au
// lieu de son nom et de sa flotte. Et la balise canonique disait aux moteurs
// « cette page est un doublon de l'accueil ».
describe("PartnerProfile — ce que voient les moteurs et les partages", () => {
  it("pose ses propres balises", () => {
    expect(source, "la page hérite des balises de l'accueil").toMatch(/useDocumentMeta\(/);
    expect(source).toMatch(/import \{ useDocumentMeta \}/);
  });

  // LE point : le canonique doit désigner CETTE page. Pointer l'accueil revient
  // à demander aux moteurs de ne pas indexer la vitrine.
  it("déclare une adresse canonique propre à la vitrine, pas l'accueil", () => {
    const bloc = source.slice(source.indexOf("useDocumentMeta("), source.indexOf("if (loading)"));
    expect(bloc).toMatch(/url:\s*`https:\/\/vit-auto\.com\$\{slug/);
    expect(bloc, "le canonique ne doit pas retomber sur la racine").not.toMatch(/url:\s*"https:\/\/vit-auto\.com"/);
  });

  // Le lien court est celui que le partenaire imprime : deux adresses pour une
  // même page se disputeraient le référencement.
  it("préfère l'adresse courte quand elle existe", () => {
    const bloc = source.slice(source.indexOf("useDocumentMeta("), source.indexOf("if (loading)"));
    expect(bloc).toMatch(/slug \? `\/p\/\$\{slug\}` : `\/partner\/\$\{id\}`/);
  });

  it("met en noindex une vitrine sans aucune annonce — une page mince dessert le site", () => {
    const bloc = source.slice(source.indexOf("useDocumentMeta("), source.indexOf("if (loading)"));
    expect(bloc).toMatch(/robots: totalListings === 0 \? "noindex, follow"/);
  });
});
