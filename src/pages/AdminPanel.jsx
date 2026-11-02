import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { pointsToUSD } from "../constants/loyalty";
import { useSocket } from "../context/SocketContext";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import styles from "./AdminPanel.module.css";
import { ListingForm as IEListingEditForm } from "./ImporterDashboard";
import { COUNTRIES_ALL, CURRENCIES as IE_CURRENCIES } from "../data/autocomplete";
import { INCOTERMS as IE_LISTING_INCOTERMS } from "../constants/incoterms";
import { PARTNER_CANCEL_REASONS } from "../constants/bookingCancelReasons";
import { ACTIVITY_TYPE_LABELS } from "../constants/activityTypes";
import { downloadAuthFile } from "../utils/downloadAuthFile";
import AdminSalesLeads from "../components/AdminSalesLeads/AdminSalesLeads";
import { ADMIN_SCOPE_CFG, Badge, CERTIF_CFG, ConfirmModal, CountryFlag, KYC_CFG, MOIS, MiniBar, PLAN_TIER_LABELS, Pagination, ROLE_CONFIG, STATUS_BK, StatCard, WipSection, fmtDate, safeHref, safeImgHref } from "./admin/shared.jsx";
import { CertLevelDocs, FoundingDocs, FoundingBusinessInfo } from "./admin/sections/FoundingDocs.jsx";
import { AnalyticsSection } from "./admin/sections/AnalyticsSection.jsx";
import { ClientDocuments, ClientDocumentsModal } from "./admin/sections/ClientDocuments.jsx";
import { PendingIdentitiesSection } from "./admin/sections/PendingIdentitiesSection.jsx";
import { RentalPolicySection } from "./admin/sections/RentalPolicySection.jsx";
import { LogisticsAssignmentSection, TransportSection, EscrowSection } from "./admin/sections/ImportExportSections.jsx";
import { FinancingSection } from "./admin/sections/FinancingSection.jsx";
import { RolesSection } from "./admin/sections/RolesSection.jsx";
import { AdsSection } from "./admin/sections/AdsSection.jsx";
import { InsuranceSection } from "./admin/sections/InsuranceSection.jsx";
import { PartsSection } from "./admin/sections/PartsSection.jsx";
import { MaintenanceSection } from "./admin/sections/MaintenanceSection.jsx";
import { PaymentsSection } from "./admin/sections/PaymentsSection.jsx";
import { ServiceRequestsSection } from "./admin/sections/ServiceRequestsSection.jsx";
import { PartnerVerifSection } from "./admin/sections/PartnerVerifSection.jsx";
import { SectorRequestsSection } from "./admin/sections/SectorRequestsSection.jsx";
import { DossiersImportSection } from "./admin/sections/DossiersImportSection.jsx";
import { ZoneTransitSection } from "./admin/sections/ZoneTransitSection.jsx";
import { LogistiqueSection } from "./admin/sections/LogistiqueSection.jsx";
import { ReclamationsIESection } from "./admin/sections/ReclamationsIESection.jsx";
import { DirectionSection } from "./admin/sections/DirectionSection.jsx";
import { CatalogueSection } from "./admin/sections/CatalogueSection.jsx";
import { MarketingSection } from "./admin/sections/MarketingSection.jsx";
import { BadgeActivation, ProchaineAction, BlocActivation, BlocDoublons, JournalEchanges, Abandon } from "./admin/sections/CrmSuivi.jsx";
import NotificationsSection from "./admin/sections/NotificationsSection.jsx";
import SanteSystemeSection from "./admin/sections/SanteSystemeSection.jsx";
import AuditLogsSection from "./admin/sections/AuditLogsSection.jsx";
import ContratsSection from "./admin/sections/ContratsSection.jsx";
import ReversementsSection from "./admin/sections/ReversementsSection.jsx";
import EmailsSection from "./admin/sections/EmailsSection.jsx";
import SignalementsSection from "./admin/sections/SignalementsSection.jsx";
import AvisSection from "./admin/sections/AvisSection.jsx";
import SupervisionChatsSection from "./admin/sections/SupervisionChatsSection.jsx";
import CommissionsSection from "./admin/sections/CommissionsSection.jsx";
import AssistanceSection from "./admin/sections/AssistanceSection.jsx";
import DemandesAValiderSection from "./admin/sections/DemandesAValiderSection.jsx";
import CoutsImportSection from "./admin/sections/CoutsImportSection.jsx";
import LitigesSection from "./admin/sections/LitigesSection.jsx";
import WhatsappSection from "./admin/sections/WhatsappSection.jsx";
import PaiementsSection from "./admin/sections/PaiementsSection.jsx";
import SupportSection from "./admin/sections/SupportSection.jsx";
import ChauffeursSection from "./admin/sections/ChauffeursSection.jsx";
import ComptesSection from "./admin/sections/ComptesSection.jsx";
import VueEnsembleSection from "./admin/sections/VueEnsembleSection.jsx";
import PmsPartnersSection from "./admin/sections/PmsPartnersSection.jsx";
import TransactionsIESection from "./admin/sections/TransactionsIESection.jsx";
import ActivitesSection from "./admin/sections/ActivitesSection.jsx";
import ReservationsSection from "./admin/sections/ReservationsSection.jsx";
import ExportateursSection from "./admin/sections/ExportateursSection.jsx";
import FacturesSection from "./admin/sections/FacturesSection.jsx";
import CertificationSection from "./admin/sections/CertificationSection.jsx";
import KycSection from "./admin/sections/KycSection.jsx";
import BusinessConfigSection from "./admin/sections/BusinessConfigSection.jsx";
import useConfigurationMetier from "./admin/hooks/useConfigurationMetier.js";
import useImportExportAdmin from "./admin/hooks/useImportExportAdmin.js";
import useAbonnementsAValider from "./admin/hooks/useAbonnementsAValider.js";
import useCommissionsFactures from "./admin/hooks/useCommissionsFactures.js";
import useSignalements from "./admin/hooks/useSignalements.js";
import useVerificationPartenaires from "./admin/hooks/useVerificationPartenaires.js";
import useCrmPartenaires from "./admin/hooks/useCrmPartenaires.js";
import useFoundingPartners from "./admin/hooks/useFoundingPartners.js";
import usePartnerHub from "./admin/hooks/usePartnerHub.js";
import useCertifications from "./admin/hooks/useCertifications.js";
import useKycAdmin from "./admin/hooks/useKycAdmin.js";
import useSupervisionChats from "./admin/hooks/useSupervisionChats.js";
import useDemandesAValider from "./admin/hooks/useDemandesAValider.js";
import useSupportClient from "./admin/hooks/useSupportClient.js";
import useWhatsapp from "./admin/hooks/useWhatsapp.js";
import useAssistance from "./admin/hooks/useAssistance.js";
import useJournalAudit from "./admin/hooks/useJournalAudit.js";
import useContrats from "./admin/hooks/useContrats.js";
import useCoutsImport from "./admin/hooks/useCoutsImport.js";
import useAutresServices from "./admin/hooks/useAutresServices.js";
import useAssurance from "./admin/hooks/useAssurance.js";
import useReversements from "./admin/hooks/useReversements.js";
import usePublicites from "./admin/hooks/usePublicites.js";
import useRoles from "./admin/hooks/useRoles.js";
import useFinancement from "./admin/hooks/useFinancement.js";
import useEmailsLivraison from "./admin/hooks/useEmailsLivraison.js";
import useAnalytics from "./admin/hooks/useAnalytics.js";
import useSanteSysteme from "./admin/hooks/useSanteSysteme.js";
import useModerationAvis from "./admin/hooks/useModerationAvis.js";

// CRM partenaires : taille de page côté serveur (adminList plafonne à 200).
const CRM_PAR_PAGE = 50;
import { lienPublic } from "../utils/origineApi.js";
import VitrinePartage from "../components/VitrinePartage/VitrinePartage.jsx";
import { avecStatutAffiche } from "../utils/contestation";

// ═══════════════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
export default function AdminPanel() {
  const { user, isAuthenticated, token, logout } = useAuth();
  const { COUNTRIES_CONFIG, fmtUSD } = useCurrency();
  const { on: onSocket } = useSocket();
  const navigate = useNavigate();

  // ── En-têtes API ────────────────────────────────────────────────────────────
  // DÉFINI ICI, TOUT EN HAUT, ET PAS AILLEURS. Cette constante vivait ~550
  // lignes plus bas alors qu'un `useCallback` la citait déjà dans son tableau de
  // dépendances (`}, [headers])`, plus haut dans le composant. Or un tableau de
  // dépendances est évalué À CHAQUE RENDU, pas au moment où la fonction est
  // appelée : lire `headers` avant sa déclaration `const` levait donc une erreur
  // de zone morte temporelle — « Cannot access 'headers' before initialization »
  // — à la toute première ligne de rendu du panneau. Résultat en production :
  // l'administration entière tombait sur l'écran « Une erreur s'est produite »,
  // sans qu'aucune donnée ni permission soit en cause.
  //
  // Le corps d'un callback peut citer une constante déclarée plus bas (il ne
  // s'exécute qu'après le rendu) ; un tableau de dépendances, jamais. En la
  // plaçant avant tout le reste, les deux cas sont couverts définitivement.
  const headers = useMemo(() => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  }), [token]);

  // Les notifications et e-mails admin pointent vers /admin?tab=reports,
  // ?tab=whatsapp, ?tab=drivers… mais ce paramètre n'était lu nulle part :
  // l'admin qui cliquait « Voir dans l'admin → » atterrissait toujours sur le
  // tableau de bord. Tout le flux d'escalade reposait sur un lien inerte.
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab]   = useState(() => searchParams.get("tab") || "dashboard");
  // Demandes d'ajout de secteur en attente — compteur remonté par l'onglet lui-même.
  const [secteursPending, setSecteursPending] = useState(0);

  // Suit les changements d'URL ultérieurs (clic sur une notification alors que
  // le panneau est déjà ouvert).
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && tab !== activeTab) setActiveTab(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Sens inverse : l'onglet courant reste dans l'URL, pour que le lien soit
  // partageable et que le bouton « retour » du navigateur fonctionne.
  useEffect(() => {
    if (searchParams.get("tab") === activeTab) return;
    const next = new URLSearchParams(searchParams);
    if (activeTab === "dashboard") next.delete("tab"); else next.set("tab", activeTab);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 900);
  // Filtre du menu latéral (50 onglets) : saisie libre, accents ignorés.
  const [filtreMenu, setFiltreMenu] = useState("");
  const isMobile = useRef(window.innerWidth <= 900);

  // Détecter le passage mobile/desktop et adapter la sidebar
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const handler = (e) => {
      isMobile.current = e.matches;
      setSidebarOpen(!e.matches);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);











  const [importerProfiles, setImporterProfiles] = useState([]);
  const [importerListings, setImporterListings] = useState([]);
  const [importerListingsTotal, setImporterListingsTotal] = useState(0);
  // Bug réel corrigé (audit) : plafond fixe à 100 (comme pour les véhicules
  // avant correctif) — 211 annonces Import/Export réelles en base au moment
  // de l'audit, toutes "pending", dont 111 invisibles ici. Défaut au plafond
  // admin réel du backend (getAdminListings maxLimit=500) au lieu de 100.
  const [importerListingsLimit, setImporterListingsLimit] = useState(500);
  const [importerLoading,  setImporterLoading]  = useState(false);
  // "" = Tous (par défaut) — un défaut sur "pending" cachait silencieusement les
  // dossiers déjà vérifiés/refusés dès l'ouverture de l'onglet (voir loadImporters).
  const [importerFilter,   setImporterFilter]   = useState("");
  const [listingFilter,    setListingFilter]     = useState("");
  const [editingIeListing, setEditingIeListing]  = useState(null); // annonce complète en édition (admin)
  // importerProfiles/importerListings contiennent TOUJOURS tous les statuts
  // (voir loadImporters) — le filtre ne s'applique qu'à l'affichage du tableau,
  // jamais aux KPI (Total/Vérifiés/Refusés...) qui doivent refléter la réalité
  // complète quel que soit le filtre actif.
  const filteredImporterProfiles = useMemo(
    () => importerFilter ? importerProfiles.filter((p) => p.status === importerFilter) : importerProfiles,
    [importerProfiles, importerFilter]
  );
  const [listingCountryFilter, setListingCountryFilter] = useState("");
  const [listingVilleFilter,   setListingVilleFilter]   = useState("");
  const filteredImporterListings = useMemo(
    () => importerListings
      .filter((l) => !listingFilter || l.status === listingFilter)
      .filter((l) => !listingCountryFilter || l.sourceCountry === listingCountryFilter)
      .filter((l) => !listingVilleFilter || l.sourceCity === listingVilleFilter),
    [importerListings, listingFilter, listingCountryFilter, listingVilleFilter]
  );
  const importerListingVilleOptions = useMemo(
    () => [...new Set(importerListings.map((l) => l.sourceCity).filter(Boolean))].sort(),
    [importerListings]
  );
  // sourceCountry est une saisie libre (pas un code ISO — voir ImporterDashboard.jsx
  // "Pays d'origine", placeholder "Émirats Arabes Unis"), donc pas de correspondance
  // possible avec COUNTRIES_CONFIG (codes ISO-2) : liste construite depuis les
  // valeurs distinctes réellement présentes, comme pour la ville.
  const importerListingCountryOptions = useMemo(
    () => [...new Set(importerListings.map((l) => l.sourceCountry).filter(Boolean))].sort(),
    [importerListings]
  );
  const [reviewModal,      setReviewModal]       = useState(null);
  const [reviewDecision,   setReviewDecision]    = useState({ status: "verified", rejectionReason: "", badgeLevel: "silver" });
  const [listingRejectModal, setListingRejectModal] = useState(null);
  const [listingRejectNote,  setListingRejectNote]  = useState("");
  const [exporterDetail,     setExporterDetail]     = useState(null);

  // Fidélité d'un client (solde, palier, mouvements) — aucune vue admin
  // n'existait, alors que 100 points = 1 USD de remise à la réservation
  // suivante. Lecture seule : voir loyaltyController.getUserLoyaltyAdmin.
  const [loyaltyModal,    setLoyaltyModal]    = useState(null);
  const [loyaltyData,     setLoyaltyData]     = useState(null);
  const [loyaltyLoading,  setLoyaltyLoading]  = useState(false);
  const VIDE_AJUST = { direction: "credit", points: "", reason: "", countsTowardTier: false };
  const [loyaltyForm,    setLoyaltyForm]    = useState(VIDE_AJUST);
  const [loyaltySaving,  setLoyaltySaving]  = useState(false);


  const [stats,     setStats]     = useState(null);
  const [users,     setUsers]     = useState([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersLimit, setUsersLimit] = useState(200);
  const [vehicles,  setVehicles]  = useState([]);
  const [vehiclesTotal, setVehiclesTotal] = useState(0);
  // Défaut au plafond admin réel du backend (getVehicles maxLimit=500, voir
  // vehicleController.js) plutôt que 200 : avec le volume actuel d'annonces,
  // 200 laissait déjà les plus anciennes invisibles dès le premier chargement,
  // sans même attendre un futur "Charger plus".
  const [vehiclesLimit, setVehiclesLimit] = useState(500);
  const [bookings,  setBookings]  = useState([]);
  const [bookingsTotal, setBookingsTotal] = useState(0);
  const [bookingsLimit, setBookingsLimit] = useState(200);
  const [drivers,   setDrivers]   = useState([]);
  const [activeDrivers, setActiveDrivers] = useState([]); // Driver.status==="approved" — remplace l'ancien filtre User.role==="chauffeur" (jamais assignable, voir Register.jsx)
  // Activités (section OTHERS — Quad, Surf, Montgolfière, Jetski, Jet privé,
  // Bateau...) — même principe que drivers/activeDrivers ci-dessus.
  const [pendingActivitiesList, setPendingActivitiesList] = useState([]);
  const [activeActivities, setActiveActivities] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [toast,     setToast]     = useState(null);

  // Bug réel corrigé (audit) : les badges "Annonces & Validations" et
  // "Litiges" ne se mettaient jamais à jour en temps réel — la clochette
  // générale (NotificationContext) reçoit bien le push socket
  // "notification_new" (notifyAdmins() côté serveur), mais rien dans
  // AdminPanel ne l'écoutait, forçant un rechargement manuel pour voir une
  // nouvelle annonce/un nouveau litige. Compteurs "live" ajoutés à l'affichage
  // sans re-fetch complet (évite un flash de chargement sur tout le panel) —
  // remis à zéro dès que loadAll() rafraîchit les vraies listes.
  const [liveNewListings, setLiveNewListings] = useState(0);
  const [liveDisputes,    setLiveDisputes]    = useState(0);




  // Filtres
  const [userSearch,  setUserSearch]  = useState("");
  const [userRole,    setUserRole]    = useState("all");
  const [userCountry, setUserCountry] = useState("all");
  const [bkStatus,    setBkStatus]    = useState("all");

  // Pagination
  const [userPage,  setUserPage]  = useState(1);
  const [bkPage,    setBkPage]    = useState(1);
  const PAGE_SIZE = 10;

  // Échecs du chargement des données admin, affichés au lieu d'être avalés
  // (voir loadAll) — une section vide et une section en échec ne doivent jamais
  // se ressembler.
  const [loadErrors, setLoadErrors] = useState([]);

  // Confirmation
  const [confirm, setConfirm] = useState(null);

  // Rejection reason (vehicles)
  const [rejectModal, setRejectModal] = useState(null); // { vid, name }
  const [rejectReason, setRejectReason] = useState("");

  // Rejection reason (drivers) — utilisé dans le modal + la section Validations
  const [driverRejectModal,  setDriverRejectModal]  = useState(null);
  const [driverRejectReason, setDriverRejectReason] = useState("");

  // Rejection reason (activités) — modal auto-contenu dans l'onglet dédié
  // (pas de dépendance sur CatalogueSection, contrairement à driverRejectModal
  // ci-dessus qui ne se rendait que si l'admin était sur l'onglet "catalogue").
  const [activityRejectModal,  setActivityRejectModal]  = useState(null);
  const [activityRejectReason, setActivityRejectReason] = useState("");

  // Transfert d'annonce activité vers un autre compte/entreprise/ville/pays —
  // même outil de support admin que CatalogueSection.transferModal (véhicule/
  // chauffeur), auto-contenu ici pour la même raison que activityRejectModal
  // ci-dessus (l'onglet "activites" n'est pas dans l'arbre de CatalogueSection).
  const [activityTransferModal,  setActivityTransferModal]  = useState(null); // { id, label }
  const [activityTransferForm,   setActivityTransferForm]   = useState({ ownerQuery: "", ownerResults: [], selectedOwner: null, country: "", ville: "", businessId: "" });
  const [activityTransferSaving, setActivityTransferSaving] = useState(false);

  const openActivityTransfer = (id, label, currentCountry, currentVille) => {
    setActivityTransferModal({ id, label });
    setActivityTransferForm({ ownerQuery: "", ownerResults: [], selectedOwner: null, country: currentCountry || "", ville: currentVille || "", businessId: "" });
  };

  const searchActivityTransferOwners = async (query) => {
    setActivityTransferForm((p) => ({ ...p, ownerQuery: query }));
    if (query.trim().length < 2) { setActivityTransferForm((p) => ({ ...p, ownerResults: [] })); return; }
    try {
      const r = await fetch(`/api/users?search=${encodeURIComponent(query.trim())}&role=partenaire&limit=6`, { headers });
      if (r.ok) { const d = await r.json(); setActivityTransferForm((p) => ({ ...p, ownerResults: d.users || [] })); }
    } catch { /* ignore — recherche non bloquante */ }
  };

  const submitActivityTransfer = async () => {
    if (!activityTransferModal) return;
    const { selectedOwner, country, ville, businessId } = activityTransferForm;
    const body = {};
    if (selectedOwner) body.ownerId = selectedOwner._id;
    if (country) body.country = country;
    if (ville.trim()) body.ville = ville.trim();
    if (businessId.trim()) body.businessId = businessId.trim();
    if (Object.keys(body).length === 0) { showToast("Choisissez au moins un changement à appliquer.", "error"); return; }

    setActivityTransferSaving(true);
    try {
      const r = await fetch(`/api/activities/${activityTransferModal.id}/transfer`, { method: "PATCH", headers, body: JSON.stringify(body) });
      const d = await r.json().catch(() => null);
      if (r.ok) {
        showToast("✅ Annonce transférée.");
        setActivityTransferModal(null);
        setActiveActivities((prev) => prev.map((a) => (a._id === activityTransferModal.id ? d.activity : a)));
      } else showToast(d?.message || "Erreur lors du transfert.", "error");
    } catch { showToast("Erreur réseau.", "error"); }
    setActivityTransferSaving(false);
  };

  // Booking action
  const [bkActionModal,   setBkActionModal]   = useState(null); // { id, name, action }
  const [bkCancelReason,  setBkCancelReason]  = useState("");
  const [bkCancelReasonCode, setBkCancelReasonCode] = useState("");
  const [bkSearch,        setBkSearch]        = useState("");
  const [bkType,          setBkType]          = useState("all");
  // Dispute & Force complete modals
  const [disputeModal,    setDisputeModal]    = useState(null); // { booking }
  const [disputeNote,     setDisputeNote]     = useState("");
  const [disputeResol,    setDisputeResol]    = useState("completed");
  const [docsModal,       setDocsModal]       = useState(null); // { booking } — documents client
  // Documents client liés à LA RÉSERVATION en litige (restructuration
  // réservation, 2026-09) — la liste des commandes ne les charge jamais
  // (select:false par défaut), donc rechargés à l'ouverture du litige via
  // getBookingDetail, qui les inclut explicitement pour l'admin.
  const [disputeDocs, setDisputeDocs] = useState(null);
  useEffect(() => {
    if (!disputeModal?.booking?._id) { setDisputeDocs(null); return; }
    fetch(`/api/bookings/${disputeModal.booking._id}/detail`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setDisputeDocs(d?.booking?.clientKycSnapshot || null))
      .catch(() => setDisputeDocs(null));
  }, [disputeModal, token]);
  const [forceModal,      setForceModal]      = useState(null); // { booking }
  const [forceAmount,     setForceAmount]     = useState("");
  const [forceNote,       setForceNote]       = useState("");

  // Broadcast notification
  const [broadcastModal, setBroadcastModal] = useState(false);
  const [broadcastForm, setBroadcastForm] = useState({ titre: "", message: "", targetRole: "all", lien: "" });
  const [broadcastSending, setBroadcastSending] = useState(false);

  // ── Toasts ─────────────────────────────────────────────────────────────────
  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Configuration métier : voir admin/hooks/useConfigurationMetier.js.
  const {
    adsConfigForm, bizConfig, bizConfigLoading, bizSaving, bizSubTab,
    boostsForm, commissionsForm, countryConfigs, countryForm, deleteCountryConfigFn,
    deleteDiscountCampaignFn, deleteExchangeRateFn, discountCampaigns, discountForm, exchangeRates,
    foundingForm, fournisseurForm, importFeeForm, loadBusinessConfig, rateForm,
    rentalOptsForm, saveCountryConfig, saveDiscountCampaign, saveExchangeRate, savePricingSection,
    serviceFeeForm, servicesForm, setAdsConfigForm, setBizSubTab, setBoostsForm,
    setCommissionsForm, setCountryForm, setDiscountForm, setFoundingForm, setFournisseurForm,
    setImportFeeForm, setRateForm, setRentalOptsForm, setServiceFeeForm, setServicesForm,
    setSubscriptionsForm, subscriptionsForm,
  } = useConfigurationMetier({ token, headers, showToast, setConfirm });

  // ── Recherche globale classée par entité ────────────────────────────────────
  // Bug réel corrigé (audit) : chaque type d'annonce (véhicule, chauffeur,
  // Import/Export) vit dans un onglet séparé avec sa propre recherche locale —
  // un admin qui cherche "Kouassi" ne sait pas d'avance dans quel onglet
  // regarder, et une annonce chauffeur en particulier était rapportée comme
  // introuvable. Cette recherche interroge les 3 entités en une seule fois,
  // classées par type, accessible depuis n'importe quel onglet (barre du haut).
  const [globalSearch, setGlobalSearch] = useState("");
  const globalSearchResults = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (q.length < 2) return null;
    const matchesAny = (fields) => fields.some((f) => f && String(f).toLowerCase().includes(q));

    // Téléphone ajouté partout (bug réel trouvé en audit) : un admin cherchant
    // un partenaire par le numéro qu'il lui a communiqué (plutôt que son nom/
    // email exact) ne trouvait jamais son annonce/profil, même existant.
    const matchVehicles = vehicles.filter((v) =>
      matchesAny([v.title, v.name, v.marque, v.modele, v.owner?.firstName, v.owner?.lastName, v.owner?.phone, v.contactTel])
    ).slice(0, 8);

    // `drivers` couvre désormais tous les statuts (voir loadAll) — recouvre déjà
    // ce que fournissait `activeDrivers` (approved uniquement), n'ajouter ce
    // dernier que pour les profils qu'il serait seul à connaître (dédoublonné
    // par _id, sinon un chauffeur publié apparaissait deux fois dans les résultats).
    const knownDriverIds = new Set(drivers.map((d) => d._id));
    const matchDrivers = [
      ...drivers.map((d) => ({ ...d, _searchStatus: d.status || "pending" })),
      ...activeDrivers.filter((d) => !knownDriverIds.has(d._id)).map((d) => ({ ...d, _searchStatus: d.status || "approved" })),
    ].filter((d) =>
      matchesAny([d.firstName, d.lastName, d.title, d.phone, d.owner?.firstName, d.owner?.lastName, d.owner?.phone])
    ).slice(0, 8);

    const matchListings = importerListings.filter((l) =>
      matchesAny([l.title, l.make, l.model, l.partner?.firstName, l.partner?.lastName, l.partner?.phone])
    ).slice(0, 8);

    return { vehicles: matchVehicles, drivers: matchDrivers, listings: matchListings };
  }, [globalSearch, vehicles, drivers, activeDrivers, importerListings]);

  const globalSearchTotal = globalSearchResults
    ? globalSearchResults.vehicles.length + globalSearchResults.drivers.length + globalSearchResults.listings.length
    : 0;

  // ── Headers API ── remonté en tête du composant (voir le commentaire à sa
  // nouvelle définition) : déclaré ici, il était cité par un tableau de
  // dépendances situé plus haut, ce qui faisait planter tout le panneau.

  // Booking Engine — Remboursements (2026-09) : marque comme traité un
  // remboursement resté manuel (voir pendingManualRefunds ci-dessus). Résout
  // le Payment via la réservation (GET /payments/booking/:id, déjà existant)
  // avant d'appeler le nouvel endpoint admin.
  // Depuis le 2026-11-01 : la référence de l'opération réellement effectuée
  // (virement, reçu mobile money…) est obligatoire — sans elle, le serveur
  // n'enregistre rien.
  const handleMarkRefunded = useCallback(async (bookingId, preuve) => {
    if (!preuve?.reference?.trim()) { showToast("Indiquez la référence de l'opération de remboursement.", "error"); return; }
    try {
      const payRes = await fetch(`/api/payments/booking/${bookingId}`, { headers });
      const payData = await payRes.json();
      if (!payRes.ok || !payData.payment?._id) {
        showToast(payData.message || "Paiement introuvable pour cette réservation.", "error");
        return;
      }
      const res = await fetch(`/api/payments/${payData.payment._id}/refund`, { method: "POST", headers, body: JSON.stringify({ preuve: { reference: preuve.reference.trim(), effectueLe: preuve.effectueLe || undefined } }) });
      const data = await res.json();
      if (!res.ok) { showToast(data.message || "Erreur.", "error"); return; }
      showToast("💸 Remboursement enregistré.", "success");
      setPendingManualRefunds((prev) => prev.filter((r) => r.bookingId !== bookingId));
    } catch { showToast("Erreur réseau.", "error"); }
  }, [headers, showToast]);

  // ── Chargement données ──────────────────────────────────────────────────────
  // usersLimit/bookingsLimit/vehiclesLimit paramétrables (bug réel corrigé —
  // voir loadMoreUsers/loadMoreBookings/loadMoreVehicles) : un plafond fixe
  // rendait tout ce qui dépassait ce nombre invisible en silence, la fausse
  // "pagination" de l'UI ne faisant que découper côté client ces résultats
  // déjà tronqués. Le plafond vehicles était resté à 200 en dur (jamais
  // corrigé en même temps que users/bookings) alors que le tri est
  // `createdAt desc` : au-delà de 200 annonces au total, les plus anciennes
  // (annonces déjà publiées ou rejetées de longue date) disparaissaient de
  // l'onglet "Annonces & Validations", et les compteurs "En attente"/
  // "Publiées" de cet onglet (calculés sur ce même tableau tronqué) pouvaient
  // diverger silencieusement des vrais totaux (stats.vehicles.*, eux corrects
  // car agrégés côté serveur sans pagination).
  // Récupération par pages successives. Les listes admin demandaient un `limit`
  // toujours croissant (« Charger plus » = +200), mais le serveur le replafonne
  // (500 pour les annonces, 200 pour les réservations) : au-delà du plafond, le
  // bouton renvoyait EXACTEMENT les mêmes lignes, et les plus anciennes étaient
  // définitivement hors de portée — non modérables. On pagine réellement.
  const fetchPaged = useCallback(async (path, { limit, pageSize, key }) => {
    const items = [];
    let total = 0;
    for (let page = 1; items.length < limit; page += 1) {
      const sep = path.includes("?") ? "&" : "?";
      const r = await fetch(`${path}${sep}limit=${pageSize}&page=${page}`, { headers });
      if (!r.ok) {
        // Un refus (403 de permission) ou une erreur serveur donnait jusqu'ici
        // une liste vide indiscernable d'une absence réelle de données.
        const d = await r.json().catch(() => null);
        const message = r.status === 403
          ? (d?.message || "Accès refusé — permission manquante.")
          : (d?.message || `Erreur ${r.status}`);
        return { items, total: total || items.length, error: page === 1 ? message : null };
      }
      const d = await r.json();
      const batch = Array.isArray(d) ? d : (d[key] || []);
      total = d.total ?? total;
      items.push(...batch);
      if (batch.length < pageSize) break;       // dernière page atteinte
      if (total && items.length >= total) break; // tout est chargé
      if (page > 40) break;                      // garde-fou (20 000 lignes)
    }
    return { items: items.slice(0, limit), total: total || items.length };
  }, [headers]);

  // Signalé : « des sections comme Comptes n'affichent rien ». La cause n'était
  // pas la donnée mais le SILENCE — chaque `if (res.ok)` sans `else`, et un
  // `catch {}` global, transformaient indifféremment un refus de permission,
  // une panne réseau ou une erreur serveur en « liste vide ». Impossible de
  // distinguer « il n'y a rien » de « ça a échoué ». Les échecs sont désormais
  // collectés et affichés en tête du panneau, section par section.
  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const failures = [];
    const read = async (label, res, onOk) => {
      if (res?.ok) {
        const d = await res.json().catch(() => null);
        onOk(d);
        return;
      }
      const d = await res?.json?.().catch(() => null);
      failures.push({
        label,
        message: res?.status === 403
          ? (d?.message || "Accès refusé — permission manquante.")
          : (d?.message || `Erreur ${res?.status ?? "réseau"}`),
      });
    };

    try {
      const [sRes, uRes, vPaged, bPaged, dRes, adRes, paRes, aaRes] = await Promise.all([
        fetch("/api/users/stats",    { headers }),
        fetch(`/api/users?limit=${usersLimit}`, { headers }),
        fetchPaged("/api/vehicles?status=all", { limit: vehiclesLimit, pageSize: 500, key: "vehicles" }),
        fetchPaged("/api/bookings",            { limit: bookingsLimit, pageSize: 200, key: "bookings" }),
        fetch("/api/drivers/pending?status=all", { headers }),
        fetch("/api/drivers", { headers }),
        fetch("/api/activities/pending?status=all", { headers }),
        fetch("/api/activities", { headers }),
      ]);
      await read("Statistiques", sRes, (d) => setStats(d));
      await read("Comptes", uRes, (d) => { setUsers(d?.users || []); setUsersTotal(d?.total || 0); });
      if (vPaged.error) failures.push({ label: "Annonces", message: vPaged.error });
      else { setVehicles(vPaged.items); setVehiclesTotal(vPaged.total); }
      if (bPaged.error) failures.push({ label: "Réservations", message: bPaged.error });
      else { setBookings(bPaged.items.map(avecStatutAffiche)); setBookingsTotal(bPaged.total); }
      await read("Chauffeurs en attente", dRes, (d) => setDrivers(d?.drivers || []));
      await read("Chauffeurs actifs", adRes, (d) => setActiveDrivers(Array.isArray(d) ? d : d?.drivers || []));
      await read("Activités en attente", paRes, (d) => setPendingActivitiesList(d?.activities || []));
      await read("Activités actives", aaRes, (d) => setActiveActivities(Array.isArray(d) ? d : d?.activities || []));
      setLiveNewListings(0);
      setLiveDisputes(0);
    } catch (err) {
      failures.push({ label: "Chargement général", message: err?.message || "Connexion au serveur impossible." });
    }
    setLoadErrors(failures);
    setLoading(false);
  }, [token, headers, usersLimit, bookingsLimit, vehiclesLimit, fetchPaged]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Bug réel corrigé (audit) : à l'arrivée d'une notification new_vehicle/
  // new_driver/litige, seul le badge du compteur était mis à jour (voir
  // liveNewListings/liveDisputes plus haut) — jamais la vraie liste
  // (vehicles/drivers/bookings). L'admin voyait donc le badge bouger mais
  // ne trouvait rien de nouveau dans l'onglet tant qu'il ne cliquait pas
  // manuellement sur "↻ Actualiser" ou ne rechargeait la page — confirmé
  // par test réel en production (l'annonce existait bien côté serveur,
  // /api/drivers/pending la renvoyait, mais l'UI déjà ouverte ne la
  // récupérait jamais). Rafraîchit les listes concernées sans le flash de
  // chargement complet de loadAll() (pas de setLoading ici).
  const refreshPendingListings = useCallback(async () => {
    if (!token) return;
    try {
      const [vPaged, dRes, bPaged] = await Promise.all([
        fetchPaged("/api/vehicles?status=all", { limit: vehiclesLimit, pageSize: 500, key: "vehicles" }),
        fetch("/api/drivers/pending?status=all", { headers }),
        fetchPaged("/api/bookings",            { limit: bookingsLimit, pageSize: 200, key: "bookings" }),
      ]);
      setVehicles(vPaged.items); setVehiclesTotal(vPaged.total);
      if (dRes.ok) setDrivers((await dRes.json()).drivers || []);
      setBookings(bPaged.items.map(avecStatutAffiche)); setBookingsTotal(bPaged.total);
      setLiveNewListings(0);
      setLiveDisputes(0);
    } catch { /* ignore — le badge live reste affiché, l'admin peut réessayer via Actualiser */ }
  }, [token, headers, vehiclesLimit, bookingsLimit, fetchPaged]);

  // Chauffeurs seuls (pièces d'identité et permis en URL signées à durée
  // limitée — voir l'effet par onglet plus bas).
  const loadDriversList = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch("/api/drivers/pending?status=all", { headers });
      if (r.ok) setDrivers((await r.json()).drivers || []);
    } catch { /* la liste déjà chargée reste affichée */ }
  }, [token, headers]);

  const loadMoreUsers = useCallback(() => setUsersLimit((l) => l + 200), []);
  const loadMoreBookings = useCallback(() => setBookingsLimit((l) => l + 200), []);
  const loadMoreVehicles = useCallback(() => setVehiclesLimit((l) => l + 200), []);

  const handleGlobalApproveDriver = useCallback(async (id) => {
    const r = await fetch(`/api/drivers/${id}/status`, { method: "PATCH", headers, body: JSON.stringify({ status: "approved" }) });
    if (r.ok) { showToast("Chauffeur approuvé"); setGlobalSearch(""); loadAll(); }
    else showToast("Erreur approbation", "error");
  }, [headers, showToast, loadAll]);









  // ── Profils & annonces importateurs ────────────────────────────────────────
  // Récupère TOUJOURS la liste complète (tous statuts confondus) — le filtre
  // pending/verified/rejected/suspended s'applique ensuite côté client (voir
  // filteredImporterProfiles/filteredImporterListings). Avant ce correctif, le
  // filtre était appliqué côté serveur ET les KPI (Total, Vérifiés, Refusés...)
  // étaient calculés sur cette même liste déjà filtrée : avec le filtre par
  // défaut "En attente", le KPI "Total exportateurs" n'affichait jamais que les
  // dossiers en attente — un partenaire déjà vérifié (donc jamais "pending")
  // restait invisible sans qu'aucun indice ne signale son existence.
  const loadImporters = useCallback(async () => {
    if (!token) return;
    setImporterLoading(true);
    try {
      // Pages successives (fetchPaged) : profils limités à 100, annonces à 500
      // sans que « Charger plus » aille au-delà (audit 2026-10-05).
      const [pRes, lRes] = await Promise.all([
        fetchPaged("/api/import-export/importer-profiles", { limit: 5000, pageSize: 100, key: "profiles" }),
        fetchPaged("/api/import-export/listings/admin", { limit: importerListingsLimit, pageSize: 100, key: "listings" }),
      ]);
      setImporterProfiles(pRes.items);
      setImporterListings(lRes.items); setImporterListingsTotal(lRes.total || lRes.items.length);
    } catch { /* ignoré volontairement */ }
    setImporterLoading(false);
  }, [token, importerListingsLimit, fetchPaged]);

  const loadMoreImporterListings = useCallback(() => setImporterListingsLimit((l) => l + 200), []);

  // /listings/admin (liste) ne renvoie plus le tableau `photos` complet — voir
  // importExportController.getAdminListings (optimisation payload liste). Il
  // faut recharger l'annonce en entier (getListingById, jamais tronqué).
  const openEditIeListing = async (id) => {
    try {
      const r = await fetch(`/api/import-export/listings/${id}`, { headers });
      const d = await r.json();
      if (!r.ok) throw new Error();
      setEditingIeListing(d.listing);
    } catch { showToast("Impossible de charger l'annonce.", "error"); }
  };














  // Rôles & permissions : voir admin/hooks/useRoles.js.
  const {
    adminAccounts, applyAdminScope, loadAdminAccounts, rolesLoading, rolesSavingId,
  } = useRoles({ headers, showToast, token });

  // Bug réel corrigé (audit) : cliquer une SEULE permission sur un admin à
  // "accès complet" (adminScope=[]) le restreignait immédiatement et
  // silencieusement à CETTE seule permission (next = [...[], scopeKey]),
  // sans aucune confirmation. Risque concret : un admin unique à accès
  // complet se retire lui-même l'accès complet par erreur, puis ne peut plus
  // se le rendre depuis l'UI (updateAdminScope exige déjà un accès complet
  // ou super_admin pour modifier des scopes — voir usersController.js) —
  // auto-verrouillage irréversible sans intervention directe en base. Le
  // backend (updateAdminScope) refuse désormais aussi toute modification qui
  // laisserait 0 admin à accès complet sur toute la plateforme, en filet de
  // sécurité final si cette confirmation était contournée.
  const toggleAdminScope = (adminId, currentScope, scopeKey) => {
    // Aucun domaine assigné = administrateur général (accès à tout).
    const wasGeneral = currentScope.length === 0 || currentScope.includes("super_admin");
    const next = currentScope.includes(scopeKey)
      ? currentScope.filter((s) => s !== scopeKey)
      : [...currentScope, scopeKey];

    // Passage d'ADMIN GÉNÉRAL à accès assigné : perte massive de droits, on
    // demande confirmation explicite. (Le serveur refuse par ailleurs de
    // retirer le dernier administrateur général actif de la plateforme.)
    // Assigner un premier domaine à un administrateur général le RESTREINT :
    // c'est le geste qui fait basculer d'« accès à tout » à « accès assigné ».
    if (wasGeneral && scopeKey !== "super_admin" && !currentScope.includes(scopeKey)) {
      const label = ADMIN_SCOPE_CFG.find((x) => x.key === scopeKey)?.label || scopeKey;
      setConfirm({
        message: `Ce compte est ADMINISTRATEUR GÉNÉRAL (accès à tout). Lui assigner « ${label} » va le RESTREINDRE à ce seul domaine — il perdra l'accès à tout le reste. Continuer ?`,
        danger: true,
        action: () => applyAdminScope(adminId, [scopeKey]),
      });
      return;
    }
    if (wasGeneral && scopeKey === "super_admin") {
      setConfirm({
        message: "Retirer le statut d'ADMINISTRATEUR GÉNÉRAL à ce compte ? Il ne pourra plus gérer que les domaines qui lui sont explicitement attribués, et ne pourra plus gérer les autres comptes admin.",
        danger: true,
        action: () => applyAdminScope(adminId, next),
      });
      return;
    }
    // Passage à ADMIN GÉNÉRAL : accès total, à confirmer aussi.
    if (!wasGeneral && scopeKey === "super_admin") {
      setConfirm({
        message: "Faire de ce compte un ADMINISTRATEUR GÉNÉRAL ? Il pourra tout gérer sur la plateforme, y compris créer, restreindre ou désactiver les autres comptes admin.",
        action: () => applyAdminScope(adminId, ["super_admin"]),
      });
      return;
    }
    applyAdminScope(adminId, next);
  };

























  const openLoyalty = async (u) => {
    setLoyaltyModal(u);
    setLoyaltyData(null);
    // Sans cette remise à zéro, le motif saisi pour le client précédent reste
    // dans le champ et serait attribué au suivant.
    setLoyaltyForm(VIDE_AJUST);
    setLoyaltyLoading(true);
    try {
      const r = await fetch(`/api/loyalty/admin/${u._id}`, { headers });
      if (r.ok) setLoyaltyData(await r.json());
    } catch { /* ignore */ }
    setLoyaltyLoading(false);
  };

  const submitLoyaltyAdjust = async () => {
    if (!loyaltyModal || loyaltySaving) return;
    setLoyaltySaving(true);
    try {
      const r = await fetch(`/api/loyalty/admin/${loyaltyModal._id}/adjust`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          direction: loyaltyForm.direction,
          points: Number(loyaltyForm.points),
          reason: loyaltyForm.reason,
          countsTowardTier: loyaltyForm.countsTowardTier,
        }),
      });
      const d = await r.json().catch(() => ({}));
      // Le serveur refuse pour des raisons précises (solde insuffisant, motif
      // vide, plafond dépassé) : afficher SON message, pas un « erreur » générique
      // qui laisserait l'admin réessayer à l'aveugle.
      if (!r.ok) { showToast(d?.message || "Ajustement refusé.", "error"); return; }
      showToast(`✅ Solde ajusté : ${d.points} points.`);
      setLoyaltyForm(VIDE_AJUST);
      await openLoyalty(loyaltyModal); // recharge solde + historique
    } catch {
      showToast("Erreur réseau — ajustement non enregistré.", "error");
    } finally {
      setLoyaltySaving(false);
    }
  };

  const [vitrineModal, setVitrineModal] = useState(null);










































  // Modération des avis clients : voir admin/hooks/useModerationAvis.js.
  const {
    loadReviews, platformReviewStats, reviewActioning, reviewsFilter, reviewsList,
    reviewsLoading, reviewsTargetType, setReviewsFilter, setReviewsTargetType, toggleReviewVisibility,
  } = useModerationAvis({ fetchPaged, headers, showToast, token });

  // Santé système : voir admin/hooks/useSanteSysteme.js.
  const {
    loadSystemHealth, systemHealth, systemHealthLoading,
  } = useSanteSysteme({ headers });

  // Analytics : voir admin/hooks/useAnalytics.js.
  const {
    analytics, analyticsLoading, loadAnalytics,
  } = useAnalytics({ headers, token });

  // Emails & livraison : voir admin/hooks/useEmailsLivraison.js.
  const {
    emailDeliveryLoading, emailFailures, emailStats, loadEmailDelivery,
  } = useEmailsLivraison({ headers, token });

  // Financement (leasing/crédit) : voir admin/hooks/useFinancement.js.
  const {
    financingLoading, financingModal, financingNote, financingRequests, financingSaving,
    loadFinancing, setFinancingModal, setFinancingNote, submitFinancingDecision,
  } = useFinancement({ headers, showToast, token });

  // Publicités & campagnes : voir admin/hooks/usePublicites.js.
  const {
    adForm, adSaving, adsList, adsLoading, deleteAd,
    loadAds, saveAd, setAdForm, toggleAdActive,
  } = usePublicites({ headers, showToast, token });

  // Reversements partenaire : voir admin/hooks/useReversements.js.
  const {
    loadPayouts, markPayoutPaid, payoutMarkingId, payoutsFilter, payoutsList,
    payoutsLoading, payoutsPendingCount, payoutsTotal, setPayoutsFilter,
  } = useReversements({ fetchPaged, headers, showToast, token });

  // Assurance : voir admin/hooks/useAssurance.js.
  const {
    insuranceList, insuranceLoading, insuranceModal, insuranceNote, insurancePremium,
    insuranceSaving, loadInsurance, setInsuranceModal, setInsuranceNote, setInsurancePremium,
    submitInsuranceDecision,
  } = useAssurance({ headers, showToast, token });

  // Autres services (transport, transit, douanes…) : voir admin/hooks/useAutresServices.js.
  const {
    loadServiceRequests, setSvcReqAmount, setSvcReqCategory, setSvcReqModal, setSvcReqNote,
    submitServiceRequestDecision, svcReqAmount, svcReqCategory, svcReqList, svcReqLoading,
    svcReqModal, svcReqNote, svcReqSaving,
  } = useAutresServices({ headers, showToast, token });

  // Coûts d'import : voir admin/hooks/useCoutsImport.js.
  const {
    costConfigForm, costConfigs, deleteCostConfig, deleteLaneRate, importCostLoading,
    laneForm, laneRates, loadImportCostData, saveCostConfig, saveLaneRate,
    setCostConfigForm, setLaneForm,
  } = useCoutsImport({ headers, setConfirm, showToast, token });

  // Contrats de réservation : voir admin/hooks/useContrats.js.
  const {
    contracts, contractsLoading, loadContracts,
  } = useContrats({ headers, token });

  // Journal d'audit : voir admin/hooks/useJournalAudit.js.
  const {
    auditEntries, auditFacets, auditFilter, auditLoading, loadAuditLog,
    setAuditFilter,
  } = useJournalAudit({ fetchPaged, headers, token });

  // Abonnements et boosts à confirmer : voir admin/hooks/useAbonnementsAValider.js.
  const {
    loadSubRequests, subAction, subActioning, subLoading, subRequests,
  } = useAbonnementsAValider({ headers, showToast, token });

  // Demandes d'assistance et essais Pro : voir admin/hooks/useAssistance.js.
  const {
    accorderEssai, changerStatutTicket, chercherPartenaireEssai, essaiPalier, essaiRecherche,
    essaiResultats, essaiRetour, essaiVendeur, loadTickets, repondreTicket,
    setEssaiPalier, setEssaiResultats, setEssaiVendeur, setTicketOuvert, setTicketReponse,
    setTicketsStatut, ticketOuvert, ticketReponse, tickets, ticketsEnRetard,
    ticketsStatut,
  } = useAssistance({ headers, loadSubRequests, token });

  // Bot WhatsApp partenaires : voir admin/hooks/useWhatsapp.js.
  const {
    loadWaConversations, openWaConversation, sendWaReply, setWaFilter, setWaReply,
    waActive, waConversations, waFilter, waLoading, waReply,
    waSetStatus,
  } = useWhatsapp({ headers, showToast, token });

  // Support client : voir admin/hooks/useSupportClient.js.
  const {
    loadSupportChats, openSupportChat, sendSupportReply, setSupportMessages, setSupportReply,
    supportActive, supportChats, supportLoading, supportMessages, supportMsgLoading,
    supportReply, supportSending,
  } = useSupportClient({ activeTab, headers, showToast, token });

  // Demandes à valider : voir admin/hooks/useDemandesAValider.js.
  const {
    adminValidateBookingReq, adminValidateDirectReq, confirmValidationReject, loadPendingValidation, pendingValidationBookings,
    pendingValidationDirect, pendingValidationLoading, setValidationRejectModal, setValidationRejectReason, validationRejectModal,
    validationRejectReason,
  } = useDemandesAValider({ headers, showToast, token });

  // Supervision des chats client ↔ partenaire : voir admin/hooks/useSupervisionChats.js.
  const {
    cpActive, cpChats, cpChatsLoading, cpMessages, cpMsgLoading,
    loadClientPartnerChats, openClientPartnerChat, setCpMessages,
  } = useSupervisionChats({ activeTab, headers, token });

  // KYC / identités : voir admin/hooks/useKycAdmin.js.
  const {
    handleKycReview, kycDetailLoading, kycDetailUser, kycFilter, kycList,
    kycLoading, kycPendingTotal, kycReviewForm, kycReviewLoading, kycReviewMsg,
    kycSearch, kycTotal, loadKycList, loadMoreKyc, openKycDetail,
    setKycDetailUser, setKycFilter, setKycReviewForm, setKycSearch,
  } = useKycAdmin({ headers, showToast, token });

  // Certifications partenaires : voir admin/hooks/useCertifications.js.
  const {
    certBadgeForm, certDetail, certFilter, certList, certLoading,
    certReviewForm, certReviewLevel, certReviewLoading, certReviewMsg, handleCertBadge,
    handleCertLevelReview, handleCertRelance, loadCertList, setCertBadgeForm, setCertDetail,
    setCertFilter, setCertReviewForm, setCertReviewLevel, setCertReviewMsg,
  } = useCertifications({ fetchPaged, headers, showToast, token });

  // Partner Hub PMS : voir admin/hooks/usePartnerHub.js.
  const {
    adminToggleShowroom, loadPMSAdmin, pmsFilter, pmsLoading, pmsShowrooms,
    pmsStats, setPmsFilter,
  } = usePartnerHub({ headers, showToast, token });

  // Founding Partners : voir admin/hooks/useFoundingPartners.js.
  const {
    foundingAction, foundingApprove, foundingCRMEdit, foundingCRMFilter, foundingDetail,
    foundingList, foundingLoading, foundingNote, foundingReject, foundingRelaunchBusiness,
    foundingRequestInfo, foundingResendDocuments, foundingRowActionId, foundingSendAgreement, foundingSignLink,
    foundingStats, foundingSubmitting, foundingUpdateCRM, foundingView, loadFoundingPartners,
    setFoundingAction, setFoundingCRMEdit, setFoundingCRMFilter, setFoundingDetail, setFoundingNote,
    setFoundingSignLink, setFoundingView,
  } = useFoundingPartners({ fetchPaged, headers, showToast, token });

  // CRM partenaires : voir admin/hooks/useCrmPartenaires.js.
  const {
    crmAdvanceStatut, crmCreateProspect, crmCreating, crmDetail, crmDetailData,
    crmDoublons, crmEditData, crmErreur, crmFilter, crmLinkAccount,
    crmLinkUserId, crmList, crmLoading, crmNewForm, crmOpenDetail,
    crmPage, crmSaveDetail, crmSearch, crmStats, crmSubmitting,
    crmTotal, crmView, loadPartnerCrm, setCrmCreating, setCrmDetail,
    setCrmDoublons, setCrmEditData, setCrmFilter, setCrmLinkUserId, setCrmNewForm,
    setCrmPage, setCrmSearch, setCrmView,
  } = useCrmPartenaires({ CRM_PAR_PAGE, headers, showToast, token });

  // Vérification partenaires : voir admin/hooks/useVerificationPartenaires.js.
  const {
    loadPartnerVerif, pvCreateForm, pvCreateModal, pvCriterionLoading, pvDetail,
    pvFilter, pvList, pvLoading, pvSaving, pvStats,
    setPvCreateForm, setPvCreateModal, setPvCriterionLoading, setPvDetail, setPvFilter,
    setPvSaving,
  } = useVerificationPartenaires({ headers, token });

  // Signalements et confiance : voir admin/hooks/useSignalements.js.
  const {
    decideReport, loadReports, openTrustOverview, reportFilter, reports,
    reportsLoading, setReportFilter, setTrustModal, trustLoading, trustModal,
    trustOverview,
  } = useSignalements({ fetchPaged, headers, showToast, token });

  // Commissions et factures : voir admin/hooks/useCommissionsFactures.js.
  const {
    commissions, commissionsStats, generateForm, generating, invoiceLoading,
    invoiceMonth, invoiceYear, invoices, invoicesStats, loadCommissions,
    loadInvoices, loadServiceInvoicesAdmin, serviceInvoicesAdmin, serviceInvoicesAdminLoading, setGenerateForm,
    setGenerating, setInvoiceMonth, setInvoiceYear,
  } = useCommissionsFactures({ fetchPaged, headers, token });

  // Import/Export : demandes et transactions : voir admin/hooks/useImportExportAdmin.js.
  const {
    deleteIeRequest, handleCompleteIeInspection, handleResolveIeDispute, handleVerifyIePayment, ieActionSaving,
    ieLoading, ieRequests, ieRequestsTotal, ieTransactions, ieTxLoading,
    ieTxModal, ieTxNote, ieTxRelease, ieTxSaving, loadIeTransactions,
    loadImportExport, loadMoreIeRequests, setIeTxModal, setIeTxNote, setIeTxRelease,
    updateIeRequestStatus,
  } = useImportExportAdmin({ fetchPaged, headers, showToast, token });

  useEffect(() => {
    // Les onglets Escrow et Transport affichent EXACTEMENT les mêmes données
    // (ieTransactions) mais ne les chargeaient pas : ouverts directement (F5,
    // lien profond), ils annonçaient « aucun fonds en séquestre » avec des
    // compteurs à zéro alors que des dossiers existaient — il fallait passer
    // d'abord par l'onglet Transactions I/E pour qu'ils se remplissent.
    if (activeTab === "import_export")  { loadImportExport(); loadIeTransactions(); }
    if (activeTab === "escrow" || activeTab === "transport") loadIeTransactions();
    if (activeTab === "exportateurs")   loadImporters();
    if (activeTab === "commissions")    loadCommissions();
    if (activeTab === "factures")       { loadInvoices(); loadServiceInvoicesAdmin(); }
    if (activeTab === "kyc")            loadKycList(kycFilter);
    // Les pièces d'identité et permis des chauffeurs sont des URL SIGNÉES à
    // durée limitée (voir config/imagekit.js) : chargées une fois avec le
    // panneau, elles étaient périmées (403, image cassée) quand l'admin
    // ouvrait l'onglet plus tard. Rechargé à chaque ouverture de l'onglet.
    if (activeTab === "chauffeurs")     loadDriversList();
    if (activeTab === "certification")  loadCertList();
    if (activeTab === "partner_verif")     loadPartnerVerif();
    if (activeTab === "pms_partners")      loadPMSAdmin();
    if (activeTab === "founding_partners") loadFoundingPartners();
    if (activeTab === "partner_crm") { loadPartnerCrm(); loadAdminAccounts(); }
    if (activeTab === "support")           loadSupportChats();
    if (activeTab === "assistance")        loadTickets();
    if (activeTab === "pending_validation") loadPendingValidation();
    if (activeTab === "chat_supervision")   loadClientPartnerChats();
    if (activeTab === "paiements")         loadSubRequests();
    if (activeTab === "reviews")           loadReviews();
    if (activeTab === "system_health")     loadSystemHealth();
    if (activeTab === "contrats")          loadContracts();
    if (activeTab === "audit")             loadAuditLog();
    if (activeTab === "analytics")         loadAnalytics();
    if (activeTab === "email_delivery")    loadEmailDelivery();
    if (activeTab === "financement")       loadFinancing();
    if (activeTab === "roles")             loadAdminAccounts();
    if (activeTab === "ads" || activeTab === "marketing") loadAds();
    if (activeTab === "assurance")         loadInsurance();
    if (activeTab === "service_requests")  loadServiceRequests();
    if (activeTab === "import_cost")       loadImportCostData();
    if (activeTab === "reports")           loadReports();
    if (activeTab === "whatsapp")          loadWaConversations();
    if (activeTab === "business_config")   loadBusinessConfig();
    if (activeTab === "reversements")      loadPayouts();
  }, [activeTab, loadDriversList, loadImportExport, loadIeTransactions, loadImporters, loadCommissions, loadInvoices, loadKycList, kycFilter, loadCertList, loadPartnerVerif, loadPMSAdmin, loadFoundingPartners, loadPartnerCrm, loadSupportChats, loadTickets, loadServiceInvoicesAdmin, loadEmailDelivery, loadSubRequests, loadReviews, loadAuditLog, loadAnalytics, loadFinancing, loadAdminAccounts, loadAds, loadInsurance, loadServiceRequests, loadImportCostData, loadReports, loadWaConversations, loadBusinessConfig, loadPayouts, loadPendingValidation, loadClientPartnerChats, loadSystemHealth, loadContracts]);




  // Temps réel : un message client_partner doit apparaître instantanément dans
  // la supervision admin (voir chatController.sendMessage, qui émet désormais
  // "chat:message" vers la room "admins" pour ce type aussi).
  useEffect(() => {
    return onSocket("chat:message", ({ chatId, message, type }) => {
      if (type !== "client_partner") return;
      if (cpActive?._id === chatId) {
        setCpMessages((prev) => prev.some((m) => m._id === message._id) ? prev : [...prev, message]);
      }
      if (activeTab === "chat_supervision") loadClientPartnerChats();
    });
  }, [onSocket, cpActive, activeTab, loadClientPartnerChats, setCpMessages]);

  // Temps réel : un client/partenaire qui écrit doit apparaître instantanément
  // dans la file support partagée, sans attendre jusqu'à 15s de polling — et si
  // la conversation ouverte par cet admin reçoit un message, l'afficher tout de
  // suite plutôt qu'au prochain clic.
  useEffect(() => {
    return onSocket("chat:message", ({ chatId, message }) => {
      if (supportActive?._id === chatId) {
        setSupportMessages((prev) => prev.some((m) => m._id === message._id) ? prev : [...prev, message]);
      }
      if (activeTab === "support") loadSupportChats();
    });
  }, [onSocket, supportActive, activeTab, loadSupportChats, setSupportMessages]);

  // Bug réel corrigé (audit) : le backend émettait déjà "refund_needed" à
  // plusieurs endroits (annulation payée par le client/partenaire, litige
  // résolu en compensation) mais AUCUN écouteur n'existait côté front — le
  // signal se perdait silencieusement. Booking Engine — Remboursements
  // (2026-09) : la plupart des cas sont désormais traités automatiquement
  // (Stripe) — le message distingue les deux cas, seul le second nécessite
  // une action admin (voir bouton "Marquer remboursé").
  const [pendingManualRefunds, setPendingManualRefunds] = useState([]);
  const [preuvesRemboursement, setPreuvesRemboursement] = useState({});
  useEffect(() => {
    return onSocket("refund_needed", ({ bookingId, reference, reason }) => {
      const automatic = /automatiquement/.test(reason || "");
      showToast(`💸 ${reference || ""} : ${reason || ""}`, automatic ? "success" : "error");
      // Cas resté manuel (Orange Money, espèces...) : gardé visible au-delà du
      // toast (3,5s) jusqu'à ce qu'un admin le marque traité — voir
      // handleMarkRefunded ci-dessous.
      if (!automatic && bookingId) {
        setPendingManualRefunds((prev) => prev.some((r) => r.bookingId === bookingId) ? prev : [...prev, { bookingId, reference, reason }]);
      }
    });
  }, [onSocket, showToast]);

  // Bug réel corrigé (audit) : le backend émet déjà "booking_updated" vers la
  // room `admins` à chaque changement de statut (partenaire OU admin), et
  // VendorDashboard.jsx/Dashboard.jsx l'exploitent déjà pour se rafraîchir en
  // temps réel — mais AdminPanel.jsx n'avait AUCUN écouteur dessus. L'admin
  // ne voyait donc jamais en direct qu'un partenaire avait fait progresser une
  // réservation (préparation, prêt, transaction...), seulement après clic
  // manuel sur "Actualiser" ou rechargement de page — la synchronisation à 3
  // voies (client/admin/partenaire) demandée n'était donc réelle que dans 2
  // des 3 sens.
  useEffect(() => {
    return onSocket("booking_updated", (payload) => {
      refreshPendingListings();
      if (payload?.reference) showToast(`🔄 Commande ${payload.reference} mise à jour (${payload.status || ""})`, "info");
    });
  }, [onSocket, showToast, refreshPendingListings]);

  useEffect(() => {
    return onSocket("notification_new", (payload) => {
      if (payload?.type === "new_vehicle" || payload?.type === "new_driver") {
        // Bump immédiat du badge (feedback instantané) + rechargement réel de
        // la liste juste après (l'admin voit l'annonce elle-même, pas
        // seulement un chiffre qui bouge — voir refreshPendingListings).
        setLiveNewListings((n) => n + 1);
        showToast(payload.titre || "🚗 Nouvelle annonce à valider", "info");
        refreshPendingListings();
      } else if (payload?.type === "system" && /litige/i.test(payload?.titre || "")) {
        setLiveDisputes((n) => n + 1);
        showToast(payload.titre || "⚖️ Nouveau litige", "info");
        refreshPendingListings();
      } else if (payload?.type === "ie_request") {
        // Bug réel corrigé (audit) : createRequest (Import/Export) notifiait
        // déjà l'admin via Notification.insertMany, mais sans émission socket
        // — jamais de rafraîchissement temps réel de l'onglet "Demandes
        // Import/Export", même trou que vehicle/driver comblé plus tôt.
        showToast(payload.titre || "🌍 Nouvelle demande Import/Export", "info");
        loadImportExport();
      } else if (payload?.type === "ie_profile" || payload?.type === "ie_listing") {
        showToast(payload.titre || "📦 Nouveauté Import/Export à examiner", "info");
        loadImporters();
      }
    });
  }, [onSocket, showToast, refreshPendingListings, loadImportExport, loadImporters]);

  // Ferme tous les modals au changement d'onglet pour éviter les états résiduels
  useEffect(() => {
    setConfirm(null);
    setRejectModal(null);
    setRejectReason("");
    setDriverRejectModal(null);
    setDriverRejectReason("");
    setBkActionModal(null);
    setBkCancelReason("");
    setDisputeModal(null);
    setForceModal(null);
    setReviewModal(null);
    setListingRejectModal(null);
    setExporterDetail(null);
    setKycDetailUser(null);
    setPvDetail(null);
    setPvCreateModal(false);
    // Les setters venus des hooks de domaine sont stables : ils ne relancent rien.
  }, [activeTab, setKycDetailUser, setPvDetail, setPvCreateModal]);

  // ── Actions utilisateurs ────────────────────────────────────────────────────
  const toggleBlock = useCallback(async (uid) => {
    try {
      const res = await fetch(`/api/users/${uid}/toggle`, { method: "PATCH", headers });
      if (!res.ok) throw new Error();
      const { user: updated } = await res.json();
      setUsers((prev) => prev.map((u) => u._id === uid ? { ...u, isActive: updated.isActive } : u));
      showToast(updated.isActive ? "Compte réactivé" : "Compte bloqué");
    } catch { showToast("Erreur lors du blocage", "error"); }
  }, [headers, showToast]);

  const changeRole = useCallback(async (uid, role) => {
    try {
      const res = await fetch(`/api/users/${uid}/role`, {
        method: "PATCH", headers, body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        // Le message du serveur était jeté : « rôle invalide » et « seul un super
        // admin peut… » devenaient tous deux « Erreur lors du changement de rôle ».
        const d = await res.json().catch(() => null);
        showToast(d?.message || "Erreur lors du changement de rôle", "error");
        return;
      }
      const { user: updated } = await res.json();
      setUsers((prev) => prev.map((u) => u._id === uid ? { ...u, role: updated.role } : u));
      showToast(`Rôle changé → ${updated.role}`);
    } catch { showToast("Erreur réseau — rôle inchangé.", "error"); }
  }, [headers, showToast]);

  const deleteUser = useCallback(async (uid) => {
    try {
      const res = await fetch(`/api/users/${uid}`, { method: "DELETE", headers });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      setUsers((prev) => prev.filter((u) => u._id !== uid));
      showToast("Utilisateur supprimé");
    } catch (e) { showToast(e.message || "Erreur lors de la suppression", "error"); }
  }, [headers, showToast]);

  // Bug réel corrigé (audit) : aucun formulaire n'exposait le numéro de
  // téléphone d'un compte en écriture côté admin (affiché en lecture seule
  // uniquement) — un partenaire inscrit sans téléphone, ou avec un numéro
  // faux/périmé, n'avait aucun moyen d'être corrigé par le support.
  const updatePhone = useCallback(async (uid, currentPhone) => {
    const next = window.prompt("Numéro de téléphone (laisser vide pour retirer) :", currentPhone || "");
    if (next === null) return; // annulé
    try {
      const res = await fetch(`/api/users/${uid}/phone`, {
        method: "PATCH", headers, body: JSON.stringify({ phone: next.trim() || null }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.message || "Erreur lors de la mise à jour.");
      setUsers((prev) => prev.map((u) => u._id === uid ? { ...u, phone: d.user.phone, phoneVerified: d.user.phoneVerified } : u));
      showToast("Téléphone mis à jour");
    } catch (e) { showToast(e.message || "Erreur lors de la mise à jour", "error"); }
  }, [headers, showToast]);

  // ── Actions véhicules ───────────────────────────────────────────────────────
  const updateVehicleStatus = useCallback(async (vid, status, reason = "") => {
    try {
      const res = await fetch(`/api/vehicles/${vid}/status`, {
        method: "PATCH", headers, body: JSON.stringify({ status, rejectionReason: reason }),
      });
      if (!res.ok) throw new Error();
      setVehicles((prev) => prev.map((v) => (v._id || v.id) === vid ? { ...v, status } : v));
      showToast(`Annonce ${status === "approved" ? "approuvée" : "rejetée"}`);
    } catch { showToast("Erreur lors de la mise à jour", "error"); }
  }, [headers, showToast]);

  const deleteVehicle = useCallback(async (vid) => {
    try {
      const res = await fetch(`/api/vehicles/${vid}`, { method: "DELETE", headers });
      if (!res.ok) throw new Error();
      setVehicles((prev) => prev.filter((v) => (v._id || v.id) !== vid));
      showToast("Annonce supprimée");
    } catch { showToast("Erreur lors de la suppression", "error"); }
  }, [headers, showToast]);

  // Même endpoint que updateDriverStatus ci-dessous, mais met à jour le
  // statut EN PLACE (map) au lieu de retirer le chauffeur de la liste — pour
  // CatalogueSection, qui affiche désormais tous les statuts (voir sous-
  // filtres pending/approved/rejected/all) : filtrer ferait disparaître la
  // ligne au lieu de simplement changer son badge de statut. `updateDriverStatus`
  // (filter) reste utilisé tel quel par l'onglet "Chauffeurs" dédié, dont la
  // liste pending-only doit bien voir la ligne disparaître une fois traitée.
  const updateDriverStatusInPlace = useCallback(async (did, status, reason = "") => {
    try {
      const res = await fetch(`/api/drivers/${did}/status`, {
        method: "PATCH", headers, body: JSON.stringify({ status, rejectionReason: reason }),
      });
      if (!res.ok) {
        // Le message réel du serveur était jeté : toute erreur (droits
        // insuffisants, statut refusé…) devenait « Erreur lors de la mise à
        // jour », sans indication de ce qu'il fallait corriger.
        const d = await res.json().catch(() => null);
        showToast(d?.message || "Erreur lors de la mise à jour", "error");
        return;
      }
      setDrivers((prev) => prev.map((d) => (d._id === did ? { ...d, status, rejectionReason: reason || d.rejectionReason } : d)));
      showToast(`Chauffeur ${status === "approved" ? "approuvé" : "rejeté"}`);
    } catch { showToast("Erreur réseau — action non appliquée.", "error"); }
  }, [headers, showToast]);

  // ── Actions chauffeurs ──────────────────────────────────────────────────────
  const updateDriverStatus = useCallback(async (did, status, reason = "") => {
    try {
      const res = await fetch(`/api/drivers/${did}/status`, {
        method: "PATCH", headers, body: JSON.stringify({ status, rejectionReason: reason }),
      });
      if (!res.ok) {
        // Le message réel du serveur était jeté : toute erreur (droits
        // insuffisants, statut refusé…) devenait « Erreur lors de la mise à
        // jour », sans indication de ce qu'il fallait corriger.
        const d = await res.json().catch(() => null);
        showToast(d?.message || "Erreur lors de la mise à jour", "error");
        return;
      }
      setDrivers((prev) => prev.filter((d) => d._id !== did));
      showToast(`Chauffeur ${status === "approved" ? "approuvé" : "rejeté"}`);
    } catch { showToast("Erreur réseau — action non appliquée.", "error"); }
  }, [headers, showToast]);

  // Retire un chauffeur actif du catalogue public (repasse en "rejected" —
  // Driver.status n'a pas de statut "suspendu" dédié) — action utilisée par la
  // section "Chauffeurs actifs" (voir tab chauffeurs).
  const deactivateActiveDriver = useCallback(async (did) => {
    try {
      const res = await fetch(`/api/drivers/${did}/status`, {
        method: "PATCH", headers, body: JSON.stringify({ status: "rejected", rejectionReason: "Désactivé par l'administration" }),
      });
      if (!res.ok) throw new Error();
      setActiveDrivers((prev) => prev.filter((d) => d._id !== did));
      showToast("Chauffeur retiré du catalogue.");
    } catch { showToast("Erreur lors de la mise à jour", "error"); }
  }, [headers, showToast]);

  // ── Actions activités (section OTHERS) — même principe que chauffeurs ───────
  const updateActivityStatus = useCallback(async (aid, status, reason = "") => {
    try {
      const res = await fetch(`/api/activities/${aid}/status`, {
        method: "PATCH", headers, body: JSON.stringify({ status, rejectionReason: reason }),
      });
      if (!res.ok) throw new Error();
      setPendingActivitiesList((prev) => prev.filter((a) => a._id !== aid));
      showToast(`Activité ${status === "approved" ? "approuvée" : "rejetée"}`);
    } catch { showToast("Erreur lors de la mise à jour", "error"); }
  }, [headers, showToast]);

  const handleRejectActivity = useCallback(async (aid, reason) => {
    await updateActivityStatus(aid, "rejected", reason);
    setActivityRejectModal(null);
    setActivityRejectReason("");
  }, [updateActivityStatus]);

  const deactivateActiveActivity = useCallback(async (aid) => {
    try {
      const res = await fetch(`/api/activities/${aid}/status`, {
        method: "PATCH", headers, body: JSON.stringify({ status: "rejected", rejectionReason: "Désactivée par l'administration" }),
      });
      if (!res.ok) throw new Error();
      setActiveActivities((prev) => prev.filter((a) => a._id !== aid));
      showToast("Activité retirée du catalogue.");
    } catch { showToast("Erreur lors de la mise à jour", "error"); }
  }, [headers, showToast]);

  // ── Actions commandes (admin) ───────────────────────────────────────────────
  const adminUpdateBooking = useCallback(async (bid, status, reason = "", cancelReasonCode = null) => {
    try {
      const res = await fetch(`/api/bookings/${bid}/status`, {
        method: "PATCH", headers, body: JSON.stringify({ status, cancelReason: reason, cancelReasonCode }),
      });
      if (!res.ok) throw new Error();
      setBookings((prev) => prev.map((b) => b._id === bid ? { ...b, status } : b));
      showToast(`Commande ${status === "cancelled" ? "annulée" : status === "confirmed" ? "confirmée" : "mise à jour"}`);
    } catch { showToast("Erreur lors de la mise à jour", "error"); }
  }, [headers, showToast]);

  const adminResolveDispute = useCallback(async (bid, resolution, note, refundClient = false) => {
    try {
      const res = await fetch(`/api/bookings/${bid}/resolve-dispute`, {
        method: "PATCH", headers, body: JSON.stringify({ resolution, note, refundClient }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      setBookings((prev) => prev.map((b) => b._id === bid ? { ...b, status: resolution === "compensated" ? "completed" : resolution } : b));
      showToast(`Litige résolu — ${resolution}`);
    } catch (e) { showToast(e.message || "Erreur résolution litige", "error"); }
  }, [headers, showToast]);

  const adminForceComplete = useCallback(async (bid, finalAmount, note) => {
    try {
      const res = await fetch(`/api/bookings/${bid}/admin-force-complete`, {
        method: "PATCH", headers, body: JSON.stringify({ finalAmount, note }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      setBookings((prev) => prev.map((b) => b._id === bid ? { ...b, status: "completed" } : b));
      showToast("Commande finalisée avec succès.");
    } catch (e) { showToast(e.message || "Erreur finalisation", "error"); }
  }, [headers, showToast]);

  const adminDeleteBooking = useCallback(async (bid) => {
    try {
      const res = await fetch(`/api/bookings/${bid}/admin-delete`, { method: "DELETE", headers });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      setBookings((prev) => prev.filter((b) => b._id !== bid));
      showToast("Commande supprimée.");
    } catch (e) { showToast(e.message || "Erreur suppression", "error"); }
  }, [headers, showToast]);

  // window.open n'envoie AUCUN en-tête : le `_t=${token}` en query n'est lu par
  // rien côté serveur (authenticate ne lit que l'en-tête Authorization), donc
  // l'export ouvrait un onglet affichant {"message":"Non autorisé"} — il n'a
  // jamais fonctionné. Téléchargement authentifié comme les autres documents.
  const exportBookings = useCallback(async (fmt = "csv") => {
    const params = new URLSearchParams({ format: fmt });
    if (bkStatus !== "all") params.set("status", bkStatus);
    if (bkSearch.trim()) params.set("search", bkSearch.trim());
    const date = new Date().toISOString().slice(0, 10);
    const r = await downloadAuthFile(`/api/bookings/admin/export?${params}`, `commandes-${date}.${fmt === "csv" ? "csv" : "json"}`, token);
    if (!r.ok) showToast(r.message, "error");
  }, [bkStatus, bkSearch, token, showToast]);

  // ── Broadcast notification ─────────────────────────────────────────────────
  const sendBroadcast = useCallback(async () => {
    if (!broadcastForm.titre || !broadcastForm.message) {
      showToast("Titre et message requis", "error"); return;
    }
    setBroadcastSending(true);
    try {
      const res = await fetch("/api/notifications/admin/broadcast", {
        method: "POST", headers, body: JSON.stringify(broadcastForm),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      showToast(d.message || "Notification envoyée");
      setBroadcastModal(false);
      setBroadcastForm({ titre: "", message: "", targetRole: "all", lien: "" });
    } catch (e) { showToast(e.message || "Erreur envoi", "error"); }
    finally { setBroadcastSending(false); }
  }, [broadcastForm, headers, showToast]);

  // ── Filtres & pagination ────────────────────────────────────────────────────
  // Pays réellement présents parmi les comptes (dynamique — ne dépend pas
  // d'une liste figée, couvre aussi un code pays détecté par géoloc/IP qui ne
  // serait pas dans COUNTRIES_CONFIG).
  const userCountryOptions = useMemo(() => {
    const codes = [...new Set(users.map((u) => u.country).filter(Boolean))];
    return codes.sort((a, b) => (COUNTRIES_CONFIG.find((c) => c.code === a)?.name || a)
      .localeCompare(COUNTRIES_CONFIG.find((c) => c.code === b)?.name || b));
  }, [users, COUNTRIES_CONFIG]);

  const filteredUsers = useMemo(() => {
    let r = users;
    if (userRole !== "all") r = r.filter((u) => u.role === userRole);
    if (userCountry !== "all") r = r.filter((u) => u.country === userCountry);
    if (userSearch.trim()) {
      const q = userSearch.toLowerCase();
      r = r.filter((u) =>
        u.firstName?.toLowerCase().includes(q) ||
        u.lastName?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.phone?.toLowerCase().includes(q)
      );
    }
    return r;
  }, [users, userRole, userCountry, userSearch]);

  const filteredBookings = useMemo(() => {
    let list = bookings;
    if (bkStatus !== "all") {
      // Le KPI "En cours" agrège plusieurs statuts (voir bkStatus="confirmed,preparing,...")
      // — sans ce split, cliquer dessus ne filtrait jamais rien (aucune
      // réservation n'a littéralement ce statut composé), bug réel corrigé.
      const wanted = bkStatus.split(",");
      list = list.filter((b) => wanted.includes(b.status));
    }
    if (bkType   !== "all") list = list.filter((b) => b.type   === bkType);
    if (bkSearch.trim()) {
      const q = bkSearch.toLowerCase();
      list = list.filter((b) =>
        (b.reference || "").toLowerCase().includes(q) ||
        (b.clientInfo?.firstName || "").toLowerCase().includes(q) ||
        (b.clientInfo?.lastName  || "").toLowerCase().includes(q) ||
        (b.clientInfo?.email     || "").toLowerCase().includes(q) ||
        (b.clientInfo?.phone     || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [bookings, bkStatus, bkType, bkSearch]);

  const paginate = (arr, page) => arr.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = (arr) => Math.ceil(arr.length / PAGE_SIZE) || 1;

  // ── Guard ───────────────────────────────────────────────────────────────────
  if (!isAuthenticated || user?.role !== "admin") return null;

  // ── Revenue chart data ──────────────────────────────────────────────────────
  const revByMonth = stats?.revenue?.byMonth || [];
  const maxRev     = Math.max(...revByMonth.map((m) => m.total), 1);

  // ── NAV_GROUPS (défini dans le rendu pour accès au state) ──────────────────
  const pendingVeh = vehicles.filter((v) => v.status === "pending").length;
  const pendingBk  = bookings.filter((b) => b.status === "pending").length;
  const disputedBk = bookings.filter((b) => b.status === "disputed").length;
  // `drivers` couvre désormais tous les statuts (voir loadAll, /api/drivers/pending
  // ?status=all — auparavant "pending" uniquement) : les badges de compteur "à
  // traiter" doivent explicitement filtrer sur pending pour ne pas gonfler avec
  // les profils déjà publiés/rejetés.
  const pendingDriversList = drivers.filter((d) => d.status === "pending");
  const pendingDrivers = pendingDriversList.length;
  const pendingActivities = pendingActivitiesList.length;
  // Ne PAS dériver ce badge de kycList : cette liste est filtrée par kycFilter
  // (statut choisi dans l'UI) et change de contenu selon l'onglet affiché — un
  // badge basé dessus retomberait trompeusement à 0 dès qu'un autre filtre est
  // sélectionné. kycPendingTotal est interrogé indépendamment (voir plus haut).
  const pendingKyc  = kycPendingTotal;
  const pendingValidationTotal = pendingValidationBookings.length + pendingValidationDirect.length;
  const pendingCert = certList.filter((c) => ["level1","level2","level3","level4","level5","level6","level7"].some((l) => c[l]?.status === "submitted")).length;
  const pendingImp = importerProfiles.filter((p) => p.status === "pending").length;
  const pendingInv = invoices.filter((i) => i.status === "pending").length;
  const pendingSub = subRequests.reduce((sum, s) =>
    sum + (s.paymentHistory || []).filter((p) => p.status === "pending").length
        + (s.boosts || []).filter((b) => !b.isActive).length, 0);
  const pendingIe  = ieRequests.filter((r) => r.status === "pending").length;
  const pendingSvcReq = svcReqList.filter((r) => r.status === "pending").length;
  const pendingSupport = supportChats.filter((c) => c.needsReply).length;
  const pendingReports = reports.filter((r) => r.status === "en_attente").length;
  const pendingWa = waConversations.filter((c) => c.status === "escalated").length;
  // Basé sur pvStats (non filtré) plutôt que pvList — pvList reflète les filtres
  // actifs de l'onglet (statut/niveau/type/recherche), donc son décompte
  // s'effondrait faussement dès qu'un admin appliquait un filtre (même bug que
  // l'ancien badge KYC, corrigé séparément).
  const pendingPv       = (pvStats?.byStatus?.en_attente || 0) + (pvStats?.byStatus?.en_cours || 0);
  const foundingPending = foundingList.filter((o) => ["soumis", "en_review"].includes(o.status)).length;

  // Onglets restreints par scope admin — miroir exact des routes réellement
  // gardées par requireAdminScope() côté serveur (server/routes/*.js). Un
  // onglet absent d'ici reste visible à tout admin (aucune route serveur
  // associée ne vérifie de scope, donc le restreindre ici serait trompeur :
  // ni plus ni moins permissif que le backend). adminScope vide/absent ou
  // contenant "super_admin" = accès complet, même règle que requireAdminScope.
  // Miroir EXACT des gardes serveur (requireAdminScope / requireGeneralAdmin).
  // Un onglet visible dont les routes sont refusées donne un écran vide
  // inexplicable ; un onglet masqué dont les routes sont ouvertes est une
  // fausse sécurité. Les deux doivent rester alignés — toute route admin
  // nouvellement scopée côté serveur doit apparaître ici.
  const TAB_SCOPES = {
    // Comptes & conformité
    users:            "users",
    kyc:              "kyc",
    certification:    "partners",
    partner_verif:    "partners",
    secteurs:         "partners",
    pms_partners:     "partners",
    founding_partners:"partners",
    partner_crm:      "partners",
    rental_policies:  "partners",
    // Catalogue
    catalogue:        "catalogue",
    chauffeurs:       "catalogue",
    activites:        "catalogue",
    ads:              "catalogue",
    marketing:        "catalogue",
    // Réservations
    bookings:         "bookings",
    sales_leads:      "bookings",
    pending_validation:"bookings",
    litiges:          "bookings",
    contrats:         "bookings",
    // Import / Export — la logistique relève de DEUX secteurs : un admin
    // assigné à "import_export" comme un admin assigné à "transitaire" y agit
    // (miroir de requireAnyAdminScope côté serveur).
    import_export:    "import_export",
    dossiers_import:  "import_export",
    zone_transit:     ["import_export", "transitaire"],
    logistique:       ["import_export", "transitaire"],
    exportateurs:     "import_export",
    transport:        ["import_export", "transitaire"],
    // Finance
    assurance:        "finance",
    financement:      "finance",
    service_requests: "finance",
    business_config:  "finance",
    import_cost:      "finance",
    reversements:     "finance",
    commissions:      "finance",
    factures:         "finance",
    paiements:        "finance",
    escrow:           "finance",
    analytics:        "finance",
    direction:        "finance",
    // Support & modération
    support:          "support",
    assistance:       "support",
    chat_supervision: "support",
    whatsapp:         "support",
    notifications:    "support",
    email_delivery:   "support",
    reviews:          "moderation",
    reports:          "moderation",
    // Réservé à l'administrateur général
    roles:            "super_admin",
    audit:            "super_admin",
  };
  // Niveau d'accès du compte connecté — `undefined` signifie « inconnu »
  // (session antérieure à la transmission d'adminScope par le serveur), à ne
  // jamais confondre avec « aucune permission ».
  // ADMIN GÉNÉRAL = accès à tout, sans aucune permission à demander : ses
  // identifiants de connexion suffisent. C'est le niveau par défaut d'un compte
  // admin (adminScope vide), ou explicitement "super_admin". Un compte n'est
  // restreint que si des domaines lui ont été assignés — décision explicite.
  const myScopes       = Array.isArray(user?.adminScope) ? user.adminScope : null;
  const isGeneralAdmin = myScopes === null || myScopes.length === 0 || myScopes.includes("super_admin");

  // Ajuster un solde de fidélité relève de la FINANCE, pas de la gestion des
  // comptes : un point vaut de l'argent. Miroir exact de
  // requireAdminScope("finance") côté serveur — l'autorité reste le serveur,
  // ceci évite seulement d'afficher un formulaire qui finirait en 403.
  const canAdjustLoyalty = isGeneralAdmin || (myScopes?.includes("finance") ?? false);

  const canSeeTab = (key) => {
    const scope = TAB_SCOPES[key];
    // L'administrateur général passe partout — y compris quand adminScope est
    // absent (session antérieure au correctif) ou vide (défaut d'un compte
    // admin non restreint). Ce filtre n'est qu'un confort d'affichage :
    // l'autorité reste le serveur (requireAdminScope).
    if (isGeneralAdmin) return true;
    const scopes = user.adminScope;
    // Onglets sans secteur déclaré (vue d'ensemble, santé système) : visibles
    // par tout compte admin.
    if (!scope) return true;
    // Un onglet peut relever de plusieurs secteurs : être assigné à l'un
    // d'eux suffit.
    return Array.isArray(scope) ? scope.some((x) => scopes.includes(x)) : scopes.includes(scope);
  };

  // Menu regroupé par domaine métier (2026-11-02) : mêmes onglets, mêmes
  // droits (TAB_SCOPES) — seul l'ordre et les rubriques changent. Les files
  // à traiter restent résumées en tête de la Vue d'ensemble (« À traiter »).
  const NAV_GROUPS_ALL = [
    {
      label: "PILOTAGE",
      items: [
        { key: "dashboard",  icon: "📊", label: "Vue d'ensemble" },
        { key: "analytics",  icon: "📈", label: "Analytics" },
        { key: "direction",  icon: "🧭", label: "Direction" },
      ],
    },
    {
      label: "COMPTES & CONFORMITÉ",
      items: [
        { key: "users",         icon: "👥", label: `Comptes (${users.length})` },
        { key: "kyc",           icon: "🛡️", label: "KYC / Identités",         badge: pendingKyc },
        { key: "certification", icon: "🏆", label: "Certifications",           badge: pendingCert },
      ],
    },
    {
      label: "PARTENAIRES",
      items: [
        { key: "partner_verif",    icon: "🔍", label: "Vérification Partenaires", badge: pendingPv },
        { key: "secteurs",         icon: "🧭", label: "Secteurs d'activité",     badge: secteursPending || undefined },
        { key: "founding_partners",icon: "🌟", label: "Founding Partners",        badge: foundingPending || undefined },
        { key: "partner_crm",      icon: "🎯", label: "CRM Partenaires" },
        { key: "pms_partners",     icon: "🏪", label: "Partner Hub PMS",          badge: pmsShowrooms.filter(s => !s.isPublished).length || undefined },
      ],
    },
    {
      label: "ANNONCES & CONTENU",
      items: [
        { key: "catalogue", icon: "🚗", label: "Annonces & Validations", badge: pendingVeh + pendingDrivers + liveNewListings },
        { key: "marketing", icon: "🎨", label: "Contenu & Mise en avant" },
        { key: "ads",           icon: "📢", label: "Publicités & Campagnes" },
      ],
    },
    {
      label: "LOCATION & SERVICES",
      items: [
        { key: "bookings",      icon: "📋", label: "Réservations",          badge: pendingBk },
        { key: "pending_validation", icon: "🕐", label: "Demandes à valider", badge: pendingValidationTotal || undefined },
        { key: "contrats",      icon: "📑", label: "Contrats" },
        { key: "chauffeurs",    icon: "👨‍✈️", label: "Chauffeurs",           badge: pendingDrivers },
        { key: "activites",     icon: "🎈", label: "Activités et Loisirs",     badge: pendingActivities },
        { key: "rental_policies",  icon: "🚚", label: "Politiques de location" },
        { key: "financement",   icon: "🏦", label: "Financement" },
        { key: "assurance",     icon: "🔒", label: "Assurance" },
        { key: "service_requests", icon: "🧰", label: "Autres services", badge: pendingSvcReq || undefined },
      ],
    },
    {
      label: "VENTE & PIÈCES",
      items: [
        { key: "sales_leads",   icon: "🎯", label: "Leads vente (essais)" },
        { key: "pieces",        icon: "🔩", label: "Pièces détachées" },
      ],
    },
    {
      label: "IMPORT-EXPORT & LOGISTIQUE",
      items: [
        { key: "import_export", icon: "🌍", label: "Transactions I/E",      badge: pendingIe },
        { key: "exportateurs",  icon: "📦", label: "Partenaires Export",    badge: pendingImp },
        { key: "dossiers_import", icon: "🚢", label: "Dossiers d'import" },
        { key: "zone_transit",    icon: "⚓", label: "Zone Transit" },
        { key: "logistique",      icon: "📦", label: "Logistique" },
        { key: "transport",     icon: "🚢", label: "Transport Intl." },
        { key: "import_cost",   icon: "🧮", label: "Coûts Import" },
      ],
    },
    {
      label: "RÉCLAMATIONS & SUPPORT",
      items: [
        { key: "litiges",       icon: "⚖️",  label: "Litiges",              badge: disputedBk + liveDisputes },
        { key: "support",       icon: "🎧", label: "Support Client",           badge: pendingSupport || undefined },
        { key: "assistance",    icon: "🎫", label: "Demandes d'assistance",    badge: ticketsEnRetard || undefined },
        { key: "chat_supervision", icon: "👁️", label: "Chats Client↔Partenaire" },
        { key: "reports",       icon: "🚩", label: "Signalements",             badge: pendingReports || undefined },
        { key: "reviews",       icon: "⭐", label: "Avis clients" },
      ],
    },
    {
      label: "FINANCE",
      items: [
        { key: "commissions",     icon: "💰", label: "Commissions" },
        { key: "reversements",  icon: "💸", label: "Reversements", badge: payoutsPendingCount || undefined },
        { key: "factures",        icon: "📄", label: "Factures",          badge: pendingInv },
        { key: "paiements",       icon: "💳", label: "Paiements",         badge: pendingSub || undefined },
        { key: "business_config", icon: "⚙️", label: "Configuration métier" },
        { key: "escrow",          icon: "🔐", label: "Séquestre (suspendu)" },
      ],
    },
    {
      label: "COMMUNICATION",
      items: [
        { key: "notifications", icon: "🔔", label: "Notifications & Broadcast" },
        { key: "whatsapp",      icon: "💬", label: "Bot WhatsApp partenaires", badge: pendingWa || undefined },
        { key: "email_delivery",icon: "📧", label: "Emails & Livraison",       badge: emailFailures.length || undefined },
      ],
    },
    {
      label: "SYSTÈME",
      items: [
        { key: "roles", icon: "🔑", label: "Rôles & Permissions" },
        { key: "audit", icon: "📜", label: "Audit Logs" },
        { key: "system_health", icon: "🩺", label: "Santé système" },
      ],
    },
  ];

  const NAV_GROUPS = NAV_GROUPS_ALL
    .map((group) => ({ ...group, items: group.items.filter((i) => canSeeTab(i.key)) }))
    .filter((group) => group.items.length > 0);

  const sansAccents = (x) => String(x).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const filtre = sansAccents(filtreMenu.trim());
  const NAV_GROUPS_AFFICHES = !filtre ? NAV_GROUPS : NAV_GROUPS
    .map((group) => ({ ...group, items: sansAccents(group.label).includes(filtre) ? group.items : group.items.filter((i) => sansAccents(i.label).includes(filtre)) }))
    .filter((group) => group.items.length > 0);

  // Titre de l'onglet actif
  const activeLabel = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.key === activeTab)?.label || "Dashboard";

  return (
    <div className={styles.erp}>

      {/* ── Toast ── */}
      {toast && (
        <div className={`${styles.toast} ${toast.type === "error" ? styles.toastError : styles.toastSuccess}`}>
          {toast.type === "error" ? "❌" : "✅"} {toast.msg}
        </div>
      )}

      {/* ── Remboursements manuels en attente (Booking Engine, 2026-09) ──
          Reste visible au-delà du toast (Orange Money/espèces — aucune
          automatisation possible, voir refundService.js) jusqu'à ce qu'un
          admin confirme l'avoir traité hors plateforme. */}
      {pendingManualRefunds.length > 0 && (
        <div style={{ position: "fixed", bottom: 20, left: 20, zIndex: 9998, display: "flex", flexDirection: "column", gap: 8, maxWidth: 340 }}>
          {pendingManualRefunds.map((r) => (
            <div key={r.bookingId} style={{ background: "#fff", border: "1.5px solid #fca5a5", borderRadius: 10, padding: "10px 14px", boxShadow: "0 4px 16px rgba(0,0,0,.12)" }}>
              <div style={{ fontSize: ".78rem", fontWeight: 700, color: "#991b1b", marginBottom: 4 }}>💸 {r.reference}</div>
              <div style={{ fontSize: ".74rem", color: "#64748b", marginBottom: 8 }}>{r.reason}</div>
              <label htmlFor={`ref-remb-${r.bookingId}`} style={{ display: "block", fontSize: ".72rem", fontWeight: 600, color: "#334155" }}>Référence de l'opération (obligatoire)</label>
              <input id={`ref-remb-${r.bookingId}`} placeholder="N° de virement, reçu mobile money…"
                value={preuvesRemboursement[r.bookingId]?.reference || ""}
                onChange={(e) => setPreuvesRemboursement((p) => ({ ...p, [r.bookingId]: { ...p[r.bookingId], reference: e.target.value } }))}
                style={{ width: "100%", boxSizing: "border-box", minHeight: 36, margin: "2px 0 6px", padding: "4px 8px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: ".78rem" }} />
              <label htmlFor={`date-remb-${r.bookingId}`} style={{ display: "block", fontSize: ".72rem", fontWeight: 600, color: "#334155" }}>Date du remboursement</label>
              <input id={`date-remb-${r.bookingId}`} type="date" max={new Date().toISOString().slice(0, 10)}
                value={preuvesRemboursement[r.bookingId]?.effectueLe || ""}
                onChange={(e) => setPreuvesRemboursement((p) => ({ ...p, [r.bookingId]: { ...p[r.bookingId], effectueLe: e.target.value } }))}
                style={{ width: "100%", boxSizing: "border-box", minHeight: 36, margin: "2px 0 8px", padding: "4px 8px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: ".78rem" }} />
              <div style={{ display: "flex", gap: 6 }}>
                <button className={styles.btnApprove} style={{ fontSize: ".72rem", padding: "4px 10px" }}
                  disabled={!preuvesRemboursement[r.bookingId]?.reference?.trim()}
                  onClick={() => handleMarkRefunded(r.bookingId, preuvesRemboursement[r.bookingId])}>
                  ✅ Enregistrer le remboursement effectué
                </button>
                <button className={styles.btnSmall} style={{ fontSize: ".72rem" }} onClick={() => setPendingManualRefunds((prev) => prev.filter((x) => x.bookingId !== r.bookingId))}>
                  Ignorer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Confirmation modal ── */}
      {confirm && (
        <ConfirmModal
          message={confirm.message}
          danger={confirm.danger}
          onConfirm={() => { confirm.action(); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* ── Booking action modal ── */}
      {bkActionModal && (
        <div className={styles.overlay} onClick={() => { setBkActionModal(null); setBkCancelReason(""); setBkCancelReasonCode(""); }}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            <p className={styles.confirmMsg}>
              {bkActionModal.action === "cancelled" ? `Annuler la commande de « ${bkActionModal.name} » ?` : `Confirmer la commande de « ${bkActionModal.name} » ?`}
            </p>
            {bkActionModal.action === "cancelled" && (
              <>
                <select
                  style={{ width: "100%", borderRadius: 8, border: "1px solid #e2e8f0", padding: "0.6rem", fontSize: "0.9rem", marginBottom: "0.5rem" }}
                  value={bkCancelReasonCode} onChange={(e) => setBkCancelReasonCode(e.target.value)}
                >
                  <option value="">— Motif de l'annulation (obligatoire) —</option>
                  {PARTNER_CANCEL_REASONS.map(([code, label]) => (
                    <option key={code} value={code}>{label}</option>
                  ))}
                </select>
                <textarea
                  style={{ width: "100%", borderRadius: 8, border: "1px solid #e2e8f0", padding: "0.6rem", fontSize: "0.9rem", marginBottom: "0.75rem", resize: "vertical" }}
                  rows={2} placeholder="Précisions (optionnel)..."
                  value={bkCancelReason} onChange={(e) => setBkCancelReason(e.target.value)}
                />
              </>
            )}
            <div className={styles.confirmActions}>
              <button
                className={bkActionModal.action === "cancelled" ? styles.btnDanger : styles.btnPrimary}
                disabled={bkActionModal.action === "cancelled" && !bkCancelReasonCode}
                onClick={() => {
                  adminUpdateBooking(bkActionModal.id, bkActionModal.action, bkCancelReason, bkCancelReasonCode);
                  setBkActionModal(null); setBkCancelReason(""); setBkCancelReasonCode("");
                }}
              >Confirmer</button>
              <button className={styles.btnGhost} onClick={() => { setBkActionModal(null); setBkCancelReason(""); setBkCancelReasonCode(""); }}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal résolution litige ── */}
      {docsModal && (
        <ClientDocumentsModal booking={docsModal.booking} token={token} onClose={() => setDocsModal(null)} />
      )}
      {disputeModal && (
        <div className={styles.overlay} onClick={() => setDisputeModal(null)}>
          <div className={styles.confirmBox} style={{ maxWidth:500, width:"95%" }} onClick={e => e.stopPropagation()}>
            <p className={styles.confirmMsg}>⚖️ Résoudre le litige — {disputeModal.booking.reference}</p>
            <p style={{ fontSize:".85rem", color:"#64748b", marginBottom:12 }}>
              Client : <strong>{disputeModal.booking.clientInfo?.firstName} {disputeModal.booking.clientInfo?.lastName}</strong><br/>
              Raison : {disputeModal.booking.clientValidation?.disputeReason || "Non précisée"}
            </p>
            {/* Bug réel corrigé (audit) : le partenaire peut désormais répondre à
                un litige (VendorDashboard) — sans ça, l'admin tranchait sans
                jamais voir ses éventuels éléments de réponse. */}
            {disputeDocs && (
              <div style={{ marginBottom: 12 }}>
                <p style={{ margin:"0 0 6px", fontSize:".78rem", fontWeight:700, color:"#0f1b3f" }}>📄 Documents joints à cette réservation :</p>
                <ClientDocuments docs={disputeDocs} reference={disputeModal.booking.reference} />
              </div>
            )}
            {disputeModal.booking.partnerDisputeResponse?.respondedAt && (
              <div style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:8, padding:"8px 12px", marginBottom:12 }}>
                <p style={{ margin:0, fontSize:".78rem", fontWeight:700, color:"#0f1b3f" }}>💬 Réponse du partenaire :</p>
                <p style={{ margin:"4px 0 0", fontSize:".83rem", color:"#334155" }}>{disputeModal.booking.partnerDisputeResponse.message}</p>
              </div>
            )}
            <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:14 }}>
              <label style={{ fontSize:".85rem", fontWeight:600 }}>Décision :</label>
              <select value={disputeResol} onChange={e=>setDisputeResol(e.target.value)}
                style={{ padding:"0.5rem", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:".9rem" }}>
                <option value="completed">✅ Valider — service effectué (marquer terminé)</option>
                <option value="compensated">💰 Compensation — service partiel (terminé + remboursement partiel)</option>
                <option value="cancelled">❌ Annuler — service non conforme</option>
              </select>
              <textarea rows={3} placeholder="Note administrative (visible dans les logs)..."
                value={disputeNote} onChange={e=>setDisputeNote(e.target.value)}
                style={{ padding:"0.5rem", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:".85rem", resize:"vertical" }} />
            </div>
            <div className={styles.confirmActions}>
              <button className={disputeResol==="cancelled"?styles.btnDanger:styles.btnPrimary}
                onClick={() => { adminResolveDispute(disputeModal.booking._id, disputeResol, disputeNote, disputeResol === "compensated"); setDisputeModal(null); }}>
                ⚖️ Confirmer la résolution
              </button>
              <button className={styles.btnGhost} onClick={() => setDisputeModal(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal force complétion ── */}
      {forceModal && (
        <div className={styles.overlay} onClick={() => setForceModal(null)}>
          <div className={styles.confirmBox} style={{ maxWidth:460, width:"95%" }} onClick={e => e.stopPropagation()}>
            <p className={styles.confirmMsg}>⚡ Forcer la complétion — {forceModal.booking.reference}</p>
            <p style={{ fontSize:".85rem", color:"#64748b", marginBottom:12 }}>
              Cette action finalise la commande sans validation client. À utiliser uniquement si la commande est bloquée.
            </p>
            <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:14 }}>
              <label style={{ fontSize:".85rem", fontWeight:600 }}>Montant final (USD) :</label>
              <input type="number" min="0" value={forceAmount} onChange={e=>setForceAmount(e.target.value)}
                placeholder={`Montant original: ${forceModal.booking.montantTotal||0}`}
                style={{ padding:"0.5rem", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:".9rem" }} />
              <label style={{ fontSize:".85rem", fontWeight:600 }}>Motif (obligatoire) :</label>
              <textarea rows={2} placeholder="Ex: Accord verbal confirmé par partenaire le 22/06/2026..."
                value={forceNote} onChange={e=>setForceNote(e.target.value)} required
                style={{ padding:"0.5rem", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:".85rem", resize:"vertical" }} />
            </div>
            <div className={styles.confirmActions}>
              <button className={styles.btnPrimary} disabled={!forceNote.trim()}
                onClick={() => { adminForceComplete(forceModal.booking._id, Number(forceAmount)||forceModal.booking.montantTotal, forceNote); setForceModal(null); }}>
                ⚡ Finaliser la commande
              </button>
              <button className={styles.btnGhost} onClick={() => setForceModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Broadcast notification modal ── */}
      {broadcastModal && (
        <div className={styles.overlay} onClick={() => setBroadcastModal(false)}>
          <div className={styles.confirmBox} style={{ maxWidth: 480, width: "95%" }} onClick={(e) => e.stopPropagation()}>
            <p className={styles.confirmMsg}>📢 Envoyer une notification à tous les utilisateurs</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "0.75rem" }}>
              <input style={{ borderRadius: 8, border: "1px solid #e2e8f0", padding: "0.55rem 0.75rem", fontSize: "0.9rem" }}
                placeholder="Titre *" value={broadcastForm.titre}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, titre: e.target.value })} />
              <textarea style={{ borderRadius: 8, border: "1px solid #e2e8f0", padding: "0.55rem 0.75rem", fontSize: "0.9rem", resize: "vertical" }}
                rows={3} placeholder="Message *" value={broadcastForm.message}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, message: e.target.value })} />
              <select style={{ borderRadius: 8, border: "1px solid #e2e8f0", padding: "0.55rem 0.75rem", fontSize: "0.9rem" }}
                value={broadcastForm.targetRole}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, targetRole: e.target.value })}>
                <option value="all">Tous les utilisateurs</option>
                <option value="client">Clients uniquement</option>
                <option value="partenaire">Partenaires uniquement</option>
                <option value="chauffeur">Chauffeurs uniquement</option>
                <option value="importateur">Importateurs (Corporate)</option>
              </select>
              <input style={{ borderRadius: 8, border: "1px solid #e2e8f0", padding: "0.55rem 0.75rem", fontSize: "0.9rem" }}
                placeholder="Lien (ex: /catalogue) — optionnel" value={broadcastForm.lien}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, lien: e.target.value })} />
            </div>
            <div className={styles.confirmActions}>
              <button className={styles.btnPrimary} disabled={broadcastSending} onClick={sendBroadcast}>
                {broadcastSending ? "Envoi..." : "📤 Envoyer"}
              </button>
              <button className={styles.btnGhost} onClick={() => setBroadcastModal(false)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ OVERLAY MOBILE ══ */}
      {sidebarOpen && isMobile.current && (
        <div className={`${styles.sidebarOverlay} ${styles.visible}`}
          onClick={() => setSidebarOpen(false)} />
      )}

      {/* ══ SIDEBAR ══ */}
      <aside className={`${styles.sidebar} ${!sidebarOpen ? styles.sidebarCollapsed : styles.sidebarOpen}`}>
        {/* Logo */}
        <div className={styles.sidebarLogo}>
          <span className={styles.sidebarLogoIcon}>⚙️</span>
          <span className={styles.sidebarLogoText}>VIT-AUTO ERP</span>
        </div>

        {sidebarOpen && (
          <div className={styles.navFiltre}>
            <input type="search" value={filtreMenu} onChange={(e) => setFiltreMenu(e.target.value)}
              placeholder="Filtrer le menu…" aria-label="Filtrer le menu d'administration" />
          </div>
        )}

        {/* Navigation groupée */}
        {NAV_GROUPS_AFFICHES.length === 0 && <p className={styles.navVide}>Aucune rubrique ne correspond.</p>}
        {NAV_GROUPS_AFFICHES.map((group) => (
          <div key={group.label}>
            <span className={styles.navGroup}>{group.label}</span>
            {group.items.map((item) => (
              <button
                key={item.key}
                className={`${styles.navItem} ${activeTab === item.key ? styles.navActive : ""}`}
                onClick={() => {
                  setActiveTab(item.key);
                  setFiltreMenu("");
                  if (isMobile.current) setSidebarOpen(false);
                }}
                title={!sidebarOpen ? item.label : undefined}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                <span className={styles.navLabel}>{item.label.replace(/ \(\d+\)$/, "")}</span>
                {item.wip && <span className={styles.wipBadge}>Bientôt</span>}
                {!item.wip && item.badge > 0 && (
                  <span className={styles.navBadge}>{item.badge}</span>
                )}
              </button>
            ))}
          </div>
        ))}
      </aside>

      {/* ══ CONTENU PRINCIPAL ══ */}
      <div className={`${styles.content} ${!sidebarOpen ? styles.contentExpanded : ""}`}>

        {/* ── Topbar ── */}
        <header className={styles.topbar}>
          <button className={styles.menuBtn}
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? "Réduire le menu" : "Ouvrir le menu"}>
            {sidebarOpen && !isMobile.current ? "◀" : "☰"}
          </button>
          <span className={styles.topbarTitle}>
            {NAV_GROUPS.flatMap((g) => g.items).find((i) => i.key === activeTab)?.icon || "⚙️"}{" "}
            {activeLabel}
          </span>

          {/* Recherche globale — cherche véhicules/chauffeurs/annonces Import-Export
              en une fois, classés par entité, quel que soit l'onglet actif. */}
          <div className={styles.rechercheGlobale}>
            <input
              type="text"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="🔎 Rechercher une annonce (tous types)…"
              style={{ width: "100%", padding: "7px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".82rem" }}
            />
            {globalSearchResults && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 200,
                background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 10,
                boxShadow: "0 8px 24px rgba(0,0,0,.12)", maxHeight: 420, overflowY: "auto", padding: 10,
              }}>
                {globalSearchTotal === 0 ? (
                  <p style={{ margin: 0, padding: 8, fontSize: ".82rem", color: "#94a3b8" }}>Aucune annonce ne correspond, quelle que soit l'entité.</p>
                ) : (
                  <>
                    {globalSearchResults.vehicles.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <p style={{ margin: "0 0 4px", fontSize: ".72rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>🚗 Véhicules ({globalSearchResults.vehicles.length})</p>
                        {globalSearchResults.vehicles.map((v) => (
                          <div key={v._id || v.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 8px", borderRadius: 8, cursor: "pointer" }}
                            onClick={() => { setActiveTab("catalogue"); setGlobalSearch(""); }}>
                            <span style={{ fontSize: ".82rem" }}>{v.title || v.name} <span style={{ color: "#94a3b8" }}>— {v.owner?.firstName || ""}</span></span>
                            <Badge label={v.status === "approved" ? "Publiée" : v.status === "pending" ? "En attente" : v.status} color={v.status === "approved" ? "#10b981" : v.status === "pending" ? "#f59e0b" : "#94a3b8"} bg="#f8fafc" />
                          </div>
                        ))}
                      </div>
                    )}
                    {globalSearchResults.drivers.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <p style={{ margin: "0 0 4px", fontSize: ".72rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>👨‍✈️ Chauffeurs ({globalSearchResults.drivers.length})</p>
                        {globalSearchResults.drivers.map((d) => (
                          <div key={d._id || d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 8px", borderRadius: 8 }}>
                            <span style={{ fontSize: ".82rem" }}>{d.firstName} {d.lastName} <span style={{ color: "#94a3b8" }}>— {d.title || ""}</span></span>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <Badge label={d._searchStatus === "approved" ? "Publié" : d._searchStatus === "pending" ? "En attente" : d._searchStatus} color={d._searchStatus === "approved" ? "#10b981" : d._searchStatus === "pending" ? "#f59e0b" : "#94a3b8"} bg="#f8fafc" />
                              {d._searchStatus === "pending" && (
                                <button onClick={() => handleGlobalApproveDriver(d._id)}
                                  style={{ fontSize: ".72rem", fontWeight: 700, padding: "3px 8px", borderRadius: 6, border: "1.5px solid #10b981", background: "#ecfdf5", color: "#10b981", cursor: "pointer" }}>
                                  ✅ Approuver
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {globalSearchResults.listings.length > 0 && (
                      <div>
                        <p style={{ margin: "0 0 4px", fontSize: ".72rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>🌍 Import/Export ({globalSearchResults.listings.length})</p>
                        {globalSearchResults.listings.map((l) => (
                          <div key={l._id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 8px", borderRadius: 8, cursor: "pointer" }}
                            onClick={() => { setActiveTab("exportateurs"); setGlobalSearch(""); }}>
                            <span style={{ fontSize: ".82rem" }}>{l.title} <span style={{ color: "#94a3b8" }}>— {l.partner?.firstName || ""}</span></span>
                            <Badge label={l.status === "approved" ? "Publiée" : l.status === "pending" ? "En attente" : l.status} color={l.status === "approved" ? "#10b981" : l.status === "pending" ? "#f59e0b" : "#94a3b8"} bg="#f8fafc" />
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <div className={styles.topbarRight}>
            <button
              className={styles.adminBadge}
              onClick={() => navigate("/profile")}
              title={isGeneralAdmin
                ? "Administrateur général — accès complet à toute l'administration"
                : `Accès assigné : ${myScopes.join(", ") || "aucun domaine"}`}
              style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}
            >
              {/* Le niveau d'accès est désormais affiché : rien ne distinguait
                  un administrateur général d'un admin restreint, ce qui rendait
                  incompréhensible qu'un onglet soit absent ou qu'une action
                  soit refusée. */}
              {isGeneralAdmin ? "👑" : "🔐"} {user.firstName} · {isGeneralAdmin ? "Admin général" : "Admin"}
            </button>

            {/* Bouton "Voir le site" — retour au site public */}
            <button
              onClick={() => navigate("/")}
              title="Retour au site public"
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "#ecfdf5", color: "#059669",
                border: "1.5px solid #a7f3d0", borderRadius: 8,
                padding: "6px 12px", fontWeight: 700, fontSize: "0.78rem",
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              🌐 Voir le site
            </button>

            <button
              style={{ background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "7px 12px", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}
              onClick={() => setBroadcastModal(true)} title="Envoyer une notification groupée"
            >
              📢 Broadcast
            </button>
            <button
              style={{ background: "#f1f5f9", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 10px", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", color: "#0f1b3f" }}
              onClick={loadAll} title="Actualiser les données"
            >
              ↻
            </button>
            <button
              onClick={() => logout()}
              title="Déconnexion"
              style={{ background: "#fef2f2", color: "#dc2626", border: "1.5px solid #fca5a5", borderRadius: 8, padding: "6px 10px", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}
            >
              ⏻
            </button>
          </div>
        </header>

        {/* ── Zone de scroll ── */}
        <div className={styles.scrollZone}>

      {/* Compte admin sans AUCUNE permission : message explicite plutôt qu'un
          panneau vide. Depuis le passage aux permissions explicites, un compte
          fraîchement promu admin n'a aucun droit tant qu'un administrateur
          général ne lui en attribue pas — sans ce message, il verrait un écran
          désert sans comprendre pourquoi. */}
      {/* Échecs de chargement — affichés au lieu de laisser des sections vides
          sans explication (cause du signalement « Comptes n'affiche rien »). */}
      {loadErrors.length > 0 && (
        <div style={{ background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: 12, padding: "12px 16px", margin: "0 0 16px" }}>
          <div style={{ fontWeight: 800, color: "#b91c1c", fontSize: ".88rem", marginBottom: 6 }}>
            ⚠️ {loadErrors.length} section{loadErrors.length > 1 ? "s" : ""} n'{loadErrors.length > 1 ? "ont" : "a"} pas pu être chargée{loadErrors.length > 1 ? "s" : ""}
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: ".83rem", color: "#7f1d1d", lineHeight: 1.7 }}>
            {loadErrors.map((e) => (
              <li key={e.label}><strong>{e.label}</strong> — {e.message}</li>
            ))}
          </ul>
          <button onClick={loadAll}
            style={{ marginTop: 10, background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontWeight: 700, fontSize: ".8rem", cursor: "pointer" }}>
            ↻ Réessayer
          </button>
        </div>
      )}

      {loading ? (
        <div className={styles.loadingBox}>
          <div className={styles.spinner} />
          <p>Chargement des données...</p>
        </div>
      ) : (

        <>
          {/* ══════════════════════ TAB MARKETING & CMS ══════════════ */}
          {activeTab === "marketing" && (
            <MarketingSection vehicles={vehicles} token={token} onRefresh={loadAll}
              adsList={adsList} adsLoading={adsLoading} adForm={adForm} setAdForm={setAdForm} adSaving={adSaving}
              saveAd={saveAd} toggleAdActive={toggleAdActive} deleteAd={deleteAd} />
          )}

          {/* ══════════════════════ TAB CATALOGUE ════════════════════ */}
          {activeTab === "catalogue" && (
            <CatalogueSection
              vehicles={vehicles} drivers={drivers} bookings={bookings}
              vehiclesTotal={vehiclesTotal} loadMoreVehicles={loadMoreVehicles}
              headers={headers} token={token}
              onRefresh={loadAll}
              showToast={showToast}
              setConfirm={setConfirm}
              rejectModal={rejectModal} setRejectModal={setRejectModal}
              rejectReason={rejectReason} setRejectReason={setRejectReason}
              driverRejectModal={driverRejectModal} setDriverRejectModal={setDriverRejectModal}
              driverRejectReason={driverRejectReason} setDriverRejectReason={setDriverRejectReason}
              updateVehicleStatus={updateVehicleStatus}
              deleteVehicle={deleteVehicle}
              updateDriverStatusInPlace={updateDriverStatusInPlace}
            />
          )}


          {/* ══════════════════════ TAB DASHBOARD ══════════════════════ */}
          {activeTab === "dashboard" && (
            <VueEnsembleSection
              canSeeTab={canSeeTab}
              disputedBk={disputedBk}
              fmtUSD={fmtUSD}
              ieRequests={ieRequests}
              ieRequestsTotal={ieRequestsTotal}
              maxRev={maxRev}
              pendingActivities={pendingActivities}
              pendingCert={pendingCert}
              pendingDrivers={pendingDrivers}
              pendingIe={pendingIe}
              pendingImp={pendingImp}
              pendingInv={pendingInv}
              pendingKyc={pendingKyc}
              pendingReports={pendingReports}
              pendingSub={pendingSub}
              pendingSvcReq={pendingSvcReq}
              pendingValidationTotal={pendingValidationTotal}
              revByMonth={revByMonth}
              setActiveTab={setActiveTab}
              stats={stats}
            />
          )}

          {/* ══════════════════════ TAB UTILISATEURS ══════════════════════ */}
          {activeTab === "users" && (
            <ComptesSection
              COUNTRIES_CONFIG={COUNTRIES_CONFIG}
              changeRole={changeRole}
              deleteUser={deleteUser}
              filteredUsers={filteredUsers}
              loadMoreUsers={loadMoreUsers}
              openLoyalty={openLoyalty}
              openTrustOverview={openTrustOverview}
              paginate={paginate}
              setConfirm={setConfirm}
              setUserCountry={setUserCountry}
              setUserPage={setUserPage}
              setUserRole={setUserRole}
              setUserSearch={setUserSearch}
              setVitrineModal={setVitrineModal}
              toggleBlock={toggleBlock}
              totalPages={totalPages}
              updatePhone={updatePhone}
              user={user}
              userCountry={userCountry}
              userCountryOptions={userCountryOptions}
              userPage={userPage}
              userRole={userRole}
              userSearch={userSearch}
              users={users}
              usersTotal={usersTotal}
            />
          )}

          {/* ── Modal fidélité client (lecture seule) ── */}
          {loyaltyModal && (
            <div className={styles.overlay} onClick={() => setLoyaltyModal(null)}>
              <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
                <h3 style={{ margin: "0 0 4px", color: "#0f1b3f", fontSize: "1rem" }}>🎁 Fidélité — {loyaltyModal.firstName} {loyaltyModal.lastName}</h3>
                <p style={{ margin: "0 0 16px", fontSize: ".78rem", color: "#94a3b8" }}>
                  Lecture seule — 100 points valent 1 USD de remise. Aucun ajustement manuel : créditer des points revient à créditer de l'argent.
                </p>
                {loyaltyLoading ? (
                  <div style={{ textAlign: "center", padding: "2rem 0", color: "#94a3b8" }}>Chargement…</div>
                ) : loyaltyData ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: ".85rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                      <span>Solde dépensable</span>
                      {/* La valeur monétaire est le chiffre utile quand un client
                          conteste une remise — un solde en points seul ne dit pas
                          ce qu'il vaut. `pointsValueUSD` est calculé par le
                          serveur au taux officiel ; fmtUSD l'affiche dans la
                          devise active. */}
                      <strong>
                        {loyaltyData.points} pts
                        <span style={{ color: "#64748b", fontWeight: 500 }}>
                          {" "}≈ {fmtUSD(loyaltyData.pointsValueUSD ?? 0)} de remise
                        </span>
                      </strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                      <span>Cumul à vie (base du palier)</span><strong>{loyaltyData.lifetimePoints} pts</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                      <span>Palier</span>
                      <strong>
                        {loyaltyData.tier?.label || loyaltyData.tier?.key || "—"}
                        {/* Le palier recalculé et celui stocké sur le compte doivent
                            coïncider : un écart est précisément ce qu'un admin vient
                            chercher ici, il ne doit pas rester invisible. */}
                        {loyaltyData.storedTier && loyaltyData.tier?.key && loyaltyData.storedTier !== loyaltyData.tier.key && (
                          <span style={{ color: "#ef4444", marginLeft: 6 }}>⚠️ compte : {loyaltyData.storedTier}</span>
                        )}
                      </strong>
                    </div>
                    {loyaltyData.nextTier && (
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                        <span>Prochain palier</span><strong>{loyaltyData.nextTier.label || loyaltyData.nextTier.key} — encore {loyaltyData.pointsToNextTier} pts</strong>
                      </div>
                    )}
                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontWeight: 700, fontSize: ".8rem", color: "#0f1b3f", marginBottom: 6 }}>
                        Mouvements ({loyaltyData.total})
                      </div>
                      {loyaltyData.transactions?.length ? (
                        <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                          {loyaltyData.transactions.map((t) => (
                            <div key={t._id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 12px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: ".78rem" }}>
                              {/* Un ajustement manuel doit se distinguer d'un
                                  mouvement automatique : c'est une décision
                                  humaine, et son motif est le seul élément qui
                                  la rende compréhensible plus tard. */}
                              <span style={{ color: "#64748b" }}>
                                {new Date(t.createdAt).toLocaleDateString("fr-FR")} ·{" "}
                                {t.reason?.startsWith("admin_adjust:")
                                  ? <>✍️ Ajustement manuel — {t.reason.slice("admin_adjust:".length)}</>
                                  : t.reason}
                                {t.booking?.reference ? ` (${t.booking.reference})` : ""}
                              </span>
                              <strong style={{ color: t.type === "credit" || t.type === "referral" ? "#10b981" : "#ef4444", whiteSpace: "nowrap" }}>
                                {t.type === "credit" || t.type === "referral" ? "+" : "−"}{t.points} pts
                              </strong>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ color: "#94a3b8", fontSize: ".8rem", margin: 0 }}>Aucun mouvement enregistré.</p>
                      )}
                    </div>

                    {canAdjustLoyalty && (
                      <div style={{ marginTop: 10, paddingTop: 12, borderTop: "1.5px solid #e2e8f0" }}>
                        <div style={{ fontWeight: 700, fontSize: ".8rem", color: "#0f1b3f", marginBottom: 8 }}>
                          Ajustement manuel
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                          <select value={loyaltyForm.direction}
                            onChange={(e) => setLoyaltyForm((f) => ({ ...f, direction: e.target.value }))}
                            style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 10px", fontSize: ".82rem" }}>
                            <option value="credit">Créditer</option>
                            <option value="debit">Débiter</option>
                          </select>
                          <input type="number" min="1" step="1" placeholder="Points"
                            value={loyaltyForm.points}
                            onChange={(e) => setLoyaltyForm((f) => ({ ...f, points: e.target.value }))}
                            style={{ width: 110, border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 10px", fontSize: ".82rem" }} />
                          {/* Ce que l'opération vaut, affiché pendant la saisie :
                              c'est le chiffre qui fait repérer un zéro de trop
                              avant de valider, pas après. */}
                          <span style={{ alignSelf: "center", fontSize: ".8rem", color: "#64748b" }}>
                            ≈ {fmtUSD(pointsToUSD(Number(loyaltyForm.points) || 0))}
                          </span>
                        </div>
                        <input type="text" placeholder="Motif (obligatoire) — ex. « Geste commercial, dossier #4821 »"
                          value={loyaltyForm.reason} maxLength={300}
                          onChange={(e) => setLoyaltyForm((f) => ({ ...f, reason: e.target.value }))}
                          style={{ width: "100%", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 10px", fontSize: ".82rem", marginBottom: 8 }} />
                        {loyaltyForm.direction === "credit" && (
                          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".78rem", color: "#64748b", marginBottom: 10, cursor: "pointer" }}>
                            <input type="checkbox" checked={loyaltyForm.countsTowardTier}
                              onChange={(e) => setLoyaltyForm((f) => ({ ...f, countsTowardTier: e.target.checked }))} />
                            Compter dans le cumul à vie (peut faire monter de palier — à réserver au rattrapage de points non attribués, pas à un geste commercial)
                          </label>
                        )}
                        <button
                          onClick={submitLoyaltyAdjust}
                          disabled={loyaltySaving || !loyaltyForm.points || loyaltyForm.reason.trim().length < 3}
                          style={{
                            padding: "8px 16px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: ".8rem",
                            background: loyaltyForm.direction === "credit" ? "#16a34a" : "#dc2626", color: "#fff",
                            cursor: loyaltySaving ? "not-allowed" : "pointer",
                            opacity: (loyaltySaving || !loyaltyForm.points || loyaltyForm.reason.trim().length < 3) ? 0.5 : 1,
                          }}>
                          {loyaltySaving ? "Enregistrement…" : loyaltyForm.direction === "credit" ? "Créditer" : "Débiter"}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <p style={{ color: "#ef4444", fontSize: ".85rem" }}>Impossible de charger la fidélité de ce compte.</p>
                )}
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
                  <button className={styles.btnGhost} onClick={() => setLoyaltyModal(null)}>Fermer</button>
                </div>
              </div>
            </div>
          )}

          {/* ── Modal vue de confiance unifiée ── */}
          {vitrineModal && (
            <div className={styles.overlay} onClick={() => setVitrineModal(null)}>
              <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
                <VitrinePartage partenaireId={vitrineModal._id} />
                <button className={styles.btnGhost} onClick={() => setVitrineModal(null)} style={{ width: "100%", minHeight: 44 }}>
                  Fermer
                </button>
              </div>
            </div>
          )}

          {trustModal && (
            <div className={styles.overlay} onClick={() => setTrustModal(null)}>
              <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
                <h3 style={{ margin: "0 0 4px", color: "#0f1b3f", fontSize: "1rem" }}>🛡️ Confiance — {trustModal.firstName} {trustModal.lastName}</h3>
                <p style={{ margin: "0 0 16px", fontSize: ".78rem", color: "#94a3b8" }}>
                  Vue agrégée en lecture seule des 6 systèmes existants — aucune fusion de données.
                </p>
                {trustLoading ? (
                  <div style={{ textAlign: "center", padding: "2rem 0", color: "#94a3b8" }}>Chargement…</div>
                ) : trustOverview ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: ".85rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                      <span>Type de vendeur (sellerType)</span><strong>{trustOverview.sellerType || "—"}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                      <span>KYC identité</span><strong>{trustOverview.kyc.status || "—"} {trustOverview.kyc.badge ? `(${trustOverview.kyc.badge})` : ""}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                      <span>Badge de certification (User)</span><strong>{trustOverview.certificationBadge || "—"}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                      <span>Certification partenaire (7 niveaux)</span><strong>{trustOverview.partnerCertification ? `${trustOverview.partnerCertification.status} — ${trustOverview.partnerCertification.badge}` : "aucun dossier"}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                      <span>Vérification Partenaire (trust score)</span><strong>{trustOverview.partnerVerification ? `${trustOverview.partnerVerification.status} — ${trustOverview.partnerVerification.trustScore}/100 (${trustOverview.partnerVerification.trustLevel})` : "aucun dossier"}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                      <span>Founding Partner</span><strong>{trustOverview.foundingPartner ? `${trustOverview.foundingPartner.isFoundingPartner ? "Oui" : "Non"} — ${trustOverview.foundingPartner.legalEntityType || "—"} — ${trustOverview.foundingPartner.status}` : "aucun dossier"}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                      <span>Profil Importateur</span><strong>{trustOverview.importerProfile ? `${trustOverview.importerProfile.status} — ${trustOverview.importerProfile.badgeLevel}` : "aucun dossier"}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                      <span>Showroom PMS (trust score)</span><strong>{trustOverview.showroom ? `${trustOverview.showroom.trustScore ?? "—"}/100 — ${trustOverview.showroom.isPublished ? "publié" : "non publié"}` : "aucun showroom"}</strong>
                    </div>

                    {/* Détail par entité — le Founding Partner Program est désormais
                        PAR ENTITÉ (voir PartnerOnboarding.businessId) : un même
                        partenaire peut avoir plusieurs entités, chacune avec son
                        propre dossier. */}
                    {trustOverview.entities?.length > 0 && (
                      <div style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>🏢 Entités ({trustOverview.entities.length})</div>
                        {trustOverview.entities.map((e, i) => (
                          <div key={e.business?.id || i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", fontSize: ".8rem", borderTop: i > 0 ? "1px solid #e2e8f0" : "none" }}>
                            <span>{e.business?.companyName || "Entité inconnue"}</span>
                            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <strong>{e.onboarding ? `${e.onboarding.status}${e.onboarding.isFoundingPartner ? " 🌟" : ""}` : "aucun dossier"}</strong>
                              {/* Renvoi du Founding Partner Program dédié à cette entité, sans
                                  quitter la vue de confiance (accessible depuis Comptes ET
                                  KYC/Vérification Partenaire) — évite d'aller chercher le
                                  dossier dans l'onglet Founding Partner pour cette action. */}
                              {["loi_envoyee", "accord_envoye"].includes(e.onboarding?.status) && (
                                <button
                                  onClick={() => foundingResendDocuments(e.onboarding._id)}
                                  disabled={foundingRowActionId === e.onboarding._id}
                                  title="Renvoyer le lien de signature en attente"
                                  style={{ padding: "2px 8px", borderRadius: 6, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: ".7rem", cursor: foundingRowActionId === e.onboarding._id ? "not-allowed" : "pointer", opacity: foundingRowActionId === e.onboarding._id ? 0.6 : 1 }}>
                                  🔄 Renvoyer
                                </button>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Drill-through documents — booléens de présence uniquement,
                        jamais les images/fichiers bruts (voir usersController.js) ;
                        l'ouverture des documents eux-mêmes reste dans les onglets
                        KYC/Founding Partner existants. */}
                    {trustOverview.documents && (
                      <div style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>📄 Documents</div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".8rem", padding: "2px 0" }}>
                          <span>Pièce d'identité (recto)</span><strong>{trustOverview.documents.identityFront ? "✓ fourni" : "—"}</strong>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".8rem", padding: "2px 0" }}>
                          <span>Selfie KYC</span><strong>{trustOverview.documents.kycSelfie ? "✓ fourni" : "—"}</strong>
                        </div>
                        {trustOverview.documents.driverProfiles?.map((d) => (
                          <div key={d.id} style={{ display: "flex", justifyContent: "space-between", fontSize: ".8rem", padding: "2px 0" }}>
                            <span>Profil chauffeur — {d.name}</span><strong>{d.status} — CV {d.hasCv ? "✓" : "—"}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : <p style={{ color: "#dc2626" }}>Erreur de chargement.</p>}
                <div className={styles.confirmActions} style={{ marginTop: 16 }}>
                  <button className={styles.btnGhost} onClick={() => setTrustModal(null)}>Fermer</button>
                </div>
              </div>
            </div>
          )}

          {/* ══════════ TAB DEMANDES À VALIDER (gate admin, audit 2026-08) ══════════ */}
          {activeTab === "pending_validation" && (
            <DemandesAValiderSection
              adminValidateBookingReq={adminValidateBookingReq}
              adminValidateDirectReq={adminValidateDirectReq}
              loadPendingValidation={loadPendingValidation}
              pendingValidationBookings={pendingValidationBookings}
              pendingValidationDirect={pendingValidationDirect}
              pendingValidationLoading={pendingValidationLoading}
              setDocsModal={setDocsModal}
              setValidationRejectModal={setValidationRejectModal}
              setValidationRejectReason={setValidationRejectReason}
            />
          )}

          {/* ── Modale motif de refus (réservation ou achat direct) ── */}
          {validationRejectModal && (
            <div className={styles.overlay} onClick={() => { setValidationRejectModal(null); setValidationRejectReason(""); }}>
              <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
                <h3 style={{ margin: "0 0 12px", fontSize: "1rem", color: "#0f1b3f" }}>Motif du refus</h3>
                <textarea
                  value={validationRejectReason}
                  onChange={(e) => setValidationRejectReason(e.target.value)}
                  placeholder="Expliquez pourquoi cette demande est refusée (visible par le client)…"
                  rows={4}
                  style={{ width: "100%", border: "1.5px solid #e2e8f0", borderRadius: 10, padding: 10, fontSize: ".85rem", fontFamily: "inherit", resize: "vertical", marginBottom: 14 }}
                />
                <div className={styles.confirmActions}>
                  <button className={styles.btnGhost} onClick={() => { setValidationRejectModal(null); setValidationRejectReason(""); }}>Annuler</button>
                  <button className={styles.btnDanger}
                    disabled={!validationRejectReason.trim()}
                    onClick={confirmValidationReject}>
                    Confirmer le refus
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════ TAB COMMANDES ══════════════════════ */}
          {activeTab === "bookings" && (
            <ReservationsSection
              adminDeleteBooking={adminDeleteBooking}
              adminUpdateBooking={adminUpdateBooking}
              bkPage={bkPage}
              bkSearch={bkSearch}
              bkStatus={bkStatus}
              bkType={bkType}
              bookings={bookings}
              bookingsTotal={bookingsTotal}
              exportBookings={exportBookings}
              filteredBookings={filteredBookings}
              fmtUSD={fmtUSD}
              loadAll={loadAll}
              loadMoreBookings={loadMoreBookings}
              paginate={paginate}
              setBkActionModal={setBkActionModal}
              setBkCancelReason={setBkCancelReason}
              setBkCancelReasonCode={setBkCancelReasonCode}
              setBkPage={setBkPage}
              setBkSearch={setBkSearch}
              setBkStatus={setBkStatus}
              setBkType={setBkType}
              setConfirm={setConfirm}
              setDisputeModal={setDisputeModal}
              setDisputeNote={setDisputeNote}
              setDisputeResol={setDisputeResol}
              setDocsModal={setDocsModal}
              setForceAmount={setForceAmount}
              setForceModal={setForceModal}
              setForceNote={setForceNote}
              showToast={showToast}
              token={token}
              totalPages={totalPages}
            />
          )}

          {/* ══════════════════════ TAB EXPORTATEURS ══════════════════════ */}
          {activeTab === "exportateurs" && (
            <ExportateursSection
              filteredImporterListings={filteredImporterListings}
              filteredImporterProfiles={filteredImporterProfiles}
              headers={headers}
              importerFilter={importerFilter}
              importerListingCountryOptions={importerListingCountryOptions}
              importerListingVilleOptions={importerListingVilleOptions}
              importerListings={importerListings}
              importerListingsTotal={importerListingsTotal}
              importerLoading={importerLoading}
              importerProfiles={importerProfiles}
              listingCountryFilter={listingCountryFilter}
              listingFilter={listingFilter}
              listingVilleFilter={listingVilleFilter}
              loadImporters={loadImporters}
              loadMoreImporterListings={loadMoreImporterListings}
              openEditIeListing={openEditIeListing}
              setExporterDetail={setExporterDetail}
              setImporterFilter={setImporterFilter}
              setListingCountryFilter={setListingCountryFilter}
              setListingFilter={setListingFilter}
              setListingRejectModal={setListingRejectModal}
              setListingRejectNote={setListingRejectNote}
              setListingVilleFilter={setListingVilleFilter}
              setReviewDecision={setReviewDecision}
              setReviewModal={setReviewModal}
              showToast={showToast}
            />
          )}

          {/* ── Modal review candidature importateur ── */}
          {reviewModal && (
            <div className={styles.overlay} onClick={() => setReviewModal(null)}>
              <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
                <h3 style={{ margin: "0 0 16px", color: "#0f1b3f", fontSize: "1rem" }}>
                  {reviewDecision.status === "verified" ? "✅ Valider le profil importateur" : "❌ Refuser la candidature"}
                </h3>
                <p style={{ fontSize: ".85rem", color: "#475569", margin: "0 0 14px" }}>
                  <strong>{reviewModal.companyName}</strong> — {reviewModal.userId?.firstName} {reviewModal.userId?.lastName}
                </p>
                {reviewDecision.status === "verified" && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: ".82rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 6 }}>Niveau de badge</label>
                    <select
                      value={reviewDecision.badgeLevel}
                      onChange={(e) => setReviewDecision((d) => ({ ...d, badgeLevel: e.target.value }))}
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: ".88rem" }}
                    >
                      <option value="silver">🥈 Silver</option>
                      <option value="gold">🥇 Gold</option>
                      <option value="platinum">💎 Platinum</option>
                    </select>
                  </div>
                )}
                {reviewDecision.status === "rejected" && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: ".82rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 6 }}>Motif du refus *</label>
                    <textarea
                      rows={3}
                      value={reviewDecision.rejectionReason}
                      onChange={(e) => setReviewDecision((d) => ({ ...d, rejectionReason: e.target.value }))}
                      placeholder="Documents manquants, informations incorrectes..."
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: ".88rem", fontFamily: "inherit", resize: "vertical" }}
                    />
                  </div>
                )}
                <div className={styles.confirmActions}>
                  <button
                    className={reviewDecision.status === "verified" ? styles.btnApprove : styles.btnDanger}
                    onClick={async () => {
                      const r = await fetch(`/api/import-export/importer-profiles/${reviewModal._id}/review`, {
                        method: "PATCH", headers,
                        body: JSON.stringify(reviewDecision),
                      });
                      if (r.ok) {
                        showToast(reviewDecision.status === "verified" ? "Profil validé !" : "Profil refusé.", reviewDecision.status === "rejected" ? "error" : "success");
                        setReviewModal(null);
                        loadImporters();
                      } else {
                        const d = await r.json().catch(() => ({}));
                        showToast(d.message || "Erreur lors de la mise à jour.", "error");
                      }
                    }}
                  >
                    Confirmer
                  </button>
                  <button className={styles.btnGhost} onClick={() => setReviewModal(null)}>Annuler</button>
                </div>
              </div>
            </div>
          )}

          {/* ── Modal refus annonce listing ── */}
          {listingRejectModal && (
            <div className={styles.overlay} onClick={() => setListingRejectModal(null)}>
              <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
                <h3 style={{ margin: "0 0 12px", color: "#0f1b3f", fontSize: "1rem" }}>✕ Refuser l'annonce</h3>
                <p style={{ fontSize: ".85rem", color: "#475569", margin: "0 0 12px" }}>
                  <strong>{listingRejectModal.title}</strong>
                </p>
                <label style={{ fontSize: ".82rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 6 }}>Motif (optionnel)</label>
                <textarea
                  rows={3}
                  value={listingRejectNote}
                  onChange={(e) => setListingRejectNote(e.target.value)}
                  placeholder="Photos insuffisantes, prix incorrect..."
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: ".88rem", fontFamily: "inherit", resize: "vertical", marginBottom: 14 }}
                />
                <div className={styles.confirmActions}>
                  <button className={styles.btnDanger}
                    onClick={async () => {
                      const r = await fetch(`/api/import-export/listings/${listingRejectModal._id}/status`, {
                        method: "PATCH", headers,
                        body: JSON.stringify({ status: "rejected", adminNote: listingRejectNote }),
                      });
                      if (r.ok) {
                        showToast("Annonce refusée.", "error");
                        setListingRejectModal(null);
                        loadImporters();
                      } else {
                        const d = await r.json().catch(() => ({}));
                        showToast(d.message || "Erreur lors du refus.", "error");
                      }
                    }}>Confirmer le refus</button>
                  <button className={styles.btnGhost} onClick={() => setListingRejectModal(null)}>Annuler</button>
                </div>
              </div>
            </div>
          )}

          {/* ══ MODAL ÉDITION ANNONCE IMPORT/EXPORT (admin) ══ */}
          {editingIeListing && (
            <IEListingEditForm
              token={token}
              listing={editingIeListing}
              onClose={() => setEditingIeListing(null)}
              onSaved={() => { setEditingIeListing(null); showToast("Annonce mise à jour."); loadImporters(); }}
            />
          )}

          {/* ══ MODAL DOSSIER EXPORTATEUR ══ */}
          {exporterDetail && (() => {
            const p = exporterDetail;
            const u = p.userId || {};
            const BADGE_CFG = {
              none:     null,
              silver:   { icon: "🥈", label: "Silver",   color: "#64748b", bg: "#f1f5f9" },
              gold:     { icon: "🥇", label: "Gold",     color: "#d97706", bg: "#fffbeb" },
              platinum: { icon: "💎", label: "Platinum", color: "#6d28d9", bg: "#ede9fe" },
            };
            const STATUS_CFG = {
              pending:       { label: "En attente",    color: "#d97706", bg: "#fef3c7" },
              verified:      { label: "Vérifié",       color: "#059669", bg: "#dcfce7" },
              rejected:      { label: "Refusé",        color: "#dc2626", bg: "#fee2e2" },
              suspended:     { label: "Suspendu",      color: "#dc2626", bg: "#fee2e2" },
              not_submitted: { label: "Non soumis",    color: "#94a3b8", bg: "#f8fafc" },
            };
            const stCfg   = STATUS_CFG[p.status]      || STATUS_CFG.not_submitted;
            const badgeCfg = BADGE_CFG[p.badgeLevel]  || null;
            const ACTIVITY_LABELS = { import: "Import", export: "Export", transit: "Transit", courtage: "Courtage", pieces_detachees: "Pièces détachées" };
            const DOC_KEYS = [
              { key: "rccmImage",    label: "Registre du Commerce (RCCM)" },
              { key: "taxIdImage",   label: "Identifiant Fiscal (NIF)" },
              { key: "licenseImage", label: "Agrément importateur/exportateur" },
              { key: "companyLogo",  label: "Logo de l'entreprise" },
              { key: "bankStatement",label: "Relevé bancaire" },
              { key: "otherDoc",     label: "Autre document" },
            ];
            const hasDoc = DOC_KEYS.some(({ key }) => !!p.documents?.[key]);

            const Row = ({ label, value }) => (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: ".71rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</span>
                <span style={{ fontSize: ".88rem", color: "#0f1b3f", fontWeight: 600 }}>{value || "—"}</span>
              </div>
            );

            return (
              <div className={styles.overlay} onClick={() => setExporterDetail(null)}
                style={{ alignItems: "flex-start", paddingTop: "2vh", overflowY: "auto" }}>
                <div onClick={(e) => e.stopPropagation()}
                  style={{ background: "#fff", borderRadius: 16, width: "min(960px, 96vw)", maxHeight: "95dvh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,.22)" }}>

                  {/* ── Header ── */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px 14px", borderBottom: "1.5px solid #e2e8f0", flexShrink: 0, background: "#f8fafc" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      {p.documents?.companyLogo ? (
                        <img src={p.documents.companyLogo} alt="logo"
                          style={{ width: 52, height: 52, borderRadius: 10, objectFit: "contain", border: "1.5px solid #e2e8f0", background: "#fff", padding: 4 }}
                          onError={(e) => { e.target.style.display = "none"; }} />
                      ) : (
                        <div style={{ width: 52, height: 52, borderRadius: 10, background: "#e0e7ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.6rem" }}>📦</div>
                      )}
                      <div>
                        <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 900, color: "#0f1b3f" }}>{p.companyName}</h2>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                          <span style={{ background: stCfg.bg, color: stCfg.color, padding: "2px 12px", borderRadius: 99, fontWeight: 800, fontSize: ".76rem" }}>{stCfg.label}</span>
                          {badgeCfg && <span style={{ background: badgeCfg.bg, color: badgeCfg.color, padding: "2px 12px", borderRadius: 99, fontWeight: 700, fontSize: ".76rem" }}>{badgeCfg.icon} {badgeCfg.label}</span>}
                          <span style={{ fontSize: ".75rem", color: "#94a3b8" }}>ID : {p._id}</span>
                        </div>
                      </div>
                    </div>
                    <button onClick={() => setExporterDetail(null)}
                      style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 34, height: 34, fontSize: "1.1rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✕</button>
                  </div>

                  {/* ── Body scrollable ── */}
                  <div style={{ overflowY: "auto", padding: "20px 24px 28px", flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>

                    {/* Actions rapides */}
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {p.status !== "verified" && (
                        <button className={styles.btnApprove}
                          onClick={() => { setExporterDetail(null); setReviewModal(p); setReviewDecision({ status: "verified", rejectionReason: "", badgeLevel: "silver" }); }}>
                          ✅ Valider le dossier
                        </button>
                      )}
                      {p.status !== "rejected" && (
                        <button className={styles.btnReject}
                          onClick={() => { setExporterDetail(null); setReviewModal(p); setReviewDecision({ status: "rejected", rejectionReason: "", badgeLevel: "none" }); }}>
                          ✕ Refuser le dossier
                        </button>
                      )}
                      {p.status === "verified" && p.status !== "suspended" && (
                        <button
                          onClick={async () => {
                            const r = await fetch(`/api/import-export/importer-profiles/${p._id}/review`, { method: "PATCH", headers, body: JSON.stringify({ status: "suspended" }) });
                            if (r.ok) { showToast("Dossier suspendu.", "error"); setExporterDetail(null); loadImporters(); }
                            else showToast("Erreur lors de la suspension.", "error");
                          }}
                          style={{ padding: "7px 16px", borderRadius: 8, border: "1.5px solid #fca5a5", background: "#fef2f2", color: "#dc2626", fontWeight: 700, fontSize: ".82rem", cursor: "pointer" }}>
                          ⏸ Suspendre
                        </button>
                      )}
                    </div>

                    {/* Grille principale : partenaire + entreprise */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

                      {/* Infos partenaire (utilisateur) */}
                      <div style={{ background: "#f8fafc", borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
                        <h3 style={{ margin: 0, fontSize: ".88rem", fontWeight: 800, color: "#0f1b3f", borderBottom: "1.5px solid #e2e8f0", paddingBottom: 8 }}>👤 Informations partenaire</h3>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          {u.profilePhoto ? (
                            <img src={u.profilePhoto} alt="" style={{ width: 54, height: 54, borderRadius: "50%", objectFit: "cover", border: "2px solid #e2e8f0" }} onError={(e) => { e.target.style.display = "none"; }} />
                          ) : (
                            <div style={{ width: 54, height: 54, borderRadius: "50%", background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", flexShrink: 0 }}>
                              {(u.firstName?.[0] || "?").toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight: 800, color: "#0f1b3f" }}>{u.firstName} {u.lastName}</div>
                            <div style={{ fontSize: ".78rem", color: "#64748b", marginTop: 2 }}>{u.role || "partenaire"}</div>
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <Row label="Email" value={u.email} />
                          <Row label="Téléphone" value={u.phone} />
                          <Row label="Statut compte" value={u.isActive === false ? "🚫 Bloqué" : "✅ Actif"} />
                          <Row label="Dossier soumis le" value={fmtDate(p.submittedAt)} />
                        </div>
                      </div>

                      {/* Infos entreprise */}
                      <div style={{ background: "#f8fafc", borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                        <h3 style={{ margin: 0, fontSize: ".88rem", fontWeight: 800, color: "#0f1b3f", borderBottom: "1.5px solid #e2e8f0", paddingBottom: 8 }}>🏢 Informations entreprise</h3>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <Row label="Raison sociale" value={p.companyName} />
                          <Row label="RCCM" value={p.rccm} />
                          <Row label="NIF / Identifiant fiscal" value={p.taxId} />
                          <Row label="Agrément" value={p.operatingLicense} />
                          <Row label="Adresse" value={p.address} />
                          <Row label="Ville" value={p.city} />
                          <Row label="Pays" value={p.country} />
                          <Row label="Site web" value={p.website ? <a href={safeHref(p.website)} target="_blank" rel="noreferrer noopener" style={{ color: "#2563eb" }}>{p.website}</a> : "—"} />
                        </div>
                      </div>
                    </div>

                    {/* Activités & portée */}
                    <div style={{ background: "#f8fafc", borderRadius: 12, padding: "16px 18px" }}>
                      <h3 style={{ margin: "0 0 14px", fontSize: ".88rem", fontWeight: 800, color: "#0f1b3f", borderBottom: "1.5px solid #e2e8f0", paddingBottom: 8 }}>🌍 Activités & portée</h3>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))", gap: 14 }}>
                        <div>
                          <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Types d'activité</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {(p.activityType || []).length > 0
                              ? (p.activityType).map((a) => (
                                <span key={a} style={{ background: "#e0e7ff", color: "#3730a3", padding: "3px 10px", borderRadius: 99, fontSize: ".78rem", fontWeight: 700 }}>
                                  {ACTIVITY_LABELS[a] || a}
                                </span>
                              ))
                              : <span style={{ color: "#94a3b8", fontSize: ".82rem" }}>—</span>
                            }
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Pays d'opération</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {(p.operatingCountries || []).length > 0
                              ? p.operatingCountries.map((c) => (
                                <span key={c} style={{ background: "#dcfce7", color: "#166534", padding: "3px 10px", borderRadius: 99, fontSize: ".78rem", fontWeight: 700 }}>{c}</span>
                              ))
                              : <span style={{ color: "#94a3b8", fontSize: ".82rem" }}>—</span>
                            }
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Catégories de véhicules</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {(p.vehicleCategories || []).length > 0
                              ? p.vehicleCategories.map((c) => (
                                <span key={c} style={{ background: "#fef3c7", color: "#92400e", padding: "3px 10px", borderRadius: 99, fontSize: ".78rem", fontWeight: 700 }}>{c}</span>
                              ))
                              : <span style={{ color: "#94a3b8", fontSize: ".82rem" }}>—</span>
                            }
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <Row label="Volume annuel" value={p.annualVolume} />
                          <Row label="Années d'expérience" value={p.yearsExperience != null ? `${p.yearsExperience} an${p.yearsExperience > 1 ? "s" : ""}` : "—"} />
                        </div>
                      </div>
                    </div>

                    {/* Références & description */}
                    {(p.references || p.description) && (
                      <div style={{ background: "#f8fafc", borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
                        <h3 style={{ margin: 0, fontSize: ".88rem", fontWeight: 800, color: "#0f1b3f", borderBottom: "1.5px solid #e2e8f0", paddingBottom: 8 }}>📝 Présentation & références</h3>
                        {p.description && (
                          <div>
                            <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 }}>Description</div>
                            <p style={{ margin: 0, fontSize: ".88rem", color: "#334155", lineHeight: 1.6 }}>{p.description}</p>
                          </div>
                        )}
                        {p.references && (
                          <div>
                            <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 }}>Références / Clients notables</div>
                            <p style={{ margin: 0, fontSize: ".88rem", color: "#334155", lineHeight: 1.6 }}>{p.references}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Documents */}
                    {hasDoc && (
                      <div style={{ background: "#f8fafc", borderRadius: 12, padding: "16px 18px" }}>
                        <h3 style={{ margin: "0 0 14px", fontSize: ".88rem", fontWeight: 800, color: "#0f1b3f", borderBottom: "1.5px solid #e2e8f0", paddingBottom: 8 }}>📁 Documents fournis</h3>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))", gap: 12 }}>
                          {DOC_KEYS.map(({ key, label }) => p.documents?.[key] ? (
                            <div key={key} style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
                              <div style={{ fontSize: ".7rem", fontWeight: 700, color: "#64748b", padding: "5px 10px", background: "#f1f5f9", textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
                              <a href={safeImgHref(p.documents[key])} target="_blank" rel="noreferrer noopener">
                                <img src={p.documents[key]} alt={label} loading="lazy" decoding="async"
                                  style={{ width: "100%", height: 110, objectFit: "cover", display: "block" }}
                                  onError={(e) => { e.target.parentElement.innerHTML = `<div style="height:110px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:.8rem;padding:8px;text-align:center">Aperçu indisponible</div>`; }} />
                              </a>
                              <div style={{ padding: "6px 10px" }}>
                                <a href={safeImgHref(p.documents[key])} target="_blank" rel="noreferrer noopener" style={{ fontSize: ".75rem", color: "#2563eb", textDecoration: "underline" }}>
                                  Voir en plein écran ↗
                                </a>
                              </div>
                            </div>
                          ) : null)}
                        </div>
                      </div>
                    )}

                    {/* Statut de vérification */}
                    <div style={{ background: "#f8fafc", borderRadius: 12, padding: "16px 18px" }}>
                      <h3 style={{ margin: "0 0 14px", fontSize: ".88rem", fontWeight: 800, color: "#0f1b3f", borderBottom: "1.5px solid #e2e8f0", paddingBottom: 8 }}>🔍 Statut de vérification</h3>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 12 }}>
                        <Row label="Statut actuel" value={<span style={{ color: stCfg.color, fontWeight: 800 }}>{stCfg.label}</span>} />
                        <Row label="Badge attribué" value={badgeCfg ? `${badgeCfg.icon} ${badgeCfg.label}` : "Aucun"} />
                        <Row label="Soumis le" value={fmtDate(p.submittedAt)} />
                        <Row label="Examiné le" value={fmtDate(p.reviewedAt)} />
                        {p.reviewedBy && <Row label="Examiné par" value={`${p.reviewedBy.firstName || ""} ${p.reviewedBy.lastName || ""}`} />}
                      </div>
                      {p.rejectionReason && (
                        <div style={{ marginTop: 14, background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: 8, padding: "10px 14px" }}>
                          <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#dc2626", textTransform: "uppercase", marginBottom: 4 }}>Motif du refus</div>
                          <p style={{ margin: 0, fontSize: ".88rem", color: "#991b1b" }}>{p.rejectionReason}</p>
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* ══════════════════════════════════════════════════
          TAB COMMISSIONS
      ══════════════════════════════════════════════════ */}
      {activeTab === "commissions" && (
        <CommissionsSection
          commissions={commissions}
          commissionsStats={commissionsStats}
          fmtUSD={fmtUSD}
          invoiceMonth={invoiceMonth}
          invoiceYear={invoiceYear}
          loadCommissions={loadCommissions}
          setInvoiceMonth={setInvoiceMonth}
          setInvoiceYear={setInvoiceYear}
        />
      )}

      {/* ══════════════════════════════════════════════════
          TAB FACTURES
      ══════════════════════════════════════════════════ */}
      {activeTab === "factures" && (
        <FacturesSection
          fmtUSD={fmtUSD}
          generateForm={generateForm}
          generating={generating}
          headers={headers}
          invoiceLoading={invoiceLoading}
          invoices={invoices}
          invoicesStats={invoicesStats}
          loadInvoices={loadInvoices}
          loadServiceInvoicesAdmin={loadServiceInvoicesAdmin}
          serviceInvoicesAdmin={serviceInvoicesAdmin}
          serviceInvoicesAdminLoading={serviceInvoicesAdminLoading}
          setGenerateForm={setGenerateForm}
          setGenerating={setGenerating}
          showToast={showToast}
          token={token}
        />
      )}

      {/* ══════════════════════════════════════════════════
          TAB KYC — Gestion des dossiers d'identité
      ══════════════════════════════════════════════════ */}
      {activeTab === "kyc" && (
        <KycSection
          COUNTRIES_CONFIG={COUNTRIES_CONFIG}
          handleKycReview={handleKycReview}
          kycDetailLoading={kycDetailLoading}
          kycDetailUser={kycDetailUser}
          kycFilter={kycFilter}
          kycList={kycList}
          kycLoading={kycLoading}
          kycReviewForm={kycReviewForm}
          kycReviewLoading={kycReviewLoading}
          kycReviewMsg={kycReviewMsg}
          kycSearch={kycSearch}
          kycTotal={kycTotal}
          loadKycList={loadKycList}
          loadMoreKyc={loadMoreKyc}
          openKycDetail={openKycDetail}
          openTrustOverview={openTrustOverview}
          setKycDetailUser={setKycDetailUser}
          setKycFilter={setKycFilter}
          setKycReviewForm={setKycReviewForm}
          setKycSearch={setKycSearch}
          showToast={showToast}
          token={token}
        />
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB CERTIFICATION — Gestion des certifications partenaires
      ══════════════════════════════════════════════════════════ */}
      {activeTab === "certification" && (
        <CertificationSection
          certBadgeForm={certBadgeForm}
          certDetail={certDetail}
          certFilter={certFilter}
          certList={certList}
          certLoading={certLoading}
          certReviewForm={certReviewForm}
          certReviewLevel={certReviewLevel}
          certReviewLoading={certReviewLoading}
          certReviewMsg={certReviewMsg}
          handleCertBadge={handleCertBadge}
          handleCertLevelReview={handleCertLevelReview}
          handleCertRelance={handleCertRelance}
          headers={headers}
          loadCertList={loadCertList}
          pendingCert={pendingCert}
          setCertBadgeForm={setCertBadgeForm}
          setCertDetail={setCertDetail}
          setCertFilter={setCertFilter}
          setCertReviewForm={setCertReviewForm}
          setCertReviewLevel={setCertReviewLevel}
          setCertReviewMsg={setCertReviewMsg}
        />
      )}

      {/* ══════════════════════ TAB IMPORT/EXPORT ══════════════════════ */}
      {activeTab === "import_export" && (
        <TransactionsIESection
          deleteIeRequest={deleteIeRequest}
          ieActionSaving={ieActionSaving}
          ieLoading={ieLoading}
          ieRequests={ieRequests}
          ieRequestsTotal={ieRequestsTotal}
          ieTransactions={ieTransactions}
          ieTxLoading={ieTxLoading}
          loadIeTransactions={loadIeTransactions}
          loadImportExport={loadImportExport}
          loadMoreIeRequests={loadMoreIeRequests}
          setConfirm={setConfirm}
          setIeTxModal={setIeTxModal}
          setIeTxNote={setIeTxNote}
          setIeTxRelease={setIeTxRelease}
          updateIeRequestStatus={updateIeRequestStatus}
        />
      )}

      {ieTxModal && (
        <div className={styles.overlay} onClick={() => setIeTxModal(null)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            {ieTxModal.mode === "dispute" ? (
              <>
                <h3>⚖️ Trancher le litige</h3>
                <p style={{ margin: "0 0 14px", fontSize: "0.85rem", color: "#64748b" }}>
                  Raison invoquée : {ieTxModal.tx.dispute?.reason || "—"}
                </p>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, marginBottom: 14, cursor: "pointer" }}>
                  <input type="checkbox" checked={ieTxRelease} onChange={(e) => setIeTxRelease(e.target.checked)} />
                  Libérer les fonds au fournisseur (sinon : annuler et rembourser le client)
                </label>
                <textarea className={styles.rejectTextarea} placeholder="Résolution / justification..." value={ieTxNote} onChange={(e) => setIeTxNote(e.target.value)} />
                <div className={styles.confirmActions}>
                  <button className={styles.btnApprove} onClick={handleResolveIeDispute} disabled={ieTxSaving}>{ieTxSaving ? "Envoi…" : "✅ Confirmer la décision"}</button>
                  <button className={styles.btnGhost} onClick={() => setIeTxModal(null)}>Annuler</button>
                </div>
              </>
            ) : ieTxModal.mode === "inspection" ? (
              <>
                <h3>🔍 Compléter l'inspection indépendante</h3>
                <textarea className={styles.rejectTextarea} placeholder="Notes du rapport d'inspection..." value={ieTxNote} onChange={(e) => setIeTxNote(e.target.value)} />
                <div className={styles.confirmActions}>
                  <button className={styles.btnApprove} onClick={handleCompleteIeInspection} disabled={ieTxSaving}>{ieTxSaving ? "Envoi…" : "✅ Marquer complétée"}</button>
                  <button className={styles.btnGhost} onClick={() => setIeTxModal(null)}>Annuler</button>
                </div>
              </>
            ) : (
              <>
                <h3>⏳ Vérifier le paiement déclaré</h3>
                <p style={{ margin: "0 0 14px", fontSize: "0.85rem", color: "#64748b" }}>
                  Méthode : <strong>{ieTxModal.tx.payment?.method || "—"}</strong> · Montant : <strong>{Number(ieTxModal.tx.payment?.amount || 0).toLocaleString("fr-FR")} {ieTxModal.tx.payment?.currency}</strong><br />
                  Référence déclarée : {ieTxModal.tx.payment?.transactionRef || "—"}
                </p>
                <p style={{ margin: "0 0 14px", fontSize: "0.82rem", color: "#94a3b8" }}>
                  Vérifiez la réception réelle des fonds (relevé bancaire, mobile money, etc.) avant de confirmer.
                </p>
                <textarea className={styles.rejectTextarea} placeholder="Motif (si rejet)..." value={ieTxNote} onChange={(e) => setIeTxNote(e.target.value)} />
                <div className={styles.confirmActions}>
                  <button className={styles.btnApprove} onClick={() => handleVerifyIePayment(true)} disabled={ieTxSaving}>{ieTxSaving ? "Envoi…" : "✅ Fonds reçus — sécuriser"}</button>
                  <button className={styles.btnReject} onClick={() => handleVerifyIePayment(false)} disabled={ieTxSaving}>❌ Rejeter</button>
                  <button className={styles.btnGhost} onClick={() => setIeTxModal(null)}>Annuler</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════ TAB LITIGES ══════════════════════ */}
      {activeTab === "litiges" && (
        <LitigesSection
          bookings={bookings}
          fmtUSD={fmtUSD}
          headers={headers}
          loadAll={loadAll}
          setDisputeModal={setDisputeModal}
          setDisputeNote={setDisputeNote}
          setDisputeResol={setDisputeResol}
        />
      )}

      {/* ══════════════════════ TAB CHAUFFEURS ══════════════════════ */}
      {activeTab === "chauffeurs" && (
        <ChauffeursSection
          activeDrivers={activeDrivers}
          bookings={bookings}
          deactivateActiveDriver={deactivateActiveDriver}
          driverRejectModal={driverRejectModal}
          driverRejectReason={driverRejectReason}
          fmtUSD={fmtUSD}
          loadAll={loadAll}
          pendingDrivers={pendingDrivers}
          pendingDriversList={pendingDriversList}
          setConfirm={setConfirm}
          setDriverRejectModal={setDriverRejectModal}
          setDriverRejectReason={setDriverRejectReason}
          updateDriverStatus={updateDriverStatus}
        />
      )}

      {/* ══════════════════════ TAB ACTIVITÉS (OTHERS) ══════════════════════ */}
      {activeTab === "pieces" && (
        <PartsSection headers={headers} bookings={bookings} onToast={showToast} />
      )}

      {activeTab === "activites" && (
        <ActivitesSection
          COUNTRIES_CONFIG={COUNTRIES_CONFIG}
          activeActivities={activeActivities}
          activityRejectModal={activityRejectModal}
          activityRejectReason={activityRejectReason}
          activityTransferForm={activityTransferForm}
          activityTransferModal={activityTransferModal}
          activityTransferSaving={activityTransferSaving}
          bookings={bookings}
          deactivateActiveActivity={deactivateActiveActivity}
          fmtUSD={fmtUSD}
          handleRejectActivity={handleRejectActivity}
          loadAll={loadAll}
          openActivityTransfer={openActivityTransfer}
          pendingActivities={pendingActivities}
          pendingActivitiesList={pendingActivitiesList}
          searchActivityTransferOwners={searchActivityTransferOwners}
          setActivityRejectModal={setActivityRejectModal}
          setActivityRejectReason={setActivityRejectReason}
          setActivityTransferForm={setActivityTransferForm}
          setActivityTransferModal={setActivityTransferModal}
          setConfirm={setConfirm}
          submitActivityTransfer={submitActivityTransfer}
          updateActivityStatus={updateActivityStatus}
        />
      )}

      {/* ══════════════════════ TAB NOTIFICATIONS ══════════════════════ */}
      {activeTab === "notifications" && (
        <NotificationsSection
          broadcastForm={broadcastForm}
          broadcastSending={broadcastSending}
          sendBroadcast={sendBroadcast}
          setBroadcastForm={setBroadcastForm}
        />
      )}

      {/* ══════════════════════ WIP STUBS ══════════════════════ */}
      {activeTab === "direction" && <DirectionSection headers={headers} />}
      {activeTab === "analytics" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>📈 Analytics Avancé</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Chiffre d'affaires, croissance et répartition — 12 derniers mois.</p>
            </div>
            <button className={styles.btnRefresh} onClick={loadAnalytics}>↻ Actualiser</button>
          </div>
          <AnalyticsSection analytics={analytics} loading={analyticsLoading} />
        </div>
      )}
      {activeTab === "transport" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>🚢 Transport International</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Suivi logistique des transactions Import/Export en cours d'acheminement.</p>
            </div>
            <button className={styles.btnRefresh} onClick={loadIeTransactions}>↻ Actualiser</button>
          </div>
          <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0f1b3f", margin: "0 0 10px" }}>📦 Assignation transitaire / agent</h3>
          <LogisticsAssignmentSection ieTransactions={ieTransactions} loading={ieTxLoading} token={token} onRefresh={loadIeTransactions} />
          <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0f1b3f", margin: "1.5rem 0 10px" }}>🚢 Acheminement</h3>
          <TransportSection ieTransactions={ieTransactions} loading={ieTxLoading} />
        </div>
      )}
      {activeTab === "import_cost" && (
        <CoutsImportSection
          costConfigs={costConfigs}
          deleteCostConfig={deleteCostConfig}
          deleteLaneRate={deleteLaneRate}
          importCostLoading={importCostLoading}
          laneRates={laneRates}
          loadImportCostData={loadImportCostData}
          setCostConfigForm={setCostConfigForm}
          setLaneForm={setLaneForm}
        />
      )}

      {activeTab === "business_config" && (
        <BusinessConfigSection
          adsConfigForm={adsConfigForm}
          bizConfig={bizConfig}
          bizConfigLoading={bizConfigLoading}
          bizSaving={bizSaving}
          bizSubTab={bizSubTab}
          boostsForm={boostsForm}
          commissionsForm={commissionsForm}
          countryConfigs={countryConfigs}
          deleteCountryConfigFn={deleteCountryConfigFn}
          deleteDiscountCampaignFn={deleteDiscountCampaignFn}
          deleteExchangeRateFn={deleteExchangeRateFn}
          discountCampaigns={discountCampaigns}
          exchangeRates={exchangeRates}
          foundingForm={foundingForm}
          fournisseurForm={fournisseurForm}
          importFeeForm={importFeeForm}
          loadBusinessConfig={loadBusinessConfig}
          rentalOptsForm={rentalOptsForm}
          savePricingSection={savePricingSection}
          serviceFeeForm={serviceFeeForm}
          servicesForm={servicesForm}
          setAdsConfigForm={setAdsConfigForm}
          setBizSubTab={setBizSubTab}
          setBoostsForm={setBoostsForm}
          setCommissionsForm={setCommissionsForm}
          setCountryForm={setCountryForm}
          setDiscountForm={setDiscountForm}
          setFoundingForm={setFoundingForm}
          setFournisseurForm={setFournisseurForm}
          setImportFeeForm={setImportFeeForm}
          setRateForm={setRateForm}
          setRentalOptsForm={setRentalOptsForm}
          setServiceFeeForm={setServiceFeeForm}
          setServicesForm={setServicesForm}
          setSubscriptionsForm={setSubscriptionsForm}
          subscriptionsForm={subscriptionsForm}
        />
      )}

      {/* ── Modal devise (ExchangeRate) ── */}
      {rateForm && (
        <div className={styles.overlay} onClick={() => setRateForm(null)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3 style={{ margin: "0 0 14px", color: "#0f1b3f", fontSize: "1rem" }}>
              {rateForm._id ? "✏️ Modifier la devise" : "+ Nouvelle devise"}
            </h3>
            {[
              ["code", "Code ISO 4217 (ex. MAD)"], ["name", "Nom"], ["symbol", "Symbole"],
            ].map(([key, label]) => (
              <div key={key} style={{ marginBottom: 10 }}>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>{label}</label>
                <input value={rateForm[key] || ""} disabled={key === "code" && !!rateForm._id}
                  onChange={(e) => setRateForm((p) => ({ ...p, [key]: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
            ))}
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>Taux depuis 1 USD</label>
              <input type="number" min="0" step="0.0001" value={rateForm.rateFromUSD}
                onChange={(e) => setRateForm((p) => ({ ...p, rateFromUSD: e.target.value }))}
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: ".85rem", marginBottom: 16 }}>
              <input type="checkbox" checked={!!rateForm.active} onChange={(e) => setRateForm((p) => ({ ...p, active: e.target.checked }))} />
              Devise active
            </label>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className={styles.btnGhost} onClick={() => setRateForm(null)}>Annuler</button>
              <button className={styles.btnApprove} onClick={saveExchangeRate}>💾 Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal pays (CountryConfig) ── */}
      {countryForm && (
        <div className={styles.overlay} onClick={() => setCountryForm(null)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h3 style={{ margin: "0 0 14px", color: "#0f1b3f", fontSize: "1rem" }}>
              {countryForm._id ? "✏️ Modifier le pays" : "+ Nouveau pays"}
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>Code ISO-2 (ex. MA)</label>
                <input value={countryForm.code} disabled={!!countryForm._id}
                  onChange={(e) => setCountryForm((p) => ({ ...p, code: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
              <div>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>Nom du pays</label>
                <input value={countryForm.name}
                  onChange={(e) => setCountryForm((p) => ({ ...p, name: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
              <div>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>Drapeau (emoji)</label>
                <input value={countryForm.flag}
                  onChange={(e) => setCountryForm((p) => ({ ...p, flag: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
              <div>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>Devise par défaut</label>
                <select value={countryForm.defaultCurrency}
                  onChange={(e) => setCountryForm((p) => ({ ...p, defaultCurrency: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }}>
                  <option value="">— Choisir —</option>
                  {exchangeRates.map((r) => <option key={r.code} value={r.code}>{r.code}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>Locale (ex. fr-FR)</label>
                <input value={countryForm.locale || ""}
                  onChange={(e) => setCountryForm((p) => ({ ...p, locale: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
              <div>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>Indicatif tél. (ex. +225)</label>
                <input value={countryForm.phone || ""}
                  onChange={(e) => setCountryForm((p) => ({ ...p, phone: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
              <div>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>Langues (séparées par virgule)</label>
                <input value={(countryForm.languages || []).join(", ")}
                  onChange={(e) => setCountryForm((p) => ({ ...p, languages: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }))}
                  placeholder="fr, en" style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
              <div>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>Moyens de paiement (séparés par virgule)</label>
                <input value={(countryForm.paymentMethods || []).join(", ")}
                  onChange={(e) => setCountryForm((p) => ({ ...p, paymentMethods: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }))}
                  placeholder="card, cash, orange_money, wave, mtn, moov, paypal" style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
                <p style={{ margin: "4px 0 0", fontSize: ".72rem", color: "#94a3b8" }}>
                  Codes exacts attendus (pas de traduction) : card, cash, orange_money, wave, mtn, moov, paypal.
                  Laisser vide = tous proposés au client, sans restriction. Espèces ("cash") n'a pas de sens pour un
                  paiement d'import/export international, distinct de ce réglage.
                </p>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
              {[
                ["deliveryBaseRate", "Livraison base"], ["deliveryRatePerKm", "Livraison /km"], ["deliveryMaxKm", "Livraison max (km)"],
              ].map(([key, label]) => (
                <div key={key}>
                  <label style={{ fontSize: ".78rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>{label}</label>
                  <input type="number" min="0" value={countryForm[key]}
                    onChange={(e) => setCountryForm((p) => ({ ...p, [key]: Number(e.target.value) }))}
                    style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 10, maxWidth: 160 }}>
              <label style={{ fontSize: ".78rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Taxe locale (%)</label>
              <input type="number" min="0" max="100" step="0.1" value={countryForm.taxPercent}
                onChange={(e) => setCountryForm((p) => ({ ...p, taxPercent: Number(e.target.value) }))}
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: ".85rem", marginBottom: 16 }}>
              <input type="checkbox" checked={!!countryForm.active} onChange={(e) => setCountryForm((p) => ({ ...p, active: e.target.checked }))} />
              Pays actif
            </label>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className={styles.btnGhost} onClick={() => setCountryForm(null)}>Annuler</button>
              <button className={styles.btnApprove} onClick={saveCountryConfig}>💾 Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal campagne de réduction ── */}
      {discountForm && (
        <div className={styles.overlay} onClick={() => setDiscountForm(null)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <h3 style={{ margin: "0 0 14px", color: "#0f1b3f", fontSize: "1rem" }}>
              {discountForm._id ? "✏️ Modifier la campagne" : "+ Nouvelle campagne"}
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>Code promo</label>
                <input value={discountForm.code} disabled={!!discountForm._id}
                  onChange={(e) => setDiscountForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                  placeholder="LAUNCH50" style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
              <div>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>Réduction (%)</label>
                <input type="number" min="1" max="100" value={discountForm.discountPercent}
                  onChange={(e) => setDiscountForm((p) => ({ ...p, discountPercent: Number(e.target.value) }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>Libellé (optionnel)</label>
              <input value={discountForm.label || ""}
                onChange={(e) => setDiscountForm((p) => ({ ...p, label: e.target.value }))}
                placeholder="Lancement France" style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 6 }}>Applicable à</label>
              <div style={{ display: "flex", gap: 16 }}>
                {[["subscriptions", "Abonnements"], ["boosts", "Boosts"]].map(([key, label]) => (
                  <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: ".85rem", cursor: "pointer" }}>
                    <input type="checkbox" checked={(discountForm.appliesTo || []).includes(key)}
                      onChange={(e) => setDiscountForm((p) => {
                        const set = new Set(p.appliesTo || []);
                        e.target.checked ? set.add(key) : set.delete(key);
                        return { ...p, appliesTo: [...set] };
                      })} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: ".78rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Début (optionnel)</label>
                <input type="date" value={discountForm.startDate || ""}
                  onChange={(e) => setDiscountForm((p) => ({ ...p, startDate: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
              <div>
                <label style={{ fontSize: ".78rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Fin (optionnel)</label>
                <input type="date" value={discountForm.endDate || ""}
                  onChange={(e) => setDiscountForm((p) => ({ ...p, endDate: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
            </div>
            <div style={{ marginBottom: 10, maxWidth: 220 }}>
              <label style={{ fontSize: ".78rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Limite d'utilisations (vide = illimité)</label>
              <input type="number" min="1" value={discountForm.maxRedemptions ?? ""}
                onChange={(e) => setDiscountForm((p) => ({ ...p, maxRedemptions: e.target.value === "" ? "" : Number(e.target.value) }))}
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: ".85rem", marginBottom: 16 }}>
              <input type="checkbox" checked={!!discountForm.active} onChange={(e) => setDiscountForm((p) => ({ ...p, active: e.target.checked }))} />
              Campagne active
            </label>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className={styles.btnGhost} onClick={() => setDiscountForm(null)}>Annuler</button>
              <button className={styles.btnApprove} onClick={saveDiscountCampaign}>💾 Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal barème pays ── */}
      {costConfigForm && (
        <div className={styles.overlay} onClick={() => setCostConfigForm(null)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <h3 style={{ margin: "0 0 14px", color: "#0f1b3f", fontSize: "1rem" }}>
              {costConfigForm._id ? "✏️ Modifier le barème" : "+ Nouveau barème pays"}
            </h3>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>Pays de destination *</label>
              <input value={costConfigForm.country} disabled={!!costConfigForm._id}
                onChange={(e) => setCostConfigForm((p) => ({ ...p, country: e.target.value }))}
                placeholder="Côte d'Ivoire" style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              {[
                ["customsDutyPercent", "Droits de douane (%)"], ["vatPercent", "TVA (%)"],
                ["transitFixedFeeUSD", "Transit fixe ($)"], ["redevancesFixedFeeUSD", "Redevances fixes ($)"],
                ["portFeesFixedUSD", "Frais portuaires ($)"], ["deliveryFixedFeeUSD", "Livraison finale ($)"],
                ["insurancePercent", "Assurance (%)"], ["defaultSeaFreightUSD", "Fret maritime défaut ($)"],
                ["ageSurchargeThresholdYears", "Seuil d'âge surtaxe (ans)"], ["ageSurchargePercent", "Surtaxe véhicule ancien (%)"],
              ].map(([key, label]) => (
                <div key={key}>
                  <label style={{ fontSize: ".78rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>{label}</label>
                  <input type="number" value={costConfigForm[key]}
                    onChange={(e) => setCostConfigForm((p) => ({ ...p, [key]: e.target.value }))}
                    style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
                </div>
              ))}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".85rem", marginBottom: 14 }}>
              <input type="checkbox" checked={costConfigForm.active} onChange={(e) => setCostConfigForm((p) => ({ ...p, active: e.target.checked }))} />
              Barème actif
            </label>
            <div className={styles.confirmActions}>
              <button className={styles.btnApprove} onClick={saveCostConfig}>Enregistrer</button>
              <button className={styles.btnGhost} onClick={() => setCostConfigForm(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal liaison de fret ── */}
      {laneForm && (
        <div className={styles.overlay} onClick={() => setLaneForm(null)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h3 style={{ margin: "0 0 14px", color: "#0f1b3f", fontSize: "1rem" }}>
              {laneForm._id ? "✏️ Modifier la liaison" : "+ Nouvelle liaison de fret"}
            </h3>
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>Pays d'origine *</label>
                <input value={laneForm.sourceCountry} disabled={!!laneForm._id}
                  onChange={(e) => setLaneForm((p) => ({ ...p, sourceCountry: e.target.value }))}
                  placeholder="Chine" style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>Pays de destination *</label>
                <input value={laneForm.destCountry} disabled={!!laneForm._id}
                  onChange={(e) => setLaneForm((p) => ({ ...p, destCountry: e.target.value }))}
                  placeholder="Côte d'Ivoire" style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: ".78rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Fret maritime ($) *</label>
                <input type="number" value={laneForm.seaFreightUSD}
                  onChange={(e) => setLaneForm((p) => ({ ...p, seaFreightUSD: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: ".78rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Transport intérieur ($)</label>
                <input type="number" value={laneForm.inlandTransportUSD}
                  onChange={(e) => setLaneForm((p) => ({ ...p, inlandTransportUSD: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: ".78rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Compagnie (optionnel)</label>
                <input value={laneForm.carrier || ""} onChange={(e) => setLaneForm((p) => ({ ...p, carrier: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: ".78rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Délai estimé (jours)</label>
                <input type="number" value={laneForm.estimatedDelayDays || ""} onChange={(e) => setLaneForm((p) => ({ ...p, estimatedDelayDays: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
            </div>
            <div className={styles.confirmActions}>
              <button className={styles.btnApprove} onClick={saveLaneRate}>Enregistrer</button>
              <button className={styles.btnGhost} onClick={() => setLaneForm(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "financement" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>🏦 Financement Automobile</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Demandes de leasing (LOA) et crédit classique — décision manuelle en attendant une intégration bancaire.</p>
            </div>
            <button className={styles.btnRefresh} onClick={loadFinancing}>↻ Actualiser</button>
          </div>
          <FinancingSection requests={financingRequests} loading={financingLoading}
            onDecide={(m) => { setFinancingModal(m); setFinancingNote(""); }} />
        </div>
      )}

      {financingModal && (
        <div className={styles.overlay} onClick={() => setFinancingModal(null)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            <h3>{financingModal.decision === "accepte" ? "✅ Accepter le financement" : "❌ Refuser le financement"}</h3>
            <textarea className={styles.rejectTextarea} placeholder="Note pour le client (optionnel)…" value={financingNote} onChange={(e) => setFinancingNote(e.target.value)} />
            <div className={styles.confirmActions}>
              <button className={styles.btnApprove} onClick={submitFinancingDecision} disabled={financingSaving}>{financingSaving ? "Envoi…" : "Confirmer"}</button>
              <button className={styles.btnGhost} onClick={() => setFinancingModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
      {activeTab === "assurance" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>🔒 Assurance Automobile</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Demandes auto/location/import — décision manuelle en attendant une intégration assureur.</p>
            </div>
            <button className={styles.btnRefresh} onClick={loadInsurance}>↻ Actualiser</button>
          </div>
          <InsuranceSection requests={insuranceList} loading={insuranceLoading}
            onDecide={(m) => { setInsuranceModal(m); setInsurancePremium(""); setInsuranceNote(""); }} />
        </div>
      )}

      {insuranceModal && (
        <div className={styles.overlay} onClick={() => setInsuranceModal(null)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            <h3>{insuranceModal.status === "approved" ? "✅ Approuver la demande" : "❌ Refuser la demande"}</h3>
            {insuranceModal.status === "approved" && (
              <input type="number" placeholder="Prime proposée (USD)" value={insurancePremium}
                onChange={(e) => setInsurancePremium(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem", marginBottom: 10 }} />
            )}
            <textarea className={styles.rejectTextarea} placeholder="Note pour le client (optionnel)…" value={insuranceNote} onChange={(e) => setInsuranceNote(e.target.value)} />
            <div className={styles.confirmActions}>
              <button className={styles.btnApprove} onClick={submitInsuranceDecision} disabled={insuranceSaving}>{insuranceSaving ? "Envoi…" : "Confirmer"}</button>
              <button className={styles.btnGhost} onClick={() => setInsuranceModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "reversements" && (
        <ReversementsSection
          fmtUSD={fmtUSD}
          loadPayouts={loadPayouts}
          markPayoutPaid={markPayoutPaid}
          payoutMarkingId={payoutMarkingId}
          payoutsFilter={payoutsFilter}
          payoutsList={payoutsList}
          payoutsLoading={payoutsLoading}
          payoutsTotal={payoutsTotal}
          setPayoutsFilter={setPayoutsFilter}
        />
      )}

      {activeTab === "service_requests" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>🧰 Autres services</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Transport, transit, douanes, immatriculation, garantie, financement, change de devises — décision manuelle en attendant une intégration prestataire.</p>
            </div>
            <button className={styles.btnRefresh} onClick={loadServiceRequests}>↻ Actualiser</button>
          </div>
          <ServiceRequestsSection requests={svcReqList} loading={svcReqLoading} category={svcReqCategory} onCategoryChange={setSvcReqCategory}
            onDecide={(m) => { setSvcReqModal(m); setSvcReqAmount(""); setSvcReqNote(""); }} />
        </div>
      )}

      {svcReqModal && (
        <div className={styles.overlay} onClick={() => setSvcReqModal(null)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            <h3>{svcReqModal.status === "approved" ? "✅ Approuver la demande" : "❌ Refuser la demande"}</h3>
            {svcReqModal.status === "approved" && (
              <input type="number" placeholder="Devis proposé (USD)" value={svcReqAmount}
                onChange={(e) => setSvcReqAmount(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem", marginBottom: 10 }} />
            )}
            <textarea className={styles.rejectTextarea} placeholder="Note pour le client (optionnel)…" value={svcReqNote} onChange={(e) => setSvcReqNote(e.target.value)} />
            <div className={styles.confirmActions}>
              <button className={styles.btnApprove} onClick={submitServiceRequestDecision} disabled={svcReqSaving}>{svcReqSaving ? "Envoi…" : "Confirmer"}</button>
              <button className={styles.btnGhost} onClick={() => setSvcReqModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          TAB PAIEMENTS — Abonnements Pro / Boosts en attente
          Aucune passerelle de paiement réelle n'étant branchée (Stripe/Orange
          Money/Wave), chaque activation Pro/Boost reste "pending" jusqu'à
          confirmation manuelle ici, une fois le paiement réellement reçu
          hors-plateforme (virement, dépôt, etc.).
      ══════════════════════════════════════════════════ */}
      {activeTab === "paiements" && (
        <PaiementsSection
          accorderEssai={accorderEssai}
          chercherPartenaireEssai={chercherPartenaireEssai}
          essaiPalier={essaiPalier}
          essaiRecherche={essaiRecherche}
          essaiResultats={essaiResultats}
          essaiRetour={essaiRetour}
          essaiVendeur={essaiVendeur}
          fmtUSD={fmtUSD}
          headers={headers}
          loadSubRequests={loadSubRequests}
          setEssaiPalier={setEssaiPalier}
          setEssaiResultats={setEssaiResultats}
          setEssaiVendeur={setEssaiVendeur}
          subAction={subAction}
          subActioning={subActioning}
          subLoading={subLoading}
          subRequests={subRequests}
        />
      )}

      {/* ══════════════════════════════════════════════════
          TAB AVIS CLIENTS — modération
      ══════════════════════════════════════════════════ */}
      {activeTab === "reviews" && (
        <AvisSection
          loadReviews={loadReviews}
          platformReviewStats={platformReviewStats}
          reviewActioning={reviewActioning}
          reviewsFilter={reviewsFilter}
          reviewsList={reviewsList}
          reviewsLoading={reviewsLoading}
          reviewsTargetType={reviewsTargetType}
          setReviewsFilter={setReviewsFilter}
          setReviewsTargetType={setReviewsTargetType}
          toggleReviewVisibility={toggleReviewVisibility}
        />
      )}

      {activeTab === "system_health" && (
        <SanteSystemeSection
          headers={headers}
          loadSystemHealth={loadSystemHealth}
          systemHealth={systemHealth}
          systemHealthLoading={systemHealthLoading}
        />
      )}

      {activeTab === "escrow" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>🔐 Ancien séquestre Import/Export — suspendu</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Depuis le 30/10/2026, VIT AUTO n'encaisse, ne bloque ni ne libère aucun fonds : acheteur et exportateur se règlent directement. Cette liste sert à régulariser les transactions ouvertes avant la suspension.</p>
            </div>
            <button className={styles.btnRefresh} onClick={loadIeTransactions}>↻ Actualiser</button>
          </div>
          <EscrowSection ieTransactions={ieTransactions} loading={ieTxLoading} />
        </div>
      )}
      {activeTab === "zone_transit" && <ZoneTransitSection headers={headers} />}
      {activeTab === "logistique" && <LogistiqueSection headers={headers} />}

      {activeTab === "dossiers_import" && (
        <DossiersImportSection headers={headers} moi={user?._id || user?.id} />
      )}

      {activeTab === "secteurs" && (
        <SectorRequestsSection headers={headers} onCountChange={setSecteursPending} />
      )}
      {activeTab === "partner_verif" && (
        <PartnerVerifSection
          token={token}
          headers={headers}
          pvList={pvList}
          pvStats={pvStats}
          pvLoading={pvLoading}
          pvFilter={pvFilter}
          setPvFilter={setPvFilter}
          pvDetail={pvDetail}
          setPvDetail={setPvDetail}
          pvCreateModal={pvCreateModal}
          setPvCreateModal={setPvCreateModal}
          pvCreateForm={pvCreateForm}
          setPvCreateForm={setPvCreateForm}
          pvSaving={pvSaving}
          setPvSaving={setPvSaving}
          pvCriterionLoading={pvCriterionLoading}
          setPvCriterionLoading={setPvCriterionLoading}
          users={users}
          onOpenTrustOverview={openTrustOverview}
          onRefresh={loadPartnerVerif}
          showToast={showToast}
        />
      )}
      {/* ══════════════════════ TAB PMS PARTNERS ══════════════════════ */}
      {activeTab === "pms_partners" && (
        <PmsPartnersSection
          adminToggleShowroom={adminToggleShowroom}
          loadPMSAdmin={loadPMSAdmin}
          openTrustOverview={openTrustOverview}
          pmsFilter={pmsFilter}
          pmsLoading={pmsLoading}
          pmsShowrooms={pmsShowrooms}
          pmsStats={pmsStats}
          setPmsFilter={setPmsFilter}
        />
      )}

      {activeTab === "founding_partners" && (() => {
        const ST = {
          brouillon:    { l: "Brouillon",      c: "#94a3b8", bg: "#f8fafc" },
          soumis:       { l: "Soumis ⏳",      c: "#d97706", bg: "#fef3c7" },
          en_review:    { l: "En Review",      c: "#3b82f6", bg: "#eff6ff" },
          loi_envoyee:  { l: "LOI Envoyée",    c: "#7c3aed", bg: "#f5f3ff" },
          loi_signee:   { l: "LOI Signée ✓",  c: "#059669", bg: "#d1fae5" },
          accord_envoye:{ l: "Accord Envoyé",  c: "#f59e0b", bg: "#fff7ed" },
          accord_signe: { l: "Accord Signé ✓", c: "#059669", bg: "#d1fae5" },
          actif:        { l: "Actif 🌟",       c: "#16a34a", bg: "#dcfce7" },
          rejete:       { l: "Rejeté",         c: "#dc2626", bg: "#fee2e2" },
          info_demandee:{ l: "Info Requise",   c: "#d97706", bg: "#fef3c7" },
          aucun_dossier:{ l: "Sans dossier ⚠️", c: "#dc2626", bg: "#fee2e2" },
        };
        return (
          <div className={styles.tabContent}>
            {/* Header + vue toggle */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1rem", flexWrap:"wrap", gap:12 }}>
              <div>
                <h2 style={{ fontSize:"1.1rem", fontWeight:800, color:"#0f1b3f", margin:"0 0 3px" }}>🌟 Founding Partners</h2>
                <p style={{ margin:0, fontSize:".83rem", color:"#64748b" }}>Étape obligatoire de tout partenaire — aucune limite de places.</p>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <div style={{ display:"flex", background:"#f1f5f9", borderRadius:10, padding:3, gap:2 }}>
                  {[{v:"onboarding",l:"📋 Onboarding"},{v:"crm",l:"🗂️ CRM Directory"}].map(({v,l})=>(
                    <button key={v} onClick={()=>setFoundingView(v)}
                      style={{ padding:"6px 14px", borderRadius:8, border:"none", fontWeight:700, fontSize:".8rem", cursor:"pointer",
                        background: foundingView===v ? "#0f1b3f" : "transparent",
                        color: foundingView===v ? "#fff" : "#64748b" }}>
                      {l}
                    </button>
                  ))}
                </div>
                <button className={styles.btnRefresh} onClick={loadFoundingPartners}>↻</button>
              </div>
            </div>

            {/* KPIs */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:12, marginBottom:"1.2rem" }}>
              {[
                { icon:"📋", label:"Total dossiers",    value: foundingStats?.total        || 0, color:"#0f1b3f" },
                { icon:"⏳", label:"En attente",         value: foundingPending              || 0, color:"#d97706" },
                { icon:"✍️", label:"LOI envoyées",       value: foundingStats?.byStatus?.loi_envoyee || 0, color:"#7c3aed" },
                { icon:"📜", label:"Accords envoyés",    value: foundingStats?.byStatus?.accord_envoye || 0, color:"#f59e0b" },
                { icon:"🌟", label:"Fondateurs actifs",  value: foundingStats?.activeFounders || 0, color:"#16a34a" },
                { icon:"❌", label:"Rejetés",             value: foundingStats?.byStatus?.rejete || 0, color:"#dc2626" },
                { icon:"⚠️", label:"Sans dossier",        value: foundingList.filter(o => o.noDossier).length, color:"#dc2626" },
              ].map(k => <StatCard key={k.label} icon={k.icon} label={k.label} value={k.value} color={k.color} />)}
            </div>

            {/* ── VUE CRM DIRECTORY ──────────────────────────────────────────── */}
            {foundingView === "crm" && (() => {
              const CRM_STATUS = {
                interested: { l:"Intéressé",  c:"#d97706", bg:"#fef3c7" },
                reserved:   { l:"Réservé",    c:"#7c3aed", bg:"#f5f3ff" },
                verified:   { l:"Vérifié ✓",  c:"#0284c7", bg:"#e0f2fe" },
                active:     { l:"Actif 🌟",   c:"#16a34a", bg:"#dcfce7" },
                inactive:   { l:"Inactif",    c:"#94a3b8", bg:"#f8fafc" },
              };
              const PRIORITY_ST = {
                high:   { l:"🔴 Haute",   c:"#dc2626" },
                medium: { l:"🟡 Moyenne", c:"#d97706" },
                low:    { l:"🟢 Basse",   c:"#16a34a" },
              };
              const CHANNELS = { whatsapp:"WhatsApp", wechat:"WeChat", email:"Email", phone:"Téléphone", meeting:"RDV", other:"Autre", "":"—" };
              const today = new Date();
              const overdue = (d) => d && new Date(d) < today;

              const filtered = foundingCRMFilter
                ? foundingList.filter(o => (o.adminCRM?.crmStatus || "interested") === foundingCRMFilter)
                : foundingList;

              return (
                <div>
                  {/* Barre de filtres CRM */}
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:14, alignItems:"center" }}>
                    <span style={{ fontSize:".8rem", fontWeight:700, color:"#64748b" }}>Filtrer :</span>
                    {[{v:"",l:"Tous"},
                      {v:"interested",l:"Intéressé"},
                      {v:"reserved",l:"Réservé"},
                      {v:"verified",l:"Vérifié"},
                      {v:"active",l:"Actif"},
                      {v:"inactive",l:"Inactif"},
                    ].map(({v,l})=>(
                      <button key={v} onClick={()=>setFoundingCRMFilter(v)}
                        style={{ padding:"5px 12px", borderRadius:20, border:"1.5px solid", fontWeight:700, fontSize:".76rem", cursor:"pointer",
                          borderColor: foundingCRMFilter===v ? "#0f1b3f" : "#e2e8f0",
                          background: foundingCRMFilter===v ? "#0f1b3f" : "#fff",
                          color: foundingCRMFilter===v ? "#fff" : "#64748b" }}>
                        {l}
                      </button>
                    ))}
                    <span style={{ marginLeft:"auto", fontSize:".76rem", color:"#94a3b8" }}>{filtered.length} entrée(s)</span>
                  </div>

                  {/* Table CRM */}
                  {foundingLoading ? (
                    <div style={{ textAlign:"center", padding:"2rem", color:"#94a3b8" }}>Chargement…</div>
                  ) : filtered.length === 0 ? (
                    <div style={{ textAlign:"center", padding:"2rem", color:"#94a3b8" }}>
                      <div style={{ fontSize:"2rem", marginBottom:8 }}>🗂️</div>
                      <p style={{ fontWeight:600 }}>Aucun partenaire dans ce filtre.</p>
                    </div>
                  ) : (
                    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                      {filtered.map((o) => {
                        const crm   = o.adminCRM || {};
                        const ci    = o.companyInfo || {};
                        const bv    = o.businessVerification || {};
                        const crmSt = CRM_STATUS[crm.crmStatus || "interested"] || CRM_STATUS.interested;
                        const pri   = PRIORITY_ST[crm.priority || "medium"] || PRIORITY_ST.medium;
                        const isEdit = foundingCRMEdit?.id === o._id;
                        const editData = foundingCRMEdit?.data || {};

                        return (
                          <div key={o._id} style={{ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:12, overflow:"hidden", boxShadow:"0 1px 3px rgba(0,0,0,.04)" }}>
                            {/* Ligne principale CRM */}
                            <div style={{ display:"grid", gridTemplateColumns:"2fr 1.5fr 1.5fr 1fr 1fr auto", gap:12, padding:"12px 16px", alignItems:"center" }}>
                              {/* Entreprise */}
                              <div>
                                <div style={{ fontWeight:800, fontSize:".88rem", color:"#0f1b3f" }}>{ci.legalName || "—"}</div>
                                <div style={{ fontSize:".74rem", color:"#64748b", marginTop:2 }}>
                                  {ci.registrationCountry || "—"} · {bv.entityTypes?.join(", ") || "—"}
                                </div>
                                <div style={{ fontSize:".73rem", color:"#94a3b8", marginTop:1 }}>
                                  {bv.brands?.slice(0,3).join(", ") || "—"}
                                  {bv.brands?.length > 3 ? ` +${bv.brands.length - 3}` : ""}
                                </div>
                              </div>
                              {/* Contact */}
                              <div style={{ fontSize:".8rem" }}>
                                <div style={{ fontWeight:600, color:"#0f1b3f" }}>
                                  {ci.mainContact || `${(o.userId?.firstName||"")} ${(o.userId?.lastName||"")}`}
                                  <CountryFlag code={o.userId?.country} countriesConfig={COUNTRIES_CONFIG} />
                                </div>
                                {ci.whatsapp && <div style={{ color:"#16a34a", marginTop:1 }}>📱 {ci.whatsapp}</div>}
                                {ci.wechat   && <div style={{ color:"#07c160", marginTop:1 }}>💬 {ci.wechat}</div>}
                                {ci.email    && <div style={{ color:"#3b82f6", marginTop:1 }}>✉️ {ci.email}</div>}
                              </div>
                              {/* Dernière contact / Next follow-up */}
                              <div style={{ fontSize:".78rem" }}>
                                <div style={{ color:"#64748b" }}>
                                  Dernier contact : <strong style={{ color:"#0f1b3f" }}>
                                    {crm.lastContactDate ? new Date(crm.lastContactDate).toLocaleDateString("fr-FR") : "—"}
                                  </strong>
                                  {crm.lastContactChannel && <span style={{ color:"#94a3b8" }}> via {CHANNELS[crm.lastContactChannel]}</span>}
                                </div>
                                <div style={{ marginTop:4, color: overdue(crm.nextFollowUpDate) ? "#dc2626" : "#64748b" }}>
                                  Prochain suivi : <strong style={{ color: overdue(crm.nextFollowUpDate) ? "#dc2626" : "#0f1b3f" }}>
                                    {crm.nextFollowUpDate ? new Date(crm.nextFollowUpDate).toLocaleDateString("fr-FR") : "—"}
                                  </strong>
                                  {overdue(crm.nextFollowUpDate) && <span style={{ color:"#dc2626", fontWeight:700 }}> ⚠️ En retard</span>}
                                </div>
                                {crm.internalNotes && (
                                  <div style={{ marginTop:4, color:"#64748b", fontSize:".72rem", fontStyle:"italic",
                                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:200 }}
                                    title={crm.internalNotes}>
                                    📝 {crm.internalNotes}
                                  </div>
                                )}
                              </div>
                              {/* CRM Status */}
                              <div style={{ textAlign:"center" }}>
                                <span style={{ display:"inline-block", fontSize:".72rem", fontWeight:700, padding:"4px 10px", borderRadius:20,
                                  background:crmSt.bg, color:crmSt.c }}>
                                  {crmSt.l}
                                </span>
                              </div>
                              {/* Priorité */}
                              <div style={{ textAlign:"center", fontSize:".76rem", fontWeight:700, color:pri.c }}>{pri.l}</div>
                              {/* Actions */}
                              <div style={{ display:"flex", gap:6 }}>
                                <button onClick={() => setFoundingCRMEdit(isEdit ? null : { id: o._id, data: {
                                  crmStatus:          crm.crmStatus || "interested",
                                  lastContactDate:    crm.lastContactDate ? new Date(crm.lastContactDate).toISOString().slice(0,10) : "",
                                  lastContactChannel: crm.lastContactChannel || "",
                                  nextFollowUpDate:   crm.nextFollowUpDate  ? new Date(crm.nextFollowUpDate).toISOString().slice(0,10) : "",
                                  internalNotes:      crm.internalNotes || "",
                                  priority:           crm.priority || "medium",
                                }})}
                                  style={{ padding:"5px 10px", border:"1.5px solid #e2e8f0", borderRadius:8, background: isEdit ? "#0f1b3f" : "#fff",
                                    color: isEdit ? "#fff" : "#64748b", fontWeight:700, fontSize:".75rem", cursor:"pointer" }}>
                                  {isEdit ? "✕" : "✏️"}
                                </button>
                                {ci.whatsapp && (
                                  <a href={`https://wa.me/${ci.whatsapp.replace(/\D/g,"")}`} target="_blank" rel="noopener noreferrer"
                                    style={{ display:"flex", alignItems:"center", padding:"5px 10px", border:"1.5px solid #dcfce7",
                                      borderRadius:8, background:"#f0fdf4", color:"#16a34a", fontWeight:700, fontSize:".75rem", textDecoration:"none" }}>
                                    WA
                                  </a>
                                )}
                              </div>
                            </div>

                            {/* Formulaire d'édition CRM inline */}
                            {isEdit && (
                              <div style={{ borderTop:"1px solid #f1f5f9", padding:"14px 16px", background:"#f8fafc" }}>
                                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:12, marginBottom:12 }}>
                                  {/* CRM Status */}
                                  <div>
                                    <label style={{ fontSize:".73rem", fontWeight:700, color:"#64748b", display:"block", marginBottom:4 }}>Statut CRM</label>
                                    <select value={editData.crmStatus}
                                      onChange={e => setFoundingCRMEdit(prev => ({ ...prev, data: { ...prev.data, crmStatus: e.target.value } }))}
                                      style={{ width:"100%", padding:"6px 8px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem" }}>
                                      <option value="interested">Intéressé</option>
                                      <option value="reserved">Réservé</option>
                                      <option value="verified">Vérifié</option>
                                      <option value="active">Actif</option>
                                      <option value="inactive">Inactif</option>
                                    </select>
                                  </div>
                                  {/* Priorité */}
                                  <div>
                                    <label style={{ fontSize:".73rem", fontWeight:700, color:"#64748b", display:"block", marginBottom:4 }}>Priorité</label>
                                    <select value={editData.priority}
                                      onChange={e => setFoundingCRMEdit(prev => ({ ...prev, data: { ...prev.data, priority: e.target.value } }))}
                                      style={{ width:"100%", padding:"6px 8px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem" }}>
                                      <option value="high">🔴 Haute</option>
                                      <option value="medium">🟡 Moyenne</option>
                                      <option value="low">🟢 Basse</option>
                                    </select>
                                  </div>
                                  {/* Dernier contact */}
                                  <div>
                                    <label style={{ fontSize:".73rem", fontWeight:700, color:"#64748b", display:"block", marginBottom:4 }}>Dernier contact</label>
                                    <input type="date" value={editData.lastContactDate}
                                      onChange={e => setFoundingCRMEdit(prev => ({ ...prev, data: { ...prev.data, lastContactDate: e.target.value } }))}
                                      style={{ width:"100%", padding:"6px 8px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem", boxSizing:"border-box" }} />
                                  </div>
                                  {/* Canal */}
                                  <div>
                                    <label style={{ fontSize:".73rem", fontWeight:700, color:"#64748b", display:"block", marginBottom:4 }}>Canal</label>
                                    <select value={editData.lastContactChannel}
                                      onChange={e => setFoundingCRMEdit(prev => ({ ...prev, data: { ...prev.data, lastContactChannel: e.target.value } }))}
                                      style={{ width:"100%", padding:"6px 8px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem" }}>
                                      <option value="">— Sélectionner</option>
                                      <option value="whatsapp">WhatsApp</option>
                                      <option value="wechat">WeChat</option>
                                      <option value="email">Email</option>
                                      <option value="phone">Téléphone</option>
                                      <option value="meeting">RDV physique</option>
                                      <option value="other">Autre</option>
                                    </select>
                                  </div>
                                  {/* Prochain suivi */}
                                  <div>
                                    <label style={{ fontSize:".73rem", fontWeight:700, color:"#64748b", display:"block", marginBottom:4 }}>Prochain suivi</label>
                                    <input type="date" value={editData.nextFollowUpDate}
                                      onChange={e => setFoundingCRMEdit(prev => ({ ...prev, data: { ...prev.data, nextFollowUpDate: e.target.value } }))}
                                      style={{ width:"100%", padding:"6px 8px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem", boxSizing:"border-box" }} />
                                  </div>
                                </div>
                                {/* Notes internes */}
                                <div style={{ marginBottom:12 }}>
                                  <label style={{ fontSize:".73rem", fontWeight:700, color:"#64748b", display:"block", marginBottom:4 }}>Notes internes</label>
                                  <textarea value={editData.internalNotes}
                                    onChange={e => setFoundingCRMEdit(prev => ({ ...prev, data: { ...prev.data, internalNotes: e.target.value } }))}
                                    rows={2}
                                    placeholder="Observations, historique, points clés de la négociation…"
                                    style={{ width:"100%", padding:"8px 10px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem", resize:"vertical", fontFamily:"inherit", boxSizing:"border-box" }} />
                                </div>
                                <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                                  <button onClick={() => setFoundingCRMEdit(null)}
                                    style={{ padding:"7px 16px", border:"1.5px solid #e2e8f0", borderRadius:8, background:"#fff", color:"#64748b", fontWeight:700, fontSize:".82rem", cursor:"pointer" }}>
                                    Annuler
                                  </button>
                                  <button onClick={() => foundingUpdateCRM(o._id, editData)}
                                    style={{ padding:"7px 18px", border:"none", borderRadius:8, background:"#0f1b3f", color:"#fff", fontWeight:800, fontSize:".82rem", cursor:"pointer" }}>
                                    💾 Sauvegarder
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── VUE ONBOARDING ─────────────────────────────────────────────── */}
            {/* ── Lien d'invitation universel ─────────────────────────────────── */}
            {(() => {
              if (foundingView !== "onboarding") return null;
              const inviteLink = lienPublic("/partner-onboarding");
              // Taux lus depuis bizConfig (PricingConfig live) — jamais figés dans le
              // texte d'invitation, sinon ce message continuerait d'annoncer d'anciens
              // taux après une modification depuis Configuration métier.
              const fpRate      = bizConfig?.foundingPartner?.entreprise;
              const fpDuration  = bizConfig?.foundingPartner?.durationMonths ?? 12;
              const stdLocation = Math.round((bizConfig?.commissions?.standard?.location ?? 0.15) * 100);
              const stdVente    = Math.round((bizConfig?.commissions?.standard?.vente ?? 0.03) * 100);
              const fpLocation  = Math.round((fpRate?.location ?? 0.10) * 100);
              const fpVente     = Math.round((fpRate?.vente ?? 0.015) * 100);
              const businessSub = bizConfig?.subscriptions?.business?.priceUSD ?? 19.99;
              const subValue    = `$${Math.round(businessSub * fpDuration)}+`;
              const waMsg = encodeURIComponent(
                `Bonjour ! 👋\n\nVIT-AUTO vous invite à rejoindre notre *Programme Partenaire Fondateur* — l'étape d'intégration de tout nouveau partenaire.\n\n✅ *Vos avantages Founding Partner :*\n• Commission Location : *${fpLocation}%* (standard ${stdLocation}%)\n• Commission Vente : *${fpVente}%* (standard ${stdVente}%)\n• Abonnement Premium *OFFERT ${fpDuration} mois* (valeur ${subValue})\n• Badge *"Founding Partner"* sur toutes vos annonces\n• Placement prioritaire dans le catalogue international\n• Accès anticipé à toutes les nouvelles fonctionnalités\n\n🔗 *Inscrivez-vous et déposez votre dossier directement ici :*\n${inviteLink}\n\nDes questions ? Contactez-nous : contact@vit-auto.com\n\n_VIT-AUTO — Plateforme Automobile Internationale_`
              );
              const mailSubject = encodeURIComponent("Rejoignez le Programme Founding Partner VIT-AUTO");
              const mailBody = encodeURIComponent(
                `Bonjour,\n\nVIT-AUTO vous invite à rejoindre son Programme Partenaire Fondateur — l'étape d'intégration de tout nouveau partenaire.\n\nVos avantages Founding Partner :\n• Commission Location : ${fpLocation}% (standard ${stdLocation}%)\n• Commission Vente : ${fpVente}% (standard ${stdVente}%)\n• Abonnement Premium OFFERT ${fpDuration} mois (valeur ${subValue})\n• Badge "Founding Partner" sur toutes vos annonces\n• Placement prioritaire dans le catalogue international\n\nInscrivez-vous et déposez votre dossier directement ici :\n${inviteLink}\n\nCordialement,\nManassé N'DRI N'GUESSAN — Founder & CEO\nVIT-AUTO | contact@vit-auto.com`
              );
              return (
                <div style={{ background:"#fff", border:"2px solid #e2e8f0", borderRadius:14, padding:"18px 20px", marginBottom:"1.5rem" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
                    <span style={{ fontSize:"1.3rem" }}>🔗</span>
                    <div>
                      <div style={{ fontWeight:800, fontSize:".9rem", color:"#0f1b3f" }}>Lien d'invitation universel</div>
                      <div style={{ fontSize:".76rem", color:"#64748b" }}>À envoyer à n'importe quel partenaire potentiel — fonctionne pour tout le monde, tant qu'il reste des places</div>
                    </div>
                  </div>
                  {/* Lien */}
                  <div style={{ display:"flex", alignItems:"center", gap:10, background:"#f8fafc", border:"1.5px solid #e2e8f0", borderRadius:10, padding:"10px 14px", marginBottom:12, flexWrap:"wrap" }}>
                    <code style={{ flex:1, fontSize:".82rem", color:"#0f1b3f", fontFamily:"monospace", wordBreak:"break-all" }}>{inviteLink}</code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(inviteLink); showToast("Lien copié !", "success"); }}
                      style={{ padding:"6px 14px", borderRadius:8, border:"none", background:"#0f1b3f", color:"#fff", fontWeight:700, fontSize:".78rem", cursor:"pointer", whiteSpace:"nowrap" }}>
                      📋 Copier
                    </button>
                  </div>
                  {/* Boutons de partage */}
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                    <a href={`https://wa.me/?text=${waMsg}`} target="_blank" rel="noopener noreferrer"
                      style={{ display:"inline-flex", alignItems:"center", gap:7, background:"#25D366", color:"#fff", textDecoration:"none", padding:"9px 16px", borderRadius:10, fontWeight:800, fontSize:".82rem" }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      WhatsApp
                    </a>
                    <a href={`mailto:?subject=${mailSubject}&body=${mailBody}`}
                      style={{ display:"inline-flex", alignItems:"center", gap:7, background:"#3b82f6", color:"#fff", textDecoration:"none", padding:"9px 16px", borderRadius:10, fontWeight:800, fontSize:".82rem" }}>
                      ✉️ Email
                    </a>
                    <a href={inviteLink} target="_blank" rel="noopener noreferrer"
                      style={{ display:"inline-flex", alignItems:"center", gap:7, background:"#f8fafc", color:"#0f1b3f", textDecoration:"none", padding:"9px 16px", borderRadius:10, fontWeight:700, fontSize:".82rem", border:"1.5px solid #e2e8f0" }}>
                      👁 Aperçu
                    </a>
                  </div>
                  <p style={{ margin:"10px 0 0", fontSize:".73rem", color:"#94a3b8" }}>
                    Ce lien fonctionne pour tout partenaire : s'il n'a pas de compte → il s'inscrit puis accède au portail. S'il a déjà un compte partenaire → il arrive directement sur son dossier. Le programme n'a plus de plafond de places.
                  </p>
                </div>
              );
            })()}

            {/* Lien sécurisé généré (à envoyer par WhatsApp) */}
            {foundingView === "onboarding" && foundingSignLink && (
              <div style={{ background:"linear-gradient(135deg,#0f1b3f,#1a3a6e)", borderRadius:14, padding:"20px 24px", marginBottom:"1.5rem", color:"#fff" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                  <span style={{ fontSize:"1.5rem" }}>🔐</span>
                  <div>
                    <div style={{ fontWeight:800, fontSize:"1rem" }}>
                      Lien sécurisé généré — {foundingSignLink.type === "loi" ? "LOI" : "Accord de Partenariat"}
                    </div>
                    <div style={{ fontSize:".8rem", opacity:.75 }}>{foundingSignLink.companyName} · Valable 7 jours · Usage unique</div>
                  </div>
                  <button onClick={() => setFoundingSignLink(null)}
                    style={{ marginLeft:"auto", background:"rgba(255,255,255,.15)", border:"none", color:"#fff", borderRadius:8, padding:"4px 10px", cursor:"pointer", fontSize:".8rem" }}>
                    ✕ Fermer
                  </button>
                </div>
                {/* Lien affiché */}
                <div style={{ background:"rgba(0,0,0,.3)", borderRadius:10, padding:"12px 16px", marginBottom:14, display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                  <code style={{ flex:1, fontSize:".78rem", color:"#93c5fd", wordBreak:"break-all", fontFamily:"monospace" }}>
                    {foundingSignLink.link}
                  </code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(foundingSignLink.link); showToast("Lien copié !", "success"); }}
                    style={{ background:"#ff4d2d", border:"none", color:"#fff", borderRadius:8, padding:"8px 16px", fontWeight:700, cursor:"pointer", fontSize:".82rem", whiteSpace:"nowrap" }}>
                    📋 Copier
                  </button>
                </div>
                {/* Boutons de partage */}
                <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(
                      foundingSignLink.type === "loi"
                        ? `Bonjour ! Votre Lettre d'Intention VIT-AUTO (${foundingSignLink.companyName}) est prête pour signature. Cliquez ici pour lire et signer votre LOI : ${foundingSignLink.link}\n\nCe lien est sécurisé, valable 7 jours et à usage unique.\n\nVIT-AUTO — contact@vit-auto.com`
                        : `Bonjour ! Votre Accord de Partenariat Fondateur VIT-AUTO (${foundingSignLink.companyName}) est prêt. Cliquez ici pour signer et activer votre statut Founding Partner : ${foundingSignLink.link}\n\nCe lien expire dans 7 jours.\n\nVIT-AUTO — contact@vit-auto.com`
                    )}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ display:"inline-flex", alignItems:"center", gap:8, background:"#25D366", color:"#fff", textDecoration:"none", padding:"10px 18px", borderRadius:10, fontWeight:800, fontSize:".88rem" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    Envoyer via WhatsApp
                  </a>
                  <a
                    href={`mailto:?subject=VIT-AUTO%20—%20${encodeURIComponent(foundingSignLink.type === "loi" ? "Votre LOI est prête" : "Votre Accord est prêt")}&body=${encodeURIComponent(
                      foundingSignLink.type === "loi"
                        ? `Bonjour,\n\nVotre Lettre d'Intention VIT-AUTO est prête pour signature.\n\nCliquez ici pour signer : ${foundingSignLink.link}\n\nCe lien expire dans 7 jours.\n\nCordialement,\nVIT-AUTO — contact@vit-auto.com`
                        : `Bonjour,\n\nVotre Accord de Partenariat Fondateur VIT-AUTO est prêt.\n\nCliquez ici pour signer et activer votre statut : ${foundingSignLink.link}\n\nCe lien expire dans 7 jours.\n\nCordialement,\nVIT-AUTO — contact@vit-auto.com`
                    )}`}
                    style={{ display:"inline-flex", alignItems:"center", gap:8, background:"#3b82f6", color:"#fff", textDecoration:"none", padding:"10px 18px", borderRadius:10, fontWeight:800, fontSize:".88rem" }}>
                    ✉️ Email manuel
                  </a>
                  <a href={foundingSignLink.link} target="_blank" rel="noopener noreferrer"
                    style={{ display:"inline-flex", alignItems:"center", gap:8, background:"rgba(255,255,255,.15)", color:"#fff", textDecoration:"none", padding:"10px 18px", borderRadius:10, fontWeight:700, fontSize:".88rem", border:"1.5px solid rgba(255,255,255,.25)" }}>
                    🔗 Ouvrir le lien
                  </a>
                </div>
              </div>
            )}

            {/* Modal Approbation / Rejet */}
            {foundingView === "onboarding" && foundingAction && (
              <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.5)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
                <div style={{ background:"#fff", borderRadius:16, padding:24, maxWidth:440, width:"100%", boxShadow:"0 20px 60px rgba(0,0,0,.25)" }}>
                  <h3 style={{ margin:"0 0 12px", color:"#0f1b3f", fontSize:"1rem", fontWeight:800 }}>
                    {foundingAction.type === "approve" ? "✅ Approuver la candidature"
                      : foundingAction.type === "request-info" ? "🔔 Relancer le partenaire"
                      : "❌ Rejeter le dossier"}
                  </h3>
                  <p style={{ fontSize:".85rem", color:"#64748b", marginBottom:16 }}>
                    {foundingAction.type === "approve"
                      ? "La LOI sera générée et envoyée par email. Un lien sécurisé sera affiché ici pour partage WhatsApp."
                      : foundingAction.type === "request-info"
                      ? "Le partenaire reçoit une notification et un email l'invitant à compléter son dossier (le message ci-dessous lui sera affiché tel quel)."
                      : "Cette action est définitive. Le partenaire recevra une notification."}
                  </p>
                  <textarea
                    value={foundingNote}
                    onChange={e => setFoundingNote(e.target.value)}
                    placeholder={foundingAction.type === "approve" ? "Note interne (optionnelle)…"
                      : foundingAction.type === "request-info" ? "Ex : Merci de compléter les informations entreprise et vos documents légaux pour poursuivre votre candidature Founding Partner."
                      : "Motif du rejet (obligatoire)…"}
                    style={{ width:"100%", minHeight:90, padding:12, border:"1.5px solid #e2e8f0", borderRadius:10, fontSize:".85rem", resize:"vertical", boxSizing:"border-box", fontFamily:"inherit" }}
                  />
                  <div style={{ display:"flex", gap:10, marginTop:14 }}>
                    <button onClick={() => { setFoundingAction(null); setFoundingNote(""); }}
                      style={{ flex:1, padding:"10px", border:"1.5px solid #e2e8f0", borderRadius:10, background:"#f8fafc", cursor:"pointer", fontWeight:700, fontSize:".85rem" }}>
                      Annuler
                    </button>
                    <button
                      onClick={() => foundingAction.type === "approve"
                        ? foundingApprove(foundingAction.id, foundingNote)
                        : foundingAction.type === "request-info"
                        ? foundingRequestInfo(foundingAction.id, foundingNote)
                        : foundingReject(foundingAction.id, foundingNote)}
                      disabled={foundingSubmitting || (foundingAction.type !== "approve" && !foundingNote.trim())}
                      style={{ flex:2, padding:"10px", border:"none", borderRadius:10, cursor: foundingSubmitting ? "not-allowed" : "pointer", fontWeight:800, fontSize:".85rem", opacity: (foundingSubmitting || (foundingAction.type !== "approve" && !foundingNote.trim())) ? 0.6 : 1,
                        background: foundingAction.type === "approve" ? "#16a34a" : foundingAction.type === "request-info" ? "#f59e0b" : "#dc2626", color:"#fff" }}>
                      {foundingSubmitting ? "Envoi…" : foundingAction.type === "approve" ? "Approuver & Envoyer LOI" : foundingAction.type === "request-info" ? "Envoyer la relance" : "Confirmer le rejet"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Liste des dossiers */}
            {foundingView === "onboarding" && foundingLoading && (
              <div style={{ textAlign:"center", padding:"3rem", color:"#94a3b8" }}>Chargement…</div>
            )}
            {foundingView === "onboarding" && !foundingLoading && foundingList.length === 0 && (
              <div style={{ textAlign:"center", padding:"3rem", color:"#94a3b8" }}>
                <div style={{ fontSize:"3rem", marginBottom:12 }}>🌟</div>
                <p style={{ fontWeight:600 }}>Aucune candidature Founding Partner pour le moment.</p>
              </div>
            )}
            {foundingView === "onboarding" && !foundingLoading && foundingList.length !== 0 && (
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                {foundingList.map((o) => {
                  const st = ST[o.status] || { l: o.status, c: "#64748b", bg: "#f8fafc" };
                  const user = o.userId || {};
                  const isDetail = foundingDetail === o._id;
                  return (
                    <div key={o._id} style={{ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:14, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,.05)" }}>
                      {/* Ligne principale */}
                      <div style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 18px", cursor:"pointer" }}
                        onClick={() => setFoundingDetail(isDetail ? null : o._id)}>
                        <div style={{ width:40, height:40, borderRadius:"50%", background:"linear-gradient(135deg,#0f1b3f,#1a3a6e)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:800, fontSize:".9rem", flexShrink:0 }}>
                          {(o.companyInfo?.legalName || "?")[0].toUpperCase()}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:800, fontSize:".9rem", color:"#0f1b3f", display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                            {o.companyInfo?.legalName || "Société non renseignée"}
                            <span style={{ fontSize:".7rem", background:st.bg, color:st.c, padding:"2px 8px", borderRadius:20, fontWeight:700 }}>{st.l}</span>
                            {o.legalEntityType === "particulier" && <span style={{ fontSize:".7rem", background:"#e0e7ff", color:"#4338ca", padding:"2px 8px", borderRadius:20, fontWeight:700 }}>🧑 Particulier</span>}
                            {o.isFoundingPartner && <span style={{ fontSize:".7rem", background:"#fef3c7", color:"#b45309", padding:"2px 8px", borderRadius:20, fontWeight:700 }}>🌟 FP</span>}
                          </div>
                          <div style={{ fontSize:".76rem", color:"#64748b", marginTop:2 }}>
                            {user.firstName} {user.lastName}<CountryFlag code={user.country} countriesConfig={COUNTRIES_CONFIG} /> · {user.email}
                            <span style={{ marginLeft:8, color:"#94a3b8" }}>Réf: {o.referenceNumber || "—"}</span>
                            {/* Le Founding Partner Program est par entité (PartnerBusiness) — un même
                                partenaire peut avoir plusieurs dossiers, un par entité. */}
                            {o.businessId?.companyName && (
                              <span style={{ marginLeft:8, color:"#6366f1", fontWeight:700 }}>🏢 {o.businessId.companyName}</span>
                            )}
                          </div>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
                          {/* Actions rapides selon le statut */}
                          {["soumis","en_review"].includes(o.status) && (
                            <>
                              <button onClick={e => { e.stopPropagation(); setFoundingAction({ id: o._id, type:"approve" }); setFoundingNote(""); }}
                                style={{ padding:"6px 12px", borderRadius:8, border:"none", background:"#16a34a", color:"#fff", fontWeight:700, fontSize:".76rem", cursor:"pointer" }}>
                                ✅ Approuver
                              </button>
                              <button onClick={e => { e.stopPropagation(); setFoundingAction({ id: o._id, type:"reject" }); setFoundingNote(""); }}
                                style={{ padding:"6px 12px", borderRadius:8, border:"none", background:"#dc2626", color:"#fff", fontWeight:700, fontSize:".76rem", cursor:"pointer" }}>
                                ❌ Rejeter
                              </button>
                            </>
                          )}
                          {["brouillon","info_demandee"].includes(o.status) && (
                            <button onClick={e => { e.stopPropagation(); setFoundingAction({ id: o._id, type:"request-info" }); setFoundingNote(""); }}
                              style={{ padding:"6px 12px", borderRadius:8, border:"none", background:"#f59e0b", color:"#fff", fontWeight:700, fontSize:".76rem", cursor:"pointer" }}
                              title="Dossier incomplet — notifier le partenaire pour qu'il le complète">
                              🔔 Relancer
                            </button>
                          )}
                          {/* Entité SANS AUCUN dossier — le partenaire n'a jamais cliqué
                              "Commencer ma candidature" (voir adminList, orphanRows) : rien à
                              approuver/renvoyer, seulement à inviter à démarrer. */}
                          {o.noDossier && (
                            <button onClick={e => { e.stopPropagation(); foundingRelaunchBusiness(o._id); }}
                              disabled={foundingRowActionId === o._id}
                              style={{ padding:"6px 12px", borderRadius:8, border:"none", background:"#dc2626", color:"#fff", fontWeight:700, fontSize:".76rem", cursor: foundingRowActionId === o._id ? "not-allowed" : "pointer", opacity: foundingRowActionId === o._id ? 0.6 : 1 }}
                              title="Aucune candidature démarrée pour cette entité — envoyer une invitation à démarrer">
                              🔔 Relancer
                            </button>
                          )}
                          {o.status === "loi_signee" && (
                            <button onClick={e => { e.stopPropagation(); foundingSendAgreement(o._id); }}
                              disabled={foundingRowActionId === o._id}
                              style={{ padding:"6px 14px", borderRadius:8, border:"none", background:"#7c3aed", color:"#fff", fontWeight:700, fontSize:".76rem", cursor: foundingRowActionId === o._id ? "not-allowed" : "pointer", opacity: foundingRowActionId === o._id ? 0.6 : 1 }}>
                              📜 Envoyer Accord
                            </button>
                          )}
                          {["loi_envoyee","accord_envoye"].includes(o.status) && (
                            <span style={{ fontSize:".75rem", color:"#7c3aed", fontWeight:600 }}>⏳ En attente signature</span>
                          )}
                          {["accord_signe","actif"].includes(o.status) && (
                            <span style={{ fontSize:".75rem", color:"#16a34a", fontWeight:700 }}>🌟 Actif</span>
                          )}
                          {/* Vue de confiance unifiée — croise ce dossier avec KYC/
                              Certification/PMS sans changer d'onglet. */}
                          {user._id && (
                            <button
                              title="Vue de confiance unifiée"
                              onClick={e => { e.stopPropagation(); openTrustOverview(user); }}
                              style={{ padding:"6px 10px", borderRadius:8, border:"none", background:"#f1f5f9", color:"#0f1b3f", fontWeight:700, fontSize:".8rem", cursor:"pointer" }}>
                              🛡️
                            </button>
                          )}
                          <span style={{ color:"#94a3b8", fontSize:".9rem" }}>{isDetail ? "▲" : "▼"}</span>
                        </div>
                      </div>

                      {/* Détail expandable */}
                      {isDetail && (
                        <div style={{ borderTop:"1px solid #f1f5f9", padding:"16px 18px", background:"#fafbfd" }}>
                          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:12, marginBottom:14 }}>
                            <div>
                              <div style={{ fontSize:".72rem", color:"#94a3b8", fontWeight:700, textTransform:"uppercase", marginBottom:4 }}>Entreprise</div>
                              <div style={{ fontSize:".84rem", color:"#0f1b3f", fontWeight:700 }}>{o.companyInfo?.legalName || "—"}</div>
                              <div style={{ fontSize:".77rem", color:"#64748b" }}>{o.companyInfo?.registrationCountry || "—"} · {o.companyInfo?.email || "—"}</div>
                              <div style={{ fontSize:".77rem", color:"#64748b" }}>{o.companyInfo?.phone || "—"} · {o.companyInfo?.whatsapp || "—"}</div>
                            </div>
                            <div>
                              <div style={{ fontSize:".72rem", color:"#94a3b8", fontWeight:700, textTransform:"uppercase", marginBottom:4 }}>Contact</div>
                              <div style={{ fontSize:".84rem", color:"#0f1b3f", fontWeight:700 }}>{o.companyInfo?.mainContact || `${user.firstName} ${user.lastName}`}</div>
                              <div style={{ fontSize:".77rem", color:"#64748b" }}>{o.companyInfo?.mainContactPosition || "—"}</div>
                            </div>
                            <div>
                              <div style={{ fontSize:".72rem", color:"#94a3b8", fontWeight:700, textTransform:"uppercase", marginBottom:4 }}>Commissions</div>
                              <div style={{ fontSize:".82rem", color:"#0f1b3f" }}>Location: <strong>{o.commissions?.location || 10}%</strong></div>
                              <div style={{ fontSize:".82rem", color:"#0f1b3f" }}>Vente: <strong>{o.commissions?.vente || 2}%</strong></div>
                              <div style={{ fontSize:".82rem", color:"#0f1b3f" }}>Chauffeur: <strong>{o.commissions?.chauffeur || 10}%</strong></div>
                            </div>
                            <div>
                              <div style={{ fontSize:".72rem", color:"#94a3b8", fontWeight:700, textTransform:"uppercase", marginBottom:4 }}>Documents LOI/Accord</div>
                              <div style={{ fontSize:".8rem" }}>
                                LOI: {o.loi?.signedAt ? <span style={{ color:"#16a34a", fontWeight:700 }}>✓ Signée {new Date(o.loi.signedAt).toLocaleDateString("fr-FR")}</span> : o.loi?.sentAt ? <span style={{ color:"#7c3aed" }}>Envoyée</span> : <span style={{ color:"#94a3b8" }}>—</span>}
                              </div>
                              <div style={{ fontSize:".8rem" }}>
                                Accord: {o.agreement?.signedAt ? <span style={{ color:"#16a34a", fontWeight:700 }}>✓ Signé {new Date(o.agreement.signedAt).toLocaleDateString("fr-FR")}</span> : o.agreement?.sentAt ? <span style={{ color:"#f59e0b" }}>Envoyé</span> : <span style={{ color:"#94a3b8" }}>—</span>}
                              </div>
                              {o.loi?.signerName && <div style={{ fontSize:".76rem", color:"#64748b", marginTop:4 }}>Signataire: {o.loi.signerName}</div>}
                            </div>
                          </div>
                          <FoundingDocs o={o} />
                          <FoundingBusinessInfo o={o} />
                          {/* Regénérer le lien sécurisé */}
                          {o.status === "loi_envoyee" && (
                            <div style={{ background:"#f5f3ff", border:"1px solid #ddd6fe", borderRadius:10, padding:"10px 14px", marginTop:8 }}>
                              <p style={{ margin:"0 0 8px", fontSize:".8rem", color:"#4c1d95", fontWeight:700 }}>🔐 Partenaire n'a pas encore signé la LOI</p>
                              <p style={{ margin:"0 0 10px", fontSize:".77rem", color:"#6d28d9" }}>Le lien envoyé peut avoir expiré ou ne pas s'être ouvert correctement.</p>
                              <button
                                onClick={() => { foundingResendDocuments(o._id); }}
                                disabled={foundingRowActionId === o._id}
                                style={{ padding:"6px 14px", borderRadius:8, border:"none", background:"#7c3aed", color:"#fff", fontWeight:700, fontSize:".78rem", cursor: foundingRowActionId === o._id ? "not-allowed" : "pointer", opacity: foundingRowActionId === o._id ? 0.6 : 1 }}>
                                🔄 Renvoyer la LOI
                              </button>
                            </div>
                          )}
                          {o.status === "accord_envoye" && (
                            <div style={{ background:"#fff7ed", border:"1px solid #fed7aa", borderRadius:10, padding:"10px 14px", marginTop:8 }}>
                              <p style={{ margin:"0 0 8px", fontSize:".8rem", color:"#92400e", fontWeight:700 }}>⏳ En attente de signature de l'accord</p>
                              <button
                                onClick={() => { foundingResendDocuments(o._id); }}
                                disabled={foundingRowActionId === o._id}
                                style={{ padding:"6px 14px", borderRadius:8, border:"none", background:"#f59e0b", color:"#fff", fontWeight:700, fontSize:".78rem", cursor: foundingRowActionId === o._id ? "not-allowed" : "pointer", opacity: foundingRowActionId === o._id ? 0.6 : 1 }}>
                                🔄 Renvoyer l'accord
                              </button>
                            </div>
                          )}
                          {o.auditLog?.length > 0 && (
                            <div style={{ marginTop:12 }}>
                              <div style={{ fontSize:".72rem", color:"#94a3b8", fontWeight:700, textTransform:"uppercase", marginBottom:6 }}>Historique</div>
                              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                                {o.auditLog.slice(-5).reverse().map((a, i) => (
                                  <div key={i} style={{ fontSize:".74rem", color:"#64748b", display:"flex", gap:8 }}>
                                    <span style={{ color:"#94a3b8" }}>{new Date(a.timestamp).toLocaleDateString("fr-FR")}</span>
                                    <span style={{ fontWeight:700, color:"#0f1b3f" }}>{a.action}</span>
                                    {a.note && <span>— {a.note}</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {activeTab === "partenaires" && <WipSection icon="🤝" title="Gestion des Partenariats" subtitle="Contrats partenaires, commissions, et tableau de bord dédié par partenaire stratégique." features={["Concessionnaires, loueurs, assureurs, banques","Contrats : date, commission, statut","Tableau de bord commissions par partenaire","Catégories : BYD, Hyundai, Total, NSIA..."]} />}

      {activeTab === "partner_crm" && (() => {
        const CRM_ST = {
          LEAD:                 { l: "Lead",                    c: "#64748b", bg: "#f1f5f9" },
          CONTACTE:             { l: "Contacté",                c: "#d97706", bg: "#fef3c7" },
          INTERESSE:            { l: "Intéressé",               c: "#f59e0b", bg: "#fff7ed" },
          QUALIFIE:             { l: "Qualifié",                c: "#3b82f6", bg: "#eff6ff" },
          NEGOCIATION:          { l: "Négociation",             c: "#7c3aed", bg: "#f5f3ff" },
          INSCRIT:              { l: "Inscrit",                 c: "#0284c7", bg: "#e0f2fe" },
          ACTIF:                { l: "Actif",                   c: "#16a34a", bg: "#dcfce7" },
          PREMIERE_TRANSACTION: { l: "1ère transaction 🎉",     c: "#059669", bg: "#d1fae5" },
          PARTENAIRE_FIDELE:    { l: "Partenaire fidèle 🌟",    c: "#b45309", bg: "#fef3c7" },
          ABANDONNE:            { l: "Abandonné",               c: "#b91c1c", bg: "#fee2e2" },
        };
        const pages = Math.max(1, Math.ceil(crmTotal / CRM_PAR_PAGE));
        const CRM_ORDER = ["LEAD","CONTACTE","INTERESSE","QUALIFIE","NEGOCIATION","INSCRIT","ACTIF","PREMIERE_TRANSACTION","PARTENAIRE_FIDELE"];
        const totalConverti = (crmStats?.byStatut?.ACTIF || 0) + (crmStats?.byStatut?.PREMIERE_TRANSACTION || 0) + (crmStats?.byStatut?.PARTENAIRE_FIDELE || 0);
        const totalEnCours = (crmStats?.byStatut?.CONTACTE || 0) + (crmStats?.byStatut?.INTERESSE || 0) + (crmStats?.byStatut?.QUALIFIE || 0) + (crmStats?.byStatut?.NEGOCIATION || 0);

        return (
          <div className={styles.tabContent}>
            {/* Header + vue toggle */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1rem", flexWrap:"wrap", gap:12 }}>
              <div>
                <h2 style={{ fontSize:"1.1rem", fontWeight:800, color:"#0f1b3f", margin:"0 0 3px" }}>🎯 CRM Partenaires</h2>
                <p style={{ margin:0, fontSize:".83rem", color:"#64748b" }}>Pipeline de prospection — du premier contact au partenaire fidèle.</p>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <div style={{ display:"flex", background:"#f1f5f9", borderRadius:10, padding:3, gap:2 }}>
                  {[{v:"liste",l:"📋 Liste"},{v:"pipeline",l:"🎯 Pipeline"}].map(({v,l})=>(
                    <button key={v} onClick={()=>setCrmView(v)}
                      style={{ padding:"6px 14px", borderRadius:8, border:"none", fontWeight:700, fontSize:".8rem", cursor:"pointer",
                        background: crmView===v ? "#0f1b3f" : "transparent",
                        color: crmView===v ? "#fff" : "#64748b" }}>
                      {l}
                    </button>
                  ))}
                </div>
                <button className={styles.btnRefresh} onClick={loadPartnerCrm}>↻</button>
                <button onClick={() => setCrmCreating((v) => !v)}
                  style={{ padding:"8px 16px", border:"none", borderRadius:8, background:"#0f1b3f", color:"#fff", fontWeight:700, fontSize:".82rem", cursor:"pointer" }}>
                  {crmCreating ? "✕ Annuler" : "+ Nouveau prospect"}
                </button>
              </div>
            </div>

            {/* Formulaire de création */}
            {crmCreating && (
              <div style={{ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:12, padding:16, marginBottom:16 }}>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:10, marginBottom:12 }}>
                  <input placeholder="Entreprise *" value={crmNewForm.entreprise} onChange={e=>setCrmNewForm(f=>({...f,entreprise:e.target.value}))}
                    style={{ padding:"7px 9px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem" }} />
                  <select value={crmNewForm.pays} onChange={e=>setCrmNewForm(f=>({...f,pays:e.target.value}))}
                    style={{ padding:"7px 9px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem" }}>
                    <option value="">— Pays —</option>
                    {COUNTRIES_CONFIG.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </select>
                  <input placeholder="Ville" value={crmNewForm.ville} onChange={e=>setCrmNewForm(f=>({...f,ville:e.target.value}))}
                    style={{ padding:"7px 9px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem" }} />
                  <input placeholder="Secteur (ex: Assurance, Concessionnaire...)" value={crmNewForm.secteur} onChange={e=>setCrmNewForm(f=>({...f,secteur:e.target.value}))}
                    style={{ padding:"7px 9px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem" }} />
                  <input placeholder="Nom du contact" value={crmNewForm.contactNom} onChange={e=>setCrmNewForm(f=>({...f,contactNom:e.target.value}))}
                    style={{ padding:"7px 9px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem" }} />
                  <input placeholder="Téléphone" value={crmNewForm.contactTel} onChange={e=>setCrmNewForm(f=>({...f,contactTel:e.target.value}))}
                    style={{ padding:"7px 9px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem" }} />
                  <input placeholder="Email" value={crmNewForm.contactEmail} onChange={e=>setCrmNewForm(f=>({...f,contactEmail:e.target.value}))}
                    style={{ padding:"7px 9px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem" }} />
                  <input placeholder="Site web" value={crmNewForm.website} onChange={e=>setCrmNewForm(f=>({...f,website:e.target.value}))}
                    style={{ padding:"7px 9px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem" }} />
                  <input placeholder="Source (salon, recommandation...)" value={crmNewForm.source} onChange={e=>setCrmNewForm(f=>({...f,source:e.target.value}))}
                    style={{ padding:"7px 9px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem" }} />
                  <select value={crmNewForm.assignedTo} onChange={e=>setCrmNewForm(f=>({...f,assignedTo:e.target.value}))}
                    style={{ padding:"7px 9px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem" }}>
                    <option value="">— Responsable commercial —</option>
                    {adminAccounts.map(a => <option key={a._id} value={a._id}>{a.firstName} {a.lastName}</option>)}
                  </select>
                </div>
                <div style={{ display:"flex", justifyContent:"flex-end" }}>
                  <button disabled={crmSubmitting} onClick={() => crmCreateProspect(false)}
                    style={{ padding:"8px 20px", border:"none", borderRadius:8, background:"#16a34a", color:"#fff", fontWeight:800, fontSize:".82rem", cursor: crmSubmitting ? "not-allowed" : "pointer", opacity: crmSubmitting ? .6 : 1 }}>
                    💾 Créer le prospect
                  </button>
                </div>
                {crmDoublons && (
                  <div style={{ marginTop:10 }}>
                    <BlocDoublons doublons={crmDoublons} titre="Ce prospect ressemble à une fiche ou à un compte existant" />
                    <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
                      <button onClick={() => setCrmDoublons(null)} className={styles.btnGhost}>Corriger la saisie</button>
                      <button disabled={crmSubmitting} onClick={() => crmCreateProspect(true)} className={styles.btnPrimary}>Créer quand même</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* KPIs */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:12, marginBottom:"1.2rem" }}>
              {[
                { icon:"📋", label:"Total pipeline",   value: crmStats?.total || 0, color:"#0f1b3f" },
                { icon:"🎯", label:"Leads",             value: crmStats?.byStatut?.LEAD || 0, color:"#64748b" },
                { icon:"💬", label:"En cours",          value: totalEnCours, color:"#d97706" },
                { icon:"📝", label:"Inscrits",          value: crmStats?.byStatut?.INSCRIT || 0, color:"#0284c7" },
                { icon:"🌟", label:"Convertis (déclarés)", value: totalConverti, color:"#16a34a" },
                { icon:"✅", label:"Activés (réel)",    value: crmStats?.activationReelle?.active ?? 0, color:"#15803d" },
                { icon:"⏰", label:"À relancer",        value: crmStats?.aRelancer ?? 0, color:"#b91c1c" },
                { icon:"🚫", label:"Abandonnés",        value: crmStats?.byStatut?.ABANDONNE || 0, color:"#94a3b8" },
              ].map(k => <StatCard key={k.label} icon={k.icon} label={k.label} value={k.value} color={k.color} />)}
            </div>

            {/* Barre de filtres */}
            <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:14, alignItems:"center" }}>
              <input placeholder="🔍 Rechercher (entreprise, contact, email)..." value={crmSearch} onChange={e=>setCrmSearch(e.target.value)}
                style={{ padding:"7px 10px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem", minWidth:220 }} />
              <select value={crmFilter.statut} onChange={e=>setCrmFilter(f=>({...f,statut:e.target.value}))}
                style={{ padding:"7px 9px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem" }}>
                <option value="">Tous les statuts</option>
                {[...CRM_ORDER, "ABANDONNE"].map(s => <option key={s} value={s}>{CRM_ST[s].l}</option>)}
              </select>
              <select value={crmFilter.pays} onChange={e=>setCrmFilter(f=>({...f,pays:e.target.value}))}
                style={{ padding:"7px 9px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem" }}>
                <option value="">Tous les pays</option>
                {COUNTRIES_CONFIG.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
              <input placeholder="Secteur" value={crmFilter.secteur} onChange={e=>setCrmFilter(f=>({...f,secteur:e.target.value}))}
                style={{ padding:"7px 9px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem", width:140 }} />
              <select value={crmFilter.assignedTo} onChange={e=>setCrmFilter(f=>({...f,assignedTo:e.target.value}))}
                style={{ padding:"7px 9px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem" }}>
                <option value="">Tous les responsables</option>
                {adminAccounts.map(a => <option key={a._id} value={a._id}>{a.firstName} {a.lastName}</option>)}
              </select>
              <input placeholder="Origine" value={crmFilter.source} onChange={e=>setCrmFilter(f=>({...f,source:e.target.value}))}
                style={{ padding:"7px 9px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem", width:120 }} />
              <label style={{ fontSize:".8rem", color:"#334155", display:"flex", gap:4, alignItems:"center" }}>
                <input type="checkbox" checked={crmFilter.aRelancer} onChange={e=>setCrmFilter(f=>({...f,aRelancer:e.target.checked}))} /> À relancer
              </label>
              <span style={{ marginLeft:"auto", fontSize:".76rem", color:"#94a3b8" }}>{crmTotal} prospect(s){pages > 1 ? ` · page ${crmPage}/${pages}` : ""}</span>
            </div>

            {crmLoading ? (
              <div style={{ textAlign:"center", padding:"2rem", color:"#94a3b8" }}>Chargement…</div>
            ) : crmErreur ? (
              <div role="alert" style={{ textAlign:"center", padding:"1.5rem", color:"#b91c1c", background:"#fef2f2", borderRadius:10 }}>
                {crmErreur} <button onClick={loadPartnerCrm} style={{ marginLeft:8, border:"1px solid #fecaca", background:"#fff", borderRadius:6, padding:"3px 10px", cursor:"pointer" }}>Réessayer</button>
              </div>
            ) : crmList.length === 0 ? (
              <div style={{ textAlign:"center", padding:"2rem", color:"#94a3b8" }}>
                <div style={{ fontSize:"2rem", marginBottom:8 }}>🎯</div>
                <p style={{ fontWeight:600 }}>Aucun prospect pour ce filtre.</p>
              </div>
            ) : crmView === "liste" ? (
              <div style={{ overflowX:"auto" }}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Entreprise</th><th>Pays / Ville</th><th>Secteur</th><th>Contact</th>
                      <th>Statut</th><th>Activation</th><th>Responsable</th><th>Dernier contact</th><th>Prochaine action</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {crmList.map((c) => {
                      const st = CRM_ST[c.statut] || CRM_ST.LEAD;
                      return (
                        <tr key={c._id} onClick={() => crmOpenDetail(c._id)} style={{ cursor:"pointer" }}>
                          <td style={{ fontWeight:700, color:"#0f1b3f" }}>{c.entreprise}</td>
                          <td>{COUNTRIES_CONFIG.find(x=>x.code===c.pays)?.name || c.pays || "—"}{c.ville ? ` · ${c.ville}` : ""}</td>
                          <td>{c.secteur || "—"}</td>
                          <td>{c.contactNom || "—"}{c.contactTel ? ` · ${c.contactTel}` : ""}</td>
                          <td>
                            <span style={{ display:"inline-block", fontSize:".72rem", fontWeight:700, padding:"4px 10px", borderRadius:20, background:st.bg, color:st.c }}>
                              {st.l}
                            </span>
                          </td>
                          <td><BadgeActivation activation={c.activation} /></td>
                          <td>{c.assignedTo ? `${c.assignedTo.firstName} ${c.assignedTo.lastName}` : "—"}</td>
                          <td>{c.lastContactDate ? new Date(c.lastContactDate).toLocaleDateString("fr-FR") : "—"}</td>
                          <td>{c.statut === "ABANDONNE" ? "—" : <ProchaineAction libelle={c.prochaineAction} echeance={c.nextFollowUpDate} />}</td>
                          <td><button onClick={(e)=>{e.stopPropagation();crmOpenDetail(c._id);}} style={{ border:"none", background:"transparent", cursor:"pointer" }}>👁️</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ display:"flex", gap:10, overflowX:"auto", paddingBottom:10 }}>
                {CRM_ORDER.map((statut) => {
                  const items = crmList.filter(c => c.statut === statut);
                  const st = CRM_ST[statut];
                  const idx = CRM_ORDER.indexOf(statut);
                  const next = CRM_ORDER[idx + 1];
                  return (
                    <div key={statut} style={{ minWidth:220, flex:"0 0 220px", background:"#f8fafc", borderRadius:10, padding:10 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                        <span style={{ fontSize:".78rem", fontWeight:800, color:st.c }}>{st.l}</span>
                        <span style={{ fontSize:".72rem", fontWeight:700, color:"#94a3b8" }}>{items.length}</span>
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                        {items.map((c) => (
                          <div key={c._id} style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:8, padding:8 }}>
                            <div onClick={()=>crmOpenDetail(c._id)} style={{ cursor:"pointer", fontWeight:700, fontSize:".78rem", color:"#0f1b3f" }}>{c.entreprise}</div>
                            <div style={{ fontSize:".7rem", color:"#94a3b8" }}>{c.contactNom || "—"}</div>
                            {next && (
                              <button onClick={() => crmAdvanceStatut(c._id, next)}
                                style={{ marginTop:6, width:"100%", padding:"4px 6px", border:"1px solid #e2e8f0", borderRadius:6, background:"#fff", color:"#0f1b3f", fontWeight:700, fontSize:".68rem", cursor:"pointer" }}>
                                → {CRM_ST[next].l}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!crmLoading && !crmErreur && pages > 1 && (
              <div style={{ display:"flex", justifyContent:"center", gap:8, marginTop:12 }}>
                <button disabled={crmPage <= 1} onClick={() => setCrmPage((n) => n - 1)} className={styles.btnGhost}>← Précédente</button>
                <span style={{ fontSize:".8rem", color:"#64748b", alignSelf:"center" }}>Page {crmPage} / {pages}</span>
                <button disabled={crmPage >= pages} onClick={() => setCrmPage((n) => n + 1)} className={styles.btnGhost}>Suivante →</button>
              </div>
            )}

            {/* Modal détail / édition */}
            {crmDetail && (
              <div className={styles.overlay} onClick={() => setCrmDetail(null)}>
                <div className={styles.confirmBox} style={{ maxWidth:680, width:"95%", maxHeight:"85vh", overflowY:"auto", textAlign:"left" }} onClick={e=>e.stopPropagation()}>
                  {!crmDetailData || !crmEditData ? (
                    <div style={{ textAlign:"center", padding:"2rem", color:"#94a3b8" }}>Chargement…</div>
                  ) : (() => {
                    const { crm, liveStats, activation, doublons } = crmDetailData;
                    const st = CRM_ST[crm.statut] || CRM_ST.LEAD;
                    return (
                      <>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                          <div>
                            <h3 style={{ margin:"0 0 4px", fontSize:"1.05rem", fontWeight:800, color:"#0f1b3f" }}>{crm.entreprise}</h3>
                            <span style={{ display:"inline-block", fontSize:".72rem", fontWeight:700, padding:"4px 10px", borderRadius:20, background:st.bg, color:st.c }}>{st.l}</span>
                            <span style={{ marginLeft:8, fontSize:".72rem", color:"#94a3b8" }}>{crm.referenceNumber}</span>
                          </div>
                          <button onClick={()=>setCrmDetail(null)} style={{ border:"none", background:"transparent", fontSize:"1.1rem", cursor:"pointer", color:"#94a3b8" }}>✕</button>
                        </div>

                        <Abandon crm={crm} headers={headers} notifier={showToast} onFait={() => { loadPartnerCrm(); crmOpenDetail(crm._id); }} />
                        <BlocActivation activation={activation} />
                        <BlocDoublons doublons={doublons} />
                        {crm.linkedUserId ? (
                          <div style={{ background:"#f0fdf4", border:"1px solid #dcfce7", borderRadius:8, padding:10, marginBottom:12, fontSize:".8rem" }}>
                            🔗 Lié au compte <strong>{crm.linkedUserId.firstName} {crm.linkedUserId.lastName}</strong> ({crm.linkedUserId.email})
                            <div style={{ marginTop:6, display:"flex", gap:16 }}>
                              <span>🚗 {liveStats.nombreAnnonces} annonce(s)</span>
                              <span>💼 {liveStats.transactionsCount} transaction(s)</span>
                              <span>💰 {Number(liveStats.chiffreAffairesGenere || 0).toLocaleString("fr-FR")} CA généré</span>
                            </div>
                          </div>
                        ) : (
                          <div style={{ background:"#fef3c7", border:"1px solid #fde68a", borderRadius:8, padding:10, marginBottom:12, display:"flex", gap:8, alignItems:"center" }}>
                            <input placeholder="ID du compte utilisateur à lier" value={crmLinkUserId} onChange={e=>setCrmLinkUserId(e.target.value)}
                              style={{ flex:1, padding:"6px 8px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".78rem" }} />
                            <button disabled={crmSubmitting} onClick={crmLinkAccount}
                              style={{ padding:"6px 12px", border:"none", borderRadius:8, background:"#0f1b3f", color:"#fff", fontWeight:700, fontSize:".76rem", cursor:"pointer" }}>
                              🔗 Lier
                            </button>
                          </div>
                        )}

                        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:10, marginBottom:12 }}>
                          {[
                            ["entreprise","Entreprise"], ["pays","Pays"], ["ville","Ville"], ["secteur","Secteur"],
                            ["contactNom","Contact"], ["contactTel","Téléphone"], ["contactEmail","Email"], ["website","Site web"],
                            ["source","Source"],
                          ].map(([key,label]) => (
                            <div key={key}>
                              <label style={{ fontSize:".72rem", fontWeight:700, color:"#64748b", display:"block", marginBottom:3 }}>{label}</label>
                              <input value={crmEditData[key]} onChange={e=>setCrmEditData(d=>({...d,[key]:e.target.value}))}
                                style={{ width:"100%", padding:"6px 8px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".8rem", boxSizing:"border-box" }} />
                            </div>
                          ))}
                          <div>
                            <label style={{ fontSize:".72rem", fontWeight:700, color:"#64748b", display:"block", marginBottom:3 }}>Responsable commercial</label>
                            <select value={crmEditData.assignedTo} onChange={e=>setCrmEditData(d=>({...d,assignedTo:e.target.value}))}
                              style={{ width:"100%", padding:"6px 8px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".8rem" }}>
                              <option value="">—</option>
                              {adminAccounts.map(a => <option key={a._id} value={a._id}>{a.firstName} {a.lastName}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize:".72rem", fontWeight:700, color:"#64748b", display:"block", marginBottom:3 }}>Priorité</label>
                            <select value={crmEditData.priority} onChange={e=>setCrmEditData(d=>({...d,priority:e.target.value}))}
                              style={{ width:"100%", padding:"6px 8px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".8rem" }}>
                              <option value="high">🔴 Haute</option><option value="medium">🟡 Moyenne</option><option value="low">🟢 Basse</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize:".72rem", fontWeight:700, color:"#64748b", display:"block", marginBottom:3 }}>Dernier contact</label>
                            <input type="date" value={crmEditData.lastContactDate} onChange={e=>setCrmEditData(d=>({...d,lastContactDate:e.target.value}))}
                              style={{ width:"100%", padding:"6px 8px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".8rem", boxSizing:"border-box" }} />
                          </div>
                          <div>
                            <label style={{ fontSize:".72rem", fontWeight:700, color:"#64748b", display:"block", marginBottom:3 }}>Canal</label>
                            <select value={crmEditData.lastContactChannel} onChange={e=>setCrmEditData(d=>({...d,lastContactChannel:e.target.value}))}
                              style={{ width:"100%", padding:"6px 8px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".8rem" }}>
                              <option value="">—</option><option value="whatsapp">WhatsApp</option><option value="wechat">WeChat</option>
                              <option value="email">Email</option><option value="phone">Téléphone</option><option value="meeting">RDV</option><option value="other">Autre</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize:".72rem", fontWeight:700, color:"#64748b", display:"block", marginBottom:3 }}>Échéance prochaine action</label>
                            <input type="date" value={crmEditData.nextFollowUpDate} onChange={e=>setCrmEditData(d=>({...d,nextFollowUpDate:e.target.value}))}
                              style={{ width:"100%", padding:"6px 8px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".8rem", boxSizing:"border-box" }} />
                          </div>
                          <div>
                            <label style={{ fontSize:".72rem", fontWeight:700, color:"#64748b", display:"block", marginBottom:3 }}>Prochaine action</label>
                            <input value={crmEditData.prochaineAction} onChange={e=>setCrmEditData(d=>({...d,prochaineAction:e.target.value}))}
                              style={{ width:"100%", padding:"6px 8px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".8rem", boxSizing:"border-box" }} />
                          </div>
                          <div>
                            <label style={{ fontSize:".72rem", fontWeight:700, color:"#64748b", display:"block", marginBottom:3 }}>Commission (%)</label>
                            <input type="number" value={crmEditData.commissionTaux} onChange={e=>setCrmEditData(d=>({...d,commissionTaux:e.target.value}))}
                              style={{ width:"100%", padding:"6px 8px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".8rem", boxSizing:"border-box" }} />
                          </div>
                          <div>
                            <label style={{ fontSize:".72rem", fontWeight:700, color:"#64748b", display:"block", marginBottom:3 }}>Réf. contrat</label>
                            <input value={crmEditData.contratReference} onChange={e=>setCrmEditData(d=>({...d,contratReference:e.target.value}))}
                              style={{ width:"100%", padding:"6px 8px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".8rem", boxSizing:"border-box" }} />
                          </div>
                          <div>
                            <label style={{ fontSize:".72rem", fontWeight:700, color:"#64748b", display:"block", marginBottom:3 }}>Services (séparés par virgule)</label>
                            <input value={crmEditData.services} onChange={e=>setCrmEditData(d=>({...d,services:e.target.value}))}
                              style={{ width:"100%", padding:"6px 8px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".8rem", boxSizing:"border-box" }} />
                          </div>
                        </div>

                        <div style={{ marginBottom:12 }}>
                          <label style={{ fontSize:".72rem", fontWeight:700, color:"#64748b", display:"block", marginBottom:3 }}>Notes internes</label>
                          <textarea value={crmEditData.internalNotes} onChange={e=>setCrmEditData(d=>({...d,internalNotes:e.target.value}))} rows={2}
                            style={{ width:"100%", padding:"8px 10px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".8rem", resize:"vertical", fontFamily:"inherit", boxSizing:"border-box" }} />
                        </div>

                        <JournalEchanges key={`${crm._id}-${crm.echanges?.length || 0}`} crm={crm} headers={headers} notifier={showToast} onEnregistre={() => { loadPartnerCrm(); crmOpenDetail(crm._id); }} />

                        {crm.statusHistory?.length > 0 && (
                          <div style={{ marginBottom:12, fontSize:".74rem", color:"#94a3b8" }}>
                            <strong style={{ color:"#64748b" }}>Étapes : </strong>
                            {crm.statusHistory.map((h) => `${CRM_ST[h.statut]?.l || h.statut} (${new Date(h.changedAt).toLocaleDateString("fr-FR")})`).join(" → ")}
                          </div>
                        )}

                        <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
                          <button onClick={()=>setCrmDetail(null)} className={styles.btnGhost}>Fermer</button>
                          <button disabled={crmSubmitting} onClick={crmSaveDetail} className={styles.btnPrimary}>💾 Enregistrer</button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        );
      })()}
      {activeTab === "rental_policies" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>🚚 Politiques de location</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Âge minimum, permis, caution et frais de livraison "même ville" — réglables par le partenaire, ajustables ici si besoin.</p>
            </div>
          </div>
          <RentalPolicySection token={token} />
        </div>
      )}
      {activeTab === "ads" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>📢 Publicités & Sponsoring</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Bannières affichées sur le site public — accueil, catalogue, barre latérale.</p>
            </div>
            <button className={styles.btnRefresh} onClick={loadAds}>↻ Actualiser</button>
          </div>
          <AdsSection ads={adsList} loading={adsLoading} form={adForm} setForm={setAdForm} saving={adSaving} onSave={saveAd} onToggle={toggleAdActive} onDelete={deleteAd} />
        </div>
      )}
      {/* ── Billetterie d'assistance ──────────────────────────────────────
          Ordonnée par ÉCHÉANCE de première réponse, pas par priorité brute :
          trier d'abord sur la priorité affamerait les comptes gratuits dès
          qu'un abonné ouvre un ticket, alors que l'échéance fait remonter
          d'elle-même un dossier gratuit ouvert depuis deux jours. */}
      {activeTab === "assistance" && (
        <AssistanceSection
          changerStatutTicket={changerStatutTicket}
          loadTickets={loadTickets}
          repondreTicket={repondreTicket}
          setTicketOuvert={setTicketOuvert}
          setTicketReponse={setTicketReponse}
          setTicketsStatut={setTicketsStatut}
          ticketOuvert={ticketOuvert}
          ticketReponse={ticketReponse}
          tickets={tickets}
          ticketsEnRetard={ticketsEnRetard}
          ticketsStatut={ticketsStatut}
        />
      )}

      {activeTab === "support" && (
        <SupportSection
          loadSupportChats={loadSupportChats}
          openSupportChat={openSupportChat}
          sendSupportReply={sendSupportReply}
          setSupportReply={setSupportReply}
          supportActive={supportActive}
          supportChats={supportChats}
          supportLoading={supportLoading}
          supportMessages={supportMessages}
          supportMsgLoading={supportMsgLoading}
          supportReply={supportReply}
          supportSending={supportSending}
        />
      )}

      {/* ══════ TAB SUPERVISION CHATS CLIENT↔PARTENAIRE (audit 2026-08) ══════ */}
      {/* Lecture seule volontaire : l'admin voit tout en temps réel (voir
          chatController.sendMessage → room "admins") mais n'est jamais un
          relais obligatoire des messages — les 2 parties continuent
          d'échanger directement, supervisées sans être bloquées. */}
      {activeTab === "chat_supervision" && (
        <SupervisionChatsSection
          cpActive={cpActive}
          cpChats={cpChats}
          cpChatsLoading={cpChatsLoading}
          cpMessages={cpMessages}
          cpMsgLoading={cpMsgLoading}
          loadClientPartnerChats={loadClientPartnerChats}
          openClientPartnerChat={openClientPartnerChat}
        />
      )}

      {activeTab === "reports" && (
        <SignalementsSection
          decideReport={decideReport}
          loadReports={loadReports}
          reportFilter={reportFilter}
          reports={reports}
          reportsLoading={reportsLoading}
          setReportFilter={setReportFilter}
        />
      )}
      {activeTab === "whatsapp" && (
        <WhatsappSection
          loadWaConversations={loadWaConversations}
          openWaConversation={openWaConversation}
          sendWaReply={sendWaReply}
          setWaFilter={setWaFilter}
          setWaReply={setWaReply}
          waActive={waActive}
          waConversations={waConversations}
          waFilter={waFilter}
          waLoading={waLoading}
          waReply={waReply}
          waSetStatus={waSetStatus}
        />
      )}
      {activeTab === "email_delivery" && (
        <EmailsSection
          emailDeliveryLoading={emailDeliveryLoading}
          emailFailures={emailFailures}
          emailStats={emailStats}
          loadEmailDelivery={loadEmailDelivery}
        />
      )}
      {activeTab === "roles" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>🔑 Rôles & Permissions</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Cliquez une permission pour l'activer/désactiver pour ce compte admin. Aucune permission cochée = accès complet.</p>
            </div>
            <button className={styles.btnRefresh} onClick={loadAdminAccounts}>↻ Actualiser</button>
          </div>
          <RolesSection admins={adminAccounts} loading={rolesLoading} savingId={rolesSavingId} onToggle={toggleAdminScope} currentUserId={user?.id} />
        </div>
      )}
      {/* ══════════════════════════════════════════════════
          TAB AUDIT LOGS
      ══════════════════════════════════════════════════ */}
      {/* ══ LEADS VENTE — demandes d'essai (docs/vente-demande-essai.md §17) ══ */}
      {activeTab === "sales_leads" && (
        <div className={styles.tabContent}>
          <AdminSalesLeads />
        </div>
      )}

      {activeTab === "contrats" && (
        <ContratsSection
          contracts={contracts}
          contractsLoading={contractsLoading}
          loadContracts={loadContracts}
        />
      )}

      {activeTab === "audit" && (
        <AuditLogsSection
          auditEntries={auditEntries}
          auditFacets={auditFacets}
          auditFilter={auditFilter}
          auditLoading={auditLoading}
          loadAuditLog={loadAuditLog}
          setAuditFilter={setAuditFilter}
        />
      )}

        </div>
      </div>
    </div>
  );
}
