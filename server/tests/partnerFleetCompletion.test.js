import { describe, it, expect } from "vitest";
import { partnerFleetCompletionTemplate } from "../services/communication/templates/email/PartnerFleetCompletion.js";

// Relance d'un partenaire de location sur sa flotte incomplète.
//
// Le point que ce fichier protège avant tout est l'AVERTISSEMENT SUR LES PHOTOS
// PROVISOIRES. Quand la plateforme illustre les annonces avec des photos de
// référence du modèle faute de photos réelles, le partenaire doit l'apprendre —
// sinon il croit ses voitures en ligne telles quelles, et c'est le client qui
// découvre l'écart au comptoir. Un avertissement qui disparaît silencieusement
// d'un template est le genre de régression qu'aucun test fonctionnel ne voit.

const base = {
  firstName: "Smail",
  companyName: "RENT CAR HADRANE",
  publiees: [{ titre: "Peugeot 308 GT", prix: 650, devise: "MAD", dureeMin: 5 }],
  brouillons: [{ titre: "Hyundai Tucson", manques: ["le millésime"] }],
  manquesCommuns: ["le carburant"],
  dashboardUrl: "https://vit-auto.com/vendor/dashboard",
};

describe("Relance flotte partenaire — avertissement photos", () => {
  it("prévient que les photos ne sont pas celles du partenaire, en HTML ET en texte", () => {
    const r = partnerFleetCompletionTemplate({ ...base, photosProvisoires: true });

    expect(r.html).toMatch(/provisoires/i);
    expect(r.html, "la conséquence concrète doit être dite").toMatch(/ne sont pas vos voitures/i);
    // Un destinataire qui lit la version texte doit recevoir le même avertissement.
    expect(r.text).toMatch(/PHOTOS SONT PROVISOIRES/);
    expect(r.text).toMatch(/ne sont pas vos voitures/i);
  });

  it("ne parle pas de photos provisoires quand elles sont réelles", () => {
    const r = partnerFleetCompletionTemplate({ ...base, photosProvisoires: false });
    expect(r.html).not.toMatch(/provisoires/i);
    expect(r.text).not.toMatch(/PROVISOIRES/);
  });
});

describe("Relance flotte partenaire — contenu", () => {
  it("nomme chaque véhicule publié avec son tarif et sa durée minimale", () => {
    const r = partnerFleetCompletionTemplate({
      ...base,
      publiees: [
        { titre: "Peugeot 308 GT", prix: 650, devise: "MAD", dureeMin: 5 },
        { titre: "Dacia Logan", prix: 300, devise: "MAD", dureeMin: 3 },
      ],
    });
    expect(r.html).toMatch(/Peugeot 308 GT/);
    expect(r.html).toMatch(/650 MAD/);
    expect(r.html).toMatch(/5 jours minimum/);
    expect(r.html).toMatch(/Dacia Logan/);
    expect(r.html, "singulier respecté").toMatch(/3 jours minimum/);
  });

  it("détaille ce qui manque à chaque brouillon", () => {
    const r = partnerFleetCompletionTemplate({
      ...base,
      brouillons: [
        { titre: "Hyundai Tucson", manques: ["le millésime"] },
        { titre: "Renault Kardian", manques: ["le millésime", "le tarif journalier"] },
      ],
    });
    expect(r.html).toMatch(/Hyundai Tucson/);
    expect(r.html).toMatch(/le millésime, le tarif journalier/);
    expect(r.subject).toMatch(/2 en attente/);
  });

  it("omet entièrement la section des brouillons quand la flotte est complète", () => {
    const r = partnerFleetCompletionTemplate({ ...base, brouillons: [] });
    expect(r.html).not.toMatch(/en attente de votre part/i);
    expect(r.text).not.toMatch(/EN ATTENTE DE VOTRE PART/);
    expect(r.subject).toMatch(/sont en ligne/);
  });

  it("mène au tableau de bord, jamais vers une adresse locale", () => {
    const r = partnerFleetCompletionTemplate({ ...base, photosProvisoires: true });
    expect(r.html).toMatch(/https:\/\/vit-auto\.com\/vendor\/dashboard/);
    expect(r.html).not.toMatch(/localhost/);
    expect(r.html, "un href=undefined serait un bouton mort").not.toMatch(/href="undefined"/);
  });
});

describe("Relance flotte partenaire — injection HTML", () => {
  // Le projet a déjà connu une vraie faille : aucun template n'échappait les
  // champs utilisateur avant interpolation. Le nom d'agence et les titres de
  // véhicules sont saisis par le partenaire lui-même.
  it("échappe le nom de l'agence et les titres de véhicules", () => {
    const r = partnerFleetCompletionTemplate({
      ...base,
      companyName: `<script>alert(1)</script>`,
      publiees: [{ titre: `<img src=x onerror="alert(2)">`, prix: 100, devise: "MAD", dureeMin: 1 }],
      brouillons: [{ titre: `<b>gras</b>`, manques: [`<i>rien</i>`] }],
    });

    // Ce qui compte est qu'aucune balise ne soit EXÉCUTABLE. Chercher la simple
    // chaîne « onerror= » ne prouve rien : elle subsiste, inerte, à l'intérieur
    // du texte échappé. L'assertion doit viser la forme active de l'attribut.
    expect(r.html).not.toMatch(/<script/);
    expect(r.html).not.toMatch(/<img/);
    expect(r.html).not.toMatch(/onerror="/);
    expect(r.html).not.toMatch(/<b>gras<\/b>/);

    // Et vérifier positivement que le contenu est bien passé par l'échappement,
    // plutôt que d'avoir simplement disparu du message.
    expect(r.html).toMatch(/&lt;script&gt;alert\(1\)/);
    expect(r.html).toMatch(/&lt;img src=x onerror=&quot;/);
    expect(r.html).toMatch(/&lt;b&gt;gras&lt;\/b&gt;/);
  });
});
