import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import VehicleCard from "../components/VehicleCard/VehicleCard";
import { useVehicles } from "../context/VehicleContext";
import { useCurrency } from "../context/CurrencyContext";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { slugifyCity } from "../constants/citySlug";

// Page d'entrée par VILLE — le seul levier de référencement local qui manquait.
//
// Le catalogue est une URL unique dont les filtres vivent côté client : une
// recherche « location voiture Abidjan » ne pouvait remonter aucune page, faute
// de titre, d'adresse et de contenu correspondant à cette requête. Chaque ville
// réellement desservie a désormais son adresse propre, son titre, ses annonces
// et ses données structurées.
//
// Le contenu est ENTIÈREMENT dérivé des annonces réelles (nombre, prix
// minimum, marques présentes) : aucune phrase de remplissage, aucun chiffre
// décoratif. Une page locale qui promet ce qu'elle n'a pas dessert autant le
// visiteur que le référencement.

const MODES = {
  location: {
    listingType: "location",
    h1:      (ville) => `Location de voiture à ${ville}`,
    titre:   (ville) => `Location de voiture à ${ville}`,
    verbe:   "louer",
    autre:   { chemin: "achat-voiture", libelle: "Acheter un véhicule" },
  },
  vente: {
    listingType: "vente",
    h1:      (ville) => `Voitures à vendre à ${ville}`,
    titre:   (ville) => `Achat de voiture à ${ville}`,
    verbe:   "acheter",
    autre:   { chemin: "location-voiture", libelle: "Louer un véhicule" },
  },
};

export default function LocalLanding({ mode = "location" }) {
  const { ville: slug } = useParams();
  const { vehicles } = useVehicles();
  const { fmtUSD } = useCurrency();
  const cfg = MODES[mode] || MODES.location;

  // Annonces publiées dans cette ville, pour ce mode.
  const { annonces, nomVille, autresVilles } = useMemo(() => {
    const dispo = (vehicles || []).filter((v) => v.ville && v.listingType === cfg.listingType);
    const correspond = dispo.filter((v) => slugifyCity(v.ville) === slug);
    // Le nom affiché vient de la donnée, pas du slug : « abidjan » redevient
    // « Abidjan » tel que le partenaire l'a saisi, jamais une capitalisation
    // devinée qui écorcherait « Bouaké » ou « Saint-Louis ».
    const nom = correspond[0]?.ville
      || String(slug || "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    const compte = new Map();
    for (const v of dispo) {
      const s = slugifyCity(v.ville);
      if (s === slug) continue;
      compte.set(s, { slug: s, nom: v.ville, n: (compte.get(s)?.n || 0) + 1 });
    }
    return {
      annonces: correspond,
      nomVille: nom,
      autresVilles: [...compte.values()].sort((a, b) => b.n - a.n).slice(0, 12),
    };
  }, [vehicles, slug, cfg.listingType]);

  const prixMin = useMemo(() => {
    const prix = annonces
      .map((v) => (cfg.listingType === "vente" ? v.priceForSale : v.pricePerDay))
      .filter((p) => typeof p === "number" && p > 0);
    return prix.length ? Math.min(...prix) : null;
  }, [annonces, cfg.listingType]);

  const marques = useMemo(
    () => [...new Set(annonces.map((v) => v.marque).filter(Boolean))].slice(0, 8),
    [annonces]
  );

  const url = `https://vit-auto.com/${mode === "vente" ? "achat-voiture" : "location-voiture"}/${slug}`;
  const description = annonces.length
    ? `${annonces.length} véhicule${annonces.length > 1 ? "s" : ""} à ${cfg.verbe} à ${nomVille}`
      + (prixMin ? `, à partir de ${fmtUSD(prixMin)}${cfg.listingType === "location" ? " par jour" : ""}` : "")
      + `. Réservation en ligne, contrat digital et assistance VIT AUTO.`
    : `Aucune annonce disponible à ${nomVille} pour le moment. Découvrez tout le catalogue VIT AUTO.`;

  useDocumentMeta({
    title: cfg.titre(nomVille),
    description,
    url,
    // Une ville sans annonce est une page mince : la laisser indexable
    // fabriquerait des dizaines d'adresses sans contenu, ce que les moteurs
    // sanctionnent — et ce que l'utilisateur déteste trouver.
    robots: annonces.length ? undefined : "noindex, follow",
    structuredData: annonces.length
      ? {
          "@context": "https://schema.org",
          "@type": "Service",
          name: cfg.h1(nomVille),
          serviceType: cfg.listingType === "vente" ? "Car Sales" : "Car Rental",
          provider: { "@type": "AutoDealer", name: "VIT AUTO", url: "https://vit-auto.com" },
          areaServed: { "@type": "City", name: nomVille },
          url,
          ...(prixMin
            ? { offers: { "@type": "Offer", priceCurrency: "USD", price: prixMin, availability: "https://schema.org/InStock" } }
            : {}),
        }
      : null,
  });

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "2rem 1.25rem 3rem" }}>
      <nav style={{ fontSize: ".8rem", color: "#64748b", marginBottom: 12 }}>
        <Link to="/" style={{ color: "#64748b" }}>Accueil</Link>
        {" › "}
        <Link to="/catalogue" style={{ color: "#64748b" }}>Catalogue</Link>
        {" › "}<span style={{ color: "#0f1b3f", fontWeight: 700 }}>{nomVille}</span>
      </nav>

      <h1 style={{ fontSize: "1.7rem", color: "#0f1b3f", margin: "0 0 8px" }}>{cfg.h1(nomVille)}</h1>
      <p style={{ color: "#475569", fontSize: ".95rem", maxWidth: 760, lineHeight: 1.55 }}>{description}</p>

      {marques.length > 0 && (
        <p style={{ color: "#64748b", fontSize: ".85rem", marginTop: 4 }}>
          Marques disponibles à {nomVille} : {marques.join(", ")}.
        </p>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "16px 0 24px" }}>
        <Link to={`/catalogue?location=${encodeURIComponent(nomVille)}`}
          style={{ padding: "9px 16px", borderRadius: 10, background: "#0f1b3f", color: "#fff", fontWeight: 700, fontSize: ".85rem", textDecoration: "none" }}>
          Voir tout le catalogue de {nomVille}
        </Link>
        <Link to={`/${cfg.autre.chemin}/${slug}`}
          style={{ padding: "9px 16px", borderRadius: 10, border: "1.5px solid #dbe2ef", color: "#1a3a6e", fontWeight: 700, fontSize: ".85rem", textDecoration: "none" }}>
          {cfg.autre.libelle} à {nomVille}
        </Link>
      </div>

      {annonces.length === 0 ? (
        <p style={{ color: "#64748b" }}>
          Aucune annonce publiée à {nomVille} pour l'instant.{" "}
          <Link to="/catalogue" style={{ color: "#4338ca", fontWeight: 700 }}>Parcourir tout le catalogue</Link>.
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 18 }}>
          {annonces.map((v) => <VehicleCard key={v.id || v._id} car={v} />)}
        </div>
      )}

      {autresVilles.length > 0 && (
        <section style={{ marginTop: 36, paddingTop: 20, borderTop: "1.5px solid #e2e8f0" }}>
          <h2 style={{ fontSize: "1rem", color: "#0f1b3f", marginBottom: 10 }}>Autres villes desservies</h2>
          {/* Maillage interne : sans ces liens, chaque page locale serait une
              impasse que les moteurs n'atteindraient que par le sitemap. */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {autresVilles.map((c) => (
              <Link key={c.slug} to={`/${mode === "vente" ? "achat-voiture" : "location-voiture"}/${c.slug}`}
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
