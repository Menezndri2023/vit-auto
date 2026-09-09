import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCurrency } from "../context/CurrencyContext";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { slugifyCity } from "../constants/citySlug";
import { IMPORT_ORIGINS } from "../constants/importOrigins";

// Page d'entrée par PAYS D'ORIGINE — pendant international des pages de ville.
//
// « Importer une voiture depuis la Chine » ou « acheter une voiture au Japon »
// sont des requêtes à forte intention d'achat, sur lesquelles VIT AUTO n'avait
// aucune page : les quinze origines n'existaient que sous forme de filtres du
// catalogue Import/Export, derrière une URL unique.
//
// Le compte et les prix viennent des annonces réellement publiées. Une origine
// est un corridor logistique ouvert même sans stock à l'instant T (voir
// constants/importOrigins.js) — la page reste donc utile et le dit
// explicitement, mais passe en noindex tant qu'elle n'a rien à montrer.

export default function ImportOriginLanding() {
  const { pays: slug } = useParams();
  const { fmtUSD } = useCurrency();
  // `null` = pas encore chargé, `[]` = chargé et vide. Un état de chargement
  // distinct imposait un setState synchrone dans le corps de l'effet, qui
  // provoque des rendus en cascade.
  const [donnees, setDonnees] = useState(null);

  const origine = useMemo(
    () => IMPORT_ORIGINS.find((o) => slugifyCity(o.name) === slug) || null,
    [slug]
  );
  const nomPays = origine?.name
    || String(slug || "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  useEffect(() => {
    let annule = false;
    fetch(`/api/import-export/listings?sourceCountry=${encodeURIComponent(nomPays)}&limit=50`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!annule) setDonnees(d?.listings || []); })
      .catch(() => { if (!annule) setDonnees([]); });
    return () => { annule = true; };
  }, [nomPays, slug]);

  const chargement = donnees === null;
  // Mémorisé : un `donnees || []` recréerait un tableau à chaque rendu, et les
  // useMemo qui en dépendent se recalculeraient sans raison.
  const annonces = useMemo(() => donnees || [], [donnees]);

  const prixMin = useMemo(() => {
    const prix = annonces.map((l) => l.price).filter((p) => typeof p === "number" && p > 0);
    return prix.length ? Math.min(...prix) : null;
  }, [annonces]);

  const marques = useMemo(
    () => [...new Set(annonces.map((l) => l.make).filter(Boolean))].slice(0, 10),
    [annonces]
  );

  const url = `https://vit-auto.com/import-voiture/${slug}`;
  const description = annonces.length
    ? `${annonces.length} véhicule${annonces.length > 1 ? "s" : ""} à importer depuis ${nomPays}`
      + (prixMin ? `, à partir de ${fmtUSD(prixMin)}` : "")
      + `. Inspection avant achat, transport maritime, dédouanement et livraison gérés par VIT AUTO.`
    : `Importation de véhicules depuis ${nomPays} avec VIT AUTO : inspection, transport, dédouanement et livraison. Aucune annonce en stock pour le moment.`;

  useDocumentMeta({
    title: `Importer une voiture depuis ${nomPays}`,
    description,
    url,
    robots: annonces.length ? undefined : "noindex, follow",
    structuredData: annonces.length
      ? {
          "@context": "https://schema.org",
          "@type": "Service",
          name: `Importation de véhicules depuis ${nomPays}`,
          serviceType: "Vehicle Import",
          provider: { "@type": "AutoDealer", name: "VIT AUTO", url: "https://vit-auto.com" },
          areaServed: { "@type": "Country", name: nomPays },
          url,
          ...(prixMin
            ? { offers: { "@type": "Offer", priceCurrency: "USD", price: prixMin, availability: "https://schema.org/InStock" } }
            : {}),
        }
      : null,
  });

  const autres = IMPORT_ORIGINS.filter((o) => slugifyCity(o.name) !== slug);

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "2rem 1.25rem 3rem" }}>
      <nav style={{ fontSize: ".8rem", color: "#64748b", marginBottom: 12 }}>
        <Link to="/" style={{ color: "#64748b" }}>Accueil</Link>{" › "}
        <Link to="/import-export" style={{ color: "#64748b" }}>Import / Export</Link>{" › "}
        <span style={{ color: "#0f1b3f", fontWeight: 700 }}>{nomPays}</span>
      </nav>

      <h1 style={{ fontSize: "1.7rem", color: "#0f1b3f", margin: "0 0 8px" }}>
        {origine?.flag ? `${origine.flag} ` : ""}Importer une voiture depuis {nomPays}
      </h1>
      <p style={{ color: "#475569", fontSize: ".95rem", maxWidth: 780, lineHeight: 1.55 }}>{description}</p>

      {marques.length > 0 && (
        <p style={{ color: "#64748b", fontSize: ".85rem", marginTop: 4 }}>
          Marques disponibles depuis {nomPays} : {marques.join(", ")}.
        </p>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "16px 0 24px" }}>
        <Link to={`/import-export/listings?source=${encodeURIComponent(nomPays)}`}
          style={{ padding: "9px 16px", borderRadius: 10, background: "#0f1b3f", color: "#fff", fontWeight: 700, fontSize: ".85rem", textDecoration: "none" }}>
          Voir toutes les annonces depuis {nomPays}
        </Link>
        <Link to="/import-export"
          style={{ padding: "9px 16px", borderRadius: 10, border: "1.5px solid #dbe2ef", color: "#1a3a6e", fontWeight: 700, fontSize: ".85rem", textDecoration: "none" }}>
          Comment fonctionne l'importation
        </Link>
      </div>

      {chargement ? (
        <p style={{ color: "#94a3b8" }}>Chargement des annonces…</p>
      ) : annonces.length === 0 ? (
        <p style={{ color: "#64748b" }}>
          Aucune annonce en stock depuis {nomPays} actuellement — le corridor reste ouvert.{" "}
          <Link to="/import-export/listings" style={{ color: "#4338ca", fontWeight: 700 }}>Voir toutes les origines</Link>.
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
          {annonces.slice(0, 24).map((l) => (
            <Link key={l._id} to={`/import-export/listings/${l._id}`}
              style={{ display: "block", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", textDecoration: "none", color: "inherit" }}>
              {l.images?.[0] && (
                <img src={l.images[0]} alt={l.title} loading="lazy" decoding="async"
                  style={{ width: "100%", height: 150, objectFit: "cover", display: "block" }} />
              )}
              <div style={{ padding: "10px 12px" }}>
                <div style={{ fontWeight: 700, fontSize: ".88rem", color: "#0f1b3f" }}>{l.title}</div>
                <div style={{ fontSize: ".8rem", color: "#64748b", marginTop: 2 }}>
                  {[l.year, l.make].filter(Boolean).join(" · ")}
                </div>
                {typeof l.price === "number" && l.price > 0 && (
                  <div style={{ fontWeight: 800, color: "#0ea5e9", marginTop: 6, fontSize: ".9rem" }}>
                    {fmtUSD(l.price)}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      <section style={{ marginTop: 36, paddingTop: 20, borderTop: "1.5px solid #e2e8f0" }}>
        <h2 style={{ fontSize: "1rem", color: "#0f1b3f", marginBottom: 10 }}>Autres pays d'origine</h2>
        {/* Maillage interne entre les quinze corridors : chaque page renvoie
            vers les autres, sinon chacune serait une impasse. */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {autres.map((o) => (
            <Link key={o.code} to={`/import-voiture/${slugifyCity(o.name)}`}
              style={{ padding: ".35rem .75rem", borderRadius: 999, background: "#fff", border: "1px solid #dbe2ef", color: "#1a3a6e", fontSize: ".8rem", fontWeight: 600, textDecoration: "none" }}>
              {o.flag} {o.name}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
