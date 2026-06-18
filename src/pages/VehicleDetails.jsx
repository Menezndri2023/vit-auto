import { useParams, useNavigate, Link } from "react-router-dom";
import { useState, useMemo } from "react";
import { useVehicles } from "../context/VehicleContext";
import { useCurrency } from "../context/CurrencyContext";
import styles from "./VehicleDetails.module.css";

const fmtN = (n) => n != null ? Number(n).toLocaleString("fr-FR") : "—";

function LeasingCard({ leasing, priceForSale, vehicleId, navigate, fmt }) {
  const totalEstime = (leasing.apportInitial || 0) + (leasing.mensualite || 0) * (leasing.duree || 36);
  return (
    <div className={styles.leasingCard}>
      <div className={styles.leasingHeader}>
        <span className={styles.leasingBadge}>🏦 Leasing disponible</span>
        <span className={styles.leasingTitle}>Achetez en mensualités</span>
      </div>
      <div className={styles.leasingGrid}>
        <div className={styles.leasingItem}>
          <span>Apport initial</span>
          <strong>{fmt(leasing.apportInitial || 0)}</strong>
        </div>
        <div className={styles.leasingItem}>
          <span>Mensualité</span>
          <strong className={styles.leasingHighlight}>{fmt(leasing.mensualite)} / mois</strong>
        </div>
        <div className={styles.leasingItem}>
          <span>Durée</span>
          <strong>{leasing.duree} mois</strong>
        </div>
        <div className={styles.leasingItem}>
          <span>Taux d'intérêt</span>
          <strong>{leasing.tauxInteret || 0} % / an</strong>
        </div>
      </div>
      {leasing.description && (
        <p className={styles.leasingDesc}>{leasing.description}</p>
      )}
      <div className={styles.leasingTotal}>
        <span>Total estimé sur {leasing.duree} mois</span>
        <strong>{fmt(totalEstime)}</strong>
      </div>
    </div>
  );
}

const SPEC_ICONS = {
  carburant:    "⛽",
  transmission: "⚙️",
  seats:        "👥",
  annee:        "📅",
  kilometrage:  "🛣️",
  couleur:      "🎨",
  etat:         "✨",
};

export default function VehicleDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const vehiclesCtx = useVehicles();
  const { fmt } = useCurrency();
  const getVehicleById = vehiclesCtx.getItemById || ((vid) =>
    vehiclesCtx.vehicles?.find((v) => String(v.id) === String(vid) || v._id === String(vid))
  );
  const vehicle = getVehicleById(id);
  const [imgIdx, setImgIdx] = useState(0);
  const [copied, setCopied] = useState(false);

  if (!vehicle) {
    return (
      <div className={styles.notFound}>
        <div className={styles.notFoundIcon}>🚗</div>
        <h2>Véhicule introuvable</h2>
        <p>Ce véhicule n'existe plus ou a été retiré.</p>
        <Link to="/catalogue" className={styles.backBtn}>← Retour au catalogue</Link>
      </div>
    );
  }

  const images = Array.isArray(vehicle.images) && vehicle.images.length > 0
    ? vehicle.images
    : vehicle.image
      ? [vehicle.image]
      : [];

  const isSale = vehicle.mode === "Acheter" || vehicle.listingType === "vente";
  const priceLabel = isSale ? fmt(vehicle.buyPrice || vehicle.priceForSale) : fmt(vehicle.pricePerDay);
  const priceSuffix = isSale ? "" : " / jour";

  const shareUrl = window.location.href;
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: vehicle.name, url: shareUrl });
      } catch { /* user cancelled */ }
    } else {
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const specs = [
    vehicle.carburant    && { key: "carburant",    label: "Carburant",      value: vehicle.carburant },
    vehicle.transmission && { key: "transmission", label: "Transmission",   value: vehicle.transmission },
    (vehicle.seats || vehicle.nombrePlaces) && { key: "seats", label: "Places", value: vehicle.seats || vehicle.nombrePlaces },
    vehicle.annee        && { key: "annee",        label: "Année",          value: vehicle.annee },
    vehicle.kilometrage  && { key: "kilometrage",  label: "Kilométrage",    value: `${Number(vehicle.kilometrage).toLocaleString("fr-FR")} km` },
    vehicle.couleur      && { key: "couleur",      label: "Couleur",        value: vehicle.couleur },
    vehicle.etat         && { key: "etat",         label: "État",           value: vehicle.etat },
  ].filter(Boolean);

  return (
    <div className={styles.page}>
      {/* ── Navigation ── */}
      <div className={styles.nav}>
        <button className={styles.backBtn} onClick={() => navigate(-1)}>
          ← Retour
        </button>
        <div className={styles.navRight}>
          <button className={styles.shareBtn} onClick={handleShare}>
            {copied ? "✓ Lien copié !" : "🔗 Partager"}
          </button>
        </div>
      </div>

      {/* ── En-tête ── */}
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.badges}>
            <span className={isSale ? styles.badgeSale : styles.badgeRent}>
              {isSale ? "Vente" : "Location"}
            </span>
            {vehicle.type && <span className={styles.badgeType}>{vehicle.type}</span>}
            {vehicle.available !== false
              ? <span className={styles.badgeAvail}>Disponible</span>
              : <span className={styles.badgeUnavail}>Indisponible</span>}
          </div>
          <h1 className={styles.heading}>{vehicle.name}</h1>
          {(vehicle.ville || vehicle.adresse) && (
            <p className={styles.location}>📍 {[vehicle.ville, vehicle.adresse].filter(Boolean).join(", ")}</p>
          )}
        </div>
        <div className={styles.priceBlock}>
          <span className={styles.price}>{priceLabel}</span>
          {priceSuffix && <span className={styles.priceSuffix}>{priceSuffix}</span>}
          {vehicle.caution > 0 && !isSale && (
            <span className={styles.caution}>Caution : {fmt(vehicle.caution)}</span>
          )}
          {vehicle.noteMoyenne > 0 && (
            <span className={styles.rating}>
              {"★".repeat(Math.round(vehicle.noteMoyenne))}{"☆".repeat(5 - Math.round(vehicle.noteMoyenne))}
              <span> {Number(vehicle.noteMoyenne).toFixed(1)} ({vehicle.nombreAvis} avis)</span>
            </span>
          )}
        </div>
      </div>

      <div className={styles.content}>
        {/* ── Galerie ── */}
        <div className={styles.gallery}>
          <div className={styles.mainImg}>
            {images.length > 0
              ? <img src={images[imgIdx]} alt={vehicle.name} />
              : <div className={styles.noImg}>🚗</div>}
          </div>
          {images.length > 1 && (
            <div className={styles.thumbRow}>
              {images.map((src, i) => (
                <button
                  key={i}
                  className={`${styles.thumb} ${i === imgIdx ? styles.thumbActive : ""}`}
                  onClick={() => setImgIdx(i)}
                >
                  <img src={src} alt={`vue ${i + 1}`} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Détails ── */}
        <div className={styles.details}>
          {/* Spécifications */}
          {specs.length > 0 && (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Caractéristiques</h3>
              <div className={styles.specsGrid}>
                {specs.map(({ key, label, value }) => (
                  <div key={key} className={styles.specItem}>
                    <span className={styles.specIcon}>{SPEC_ICONS[key] || "•"}</span>
                    <div>
                      <span className={styles.specLabel}>{label}</span>
                      <span className={styles.specValue}>{value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {vehicle.description && (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Description</h3>
              <p className={styles.description}>{vehicle.description}</p>
            </div>
          )}

          {/* Options location */}
          {!isSale && (vehicle.climatisation || vehicle.withDriver || vehicle.ageMin) && (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Conditions</h3>
              <div className={styles.condList}>
                {vehicle.ageMin && (
                  <span className={styles.condItem}>🎂 Âge minimum : {vehicle.ageMin} ans</span>
                )}
                {vehicle.permisRequis !== false && (
                  <span className={styles.condItem}>🪪 Permis de conduire requis</span>
                )}
                {vehicle.climatisation && (
                  <span className={styles.condItem}>❄️ Climatisation incluse</span>
                )}
                {vehicle.withDriver && (
                  <span className={styles.condItem}>👤 Option avec chauffeur disponible</span>
                )}
              </div>
            </div>
          )}

          {/* ── Leasing Calculator (vente avec leasing) ── */}
          {isSale && vehicle.leasing?.disponible && (
            <LeasingCard leasing={vehicle.leasing} priceForSale={vehicle.buyPrice || vehicle.priceForSale} vehicleId={vehicle._id || vehicle.id} navigate={navigate} fmt={fmt} />
          )}

          {/* Bouton CTA */}
          <div className={styles.ctaBlock}>
            {vehicle.available !== false ? (
              <>
                <button
                  className={styles.actionBtn}
                  onClick={() => navigate(`/booking/${vehicle._id || vehicle.id}`)}
                >
                  {isSale ? "🔑 Demander un essai" : "📅 Réserver ce véhicule"}
                </button>
                {isSale && vehicle.leasing?.disponible && (
                  <button
                    className={styles.leasingBtn}
                    onClick={() => navigate(`/booking/${vehicle._id || vehicle.id}?type=leasing`)}
                  >
                    🏦 Demander un leasing
                  </button>
                )}
              </>
            ) : (
              <div className={styles.unavailMsg}>
                Ce véhicule n'est pas disponible pour le moment.
                <Link to="/catalogue" className={styles.altLink}>Voir d'autres véhicules</Link>
              </div>
            )}
            {vehicle.contactTel && (
              <a href={`tel:${vehicle.contactTel}`} className={styles.callBtn}>
                📞 Appeler le partenaire
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
