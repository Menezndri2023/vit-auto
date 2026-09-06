import { useParams, useNavigate, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { useVehicles } from "../context/VehicleContext";
import { useCurrency } from "../context/CurrencyContext";
import { useI18n } from "../context/I18nContext";
import { useCart } from "../context/CartContext";
import { useToast } from "../context/ToastContext";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import ReportButton from "../components/ReportButton/ReportButton";
import PriceTag from "../components/PriceTag/PriceTag";
import { optimizedImageUrl } from "../utils/imageOptim";
import { getCustomerServiceContact } from "../utils/customerServiceContact";
import styles from "./VehicleDetails.module.css";

const fmtN = (n) => n != null ? Number(n).toLocaleString("fr-FR") : "—";
const fmtInspDate = (d) => d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : null;
const RATING_LABEL = { excellent: "Excellent", bon: "Bon", moyen: "Moyen", mauvais: "Mauvais", na: "N/A" };
const RATING_COLOR = { excellent: "#10b981", bon: "#3b82f6", moyen: "#f59e0b", mauvais: "#ef4444", na: "#94a3b8" };

// ── Rapport d'inspection ─────────────────────────────────────────────────
// Même composant que IEListingDetail.jsx's InspectionSection, sur le nouvel
// endpoint /api/vehicles/:id/inspection-report (généralisation d'
// InspectionReport au-delà des annonces Import/Export).
function InspectionSection({ vehicleId }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/vehicles/${vehicleId}/inspection-report`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { setReport(d?.report || null); setLoading(false); })
      .catch(() => setLoading(false));
  }, [vehicleId]);

  if (loading || !report) return null; // pas de rapport = section masquée (pas de bruit sur la fiche véhicule)

  const components = [
    { key: "engine",       label: "Moteur",           icon: "⚙️" },
    { key: "transmission", label: "Boîte de vitesses", icon: "🔧" },
    { key: "suspension",   label: "Suspension",       icon: "🛞" },
    { key: "brakes",       label: "Freins",           icon: "🛑" },
    { key: "tires",        label: "Pneus",            icon: "⬛" },
    { key: "bodywork",     label: "Carrosserie",      icon: "🚗" },
    { key: "interior",     label: "Intérieur",        icon: "🪑" },
    { key: "electronics",  label: "Électronique",     icon: "💡" },
    { key: "battery",      label: "Batterie (VE)",    icon: "🔋" },
  ];

  return (
    <div className={styles.card}>
      <div className={styles.inspSectionHeader}>
        <span>🔍</span><h3 className={styles.cardTitle}>Rapport d'inspection</h3>
        <div className={styles.overallBadge} style={{ background: RATING_COLOR[report.overallRating] + "22", color: RATING_COLOR[report.overallRating] }}>
          {RATING_LABEL[report.overallRating]}
        </div>
      </div>

      <div className={styles.inspMeta}>
        {report.inspectorName && <span>👤 {report.inspectorName}</span>}
        {report.inspectionDate && <span>📅 {fmtInspDate(report.inspectionDate)}</span>}
        {report.inspectionLocation && <span>📍 {report.inspectionLocation}</span>}
      </div>

      <div className={styles.inspGrid}>
        {components.map(({ key, label, icon }) => {
          const comp = report[key];
          if (!comp || comp.rating === "na") return null;
          return (
            <div key={key} className={styles.inspItem}>
              <span className={styles.inspIcon}>{icon}</span>
              <div>
                <p className={styles.inspLabel}>{label}</p>
                <span className={styles.inspRating} style={{ color: RATING_COLOR[comp.rating] }}>
                  {RATING_LABEL[comp.rating]}
                </span>
                {comp.notes && <p className={styles.inspNotes}>{comp.notes}</p>}
              </div>
            </div>
          );
        })}
      </div>

      {report.overallNotes && (
        <div className={styles.overallNotes}>
          <strong>Observations générales :</strong>
          <p>{report.overallNotes}</p>
        </div>
      )}

      {report.defects?.length > 0 && (
        <div className={styles.defects}>
          <button className={styles.defectsToggle} onClick={() => setOpen((o) => !o)}>
            ⚠️ {report.defects.length} défaut(s) signalé(s) {open ? "▲" : "▼"}
          </button>
          {open && (
            <div className={styles.defectsList}>
              {report.defects.map((d, i) => (
                <div key={i} className={styles.defectItem}>
                  <span className={styles.defectSeverity} data-severity={d.severity}>
                    {d.severity === "majeur" ? "🔴" : d.severity === "modere" ? "🟡" : "🟢"} {d.severity}
                  </span>
                  <p>{d.description}</p>
                  {d.photo && <img src={d.photo} alt="défaut" className={styles.defectPhoto} loading="lazy" decoding="async" />}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {report.photos?.length > 0 && (
        <div className={styles.inspPhotos}>
          {report.photos.map((src, i) => (
            <img key={i} src={src} alt={`Inspection ${i + 1}`} loading="lazy" decoding="async" />
          ))}
        </div>
      )}
    </div>
  );
}

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

function ReviewsSection({ vehicleId, t }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!vehicleId) return;
    setLoading(true);
    fetch(`/api/reviews?targetType=vehicle&targetId=${vehicleId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => setReviews(data?.reviews || []))
      .catch(() => setReviews([]))
      .finally(() => setLoading(false));
  }, [vehicleId]);

  if (loading) return null;

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>{t("vd.reviews") || "Avis"} {reviews.length > 0 && `(${reviews.length})`}</h3>
      {reviews.length === 0 ? (
        <p className={styles.reviewsEmpty}>{t("vd.noReviews")}</p>
      ) : (
        <div className={styles.reviewsList}>
          {reviews.map((rv) => (
            <div key={rv._id} className={styles.reviewItem}>
              <div className={styles.reviewItemHead}>
                <span className={styles.reviewAuthor}>
                  {rv.reviewer?.firstName ? `${rv.reviewer.firstName} ${(rv.reviewer.lastName || "").charAt(0)}.` : "Client VIT AUTO"}
                </span>
                <span className={styles.reviewStars}>{"★".repeat(rv.note)}{"☆".repeat(5 - rv.note)}</span>
                <span className={styles.reviewDate}>{new Date(rv.createdAt).toLocaleDateString("fr-FR")}</span>
              </div>
              {rv.commentaire && <p className={styles.reviewComment}>{rv.commentaire}</p>}
              <ReportButton targetType="review" targetId={rv._id} compact />
            </div>
          ))}
        </div>
      )}
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
  const { addItem, isInCart } = useCart();
  const { success, error: toastError } = useToast();

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
            // getVehicleById peuple `business` en objet ({companyName, isConcessionnaire})
            // — jamais aplati ici jusqu'ici, donc le badge "Concessionnaire" ne
            // s'affichait jamais réellement. Bug réel trouvé en audit (2026-07).
            isConcessionnaire: !!v.business?.isConcessionnaire,
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
  // Données structurées schema.org (SEO, 2026-09) — Product + Offer, seul
  // couple assez largement supporté par Google pour une annonce qui peut être
  // en location OU en vente (pas de type schema.org dédié convenable aux deux).
  const vehiclePrice = vehicle?.mode === "Acheter" ? (vehicle?.buyPrice ?? vehicle?.priceForSale) : vehicle?.pricePerDay;
  const structuredData = vehicle ? {
    "@context": "https://schema.org",
    "@type": "Product",
    name: vehicle.title || vehicle.name || `${vehicle.marque || ""} ${vehicle.modele || ""}`.trim(),
    description: vehicle.description || `${vehicle.marque || ""} ${vehicle.modele || ""} ${vehicle.annee || ""} — disponible sur VIT AUTO.`.trim(),
    image: (Array.isArray(vehicle.images) && vehicle.images.length ? vehicle.images : [vehicleImg]).filter(Boolean),
    brand: vehicle.marque ? { "@type": "Brand", name: vehicle.marque } : undefined,
    offers: {
      "@type": "Offer",
      price: vehiclePrice || undefined,
      priceCurrency: vehicle.currency || "USD",
      availability: vehicle.available !== false ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: `https://vit-auto.com/vehicle/${id}`,
      ...(vehicle.ownerName ? { seller: { "@type": "Organization", name: vehicle.ownerName } } : {}),
    },
  } : null;
  useDocumentMeta(vehicle ? {
    title:       vehicle.title || vehicle.name || `${vehicle.marque || ""} ${vehicle.modele || ""}`.trim(),
    description: vehicle.description || `${vehicle.marque || ""} ${vehicle.modele || ""} ${vehicle.annee || ""} — disponible sur VIT AUTO.`.trim(),
    image:       vehicleImg,
    url:         `https://vit-auto.com/vehicle/${id}`,
    structuredData,
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
  const priceAmountUSD = isSale ? (vehicle.buyPrice || vehicle.priceForSale) : vehicle.pricePerDay;
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
          <ReportButton targetType="vehicle" targetId={vehicle._id || vehicle.id} />
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
          {vehicle.instantBook && !isSale && (
            <span className={styles.condItem} title="Confirmée automatiquement, sans attendre le partenaire">⚡ Réservation instantanée</span>
          )}
          {(vehicle.ville || vehicle.adresse) && (
            <p className={styles.location}>📍 {[vehicle.ville, vehicle.adresse].filter(Boolean).join(", ")}</p>
          )}
        </div>
        <div className={styles.priceBlock}>
          <span className={styles.price}><PriceTag amountUSD={priceAmountUSD} pinnedCurrency={vehicle.currency}
            enteredAmount={isSale ? vehicle.priceForSaleEntered : vehicle.pricePerDayEntered} enteredCurrency={vehicle.priceEntryCurrency} /></span>
          {priceSuffix && <span className={styles.priceSuffix}>{priceSuffix}</span>}
          {vehicle.caution > 0 && !isSale && (
            <span className={styles.caution}>{t("vd.caution")} <PriceTag amountUSD={vehicle.caution} pinnedCurrency={vehicle.currency}
              enteredAmount={vehicle.cautionEntered} enteredCurrency={vehicle.priceEntryCurrency} compact /></span>
          )}
          {!isSale && (vehicle.seasonalRates || []).some((r) => r.active) && (
            <span className={styles.caution}>🗓️ Tarif variable selon la période — voir le détail aux dates choisies</span>
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
              ? <img src={optimizedImageUrl(images[imgIdx], { width: 1024 })} alt={vehicle.name} />
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
                  <img src={optimizedImageUrl(src, { width: 150 })} alt={`vue ${i + 1}`} loading="lazy" decoding="async" />
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
          {!isSale && (vehicle.climatisation || vehicle.withDriver || vehicle.ageMin || vehicle.dureeMinLocation > 1) && (
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
                {vehicle.dureeMinLocation > 1 && (
                  <span className={styles.condItem}>📅 {t("vd.minDuration")} {vehicle.dureeMinLocation} {t("vd.daysUnit")}</span>
                )}
              </div>
            </div>
          )}

          {/* Politiques carburant/annulation/assurance — champs dédiés, distincts
              du texte libre conditionsLocation ci-dessous. */}
          {!isSale && (vehicle.fuelPolicy || vehicle.cancellationPolicy || vehicle.insuranceIncluded) && (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>{t("vd.rentalPolicies")}</h3>
              <div className={styles.condList}>
                {vehicle.fuelPolicy && (
                  <span className={styles.condItem}>⛽ {t("vd.fuelPolicy")} : {vehicle.fuelPolicy}</span>
                )}
                {vehicle.cancellationPolicy && (
                  <span className={styles.condItem}>🔄 {t("vd.cancellationPolicy")} : {vehicle.cancellationPolicy}</span>
                )}
                {vehicle.insuranceIncluded && (
                  <span className={styles.condItem}>🛡️ {t("vd.insuranceIncluded")}</span>
                )}
              </div>
            </div>
          )}

          {/* Conditions particulières (texte libre partenaire) */}
          {!isSale && vehicle.conditionsLocation && (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>{t("vd.rentalTerms")}</h3>
              <p className={styles.description}>{vehicle.conditionsLocation}</p>
            </div>
          )}
          {isSale && vehicle.conditionsVente && (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>{t("vd.saleTerms")}</h3>
              <p className={styles.description}>{vehicle.conditionsVente}</p>
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
          {/* Aucun contact direct partenaire n'est plus jamais exposé (ni
              affiché en clair, ni transmis par l'API — voir vehicleController
              getVehicles/getVehicleById) : les appels passent uniquement par
              le numéro de service client VIT AUTO dédié au pays de l'annonce
              (Maroc ou Côte d'Ivoire selon vehicle.country), pour que l'admin
              puisse gérer la demande à la place du partenaire si besoin. */}
          {(vehicle.ownerName || vehicle.contactNom || vehicle.partnerName) && (() => {
            const { tel: serviceTel, display: serviceDisplay } = getCustomerServiceContact(vehicle.country);
            return (
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
                    {vehicle.isConcessionnaire && (
                      <span className={styles.publisherMeta}>🏬 {t("vd.dealer")}</span>
                    )}
                    {vehicle.ownerReviewCount > 0 && (
                      <span className={styles.publisherMeta}>★ {vehicle.ownerRating.toFixed(1)} ({vehicle.ownerReviewCount} avis agence)</span>
                    )}
                  </div>
                  <div className={styles.publisherActions}>
                    <a href={`tel:${serviceTel}`} className={styles.publisherCall}>
                      {t("vd.call")}
                    </a>
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
                <div className={styles.publisherMeta} style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 3 }}>
                  <strong style={{ fontSize: ".78rem" }}>{t("vd.customerService")}</strong>
                  <a href={`tel:${serviceTel}`} style={{ color: "#ff4d2d", fontWeight: 700, textDecoration: "none", fontSize: ".85rem" }}>
                    {serviceDisplay}
                  </a>
                </div>
              </div>
            );
          })()}

          {/* ── Rapport d'inspection ── */}
          <InspectionSection vehicleId={vehicle._id || vehicle.id} />

          {/* ── Avis clients ── */}
          <ReviewsSection vehicleId={vehicle._id || vehicle.id} t={t} />

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
                {/* Panier multi-véhicules — uniquement location (le panier ne
                    gère que des réservations "retrait" simples avec
                    pricePerDay, voir CartContext.jsx). Volontairement absent
                    des cartes catalogue (retiré le 2026-07-28, gênait
                    l'affichage) — la page détail reste le seul point d'entrée. */}
                {!isSale && (
                  <button
                    className={styles.leasingBtn}
                    disabled={isInCart(vehicle._id || vehicle.id)}
                    onClick={() => {
                      const result = addItem(vehicle);
                      if (result.ok) success("Véhicule ajouté au panier.");
                      else toastError(result.message);
                    }}
                  >
                    {isInCart(vehicle._id || vehicle.id) ? "🛒 Déjà dans le panier" : "🛒 Ajouter au panier"}
                  </button>
                )}
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
