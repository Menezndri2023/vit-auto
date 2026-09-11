import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// ═══════════════════════════════════════════════════════════════════════════
// LA POLITIQUE DE SÉCURITÉ NE DOIT PAS CASSER CE QU'ELLE AUTORISE
// ═══════════════════════════════════════════════════════════════════════════
// Trouvé en balayant la production au navigateur : `accounts.google.com` était
// autorisé pour les SCRIPTS, les CADRES et les CONNEXIONS, mais pas pour les
// STYLES. La bibliothèque Google Sign-In charge `accounts.google.com/gsi/style`
// — bloqué sur /login, /register et /importer-apply, les trois pages où l'on
// se connecte.
//
// Une CSP qui autorise un tiers à moitié est pire qu'une CSP qui le refuse :
// le bouton s'affiche, mal, et personne ne sait pourquoi.

const CSP = JSON.parse(fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"))
  .headers.flatMap((h) => h.headers)
  .find((h) => h.key === "Content-Security-Policy").value;

const directive = (nom) => {
  const d = CSP.split(";").map((x) => x.trim()).find((x) => x.startsWith(nom + " "));
  return d ? d.slice(nom.length).trim().split(/\s+/) : [];
};

describe("Content-Security-Policy", () => {
  it("autorise Google Sign-In sur les QUATRE directives dont il a besoin", async () => {
    // Retirer l'une d'elles ne casse pas le déploiement : cela casse
    // silencieusement l'authentification Google, sur les seules pages de
    // connexion.
    for (const d of ["script-src", "style-src", "frame-src", "connect-src"]) {
      expect(directive(d), `${d} doit autoriser accounts.google.com`).toContain("https://accounts.google.com");
    }
  });

  it("autorise les polices Google, feuille ET fichiers", async () => {
    // Même piège : la feuille vient de fonts.googleapis.com, les fichiers de
    // fonts.gstatic.com. N'en autoriser qu'un donne une page sans sa typographie.
    expect(directive("style-src")).toContain("https://fonts.googleapis.com");
    expect(directive("font-src")).toContain("https://fonts.gstatic.com");
  });

  it("autorise les services dont dépend le catalogue", async () => {
    // Géolocalisation par IP (pays du visiteur, devise), géocodage inverse et
    // tuiles de carte : bloqués, le catalogue se dégrade sans message d'erreur.
    const connect = directive("connect-src");
    for (const h of ["https://ipapi.co", "https://nominatim.openstreetmap.org"]) {
      expect(connect, `connect-src doit autoriser ${h}`).toContain(h);
    }
  });

  it("garde les restrictions qui protègent réellement", async () => {
    expect(directive("object-src")).toContain("'none'");
    expect(directive("frame-ancestors")).toContain("'none'");
    expect(directive("base-uri")).toContain("'self'");
    // Aucun script inline : c'est la protection principale contre le XSS, et
    // elle ne doit pas être desserrée pour faire passer un widget.
    expect(directive("script-src")).not.toContain("'unsafe-inline'");
    expect(directive("script-src")).not.toContain("'unsafe-eval'");
  });
});
