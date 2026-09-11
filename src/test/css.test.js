/* global process */
//
// `process` est bien disponible sous Vitest (Node + globals jsdom) ; seul
// ESLint l'ignore dans le périmètre navigateur, d'où la déclaration ci-dessus.
// L'environnement reste jsdom : le fichier de configuration partagé
// (src/test/setup.js) s'appuie sur `window`, et le passer en Node casserait
// toute la suite.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// ═══════════════════════════════════════════════════════════════════════════
// DEUX RÈGLES DE STYLE QUI ONT CASSÉ L'AFFICHAGE MOBILE
// ═══════════════════════════════════════════════════════════════════════════
// Trouvées en regardant les pages dans un vrai navigateur, à 390 px. Aucune
// suite de tests ne les voyait : elles ne produisent ni erreur ni exception,
// seulement du texte invisible et des blocs rognés.

// Les COMMENTAIRES sont retirés avant toute analyse : l'un d'eux cite
// `button { min-height: 44px }` pour expliquer le correctif, et son accolade
// fermante coupait la lecture du bloc en plein milieu — le test échouait sur
// un fichier pourtant correct. Même piège que dans le test du service worker.
const lire = (...p) =>
  fs.readFileSync(path.join(process.cwd(), ...p), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

// Un même sélecteur apparaît plusieurs fois : règle de base, puis surcharges
// dans les media queries. Chercher la PREMIÈRE occurrence tombait sur celle
// d'une media query — le test échouait sur un fichier pourtant correct.
// On rassemble donc tous les blocs du sélecteur et on cherche la déclaration
// dans l'un d'eux.
function blocs(css, selecteur) {
  const out = [];
  let i = css.indexOf(selecteur);
  while (i !== -1) {
    out.push(css.slice(i, css.indexOf("}", i)));
    i = css.indexOf(selecteur, i + 1);
  }
  return out;
}
const declare = (css, selecteur, motif) => blocs(css, selecteur).some((b) => motif.test(b));

describe("Couleur des titres", () => {
  it("les titres HÉRITENT de leur conteneur", async () => {
    // `h1..h6 { color: <valeur fixe> }` bat l'héritage : une règle d'élément,
    // si faible soit-elle, l'emporte toujours sur une couleur héritée. Les
    // titres sans classe placés dans une section sombre recevaient donc le bleu
    // nuit de la charte, sur fond bleu nuit. Mesuré : 15 titres illisibles,
    // dont celui de la page Tarifs et ceux des six pages légales.
    const css = lire("src", "index.css");
    const regle = css.match(/h1,\s*h2,\s*h3,\s*h4,\s*h5,\s*h6\s*\{[^}]*\}/);
    expect(regle, "la règle groupée sur les titres doit exister").toBeTruthy();
    expect(regle[0]).toMatch(/color:\s*inherit/);
    expect(regle[0]).not.toMatch(/color:\s*var\(--c-text-primary\)/);
  });
});

describe("Grilles qui ne débordent pas", () => {
  it("les colonnes du hero sont bornées par minmax(0, …)", async () => {
    // Une colonne de grille a un `min-width: auto` implicite : une rangée flex
    // non enveloppante l'élargit jusqu'à sa largeur de contenu. Mesuré sur la
    // production : le hero faisait 1180 px sur un écran de 390, et
    // `overflow: hidden` transformait ce débordement en ROGNAGE silencieux —
    // la moitié droite de la page était coupée, sans barre de défilement pour
    // le signaler.
    const css = lire("src", "components", "HeroSection", "HeroSection.module.css");
    // AUCUN bloc `.hero` ne doit déclarer de colonnes sans `minmax(0, …)`.
    // Vérifier qu'« au moins un » le fait était trop permissif : la surcharge
    // mobile suffisait à faire passer le test alors que la règle de base était
    // revenue à `46% 54%` — vérifié en réinjectant la régression.
    const sansBorne = blocs(css, ".hero {")
      .filter((b) => /grid-template-columns:/.test(b) && !/minmax\(0,/.test(b));
    expect(sansBorne, "toute colonne du hero doit être bornée par minmax(0, …)").toEqual([]);
    // Et les rangées pleine largeur ne doivent pas repousser la grille.
    for (const sel of [".searchRow {", ".originsRow {"]) {
      expect(declare(css, sel, /min-width:\s*0/), `${sel} doit porter min-width: 0`).toBe(true);
    }
  });

  it("la bande des pays défile au lieu d'être coupée", async () => {
    const css = lire("src", "components", "HeroSection", "HeroSection.module.css");
    expect(declare(css, ".originsRow {", /overflow-x:\s*auto/)).toBe(true);
  });
});

describe("Cibles tactiles", () => {
  it("les indicateurs du carrousel gardent leur forme ET leur zone tactile", async () => {
    // `button { min-height: 44px }` protège les vraies commandes, mais étirait
    // ces pastilles de 7 px en ellipses de 7 × 44. La zone tactile est rendue
    // par un pseudo-élément : le doigt garde sa cible, l'œil voit un point.
    const css = lire("src", "components", "HeroSection", "HeroSection.module.css");
    expect(declare(css, ".spotDot {", /min-height:\s*0/)).toBe(true);
    expect(css).toMatch(/\.spotDot::after\s*\{/);
  });

  it("la règle globale qui protège les vraies commandes reste en place", async () => {
    const css = lire("src", "index.css");
    expect(css).toMatch(/button\s*\{\s*min-height:\s*44px/);
  });
});

describe("Images recadrées dans leur boîte", () => {
  it("l'image d'une carte de mise en avant est retirée du calcul de taille", async () => {
    // `.visuel` est une grille dont la rangée est dimensionnée en `auto`. La
    // hauteur `100%` d'une image qui s'y trouve est alors cyclique, donc
    // traitée comme `auto` : l'image reprend son ratio naturel et ÉTIRE la
    // boîte au lieu d'être recadrée. Invisible avec une photo paysage (plus
    // courte que le 4/3 demandé), flagrant avec une photo portrait. Mesuré à
    // 390 px sur la bande « Activités et loisirs » : 215 px au lieu de 141,
    // l'image débordait de la carte et recouvrait le titre.
    // La sortir du flux (position absolue) est ce qui casse le cycle ; le
    // `overflow: hidden` sur la boîte n'est qu'une seconde barrière.
    const css = lire("src", "components", "SpotlightRow", "SpotlightRow.module.css");
    expect(declare(css, ".visuel {", /position:\s*relative/)).toBe(true);
    expect(declare(css, ".visuel {", /overflow:\s*hidden/)).toBe(true);
    expect(declare(css, ".visuel img", /position:\s*absolute/)).toBe(true);
    expect(declare(css, ".visuel img", /inset:\s*0/)).toBe(true);
    expect(declare(css, ".visuel img", /object-fit:\s*cover/)).toBe(true);
  });
});

describe("Cibles tactiles hors des cartes", () => {
  // Mesuré dans un navigateur : barre de navigation 34–39 px, liens du pied
  // de page 20 px, icônes sociales 36 px — sous le seuil de 44 px.
  // La condition porte sur le POINTEUR et non sur la largeur : une tablette
  // de 1024 px se touche, un portable de 1280 px se clique. Une règle
  // `max-width` raterait la première et écarterait inutilement la seconde.
  const REGLE_TACTILE = /@media\s*\(hover:\s*none\)\s*and\s*\(pointer:\s*coarse\)/;

  it("la barre de navigation vise le pointeur tactile, pas une largeur", () => {
    const css = lire("src", "components", "Navbar", "Navbar.module.css");
    expect(css).toMatch(REGLE_TACTILE);
    const bloc = css.slice(css.search(REGLE_TACTILE));
    expect(bloc).toMatch(/min-height:\s*44px/);
    expect(bloc).toMatch(/\.navLinks a/);
  });

  it("les liens du pied de page atteignent 44 px sans se chevaucher", () => {
    const css = lire("src", "components", "Footer", "Footer.module.css");
    expect(css).toMatch(REGLE_TACTILE);
    const bloc = css.slice(css.search(REGLE_TACTILE));
    // Le remplissage vertical SEUL ferait se chevaucher deux liens voisins,
    // séparés de 9 px seulement : l'espacement de la liste doit tomber à 0
    // en même temps. Deux zones cliquables qui se recouvrent sont pires
    // qu'une petite : on touche le mauvais lien.
    expect(bloc, "remplissage vertical des liens").toMatch(/padding:\s*12px 0/);
    expect(bloc, "espacement de liste ramené à 0").toMatch(/\.col ul\s*\{\s*gap:\s*0/);
    expect(bloc, "icônes sociales portées à 44 px").toMatch(/width:\s*44px/);
  });
});
