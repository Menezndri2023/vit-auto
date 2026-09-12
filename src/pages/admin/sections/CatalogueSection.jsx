// Extrait d'AdminPanel.jsx (découpe par onglet, 2026-09-12) — logique inchangée.
import { useCallback, useEffect, useState } from "react";
import { useCurrency } from "../../../context/CurrencyContext";
import styles from "../../AdminPanel.module.css";
import { COUNTRIES_ALL, CURRENCIES as IE_CURRENCIES, getCountryFlag } from "../../../data/autocomplete";
import { downloadAuthFile } from "../../../utils/downloadAuthFile";
import { MOIS_LONGS } from "../shared.jsx";

// ═══════════════════════════════════════════════════════════════════════════════
// CATALOGUE SECTION — Annonces & Validations (combiné)
// ═══════════════════════════════════════════════════════════════════════════════
export function CatalogueSection({ vehicles, drivers, bookings, vehiclesTotal, loadMoreVehicles, headers, token, onRefresh, showToast, setConfirm, rejectModal, setRejectModal, rejectReason, setRejectReason, driverRejectModal, setDriverRejectModal, driverRejectReason, setDriverRejectReason, updateVehicleStatus, deleteVehicle, updateDriverStatusInPlace }) {
  const { COUNTRIES_CONFIG, fmtUSD, fmtPinned, CURRENCIES, rateFromUSD } = useCurrency();
  const [subTab,         setSubTab]         = useState("pending");
  const [vehSearch,      setVehSearch]      = useState("");
  const [vehPage,        setVehPage]        = useState(1);
  // Filtres pays/ville/type — purement côté client (comme vehSearch), le
  // backend GET /api/vehicles supporte déjà country/ville/type mais l'admin
  // charge tout le lot (vehiclesLimit) et filtrait jusqu'ici seulement par
  // statut/texte, rendant la gestion difficile sur un volume important.
  const [vehCountryFilter, setVehCountryFilter] = useState("");
  const [vehVilleFilter,   setVehVilleFilter]   = useState("");
  const [vehTypeFilter,    setVehTypeFilter]    = useState("");
  // Filtres onglet Chauffeurs — `drivers` contient désormais tous les statuts
  // (voir loadAll, /api/drivers/pending?status=all) et non plus seulement
  // "pending" comme avant ; ce sous-filtre de statut remplace la restriction
  // qui était jusqu'ici imposée côté serveur.
  const [driverStatusFilter,  setDriverStatusFilter]  = useState("pending");
  const [driverSearch,        setDriverSearch]        = useState("");
  const [driverCountryFilter, setDriverCountryFilter] = useState("");
  const [driverVilleFilter,   setDriverVilleFilter]   = useState("");
  const [previewVehicle, setPreviewVehicle] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewImgIdx,  setPreviewImgIdx]  = useState(0);
  const [editVehicle,  setEditVehicle]  = useState(null); // véhicule brut en édition admin
  const [editForm,     setEditForm]     = useState(null);
  const [editPhotos,   setEditPhotos]   = useState([]);
  // Devise de saisie du prix à l'édition — même principe que VendorSubmit.jsx/
  // VendorDashboard.jsx (partenaire) : l'admin pouvait jusqu'ici seulement
  // modifier un prix déjà supposé en USD, sans jamais pouvoir raisonner dans
  // la devise locale du partenaire (bug/lacune réelle trouvée en audit).
  const [editPriceCurrency,    setEditPriceCurrency]    = useState("USD");
  const [editPriceEntryPerDay, setEditPriceEntryPerDay] = useState("");
  const [editPriceEntryForSale, setEditPriceEntryForSale] = useState("");
  // Bug réel corrigé (audit) : la caution était étiquetée "USD" ici aussi mais
  // n'avait aucune conversion (même bug que VendorSubmit.jsx/VendorDashboard.jsx).
  const [editCautionEntry, setEditCautionEntry] = useState("");
  const [editLoading,  setEditLoading]  = useState(false);
  const [editSaving,   setEditSaving]   = useState(false);
  const [exportMode, setExportMode] = useState(false);
  const [exportForm, setExportForm] = useState({ price: "", currency: "XOF", availableIn: [], sourceCity: "" });
  const [exportAvailText, setExportAvailText] = useState("");
  const [exportSaving, setExportSaving] = useState(false);
  // Tarification saisonnière (Vehicle.seasonalRates) — même endpoint et même
  // format que VendorDashboard.jsx (le partenaire peut aussi l'éditer), admin
  // pouvant intervenir en plus (ex. correction directe sans passer par le partenaire).
  const [seasonalModal,    setSeasonalModal]    = useState(null);
  const [seasonalRules,    setSeasonalRules]    = useState([]);
  const [seasonalCurrency, setSeasonalCurrency] = useState("USD");
  const [seasonalSaving,   setSeasonalSaving]   = useState(false);
  const emptySeasonalRule = () => ({ label: "Haute saison", startMonth: 6, startDay: 15, endMonth: 9, endDay: 5, price: "", active: true });
  const openSeasonalModal = (vehicle) => {
    const existing = Array.isArray(vehicle.seasonalRates) ? vehicle.seasonalRates : [];
    setSeasonalCurrency(existing[0]?.priceEntryCurrency || vehicle.priceEntryCurrency || "USD");
    setSeasonalRules(existing.map((r) => ({
      label: r.label || "",
      startMonth: r.startMonth || 6, startDay: r.startDay || 15,
      endMonth:   r.endMonth   || 9, endDay:   r.endDay   || 5,
      price:  r.pricePerDayEntered != null ? String(r.pricePerDayEntered) : String(r.pricePerDay ?? ""),
      active: r.active !== false,
    })));
    setSeasonalModal(vehicle);
  };
  const addSeasonalRule    = () => setSeasonalRules((rules) => [...rules, emptySeasonalRule()]);
  const removeSeasonalRule = (i) => setSeasonalRules((rules) => rules.filter((_, idx) => idx !== i));
  const updateSeasonalRule = (i, patch) => setSeasonalRules((rules) => rules.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const handleSaveSeasonal = async () => {
    if (!seasonalModal) return;
    const vid = seasonalModal._id || seasonalModal.id;
    setSeasonalSaving(true);
    try {
      const rules = seasonalRules.map((r) => {
        const entered = Number(r.price) || 0;
        const usd = seasonalCurrency === "USD" ? entered : Math.round((entered / rateFromUSD(seasonalCurrency)) * 100) / 100;
        return {
          label: r.label,
          startMonth: Number(r.startMonth), startDay: Number(r.startDay),
          endMonth: Number(r.endMonth), endDay: Number(r.endDay),
          pricePerDay: usd,
          pricePerDayEntered: entered,
          priceEntryCurrency: seasonalCurrency,
          active: r.active,
        };
      });
      const r = await fetch(`/api/vehicles/${vid}/seasonal-rates`, {
        method: "PATCH", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ rules }),
      });
      const d = await r.json();
      if (r.ok) { showToast(rules.length > 0 ? "🗓️ Tarifs saisonniers enregistrés." : "Tarifs saisonniers supprimés.", "success"); setSeasonalModal(null); onRefresh(); }
      else showToast(d.message || "Erreur.", "error");
    } catch { showToast("Erreur réseau.", "error"); }
    finally { setSeasonalSaving(false); }
  };

  const [thumbBackfilling, setThumbBackfilling] = useState(false);
  const [descBackfilling, setDescBackfilling] = useState(false);
  const PAGE = 12;

  // Suppression par sélection (annonces véhicules ET profils chauffeur) —
  // vidé au changement de sous-onglet/page pour ne jamais supprimer une
  // annonce hors du filtre actuellement affiché à l'écran.
  const [selectedVehicleIds, setSelectedVehicleIds] = useState(new Set());
  const [selectedDriverIds,  setSelectedDriverIds]  = useState(new Set());

  // La sélection multiple n'était vidée qu'après une suppression réussie. Un
  // admin qui cochait « tout sélectionner » sur les annonces en attente puis
  // changeait de sous-onglet, de recherche, de filtre ou de page gardait sa
  // sélection active : la barre affichait toujours « Supprimer 20 annonces »,
  // et la confirmation ne dit pas LESQUELLES — il supprimait des annonces
  // qu'il ne voyait plus à l'écran. On repart d'une sélection vide dès que la
  // liste affichée change.
  useEffect(() => { setSelectedVehicleIds(new Set()); }, [subTab, vehSearch, vehPage, vehCountryFilter, vehVilleFilter, vehTypeFilter]);
  useEffect(() => { setSelectedDriverIds(new Set()); }, [driverStatusFilter, driverSearch, driverCountryFilter, driverVilleFilter]);
  const [bulkDeleting,       setBulkDeleting]        = useState(false);
  // Garde anti-double-clic sur Valider/Refuser chauffeur — ce bouton n'a pas de
  // modale de confirmation intermédiaire (contrairement à l'approbation véhicule,
  // gated par setConfirm) donc rien n'empêchait un double clic pendant le fetch
  // (~0,3-0,9s) avant ce correctif (constat d'audit fluidité).
  const [busyDriverIds, setBusyDriverIds] = useState(new Set());

  const toggleVehicleSelect = (id) => setSelectedVehicleIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleDriverSelect = (id) => setSelectedDriverIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleBulkDeleteVehicles = async () => {
    if (selectedVehicleIds.size === 0) return;
    if (!confirm(`Supprimer définitivement ${selectedVehicleIds.size} annonce(s) sélectionnée(s) ?`)) return;
    setBulkDeleting(true);
    try {
      const r = await fetch("/api/vehicles/bulk-delete", {
        method: "POST", headers, body: JSON.stringify({ ids: [...selectedVehicleIds] }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { showToast(d.message || "Annonces supprimées."); setSelectedVehicleIds(new Set()); onRefresh(); }
      else showToast(d.message || "Erreur lors de la suppression.", "error");
    } catch { showToast("Erreur réseau.", "error"); }
    setBulkDeleting(false);
  };

  const handleBulkDeleteDrivers = async () => {
    if (selectedDriverIds.size === 0) return;
    if (!confirm(`Supprimer définitivement ${selectedDriverIds.size} profil(s) sélectionné(s) ?`)) return;
    setBulkDeleting(true);
    try {
      const r = await fetch("/api/drivers/bulk-delete", {
        method: "POST", headers, body: JSON.stringify({ ids: [...selectedDriverIds] }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { showToast(d.message || "Profils supprimés."); setSelectedDriverIds(new Set()); onRefresh(); }
      else showToast(d.message || "Erreur lors de la suppression.", "error");
    } catch { showToast("Erreur réseau.", "error"); }
    setBulkDeleting(false);
  };

  // ── Transfert d'annonce (véhicule ou chauffeur) vers un autre compte/
  // entreprise/ville/pays — outil de support admin (owner immuable jusqu'ici
  // via l'édition normale, voir vehicleController.transferVehicle/driverController
  // .transferDriver). Un seul modal partagé, discriminé par transferModal.type.
  const [transferModal,  setTransferModal]  = useState(null); // { type: "vehicle"|"driver", id, label }
  const [transferForm,   setTransferForm]   = useState({ ownerQuery: "", ownerResults: [], selectedOwner: null, country: "", ville: "", businessId: "" });
  const [transferSaving, setTransferSaving] = useState(false);

  // Supervision des propositions d'embauche CDD/CDI — toute demande passe
  // d'abord par une validation admin (le partenaire ne la voit jamais avant,
  // voir driverEmploymentController.adminReviewEmploymentRequest) ; une fois
  // transmise, la décision accepter/refuser reste au partenaire propriétaire
  // du chauffeur (respondToEmploymentRequest), puis l'admin peut "traiter"
  // une demande acceptée : personnaliser les clauses du contrat généré puis
  // le transmettre automatiquement au partenaire.
  const [employmentAdminList, setEmploymentAdminList] = useState([]);
  const [employmentAdminLoading, setEmploymentAdminLoading] = useState(false);
  const [processModal, setProcessModal] = useState(null); // { id, driverName }
  const [processConditions, setProcessConditions] = useState("");
  const [processSaving, setProcessSaving] = useState(false);

  const loadEmploymentAdminList = useCallback(() => {
    if (!token) return;
    setEmploymentAdminLoading(true);
    fetch("/api/driver-employment/admin/list?limit=50", { headers })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setEmploymentAdminList(d.requests || []); })
      .catch(() => {})
      .finally(() => setEmploymentAdminLoading(false));
  }, [token, headers]);

  useEffect(() => {
    if (subTab !== "drivers" || !token) return;
    loadEmploymentAdminList();
  }, [subTab, token, headers]);

  const openTransfer = (type, id, label, currentCountry, currentVille) => {
    setTransferModal({ type, id, label });
    setTransferForm({ ownerQuery: "", ownerResults: [], selectedOwner: null, country: currentCountry || "", ville: currentVille || "", businessId: "" });
  };

  const searchTransferOwners = async (query) => {
    setTransferForm((p) => ({ ...p, ownerQuery: query }));
    if (query.trim().length < 2) { setTransferForm((p) => ({ ...p, ownerResults: [] })); return; }
    try {
      const r = await fetch(`/api/users?search=${encodeURIComponent(query.trim())}&role=partenaire&limit=6`, { headers });
      if (r.ok) { const d = await r.json(); setTransferForm((p) => ({ ...p, ownerResults: d.users || [] })); }
    } catch { /* ignore — recherche non bloquante */ }
  };

  const submitTransfer = async () => {
    if (!transferModal) return;
    const { selectedOwner, country, ville, businessId } = transferForm;
    const body = {};
    if (selectedOwner) body.ownerId = selectedOwner._id;
    if (country) body.country = country;
    if (ville.trim()) body.ville = ville.trim();
    if (businessId.trim()) body.businessId = businessId.trim();
    if (Object.keys(body).length === 0) { showToast("Choisissez au moins un changement à appliquer.", "error"); return; }

    setTransferSaving(true);
    try {
      const url = transferModal.type === "vehicle" ? `/api/vehicles/${transferModal.id}/transfer` : `/api/drivers/${transferModal.id}/transfer`;
      const r = await fetch(url, { method: "PATCH", headers, body: JSON.stringify(body) });
      const d = await r.json().catch(() => null);
      if (r.ok) {
        showToast("✅ Annonce transférée.");
        setTransferModal(null);
        onRefresh();
      } else showToast(d?.message || "Erreur lors du transfert.", "error");
    } catch { showToast("Erreur réseau.", "error"); }
    setTransferSaving(false);
  };

  const openProcessModal = (reqm) => {
    setProcessModal({ id: reqm._id, driverName: `${reqm.driver?.firstName || ""} ${reqm.driver?.lastName || ""}`.trim() });
    setProcessConditions(reqm.contractConditions || "");
  };

  const submitProcessRequest = async () => {
    if (!processModal) return;
    setProcessSaving(true);
    try {
      const r = await fetch(`/api/driver-employment/${processModal.id}/process`, {
        method: "PATCH", headers,
        body: JSON.stringify({ contractConditions: processConditions }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) {
        showToast("✅ Contrat généré et envoyé au partenaire.");
        setProcessModal(null);
        loadEmploymentAdminList();
      } else showToast(d?.message || "Erreur lors du traitement.", "error");
    } catch { showToast("Erreur réseau.", "error"); }
    setProcessSaving(false);
  };

  // ── Validation admin obligatoire avant transmission au partenaire (voir
  // driverEmploymentController.adminReviewEmploymentRequest) — le partenaire
  // ne reçoit jamais une demande d'embauche directement du client.
  const [employmentRejectModal, setEmploymentRejectModal] = useState(null); // { id, driverName }
  const [employmentRejectReason, setEmploymentRejectReason] = useState("");
  const [employmentReviewSaving, setEmploymentReviewSaving] = useState(null); // id en cours

  const forwardEmploymentRequest = async (reqm) => {
    setEmploymentReviewSaving(reqm._id);
    try {
      const r = await fetch(`/api/driver-employment/${reqm._id}/admin-review`, {
        method: "PATCH", headers,
        body: JSON.stringify({ action: "forward" }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) { showToast("✅ Demande transmise au partenaire."); loadEmploymentAdminList(); }
      else showToast(d?.message || "Erreur lors de la transmission.", "error");
    } catch { showToast("Erreur réseau.", "error"); }
    setEmploymentReviewSaving(null);
  };

  const submitRejectEmploymentRequest = async () => {
    if (!employmentRejectModal) return;
    setEmploymentReviewSaving(employmentRejectModal.id);
    try {
      const r = await fetch(`/api/driver-employment/${employmentRejectModal.id}/admin-review`, {
        method: "PATCH", headers,
        body: JSON.stringify({ action: "reject", reason: employmentRejectReason }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) {
        showToast("Demande rejetée.");
        setEmploymentRejectModal(null);
        setEmploymentRejectReason("");
        loadEmploymentAdminList();
      } else showToast(d?.message || "Erreur lors du rejet.", "error");
    } catch { showToast("Erreur réseau.", "error"); }
    setEmploymentReviewSaving(null);
  };

  // ── Édition complète d'une annonce véhicule (admin) — même principe que
  // VendorDashboard.handleOpenEdit côté partenaire : getMyVehicles/getVehicles
  // (listes) ne renvoient qu'une image par véhicule (voir limitVehicleImages),
  // il faut recharger le véhicule en entier (getVehicleById, jamais tronqué).
  // Bug réel corrigé (audit) : pour une image chargée depuis une URL externe
  // (ex. Wikimedia, ImageKit — cas de `images[0]` déjà existant en édition,
  // pas seulement un nouvel upload en data URI), `img.onload` dessinait sur un
  // <canvas> puis appelait toDataURL() sans jamais définir `img.crossOrigin` —
  // le canvas devient "tainted" et toDataURL() lève une SecurityError
  // SYNCHRONE dans le handler onload. Cette exception n'était jamais catchée
  // et la Promise (resolve-only, pas de reject) ne se réglait alors JAMAIS :
  // tout appelant `await`-ant cette fonction restait bloqué indéfiniment
  // (ex. handleSaveEditVehicle → bouton "Envoi…" figé pour toujours).
  const compressImageAdmin = (dataUrl, maxDim, quality) =>
    new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width  = Math.round(img.width  * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch {
          // Canvas tainted (hôte sans CORS) ou toute autre erreur de rendu —
          // on retombe sur l'URL/donnée d'origine plutôt que de bloquer
          // indéfiniment l'appelant.
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  const readFileAdmin = (file) =>
    new Promise((resolve) => {
      if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) return resolve(null);
      const reader = new FileReader();
      reader.onload = async (e) => resolve(await compressImageAdmin(e.target.result, 1600, 0.78));
      reader.readAsDataURL(file);
    });
  const addEditPhotosAdmin = async (files) => {
    const remaining = 6 - editPhotos.length;
    if (remaining <= 0) return;
    const results = await Promise.all(Array.from(files).slice(0, remaining).map(readFileAdmin));
    const valid = results.filter(Boolean).map((preview) => ({ id: `${Date.now()}-${Math.random()}`, preview }));
    setEditPhotos((prev) => [...prev, ...valid]);
  };
  const removeEditPhotoAdmin = (id) => setEditPhotos((prev) => prev.filter((p) => p.id !== id));

  const openEditVehicle = async (vid) => {
    setEditLoading(true);
    setEditVehicle({ _id: vid });
    setExportMode(false);
    setExportForm({ price: "", currency: "XOF", availableIn: [], sourceCity: "" });
    try {
      const r = await fetch(`/api/vehicles/${vid}`, { headers });
      const d = await r.json();
      if (!r.ok) throw new Error();
      const v = d.vehicle;
      setEditVehicle(v);
      // Si un montant exact a déjà été saisi (voir Vehicle.js pricePerDayEntered/
      // cautionEntered), le réafficher tel quel avec sa devise d'origine plutôt
      // que de retomber sur le prix USD stocké (arrondi) affiché comme si
      // c'était de l'USD (même correctif que VendorDashboard.jsx).
      setEditPriceCurrency(v.priceEntryCurrency || "USD");
      setEditPriceEntryPerDay(
        v.pricePerDayEntered != null ? String(v.pricePerDayEntered) : (v.pricePerDay ? String(v.pricePerDay) : "")
      );
      setEditPriceEntryForSale(
        v.priceForSaleEntered != null ? String(v.priceForSaleEntered) : (v.priceForSale ? String(v.priceForSale) : "")
      );
      setEditCautionEntry(
        v.cautionEntered != null ? String(v.cautionEntered) : (v.caution ? String(v.caution) : "")
      );
      setEditForm({
        type: v.type || "location",
        title: v.title || "", marque: v.marque || "", modele: v.modele || "",
        annee: v.annee || new Date().getFullYear(), etat: v.etat || "Bon état",
        vehicleType: v.vehicleType || "SUV", couleur: v.couleur || "",
        carburant: v.carburant || "Essence", transmission: v.transmission || "Automatique",
        nombrePlaces: v.nombrePlaces || 5, nombrePortes: v.nombrePortes || 5,
        kilometrage: v.kilometrage || "", climatisation: !!v.climatisation,
        rentalDurationType: v.rentalDurationType || "les_deux",
        pricePerDay: v.pricePerDay || "", priceForSale: v.priceForSale || "",
        caution: v.caution || "", country: v.country || "",
        ville: v.ville || "", adresse: v.adresse || "", description: v.description || "",
        contactNom: v.contactNom || "", contactTel: v.contactTel || "",
        currency: v.currency || "", // "" = automatique (devise du visiteur)
        ageMin: v.ageMin || "", dureeMinLocation: v.dureeMinLocation || 1, instantBook: !!v.instantBook, permisRequis: v.permisRequis !== false,
        assuranceOptionnelle: !!v.assuranceOptionnelle, withDriver: !!v.withDriver,
        available: v.available !== false,
      });
      setEditPhotos((v.images || []).map((preview, i) => ({ id: `existing-${i}`, preview })));
    } catch { showToast("Impossible de charger l'annonce", "error"); setEditVehicle(null); }
    setEditLoading(false);
  };

  // Même logique que VendorDashboard.jsx/VendorSubmit.jsx (partenaire) : le
  // champ affiché reste dans la devise choisie, editForm.pricePerDay/
  // priceForSale reçoit toujours la valeur CONVERTIE en USD (jamais la valeur
  // brute tapée) — c'est ce dernier qui part au serveur, le schéma Vehicle
  // n'ayant qu'un seul champ de prix, toujours en USD.
  const handleEditPriceEntryChange = (field, raw) => {
    if (field === "pricePerDay") setEditPriceEntryPerDay(raw);
    else if (field === "priceForSale") setEditPriceEntryForSale(raw);
    else setEditCautionEntry(raw);
    if (raw === "" || isNaN(Number(raw))) { setEditForm((p) => ({ ...p, [field]: "" })); return; }
    const num = Number(raw);
    const usd = editPriceCurrency === "USD" ? num : Math.round((num / rateFromUSD(editPriceCurrency)) * 100) / 100;
    setEditForm((p) => ({ ...p, [field]: usd }));
  };

  const handleEditPriceCurrencyChange = (code) => {
    setEditPriceCurrency(code);
    if (editPriceEntryPerDay !== "" && !isNaN(Number(editPriceEntryPerDay))) {
      const num = Number(editPriceEntryPerDay);
      setEditForm((p) => ({ ...p, pricePerDay: code === "USD" ? num : Math.round((num / rateFromUSD(code)) * 100) / 100 }));
    }
    if (editPriceEntryForSale !== "" && !isNaN(Number(editPriceEntryForSale))) {
      const num = Number(editPriceEntryForSale);
      setEditForm((p) => ({ ...p, priceForSale: code === "USD" ? num : Math.round((num / rateFromUSD(code)) * 100) / 100 }));
    }
    if (editCautionEntry !== "" && !isNaN(Number(editCautionEntry))) {
      const num = Number(editCautionEntry);
      setEditForm((p) => ({ ...p, caution: code === "USD" ? num : Math.round((num / rateFromUSD(code)) * 100) / 100 }));
    }
  };

  const handleSaveEditVehicle = async () => {
    if (!editVehicle || !editForm) return;
    if (editPhotos.length === 0) { showToast("Ajoutez au moins une photo", "error"); return; }
    setEditSaving(true);
    try {
      const images = editPhotos.map((p) => p.preview);
      const patch = {
        type: editForm.type, title: editForm.title, marque: editForm.marque, modele: editForm.modele,
        annee: Number(editForm.annee) || undefined, etat: editForm.etat, vehicleType: editForm.vehicleType,
        couleur: editForm.couleur, carburant: editForm.carburant, transmission: editForm.transmission,
        nombrePlaces: Number(editForm.nombrePlaces) || undefined, nombrePortes: Number(editForm.nombrePortes) || undefined,
        kilometrage: Number(editForm.kilometrage) || 0, climatisation: editForm.climatisation,
        rentalDurationType: editForm.rentalDurationType, caution: Number(editForm.caution) || 0,
        description: editForm.description, country: editForm.country || null,
        ville: editForm.ville, adresse: editForm.adresse, ageMin: Number(editForm.ageMin) || 0,
        dureeMinLocation: Math.max(1, Number(editForm.dureeMinLocation) || 1),
        instantBook: !!editForm.instantBook,
        contactNom: editForm.contactNom, contactTel: editForm.contactTel,
        currency: editForm.currency || null,
        permisRequis: editForm.permisRequis, assuranceOptionnelle: editForm.assuranceOptionnelle,
        withDriver: editForm.withDriver, available: editForm.available, images,
      };
      // Montant exact tel que tapé (évite la perte de précision de l'aller-
      // retour de conversion via l'USD stocké — voir Vehicle.js
      // pricePerDayEntered/cautionEntered ; même correctif que
      // VendorDashboard.jsx, manquant ici jusqu'ici — bug réel trouvé en audit).
      if (editForm.type === "vente") {
        patch.priceForSale = Number(editForm.priceForSale) || 0;
        patch.priceForSaleEntered = editPriceEntryForSale !== "" && !isNaN(Number(editPriceEntryForSale)) ? Number(editPriceEntryForSale) : null;
      } else {
        patch.pricePerDay = Number(editForm.pricePerDay) || 0;
        patch.pricePerDayEntered = editPriceEntryPerDay !== "" && !isNaN(Number(editPriceEntryPerDay)) ? Number(editPriceEntryPerDay) : null;
      }
      patch.cautionEntered = editCautionEntry !== "" && !isNaN(Number(editCautionEntry)) ? Number(editCautionEntry) : null;
      patch.priceEntryCurrency = editPriceCurrency;
      if (images[0]) patch.thumbnail = await compressImageAdmin(images[0], 480, 0.6);

      const r = await fetch(`/api/vehicles/${editVehicle._id}`, { method: "PATCH", headers, body: JSON.stringify(patch) });
      const d = await r.json().catch(() => null);
      if (r.ok) {
        showToast("✅ Annonce mise à jour");
        setEditVehicle(null); setEditForm(null); setEditPhotos([]);
        onRefresh();
      } else showToast(d?.message || "Erreur mise à jour", "error");
    } catch { showToast("Erreur réseau", "error"); }
    setEditSaving(false);
  };

  const addExportAvail = () => {
    const c = exportAvailText.trim();
    if (c && !exportForm.availableIn.includes(c)) setExportForm((p) => ({ ...p, availableIn: [...p.availableIn, c] }));
    setExportAvailText("");
  };

  const handleConvertToExport = async () => {
    if (!editVehicle) return;
    if (!exportForm.price || Number(exportForm.price) <= 0) { showToast("Indiquez un prix d'export", "error"); return; }
    if (exportForm.availableIn.length === 0) { showToast("Indiquez au moins un pays de destination", "error"); return; }
    setExportSaving(true);
    try {
      const r = await fetch(`/api/vehicles/${editVehicle._id}/convert-to-export`, {
        method: "POST", headers,
        body: JSON.stringify({
          price: Number(exportForm.price), currency: exportForm.currency,
          availableIn: exportForm.availableIn, sourceCity: exportForm.sourceCity,
        }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) {
        showToast("🌍 Annonce transformée en export.");
        setEditVehicle(null); setEditForm(null); setEditPhotos([]); setExportMode(false);
        onRefresh();
      } else showToast(d?.message || "Erreur lors de la conversion", "error");
    } catch { showToast("Erreur réseau", "error"); }
    setExportSaving(false);
  };

  const openPreview = async (vid) => {
    setPreviewLoading(true);
    setPreviewVehicle(null);
    setPreviewImgIdx(0);
    try {
      const r = await fetch(`/api/vehicles/${vid}`, { headers });
      const d = await r.json();
      if (r.ok) setPreviewVehicle(d.vehicle);
      else showToast("Impossible de charger l'annonce", "error");
    } catch { showToast("Erreur réseau", "error"); }
    setPreviewLoading(false);
  };

  const filtered = vehicles.filter((v) => {
    if (subTab === "pending")   return v.status === "pending";
    if (subTab === "approved")  return v.status === "approved";
    if (subTab === "rejected")  return v.status === "rejected";
    return true;
  }).filter((v) => {
    if (!vehSearch) return true;
    const q = vehSearch.toLowerCase();
    return [v.title, v.name, v.marque, v.modele].some((f) => f?.toLowerCase().includes(q));
  }).filter((v) => !vehCountryFilter || v.country === vehCountryFilter)
    .filter((v) => !vehVilleFilter || v.ville === vehVilleFilter)
    .filter((v) => !vehTypeFilter || v.type === vehTypeFilter);

  const filteredDrivers = drivers.filter((d) => driverStatusFilter === "all" || d.status === driverStatusFilter)
    .filter((d) => {
      if (!driverSearch) return true;
      const q = driverSearch.toLowerCase();
      return [d.firstName, d.lastName, d.title, d.zone].some((f) => f?.toLowerCase().includes(q));
    })
    .filter((d) => !driverCountryFilter || d.country === driverCountryFilter)
    .filter((d) => !driverVilleFilter || d.ville === driverVilleFilter);
  const driverVilleOptions = [...new Set(drivers.map((d) => d.ville).filter(Boolean))].sort();

  // Villes distinctes présentes dans le lot actuellement chargé — `ville` est
  // du texte libre côté modèle (pas d'enum), donc pas de liste fixe possible.
  const vehVilleOptions = [...new Set(vehicles.map((v) => v.ville).filter(Boolean))].sort();

  const paginated = filtered.slice((vehPage - 1) * PAGE, vehPage * PAGE);
  const totalPages = Math.ceil(filtered.length / PAGE);

  const SUB_TABS = [
    { k: "pending",  l: "En attente",  icon: "⏳", count: vehicles.filter(v => v.status === "pending").length, color: "#f59e0b" },
    { k: "approved", l: "Publiées",    icon: "✅", count: vehicles.filter(v => v.status === "approved").length, color: "#16a34a" },
    { k: "rejected", l: "Rejetées",    icon: "❌", count: vehicles.filter(v => v.status === "rejected").length, color: "#ef4444" },
    { k: "drivers",  l: "Chauffeurs",  icon: "👨‍✈️", count: drivers.filter(d => d.status === "pending").length, color: "#8b5cf6" },
    { k: "all",      l: "Toutes",      icon: "📋", count: vehicles.length, color: "#64748b" },
  ];

  // Mise à jour optimiste en place (updateDriverStatusInPlace/updateVehicleStatus,
  // voir leur définition au niveau du composant parent) au lieu d'un rechargement
  // complet (onRefresh=loadAll) — celui-ci remplaçait tout l'écran par un spinner
  // plein écran et réinitialisait les filtres/sélection le temps de refetch 6
  // endpoints, alors qu'approuver un véhicule était déjà instantané (incohérence
  // d'UX constatée en audit).
  const handleApproveDriver = async (id) => {
    setBusyDriverIds((prev) => new Set(prev).add(id));
    await updateDriverStatusInPlace(id, "approved");
    setBusyDriverIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  };
  const handleRejectDriver = async (id, reason) => {
    setBusyDriverIds((prev) => new Set(prev).add(id));
    await updateDriverStatusInPlace(id, "rejected", reason);
    setBusyDriverIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    setDriverRejectModal(null); setDriverRejectReason("");
  };
  const handleRejectVehicle = async () => {
    await updateVehicleStatus(rejectModal.vid, "rejected", rejectReason);
    setRejectModal(null); setRejectReason("");
  };

  return (
    <div className={styles.scrollZone}>
      {/* Stats rapides */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        {SUB_TABS.slice(0, 4).map((t) => (
          <div key={t.k} className={styles.pvStatCard} style={{ borderLeftColor: t.color, cursor: "pointer" }} onClick={() => setSubTab(t.k)}>
            <div className={styles.pvStatVal} style={{ color: t.color }}>{t.count}</div>
            <div className={styles.pvStatLbl}>{t.l}</div>
          </div>
        ))}
      </div>

      {/* Sous-onglets */}
      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #e2e8f0", marginBottom: 20 }}>
        {SUB_TABS.map((t) => (
          <button key={t.k} onClick={() => { setSubTab(t.k); setVehPage(1); }}
            style={{ padding: "10px 18px", border: "none", background: "none", cursor: "pointer", fontWeight: 700, fontSize: "0.82rem", borderBottom: subTab === t.k ? `3px solid ${t.color}` : "3px solid transparent", color: subTab === t.k ? t.color : "#64748b", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
            {t.icon} {t.l}
            <span style={{ fontSize: ".72rem", background: subTab === t.k ? t.color : "#e2e8f0", color: subTab === t.k ? "#fff" : "#64748b", borderRadius: 12, padding: "1px 7px", minWidth: 20, textAlign: "center" }}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* Contenu Annonces */}
      {subTab !== "drivers" && (
        <>
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <input className={styles.searchInput} placeholder="Rechercher une annonce…" value={vehSearch}
              onChange={(e) => { setVehSearch(e.target.value); setVehPage(1); }}
              style={{ flex: 1, minWidth: 200 }} />
            <select className={styles.searchInput} value={vehCountryFilter}
              onChange={(e) => { setVehCountryFilter(e.target.value); setVehPage(1); }}
              style={{ minWidth: 150 }}>
              <option value="">🌍 Tous les pays</option>
              {COUNTRIES_CONFIG.map((c) => (
                <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
              ))}
            </select>
            <select className={styles.searchInput} value={vehVilleFilter}
              onChange={(e) => { setVehVilleFilter(e.target.value); setVehPage(1); }}
              style={{ minWidth: 150 }}>
              <option value="">📍 Toutes les villes</option>
              {vehVilleOptions.map((ville) => (
                <option key={ville} value={ville}>{ville}</option>
              ))}
            </select>
            <select className={styles.searchInput} value={vehTypeFilter}
              onChange={(e) => { setVehTypeFilter(e.target.value); setVehPage(1); }}
              style={{ minWidth: 130 }}>
              <option value="">🏷️ Tous types</option>
              <option value="location">Location</option>
              <option value="vente">Vente</option>
            </select>
            {(vehCountryFilter || vehVilleFilter || vehTypeFilter) && (
              <button className={styles.btnSmall}
                onClick={() => { setVehCountryFilter(""); setVehVilleFilter(""); setVehTypeFilter(""); setVehPage(1); }}>
                ✕ Réinitialiser les filtres
              </button>
            )}
            <button className={styles.btnSmall} onClick={onRefresh}>↻ Actualiser</button>
            {selectedVehicleIds.size > 0 && (
              <button className={styles.btnDanger} disabled={bulkDeleting} onClick={handleBulkDeleteVehicles}>
                🗑️ Supprimer la sélection ({selectedVehicleIds.size})
              </button>
            )}
            <button className={styles.btnSmall} disabled={thumbBackfilling}
              onClick={async () => {
                setThumbBackfilling(true);
                try {
                  const r = await fetch("/api/vehicles/backfill-thumbnails", { method: "POST", headers });
                  const d = await r.json();
                  showToast(r.ok ? d.message : (d.message || "Erreur"), r.ok ? "success" : "error");
                  if (r.ok) onRefresh();
                } catch { showToast("Erreur réseau", "error"); }
                setThumbBackfilling(false);
              }}>
              {thumbBackfilling ? "Génération…" : "🖼️ Générer les vignettes manquantes"}
            </button>
            <button className={styles.btnSmall} disabled={descBackfilling}
              onClick={async () => {
                setDescBackfilling(true);
                try {
                  const r = await fetch("/api/vehicles/backfill-descriptions", { method: "POST", headers });
                  const d = await r.json();
                  showToast(r.ok ? d.message : (d.message || "Erreur"), r.ok ? "success" : "error");
                  if (r.ok) onRefresh();
                } catch { showToast("Erreur réseau", "error"); }
                setDescBackfilling(false);
              }}>
              {descBackfilling ? "Génération…" : "✨ Générer les descriptions manquantes"}
            </button>
          </div>

          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
              <div style={{ fontSize: "3rem", marginBottom: 12 }}>🚗</div>
              <p style={{ fontWeight: 600 }}>Aucune annonce dans cette catégorie</p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>
                      <input type="checkbox"
                        checked={paginated.length > 0 && paginated.every((v) => selectedVehicleIds.has(v._id || v.id))}
                        onChange={(e) => {
                          const pageIds = paginated.map((v) => v._id || v.id);
                          setSelectedVehicleIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) pageIds.forEach((id) => next.add(id));
                            else pageIds.forEach((id) => next.delete(id));
                            return next;
                          });
                        }} />
                    </th>
                    <th>Véhicule</th><th>Propriétaire</th><th>Type</th><th>Prix</th><th>Score</th><th>Statut</th><th>Date</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((v) => {
                    const vid = v._id || v.id;
                    const score = v.validationScore;
                    const SC = { approved: { l: "Publiée", c: "#16a34a", bg: "#dcfce7" }, pending: { l: "En attente", c: "#d97706", bg: "#fef3c7" }, rejected: { l: "Rejetée", c: "#dc2626", bg: "#fee2e2" } };
                    const sc = SC[v.status] || SC.pending;
                    const owner = v.owner || v.userId;
                    return (
                      <tr key={vid} className={styles.tr}>
                        <td>
                          <input type="checkbox" checked={selectedVehicleIds.has(vid)} onChange={() => toggleVehicleSelect(vid)} />
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            {(v.images?.[0] || v.image)
                              ? <img src={v.images?.[0] || v.image} alt="" loading="lazy" decoding="async" style={{ width: 46, height: 36, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                              : <div style={{ width: 46, height: 36, borderRadius: 6, background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem" }}>🚗</div>
                            }
                            <div>
                              <div style={{ fontWeight: 700, fontSize: ".87rem", color: "#0f1b3f" }}>{v.title || v.name}</div>
                              <div style={{ fontSize: ".74rem", color: "#94a3b8" }}>{v.marque} {v.modele} {v.annee}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ fontSize: ".82rem" }}>
                          {owner?.firstName || owner?.name || "—"}
                          <div style={{ fontSize: ".73rem", color: "#94a3b8" }}>{owner?.email || "—"}</div>
                        </td>
                        <td><span className={styles.badge} style={{ color: "#64748b", background: "#f1f5f9" }}>{v.type === "location" ? "📅 Location" : "💰 Vente"}</span></td>
                        <td style={{ fontSize: ".85rem", fontWeight: 700 }}>
                          {v.pricePerDay ? `${Number(v.pricePerDay).toLocaleString()} /j` : v.priceForSale ? `${Number(v.priceForSale).toLocaleString()}` : "—"}
                        </td>
                        <td>
                          {score != null && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <div style={{ width: 40, height: 4, background: "#e2e8f0", borderRadius: 4, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${score}%`, background: score >= 65 ? "#16a34a" : score >= 40 ? "#f59e0b" : "#ef4444", borderRadius: 4 }} />
                              </div>
                              <span style={{ fontSize: ".78rem", fontWeight: 700 }}>{score}</span>
                            </div>
                          )}
                        </td>
                        <td><span className={styles.badge} style={{ color: sc.c, background: sc.bg }}>{sc.l}</span></td>
                        <td style={{ fontSize: ".78rem", color: "#94a3b8" }}>{v.createdAt ? new Date(v.createdAt).toLocaleDateString("fr-FR") : "—"}</td>
                        <td>
                          <div style={{ display: "flex", gap: 5 }}>
                            <button title="Visualiser l'annonce complète"
                              onClick={() => openPreview(vid)}
                              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "4px 10px", fontSize: ".75rem", fontWeight: 700, background: "#eff6ff", color: "#2563eb", border: "1.5px solid #bfdbfe", borderRadius: 6, cursor: "pointer" }}>
                              👁
                            </button>
                            <button title="Modifier l'annonce"
                              onClick={() => openEditVehicle(vid)}
                              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "4px 10px", fontSize: ".75rem", fontWeight: 700, background: "#f5f3ff", color: "#7c3aed", border: "1.5px solid #ddd6fe", borderRadius: 6, cursor: "pointer" }}>
                              ✏️
                            </button>
                            {v.type === "location" && (
                              <button title="Tarifs saisonniers"
                                onClick={() => openSeasonalModal(v)}
                                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "4px 10px", fontSize: ".75rem", fontWeight: 700, background: "#fefce8", color: "#a16207", border: "1.5px solid #fde68a", borderRadius: 6, cursor: "pointer" }}>
                                🗓️
                              </button>
                            )}
                            <button title="Transférer vers un autre compte/entreprise/pays/ville"
                              onClick={() => openTransfer("vehicle", vid, v.title || v.name, v.country, v.ville)}
                              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "4px 10px", fontSize: ".75rem", fontWeight: 700, background: "#fff7ed", color: "#c2410c", border: "1.5px solid #fed7aa", borderRadius: 6, cursor: "pointer" }}>
                              🔀
                            </button>
                            {v.status !== "approved" && (
                              <button className={styles.btnApprove} style={{ fontSize: ".75rem", padding: "4px 10px" }}
                                onClick={() => setConfirm({ message: `Approuver "${v.title || v.name}" ?`, action: () => updateVehicleStatus(vid, "approved") })}>
                                ✅
                              </button>
                            )}
                            {v.status !== "rejected" && (
                              <button className={styles.btnReject} style={{ fontSize: ".75rem", padding: "4px 10px" }}
                                onClick={() => { setRejectModal({ vid, name: v.title || v.name }); setRejectReason(""); }}>
                                ✕
                              </button>
                            )}
                            <button className={styles.btnDeleteSm} style={{ fontSize: ".75rem" }}
                              onClick={() => setConfirm({ message: "Supprimer cette annonce ?", danger: true, action: () => deleteVehicle(vid) })}>
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button className={styles.pageBtn} onClick={() => setVehPage(p => Math.max(1, p-1))} disabled={vehPage === 1}>‹</button>
              {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i+1).map(p => (
                <button key={p} className={`${styles.pageBtn} ${p === vehPage ? styles.pageBtnActive : ""}`} onClick={() => setVehPage(p)}>{p}</button>
              ))}
              <button className={styles.pageBtn} onClick={() => setVehPage(p => Math.min(totalPages, p+1))} disabled={vehPage === totalPages}>›</button>
            </div>
          )}

          {/* Bug réel corrigé (audit) : plafond de 200 annonces chargées,
              invisible pour l'admin — voir loadMoreVehicles (AdminPanel). */}
          {vehicles.length < vehiclesTotal && (
            <div style={{ textAlign: "center", marginTop: 10 }}>
              <p style={{ fontSize: ".8rem", color: "#94a3b8", marginBottom: 6 }}>{vehicles.length} chargées sur {vehiclesTotal} au total</p>
              <button onClick={loadMoreVehicles}
                style={{ padding: "6px 16px", borderRadius: 10, border: "1.5px solid #6366f1", background: "#fff", color: "#6366f1", fontWeight: 700, fontSize: ".8rem", cursor: "pointer" }}>
                Charger plus
              </button>
            </div>
          )}
        </>
      )}

      {/* Contenu Chauffeurs */}
      {subTab === "drivers" && (
        <div>
          {/* Sous-filtres statut — `drivers` couvre désormais tous les statuts
              (voir loadAll), ce sous-filtre remplace la restriction "pending
              uniquement" qui était jusqu'ici imposée côté serveur. */}
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            {[
              { k: "pending",  l: "En attente", color: "#f59e0b" },
              { k: "approved", l: "Publiés",    color: "#16a34a" },
              { k: "rejected", l: "Rejetés",    color: "#ef4444" },
              { k: "all",      l: "Tous",       color: "#64748b" },
            ].map((t) => (
              <button key={t.k} onClick={() => setDriverStatusFilter(t.k)}
                style={{ padding: "5px 12px", borderRadius: 14, border: `1.5px solid ${driverStatusFilter === t.k ? t.color : "#e2e8f0"}`, background: driverStatusFilter === t.k ? t.color : "#fff", color: driverStatusFilter === t.k ? "#fff" : "#64748b", fontWeight: 700, fontSize: ".76rem", cursor: "pointer" }}>
                {t.l} ({drivers.filter((d) => t.k === "all" || d.status === t.k).length})
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <input className={styles.searchInput} placeholder="Rechercher un chauffeur…" value={driverSearch}
              onChange={(e) => setDriverSearch(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
            <select className={styles.searchInput} value={driverCountryFilter}
              onChange={(e) => setDriverCountryFilter(e.target.value)} style={{ minWidth: 150 }}>
              <option value="">🌍 Tous les pays</option>
              {COUNTRIES_CONFIG.map((c) => (
                <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
              ))}
            </select>
            <select className={styles.searchInput} value={driverVilleFilter}
              onChange={(e) => setDriverVilleFilter(e.target.value)} style={{ minWidth: 150 }}>
              <option value="">📍 Toutes les villes</option>
              {driverVilleOptions.map((ville) => (
                <option key={ville} value={ville}>{ville}</option>
              ))}
            </select>
            {(driverCountryFilter || driverVilleFilter || driverSearch) && (
              <button className={styles.btnSmall}
                onClick={() => { setDriverSearch(""); setDriverCountryFilter(""); setDriverVilleFilter(""); }}>
                ✕ Réinitialiser les filtres
              </button>
            )}
          </div>

          {filteredDrivers.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
              <div style={{ fontSize: "3rem", marginBottom: 12 }}>👨‍✈️</div>
              <p style={{ fontWeight: 600 }}>Aucun profil chauffeur dans cette catégorie</p>
            </div>
          ) : (
            <>
              {selectedDriverIds.size > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <button className={styles.btnDanger} disabled={bulkDeleting} onClick={handleBulkDeleteDrivers}>
                    🗑️ Supprimer la sélection ({selectedDriverIds.size})
                  </button>
                </div>
              )}
              <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>
                      <input type="checkbox"
                        checked={filteredDrivers.length > 0 && filteredDrivers.every((d) => selectedDriverIds.has(d._id))}
                        onChange={(e) => setSelectedDriverIds(e.target.checked ? new Set(filteredDrivers.map((d) => d._id)) : new Set())} />
                    </th>
                    <th>Chauffeur</th><th>Ville / Pays</th><th>Statut</th><th>Permis</th><th>Expérience</th><th>Langues</th><th>CV</th><th>Soumis le</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDrivers.map((d) => {
                    // Le profil chauffeur (Driver) porte sa propre identité/photo — distincte
                    // du compte partenaire qui publie (d.owner, peuplé par getPendingDrivers).
                    // Correction : ce tableau lisait jusqu'ici des champs d'un ancien modèle
                    // (userId/licenseNumber/yearsExperience/languages) qui n'existent plus sur
                    // Driver — toujours vides/undefined en pratique, bug réel constaté en lisant
                    // la réponse effective de /api/drivers/pending.
                    const owner = d.owner || {};
                    return (
                      <tr key={d._id} className={styles.tr}>
                        <td>
                          <input type="checkbox" checked={selectedDriverIds.has(d._id)} onChange={() => toggleDriverSelect(d._id)} />
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
                            {d.profilePhoto ? <img src={d.profilePhoto} alt="" loading="lazy" decoding="async" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover" }} /> : <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center" }}>👤</div>}
                            <div>
                              <strong style={{ fontSize: ".87rem" }}>{d.firstName} {d.lastName}</strong>
                              <div style={{ fontSize: ".74rem", color: "#94a3b8" }}>Publié par {owner.firstName} {owner.lastName} · {owner.email}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ fontSize: ".8rem" }}>{d.ville || "—"}{d.country ? ` · ${d.country}` : ""}</td>
                        <td>
                          {(() => {
                            const sc = { pending: { l: "En attente", c: "#d97706", bg: "#fef3c7" }, approved: { l: "Publié", c: "#16a34a", bg: "#d1fae5" }, rejected: { l: "Rejeté", c: "#dc2626", bg: "#fee2e2" } }[d.status] || { l: d.status, c: "#64748b", bg: "#f1f5f9" };
                            return <span className={styles.badge} style={{ color: sc.c, background: sc.bg }}>{sc.l}</span>;
                          })()}
                        </td>
                        <td style={{ fontSize: ".82rem" }}>{(Array.isArray(d.permisCategorie) ? d.permisCategorie.join(", ") : d.permisCategorie) || "—"} {d.vehiculePersonnel && <span style={{ color: "#94a3b8" }}>· 🚗 avec véhicule</span>}</td>
                        <td style={{ fontSize: ".82rem" }}>{d.experience || "—"}</td>
                        <td style={{ fontSize: ".78rem" }}>{d.langues?.join(", ") || "—"}</td>
                        <td style={{ fontSize: ".78rem" }}>
                          {d.cv ? <a href={d.cv} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>📄 Voir</a> : <span style={{ color: "#dc2626" }}>Manquant</span>}
                        </td>
                        <td style={{ fontSize: ".78rem", color: "#94a3b8" }}>{d.createdAt ? new Date(d.createdAt).toLocaleDateString("fr-FR") : "—"}</td>
                        <td>
                          <div style={{ display: "flex", gap: 5 }}>
                            {d.status === "pending" ? (
                              <>
                                <button className={styles.btnApprove} disabled={busyDriverIds.has(d._id)} style={{ fontSize: ".75rem", padding: "4px 10px" }} onClick={() => handleApproveDriver(d._id)}>✅ Valider</button>
                                <button className={styles.btnReject} disabled={busyDriverIds.has(d._id)} style={{ fontSize: ".75rem", padding: "4px 10px" }} onClick={() => { setDriverRejectModal({ id: d._id, name: `${d.firstName} ${d.lastName}` }); setDriverRejectReason(""); }}>✕ Refuser</button>
                              </>
                            ) : d.status === "rejected" ? (
                              <button className={styles.btnApprove} disabled={busyDriverIds.has(d._id)} style={{ fontSize: ".75rem", padding: "4px 10px" }} onClick={() => handleApproveDriver(d._id)}>✅ Republier</button>
                            ) : (
                              <button className={styles.btnReject} disabled={busyDriverIds.has(d._id)} style={{ fontSize: ".75rem", padding: "4px 10px" }} onClick={() => { setDriverRejectModal({ id: d._id, name: `${d.firstName} ${d.lastName}` }); setDriverRejectReason(""); }}>✕ Dépublier</button>
                            )}
                            <button title="Transférer vers un autre compte/entreprise/pays/ville"
                              onClick={() => openTransfer("driver", d._id, `${d.firstName} ${d.lastName}`, d.country, d.ville)}
                              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "4px 10px", fontSize: ".75rem", fontWeight: 700, background: "#fff7ed", color: "#c2410c", border: "1.5px solid #fed7aa", borderRadius: 6, cursor: "pointer" }}>
                              🔀
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </>
          )}

          {/* Propositions d'embauche CDD/CDI — l'admin valide (ou rejette) chaque
              demande avant qu'elle n'atteigne le partenaire (colonne "Validation
              admin"), la décision accepter/refuser reste ensuite au partenaire,
              puis traitement (contrat modifiable + envoi) à l'admin une fois acceptée */}
          <div className={styles.sectionToolbar} style={{ marginTop: 32 }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 800, color: "#0f1b3f" }}>
              💼 Propositions d'embauche CDD/CDI ({employmentAdminList.length})
              {employmentAdminList.some((r) => (r.adminReview?.status || "pending") === "pending") && (
                <span style={{ marginLeft: 8, fontSize: ".75rem", fontWeight: 700, color: "#d97706", background: "#fef3c7", padding: "2px 8px", borderRadius: 999 }}>
                  {employmentAdminList.filter((r) => (r.adminReview?.status || "pending") === "pending").length} à valider
                </span>
              )}
            </h2>
          </div>
          {employmentAdminLoading ? <p style={{ color: "#94a3b8" }}>Chargement…</p> : employmentAdminList.length === 0 ? (
            <p style={{ color: "#64748b", fontSize: "0.9rem" }}>Aucune proposition d'embauche.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Chauffeur</th><th>Employeur</th><th>Contrat</th><th>Salaire</th><th>Validation admin</th><th>Statut</th><th>Soumise le</th><th>Traitement</th></tr>
                </thead>
                <tbody>
                  {employmentAdminList.map((reqm) => {
                    const sc = { pending: { l: "En attente", c: "#d97706", bg: "#fef3c7" }, accepted: { l: "Acceptée", c: "#059669", bg: "#d1fae5" }, declined: { l: "Refusée", c: "#dc2626", bg: "#fee2e2" }, cancelled: { l: "Annulée", c: "#64748b", bg: "#f1f5f9" } }[reqm.status];
                    const arc = { pending: { l: "À valider", c: "#d97706", bg: "#fef3c7" }, forwarded: { l: "Transmise", c: "#059669", bg: "#d1fae5" }, rejected: { l: "Rejetée (admin)", c: "#dc2626", bg: "#fee2e2" } }[reqm.adminReview?.status || "pending"];
                    const reviewing = employmentReviewSaving === reqm._id;
                    return (
                      <tr key={reqm._id} className={styles.tr}>
                        <td style={{ fontSize: ".82rem" }}>{reqm.driver?.firstName} {reqm.driver?.lastName}</td>
                        <td style={{ fontSize: ".82rem" }}>{reqm.employer?.firstName} {reqm.employer?.lastName}<div style={{ fontSize: ".73rem", color: "#94a3b8" }}>{reqm.employer?.email}</div></td>
                        <td><span className={styles.badge} style={{ color: "#64748b", background: "#f1f5f9" }}>{reqm.contractType?.toUpperCase()}</span></td>
                        <td style={{ fontSize: ".85rem", fontWeight: 700 }}>{Number(reqm.proposedSalary).toLocaleString()} {reqm.currency}</td>
                        <td>
                          <span className={styles.badge} style={{ color: arc.c, background: arc.bg }}>{arc.l}</span>
                          {reqm.adminReview?.status === "pending" && (
                            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                              <button className={styles.btnApprove} style={{ fontSize: ".72rem", padding: "3px 8px" }} disabled={reviewing}
                                onClick={() => forwardEmploymentRequest(reqm)}>
                                {reviewing ? "…" : "✓ Transmettre"}
                              </button>
                              <button className={styles.btnDanger} style={{ fontSize: ".72rem", padding: "3px 8px" }} disabled={reviewing}
                                onClick={() => { setEmploymentRejectModal({ id: reqm._id, driverName: `${reqm.driver?.firstName || ""} ${reqm.driver?.lastName || ""}`.trim() }); setEmploymentRejectReason(""); }}>
                                ✕ Rejeter
                              </button>
                            </div>
                          )}
                        </td>
                        <td><span className={styles.badge} style={{ color: sc.c, background: sc.bg }}>{sc.l}</span></td>
                        <td style={{ fontSize: ".78rem", color: "#94a3b8" }}>{reqm.createdAt ? new Date(reqm.createdAt).toLocaleDateString("fr-FR") : "—"}</td>
                        <td>
                          {reqm.status === "accepted" && !reqm.contractSentAt && (
                            <button className={styles.btnApprove} style={{ fontSize: ".75rem", padding: "4px 10px" }} onClick={() => openProcessModal(reqm)}>📄 Traiter</button>
                          )}
                          {reqm.contractSentAt && (
                            <button type="button" onClick={async () => {
                                const r = await downloadAuthFile(`/api/driver-employment/${reqm._id}/contract-pdf`, `contrat-emploi-${reqm._id}.pdf`, token);
                                if (!r.ok) showToast(r.message, "error");
                              }} style={{ color: "#2563eb", fontSize: ".78rem", background: "none", border: "none", cursor: "pointer", padding: 0 }}>✓ Envoyé — voir PDF</button>
                          )}
                          {reqm.status !== "accepted" && !reqm.contractSentAt && <span style={{ color: "#94a3b8", fontSize: ".78rem" }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal rejet demande d'embauche (admin, avant transmission au partenaire) */}
      {employmentRejectModal && (
        <div className={styles.overlay} onClick={() => setEmploymentRejectModal(null)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            <p className={styles.confirmMsg}>Motif du rejet — proposition pour « {employmentRejectModal.driverName} »</p>
            <textarea style={{ width: "100%", borderRadius: 8, border: "1px solid #e2e8f0", padding: ".6rem", fontSize: ".9rem", marginBottom: ".75rem", resize: "vertical" }}
              rows={3} placeholder="Ex: Salaire proposé trop bas, conditions non conformes…"
              value={employmentRejectReason} onChange={(e) => setEmploymentRejectReason(e.target.value)} />
            <div className={styles.confirmActions}>
              <button className={styles.btnDanger} disabled={employmentReviewSaving === employmentRejectModal.id} onClick={submitRejectEmploymentRequest}>
                {employmentReviewSaving === employmentRejectModal.id ? "…" : "Rejeter"}
              </button>
              <button className={styles.btnGhost} onClick={() => setEmploymentRejectModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal rejet annonce */}
      {rejectModal && (
        <div className={styles.overlay} onClick={() => setRejectModal(null)}>
          <div className={styles.confirmBox} onClick={e => e.stopPropagation()}>
            <p className={styles.confirmMsg}>Raison du rejet pour « {rejectModal.name} »</p>
            <textarea style={{ width: "100%", borderRadius: 8, border: "1px solid #e2e8f0", padding: ".6rem", fontSize: ".9rem", marginBottom: ".75rem", resize: "vertical" }}
              rows={3} placeholder="Ex: Photos insuffisantes, description incomplète…"
              value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
            <div className={styles.confirmActions}>
              <button className={styles.btnDanger} onClick={handleRejectVehicle}>Rejeter</button>
              <button className={styles.btnGhost} onClick={() => setRejectModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal rejet chauffeur */}
      {driverRejectModal && (
        <div className={styles.overlay} onClick={() => setDriverRejectModal(null)}>
          <div className={styles.confirmBox} onClick={e => e.stopPropagation()}>
            <p className={styles.confirmMsg}>Raison du refus pour « {driverRejectModal.name} »</p>
            <textarea style={{ width: "100%", borderRadius: 8, border: "1px solid #e2e8f0", padding: ".6rem", fontSize: ".9rem", marginBottom: ".75rem", resize: "vertical" }}
              rows={3} placeholder="Ex: Documents insuffisants…"
              value={driverRejectReason} onChange={e => setDriverRejectReason(e.target.value)} />
            <div className={styles.confirmActions}>
              <button className={styles.btnDanger} onClick={() => handleRejectDriver(driverRejectModal.id, driverRejectReason)}>Refuser</button>
              <button className={styles.btnGhost} onClick={() => setDriverRejectModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL TRANSFERT (véhicule ou chauffeur) ══ */}
      {transferModal && (
        <div className={styles.overlay} onClick={() => setTransferModal(null)}>
          <div className={styles.confirmBox} onClick={e => e.stopPropagation()} style={{ width: "min(480px, 92vw)" }}>
            <p className={styles.confirmMsg}>
              🔀 Transférer « {transferModal.label} » ({transferModal.type === "vehicle" ? "véhicule" : "chauffeur"})
            </p>

            <div style={{ marginBottom: 12, position: "relative" }}>
              <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>
                Nouveau propriétaire (nom ou email) — laisser vide pour ne pas changer
              </label>
              <input type="text" value={transferForm.selectedOwner ? `${transferForm.selectedOwner.firstName} ${transferForm.selectedOwner.lastName} (${transferForm.selectedOwner.email})` : transferForm.ownerQuery}
                onChange={(e) => { setTransferForm((p) => ({ ...p, selectedOwner: null })); searchTransferOwners(e.target.value); }}
                placeholder="Ex : Jean Kouassi ou jean@exemple.com"
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".88rem", boxSizing: "border-box" }} />
              {transferForm.ownerResults.length > 0 && !transferForm.selectedOwner && (
                <div style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, marginTop: 4, maxHeight: 160, overflowY: "auto", background: "#fff" }}>
                  {transferForm.ownerResults.map((o) => (
                    <div key={o._id} onClick={() => setTransferForm((p) => ({ ...p, selectedOwner: o, ownerResults: [] }))}
                      style={{ padding: "6px 10px", fontSize: ".82rem", cursor: "pointer", borderBottom: "1px solid #f1f5f9" }}>
                      {o.firstName} {o.lastName} — {o.email}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Pays</label>
                <select value={transferForm.country} onChange={(e) => setTransferForm((p) => ({ ...p, country: e.target.value }))}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".88rem" }}>
                  <option value="">— Ne pas changer —</option>
                  {COUNTRIES_CONFIG.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Ville</label>
                <input type="text" value={transferForm.ville} onChange={(e) => setTransferForm((p) => ({ ...p, ville: e.target.value }))}
                  placeholder="Ne pas changer"
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".88rem", boxSizing: "border-box" }} />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>
                ID entreprise (PartnerBusiness) — optionnel, avancé
              </label>
              <input type="text" value={transferForm.businessId} onChange={(e) => setTransferForm((p) => ({ ...p, businessId: e.target.value }))}
                placeholder="Laisser vide pour ne pas rattacher"
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".88rem", boxSizing: "border-box" }} />
              <p style={{ margin: "4px 0 0", fontSize: ".74rem", color: "#94a3b8" }}>
                Doit appartenir au propriétaire final (nouveau ou actuel) — sinon rejeté par le serveur. Sinon, le nouveau propriétaire peut rattacher lui-même depuis son tableau de bord (Mes entreprises).
              </p>
            </div>

            <div className={styles.confirmActions}>
              <button className={styles.btnPrimary} onClick={submitTransfer} disabled={transferSaving}>{transferSaving ? "…" : "Transférer"}</button>
              <button className={styles.btnGhost} onClick={() => setTransferModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL TRAITEMENT EMBAUCHE CDD/CDI (contrat modifiable) ══ */}
      {processModal && (
        <div className={styles.overlay} onClick={() => setProcessModal(null)}>
          <div className={styles.confirmBox} onClick={e => e.stopPropagation()} style={{ width: "min(560px, 92vw)" }}>
            <p className={styles.confirmMsg}>📄 Traiter le contrat de {processModal.driverName}</p>
            <p style={{ fontSize: ".82rem", color: "#64748b", marginBottom: 10 }}>
              Personnalisez les clauses du contrat si besoin — le texte par défaut s'applique si laissé vide. Le PDF sera
              généré et le partenaire propriétaire du chauffeur sera notifié automatiquement.
            </p>
            <textarea style={{ width: "100%", minHeight: 180, borderRadius: 8, border: "1px solid #e2e8f0", padding: ".7rem", fontSize: ".85rem", marginBottom: ".75rem", resize: "vertical", fontFamily: "inherit" }}
              placeholder="Laisser vide pour utiliser les clauses standard…"
              value={processConditions} onChange={(e) => setProcessConditions(e.target.value)} />
            <div className={styles.confirmActions}>
              <button className={styles.btnPrimary} onClick={submitProcessRequest} disabled={processSaving}>{processSaving ? "…" : "Générer et envoyer"}</button>
              <button className={styles.btnGhost} onClick={() => setProcessModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL PRÉVISUALISATION ANNONCE ══ */}
      {(previewLoading || previewVehicle) && (
        <div className={styles.overlay} onClick={() => { setPreviewVehicle(null); setPreviewLoading(false); }}
          style={{ alignItems: "flex-start", paddingTop: "2vh", overflowY: "auto" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 16, width: "min(900px, 96vw)", maxHeight: "95dvh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,.22)" }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px 14px", borderBottom: "1.5px solid #e2e8f0", flexShrink: 0 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 900, color: "#0f1b3f" }}>
                  👁 Prévisualisation de l'annonce
                </h2>
                {previewVehicle && <p style={{ margin: "2px 0 0", fontSize: ".78rem", color: "#94a3b8" }}>ID : {previewVehicle._id}</p>}
              </div>
              <button onClick={() => { setPreviewVehicle(null); setPreviewLoading(false); }}
                style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 34, height: 34, fontSize: "1.1rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>

            {/* Body */}
            <div style={{ overflowY: "auto", padding: "20px 24px 24px", flex: 1 }}>
              {previewLoading && !previewVehicle ? (
                <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
                  <div style={{ fontSize: "2rem", marginBottom: 10 }}>⏳</div>
                  <p>Chargement de l'annonce…</p>
                </div>
              ) : previewVehicle ? (() => {
                const v = previewVehicle;
                const imgs = v.images?.length ? v.images : v.image ? [v.image] : [];
                const o = v.owner || {};
                const KYC_COLORS = { VERIFIE: "#059669", EN_ATTENTE: "#d97706", REFUSE: "#dc2626", A_REVOIR_MANUELLEMENT: "#2563eb" };
                const kycC = KYC_COLORS[o.kycStatus] || "#94a3b8";
                const STATUS_CFG = { pending: { l: "En attente", c: "#d97706", bg: "#fef3c7" }, approved: { l: "Publiée", c: "#059669", bg: "#dcfce7" }, rejected: { l: "Rejetée", c: "#dc2626", bg: "#fee2e2" } };
                const sc = STATUS_CFG[v.status] || STATUS_CFG.pending;

                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                    {/* Statut + actions rapides */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ background: sc.bg, color: sc.c, padding: "4px 14px", borderRadius: 99, fontWeight: 800, fontSize: ".82rem" }}>{sc.l}</span>
                      {v.autoValidated && <span style={{ background: "#ede9fe", color: "#7c3aed", padding: "4px 12px", borderRadius: 99, fontWeight: 700, fontSize: ".78rem" }}>✨ Validé automatiquement</span>}
                      {v.validationScore != null && (
                        <span style={{ background: v.validationScore >= 65 ? "#dcfce7" : v.validationScore >= 40 ? "#fef3c7" : "#fee2e2", color: v.validationScore >= 65 ? "#059669" : v.validationScore >= 40 ? "#d97706" : "#dc2626", padding: "4px 12px", borderRadius: 99, fontWeight: 700, fontSize: ".78rem" }}>
                          Score {v.validationScore}/100
                        </span>
                      )}
                      <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                        {v.status !== "approved" && (
                          <button className={styles.btnApprove} style={{ fontSize: ".8rem" }}
                            onClick={() => { updateVehicleStatus(v._id, "approved"); setPreviewVehicle(null); }}>✅ Valider</button>
                        )}
                        {v.status !== "rejected" && (
                          <button className={styles.btnReject} style={{ fontSize: ".8rem" }}
                            onClick={() => { setRejectModal({ vid: v._id, name: v.title }); setRejectReason(""); setPreviewVehicle(null); }}>✕ Rejeter</button>
                        )}
                      </div>
                    </div>

                    {/* Galerie photos */}
                    {imgs.length > 0 ? (
                      <div>
                        <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#0f1b3f", height: 280 }}>
                          <img src={imgs[previewImgIdx]} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                          {imgs.length > 1 && (
                            <>
                              <button onClick={() => setPreviewImgIdx(i => (i - 1 + imgs.length) % imgs.length)}
                                style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,.5)", color: "#fff", border: "none", borderRadius: "50%", width: 36, height: 36, fontSize: "1.1rem", cursor: "pointer" }}>‹</button>
                              <button onClick={() => setPreviewImgIdx(i => (i + 1) % imgs.length)}
                                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,.5)", color: "#fff", border: "none", borderRadius: "50%", width: 36, height: 36, fontSize: "1.1rem", cursor: "pointer" }}>›</button>
                              <span style={{ position: "absolute", bottom: 10, right: 14, background: "rgba(0,0,0,.55)", color: "#fff", fontSize: ".75rem", padding: "2px 10px", borderRadius: 99 }}>{previewImgIdx + 1} / {imgs.length}</span>
                            </>
                          )}
                        </div>
                        {imgs.length > 1 && (
                          <div style={{ display: "flex", gap: 6, marginTop: 8, overflowX: "auto", paddingBottom: 4 }}>
                            {imgs.map((img, i) => (
                              <img key={i} src={img} alt="" loading="lazy" decoding="async" onClick={() => setPreviewImgIdx(i)}
                                style={{ width: 64, height: 48, objectFit: "cover", borderRadius: 6, cursor: "pointer", border: i === previewImgIdx ? "2.5px solid #2563eb" : "2px solid #e2e8f0", flexShrink: 0 }} />
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ height: 160, borderRadius: 12, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "3rem", color: "#cbd5e1" }}>🚗</div>
                    )}

                    {/* Deux colonnes : détails annonce + annonceur */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

                      {/* ── Détails de l'annonce ── */}
                      <div style={{ background: "#f8fafc", borderRadius: 12, padding: "16px 18px" }}>
                        <h3 style={{ margin: "0 0 14px", fontSize: ".9rem", fontWeight: 800, color: "#0f1b3f", borderBottom: "1.5px solid #e2e8f0", paddingBottom: 8 }}>🚗 Détails de l'annonce</h3>
                        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                          <h4 style={{ margin: "0 0 4px", fontSize: "1rem", fontWeight: 900, color: "#0f1b3f" }}>{v.title}</h4>
                          {[
                            ["Type", v.type === "location" ? "📅 Location" : "💰 Vente"],
                            ["Catégorie", v.vehicleType],
                            ["Marque / Modèle", [v.marque, v.modele].filter(Boolean).join(" ") || "—"],
                            ["Année", v.annee],
                            ["Couleur", v.couleur],
                            ["Kilométrage", v.kilometrage != null ? `${Number(v.kilometrage).toLocaleString("fr-FR")} km` : "—"],
                            ["État", v.etat],
                            ["Carburant", v.carburant],
                            ["Transmission", v.transmission],
                            ["Places", v.nombrePlaces],
                            ["Portes", v.nombrePortes],
                            ["Climatisation", v.climatisation ? "✅ Oui" : "❌ Non"],
                            ["Avec chauffeur", v.withDriver ? "✅ Oui" : "Non"],
                            v.type === "location"
                              ? ["Prix / jour", v.pricePerDay ? (v.currency ? fmtPinned(v.pricePerDay, v.currency) : fmtUSD(v.pricePerDay)) : "—"]
                              : ["Prix vente", v.priceForSale ? (v.currency ? fmtPinned(v.priceForSale, v.currency) : fmtUSD(v.priceForSale)) : "—"],
                            v.type === "location" && v.caution ? ["Caution", fmtUSD(v.caution)] : null,
                            ["Ville", v.ville || "—"],
                            ["Adresse", v.adresse || "—"],
                            ["Âge min", v.ageMin ? `${v.ageMin} ans` : "—"],
                            ["Vues", v.vues || 0],
                            ["Note moy.", v.noteMoyenne ? `${v.noteMoyenne}/5 (${v.nombreAvis} avis)` : "—"],
                            ["Publié le", v.createdAt ? new Date(v.createdAt).toLocaleDateString("fr-FR") : "—"],
                          ].filter(Boolean).map(([k, val]) => val != null && val !== "—" && (
                            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: ".82rem", gap: 8 }}>
                              <span style={{ color: "#64748b", flexShrink: 0 }}>{k}</span>
                              <span style={{ fontWeight: 600, color: "#0f1b3f", textAlign: "right" }}>{val}</span>
                            </div>
                          ))}
                        </div>
                        {v.leasing?.disponible && (
                          <div style={{ marginTop: 10, padding: "8px 12px", background: "#ede9fe", borderRadius: 8 }}>
                            <div style={{ fontSize: ".78rem", fontWeight: 800, color: "#6d28d9", marginBottom: 4 }}>🏦 Leasing disponible</div>
                            <div style={{ fontSize: ".78rem", color: "#4c1d95" }}>Apport : {fmtUSD(v.leasing.apportInitial)} • {v.leasing.mensualite && `${fmtUSD(v.leasing.mensualite)}/mois`} • {v.leasing.duree} mois • {v.leasing.tauxInteret}%</div>
                          </div>
                        )}
                      </div>

                      {/* ── Détails de l'annonceur ── */}
                      <div style={{ background: "#f8fafc", borderRadius: 12, padding: "16px 18px" }}>
                        <h3 style={{ margin: "0 0 14px", fontSize: ".9rem", fontWeight: 800, color: "#0f1b3f", borderBottom: "1.5px solid #e2e8f0", paddingBottom: 8 }}>👤 Annonceur</h3>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                          {o.profilePhoto
                            ? <img src={o.profilePhoto} alt="" loading="lazy" decoding="async" style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", border: "3px solid #e2e8f0" }} />
                            : <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem" }}>👤</div>}
                          <div>
                            <div style={{ fontWeight: 800, fontSize: ".95rem", color: "#0f1b3f" }}>{o.firstName} {o.lastName}</div>
                            <div style={{ fontSize: ".78rem", color: "#64748b" }}>{o.role || "partenaire"}</div>
                            {o.certificationBadge && <span style={{ fontSize: ".72rem", background: "#fef3c7", color: "#d97706", padding: "1px 8px", borderRadius: 99, fontWeight: 700 }}>🏆 {o.certificationBadge}</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                          {[
                            ["Email", o.email],
                            ["Téléphone", o.phone],
                            ["Ville", o.ville],
                            ["Statut compte", o.isActive === false ? "🚫 Bloqué" : "✅ Actif"],
                            ["Membre depuis", o.createdAt ? new Date(o.createdAt).toLocaleDateString("fr-FR") : "—"],
                          ].filter(([, val]) => val).map(([k, val]) => (
                            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: ".82rem", gap: 8 }}>
                              <span style={{ color: "#64748b", flexShrink: 0 }}>{k}</span>
                              <span style={{ fontWeight: 600, color: "#0f1b3f", textAlign: "right" }}>{val}</span>
                            </div>
                          ))}
                          {o.kycStatus && (
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".82rem" }}>
                              <span style={{ color: "#64748b" }}>KYC</span>
                              <span style={{ fontWeight: 700, color: kycC }}>{o.kycStatus === "VERIFIE" ? "✅ Vérifié" : o.kycStatus === "REFUSE" ? "❌ Refusé" : o.kycStatus === "EN_ATTENTE" ? "⏳ En attente" : "🔄 En révision"}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Description */}
                    {v.description && (
                      <div style={{ background: "#f8fafc", borderRadius: 12, padding: "14px 18px" }}>
                        <h3 style={{ margin: "0 0 8px", fontSize: ".85rem", fontWeight: 800, color: "#0f1b3f" }}>📝 Description</h3>
                        <p style={{ margin: 0, fontSize: ".85rem", color: "#475569", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{v.description}</p>
                      </div>
                    )}

                    {/* Erreurs / avertissements de validation */}
                    {(v.validationErrors?.length > 0 || v.validationWarnings?.length > 0) && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {v.validationErrors?.length > 0 && (
                          <div style={{ background: "#fff1f2", border: "1.5px solid #fca5a5", borderRadius: 10, padding: "12px 16px" }}>
                            <div style={{ fontWeight: 800, fontSize: ".82rem", color: "#dc2626", marginBottom: 6 }}>❌ Erreurs de validation</div>
                            {v.validationErrors.map((e, i) => <div key={i} style={{ fontSize: ".8rem", color: "#b91c1c" }}>• {e}</div>)}
                          </div>
                        )}
                        {v.validationWarnings?.length > 0 && (
                          <div style={{ background: "#fffbeb", border: "1.5px solid #fde68a", borderRadius: 10, padding: "12px 16px" }}>
                            <div style={{ fontWeight: 800, fontSize: ".82rem", color: "#d97706", marginBottom: 6 }}>⚠️ Avertissements</div>
                            {v.validationWarnings.map((w, i) => <div key={i} style={{ fontSize: ".8rem", color: "#92400e" }}>• {w}</div>)}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Raison de rejet */}
                    {v.rejectionReason && (
                      <div style={{ background: "#fff1f2", border: "1.5px solid #fca5a5", borderRadius: 10, padding: "12px 16px" }}>
                        <div style={{ fontWeight: 800, fontSize: ".82rem", color: "#dc2626", marginBottom: 4 }}>💬 Raison du rejet</div>
                        <p style={{ margin: 0, fontSize: ".85rem", color: "#b91c1c" }}>{v.rejectionReason}</p>
                      </div>
                    )}

                  </div>
                );
              })() : null}
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL ÉDITION COMPLÈTE (admin) ══ */}
      {editVehicle && (
        <div className={styles.overlay} onClick={() => { setEditVehicle(null); setEditForm(null); setEditPhotos([]); }}
          style={{ alignItems: "flex-start", paddingTop: "2vh", overflowY: "auto" }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 16, width: "min(680px, 96vw)", maxHeight: "95dvh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,.22)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px 14px", borderBottom: "1.5px solid #e2e8f0", flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 900, color: "#0f1b3f" }}>✏️ Modifier l'annonce (admin)</h2>
              <button onClick={() => { setEditVehicle(null); setEditForm(null); setEditPhotos([]); }}
                style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 34, height: 34, fontSize: "1.1rem", cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ overflowY: "auto", padding: "20px 24px 24px", flex: 1 }}>
              {editLoading || !editForm ? (
                <p style={{ textAlign: "center", color: "#94a3b8", padding: "2rem 0" }}>Chargement…</p>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                    {[{ v: "location", l: "🔑 Location" }, { v: "vente", l: "💰 Vente" }].map((o) => (
                      <button key={o.v} type="button" onClick={() => { setExportMode(false); setEditForm((p) => ({ ...p, type: o.v })); }}
                        style={{ flex: 1, padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: ".85rem",
                          border: !exportMode && editForm.type === o.v ? "2px solid #7c3aed" : "1.5px solid #e2e8f0",
                          background: !exportMode && editForm.type === o.v ? "rgba(124,58,237,.08)" : "#fff",
                          color: !exportMode && editForm.type === o.v ? "#7c3aed" : "#475569" }}>
                        {o.l}
                      </button>
                    ))}
                    <button type="button" onClick={() => setExportMode(true)}
                      style={{ flex: 1, padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: ".85rem",
                        border: exportMode ? "2px solid #6366f1" : "1.5px solid #e2e8f0",
                        background: exportMode ? "rgba(99,102,241,.08)" : "#fff",
                        color: exportMode ? "#6366f1" : "#475569" }}>
                      🌍 Exportation
                    </button>
                  </div>

                  {exportMode && (
                    <div style={{ marginBottom: 16, padding: 14, background: "#f8fafc", borderRadius: 10, border: "1.5px solid #e2e8f0" }}>
                      <p style={{ fontSize: ".8rem", color: "#475569", margin: "0 0 12px" }}>
                        Cette annonce sera transformée en <strong>annonce Import/Export</strong> (soumise à modération) et l'annonce {editForm.type === "vente" ? "vente" : "location"} actuelle sera archivée.
                      </p>
                      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Prix d'export *</label>
                          <input type="number" min="0" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                            value={exportForm.price} onChange={(e) => setExportForm((p) => ({ ...p, price: e.target.value }))} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Devise</label>
                          <select style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                            value={exportForm.currency} onChange={(e) => setExportForm((p) => ({ ...p, currency: e.target.value }))}>
                            {IE_CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                          </select>
                        </div>
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Pays de destination *</label>
                        <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                          <input list="dl-export-avail-admin" style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                            value={exportAvailText} onChange={(e) => setExportAvailText(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addExportAvail())}
                            placeholder="Côte d'Ivoire, Sénégal…" />
                          <datalist id="dl-export-avail-admin">{COUNTRIES_ALL.map((c) => <option key={c} value={c} />)}</datalist>
                          <button type="button" onClick={addExportAvail}
                            style={{ padding: "8px 14px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>+</button>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {exportForm.availableIn.map((c) => (
                            <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(99,102,241,.1)", color: "#6366f1", borderRadius: 99, padding: "3px 10px", fontSize: ".78rem", fontWeight: 600 }}>
                              {getCountryFlag(c)} {c}
                              <button onClick={() => setExportForm((p) => ({ ...p, availableIn: p.availableIn.filter((x) => x !== c) }))}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "#6366f1", padding: 0, lineHeight: 1 }}>×</button>
                            </span>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 10 }}>
                        <button onClick={handleConvertToExport} disabled={exportSaving} className={styles.btnApprove} style={{ fontSize: ".85rem", padding: "8px 18px" }}>
                          {exportSaving ? "Conversion…" : "🌍 Transformer en annonce Export"}
                        </button>
                        <button onClick={() => setExportMode(false)} className={styles.btnGhost} style={{ fontSize: ".85rem", padding: "8px 18px" }}>Annuler</button>
                      </div>
                    </div>
                  )}

                  {!exportMode && (<>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 6 }}>Photos ({editPhotos.length}/6)</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {editPhotos.map((p) => (
                        <div key={p.id} style={{ position: "relative", width: 68, height: 68 }}>
                          <img src={p.preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }} />
                          <button type="button" onClick={() => removeEditPhotoAdmin(p.id)}
                            style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", border: "none", background: "#dc2626", color: "#fff", cursor: "pointer", fontSize: ".7rem" }}>✕</button>
                        </div>
                      ))}
                      {editPhotos.length < 6 && (
                        <label style={{ width: 68, height: 68, border: "1.5px dashed #cbd5e1", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: "1.3rem", color: "#94a3b8" }}>
                          +<input type="file" accept="image/*" multiple hidden onChange={(e) => addEditPhotosAdmin(e.target.files)} />
                        </label>
                      )}
                    </div>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Titre</label>
                    <input type="text" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                      value={editForm.title} onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))} />
                  </div>

                  <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Marque</label>
                      <input type="text" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                        value={editForm.marque} onChange={(e) => setEditForm((p) => ({ ...p, marque: e.target.value }))} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Modèle</label>
                      <input type="text" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                        value={editForm.modele} onChange={(e) => setEditForm((p) => ({ ...p, modele: e.target.value }))} />
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Année</label>
                      <select style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                        value={editForm.annee} onChange={(e) => setEditForm((p) => ({ ...p, annee: e.target.value }))}>
                        {Array.from({ length: 30 }, (_, i) => new Date().getFullYear() - i).map((y) => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>État</label>
                      <select style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                        value={editForm.etat} onChange={(e) => setEditForm((p) => ({ ...p, etat: e.target.value }))}>
                        {["Neuf", "Comme neuf", "Bon état", "À réparer"].map((e_) => <option key={e_} value={e_}>{e_}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Couleur</label>
                      <input type="text" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                        value={editForm.couleur} onChange={(e) => setEditForm((p) => ({ ...p, couleur: e.target.value }))} />
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 140px" }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Type de véhicule</label>
                      <select style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                        value={editForm.vehicleType} onChange={(e) => setEditForm((p) => ({ ...p, vehicleType: e.target.value }))}>
                        {["SUV", "Berline", "Sportif", "Citadine", "Monospace", "Pick-up", "Cabriolet", "Utilitaire"].map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: "1 1 140px" }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Carburant</label>
                      <select style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                        value={editForm.carburant} onChange={(e) => setEditForm((p) => ({ ...p, carburant: e.target.value }))}>
                        {["Essence", "Diesel", "Hybride", "Électrique", "GPL"].map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: "1 1 140px" }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Transmission</label>
                      <select style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                        value={editForm.transmission} onChange={(e) => setEditForm((p) => ({ ...p, transmission: e.target.value }))}>
                        {["Automatique", "Manuelle"].map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Places</label>
                      <input type="number" min="1" max="20" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                        value={editForm.nombrePlaces} onChange={(e) => setEditForm((p) => ({ ...p, nombrePlaces: e.target.value }))} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Portes</label>
                      <input type="number" min="2" max="6" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                        value={editForm.nombrePortes} onChange={(e) => setEditForm((p) => ({ ...p, nombrePortes: e.target.value }))} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Kilométrage</label>
                      <input type="number" min="0" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                        value={editForm.kilometrage} onChange={(e) => setEditForm((p) => ({ ...p, kilometrage: e.target.value }))} />
                    </div>
                  </div>

                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: ".85rem", marginBottom: 12 }}>
                    <input type="checkbox" checked={editForm.climatisation} onChange={(e) => setEditForm((p) => ({ ...p, climatisation: e.target.checked }))} />
                    ❄️ Climatisation
                  </label>

                  <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>
                        {editForm.type === "vente" ? "Prix de vente" : "Prix / jour"}
                      </label>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input type="number" min="0" style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                          value={editForm.type === "vente" ? editPriceEntryForSale : editPriceEntryPerDay}
                          onChange={(e) => handleEditPriceEntryChange(editForm.type === "vente" ? "priceForSale" : "pricePerDay", e.target.value)} />
                        <select style={{ width: "auto", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                          value={editPriceCurrency} onChange={(e) => handleEditPriceCurrencyChange(e.target.value)}>
                          {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                        </select>
                      </div>
                      {editPriceCurrency !== "USD" && (
                        <span style={{ fontSize: ".75rem", color: "#94a3b8" }}>
                          ≈ {Number((editForm.type === "vente" ? editForm.priceForSale : editForm.pricePerDay) || 0).toLocaleString("fr-FR")} USD (converti automatiquement)
                        </span>
                      )}
                    </div>
                    {editForm.type !== "vente" && (
                      <div style={{ flex: 1 }}>
                        <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Caution</label>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input type="number" min="0" style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                            value={editCautionEntry} onChange={(e) => handleEditPriceEntryChange("caution", e.target.value)} />
                          <span style={{ display: "flex", alignItems: "center", padding: "0 8px", fontSize: ".82rem", color: "#64748b" }}>{editPriceCurrency}</span>
                        </div>
                        {editPriceCurrency !== "USD" && (
                          <span style={{ fontSize: ".75rem", color: "#94a3b8" }}>≈ {Number(editForm.caution || 0).toLocaleString("fr-FR")} USD (converti automatiquement)</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Devise d'affichage de l'annonce</label>
                    <select style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                      value={editForm.currency || ""} onChange={(e) => setEditForm((p) => ({ ...p, currency: e.target.value }))}>
                      <option value="">Automatique (devise du visiteur)</option>
                      {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                    </select>
                    <span style={{ fontSize: ".75rem", color: "#94a3b8" }}>
                      {editForm.currency
                        ? `Tous les visiteurs verront le prix en ${editForm.currency}, quel que soit leur pays.`
                        : "Par défaut : chaque visiteur voit le prix converti dans sa propre devise détectée."}
                    </span>
                  </div>

                  {editForm.type !== "vente" && (
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Durée de location proposée</label>
                      <select style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                        value={editForm.rentalDurationType} onChange={(e) => setEditForm((p) => ({ ...p, rentalDurationType: e.target.value }))}>
                        <option value="les_deux">Courte et longue durée</option>
                        <option value="courte">Courte durée uniquement</option>
                        <option value="longue">Longue durée uniquement</option>
                      </select>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Pays</label>
                      <select style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                        value={editForm.country} onChange={(e) => setEditForm((p) => ({ ...p, country: e.target.value }))}>
                        <option value="">— Non précisé —</option>
                        {COUNTRIES_CONFIG.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Ville</label>
                      <input type="text" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                        value={editForm.ville} onChange={(e) => setEditForm((p) => ({ ...p, ville: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Adresse</label>
                    <input type="text" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                      value={editForm.adresse} onChange={(e) => setEditForm((p) => ({ ...p, adresse: e.target.value }))} />
                  </div>

                  {/* Bug réel corrigé (audit) : contactNom/contactTel sont saisis
                      une seule fois à la publication (identity.telephone, voir
                      VendorSubmit.jsx) et n'apparaissaient ensuite NULLE PART en
                      édition, même côté admin — aucun moyen de corriger un
                      numéro faux ou obsolète, alors que le backend l'accepte
                      déjà (EDITABLE, vehicleController.updateVehicle). */}
                  <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Nom du contact</label>
                      <input type="text" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                        value={editForm.contactNom} onChange={(e) => setEditForm((p) => ({ ...p, contactNom: e.target.value }))} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Téléphone du contact</label>
                      <input type="tel" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                        value={editForm.contactTel} onChange={(e) => setEditForm((p) => ({ ...p, contactTel: e.target.value }))} />
                    </div>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Description</label>
                    <textarea rows={3} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem", resize: "vertical" }}
                      value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} />
                  </div>

                  {editForm.type !== "vente" && (
                    <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Âge minimum requis</label>
                        <input type="number" min="0" style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                          value={editForm.ageMin} onChange={(e) => setEditForm((p) => ({ ...p, ageMin: e.target.value }))} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Durée minimale de location (jours)</label>
                        <input type="number" min="1" max="30" style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                          value={editForm.dureeMinLocation} onChange={(e) => setEditForm((p) => ({ ...p, dureeMinLocation: e.target.value }))} />
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                    {editForm.type !== "vente" && (
                      <>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: ".85rem" }}>
                          <input type="checkbox" checked={editForm.permisRequis} onChange={(e) => setEditForm((p) => ({ ...p, permisRequis: e.target.checked }))} />
                          Permis de conduire requis
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: ".85rem" }}>
                          <input type="checkbox" checked={editForm.assuranceOptionnelle} onChange={(e) => setEditForm((p) => ({ ...p, assuranceOptionnelle: e.target.checked }))} />
                          Assurance optionnelle proposée
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: ".85rem" }}>
                          <input type="checkbox" checked={editForm.withDriver} onChange={(e) => setEditForm((p) => ({ ...p, withDriver: e.target.checked }))} />
                          Disponible avec chauffeur
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: ".85rem" }} title="Re-vérifié côté serveur : sans effet si le partenaire propriétaire n'est pas certifié/Founding Partner">
                          <input type="checkbox" checked={editForm.instantBook} onChange={(e) => setEditForm((p) => ({ ...p, instantBook: e.target.checked }))} />
                          ⚡ Réservation instantanée
                        </label>
                      </>
                    )}
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: ".85rem", fontWeight: 700 }}>
                      <input type="checkbox" checked={editForm.available} onChange={(e) => setEditForm((p) => ({ ...p, available: e.target.checked }))} />
                      Annonce disponible (visible au catalogue)
                    </label>
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={handleSaveEditVehicle} disabled={editSaving} className={styles.btnApprove} style={{ fontSize: ".85rem", padding: "8px 18px" }}>
                      {editSaving ? "Envoi…" : "✅ Enregistrer"}
                    </button>
                    <button onClick={() => { setEditVehicle(null); setEditForm(null); setEditPhotos([]); }} className={styles.btnGhost} style={{ fontSize: ".85rem", padding: "8px 18px" }}>
                      Annuler
                    </button>
                  </div>
                  </>)}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {seasonalModal && (
        <div className={styles.modalBackdrop} onClick={() => setSeasonalModal(null)}>
          <div className={styles.rejectModal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <h3>🗓️ Tarifs saisonniers — {seasonalModal.title || seasonalModal.name}</h3>
            <p style={{ margin: "0 0 14px", fontSize: "0.85rem", color: "#64748b" }}>
              Périodes de l'année (récurrentes chaque année) où un prix/jour différent s'applique automatiquement.
              Le prix normal du véhicule reste appliqué en dehors de ces périodes.
            </p>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Devise de saisie</label>
              <select className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px", width: "100%" }}
                value={seasonalCurrency} onChange={(e) => setSeasonalCurrency(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
              </select>
            </div>

            {seasonalRules.length === 0 && (
              <p style={{ fontSize: "0.85rem", color: "#94a3b8", margin: "0 0 14px" }}>Aucune période saisonnière configurée pour ce véhicule.</p>
            )}

            {seasonalRules.map((rule, i) => (
              <div key={i} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, cursor: "pointer" }}>
                    <input type="checkbox" checked={rule.active}
                      onChange={(e) => updateSeasonalRule(i, { active: e.target.checked })} />
                    Période {i + 1} active
                  </label>
                  <button type="button" className={styles.btnDanger} style={{ padding: "3px 10px", fontSize: "0.78rem" }}
                    onClick={() => removeSeasonalRule(i)}>Supprimer</button>
                </div>

                <div style={{ marginBottom: 10 }}>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Libellé</label>
                  <input type="text" placeholder="Ex : Haute saison" className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px" }}
                    value={rule.label}
                    onChange={(e) => updateSeasonalRule(i, { label: e.target.value })} />
                </div>

                <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-end" }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Du (jour/mois)</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input type="number" min="1" max="31" placeholder="Jour" className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 10px", width: "50%" }}
                        value={rule.startDay} onChange={(e) => updateSeasonalRule(i, { startDay: e.target.value })} />
                      <select className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 10px", width: "50%" }}
                        value={rule.startMonth} onChange={(e) => updateSeasonalRule(i, { startMonth: e.target.value })}>
                        {MOIS_LONGS.map((m, idx) => <option key={idx} value={idx + 1}>{m}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Au (jour/mois)</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input type="number" min="1" max="31" placeholder="Jour" className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 10px", width: "50%" }}
                        value={rule.endDay} onChange={(e) => updateSeasonalRule(i, { endDay: e.target.value })} />
                      <select className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 10px", width: "50%" }}
                        value={rule.endMonth} onChange={(e) => updateSeasonalRule(i, { endMonth: e.target.value })}>
                        {MOIS_LONGS.map((m, idx) => <option key={idx} value={idx + 1}>{m}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Prix/jour pendant cette période ({seasonalCurrency})</label>
                  <input type="number" min="0" step="0.01" className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px" }}
                    value={rule.price}
                    onChange={(e) => updateSeasonalRule(i, { price: e.target.value })} />
                </div>
              </div>
            ))}

            <button type="button" className={styles.btnSecondary} style={{ marginBottom: 14 }} onClick={addSeasonalRule}>
              ➕ Ajouter une période
            </button>

            <div className={styles.rejectActions}>
              <button className={styles.btnAccept} onClick={handleSaveSeasonal} disabled={seasonalSaving}>
                {seasonalSaving ? "Envoi…" : "✅ Enregistrer"}
              </button>
              <button className={styles.btnSecondary} onClick={() => setSeasonalModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
