import { useState, useMemo, useEffect, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import VehicleCard from "../components/VehicleCard/VehicleCard";
import PriceTag from "../components/PriceTag/PriceTag";
import { useVehicles } from "../context/VehicleContext";
import { useCurrency } from "../context/CurrencyContext";
import styles from "./Catalogue.module.css";
import { useToast } from "../context/ToastContext";
import { haversineKm, getCurrentPosition } from "../utils/geo";
import { getCountryFlag } from "../data/autocomplete";
import { ACTIVITY_TYPES, ACTIVITY_TYPE_LABELS, ACTIVITY_TYPE_ICONS } from "../constants/activityTypes";
import { useI18n } from "../context/I18nContext";

const MODES = [
  { key: "Tout",      icon: "⚡", label: "catalogue.all" },
  { key: "Louer",     icon: "🔑", label: "catalogue.rent" },
  { key: "Acheter",   icon: "💰", label: "catalogue.modeBuy" },
  { key: "Chauffeur", icon: "👨‍✈️", label: "catalogue.modeDriver" },
  { key: "Import",    icon: "🌍", label: "catalogue.modeImportExport" },
  // Section OTHERS — activités culturelles/loisir (Quad, Surf, Montgolfière,
  // Jetski, Jet privé, Bateau...) — voir Activity.js/activityController.js.
  { key: "Autres",    icon: "🎈", label: "catalogue.modeActivities" },
];

const ACTIVITY_TYPE_PILLS = ["Tous", ...ACTIVITY_TYPES];

const TYPE_ICONS = {
  "Tous": "🚘", "SUV": "🚙", "Berline": "🚗", "Viano": "🚐",
  "Monospace": "🚌", "Citadine": "🏎️", "4x4": "🛻", "Sportif": "⚡",
  "Pick-up": "🛻", "Cabriolet": "🚗", "Utilitaire": "📦", "Minibus": "🚌",
};

// Valeurs de filtre = valeurs réelles stockées (v.vehicleType, v.etat...) —
// ne jamais traduire la VALEUR (casserait les comparaisons), seulement son
// libellé affiché via ce lookup.
const TYPE_LABEL_KEYS = {
  "Tous": "catalogue.filterAllShort", "SUV": "catalogue.typeSuv", "Berline": "catalogue.typeSedan",
  "Viano": "catalogue.typeVan", "Monospace": "catalogue.typeMinivan", "Citadine": "catalogue.typeCitycar",
  "4x4": "catalogue.type4x4", "Sportif": "catalogue.typeSport", "Pick-up": "catalogue.typePickup",
  "Cabriolet": "catalogue.typeConvertible", "Utilitaire": "catalogue.typeUtility", "Minibus": "catalogue.typeMinibus",
};

const IE_SOURCE_ZONES = [
  { key: "",       label: "catalogue.allCountries" },
  { key: "Chine",  label: "catalogue.zoneChina" },
  { key: "Dubaï",  label: "catalogue.zoneDubai" },
  { key: "France", label: "catalogue.zoneFrance" },
  { key: "Europe", label: "catalogue.zoneEurope" },
];

const IE_SORT = [
  { key: "newest",     label: "catalogue.sortNewestIe" },
  { key: "price_asc",  label: "catalogue.sortPriceAsc" },
  { key: "price_desc", label: "catalogue.sortPriceDesc" },
];

const FUEL_LABELS = {
  essence: "catalogue.fuelGasoline", diesel: "catalogue.fuelDiesel", hybride: "catalogue.fuelHybrid",
  hybride_rechargeable: "catalogue.fuelPluginHybrid", electrique: "catalogue.fuelElectric",
  gpl: "catalogue.fuelLpg", autre: "catalogue.fuelOther",
};

const BADGE_ICONS_MAP = { silver: "🥈", gold: "🥇", platinum: "💎" };

/* ── Carte Import/Export ── */
function IECard({ l }) {
  const { t } = useI18n();
  return (
    <div className={styles.ieCard}>
      <div className={styles.ieCardImg}>
        {l.mainPhoto
          ? <img src={l.mainPhoto} alt={l.title} loading="lazy" width="320" height="200" />
          : <div className={styles.ieCardImgFallback}>🚗</div>
        }
        <div className={styles.ieCardOrigin}>{getCountryFlag(l.sourceCountry)} {l.sourceCountry}</div>
        <div className={styles.ieCardTypeBadge}>🌍 {t("catalogue.ieBadge")}</div>
        {l.incoterm && (
          <div className={styles.ieCardIncoterm}>📦 {l.incoterm}</div>
        )}
        {l.importerProfile?.badgeLevel && l.importerProfile.badgeLevel !== "none" && (
          <div className={styles.ieCardBadge}>
            {BADGE_ICONS_MAP[l.importerProfile.badgeLevel]} {l.importerProfile.badgeLevel.toUpperCase()}
          </div>
        )}
      </div>

      <div className={styles.ieCardBody}>
        <strong className={styles.ieCardTitle}>{l.title}</strong>
        <span className={styles.ieCardMeta}>
          {l.make} {l.model} {l.year} · {FUEL_LABELS[l.fuelType] ? t(FUEL_LABELS[l.fuelType]) : l.fuelType} · {l.condition === "neuf" ? t("catalogue.conditionNew") : l.condition === "occasion" ? t("catalogue.conditionUsed") : t("catalogue.conditionRefurbished")}
        </span>

        {l.availableIn?.length > 0 && (
          <div className={styles.ieCardTags}>
            {l.availableIn.slice(0, 3).map((c) => (
              <span key={c} className={styles.ieCardTag}>{getCountryFlag(c)} {c}</span>
            ))}
            {l.availableIn.length > 3 && <span style={{ fontSize: ".7rem", color: "#94a3b8" }}>+{l.availableIn.length - 3}</span>}
          </div>
        )}

        {l.importerProfile?.companyName && (
          <span className={styles.ieCardCompany}>🏢 {l.importerProfile.companyName}</span>
        )}

        <div className={styles.ieCardFooter}>
          <div>
            <div className={styles.ieCardPrice}><PriceTag amount={l.price} sourceCurrency={l.currency} compact /></div>
            {l.negotiable && <span className={styles.ieCardNeg}>{t("catalogue.negotiable")}</span>}
          </div>
          <Link to="/import-export/listings" className={styles.ieCardLink}>{t("catalogue.viewMore")}</Link>
        </div>
      </div>
    </div>
  );
}

/* ── Carte Chauffeur ── */
function DriverCard({ d }) {
  const { t } = useI18n();
  // Priorité à l'unité réellement renseignée — afficher un tarif jour avec un
  // suffixe "/h" (bug précédent : tarifHeure||tarif sans jamais changer le
  // libellé) induisait le client en erreur sur le prix réel du service.
  // Devise figée (d.currency) + montant exact saisi (d.tarif*Entered) — voir
  // PriceTag / Driver.js, même principe que les véhicules (bug réel corrigé
  // en audit : aucun des deux n'existait pour les chauffeurs jusqu'ici, tarif
  // toujours imposé en USD sans possibilité de figer une devise d'affichage).
  const priceUnit = d.tarifHeure > 0 ? { amount: d.tarifHeure, entered: d.tarifHeureEntered, suffix: "/h" }
    : d.tarif > 0 ? { amount: d.tarif, entered: d.tarifEntered, suffix: "/jour" }
    : d.tarifDemiJournee > 0 ? { amount: d.tarifDemiJournee, entered: d.tarifDemiJourneeEntered, suffix: "/demi-j." }
    : null;
  return (
    <div className={styles.ieCard}>
      <div className={styles.ieCardImg}>
        {d.profilePhoto || d.images?.[0]
          ? <img src={d.profilePhoto || d.images[0]} alt={`${d.firstName} ${d.lastName}`} loading="lazy" width="320" height="200" />
          : <div className={styles.ieCardImgFallback}>🧑‍✈️</div>
        }
      </div>
      <div className={styles.ieCardBody}>
        <strong className={styles.ieCardTitle}>{d.firstName} {d.lastName}</strong>
        <span className={styles.ieCardMeta}>
          {d.title || t("catalogue.driverDefaultTitle")} · {t("catalogue.driverExperience", { n: d.experience || 0 })}
        </span>
        <span className={styles.ieCardMeta}>
          📍 {d.zone || d.ville || "—"}
          {d.noteMoyenne > 0 && <> · ⭐ {d.noteMoyenne.toFixed(1)} ({d.nombreAvis || 0})</>}
        </span>
        <span className={styles.ieCardMeta}>
          {d.vehiculePersonnel ? t("catalogue.driverWithVehicle", { type: d.typeVehicule ? ` (${d.typeVehicule})` : "" }) : t("catalogue.driverNoVehicle")}
        </span>
        {d.langues?.length > 0 && (
          <span className={styles.ieCardMeta}>💬 {d.langues.join(", ")}</span>
        )}
        <div className={styles.ieCardFooter}>
          <div>
            <div className={styles.ieCardPrice}>
              {priceUnit
                ? <PriceTag amountUSD={priceUnit.amount} pinnedCurrency={d.currency} enteredAmount={priceUnit.entered} enteredCurrency={d.priceEntryCurrency} suffix={priceUnit.suffix} />
                : t("catalogue.priceOnRequest")}
            </div>
          </div>
          <Link to={`/driver-booking/${d._id}`} className={styles.ieCardLink}>{t("catalogue.hireDriver")}</Link>
        </div>
      </div>
    </div>
  );
}

/* ── Carte Activité (section OTHERS) ── */
function ActivityCard({ a }) {
  const { t } = useI18n();
  const suffix = t(a.priceUnit === "per_session" ? "catalogue.perSessionSuffix" : "catalogue.perPersonSuffix");
  return (
    <div className={styles.ieCard}>
      <div className={styles.ieCardImg}>
        {a.thumbnail || a.images?.[0]
          ? <img src={a.thumbnail || a.images[0]} alt={a.title} loading="lazy" width="320" height="200" />
          : <div className={styles.ieCardImgFallback}>{ACTIVITY_TYPE_ICONS[a.activityType] || "🎟️"}</div>
        }
        <div className={styles.ieCardTypeBadge}>{ACTIVITY_TYPE_ICONS[a.activityType] || "🎟️"} {ACTIVITY_TYPE_LABELS[a.activityType] || a.activityType}</div>
        {a.essaiDisponible && <div className={styles.ieCardIncoterm}>{t("catalogue.trialAvailableBadge")}</div>}
      </div>
      <div className={styles.ieCardBody}>
        <strong className={styles.ieCardTitle}>{a.title}</strong>
        <span className={styles.ieCardMeta}>
          📍 {a.ville || "—"}
          {a.noteMoyenne > 0 && <> · ⭐ {a.noteMoyenne.toFixed(1)} ({a.nombreAvis || 0})</>}
        </span>
        <span className={styles.ieCardMeta}>
          {t("catalogue.activityDurationCapacity", { min: a.durationMinutes || 60, n: a.capacity || 1 })}
        </span>
        <div className={styles.ieCardFooter}>
          <div>
            <div className={styles.ieCardPrice}>
              <PriceTag amountUSD={a.price} pinnedCurrency={a.currency} enteredAmount={a.priceEntered} enteredCurrency={a.priceEntryCurrency} suffix={suffix} />
            </div>
          </div>
          <Link to={`/activity-booking/${a._id}`} className={styles.ieCardLink}>{t("catalogue.bookActivity")}</Link>
        </div>
      </div>
    </div>
  );
}

const types         = Object.keys(TYPE_ICONS);
const etats         = ["Tous", "Neuf", "Occasion"];
const ETAT_LABEL_KEYS = { "Tous": "catalogue.filterAllShort", "Neuf": "catalogue.conditionNew", "Occasion": "catalogue.conditionUsed" };
const fuels         = ["Tous", "Essence", "Diesel", "Hybride", "Électrique", "GPL"];
const FUEL_FILTER_LABEL_KEYS = { "Tous": "catalogue.filterAllShort", "Essence": "catalogue.fuelGasoline", "Diesel": "catalogue.fuelDiesel", "Hybride": "catalogue.fuelHybrid", "Électrique": "catalogue.fuelElectric", "GPL": "catalogue.fuelLpg" };
const transmissions = ["Tous", "Automatique", "Manuelle"];
const TRANSMISSION_LABEL_KEYS = { "Tous": "catalogue.filterAllShort", "Automatique": "catalogue.transmissionAuto", "Manuelle": "catalogue.transmissionManual" };
const DUREE_LABEL_KEYS = { "Tous": "catalogue.filterAllShort", "Courte": "catalogue.durationShort", "Longue": "catalogue.durationLong" };
const SORT_OPTIONS  = [
  { key: "default",    label: "catalogue.sortDefault" },
  { key: "price_asc",  label: "catalogue.sortPriceAsc" },
  { key: "price_desc", label: "catalogue.sortPriceDesc" },
  { key: "newest",     label: "catalogue.sortNewest" },
];

const Catalogue = () => {
  const { t } = useI18n();
  const { vehicles, drivers, activities, refreshVehicles, vehiclesLoading } = useVehicles();
  const { fmt, catalogCountry, setCatalogCountry, COUNTRIES_CONFIG, COUNTRY_INTERNATIONAL, detectPreciseCountry, rateFromUSD } = useCurrency();
  const { success: toastSuccess, error: toastError } = useToast();
  const [detectingCountry, setDetectingCountry] = useState(false);

  const handleDetectCountry = async () => {
    setDetectingCountry(true);
    const res = await detectPreciseCountry();
    setDetectingCountry(false);
    if (res.ok) {
      const c = COUNTRIES_CONFIG.find((x) => x.code === res.country);
      toastSuccess(t("catalogue.countryDetectedToast", { country: c ? `${c.flag} ${c.name}` : res.country }));
    } else {
      toastError(res.message || t("catalogue.detectionFailedError"));
    }
  };
  const [searchParams, setSearchParams] = useSearchParams();
  const [refreshing,  setRefreshing]  = useState(false);
  const [filterOpen,  setFilterOpen]  = useState(false);
  const [sortKey,     setSortKey]     = useState("default");
  const [page,        setPage]        = useState(1); // eslint-disable-line no-unused-vars

  const [activeMode, setActiveMode] = useState(
    () => { const m = searchParams.get("mode") || "Tout"; return MODES.find(x => x.key === m) ? m : "Tout"; }
  );
  const [searchTerm,   setSearchTerm]   = useState(() => searchParams.get("location") || "");
  const [activeType,   setActiveType]   = useState(() => searchParams.get("type")     || "Tous");
  const [activeEtat,   setActiveEtat]   = useState(() => searchParams.get("etat")     || "Tous");
  const [activeDuree,  setActiveDuree]  = useState(() => searchParams.get("duree")    || "Tous");
  const [fuelType,     setFuelType]     = useState("Tous");
  const [transmission, setTransmission] = useState("Tous");
  // Section OTHERS — type d'activité (Quad, Surf, Montgolfière...)
  const [activityTypeFilter, setActivityTypeFilter] = useState(() => {
    const t = searchParams.get("activityType");
    return t && ACTIVITY_TYPES.includes(t) ? t : "Tous";
  });
  const [maxPrice,     setMaxPrice]     = useState(300);
  // Prix max vente/import — échelle totalement différente de la location
  // journalière (10-300 USD/j) : un véhicule à vendre ou une annonce
  // Import/Export peut valoir des dizaines de milliers de dollars. Défaut
  // volontairement haut (aucune annonce cachée tant que l'utilisateur n'a pas
  // lui-même resserré le curseur), contrairement à maxPrice (location) dont
  // le défaut filtre déjà activement.
  const [maxSalePrice, setMaxSalePrice] = useState(200000);
  const [ieMaxPrice,   setIeMaxPrice]   = useState(200000);

  // ── "Près de moi" (recherche géolocalisée) ────────────────────────────────
  const [nearMeActive, setNearMeActive] = useState(false);
  const [userPos,      setUserPos]      = useState(null); // { lat, lng }
  const [geoLoading,   setGeoLoading]   = useState(false);
  const [geoError,     setGeoError]     = useState(null);

  const handleToggleNearMe = () => {
    if (nearMeActive) { setNearMeActive(false); return; }
    setGeoLoading(true);
    setGeoError(null);
    getCurrentPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setNearMeActive(true);
        setGeoLoading(false);
      },
      () => {
        setGeoError(t("catalogue.geoPermissionError"));
        setGeoLoading(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  };

  // ── État Import/Export ────────────────────────────────────────────────────
  const [ieListings,  setIeListings]  = useState([]);
  const [ieLoading,   setIeLoading]   = useState(false);
  const [ieTotal,     setIeTotal]     = useState(0);
  const [ieSearch,    setIeSearch]    = useState("");
  const [ieSource,    setIeSource]    = useState("");
  const [ieSortKey,   setIeSortKey]   = useState("newest");

  const isImportMode    = activeMode === "Import";
  const isChauffeurMode = activeMode === "Chauffeur";
  const isOthersMode    = activeMode === "Autres";

  const loadIEListings = useCallback(async () => {
    setIeLoading(true);
    try {
      const params = new URLSearchParams({ status: "approved", limit: 24 });
      if (ieSource) params.set("sourceCountry", ieSource);
      if (catalogCountry) params.set("country", catalogCountry);
      const res = await fetch(`/api/import-export/listings?${params}`);
      if (res.ok) {
        const d = await res.json();
        let list = d.listings || [];
        // Filtre texte côté client
        if (ieSearch.trim()) {
          const q = ieSearch.toLowerCase();
          list = list.filter((l) =>
            l.make?.toLowerCase().includes(q) ||
            l.model?.toLowerCase().includes(q) ||
            l.title?.toLowerCase().includes(q) ||
            l.sourceCountry?.toLowerCase().includes(q)
          );
        }
        // Bug réel corrigé (audit) : aucun filtre prix n'existait pour les
        // annonces Import/Export. `price` est dans la devise propre de
        // l'annonce (`currency`, souvent EUR/XOF/MAD, pas toujours USD) —
        // converti en USD avant comparaison au curseur, sinon une annonce en
        // XOF (valeurs numériques ~600x plus grandes) serait comparée telle
        // quelle à un seuil pensé en USD.
        if (ieMaxPrice < 200000) {
          list = list.filter((l) => (l.price || 0) / (rateFromUSD(l.currency) || 1) <= ieMaxPrice);
        }
        // Tri
        if (ieSortKey === "price_asc")  list = [...list].sort((a, b) => a.price - b.price);
        if (ieSortKey === "price_desc") list = [...list].sort((a, b) => b.price - a.price);
        setIeListings(list);
        setIeTotal(d.total || list.length);
      }
    } catch {}
    setIeLoading(false);
  }, [ieSource, ieSearch, ieSortKey, catalogCountry, ieMaxPrice, rateFromUSD]);

  useEffect(() => {
    if (isImportMode) loadIEListings();
  }, [isImportMode, loadIEListings]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === "Tous" || value === "Tout") next.delete(key);
    else next.set(key, value);
    setSearchParams(next);
  };

  const resetFilters = () => {
    setActiveType("Tous"); setActiveEtat("Tous"); setFuelType("Tous");
    setTransmission("Tous"); setMaxPrice(300); setMaxSalePrice(200000); setIeMaxPrice(200000);
    setSearchTerm(""); setActiveDuree("Tous"); setActivityTypeFilter("Tous");
    setActiveMode("Tout"); setSearchParams(new URLSearchParams()); setPage(1);
    setIeSearch(""); setIeSource(""); setIeSortKey("newest");
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    if (isImportMode) await loadIEListings();
    else await refreshVehicles();
    setRefreshing(false);
    toastSuccess(isImportMode ? t("catalogue.ieRefreshedToast") : t("catalogue.refreshedToast"));
  };

  const chauffeursFiltered = useMemo(() => {
    if (!isChauffeurMode) return [];
    const q = searchTerm.toLowerCase();
    // Un chauffeur sans pays renseigné (créé avant cette fonctionnalité) reste
    // toujours visible, quel que soit le pays sélectionné.
    let list = drivers.filter((d) =>
      (catalogCountry === COUNTRY_INTERNATIONAL || !d.country || d.country === catalogCountry)
      && (!q
        || `${d.firstName} ${d.lastName}`.toLowerCase().includes(q)
        || (d.zone || d.ville || "").toLowerCase().includes(q)
        || (d.title || "").toLowerCase().includes(q)));
    if (sortKey === "price_asc")  list = [...list].sort((a,b) => (a.tarifHeure||a.tarif||a.tarifDemiJournee||0) - (b.tarifHeure||b.tarif||b.tarifDemiJournee||0));
    if (sortKey === "price_desc") list = [...list].sort((a,b) => (b.tarifHeure||b.tarif||b.tarifDemiJournee||0) - (a.tarifHeure||a.tarif||a.tarifDemiJournee||0));
    if (sortKey === "newest")     list = [...list].sort((a,b) => new Date(b.createdAt||0) - new Date(a.createdAt||0));
    return list;
  }, [drivers, isChauffeurMode, searchTerm, sortKey, catalogCountry, COUNTRY_INTERNATIONAL]);

  const activitiesFiltered = useMemo(() => {
    if (!isOthersMode) return [];
    const q = searchTerm.toLowerCase();
    // Une activité sans pays renseigné reste toujours visible, quel que soit
    // le pays sélectionné — même principe que véhicules/chauffeurs.
    let list = activities.filter((a) =>
      (catalogCountry === COUNTRY_INTERNATIONAL || !a.country || a.country === catalogCountry)
      && (activityTypeFilter === "Tous" || a.activityType === activityTypeFilter)
      && (!q
        || (a.title || "").toLowerCase().includes(q)
        || (a.ville || "").toLowerCase().includes(q)
        || (ACTIVITY_TYPE_LABELS[a.activityType] || "").toLowerCase().includes(q)));
    if (sortKey === "price_asc")  list = [...list].sort((a, b) => (a.price || 0) - (b.price || 0));
    if (sortKey === "price_desc") list = [...list].sort((a, b) => (b.price || 0) - (a.price || 0));
    if (sortKey === "newest")     list = [...list].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return list;
  }, [activities, isOthersMode, searchTerm, sortKey, catalogCountry, COUNTRY_INTERNATIONAL, activityTypeFilter]);

  const filtered = useMemo(() => {
    if (isImportMode || isChauffeurMode || isOthersMode) return [];
    let list = vehicles.filter((v) => {
      const modeOk = activeMode === "Tout" || v.mode === activeMode;
      const typeOk = activeType === "Tous" || (v.vehicleType || v.type) === activeType;
      const etatOk = activeEtat === "Tous"
        || (activeEtat === "Neuf"     && v.etat === "Neuf")
        || (activeEtat === "Occasion" && v.etat && v.etat !== "Neuf");
      const fuelOk = fuelType === "Tous" || (v.fuel || v.carburant) === fuelType;
      const transOk = transmission === "Tous" || v.transmission === transmission;
      // Bug réel corrigé (audit) : aucun filtre prix n'était appliqué en mode
      // Achat (vente) — le curseur "Prix max / jour" (échelle location, 10-300
      // USD) n'a de toute façon pas de sens pour un prix de vente. Échelle
      // dédiée maxSalePrice (défaut haut, rien de caché par défaut).
      const priceOk = activeMode === "Acheter"
        ? (v.priceForSale || 0) <= maxSalePrice
        : (v.pricePerDay || 0) <= maxPrice;
      // Un véhicule sans durée renseignée (créé avant cette fonctionnalité) ou
      // marqué "les_deux" reste visible sous les deux filtres.
      const dureeOk = activeMode !== "Louer" || activeDuree === "Tous"
        || !v.rentalDurationType || v.rentalDurationType === "les_deux"
        || v.rentalDurationType === (activeDuree === "Courte" ? "courte" : "longue");
      // Un véhicule sans pays renseigné (créé avant cette fonctionnalité) reste
      // toujours visible, quel que soit le pays sélectionné.
      const countryOk = catalogCountry === COUNTRY_INTERNATIONAL || !v.country || v.country === catalogCountry;
      const q = searchTerm.toLowerCase();
      const textOk = !q
        || (v.title || v.name || "").toLowerCase().includes(q)
        || (v.description || "").toLowerCase().includes(q)
        || (v.ville || v.city || "").toLowerCase().includes(q)
        || (v.marque || "").toLowerCase().includes(q);
      return modeOk && typeOk && etatOk && fuelOk && transOk && priceOk && dureeOk && countryOk && textOk;
    });

    // "Près de moi" : ne garder que les véhicules avec des coordonnées connues,
    // calculer la distance et trier par proximité — prioritaire sur le tri choisi.
    if (nearMeActive && userPos) {
      list = list
        .filter((v) => v.coordonnees?.lat != null && v.coordonnees?.lng != null)
        .map((v) => ({ ...v, distance: haversineKm(userPos.lat, userPos.lng, v.coordonnees.lat, v.coordonnees.lng) }))
        .sort((a, b) => a.distance - b.distance);
      return list;
    }

    if (sortKey === "price_asc")  list = [...list].sort((a,b) => (a.pricePerDay||a.priceForSale||0) - (b.pricePerDay||b.priceForSale||0));
    if (sortKey === "price_desc") list = [...list].sort((a,b) => (b.pricePerDay||b.priceForSale||0) - (a.pricePerDay||a.priceForSale||0));
    if (sortKey === "newest")     list = [...list].sort((a,b) => new Date(b.createdAt||0) - new Date(a.createdAt||0));
    return list;
  }, [vehicles, activeMode, activeType, activeEtat, activeDuree, fuelType, transmission, maxPrice, maxSalePrice, searchTerm, sortKey, isImportMode, isChauffeurMode, isOthersMode, catalogCountry, COUNTRY_INTERNATIONAL, nearMeActive, userPos]);

  const isStandardMode = !isImportMode && !isChauffeurMode && !isOthersMode;

  const activeChips = isStandardMode ? [
    activeMode !== "Tout"   && { label: t(MODES.find((m) => m.key === activeMode)?.label || "catalogue.all"), clear: () => { setActiveMode("Tout"); setParam("mode",""); } },
    activeType !== "Tous"   && { label: t(TYPE_LABEL_KEYS[activeType] || "catalogue.filterAllShort"), clear: () => { setActiveType("Tous"); setParam("type",""); } },
    activeEtat !== "Tous"   && { label: t(ETAT_LABEL_KEYS[activeEtat] || "catalogue.filterAllShort"), clear: () => { setActiveEtat("Tous"); setParam("etat",""); } },
    activeMode === "Louer" && activeDuree !== "Tous" && { label: t(DUREE_LABEL_KEYS[activeDuree] || "catalogue.filterAllShort"), clear: () => { setActiveDuree("Tous"); setParam("duree",""); } },
    fuelType   !== "Tous"   && { label: t(FUEL_FILTER_LABEL_KEYS[fuelType] || "catalogue.filterAllShort"), clear: () => setFuelType("Tous") },
    transmission !== "Tous" && { label: t(TRANSMISSION_LABEL_KEYS[transmission] || "catalogue.filterAllShort"), clear: () => setTransmission("Tous") },
    // Comparé à la valeur PAR DÉFAUT (300/200000), pas au plafond technique du
    // curseur (2000/200000) — sinon la puce s'afficherait dès le chargement
    // (300 < 2000) sans que l'utilisateur n'ait rien changé.
    activeMode !== "Acheter" && maxPrice !== 300 && { label: `≤ ${fmt(maxPrice)}`, clear: () => setMaxPrice(300) },
    activeMode === "Acheter" && maxSalePrice !== 200000 && { label: `≤ ${fmt(maxSalePrice)}`, clear: () => setMaxSalePrice(200000) },
    searchTerm              && { label: `"${searchTerm}"`,  clear: () => setSearchTerm("") },
  ].filter(Boolean) : [];

  return (
    <div className={styles.page}>

      {/* ══════════════════════════════
          HEADER
      ══════════════════════════════ */}
      <header className={styles.header}>
        <div className={styles.headerDeco1} />
        <div className={styles.headerDeco2} />

        <div className={styles.headerInner}>

          <div className={styles.headerRow}>
            <div>
              <span className={styles.headerTag}>{isImportMode ? "🌍 VIT AUTO" : isChauffeurMode ? "🧑‍✈️ VIT AUTO" : isOthersMode ? "🎈 VIT AUTO" : "🚗 VIT AUTO"}</span>
              <h1 className={styles.headerTitle}>{t(isImportMode ? "catalogue.pageTitleImportExport" : isChauffeurMode ? "catalogue.pageTitleDrivers" : isOthersMode ? "catalogue.pageTitleActivities" : "catalogue.pageTitleDefault")}</h1>
            </div>
            <button
              type="button"
              className={`${styles.refreshBtn} ${refreshing ? styles.refreshSpinning : ""}`}
              onClick={handleRefresh}
              disabled={refreshing}
              title={t("catalogue.refreshTooltip")}
            >
              <span>↻</span>
            </button>
          </div>

          {/* Tabs mode */}
          <nav className={styles.modeTabs}>
            {MODES.map(({ key, icon, label }) => (
              <button
                key={key}
                type="button"
                className={`${styles.modeTab} ${activeMode === key ? styles.modeTabActive : ""}`}
                onClick={() => {
                  setActiveMode(key);
                  setParam("mode", key === "Tout" ? "" : key);
                  setPage(1);
                }}
              >
                <span>{icon}</span>
                <span>{t(label)}</span>
              </button>
            ))}
          </nav>

          {/* Barre de recherche */}
          <div className={styles.searchBar}>
            <span className={styles.searchIcon}>🔍</span>
            <input
              type="search"
              value={isImportMode ? ieSearch : searchTerm}
              onChange={(e) => isImportMode ? setIeSearch(e.target.value) : setSearchTerm(e.target.value)}
              placeholder={t(isImportMode ? "catalogue.searchPlaceholderIe" : isChauffeurMode ? "catalogue.searchPlaceholderDriver" : isOthersMode ? "catalogue.searchPlaceholderActivity" : "catalogue.searchPlaceholderDefault")}
              className={styles.searchInput}
            />
            {(isImportMode ? ieSearch : searchTerm) && (
              <button type="button" className={styles.searchClear}
                onClick={() => isImportMode ? setIeSearch("") : setSearchTerm("")}>✕</button>
            )}
          </div>

          {/* Pills type véhicule (mode standard) ou pays source (mode IE) — masquées en mode Chauffeur */}
          {isImportMode ? (
            <>
              <div className={styles.typePillsRow}>
                {IE_SOURCE_ZONES.map((z) => (
                  <button key={z.key} type="button"
                    className={`${styles.typePill} ${ieSource === z.key ? styles.typePillActive : ""}`}
                    onClick={() => setIeSource(z.key)}>
                    <span>{t(z.label)}</span>
                  </button>
                ))}
              </div>
              {/* Bug réel corrigé (audit) : aucun filtre prix n'existait pour
                  Import/Export — échelle vente (milliers/dizaines de milliers
                  USD), converti depuis la devise propre de chaque annonce. */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: ".8rem", fontWeight: 700, color: "#0f1b3f" }}>{t("catalogue.ieMaxPriceLabel", { price: fmt(ieMaxPrice) })}</span>
                <input type="range" min="1000" max="200000" step="1000" value={ieMaxPrice}
                  onChange={(e) => setIeMaxPrice(Number(e.target.value))}
                  style={{ flex: 1, minWidth: 160, maxWidth: 320, accentColor: "#ff4d2d" }} />
              </div>
            </>
          ) : isOthersMode ? (
            <div className={styles.typePillsRow}>
              {ACTIVITY_TYPE_PILLS.map((at) => (
                <button key={at} type="button"
                  className={`${styles.typePill} ${activityTypeFilter === at ? styles.typePillActive : ""}`}
                  onClick={() => { setActivityTypeFilter(at); setParam("activityType", at); }}>
                  <span>{at === "Tous" ? "🎈" : (ACTIVITY_TYPE_ICONS[at] || "🎟️")}</span>
                  <span>{at === "Tous" ? t("catalogue.filterAll") : (ACTIVITY_TYPE_LABELS[at] || at)}</span>
                </button>
              ))}
            </div>
          ) : !isChauffeurMode ? (
            <div className={styles.typePillsRow}>
              {types.map((ty) => (
                <button key={ty} type="button"
                  className={`${styles.typePill} ${activeType === ty ? styles.typePillActive : ""}`}
                  onClick={() => { setActiveType(ty); setParam("type", ty); }}>
                  <span>{TYPE_ICONS[ty]}</span>
                  <span>{t(TYPE_LABEL_KEYS[ty] || "catalogue.filterAllShort")}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className={styles.headerWave}>
          <svg viewBox="0 0 1440 40" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0,40 C360,0 1080,0 1440,40 L1440,40 L0,40 Z" fill="#f5f7fb"/>
          </svg>
        </div>
      </header>

      {/* ══════════════════════════════
          CORPS
      ══════════════════════════════ */}
      <div className={styles.body}>

        {/* Barre résultats */}
        <div className={styles.resultsBar}>
          <div className={styles.resultsLeft}>
            <span className={styles.resultCount}>
              {isImportMode
                ? t("catalogue.resultsCountIe", { n: ieListings.length })
                : isChauffeurMode
                ? t("catalogue.resultsCountDrivers", { n: chauffeursFiltered.length })
                : isOthersMode
                ? t("catalogue.resultsCountActivities", { n: activitiesFiltered.length })
                : t("catalogue.resultsCountVehicles", { n: filtered.length })
              }
            </span>

            {geoError && isStandardMode && (
              <span className={styles.activeChip} title={geoError}>⚠️ {geoError}</span>
            )}

            {isStandardMode && activeChips.map((chip, i) => (
              <button key={i} type="button" className={styles.activeChip} onClick={chip.clear}>
                {chip.label} <span>✕</span>
              </button>
            ))}

            {activeChips.length > 1 && (
              <button type="button" className={styles.clearAllBtn} onClick={resetFilters}>{t("catalogue.clearAll")}</button>
            )}
          </div>

          <div className={styles.resultsRight}>
            <select
              className={styles.sortSelect}
              value={catalogCountry}
              onChange={(e) => setCatalogCountry(e.target.value)}
              title={t("catalogue.filterByCountryTooltip")}
            >
              <option value={COUNTRY_INTERNATIONAL}>{t("catalogue.allCountriesInternational")}</option>
              {COUNTRIES_CONFIG.map((c) => (
                <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
              ))}
            </select>

            <button
              type="button"
              className={styles.filterToggleBtn}
              onClick={handleDetectCountry}
              disabled={detectingCountry}
              title={t("catalogue.detectCountryTooltip")}
            >
              {detectingCountry ? t("catalogue.detectingLabel") : t("catalogue.detectLabel")}
            </button>

            {isStandardMode && (
              <button
                type="button"
                className={styles.filterToggleBtn}
                onClick={handleToggleNearMe}
                disabled={geoLoading}
                title={t(nearMeActive ? "catalogue.disableNearMeTooltip" : "catalogue.enableNearMeTooltip")}
              >
                {geoLoading ? t("catalogue.locating") : nearMeActive ? t("catalogue.nearMeActive") : t("catalogue.nearMeInactive")}
              </button>
            )}

            {isStandardMode && (
              <button type="button" className={styles.filterToggleBtn} onClick={() => setFilterOpen(true)}>
                {t("catalogue.filtersButton")}
                {activeChips.length > 0 && <span className={styles.filterBadge}>{activeChips.length}</span>}
              </button>
            )}

            {!isChauffeurMode && (
              <select
                className={styles.sortSelect}
                value={isImportMode ? ieSortKey : sortKey}
                onChange={(e) => isImportMode ? setIeSortKey(e.target.value) : setSortKey(e.target.value)}
              >
                {(isImportMode ? IE_SORT : SORT_OPTIONS).map(o => (
                  <option key={o.key} value={o.key}>{t(o.label)}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Drawer mobile (mode standard uniquement) */}
        {isStandardMode && filterOpen && (
          <>
            <div className={styles.overlay} onClick={() => setFilterOpen(false)} />
            <div className={styles.drawer}>
              <div className={styles.drawerHandle} />
              <div className={styles.drawerHead}>
                <h3>{t("catalogue.filtersDrawerTitle")}</h3>
                <button className={styles.drawerClose} onClick={() => setFilterOpen(false)}>✕</button>
              </div>
              <DrawerFilters
                maxPrice={maxPrice} setMaxPrice={setMaxPrice}
                maxSalePrice={maxSalePrice} setMaxSalePrice={setMaxSalePrice}
                activeEtat={activeEtat} setActiveEtat={(v) => { setActiveEtat(v); setParam("etat", v); }}
                fuelType={fuelType} setFuelType={setFuelType}
                transmission={transmission} setTransmission={setTransmission}
                fuels={fuels} etats={etats} transmissions={transmissions}
                fmt={fmt} activeMode={activeMode}
              />
              <button className={styles.resetBtn} onClick={() => { resetFilters(); setFilterOpen(false); }}>
                {t("catalogue.resetButton")}
              </button>
            </div>
          </>
        )}

        {/* ── MODE STANDARD ── */}
        {isStandardMode && (
          <div className={styles.layout}>
            <aside className={styles.sidebar}>
              <div className={styles.sidebarInner}>
                {activeMode !== "Acheter" ? (
                  <div className={styles.sidebarSection}>
                    <h4 className={styles.sidebarTitle}>{t("catalogue.maxPricePerDayTitle")}</h4>
                    <div className={styles.priceRange}>
                      <span className={styles.priceLabel}>{fmt(maxPrice)}</span>
                      <input type="range" min="10" max="2000" step="10"
                        value={maxPrice} onChange={(e) => setMaxPrice(Number(e.target.value))}
                        className={styles.rangeInput} />
                      <div className={styles.rangeLimits}>
                        <span>{fmt(10)}</span>
                        <span>{fmt(2000)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  // Bug réel corrigé (audit) : le mode Achat n'avait jusqu'ici
                  // aucun filtre prix — échelle dédiée (vente = milliers/
                  // dizaines de milliers de USD, pas des USD/jour).
                  <div className={styles.sidebarSection}>
                    <h4 className={styles.sidebarTitle}>{t("catalogue.maxSalePriceTitle")}</h4>
                    <div className={styles.priceRange}>
                      <span className={styles.priceLabel}>{fmt(maxSalePrice)}</span>
                      <input type="range" min="1000" max="200000" step="1000"
                        value={maxSalePrice} onChange={(e) => setMaxSalePrice(Number(e.target.value))}
                        className={styles.rangeInput} />
                      <div className={styles.rangeLimits}>
                        <span>{fmt(1000)}</span>
                        <span>{fmt(200000)}</span>
                      </div>
                    </div>
                  </div>
                )}
                <div className={styles.sidebarSection}>
                  <h4 className={styles.sidebarTitle}>{t("catalogue.stateFilterTitle")}</h4>
                  <div className={styles.pillGroup}>
                    {etats.map((e) => (
                      <button key={e} type="button"
                        className={`${styles.filterPill} ${activeEtat === e ? styles.filterPillActive : ""}`}
                        onClick={() => { setActiveEtat(e); setParam("etat", e); }}>{t(ETAT_LABEL_KEYS[e] || "catalogue.filterAllShort")}</button>
                    ))}
                  </div>
                </div>
                {activeMode === "Louer" && (
                  <div className={styles.sidebarSection}>
                    <h4 className={styles.sidebarTitle}>{t("catalogue.durationFilterTitle")}</h4>
                    <div className={styles.pillGroup}>
                      {["Tous", "Courte", "Longue"].map((d) => (
                        <button key={d} type="button"
                          className={`${styles.filterPill} ${activeDuree === d ? styles.filterPillActive : ""}`}
                          onClick={() => { setActiveDuree(d); setParam("duree", d); }}>{t(DUREE_LABEL_KEYS[d] || "catalogue.filterAllShort")}</button>
                      ))}
                    </div>
                  </div>
                )}
                <div className={styles.sidebarSection}>
                  <h4 className={styles.sidebarTitle}>{t("catalogue.fuelFilterTitle")}</h4>
                  <div className={styles.pillGroup}>
                    {fuels.map((f) => (
                      <button key={f} type="button"
                        className={`${styles.filterPill} ${fuelType === f ? styles.filterPillActive : ""}`}
                        onClick={() => setFuelType(f)}>{t(FUEL_FILTER_LABEL_KEYS[f] || "catalogue.filterAllShort")}</button>
                    ))}
                  </div>
                </div>
                <div className={styles.sidebarSection}>
                  <h4 className={styles.sidebarTitle}>{t("catalogue.transmissionFilterTitle")}</h4>
                  <div className={styles.pillGroup}>
                    {transmissions.map((tr) => (
                      <button key={tr} type="button"
                        className={`${styles.filterPill} ${transmission === tr ? styles.filterPillActive : ""}`}
                        onClick={() => setTransmission(tr)}>{t(TRANSMISSION_LABEL_KEYS[tr] || "catalogue.filterAllShort")}</button>
                    ))}
                  </div>
                </div>
                {activeChips.length > 0 && (
                  <button className={styles.resetBtn} onClick={resetFilters}>{t("catalogue.resetFiltersButton")}</button>
                )}
              </div>
            </aside>

            <main className={styles.grid}>
              {vehiclesLoading && vehicles.length === 0 ? (
                Array.from({ length: 8 }).map((_, i) => <div key={i} className={styles.ieSkeleton} />)
              ) : filtered.length === 0 ? (
                <div className={styles.empty}>
                  <div className={styles.emptyIcon}>🔍</div>
                  <h3>{t("catalogue.noVehiclesFoundTitle")}</h3>
                  <p>{t("catalogue.noVehiclesFoundDesc")}</p>
                  <button className={styles.emptyReset} onClick={resetFilters}>{t("catalogue.viewAllVehicles")}</button>
                </div>
              ) : (
                filtered.map((car) => <VehicleCard key={car._id || car.id} car={car} />)
              )}
            </main>
          </div>
        )}

        {/* ── MODE CHAUFFEUR ── */}
        {isChauffeurMode && (
          <div className={styles.ieSection}>
            {chauffeursFiltered.length === 0 ? (
              <div className={styles.ieEmpty}>
                <span style={{ fontSize: "3rem" }}>🧑‍✈️</span>
                <h3>{searchTerm ? t("catalogue.noDriverSearchResults") : t("catalogue.noDriversAvailable")}</h3>
                <p>{searchTerm ? t("catalogue.tryAnotherTerm") : t("catalogue.driversComingSoon")}</p>
                {searchTerm && (
                  <button className={styles.ieEmptyBtn} onClick={() => setSearchTerm("")}>{t("catalogue.clearSearch")}</button>
                )}
              </div>
            ) : (
              <div className={styles.ieGrid}>
                {chauffeursFiltered.map((d) => <DriverCard key={d._id} d={d} />)}
              </div>
            )}
          </div>
        )}

        {/* ── MODE IMPORT/EXPORT ── */}
        {isImportMode && (
          <div className={styles.ieSection}>

            {/* Bannière informative */}
            <div className={styles.ieBanner}>
              <div className={styles.ieBannerText}>
                <strong>{t("catalogue.ieBannerTitle")}</strong>
                <p>{t("catalogue.ieBannerDesc")}</p>
              </div>
              <div className={styles.ieBannerActions}>
                <Link to="/import-export/listings" className={styles.ieBannerBtn}>
                  {t("catalogue.viewAllIeListings")}
                </Link>
                <Link to="/import-export" className={styles.ieBannerBtnGhost}>
                  {t("catalogue.learnMore")}
                </Link>
              </div>
            </div>

            {/* Grille annonces IE */}
            {ieLoading ? (
              <div className={styles.ieGrid}>
                {[...Array(6)].map((_, i) => (
                  <div key={i} className={styles.ieSkeleton} />
                ))}
              </div>
            ) : ieListings.length === 0 ? (
              <div className={styles.ieEmpty}>
                <span style={{ fontSize: "3rem" }}>🌍</span>
                <h3>{ieSearch || ieSource ? t("catalogue.noFilterResults") : t("catalogue.noIeListingsAvailable")}</h3>
                <p>{ieSearch || ieSource ? t("catalogue.tryAnotherFilter") : t("catalogue.ieListingsComingSoon")}</p>
                {(ieSearch || ieSource) && (
                  <button className={styles.ieEmptyBtn} onClick={() => { setIeSearch(""); setIeSource(""); }}>
                    {t("catalogue.clearFilters")}
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className={styles.ieGrid}>
                  {ieListings.map((l) => <IECard key={l._id} l={l} />)}
                </div>
                {ieTotal > 24 && (
                  <div className={styles.ieMore}>
                    <Link to="/import-export/listings" className={styles.ieMoreLink}>
                      {t("catalogue.viewAllNIeListings", { n: ieTotal })}
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── MODE OTHERS (activités culturelles/loisir) ── */}
        {isOthersMode && (
          <div className={styles.ieSection}>
            <div className={styles.ieBanner}>
              <div className={styles.ieBannerText}>
                <strong>{t("catalogue.activitiesBannerTitle")}</strong>
                <p>{t("catalogue.activitiesBannerDesc")}</p>
              </div>
            </div>

            {activitiesFiltered.length === 0 ? (
              <div className={styles.ieEmpty}>
                <span style={{ fontSize: "3rem" }}>🎈</span>
                <h3>{searchTerm || activityTypeFilter !== "Tous" ? t("catalogue.noFilterResults") : t("catalogue.noActivitiesAvailable")}</h3>
                <p>{searchTerm || activityTypeFilter !== "Tous" ? t("catalogue.tryAnotherFilter") : t("catalogue.activitiesComingSoon")}</p>
                {(searchTerm || activityTypeFilter !== "Tous") && (
                  <button className={styles.ieEmptyBtn} onClick={() => { setSearchTerm(""); setActivityTypeFilter("Tous"); setParam("activityType", ""); }}>
                    {t("catalogue.clearFilters")}
                  </button>
                )}
              </div>
            ) : (
              <div className={styles.ieGrid}>
                {activitiesFiltered.map((a) => <ActivityCard key={a._id} a={a} />)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Composant filtres drawer mobile ── */
function DrawerFilters({ maxPrice, setMaxPrice, maxSalePrice, setMaxSalePrice, activeEtat, setActiveEtat, fuelType, setFuelType,
  transmission, setTransmission, fuels, etats, transmissions, fmt, activeMode }) {
  const { t } = useI18n();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 16 }}>
      {activeMode !== "Acheter" ? (
        <div>
          <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: "0.82rem", color: "#0f1b3f" }}>{t("catalogue.drawerMaxPricePerDay", { price: fmt(maxPrice) })}</p>
          <input type="range" min="10" max="2000" step="10" value={maxPrice}
            onChange={(e) => setMaxPrice(Number(e.target.value))}
            style={{ width: "100%", accentColor: "#ff4d2d" }} />
        </div>
      ) : (
        <div>
          <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: "0.82rem", color: "#0f1b3f" }}>{t("catalogue.drawerMaxSalePrice", { price: fmt(maxSalePrice) })}</p>
          <input type="range" min="1000" max="200000" step="1000" value={maxSalePrice}
            onChange={(e) => setMaxSalePrice(Number(e.target.value))}
            style={{ width: "100%", accentColor: "#ff4d2d" }} />
        </div>
      )}
      {[
        { title: t("catalogue.stateFilterTitle"),        opts: etats,         val: activeEtat,   set: setActiveEtat,   labelKeys: ETAT_LABEL_KEYS },
        { title: t("catalogue.fuelFilterTitle"),         opts: fuels,         val: fuelType,     set: setFuelType,     labelKeys: FUEL_FILTER_LABEL_KEYS },
        { title: t("catalogue.transmissionFilterTitle"), opts: transmissions, val: transmission, set: setTransmission, labelKeys: TRANSMISSION_LABEL_KEYS },
      ].map(({ title, opts, val, set, labelKeys }) => (
        <div key={title}>
          <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: "0.82rem", color: "#0f1b3f" }}>{title}</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {opts.map((o) => (
              <button key={o} type="button" onClick={() => set(o)}
                style={{ padding: "6px 14px", borderRadius: 999, border: `1.5px solid ${val === o ? "#ff4d2d" : "#e2e8f0"}`,
                  background: val === o ? "#ff4d2d" : "#fff", color: val === o ? "#fff" : "#374151",
                  fontWeight: 600, fontSize: "0.82rem", cursor: "pointer", fontFamily: "inherit" }}>
                {t(labelKeys[o] || "catalogue.filterAllShort")}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default Catalogue;
