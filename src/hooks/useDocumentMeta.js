import { useEffect } from "react";

// Valeurs par défaut — doivent rester synchronisées avec index.html (SPA sans
// SSR : ce fichier ne porte qu'un seul jeu de balises meta, partagé par
// TOUTES les routes tant qu'aucun composant n'appelle ce hook).
const DEFAULTS = {
  title:       "VIT AUTO — Location & Vente de Véhicules en Afrique",
  description: "Louez, achetez ou vendez des véhicules en Afrique de l'Ouest. Catalogue de véhicules, chauffeurs privés, service client 24h/24.",
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

function applyMeta({ title, description, image, url }) {
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
}

// Met à jour titre + meta description/Open Graph/Twitter/canonical pour la
// page courante — sans ce hook, une fiche véhicule ou une annonce Import/Export
// partagée sur WhatsApp/Facebook affiche toujours l'aperçu générique de la
// page d'accueil (titre, description ET image), jamais le contenu réel de la
// page. Restaure les valeurs par défaut au démontage.
export function useDocumentMeta({ title, description, image, url } = {}) {
  useEffect(() => {
    applyMeta({ title, description, image, url });
    return () => applyMeta({});
  }, [title, description, image, url]);
}
