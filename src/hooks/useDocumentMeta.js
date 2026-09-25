import { useEffect } from "react";
import {
  LANGUES, LANGUE_DEFAUT, langueDuChemin, cheminNu, cheminDansLangue,
} from "../i18n/langueUrl";

const SITE = "https://vit-auto.com";

// Valeurs par défaut — doivent rester synchronisées avec index.html (SPA sans
// SSR : ce fichier ne porte qu'un seul jeu de balises meta, partagé par
// TOUTES les routes tant qu'aucun composant n'appelle ce hook).
const DEFAULTS = {
  title:       "VIT AUTO — Location, vente et import de véhicules à l'international",
  description: "Louez, achetez, importez ou exportez un véhicule dans 28 pays. Inspection, transport, dédouanement et livraison gérés de bout en bout, avec paiement sécurisé.",
  image:       "https://vit-auto.com/icons/icon-512x512.png",
};

function setMeta(name, content, attr = "name") {
  if (!content) return;
  let el = document.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

// Données structurées schema.org (SEO — 2026-09) : aucune balise ld+json
// n'existait nulle part dans l'app. Un seul `<script>` (id fixe) réutilisé/
// retiré à chaque changement de page, comme le reste de ce hook.
const STRUCTURED_DATA_ID = "structured-data-ldjson";
function setStructuredData(data) {
  const existing = document.getElementById(STRUCTURED_DATA_ID);
  if (!data) { existing?.remove(); return; }
  let el = existing;
  if (!el) {
    el = document.createElement("script");
    el.id = STRUCTURED_DATA_ID;
    el.type = "application/ld+json";
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

// Directive d'indexation. Absente = comportement par défaut (indexable) : on
// RETIRE la balise plutôt que d'écrire "index, follow", pour ne pas laisser une
// consigne héritée d'une page précédente sur une page qui n'en veut pas.
function setRobots(valeur) {
  const el = document.querySelector('meta[name="robots"]');
  if (!valeur) { el?.remove(); return; }
  if (el) { el.setAttribute("content", valeur); return; }
  const nouveau = document.createElement("meta");
  nouveau.setAttribute("name", "robots");
  nouveau.setAttribute("content", valeur);
  document.head.appendChild(nouveau);
}

// ── Adresse canonique ───────────────────────────────────────────────────────
//
// Jusqu'au 2026-09-25, une page qui ne passait pas `url` héritait de
// `DEFAULTS.url` = la page d'accueil. Dix-neuf pages sur vingt-cinq — le
// catalogue, les services, la FAQ, les tarifs, les pages partenaires, les
// pages légales — déclaraient donc à Google : « je suis un doublon de
// l'accueil ». C'est une consigne de DÉSINDEXATION, pas une omission
// inoffensive. Le canonical se déduit désormais de l'adresse réellement
// affichée ; il n'existe plus de repli global vers l'accueil.
//
// Les paramètres de requête sont écartés, à une exception près : `mode`, qui
// découpe le catalogue en rubriques réellement distinctes et figure telle
// quelle dans le sitemap (/catalogue?mode=Pieces).
const PARAMS_CANONIQUES = ["mode"];

function cheminCanonique(url) {
  // Une page peut imposer son adresse (fiche véhicule, annonce I/E). On n'en
  // garde que le chemin : le préfixe de langue est réappliqué plus bas.
  if (url) {
    try { return cheminNu(new URL(url, SITE).pathname); }
    catch { return cheminNu(String(url)); }
  }
  const chemin = cheminNu(window.location.pathname);
  const params = new URLSearchParams(window.location.search);
  const gardes = new URLSearchParams();
  for (const p of PARAMS_CANONIQUES) if (params.get(p)) gardes.set(p, params.get(p));
  const q = gardes.toString();
  return q ? `${chemin}?${q}` : chemin;
}

function poserLien(rel, href, hreflang) {
  const selecteur = hreflang
    ? `link[rel="alternate"][hreflang="${hreflang}"]`
    : `link[rel="${rel}"]`;
  let el = document.querySelector(selecteur);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    if (hreflang) el.setAttribute("hreflang", hreflang);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function retirerAlternates() {
  document.querySelectorAll('link[rel="alternate"][hreflang]').forEach((el) => el.remove());
}

// ── hreflang ────────────────────────────────────────────────────────────────
//
// N'est posé que si la page le MÉRITE : `traduite` n'est vrai que là où le
// contenu existe réellement dans les cinq langues. Déclarer cinq versions
// d'une page qui n'en a qu'une n'est pas une optimisation, c'est une fausse
// déclaration — Google la traite en contenu dupliqué.
//
// Sur une page NON traduite atteinte à une adresse préfixée (/en/cgu), le
// canonical renvoie à la version française nue : une seule page légale sera
// indexée, pas cinq copies du même texte français.
function poserAlternates(chemin, traduite) {
  retirerAlternates();
  if (!traduite) return;
  for (const l of LANGUES) {
    poserLien("alternate", SITE + cheminDansLangue(chemin, l.code), l.htmlLang);
  }
  // x-default = la version française nue : c'est elle qu'un moteur sert quand
  // aucune langue déclarée ne correspond à la requête.
  poserLien("alternate", SITE + cheminDansLangue(chemin, LANGUE_DEFAUT), "x-default");
}

function applyMeta({ title, description, image, url, structuredData, robots, traduite }) {
  const langue = langueDuChemin(window.location.pathname) || LANGUE_DEFAUT;
  const chemin = cheminCanonique(url);
  // Une page non traduite n'a qu'une adresse légitime : la française.
  const canonique = SITE + cheminDansLangue(chemin, traduite ? langue : LANGUE_DEFAUT);

  document.title = title ? `${title} — VIT AUTO` : DEFAULTS.title;
  setMeta("description",         description || DEFAULTS.description);
  setMeta("og:title",            title       || DEFAULTS.title,       "property");
  setMeta("og:description",      description || DEFAULTS.description, "property");
  setMeta("og:image",            image       || DEFAULTS.image,       "property");
  setMeta("og:url",              canonique,                           "property");
  setMeta("og:locale",           (LANGUES.find((l) => l.code === langue) || LANGUES[0]).htmlLang.replace("-", "_"), "property");
  setMeta("twitter:title",       title       || DEFAULTS.title);
  setMeta("twitter:description", description || DEFAULTS.description);
  setMeta("twitter:image",       image       || DEFAULTS.image);
  poserLien("canonical", canonique);
  poserAlternates(chemin, traduite);
  setStructuredData(structuredData);
  setRobots(robots);
}

// Met à jour titre + meta description/Open Graph/Twitter/canonical/hreflang/
// JSON-LD pour la page courante — sans ce hook, une fiche véhicule ou une
// annonce Import/Export partagée sur WhatsApp/Facebook affiche toujours
// l'aperçu générique de la page d'accueil (titre, description ET image),
// jamais le contenu réel de la page. Restaure les valeurs par défaut au
// démontage.
//
// `traduite` : cocher UNIQUEMENT si le texte de la page passe entièrement par
// t() et que les clés existent dans les cinq langues. Le test
// i18n.hreflang.test.jsx échoue sinon.
export function useDocumentMeta({ title, description, image, url, structuredData, robots, traduite = false } = {}) {
  // structuredData est un objet reconstruit à chaque rendu par l'appelant —
  // sérialisé pour la dépendance afin de ne réécrire le <script> que quand
  // son CONTENU change réellement, pas à chaque rendu de la page appelante.
  const structuredDataKey = structuredData ? JSON.stringify(structuredData) : null;
  useEffect(() => {
    applyMeta({ title, description, image, url, structuredData, robots, traduite });
    return () => applyMeta({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, image, url, structuredDataKey, robots, traduite]);
}
