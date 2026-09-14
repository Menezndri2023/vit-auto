import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useVehicles } from "../context/VehicleContext";
import { useCurrency } from "../context/CurrencyContext";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { slugifyCity } from "../constants/citySlug";
import { ActivityCard, PartCard } from "./Catalogue";
import { PART_CATEGORY_LABELS } from "../constants/spareParts";
import { ACTIVITY_TYPE_LABELS } from "../constants/activityTypes";

// Pages d'entrée des deux secteurs récents — même principe que LocalLanding
// (location/vente par ville) : une adresse propre, un titre, des annonces
// réelles et des données structurées pour chaque requête locale, contenu
// ENTIÈREMENT dérivé des annonces publiées (jamais de remplissage).
//
//   /activites/:ville         — activités & loisirs réservables dans une ville
//   /pieces-detachees/:marque — pièces détachées compatibles avec une marque
//
// Une page sans annonce reste en noindex : une adresse mince nuit au
// référencement et déçoit le visiteur.

const MODES = {
  activites: {
    chemin: "activites",
    h1:    (nom) => `Activités & loisirs à ${nom}`,
    titre: (nom) => `Activités & loisirs à ${nom} — réservation en ligne`,
    intro: (n, nom, prixMin, fmt) => `${n} activité${n > 1 ? "s" : ""} réservable${n > 1 ? "s" : ""} à ${nom}`
      + (prixMin ? `, à partir de ${fmt(prixMin)} par personne` : "") + ". Réservation en ligne, condition météo affichée quand elle s'applique, règlement sur place.",
    vide: (nom) => `Aucune activité publiée à ${nom} pour le moment. Découvrez les activités & loisirs de tout le catalogue VIT AUTO.`,
    catalogue: (nom) => `/catalogue?mode=Autres&location=${encodeURIComponent(nom)}`,
    catalogueLibelle: (nom) => `Toutes les activités à ${nom}`,
    serviceType: "Leisure activities",
    cle: (a) => a.ville,
    prix: (a) => a.price,
    Card: ActivityCard,
    facettes: (annonces) => [...new Set(annonces.map((a) => ACTIVITY_TYPE_LABELS[a.activityType] || a.activityType).filter(Boolean))].slice(0, 8),
    facettesLibelle: "Types d'activités",
    autresLibelle: "Autres villes",
  },
  pieces: {
    chemin: "pieces-detachees",
    h1:    (nom) => `Pièces détachées ${nom}`,
    titre: (nom) => `Pièces détachées ${nom} — vente directe ou importation, livrées`,
    intro: (n, nom, prixMin, fmt) => `${n} pièce${n > 1 ? "s" : ""} compatible${n > 1 ? "s" : ""} ${nom}`
      + (prixMin ? `, à partir de ${fmt(prixMin)}` : "") + ". En stock chez nos partenaires ou importées à la commande, toujours livrées, règlement à la réception.",
    vide: (nom) => `Aucune pièce ${nom} publiée pour le moment. Découvrez toutes les pièces détachées du catalogue VIT AUTO.`,
    catalogue: (nom) => `/catalogue?mode=Pieces&location=${encodeURIComponent(nom)}`,
    catalogueLibelle: (nom) => `Toutes les pièces ${nom}`,
    serviceType: "Auto parts",
    cle: null, // marque : plusieurs par annonce (compatibility[])
    prix: (p) => p.price,
    Card: PartCard,
    facettes: (annonces) => [...new Set(annonces.map((p) => PART_CATEGORY_LABELS[p.category] || p.category).filter(Boolean))].slice(0, 8),
    facettesLibelle: "Catégories disponibles",
    autresLibelle: "Autres marques",
  },
};

export default function SectorLanding({ mode = "activites" }) {
  const params = useParams();
  const slug = params.ville || params.marque;
  const { activities, parts } = useVehicles();
  const { fmtUSD } = useCurrency();
  const cfg = MODES[mode] || MODES.activites;

  const { annonces, nom, autres } = useMemo(() => {
    const source = mode === "pieces" ? (parts || []) : (activities || []);
    // Une annonce peut porter plusieurs clés (une pièce compatible avec
    // plusieurs marques) : on indexe chaque clé.
    const clesDe = (a) => mode === "pieces"
      ? [...new Set((a.compatibility || []).map((c) => c.marque).filter(Boolean))]
      : [a.ville].filter(Boolean);
    const correspond = source.filter((a) => clesDe(a).some((k) => slugifyCity(k) === slug));
    const nomReel = correspond.flatMap(clesDe).find((k) => slugifyCity(k) === slug)
      || String(slug || "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const compte = new Map();
    for (const a of source) for (const k of clesDe(a)) {
      const s = slugifyCity(k);
      if (s === slug) continue;
      compte.set(s, { slug: s, nom: k, n: (compte.get(s)?.n || 0) + 1 });
    }
    return { annonces: correspond, nom: nomReel, autres: [...compte.values()].sort((a, b) => b.n - a.n).slice(0, 12) };
  }, [activities, parts, mode, slug]);

  const prixMin = useMemo(() => {
    const prix = annonces.map(cfg.prix).filter((p) => typeof p === "number" && p > 0);
    return prix.length ? Math.min(...prix) : null;
  }, [annonces, cfg]);
  const facettes = useMemo(() => cfg.facettes(annonces), [annonces, cfg]);

  const url = `https://vit-auto.com/${cfg.chemin}/${slug}`;
  const description = annonces.length ? cfg.intro(annonces.length, nom, prixMin, fmtUSD) : cfg.vide(nom);

  useDocumentMeta({
    title: cfg.titre(nom),
    description,
    url,
    robots: annonces.length ? undefined : "noindex, follow",
    structuredData: annonces.length
      ? {
          "@context": "https://schema.org",
          "@type": "Service",
          name: cfg.h1(nom),
          serviceType: cfg.serviceType,
          provider: { "@type": "Organization", name: "VIT AUTO", url: "https://vit-auto.com" },
          ...(mode === "activites" ? { areaServed: { "@type": "City", name: nom } } : { category: nom }),
          url,
          ...(prixMin ? { offers: { "@type": "Offer", priceCurrency: "USD", price: prixMin, availability: "https://schema.org/InStock" } } : {}),
        }
      : null,
  });

  const Card = cfg.Card;
  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "2rem 1.25rem 3rem" }}>
      <nav style={{ fontSize: ".8rem", color: "#64748b", marginBottom: 12 }}>
        <Link to="/" style={{ color: "#64748b" }}>Accueil</Link>
        {" › "}
        <Link to={mode === "pieces" ? "/catalogue?mode=Pieces" : "/catalogue?mode=Autres"} style={{ color: "#64748b" }}>
          {mode === "pieces" ? "Pièces détachées" : "Activités & loisirs"}
        </Link>
        {" › "}<span style={{ color: "#0f1b3f", fontWeight: 700 }}>{nom}</span>
      </nav>

      <h1 style={{ fontSize: "1.7rem", color: "#0f1b3f", margin: "0 0 8px" }}>{cfg.h1(nom)}</h1>
      <p style={{ color: "#475569", fontSize: ".95rem", maxWidth: 760, lineHeight: 1.55 }}>{description}</p>
      {facettes.length > 0 && (
        <p style={{ color: "#64748b", fontSize: ".85rem", marginTop: 4 }}>{cfg.facettesLibelle} : {facettes.join(", ")}.</p>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "16px 0 24px" }}>
        <Link to={cfg.catalogue(nom)}
          style={{ padding: "9px 16px", borderRadius: 10, background: "#0f1b3f", color: "#fff", fontWeight: 700, fontSize: ".85rem", textDecoration: "none" }}>
          {cfg.catalogueLibelle(nom)}
        </Link>
      </div>

      {annonces.length === 0 ? (
        <p style={{ color: "#64748b" }}>
          Aucune annonce pour l'instant.{" "}
          <Link to={mode === "pieces" ? "/catalogue?mode=Pieces" : "/catalogue?mode=Autres"} style={{ color: "#4338ca", fontWeight: 700 }}>Parcourir le catalogue</Link>.
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 18 }}>
          {annonces.map((a) => (mode === "pieces" ? <Card key={a._id} p={a} /> : <Card key={a._id} a={a} />))}
        </div>
      )}

      {autres.length > 0 && (
        <section style={{ marginTop: 36, paddingTop: 20, borderTop: "1.5px solid #e2e8f0" }}>
          <h2 style={{ fontSize: "1rem", color: "#0f1b3f", marginBottom: 10 }}>{cfg.autresLibelle}</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {autres.map((c) => (
              <Link key={c.slug} to={`/${cfg.chemin}/${c.slug}`}
                style={{ padding: ".35rem .75rem", borderRadius: 999, background: "#fff", border: "1px solid #dbe2ef", color: "#1a3a6e", fontSize: ".8rem", fontWeight: 600, textDecoration: "none" }}>
                {c.nom} ({c.n})
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
