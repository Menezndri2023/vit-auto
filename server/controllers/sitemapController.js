// ── Le sitemap, servi par l'API ────────────────────────────────────────────
//
// Il était produit au BUILD (scripts/generateSitemap.mjs, via `prebuild`) en
// interrogeant cette même API. Deux défauts, constatés le 2026-09-25 :
//
//  1. `public/sitemap.xml` n'est pas versionné, et Vercel construit sur un
//     clone neuf. Quand l'API dort — Render s'endort, le réveil prend presque
//     une minute — la requête échoue et le script se replie sur les seules
//     pages statiques. Mesuré en production ce jour-là : le sitemap servi
//     contenait **17 URL**, exactement le nombre de pages statiques, alors
//     que le générateur en produit 643 quand l'API répond. **626 pages
//     étaient invisibles aux moteurs**, dont les 405 annonces publiées.
//     L'échec était silencieux : un avertissement dans un journal de build.
//
//  2. Même réussi, un fichier figé au build décrit un catalogue qui change
//     toutes les heures. Il vieillit dès le déploiement suivant.
//
// Servi ici, il est toujours complet et toujours frais. Si l'API ne répond
// pas, un moteur réessaie plus tard — bien préférable à un sitemap tronqué
// qui ne lui apprend rien des nouvelles annonces.
import Vehicle from "../models/Vehicle.js";
import ImportExportListing from "../models/ImportExportListing.js";
import PartnerShowroom from "../models/PartnerShowroom.js";
import User from "../models/User.js";
import { clauseHorsComptesDeTest } from "../utils/comptesDeTest.js";
import { cacheGet, cacheSet, buildCacheKey } from "../utils/catalogCache.js";
import logger from "../utils/logger.js";
import { LANGUES, LANGUE_DEFAUT, cheminDansLangue } from "../utils/langues.js";

const SITE = "https://vit-auto.com";
// Une heure : le catalogue bouge, mais un moteur ne relit pas un sitemap plus
// souvent. Recalculer à chaque passage de robot coûterait pour rien.
const TTL_MS = 60 * 60 * 1000;

// Une ville avec une seule annonce ne fait pas une page : annoncer une page
// mince nuit plus qu'elle ne rapporte, et la page elle-même se met en noindex.
const MIN_ANNONCES_PAR_VILLE = 2;

// `traduite` : la page existe réellement dans les cinq langues (tout son texte
// passe par t(), garanti par src/i18n/i18n.pagesTraduites.test.js). Elle reçoit
// alors ses alternates hreflang ci-dessous. Les autres n'en reçoivent PAS :
// déclarer cinq versions d'une page qui n'en a qu'une est une fausse
// déclaration, que les moteurs traitent en contenu dupliqué.
export const PAGES_STATIQUES = [
  { loc: "/",                       changefreq: "daily",   priority: "1.0", traduite: true },
  { loc: "/catalogue",              changefreq: "hourly",  priority: "0.9", traduite: true },
  { loc: "/catalogue?mode=Autres",  changefreq: "daily",   priority: "0.8", traduite: true },
  { loc: "/catalogue?mode=Pieces",  changefreq: "daily",   priority: "0.8", traduite: true },
  { loc: "/import-export",          changefreq: "daily",   priority: "0.8" },
  { loc: "/import-export/listings", changefreq: "hourly",  priority: "0.8", traduite: true },
  { loc: "/services",               changefreq: "monthly", priority: "0.6", traduite: true },
  { loc: "/partenaires",            changefreq: "weekly",  priority: "0.7", traduite: true },
  { loc: "/pourquoi",               changefreq: "monthly", priority: "0.5", traduite: true },
  { loc: "/plans",                  changefreq: "monthly", priority: "0.5" },
  { loc: "/faq",                    changefreq: "monthly", priority: "0.4", traduite: true },
  { loc: "/help",                   changefreq: "monthly", priority: "0.4", traduite: true },
  { loc: "/register",               changefreq: "yearly",  priority: "0.5" },
  { loc: "/login",                  changefreq: "yearly",  priority: "0.3" },
  { loc: "/privacy",                changefreq: "yearly",  priority: "0.2" },
  { loc: "/cgu",                    changefreq: "yearly",  priority: "0.2" },
  { loc: "/mentions-legales",       changefreq: "yearly",  priority: "0.2" },
];

// Repris de src/constants/citySlug.js — le sitemap et l'application DOIVENT
// produire la même chaîne, sinon on publie des adresses que le site ne résout
// pas. Couvert par un test qui compare les deux implémentations.
export const slugifyVille = (v) => String(v || "")
  .trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const echapper = (s) => String(s).replace(/[<>&'"]/g, (c) =>
  ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));

// Alternates `hreflang`, au format que Google attend dans un sitemap : CHAQUE
// version linguistique reçoit son propre bloc <url>, et chacun liste les cinq
// versions PLUS x-default — y compris lui-même. Un jeu incomplet ou non
// réciproque est ignoré en bloc.
//
// Le paramètre de requête (/catalogue?mode=Pieces) est réattaché après le
// préfixe : c'est le chemin, pas la requête, qui porte la langue.
function alternates(loc) {
  const [chemin, requete] = loc.split("?");
  const suffixe = requete ? `?${requete}` : "";
  const liens = LANGUES.map((l) =>
    `<xhtml:link rel="alternate" hreflang="${l.hreflang}" href="${echapper(SITE + cheminDansLangue(chemin, l.code) + suffixe)}"/>`);
  liens.push(`<xhtml:link rel="alternate" hreflang="x-default" href="${echapper(SITE + cheminDansLangue(chemin, LANGUE_DEFAUT) + suffixe)}"/>`);
  return liens.join("");
}

// `alternatesDe` porte le chemin NU (français, sans préfixe). Sans lui, la
// version anglaise recalculerait ses alternates depuis « /en/faq » et
// publierait « /en/en/faq » : des adresses mortes, et un jeu non réciproque
// que Google ignore en bloc.
export function entree({ loc, changefreq, priority, lastmod, traduite, alternatesDe }) {
  const jour = lastmod ? `<lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>` : "";
  const liens = traduite ? alternates(alternatesDe || loc) : "";
  return `  <url><loc>${echapper(SITE + loc)}</loc>${jour}<changefreq>${changefreq}</changefreq><priority>${priority}</priority>${liens}</url>`;
}

/**
 * Une page traduite occupe cinq blocs <url> — un par langue — portant tous le
 * même jeu d'alternates. C'est ce que demande la documentation Google : sans
 * son propre bloc, une version linguistique n'est pas déclarée.
 */
function entreesToutesLangues(page) {
  const [chemin, requete] = page.loc.split("?");
  const suffixe = requete ? `?${requete}` : "";
  // Les cinq blocs partagent le MÊME jeu d'alternates, calculé une fois depuis
  // le chemin nu : c'est la réciprocité que Google exige.
  return LANGUES.map((l) => entree({
    ...page,
    loc: cheminDansLangue(chemin, l.code) + suffixe,
    alternatesDe: page.loc,
  }));
}

export async function construireSitemap() {
  const urls = PAGES_STATIQUES.flatMap((p) =>
    p.traduite ? entreesToutesLangues(p) : [entree(p)]);

  // Les comptes de démonstration (review Apple, jeux d'essai) ne doivent pas
  // peupler un sitemap : on annoncerait aux moteurs des pages qui disparaîtront.
  const [horsTestAnnonces, horsTestComptes] = await Promise.all([
    clauseHorsComptesDeTest("owner"),
    clauseHorsComptesDeTest("_id"),
  ]);

  const [vehicules, annoncesIE, showrooms, partenaires] = await Promise.all([
    Vehicle.find({ status: "approved", available: { $ne: false }, ...(horsTestAnnonces || {}) })
      .select("_id updatedAt ville type").lean(),
    ImportExportListing.find({ status: "approved" }).select("_id updatedAt sourceCountry").lean(),
    PartnerShowroom.find({ isPublished: true }).select("slug updatedAt").lean(),
    // Vitrines partenaires : ajoutées le 2026-09-25 avec le lien partageable.
    // Seules celles qui ont une adresse lisible — une vitrine atteignable
    // uniquement par un identifiant Mongo n'a rien à faire dans un sitemap.
    User.find({ role: "partenaire", isActive: true, vitrineSlug: { $ne: null }, ...(horsTestComptes || {}) })
      .select("vitrineSlug updatedAt").lean(),
  ]);

  for (const v of vehicules) {
    urls.push(entree({ loc: `/vehicle/${v._id}`, changefreq: "daily", priority: "0.7", lastmod: v.updatedAt }));
  }
  for (const l of annoncesIE) {
    urls.push(entree({ loc: `/import-export/listings/${l._id}`, changefreq: "daily", priority: "0.7", lastmod: l.updatedAt }));
  }
  for (const s of showrooms) {
    if (s.slug) urls.push(entree({ loc: `/showroom/${s.slug}`, changefreq: "weekly", priority: "0.6", lastmod: s.updatedAt }));
  }
  for (const p of partenaires) {
    if (p.vitrineSlug) urls.push(entree({ loc: `/p/${p.vitrineSlug}`, changefreq: "weekly", priority: "0.6", lastmod: p.updatedAt }));
  }

  // Pages d'entrée par ville, puis par pays d'origine — seulement là où il y a
  // vraiment du stock.
  const parVille = new Map();
  for (const v of vehicules) {
    const slug = slugifyVille(v.ville);
    if (!slug) continue;
    const clef = `${v.type === "vente" ? "achat" : "location"}-voiture/${slug}`;
    parVille.set(clef, (parVille.get(clef) || 0) + 1);
  }
  for (const [chemin, n] of parVille) {
    // Les pages de ville passent par LocalLanding, entièrement traduite :
    // elles méritent donc leurs cinq versions et leurs alternates.
    if (n >= MIN_ANNONCES_PAR_VILLE) {
      urls.push(...entreesToutesLangues({ loc: `/${chemin}`, changefreq: "daily", priority: "0.8", traduite: true }));
    }
  }

  const parOrigine = new Map();
  for (const l of annoncesIE) {
    const slug = slugifyVille(l.sourceCountry);
    if (!slug) continue;
    parOrigine.set(slug, (parOrigine.get(slug) || 0) + 1);
  }
  for (const [slug, n] of parOrigine) {
    // Idem pour les pays d'origine : ImportOriginLanding est traduite.
    if (n >= MIN_ANNONCES_PAR_VILLE) {
      urls.push(...entreesToutesLangues({ loc: `/import-voiture/${slug}`, changefreq: "daily", priority: "0.8", traduite: true }));
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("\n")}\n</urlset>\n`;
}

export const servirSitemap = async (req, res) => {
  try {
    const cle = buildCacheKey("sitemap", { v: 1 });
    let xml = cacheGet(cle);
    if (!xml) {
      xml = await construireSitemap();
      cacheSet(cle, xml, TTL_MS);
    }
    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(xml);
  } catch (err) {
    logger.error("servirSitemap:", err);
    // 503 plutôt qu'un sitemap partiel : un moteur réessaie, alors qu'un
    // fichier tronqué le laisserait croire que le site n'a que 17 pages.
    res.status(503).set("Retry-After", "600").send("");
  }
};
