import { useParams, useNavigate, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { useVehicles } from "../context/VehicleContext";
import { useCurrency } from "../context/CurrencyContext";
import { useI18n } from "../context/I18nContext";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import styles from "./VehicleDetails.module.css";

const fmtN = (n) => n != null ? Number(n).toLocaleString("fr-FR") : "—";

function LeasingCard({ leasing, priceForSale, vehicleId, navigate, fmt, t }) {
  const totalEstime = (leasing.apportInitial || 0) + (leasing.mensualite || 0) * (leasing.duree || 36);
  return (
    <div className={styles.leasingCard}>
      <div className={styles.leasingHeader}>
        <span className={styles.leasingBadge}>{t("vd.leasing.badge")}</span>
        <span className={styles.leasingTitle}>{t("vd.leasing.subtitle")}</span>
      </div>
      <div className={styles.leasingGrid}>
        <div className={styles.leasingItem}>
          <span>{t("vd.leasing.deposit")}</span>
          <strong>{fmt(leasing.apportInitial || 0)}</strong>
        </div>
        <div className={styles.leasingItem}>
          <span>{t("vd.leasing.monthly")}</span>
          <strong className={styles.leasingHighlight}>{fmt(leasing.mensualite)} / {t("vd.leasing.months")}</strong>
        </div>
        <div className={styles.leasingItem}>
          <span>{t("vd.leasing.duration")}</span>
          <strong>{leasing.duree} {t("vd.leasing.months")}</strong>
        </div>
        <div className={styles.leasingItem}>
          <span>{t("vd.leasing.rate")}</span>
          <strong>{leasing.tauxInteret || 0} % / an</strong>
        </div>
      </div>
      {leasing.description && (
        <p className={styles.leasingDesc}>{leasing.description}</p>
      )}
      <div className={styles.leasingTotal}>
        <span>{t("vd.leasing.total")} {leasing.duree} {t("vd.leasing.months")}</span>
        <strong>{fmt(totalEstime)}</strong>
      </div>
    </div>
  );
}

// Mirroir de LeasingCard pour le Crédit classique — mêmes champs financiers
// (Vehicle.credit), textes en dur (pas d'entrées i18n dédiées pour l'instant,
// cohérent avec le reste des ajouts de cette session).
function CreditCard({ credit, fmt }) {
  const totalEstime = (credit.apportInitial || 0) + (credit.mensualite || 0) * (credit.duree || 36);
  return (
    <div className={styles.leasingCard}>
      <div className={styles.leasingHeader}>
        <span className={styles.leasingBadge}>Crédit classique</span>
        <span className={styles.leasingTitle}>Financement bancaire — propriété immédiate</span>
      </div>
      <div className={styles.leasingGrid}>
        <div className={styles.leasingItem}>
          <span>Apport initial</span>
          <strong>{fmt(credit.apportInitial || 0)}</strong>
        </div>
        <div className={styles.leasingItem}>
          <span>Mensualité</span>
          <strong className={styles.leasingHighlight}>{fmt(credit.mensualite)} / mois</strong>
        </div>
        <div className={styles.leasingItem}>
          <span>Durée</span>
          <strong>{credit.duree} mois</strong>
        </div>
        <div className={styles.leasingItem}>
          <span>Taux</span>
          <strong>{credit.tauxInteret || 0} % / an</strong>
        </div>
      </div>
      {credit.description && (
        <p className={styles.leasingDesc}>{credit.description}</p>
      )}
      <div className={styles.leasingTotal}>
        <span>Total sur {credit.duree} mois</span>
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
  const { t } = useI18n();

  // Recherche dans le contexte d'abord, puis fallback API
  const getFromCtx = vehiclesCtx.getItemById || ((vid) =>
    vehiclesCtx.vehicles?.find((v) => String(v.id) === String(vid) || v._id === String(vid))
  );
  const [vehicleFromApi, setVehicleFromApi] = useState(null);
  const [apiLoading, setApiLoading]         = useState(false);
  const [notFound, setNotFound]             = useState(false);

  const vehicleInCtx = getFromCtx(id);
  const vehicle = vehicleInCtx || vehicleFromApi;

  // Fallback API : si le véhicule n'est pas dans le contexte, on le charge directement
  useEffect(() => {
    if (vehicleInCtx || apiLoading || vehicleFromApi) return;
    if (!id) return;
    setApiLoading(true);
    fetch(`/api/vehicles/${id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.vehicle) {
          // Normaliser le véhicule reçu (même format que le contexte)
          const v = data.vehicle;
          setVehicleFromApi({
            ...v,
            id:       v._id?.toString() || v.id,
            name:     v.title || `${v.marque || ""} ${v.modele || ""}`.trim() || "Véhicule",
            image:    (Array.isArray(v.images) && v.images[0]) || v.image || null,
            mode:     v.type === "vente" ? "Acheter" : "Louer",
            buyPrice: v.priceForSale,
            leasing:  v.leasing || null,
          });
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setApiLoading(false));
  }, [id, vehicleInCtx]); // eslint-disable-line react-hooks/exhaustive-deps

  const [imgIdx, setImgIdx] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => { setImgIdx(0); }, [id]);

  // Titre/description/image de la fiche partagée sur réseaux sociaux/WhatsApp —
  // avant ce hook, un lien vers CETTE voiture affichait toujours l'aperçu
  // générique de la page d'accueil (voir hooks/useDocumentMeta.js).
  const vehicleImg = (Array.isArray(vehicle?.images) && vehicle.images[0]) || vehicle?.image || null;
  useDocumentMeta(vehicle ? {
    title:       vehicle.title || vehicle.name || `${vehicle.marque || ""} ${vehicle.modele || ""}`.trim(),
    description: vehicle.description || `${vehicle.marque || ""} ${vehicle.modele || ""} ${vehicle.annee || ""} — disponible sur VIT AUTO.`.trim(),
    image:       vehicleImg,
    url:         `https://vit-auto.com/vehicle/${id}`,
  } : {});

  // États de chargement
  if (apiLoading || (vehiclesCtx.vehiclesLoading && !vehicle)) {
    return (
      <div className={styles.notFound}>
        <div className={styles.notFoundIcon} style={{ animation: "none", fontSize: "2rem" }}>⏳</div>
        <h2>{t("vd.loading")}</h2>
      </div>
    );
  }

  if (notFound || (!vehicle && !vehiclesCtx.vehiclesLoading)) {
    return (
      <div className={styles.notFound}>
        <div className={styles.notFoundIcon}>🚗</div>
        <h2>{t("vd.notFound")}</h2>
        <p>{t("vd.notFoundSub")}</p>
        <Link to="/catalogue" className={styles.backBtn}>{t("vd.back")}</Link>
      </div>
    );
  }

  if (!vehicle) return null;

  const images = Array.isArray(vehicle.images) && vehicle.images.length > 0
    ? vehicle.images
    : vehicle.image
      ? [vehicle.image]
      : [];

  const isSale = vehicle.mode === "Acheter" || vehicle.listingType === "vente";
  const priceLabel = isSale ? fmt(vehicle.buyPrice || vehicle.priceForSale) : fmt(vehicle.pricePerDay);
  const priceSuffix = isSale ? "" : ` ${t("vd.perDay")}`;

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
    vehicle.carburant    && { key: "carburant",    label: t("vehicle.fuel")         || "Carburant",   value: vehicle.carburant },
    vehicle.transmission && { key: "transmission", label: t("vehicle.transmission") || "Transmission", value: vehicle.transmission },
    (vehicle.seats || vehicle.nombrePlaces) && { key: "seats", label: t("vehicle.seats") || "Places", value: vehicle.seats || vehicle.nombrePlaces },
    vehicle.annee        && { key: "annee",        label: t("vehicle.year")         || "Année",        value: vehicle.annee },
    vehicle.kilometrage  && { key: "kilometrage",  label: t("vehicle.mileage")      || "Kilométrage",  value: `${Number(vehicle.kilometrage).toLocaleString("fr-FR")} km` },
    vehicle.couleur      && { key: "couleur",      label: t("vehicle.color")        || "Couleur",      value: vehicle.couleur },
    vehicle.etat         && { key: "etat",         label: t("vehicle.condition")    || "État",         value: vehicle.etat },
  ].filter(Boolean);

  return (
    <div className={styles.page}>
      {/* ── Navigation ── */}
      <div className={styles.nav}>
        <button className={styles.backBtn} onClick={() => navigate(-1) || navigate("/catalogue")}>
          {t("vd.back")}
        </button>
        <div className={styles.navRight}>
          <button className={styles.shareBtn} onClick={handleShare}>
            {copied ? t("vd.linkCopied") : t("vd.share")}
          </button>
        </div>
      </div>

      {/* ── En-tête ── */}
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.badges}>
            <span className={isSale ? styles.badgeSale : styles.badgeRent}>
              {isSale ? t("vd.sale") : t("vd.rent")}
            </span>
            {vehicle.type && <span className={styles.badgeType}>{vehicle.type}</span>}
            {vehicle.available !== false
              ? <span className={styles.badgeAvail}>{t("vd.available")}</span>
              : <span className={styles.badgeUnavail}>{t("vd.unavailable")}</span>}
          </div>
          <h1 className={styles.heading}>{vehicle.title || vehicle.name}</h1>
          {(vehicle.ville || vehicle.adresse) && (
            <p className={styles.location}>📍 {[vehicle.ville, vehicle.adresse].filter(Boolean).join(", ")}</p>
          )}
        </div>
        <div className={styles.priceBlock}>
          <span className={styles.price}>{priceLabel}</span>
          {priceSuffix && <span className={styles.priceSuffix}>{priceSuffix}</span>}
          {vehicle.caution > 0 && !isSale && (
            <span className={styles.caution}>{t("vd.caution")} {fmt(vehicle.caution)}</span>
          )}
          {vehicle.noteMoyenne > 0 && (
            <span className={styles.rating}>
              {"★".repeat(Math.round(vehicle.noteMoyenne))}{"☆".repeat(5 - Math.round(vehicle.noteMoyenne))}
              <span> {Number(vehicle.noteMoyenne).toFixed(1)} ({vehicle.nombreAvis} {t("vd.reviews")})</span>
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
              <h3 className={styles.cardTitle}>{t("vd.specs")}</h3>
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
              <h3 className={styles.cardTitle}>{t("vd.description")}</h3>
              <p className={styles.description}>{vehicle.description}</p>
            </div>
          )}

          {/* Options location */}
          {!isSale && (vehicle.climatisation || vehicle.withDriver || vehicle.ageMin) && (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>{t("vd.conditions")}</h3>
              <div className={styles.condList}>
                {vehicle.ageMin && (
                  <span className={styles.condItem}>🎂 {t("vd.ageMin")} {vehicle.ageMin} {t("vd.ageUnit")}</span>
                )}
                {vehicle.permisRequis !== false && (
                  <span className={styles.condItem}>🪪 {t("vd.licenseRequired")}</span>
                )}
                {vehicle.climatisation && (
                  <span className={styles.condItem}>❄️ {t("vd.ac")}</span>
                )}
                {vehicle.withDriver && (
                  <span className={styles.condItem}>👤 {t("vd.withDriver")}</span>
                )}
              </div>
            </div>
          )}

          {/* ── Leasing Calculator (vente avec leasing) ── */}
          {isSale && vehicle.leasing?.disponible && (
            <LeasingCard leasing={vehicle.leasing} priceForSale={vehicle.buyPrice || vehicle.priceForSale} vehicleId={vehicle._id || vehicle.id} navigate={navigate} fmt={fmt} t={t} />
          )}

          {/* ── Crédit classique (vente avec crédit) ── */}
          {isSale && vehicle.credit?.disponible && (
            <CreditCard credit={vehicle.credit} fmt={fmt} />
          )}

          {/* ── Carte annonceur ── */}
          {(vehicle.ownerName || vehicle.contactNom || vehicle.partnerName || vehicle.ownerPhone || vehicle.contactTel) && (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>{t("vd.publisher")}</h3>
              <div className={styles.publisherCard}>
                <div className={styles.publisherAvatar}>
                  {(vehicle.ownerName || vehicle.contactNom || "P").charAt(0).toUpperCase()}
                </div>
                <div className={styles.publisherInfo}>
                  <strong className={styles.publisherName}>
                    {vehicle.ownerName || vehicle.contactNom || vehicle.partnerName || "Partenaire VIT AUTO"}
                  </strong>
                  {vehicle.ownerCity && (
                    <span className={styles.publisherMeta}>📍 {vehicle.ownerCity}</span>
                  )}
                  {vehicle.ownerType && (
                    <span className={styles.publisherMeta}>
                      {vehicle.ownerType === "agency" ? t("vd.agency")
                        : vehicle.ownerType === "dealer" ? t("vd.dealer")
                        : vehicle.ownerType === "fleet" ? t("vd.fleet")
                        : t("vd.partner")}
                    </span>
                  )}
                </div>
                <div className={styles.publisherActions}>
                  {(vehicle.ownerPhone || vehicle.contactTel) && (
                    <a
                      href={`tel:${vehicle.ownerPhone || vehicle.contactTel}`}
                      className={styles.publisherCall}
                    >
                      {t("vd.call")}
                    </a>
                  )}
                  {vehicle.ownerId && (
                    <Link
                      to={`/partner/${vehicle.ownerId}`}
                      className={styles.publisherProfile}
                    >
                      {t("vd.publisherProfile")}
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Bouton CTA */}
          <div className={styles.ctaBlock}>
            {vehicle.available !== false ? (
              <>
                <button
                  className={styles.actionBtn}
                  onClick={() => navigate(`/booking/${vehicle._id || vehicle.id}`)}
                >
                  {isSale ? t("vd.testDriveBtn") : t("vd.bookBtn")}
                </button>
                {isSale && vehicle.leasing?.disponible && (
                  <button
                    className={styles.leasingBtn}
                    onClick={() => navigate(`/booking/${vehicle._id || vehicle.id}?type=leasing`)}
                  >
                    {t("vd.leasing.request")}
                  </button>
                )}
                {isSale && vehicle.credit?.disponible && (
                  <button
                    className={styles.leasingBtn}
                    onClick={() => navigate(`/booking/${vehicle._id || vehicle.id}?type=credit`)}
                  >
                    💳 Demander ce crédit
                  </button>
                )}
              </>
            ) : (
              <div className={styles.unavailMsg}>
                {t("vd.unavailMsg")}
                <Link to="/catalogue" className={styles.altLink}>{t("vd.seeOther")}</Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
