import { useEffect } from "react";

// Valeurs par défaut — doivent rester synchronisées avec index.html (SPA sans
// SSR : ce fichier ne porte qu'un seul jeu de balises meta, partagé par
// TOUTES les routes tant qu'aucun composant n'appelle ce hook).
const DEFAULTS = {
  title:       "VIT AUTO — Location, vente et import de véhicules à l'international",
  description: "Louez, achetez, importez ou exportez un véhicule dans 28 pays. Inspection, transport, dédouanement et livraison gérés de bout en bout, avec paiement sécurisé.",
  image:       "https://vit-auto.com/icons/icon-512x512.png",
  url:         "https://vit-auto.com",
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

function applyMeta({ title, description, image, url, structuredData, robots }) {
  document.title = title ? `${title} — VIT AUTO` : DEFAULTS.title;
  setMeta("description",       description || DEFAULTS.description);
  setMeta("og:title",          title       || DEFAULTS.title,       "property");
  setMeta("og:description",    description || DEFAULTS.description, "property");
  setMeta("og:image",          image       || DEFAULTS.image,       "property");
  setMeta("og:url",            url         || DEFAULTS.url,         "property");
  setMeta("twitter:title",     title       || DEFAULTS.title);
  setMeta("twitter:description", description || DEFAULTS.description);
  setMeta("twitter:image",     image       || DEFAULTS.image);
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.setAttribute("href", url || DEFAULTS.url);
  setStructuredData(structuredData);
  setRobots(robots);
}

// Met à jour titre + meta description/Open Graph/Twitter/canonical/JSON-LD
// pour la page courante — sans ce hook, une fiche véhicule ou une annonce
// Import/Export partagée sur WhatsApp/Facebook affiche toujours l'aperçu
// générique de la page d'accueil (titre, description ET image), jamais le
// contenu réel de la page. Restaure les valeurs par défaut au démontage.
export function useDocumentMeta({ title, description, image, url, structuredData, robots } = {}) {
  // structuredData est un objet reconstruit à chaque rendu par l'appelant —
  // sérialisé pour la dépendance afin de ne réécrire le <script> que quand
  // son CONTENU change réellement, pas à chaque rendu de la page appelante.
  const structuredDataKey = structuredData ? JSON.stringify(structuredData) : null;
  useEffect(() => {
    applyMeta({ title, description, image, url, structuredData, robots });
    return () => applyMeta({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, image, url, structuredDataKey, robots]);
}
