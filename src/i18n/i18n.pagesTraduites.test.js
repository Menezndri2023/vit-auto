import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
/* global process */

// ── `traduite: true` doit être vrai ─────────────────────────────────────────
//
// Une page qui passe `traduite: true` à useDocumentMeta publie aux moteurs
// cinq balises `hreflang` : elle affirme exister en cinq langues. Si du texte
// français reste écrit en dur dedans, l'affirmation est fausse — et Google
// traite cinq adresses au contenu identique en contenu dupliqué.
//
// Ce test relit les fichiers et cherche du français resté en dur dans le JSX
// des pages concernées, et des composants qu'elles montent. Le repérage est
// volontairement grossier (accents et mots outils français) : il vaut mieux un
// faux positif à écarter explicitement qu'une page qui ment en silence.

const RACINE = resolve(process.cwd(), "src");

const ACCENTS = /[éèêëàâäùûüçôöîïœÉÈÀÇ]/;
const MOTS_FR = /(^|[\s(])(le|la|les|des|une|vous|votre|notre|nos|pour|avec|dans|sur|est|sont|tous|toutes|chaque|depuis|sans|plus|aucun|aucune)([\s,.;:!?)]|$)/i;

// Libellés d'un seul mot, sans accent : « Accueil », « Tarifs », « Panier »…
// Ils échappaient à la détection par accent comme à celle par mot outil, et
// c'est exactement ce que contient une barre de navigation.
const MOTS_SEULS_FR = new RegExp(`^(${[
  "Accueil", "Connexion", "Inscription", "Tarifs", "Recherche", "Rechercher",
  "Annonce", "Annonces", "Panier", "Favoris", "Aide", "Publier", "Suivant",
  "Precedent", "Fermer", "Ouvrir", "Envoyer", "Valider", "Annuler",
  "Continuer", "Retour", "Modifier", "Supprimer", "Enregistrer", "Partenaire",
  "Partenaires", "Location", "Vente", "Chauffeur", "Marque", "Ville", "Pays",
  "Devise", "Langue", "Profil", "Messages", "Notifications", "Deconnexion",
].join("|")})$`, "i");

// Écarts assumés : ni traduisibles, ni du texte.
const TOLERE = [
  /^[\s\d\p{P}\p{S}]*$/u,          // ponctuation, chiffres, flèches, émojis seuls
  /^VIT AUTO/,                      // nom de la marque
  /^(FAQ|CGU|CGV|RGPD|TLS|JWT|ISO|GPS|API|KYC|USD|MAD|OCR)\b/,
  // Valeurs métier écrites en français À DESSEIN : elles partent dans l'URL
  // du catalogue et sont comparées côté serveur. Les traduire ferait filtrer
  // un visiteur anglophone sur « Saloon », que rien n'indexe. Seul leur
  // AFFICHAGE est traduit (clés bodyType.*, search.*).
  /^(Tous modèles|Tous|Neuf|Occasion|Louer|Acheter|Chauffeur|Autres|Pieces|Courte|Longue|Essence|Diesel|Hybride|Électrique|GPL|Dubaï)$/,
];

function sansCommentaires(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")   // blocs, y compris les commentaires JSX
    .replace(/^\s*\/\/.*$/gm, " ");
}

// Valeurs CSS, chemins, identifiants : du texte, mais pas de l'affichage.
const PAS_DU_TEXTE = [
  /^(https?:|mailto:|tel:|\/|\.\/|\.\.\/|#|@)/,
  /(px|rem|em|vw|vh|%|deg)\s*$/,
  /^(rgba?|linear-gradient|repeat|calc|clamp|var)\(/,
  /^[a-z]+([A-Z][a-z]+)+$/,        // camelCase : nom de classe ou de champ
  /^[a-z0-9_-]+$/,                 // identifiant en minuscules
];

/**
 * Textes visibles : nœuds JSX, attributs lisibles, ET chaînes de caractères
 * stockées dans des tableaux ou des objets — c'est la forme qu'ont les cartes
 * de WhySection, les services, les questions de la FAQ. S'en tenir au JSX
 * laisserait passer l'essentiel du contenu de ces pages.
 */
function textesVisibles(src) {
  const propre = sansCommentaires(src);
  const trouves = [];
  // Nœuds de texte JSX : entre > et <, sans accolade (donc pas d'expression).
  for (const m of propre.matchAll(/>([^<>{}]*[A-Za-zÀ-ÿ]{3,}[^<>{}]*)</g)) {
    trouves.push(m[1].trim());
  }
  // Attributs destinés à l'affichage.
  for (const m of propre.matchAll(/\b(alt|placeholder|title|aria-label|label|sousTitre|libelleTout)\s*=\s*"([^"]{3,})"/g)) {
    trouves.push(m[2].trim());
  }
  // Littéraux de chaîne : guillemets simples ou doubles, et gabarits sans
  // interpolation. On ne garde que ce qui ressemble à une phrase.
  for (const m of propre.matchAll(/"([^"\\\n]{4,})"|'([^'\\\n]{4,})'|`([^`\\$\n]{4,})`/g)) {
    const txt = (m[1] ?? m[2] ?? m[3]).trim();
    if (!txt || PAS_DU_TEXTE.some((r) => r.test(txt))) continue;
    trouves.push(txt);
  }
  return trouves.filter(Boolean);
}

function francaisEnDur(src) {
  return textesVisibles(src).filter((txt) => {
    if (TOLERE.some((r) => r.test(txt))) return false;
    return ACCENTS.test(txt) || MOTS_FR.test(txt) || MOTS_SEULS_FR.test(txt);
  });
}

/** Tous les .jsx de src/, hors tests. */
function fichiersJsx(dossier = RACINE, acc = []) {
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    const p = join(dossier, e.name);
    if (e.isDirectory()) fichiersJsx(p, acc);
    else if (e.name.endsWith(".jsx") && !e.name.includes(".test.")) acc.push(p);
  }
  return acc;
}

// Composants montés par les pages traduites et présents sur toutes les pages.
const CHROME = [
  "src/components/Footer/Footer.jsx",
  "src/components/Navbar/Navbar.jsx",
  "src/components/BottomNav/BottomNav.jsx",
  "src/components/HeroSection/HeroSection.jsx",
  "src/components/SearchBar/SearchBar.jsx",
  "src/components/VehicleCard/VehicleCard.jsx",
  "src/components/WhySection/WhySection.jsx",
  "src/components/TrustSection/TrustSection.jsx",
  "src/components/VendorCallout/VendorCallout.jsx",
  "src/components/RouteCTA/RouteCTA.jsx",
];

describe("pages déclarées traduites", () => {
  const pages = fichiersJsx().filter((f) => /traduite:\s*true/.test(readFileSync(f, "utf8")));

  it("au moins une page déclare hreflang (sinon le chantier a disparu)", () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  it.each([...pages, ...CHROME.map((c) => resolve(process.cwd(), c))])(
    "%s ne contient plus de texte français en dur",
    (fichier) => {
      const restes = francaisEnDur(readFileSync(fichier, "utf8"));
      expect(
        restes,
        `Texte français en dur (à passer par t(), ou le fichier ne doit pas déclarer traduite) :\n  · ${restes.join("\n  · ")}`,
      ).toEqual([]);
    },
  );
});
