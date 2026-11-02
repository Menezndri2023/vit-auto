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
import { ADMIN_SCOPE_CFG, Badge, CERTIF_CFG, ConfirmModal, CountryFlag, KYC_CFG, MOIS, MiniBar, PLAN_TIER_LABELS, Pagination, ROLE_CONFIG, STATUS_BK, StatCard, WipSection, fmtDate, safeHref, safeImgHref, timeAgo } from "./admin/shared.jsx";
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
  const [ieRequests, setIeRequests]       = useState([]);
  const [ieRequestsTotal, setIeRequestsTotal] = useState(0);
  const [ieRequestsLimit, setIeRequestsLimit] = useState(100);
  const [ieLoading,  setIeLoading]        = useState(false);
  const [ieActionSaving, setIeActionSaving] = useState(false);
  // Transactions IE réelles (pipeline escrow 14 étapes) — distinctes des
  // "requests" ci-dessus (demandes initiales étapes 1-3). Aucune interface
  // admin n'exposait auparavant les litiges ou l'inspection indépendante de
  // ce pipeline, alors que de l'argent réel y est bloqué en entiercement.
  const [ieTransactions, setIeTransactions] = useState([]);
  const [ieTxLoading,    setIeTxLoading]    = useState(false);
  const [ieTxModal,      setIeTxModal]      = useState(null); // { tx, mode: "dispute"|"inspection" }
  const [ieTxNote,       setIeTxNote]       = useState("");
  const [ieTxRelease,    setIeTxRelease]    = useState(true);
  const [ieTxSaving,     setIeTxSaving]     = useState(false);
  // Commissions & Factures
  const [commissions,      setCommissions]      = useState([]);
  const [commissionsStats, setCommissionsStats] = useState(null);
  const [invoices,         setInvoices]         = useState([]);
  const [invoicesStats,    setInvoicesStats]    = useState(null);
  const [invoiceLoading,   setInvoiceLoading]   = useState(false);
  const [invoiceYear,      setInvoiceYear]      = useState(new Date().getFullYear());
  const [invoiceMonth,     setInvoiceMonth]     = useState("");

  // Abonnements Pro / Boosts en attente de confirmation manuelle de paiement
  const [subRequests,      setSubRequests]      = useState([]);
  const [subLoading,       setSubLoading]       = useState(false);
  const [subActioning,     setSubActioning]     = useState(null);

  // Modération des avis clients
  const [reviewsList,      setReviewsList]      = useState([]);
  const [reviewsLoading,   setReviewsLoading]   = useState(false);
  const [reviewsFilter,    setReviewsFilter]    = useState(""); // "" | "true" | "false"
  const [reviewsTargetType, setReviewsTargetType] = useState(""); // "" | vehicle | driver | partner | platform | client
  const [platformReviewStats, setPlatformReviewStats] = useState(null);

  // ── Santé système (2026-09) — /api/health existait déjà, jamais affiché
  // ailleurs qu'en curl manuel. Pas de nouvel endpoint : juste une vue.
  const [systemHealth,        setSystemHealth]        = useState(null);
  const [systemHealthLoading, setSystemHealthLoading]  = useState(false);
  const loadSystemHealth = useCallback(async () => {
    setSystemHealthLoading(true);
    try {
      // /api/health renvoie 503 quand le système est DÉGRADÉ — soit le seul cas
      // que cet écran de diagnostic doit couvrir. En ne lisant que les réponses
      // 2xx, l'admin voyait « impossible de joindre /api/health » alors que la
      // réponse contenait précisément « database: disconnected ».
      // En-tête d'authentification indispensable depuis que /api/health ne
      // renvoie le détail qu'à un administrateur (le public n'obtient plus que
      // l'état de santé, pour ne pas divulguer l'inventaire du service).
      const r = await fetch("/api/health", { headers });
      const d = await r.json().catch(() => null);
      if (d) setSystemHealth(d);
      else setSystemHealth({ status: "unreachable", error: `HTTP ${r.status}` });
    } catch { setSystemHealth({ status: "unreachable", error: "réseau injoignable" }); }
    setSystemHealthLoading(false);
  }, [headers]);
  const [reviewActioning,  setReviewActioning]  = useState(null);

  // Analytics avancé
  const [analytics,        setAnalytics]        = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  // Emails & livraison — voir commWebhookController.js pour l'origine des
  // statuts "bounced"/"complained" (webhook Resend, sans lequel un email
  // rejeté par le serveur destinataire restait indiscernable d'un email
  // réellement livré).
  const [emailStats,           setEmailStats]           = useState(null);
  const [emailFailures,        setEmailFailures]        = useState([]);
  const [emailDeliveryLoading, setEmailDeliveryLoading] = useState(false);

  // Financement (leasing/crédit)
  const [financingRequests, setFinancingRequests] = useState([]);
  const [financingLoading,  setFinancingLoading]  = useState(false);
  const [financingModal,    setFinancingModal]    = useState(null); // { id, decision }
  const [financingNote,     setFinancingNote]     = useState("");
  const [financingSaving,   setFinancingSaving]   = useState(false);

  // Rôles & Permissions
  const [adminAccounts,     setAdminAccounts]     = useState([]);
  const [rolesLoading,      setRolesLoading]      = useState(false);
  const [rolesSavingId,     setRolesSavingId]     = useState(null);

  // Publicités & Campagnes
  const [adsList,        setAdsList]        = useState([]);
  const [adsLoading,     setAdsLoading]     = useState(false);
  const [adForm,         setAdForm]         = useState(null); // objet en édition/création, null = fermé
  const [adSaving,       setAdSaving]       = useState(false);

  // Assurance
  const [insuranceList,    setInsuranceList]    = useState([]);
  const [costConfigs,      setCostConfigs]      = useState([]);
  const [laneRates,        setLaneRates]        = useState([]);
  const [importCostLoading, setImportCostLoading] = useState(false);
  const [costConfigForm,  setCostConfigForm]    = useState(null); // null = fermé, {} = nouveau, objet = édition
  const [laneForm,        setLaneForm]          = useState(null);
  const [insuranceLoading, setInsuranceLoading] = useState(false);
  const [insuranceModal,   setInsuranceModal]   = useState(null); // { id, status }
  // Reversements partenaire (suivi dû vs déjà versé — voir commissionLedger.js)
  const [payoutsList,      setPayoutsList]      = useState([]);
  const [payoutsTotal,     setPayoutsTotal]     = useState(0);
  const [payoutsPendingCount, setPayoutsPendingCount] = useState(0);
  const [payoutsLoading,   setPayoutsLoading]   = useState(false);
  const [payoutsFilter,    setPayoutsFilter]    = useState("pending");
  const [payoutMarkingId,  setPayoutMarkingId]  = useState(null);
  const [insurancePremium, setInsurancePremium] = useState("");
  const [insuranceNote,    setInsuranceNote]    = useState("");

  // Demandes de services génériques (transport/transit/douanes/immatriculation/
  // garantie/financement/change de devises) — voir server/models/ServiceRequest.js
  const [svcReqList,       setSvcReqList]       = useState([]);
  const [svcReqLoading,    setSvcReqLoading]    = useState(false);
  const [svcReqCategory,   setSvcReqCategory]   = useState("");
  const [svcReqModal,      setSvcReqModal]      = useState(null); // { id, status }
  const [svcReqAmount,     setSvcReqAmount]     = useState("");
  const [svcReqNote,       setSvcReqNote]       = useState("");
  const [svcReqSaving,     setSvcReqSaving]     = useState(false);

  // Configuration métier (PricingConfig + ExchangeRate + CountryConfig)
  const [bizSubTab,        setBizSubTab]        = useState("commissions");
  const [bizConfig,        setBizConfig]        = useState(null); // PricingConfig brut
  const [bizConfigLoading, setBizConfigLoading] = useState(false);
  const [bizSaving,        setBizSaving]        = useState(null); // clé de section en cours de sauvegarde
  const [commissionsForm,  setCommissionsForm]  = useState(null);
  const [foundingForm,     setFoundingForm]     = useState(null);
  const [serviceFeeForm,   setServiceFeeForm]   = useState(null);
  const [importFeeForm,    setImportFeeForm]    = useState(null);
  const [subscriptionsForm,setSubscriptionsForm]= useState(null);
  const [boostsForm,       setBoostsForm]       = useState(null);
  const [rentalOptsForm,   setRentalOptsForm]   = useState(null);
  const [fournisseurForm,  setFournisseurForm]  = useState(null);
  const [servicesForm,     setServicesForm]     = useState(null);
  const [adsConfigForm,    setAdsConfigForm]    = useState(null);
  const [discountCampaigns, setDiscountCampaigns] = useState([]);
  const [discountForm,    setDiscountForm]      = useState(null); // objet en cours d'édition/création, ou null
  const [exchangeRates,    setExchangeRates]    = useState([]);
  const [countryConfigs,   setCountryConfigs]   = useState([]);
  const [rateForm,         setRateForm]         = useState(null); // null = fermé
  const [countryForm,      setCountryForm]      = useState(null);
  const [insuranceSaving,  setInsuranceSaving]  = useState(false);

  // Journal d'audit
  // Contrats de réservation (Contract) — aucun écran admin n'existait : la
  // donnée n'était consultable que par le partenaire propriétaire, alors que
  // c'est une pièce contractuelle (identité client, montants, signature).
  const [contracts,        setContracts]        = useState([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [auditEntries,     setAuditEntries]     = useState([]);
  const [auditLoading,     setAuditLoading]     = useState(false);
  const [auditFacets,      setAuditFacets]      = useState({ actions: [], resources: [] });
  const [auditFilter,      setAuditFilter]      = useState({ action: "", resource: "", success: "" });
  const [generateForm,     setGenerateForm]     = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear() });
  const [generating,       setGenerating]       = useState(false);
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
  // KYC Admin
  const [kycList,       setKycList]       = useState([]);
  const [kycTotal,      setKycTotal]      = useState(0);
  const [kycLimit,      setKycLimit]      = useState(50);
  const [kycLoading,    setKycLoading]    = useState(false);
  // "ALL" par défaut — un défaut sur "EN_ATTENTE" rendait un compte déjà
  // vérifié/refusé introuvable dans cet onglet tant que l'admin ne pensait pas
  // à cliquer sur le filtre correspondant (le backend gérait déjà ce cas, voir
  // getKycList, mais le défaut front ne l'exploitait pas).
  const [kycFilter,     setKycFilter]     = useState("ALL");
  const [kycSearch,     setKycSearch]     = useState("");
  const [kycDetailUser, setKycDetailUser] = useState(null);
  const [kycDetailLoading, setKycDetailLoading] = useState(false);
  const [kycReviewForm, setKycReviewForm] = useState({ decision: "VERIFIE", note: "" });
  const [kycReviewLoading, setKycReviewLoading] = useState(false);
  const [kycReviewMsg,  setKycReviewMsg]  = useState("");
  // Compteur "en attente" indépendant du filtre actuellement affiché (kycList
  // change selon kycFilter — un badge calculé dessus mentirait dès que l'admin
  // clique sur un autre filtre, voir loadKycPendingTotal ci-dessous).
  const [kycPendingTotal, setKycPendingTotal] = useState(0);
  // Support Client (inbox chats client_support / partner_support)
  const [supportChats,    setSupportChats]    = useState([]);
  // File de la billetterie d'assistance — distincte des conversations : un
  // ticket porte une échéance de première réponse dérivée du palier du
  // partenaire, ce qu'un chat n'a pas.
  const [tickets,         setTickets]         = useState([]);
  // Filtre de statut de la file d'assistance : vide = demandes en cours.
  // Sans lui, les demandes résolues ou clôturées n'étaient JAMAIS visibles
  // (le serveur les exclut par défaut) — audit admin du 2026-10-05.
  const [ticketsStatut,   setTicketsStatut]   = useState("");
  const [ticketsEnRetard, setTicketsEnRetard] = useState(0);
  const [ticketOuvert,    setTicketOuvert]    = useState(null);
  const [ticketReponse,   setTicketReponse]   = useState("");

  // Essai gratuit accordé par le support. Aucune passerelle de paiement n'étant
  // branchée, c'est aujourd'hui le seul moyen de faire constater à un partenaire
  // ce qu'un palier contient.
  const [essaiRecherche, setEssaiRecherche] = useState("");
  const [essaiResultats, setEssaiResultats] = useState([]);
  const [essaiVendeur,   setEssaiVendeur]   = useState(null);
  const [essaiPalier,    setEssaiPalier]    = useState("business");
  const [essaiRetour,    setEssaiRetour]    = useState(null);
  const [reports,         setReports]         = useState([]);
  const [trustModal,      setTrustModal]      = useState(null);   // utilisateur ciblé
  const [trustOverview,   setTrustOverview]   = useState(null);
  // Fidélité d'un client (solde, palier, mouvements) — aucune vue admin
  // n'existait, alors que 100 points = 1 USD de remise à la réservation
  // suivante. Lecture seule : voir loyaltyController.getUserLoyaltyAdmin.
  const [loyaltyModal,    setLoyaltyModal]    = useState(null);
  const [loyaltyData,     setLoyaltyData]     = useState(null);
  const [loyaltyLoading,  setLoyaltyLoading]  = useState(false);
  const VIDE_AJUST = { direction: "credit", points: "", reason: "", countsTowardTier: false };
  const [loyaltyForm,    setLoyaltyForm]    = useState(VIDE_AJUST);
  const [loyaltySaving,  setLoyaltySaving]  = useState(false);
  const [trustLoading,    setTrustLoading]    = useState(false);
  const [reportsLoading,  setReportsLoading]  = useState(false);
  const [reportFilter,    setReportFilter]    = useState("en_attente");
  // Bot WhatsApp partenaires — conversations à reprendre (status="escalated")
  const [waConversations, setWaConversations] = useState([]);
  const [waLoading,       setWaLoading]       = useState(false);
  const [waFilter,        setWaFilter]        = useState("escalated");
  const [waActive,        setWaActive]        = useState(null);   // conversation ouverte (détail complet)
  const [waReply,         setWaReply]         = useState("");
  const [supportLoading,  setSupportLoading]  = useState(false);
  const [supportActive,   setSupportActive]   = useState(null);   // chat sélectionné (résumé liste)
  const [supportMessages, setSupportMessages] = useState([]);
  const [supportMsgLoading, setSupportMsgLoading] = useState(false);
  const [supportReply,    setSupportReply]    = useState("");
  const [supportSending,  setSupportSending]  = useState(false);
  // Gate admin obligatoire (audit 2026-08) — file d'attente de validation
  // (réservations + achats directs IE) et inbox de supervision des chats
  // client_partner (lecture seule, voir chatController.getClientPartnerChats).
  const [pendingValidationBookings, setPendingValidationBookings] = useState([]);
  const [pendingValidationDirect,   setPendingValidationDirect]   = useState([]);
  const [pendingValidationLoading,  setPendingValidationLoading]  = useState(false);
  const [validationRejectModal,     setValidationRejectModal]     = useState(null); // { kind: "booking"|"direct", item }
  const [validationRejectReason,    setValidationRejectReason]    = useState("");
  const [cpChats,        setCpChats]        = useState([]);
  const [cpChatsLoading, setCpChatsLoading] = useState(false);
  const [cpActive,       setCpActive]       = useState(null);
  const [cpMessages,     setCpMessages]     = useState([]);
  const [cpMsgLoading,   setCpMsgLoading]   = useState(false);
  // Certification Partenaire
  const [certList,          setCertList]          = useState([]);
  const [certLoading,       setCertLoading]        = useState(false);
  const [certFilter,        setCertFilter]         = useState("all");
  const [certDetail,        setCertDetail]         = useState(null);
  const [certReviewLevel,   setCertReviewLevel]    = useState(null);
  const [certReviewForm,    setCertReviewForm]     = useState({ decision: "approved", note: "" });
  const [certBadgeForm,     setCertBadgeForm]      = useState({ badge: "verifie", publicStatement: "", note: "" });
  const [certReviewLoading, setCertReviewLoading]  = useState(false);
  const [certReviewMsg,     setCertReviewMsg]      = useState("");

  // Partner Verification System
  const [pvList,            setPvList]            = useState([]);
  const [pvStats,           setPvStats]           = useState(null);
  const [pvLoading,         setPvLoading]         = useState(false);
  const [pvFilter,          setPvFilter]          = useState({ status: "", trustLevel: "", companyType: "", search: "" });
  const [pvDetail,          setPvDetail]          = useState(null);
  const [pvCreateModal,     setPvCreateModal]     = useState(false);
  const [pvCreateForm,      setPvCreateForm]      = useState({ userId: "", companyName: "", companyType: "importateur", country: "", city: "", website: "", phone: "", email: "", description: "", exportCountries: [], importCountries: [], vehicleCategories: [], yearsExperience: 0, annualVolume: "", adminNote: "" });
  const [pvSaving,          setPvSaving]          = useState(false);
  const [pvCriterionLoading,setPvCriterionLoading]= useState("");

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

  // PMS Admin
  const [pmsStats,    setPmsStats]    = useState(null);
  const [pmsShowrooms,setPmsShowrooms]= useState([]);
  const [pmsLoading,  setPmsLoading]  = useState(false);
  const [pmsFilter,   setPmsFilter]   = useState("all");

  // Founding Partner Onboarding Admin
  const [foundingList,      setFoundingList]     = useState([]);
  const [foundingStats,     setFoundingStats]    = useState(null);
  const [foundingLoading,   setFoundingLoading]  = useState(false);
  const [foundingDetail,    setFoundingDetail]   = useState(null);
  const [foundingSignLink,  setFoundingSignLink] = useState(null); // { id, link, type, companyName }
  const [foundingNote,      setFoundingNote]     = useState("");
  const [foundingAction,    setFoundingAction]   = useState(null); // { id, type: 'approve'|'reject'|'agreement' }
  const [foundingSubmitting, setFoundingSubmitting] = useState(false); // évite le double-clic (envoi LOI/accord/rejet en double) — utilisé uniquement par le MODAL (une seule cible à la fois)
  // Bug réel corrigé (audit — remonté par l'utilisateur) : les boutons "Relancer"/
  // "Envoyer Accord"/"Renvoyer la LOI"/"Renvoyer l'accord" de CHAQUE ligne du
  // tableau Founding Partner partageaient tous le même booléen foundingSubmitting
  // — cliquer "Relancer" sur UN partenaire désactivait/grisait visuellement les
  // boutons de TOUS les autres partenaires de la liste pendant l'appel réseau
  // (aucun mauvais envoi ne partait réellement, mais l'admin le percevait comme
  // "le bouton s'active pour tous"). Un id précis (plutôt qu'un booléen global)
  // permet de ne griser que le bouton de la ligne réellement concernée.
  const [foundingRowActionId, setFoundingRowActionId] = useState(null);
  // CRM Directory
  const [foundingView,      setFoundingView]     = useState("onboarding"); // "onboarding" | "crm"
  const [foundingCRMFilter, setFoundingCRMFilter]= useState("");           // crmStatus filter
  const [foundingCRMEdit,   setFoundingCRMEdit]  = useState(null);         // { id, data: {...} }

  // ── CRM Partenaires (pipeline de prospection à 9 étapes) ──────────────────
  const [crmList,      setCrmList]      = useState([]);
  const [crmStats,     setCrmStats]     = useState(null);
  const [crmLoading,   setCrmLoading]   = useState(false);
  const [crmView,      setCrmView]      = useState("liste"); // "liste" | "pipeline"
  const [crmFilter,    setCrmFilter]    = useState({ statut: "", pays: "", secteur: "", assignedTo: "", source: "", aRelancer: false });
  const [crmPage,      setCrmPage]      = useState(1);
  const [crmTotal,     setCrmTotal]     = useState(0);
  const [crmErreur,    setCrmErreur]    = useState("");
  const [crmDoublons,  setCrmDoublons]  = useState(null); // correspondances signalées à la création
  const [crmSearch,    setCrmSearch]    = useState("");
  const [crmDetail,    setCrmDetail]    = useState(null); // dossier ouvert (modal détail)
  const [crmDetailData, setCrmDetailData] = useState(null); // { crm, liveStats }
  const [crmEditData,  setCrmEditData]  = useState(null); // formulaire d'édition du détail
  const [crmCreating,  setCrmCreating]  = useState(false);
  const [crmNewForm,   setCrmNewForm]   = useState({
    entreprise: "", pays: "", ville: "", secteur: "",
    contactNom: "", contactTel: "", contactEmail: "", website: "",
    source: "", assignedTo: "", priority: "medium",
  });
  const [crmSubmitting, setCrmSubmitting] = useState(false);
  const [crmLinkUserId, setCrmLinkUserId] = useState("");

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

  // ── Demandes Import/Export ──────────────────────────────────────────────────
  const loadImportExport = useCallback(async () => {
    if (!token) return;
    setIeLoading(true);
    try {
      // Pages successives (fetchPaged) : le serveur plafonne une page à 500 et
      // « Charger plus » renvoyait toujours les mêmes 500 (audit 2026-10-05).
      const { items, total } = await fetchPaged("/api/import-export/requests", { limit: ieRequestsLimit, pageSize: 100, key: "requests" });
      setIeRequests(items);
      setIeRequestsTotal(total || items.length);
    } catch { /* endpoint optionnel */ }
    setIeLoading(false);
  }, [token, ieRequestsLimit, fetchPaged]);

  const loadMoreIeRequests = useCallback(() => setIeRequestsLimit((l) => l + 200), []);

  // Bug réel corrigé (audit) : ce tableau était 100% en lecture seule côté
  // admin alors que le backend expose déjà un workflow complet (approuver/
  // rejeter/marquer contacté/supprimer, avec notification au client — voir
  // updateRequestStatus/deleteRequest, importExportController.js). Le badge
  // de navigation "Transactions I/E" affichait un compteur "en attente" comme
  // si ces demandes étaient actionnables depuis cet onglet — elles ne
  // l'étaient pas.
  const updateIeRequestStatus = useCallback(async (id, status) => {
    if (ieActionSaving) return;
    setIeActionSaving(true);
    try {
      const r = await fetch(`/api/import-export/requests/${id}/status`, {
        method: "PATCH", headers, body: JSON.stringify({ status }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast("Demande mise à jour", "success");
      loadImportExport();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setIeActionSaving(false); }
  }, [headers, showToast, loadImportExport, ieActionSaving]);

  const deleteIeRequest = useCallback(async (id) => {
    if (ieActionSaving) return;
    setIeActionSaving(true);
    try {
      const r = await fetch(`/api/import-export/requests/${id}`, { method: "DELETE", headers });
      if (!r.ok) { const data = await r.json().catch(() => ({})); showToast(data.message || "Erreur", "error"); return; }
      setIeRequests((prev) => prev.filter((r2) => r2._id !== id));
      showToast("Demande supprimée", "success");
    } catch { showToast("Erreur réseau", "error"); }
    finally { setIeActionSaving(false); }
  }, [headers, showToast, ieActionSaving]);

  const loadIeTransactions = useCallback(async () => {
    if (!token) return;
    setIeTxLoading(true);
    try {
      // Toutes les pages (fetchPaged) : la 1re page de 100 seulement rendait
      // les enregistrements plus anciens inaccessibles (audit du 2026-10-05).
      const { items } = await fetchPaged("/api/import-export/transactions", { limit: 5000, pageSize: 100, key: "transactions" });
      setIeTransactions(items);
    } catch { /* ignore */ }
    setIeTxLoading(false);
  }, [token, fetchPaged]);

  const handleResolveIeDispute = async () => {
    if (!ieTxModal?.tx) return;
    setIeTxSaving(true);
    try {
      const r = await fetch(`/api/import-export/transactions/${ieTxModal.tx._id}/dispute/resolve`, {
        method: "PATCH", headers,
        body: JSON.stringify({ resolution: ieTxNote, releaseToPartner: ieTxRelease }),
      });
      const d = await r.json();
      if (r.ok) { showToast("Litige résolu.", "success"); setIeTxModal(null); setIeTxNote(""); loadIeTransactions(); }
      else showToast(d.message || "Erreur.", "error");
    } catch { showToast("Erreur réseau.", "error"); }
    setIeTxSaving(false);
  };

  const handleCompleteIeInspection = async () => {
    if (!ieTxModal?.tx) return;
    setIeTxSaving(true);
    try {
      const r = await fetch(`/api/import-export/transactions/${ieTxModal.tx._id}/complete-inspection`, {
        method: "PATCH", headers,
        body: JSON.stringify({ reportNotes: ieTxNote }),
      });
      const d = await r.json();
      if (r.ok) { showToast("Inspection complétée.", "success"); setIeTxModal(null); setIeTxNote(""); loadIeTransactions(); }
      else showToast(d.message || "Erreur.", "error");
    } catch { showToast("Erreur réseau.", "error"); }
    setIeTxSaving(false);
  };

  // Paiement manuel (virement/mobile money/crypto, ou carte sans Stripe
  // configuré) déclaré par le client — aucune vérification automatique
  // possible sans intégration bancaire réelle, un admin doit confirmer avant
  // que l'entiercement ne soit considéré comme sécurisé.
  const handleVerifyIePayment = async (approve) => {
    if (!ieTxModal?.tx) return;
    setIeTxSaving(true);
    try {
      const r = await fetch(`/api/import-export/transactions/${ieTxModal.tx._id}/${approve ? "verify-payment" : "reject-payment"}`, {
        method: "PATCH", headers,
        body: JSON.stringify({ reason: ieTxNote }),
      });
      const d = await r.json();
      if (r.ok) { showToast(approve ? "Paiement vérifié." : "Paiement rejeté.", "success"); setIeTxModal(null); setIeTxNote(""); loadIeTransactions(); }
      else showToast(d.message || "Erreur.", "error");
    } catch { showToast("Erreur réseau.", "error"); }
    setIeTxSaving(false);
  };

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

  const loadCommissions = useCallback(async () => {
    if (!token) return;
    try {
      const params = new URLSearchParams({ year: invoiceYear });
      if (invoiceMonth) params.set("month", invoiceMonth);
      const r = await fetch(`/api/invoices/commissions?${params}`, { headers });
      if (r.ok) {
        const d = await r.json();
        setCommissions(d.bookings || []);
        setCommissionsStats({ total: d.totalCommissions, transactions: d.totalTransactions, count: d.count });
      }
    } catch { /* ignore */ }
  }, [token, headers, invoiceYear, invoiceMonth]);

  const loadInvoices = useCallback(async () => {
    if (!token) return;
    setInvoiceLoading(true);
    try {
      // Toutes les pages (fetchPaged) : la 1re page de 100 seulement rendait
      // les enregistrements plus anciens inaccessibles (audit du 2026-10-05).
      const { items } = await fetchPaged("/api/invoices", { limit: 5000, pageSize: 100, key: "invoices" });
      setInvoices(items);
      const r = await fetch("/api/invoices?limit=1", { headers });
      if (r.ok) {
        const d = await r.json();
        setInvoicesStats({ totalPaid: d.totalPaid, totalPending: d.totalPending });
      }
    } catch { /* ignore */ }
    setInvoiceLoading(false);
  }, [token, headers, fetchPaged]);

  // Factures de PRESTATION (une par commande terminée, voir issueServiceInvoice
  // dans bookingController.js) — distinctes des factures mensuelles de commission
  // ci-dessus (ce que le partenaire doit à VIT AUTO) : ici, ce que le partenaire
  // a encaissé/à percevoir, enregistré côté admin pour supervision.
  const [serviceInvoicesAdmin, setServiceInvoicesAdmin] = useState([]);
  const [serviceInvoicesAdminLoading, setServiceInvoicesAdminLoading] = useState(false);
  const loadServiceInvoicesAdmin = useCallback(async () => {
    if (!token) return;
    setServiceInvoicesAdminLoading(true);
    try {
      // Toutes les pages (fetchPaged) : la 1re page de 100 seulement rendait
      // les enregistrements plus anciens inaccessibles (audit du 2026-10-05).
      const { items } = await fetchPaged("/api/service-invoices", { limit: 5000, pageSize: 100, key: "invoices" });
      setServiceInvoicesAdmin(items);
    } catch { /* ignore */ }
    setServiceInvoicesAdminLoading(false);
  }, [token, fetchPaged]);

  // ── Abonnements Pro / Boosts (paiements en attente de confirmation) ─────────
  const loadSubRequests = useCallback(async () => {
    if (!token) return;
    setSubLoading(true);
    try {
      const r = await fetch("/api/subscriptions/admin/pending", { headers });
      if (r.ok) setSubRequests((await r.json()).subscriptions || []);
    } catch { /* ignore */ }
    setSubLoading(false);
  }, [token, headers]);

  const subAction = async (path, subId, itemId) => {
    const key = `${subId}:${itemId}`;
    if (subActioning) return;
    setSubActioning(key);
    try {
      const r = await fetch(`/api/subscriptions/admin/${subId}/${path}`, { method: "PATCH", headers });
      const d = await r.json().catch(() => null);
      if (r.ok) { showToast(d?.message || "Effectué."); loadSubRequests(); }
      else showToast(d?.message || "Erreur", "error");
    } catch { showToast("Erreur réseau", "error"); }
    finally { setSubActioning(null); }
  };

  // ── Modération des avis ──────────────────────────────────────────────────────
  const loadReviews = useCallback(async () => {
    if (!token) return;
    setReviewsLoading(true);
    try {
      const params = new URLSearchParams();
      if (reviewsFilter) params.set("visible", reviewsFilter);
      if (reviewsTargetType) params.set("targetType", reviewsTargetType);
      // Tous les avis (fetchPaged) — seuls les 50 plus récents étaient visibles.
      const { items } = await fetchPaged(`/api/reviews/admin/list?${params}`, { limit: 5000, pageSize: 100, key: "reviews" });
      setReviewsList(items);
      const r = await fetch(`/api/reviews/admin/list?${params}${params.toString() ? "&" : ""}limit=1`, { headers });
      if (r.ok) setPlatformReviewStats((await r.json()).platformStats || null);
    } catch { /* ignore */ }
    setReviewsLoading(false);
  }, [token, headers, reviewsFilter, reviewsTargetType, fetchPaged]);

  const toggleReviewVisibility = async (review) => {
    if (reviewActioning) return;
    setReviewActioning(review._id);
    try {
      const r = await fetch(`/api/reviews/${review._id}/${review.visible ? "hide" : "unhide"}`, { method: "PATCH", headers });
      if (r.ok) { showToast(review.visible ? "Avis masqué." : "Avis réaffiché."); loadReviews(); }
      else showToast("Erreur", "error");
    } catch { showToast("Erreur réseau", "error"); }
    finally { setReviewActioning(null); }
  };

  // ── Analytics avancé ────────────────────────────────────────────────────────
  const loadAnalytics = useCallback(async () => {
    if (!token) return;
    setAnalyticsLoading(true);
    try {
      const r = await fetch("/api/analytics/admin", { headers });
      if (r.ok) setAnalytics(await r.json());
    } catch { /* ignore */ }
    setAnalyticsLoading(false);
  }, [token, headers]);

  // ── Emails & livraison (bounces/échecs Resend) ───────────────────────────────
  const loadEmailDelivery = useCallback(async () => {
    if (!token) return;
    setEmailDeliveryLoading(true);
    try {
      const [sRes, fRes] = await Promise.all([
        fetch("/api/comm/stats", { headers }),
        fetch("/api/comm/failures?limit=100", { headers }),
      ]);
      if (sRes.ok) setEmailStats((await sRes.json()).stats);
      if (fRes.ok) setEmailFailures((await fRes.json()).failures || []);
    } catch { /* ignore */ }
    setEmailDeliveryLoading(false);
  }, [token, headers]);

  // ── Financement ──────────────────────────────────────────────────────────────
  const loadFinancing = useCallback(async () => {
    if (!token) return;
    setFinancingLoading(true);
    try {
      const r = await fetch("/api/bookings/admin/financing", { headers });
      if (r.ok) setFinancingRequests((await r.json()).requests || []);
    } catch { /* ignore */ }
    setFinancingLoading(false);
  }, [token, headers]);

  const submitFinancingDecision = async () => {
    if (!financingModal) return;
    setFinancingSaving(true);
    try {
      const r = await fetch(`/api/bookings/${financingModal.id}/financing-decision`, {
        method: "PATCH", headers,
        body: JSON.stringify({ decision: financingModal.decision, note: financingNote }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast("Décision enregistrée — client notifié", "success");
      setFinancingModal(null);
      setFinancingNote("");
      loadFinancing();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setFinancingSaving(false); }
  };

  // ── Rôles & Permissions ──────────────────────────────────────────────────────
  const loadAdminAccounts = useCallback(async () => {
    if (!token) return;
    setRolesLoading(true);
    try {
      const r = await fetch("/api/users/admin/accounts", { headers });
      if (r.ok) setAdminAccounts((await r.json()).admins || []);
    } catch { /* ignore */ }
    setRolesLoading(false);
  }, [token, headers]);

  const applyAdminScope = async (adminId, next) => {
    setRolesSavingId(adminId);
    try {
      const r = await fetch(`/api/users/admin/${adminId}/scope`, {
        method: "PATCH", headers,
        body: JSON.stringify({ scope: next }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast("Permissions mises à jour", "success");
      loadAdminAccounts();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setRolesSavingId(null); }
  };

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

  // ── Publicités & Campagnes ───────────────────────────────────────────────────
  const loadAds = useCallback(async () => {
    if (!token) return;
    setAdsLoading(true);
    try {
      const r = await fetch("/api/ads/all", { headers });
      if (r.ok) setAdsList(await r.json());
    } catch { /* ignore */ }
    setAdsLoading(false);
  }, [token, headers]);

  const saveAd = async () => {
    if (!adForm?.title?.trim()) { showToast("Titre requis", "error"); return; }
    setAdSaving(true);
    try {
      const isNew = !adForm._id;
      const r = await fetch(isNew ? "/api/ads" : `/api/ads/${adForm._id}`, {
        method: isNew ? "POST" : "PUT", headers,
        body: JSON.stringify(adForm),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast(isNew ? "Annonce créée." : "Annonce mise à jour.", "success");
      setAdForm(null);
      loadAds();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setAdSaving(false); }
  };

  const toggleAdActive = async (ad) => {
    try {
      const r = await fetch(`/api/ads/${ad._id}`, {
        method: "PUT", headers,
        body: JSON.stringify({ active: !ad.active }),
      });
      if (r.ok) loadAds();
    } catch { showToast("Erreur réseau", "error"); }
  };

  const deleteAd = async (id) => {
    if (!window.confirm("Supprimer définitivement cette annonce ?")) return;
    try {
      const r = await fetch(`/api/ads/${id}`, { method: "DELETE", headers });
      if (r.ok) { showToast("Annonce supprimée.", "success"); loadAds(); }
    } catch { showToast("Erreur réseau", "error"); }
  };

  // ── Reversements partenaire ────────────────────────────────────────────────
  const loadPayouts = useCallback(async () => {
    if (!token) return;
    setPayoutsLoading(true);
    try {
      // sens=reversements : ce que VIT AUTO doit aux partenaires, sans les
      // commissions de vente qu'ILS doivent (platform_fee) — audit 2026-10-05.
      const params = new URLSearchParams({ sens: "reversements" });
      if (payoutsFilter) params.set("status", payoutsFilter);
      // Toutes les pages (fetchPaged) : la 1re page de 100 seulement rendait
      // les enregistrements plus anciens inaccessibles (audit du 2026-10-05).
      const { items, total } = await fetchPaged(`/api/commission-ledger/admin?${params}`, { limit: 5000, pageSize: 200, key: "entries" });
      setPayoutsList(items); setPayoutsTotal(total || 0);
      const rPending = await fetch(`/api/commission-ledger/admin?status=pending&limit=1&sens=reversements`, { headers });
      if (rPending.ok) setPayoutsPendingCount((await rPending.json()).total || 0);
    } catch { /* ignore */ }
    setPayoutsLoading(false);
  }, [token, headers, payoutsFilter, fetchPaged]);

  const markPayoutPaid = async (id) => {
    if (payoutMarkingId) return;
    const paidViaTxId = window.prompt("Référence du virement (optionnel — banque/mobile money) :", "");
    if (paidViaTxId === null) return; // annulé
    setPayoutMarkingId(id);
    try {
      const r = await fetch(`/api/commission-ledger/admin/${id}/mark-paid`, {
        method: "PATCH", headers, body: JSON.stringify({ paidViaTxId: paidViaTxId || undefined }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast("Reversement marqué comme payé", "success");
      loadPayouts();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setPayoutMarkingId(null); }
  };

  // ── Assurance ────────────────────────────────────────────────────────────────
  const loadInsurance = useCallback(async () => {
    if (!token) return;
    setInsuranceLoading(true);
    try {
      const r = await fetch("/api/insurance/admin/list", { headers });
      if (r.ok) setInsuranceList((await r.json()).requests || []);
    } catch { /* ignore */ }
    setInsuranceLoading(false);
  }, [token, headers]);

  const submitInsuranceDecision = async () => {
    if (!insuranceModal) return;
    setInsuranceSaving(true);
    try {
      const r = await fetch(`/api/insurance/${insuranceModal.id}/decision`, {
        method: "PATCH", headers,
        body: JSON.stringify({ status: insuranceModal.status, premium: insurancePremium, note: insuranceNote }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast("Décision enregistrée — client notifié", "success");
      setInsuranceModal(null);
      setInsurancePremium("");
      setInsuranceNote("");
      loadInsurance();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setInsuranceSaving(false); }
  };

  // ── Demandes de services génériques ──────────────────────────────────────────
  const loadServiceRequests = useCallback(async () => {
    if (!token) return;
    setSvcReqLoading(true);
    try {
      const params = svcReqCategory ? `?category=${svcReqCategory}` : "";
      const r = await fetch(`/api/service-requests/admin/list${params}`, { headers });
      if (r.ok) setSvcReqList((await r.json()).requests || []);
    } catch { /* ignore */ }
    setSvcReqLoading(false);
  }, [token, headers, svcReqCategory]);

  const submitServiceRequestDecision = async () => {
    if (!svcReqModal) return;
    setSvcReqSaving(true);
    try {
      const r = await fetch(`/api/service-requests/${svcReqModal.id}/decision`, {
        method: "PATCH", headers,
        body: JSON.stringify({ status: svcReqModal.status, quotedAmountUSD: svcReqAmount, note: svcReqNote }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast("Décision enregistrée — client notifié", "success");
      setSvcReqModal(null);
      setSvcReqAmount("");
      setSvcReqNote("");
      loadServiceRequests();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setSvcReqSaving(false); }
  };

  // ── Import Cost Engine — barèmes pays + liaisons de fret ─────────────────────
  const loadImportCostData = useCallback(async () => {
    if (!token) return;
    setImportCostLoading(true);
    try {
      const [cRes, lRes] = await Promise.all([
        fetch("/api/import-cost/admin/configs", { headers }),
        fetch("/api/import-cost/admin/lanes",   { headers }),
      ]);
      if (cRes.ok) setCostConfigs((await cRes.json()).configs || []);
      if (lRes.ok) setLaneRates((await lRes.json()).lanes || []);
    } catch { /* ignore */ }
    setImportCostLoading(false);
  }, [token, headers]);

  const saveCostConfig = async () => {
    if (!costConfigForm?.country) { showToast("Pays requis", "error"); return; }
    try {
      const r = await fetch("/api/import-cost/admin/configs", {
        method: "POST", headers, body: JSON.stringify(costConfigForm),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) { showToast("Barème enregistré."); setCostConfigForm(null); loadImportCostData(); }
      else showToast(d?.message || "Erreur", "error");
    } catch { showToast("Erreur réseau", "error"); }
  };

  const deleteCostConfig = async (id) => {
    if (!confirm("Supprimer ce barème ?")) return;
    // La réponse n'était pas vérifiée : un refus (droits insuffisants sur ce
    // scope, contrainte serveur) affichait quand même un message de succès, et
    // la ligne restait à l'écran après rechargement — l'admin croyait à un
    // bug d'affichage et recommençait.
    try {
      const r = await fetch(`/api/import-cost/admin/configs/${id}`, { method: "DELETE", headers });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        showToast(d?.message || "Suppression refusée par le serveur.", "error");
        return;
      }
      showToast("Barème supprimé.");
      loadImportCostData();
    } catch { showToast("Erreur réseau — rien n'a été supprimé.", "error"); }
  };

  const saveLaneRate = async () => {
    if (!laneForm?.sourceCountry || !laneForm?.destCountry || !laneForm?.seaFreightUSD) {
      showToast("Pays d'origine, destination et tarif de fret requis", "error"); return;
    }
    try {
      const isEdit = !!laneForm._id;
      const r = await fetch(isEdit ? `/api/import-cost/admin/lanes/${laneForm._id}` : "/api/import-cost/admin/lanes", {
        method: isEdit ? "PATCH" : "POST", headers, body: JSON.stringify(laneForm),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) { showToast("Liaison enregistrée."); setLaneForm(null); loadImportCostData(); }
      else showToast(d?.message || "Erreur", "error");
    } catch { showToast("Erreur réseau", "error"); }
  };

  const deleteLaneRate = async (id) => {
    if (!confirm("Supprimer cette liaison ?")) return;
    try {
      const r = await fetch(`/api/import-cost/admin/lanes/${id}`, { method: "DELETE", headers });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        showToast(d?.message || "Suppression refusée par le serveur.", "error");
        return;
      }
      showToast("Liaison supprimée.");
      loadImportCostData();
    } catch { showToast("Erreur réseau — rien n'a été supprimé.", "error"); }
  };

  // ── Configuration métier — PricingConfig + ExchangeRate + CountryConfig ─────
  const loadBusinessConfig = useCallback(async () => {
    if (!token) return;
    setBizConfigLoading(true);
    try {
      const [pRes, rRes, cRes, dRes] = await Promise.all([
        fetch("/api/admin/business-config/pricing", { headers }),
        fetch("/api/admin/business-config/exchange-rates", { headers }),
        fetch("/api/admin/business-config/countries", { headers }),
        fetch("/api/admin/business-config/discount-campaigns", { headers }),
      ]);
      if (pRes.ok) {
        const { config } = await pRes.json();
        setBizConfig(config);
        setCommissionsForm(config.commissions);
        setFoundingForm(config.foundingPartner);
        setServiceFeeForm(config.serviceFee);
        setImportFeeForm(config.importEstimateFee);
        setSubscriptionsForm(config.subscriptions);
        setBoostsForm(config.boosts);
        setRentalOptsForm(config.rentalOptions);
        setFournisseurForm(config.rentalOptionsFournisseur || {});
        setServicesForm(config.services);
        setAdsConfigForm(config.ads);
      }
      if (rRes.ok) setExchangeRates((await rRes.json()).rates || []);
      if (cRes.ok) setCountryConfigs((await cRes.json()).countries || []);
      if (dRes.ok) setDiscountCampaigns((await dRes.json()).campaigns || []);
    } catch { /* ignore */ }
    setBizConfigLoading(false);
  }, [token, headers]);

  const savePricingSection = async (section, payload) => {
    setBizSaving(section);
    try {
      const r = await fetch(`/api/admin/business-config/pricing/${section}`, {
        method: "PATCH", headers, body: JSON.stringify(payload),
      });
      const d = await r.json().catch(() => null);
      // Commissions / grille fondateur (2026-10-30) : le serveur programme une
      // version (202, préavis) au lieu d'appliquer — son message le dit, et la
      // grille en vigueur est rechargée telle quelle.
      if (r.ok) {
        showToast(d?.message || "Configuration enregistrée.");
        if (d?.config) setBizConfig(d.config); else loadBusinessConfig();
      }
      else showToast(d?.message || "Erreur", "error");
    } catch { showToast("Erreur réseau", "error"); }
    finally { setBizSaving(null); }
  };

  const saveExchangeRate = async () => {
    if (!rateForm?.code || !rateForm?.name || !rateForm?.symbol || !rateForm?.rateFromUSD) {
      showToast("Code, nom, symbole et taux sont requis", "error"); return;
    }
    try {
      const r = await fetch("/api/admin/business-config/exchange-rates", {
        method: "POST", headers, body: JSON.stringify(rateForm),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) { showToast("Devise enregistrée."); setRateForm(null); loadBusinessConfig(); }
      else showToast(d?.message || "Erreur", "error");
    } catch { showToast("Erreur réseau", "error"); }
  };

  const deleteExchangeRateFn = async (id) => {
    if (!confirm("Supprimer cette devise ?")) return;
    try {
      const r = await fetch(`/api/admin/business-config/exchange-rates/${id}`, { method: "DELETE", headers });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        showToast(d?.message || "Suppression refusée par le serveur.", "error");
        return;
      }
      showToast("Devise supprimée.");
      loadBusinessConfig();
    } catch { showToast("Erreur réseau — rien n'a été supprimé.", "error"); }
  };

  const saveCountryConfig = async () => {
    if (!countryForm?.code || !countryForm?.name || !countryForm?.defaultCurrency) {
      showToast("Code, nom et devise par défaut sont requis", "error"); return;
    }
    try {
      const r = await fetch("/api/admin/business-config/countries", {
        method: "POST", headers, body: JSON.stringify(countryForm),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) { showToast("Pays enregistré."); setCountryForm(null); loadBusinessConfig(); }
      else showToast(d?.message || "Erreur", "error");
    } catch { showToast("Erreur réseau", "error"); }
  };

  const deleteCountryConfigFn = async (id) => {
    if (!confirm("Supprimer ce pays ?")) return;
    try {
      const r = await fetch(`/api/admin/business-config/countries/${id}`, { method: "DELETE", headers });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        showToast(d?.message || "Suppression refusée par le serveur.", "error");
        return;
      }
      showToast("Pays supprimé.");
      loadBusinessConfig();
    } catch { showToast("Erreur réseau — rien n'a été supprimé.", "error"); }
  };

  const saveDiscountCampaign = async () => {
    if (!discountForm?.code || !discountForm?.discountPercent) {
      showToast("Code et pourcentage de réduction requis", "error"); return;
    }
    try {
      const payload = {
        ...discountForm,
        maxRedemptions: discountForm.maxRedemptions === "" ? null : discountForm.maxRedemptions,
        startDate: discountForm.startDate || null,
        endDate: discountForm.endDate || null,
      };
      const r = await fetch("/api/admin/business-config/discount-campaigns", {
        method: "POST", headers, body: JSON.stringify(payload),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) { showToast("Campagne enregistrée."); setDiscountForm(null); loadBusinessConfig(); }
      else showToast(d?.message || "Erreur", "error");
    } catch { showToast("Erreur réseau", "error"); }
  };

  const deleteDiscountCampaignFn = async (id) => {
    if (!confirm("Supprimer cette campagne ?")) return;
    try {
      const r = await fetch(`/api/admin/business-config/discount-campaigns/${id}`, { method: "DELETE", headers });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        showToast(d?.message || "Suppression refusée par le serveur.", "error");
        return;
      }
      showToast("Campagne supprimée.");
      loadBusinessConfig();
    } catch { showToast("Erreur réseau — rien n'a été supprimé.", "error"); }
  };

  // ── Journal d'audit ──────────────────────────────────────────────────────────
  const loadContracts = useCallback(async () => {
    if (!token) return;
    setContractsLoading(true);
    try {
      const r = await fetch("/api/contracts/mine", { headers });
      if (r.ok) setContracts((await r.json()).contracts || []);
    } catch { /* ignore */ }
    setContractsLoading(false);
  }, [token, headers]);

  const loadAuditLog = useCallback(async () => {
    if (!token) return;
    setAuditLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (auditFilter.action)   params.set("action",   auditFilter.action);
      if (auditFilter.resource) params.set("resource", auditFilter.resource);
      if (auditFilter.success)  params.set("success",  auditFilter.success);
      params.delete("limit"); params.delete("page");
      // Jusqu'à 1 000 entrées par filtre (fetchPaged) — 50 seulement avant.
      const [listRes, facetsRes] = await Promise.all([
        fetchPaged(`/api/audit-log/admin/list?${params}`, { limit: 1000, pageSize: 100, key: "entries" }),
        fetch("/api/audit-log/admin/actions",           { headers }),
      ]);
      setAuditEntries(listRes.items || []);
      if (facetsRes.ok) setAuditFacets(await facetsRes.json());
    } catch { /* ignore */ }
    setAuditLoading(false);
  }, [token, headers, auditFilter, fetchPaged]);

  // ── Support Client ──────────────────────────────────────────────────────────
  const chercherPartenaireEssai = useCallback(async (query) => {
    setEssaiRecherche(query);
    setEssaiVendeur(null);
    // La liste `users` du tableau de bord est PAGINÉE : s'en servir aurait
    // rendu invisibles tous les partenaires au-delà de la première page. La
    // recherche interroge donc le serveur, comme le transfert d'activité.
    if (query.trim().length < 2) { setEssaiResultats([]); return; }
    try {
      const r = await fetch(`/api/users?search=${encodeURIComponent(query.trim())}&role=partenaire&limit=6`, { headers });
      if (r.ok) { const d = await r.json(); setEssaiResultats(d.users || []); }
    } catch { /* recherche non bloquante */ }
  }, [headers]);

  const accorderEssai = useCallback(async () => {
    if (!essaiVendeur) return;
    setEssaiRetour(null);
    // Route ADMIN (`/admin/:vendorId/trial`) — l'omettre visait une route
    // inexistante et renvoyait un 404 silencieux dans l'interface.
    const r = await fetch(`/api/subscriptions/admin/${essaiVendeur._id}/trial`, {
      method: "POST", headers, body: JSON.stringify({ planTier: essaiPalier }),
    });
    const d = await r.json().catch(() => ({}));
    setEssaiRetour({ ok: r.ok, message: d.message || (r.ok ? "Essai accordé." : "Échec.") });
    if (r.ok) { setEssaiVendeur(null); setEssaiRecherche(""); setEssaiResultats([]); loadSubRequests(); }
  }, [headers, essaiVendeur, essaiPalier, loadSubRequests]);

  const loadTickets = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch(`/api/support/admin/tickets${ticketsStatut ? `?status=${ticketsStatut}` : ""}`, { headers });
      if (r.ok) {
        const d = await r.json();
        setTickets(d.tickets || []);
        setTicketsEnRetard(d.enRetard || 0);
      }
    } catch { /* ignore */ }
  }, [token, headers, ticketsStatut]);

  const repondreTicket = useCallback(async (id, content) => {
    if (!content?.trim()) return;
    const r = await fetch(`/api/support/tickets/${id}/messages`, {
      method: "POST", headers, body: JSON.stringify({ content }),
    });
    if (r.ok) { setTicketReponse(""); loadTickets(); }
  }, [headers, loadTickets]);

  const changerStatutTicket = useCallback(async (id, status) => {
    const r = await fetch(`/api/support/admin/tickets/${id}`, {
      method: "PATCH", headers, body: JSON.stringify({ status }),
    });
    if (r.ok) { setTicketOuvert(null); loadTickets(); }
  }, [headers, loadTickets]);

  const loadSupportChats = useCallback(async () => {
    if (!token) return;
    setSupportLoading(true);
    try {
      const r = await fetch("/api/chats/support", { headers });
      if (r.ok) { const d = await r.json(); setSupportChats(d.chats || []); }
    } catch { /* ignore */ }
    setSupportLoading(false);
  }, [token, headers]);

  // Toujours chargé sans filtre serveur — le filtre (reportFilter) s'applique
  // côté client, pour que le badge "en attente" reste exact quel que soit le
  // filtre actuellement affiché (voir pendingReports plus haut).
  const loadReports = useCallback(async () => {
    if (!token) return;
    setReportsLoading(true);
    try {
      // Tous les signalements (fetchPaged) : au-delà des 100 plus récents, un
      // signalement en attente disparaissait de la liste ET du compteur.
      const { items } = await fetchPaged("/api/reports/admin", { limit: 5000, pageSize: 100, key: "reports" });
      setReports(items);
    } catch { /* ignore */ }
    setReportsLoading(false);
  }, [token, fetchPaged]);

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

  const openTrustOverview = async (u) => {
    setTrustModal(u);
    setTrustOverview(null);
    setTrustLoading(true);
    try {
      const r = await fetch(`/api/users/${u._id}/trust-overview`, { headers });
      if (r.ok) { const d = await r.json(); setTrustOverview(d.overview); }
    } catch { /* ignore */ }
    setTrustLoading(false);
  };

  const decideReport = async (id, status) => {
    // prompt() renvoie null quand l'admin clique « Annuler » : l'ancien
    // `prompt(...) || null` continuait, et la décision était appliquée quand
    // même. On abandonne réellement.
    let note = null;
    if (status !== "classe_sans_suite") {
      const answer = prompt("Note (optionnel) :");
      if (answer === null) return;
      note = answer.trim() || null;
    }
    try {
      const r = await fetch(`/api/reports/admin/${id}`, {
        method: "PATCH", headers, body: JSON.stringify({ status, reviewNote: note }),
      });
      if (r.ok) { showToast("Signalement mis à jour."); loadReports(); }
      else showToast("Erreur", "error");
    } catch { showToast("Erreur réseau", "error"); }
  };

  const loadWaConversations = useCallback(async () => {
    if (!token) return;
    setWaLoading(true);
    try {
      const r = await fetch(`/api/whatsapp/admin/conversations?status=${waFilter}`, { headers });
      if (r.ok) { const d = await r.json(); setWaConversations(d.conversations || []); }
    } catch { /* ignore */ }
    setWaLoading(false);
  }, [token, headers, waFilter]);

  const openWaConversation = async (conv) => {
    try {
      const r = await fetch(`/api/whatsapp/admin/conversations/${conv._id}`, { headers });
      if (r.ok) { const d = await r.json(); setWaActive(d.conversation); }
    } catch { showToast("Erreur réseau", "error"); }
  };

  const sendWaReply = async () => {
    if (!waReply.trim() || !waActive) return;
    try {
      const r = await fetch(`/api/whatsapp/admin/conversations/${waActive._id}/reply`, {
        method: "POST", headers, body: JSON.stringify({ message: waReply.trim() }),
      });
      const d = await r.json();
      if (r.ok) { setWaActive(d.conversation); setWaReply(""); loadWaConversations(); }
      else showToast(d.message || "Échec d'envoi.", "error");
    } catch { showToast("Erreur réseau", "error"); }
  };

  const waSetStatus = async (id, status) => {
    try {
      const r = await fetch(`/api/whatsapp/admin/conversations/${id}/status`, {
        method: "PATCH", headers, body: JSON.stringify({ status }),
      });
      if (r.ok) {
        showToast(status === "bot" ? "Rendu au bot." : "Conversation clôturée.");
        setWaActive(null);
        loadWaConversations();
      }
    } catch { showToast("Erreur réseau", "error"); }
  };

  const openSupportChat = useCallback(async (chat) => {
    setSupportActive(chat);
    setSupportMsgLoading(true);
    setSupportMessages([]);
    try {
      const r = await fetch(`/api/chats/${chat._id}`, { headers });
      if (r.ok) {
        const d = await r.json();
        setSupportMessages(d.messages || []);
        setSupportChats((prev) => prev.map((c) => c._id === chat._id ? { ...c, unread: 0, needsReply: false } : c));
      }
    } catch { /* ignore */ }
    setSupportMsgLoading(false);
  }, [headers]);

  const sendSupportReply = useCallback(async () => {
    const content = supportReply.trim();
    if (!content || !supportActive) return;
    setSupportSending(true);
    try {
      const r = await fetch(`/api/chats/${supportActive._id}`, {
        method: "POST", headers, body: JSON.stringify({ content }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setSupportMessages((prev) => [...prev, d.message]);
        setSupportReply("");
        setSupportChats((prev) => prev.map((c) =>
          c._id === supportActive._id
            ? { ...c, lastMessage: content.slice(0, 100), lastMessageAt: new Date().toISOString(), needsReply: false }
            : c
        ));
      } else {
        showToast(d.message || "Erreur lors de l'envoi.", "error");
      }
    } catch { showToast("Erreur réseau.", "error"); }
    setSupportSending(false);
  }, [headers, supportReply, supportActive, showToast]);

  // ── Gate admin obligatoire (audit 2026-08) ─────────────────────────────
  const loadPendingValidation = useCallback(async () => {
    if (!token) return;
    setPendingValidationLoading(true);
    try {
      const [bRes, tRes] = await Promise.all([
        fetch("/api/bookings/admin/pending-validation", { headers }),
        fetch("/api/import-export/transactions/admin/pending-validation", { headers }),
      ]);
      if (bRes.ok) setPendingValidationBookings((await bRes.json()).bookings || []);
      if (tRes.ok) setPendingValidationDirect((await tRes.json()).transactions || []);
    } catch { /* ignore */ }
    setPendingValidationLoading(false);
  }, [token, headers]);

  const adminValidateBookingReq = useCallback(async (id, decision, refusalReason) => {
    try {
      const r = await fetch(`/api/bookings/${id}/admin-validate`, {
        method: "PATCH", headers, body: JSON.stringify({ decision, refusalReason }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        showToast(decision === "approved" ? "Réservation transmise au partenaire." : "Demande refusée.");
        setPendingValidationBookings((prev) => prev.filter((b) => b._id !== id));
      } else {
        showToast(d.message || "Erreur lors de la validation.", "error");
      }
    } catch { showToast("Erreur réseau.", "error"); }
  }, [headers, showToast]);

  const adminValidateDirectReq = useCallback(async (id, decision, refusalReason) => {
    try {
      const r = await fetch(`/api/import-export/transactions/${id}/admin-validate-direct`, {
        method: "PATCH", headers, body: JSON.stringify({ decision, refusalReason }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        showToast(decision === "approved" ? "Achat direct transmis au partenaire." : "Achat direct refusé.");
        setPendingValidationDirect((prev) => prev.filter((t) => t._id !== id));
      } else {
        showToast(d.message || "Erreur lors de la validation.", "error");
      }
    } catch { showToast("Erreur réseau.", "error"); }
  }, [headers, showToast]);

  const confirmValidationReject = useCallback(async () => {
    if (!validationRejectModal) return;
    const { kind, item } = validationRejectModal;
    if (kind === "booking") await adminValidateBookingReq(item._id, "rejected", validationRejectReason.trim());
    else await adminValidateDirectReq(item._id, "rejected", validationRejectReason.trim());
    setValidationRejectModal(null);
    setValidationRejectReason("");
  }, [validationRejectModal, validationRejectReason, adminValidateBookingReq, adminValidateDirectReq]);

  // ── Supervision chats client_partner (lecture seule, audit 2026-08) ─────
  const loadClientPartnerChats = useCallback(async () => {
    if (!token) return;
    setCpChatsLoading(true);
    try {
      const r = await fetch("/api/chats/admin/client-partner", { headers });
      if (r.ok) setCpChats((await r.json()).chats || []);
    } catch { /* ignore */ }
    setCpChatsLoading(false);
  }, [token, headers]);

  const openClientPartnerChat = useCallback(async (chat) => {
    setCpActive(chat);
    setCpMsgLoading(true);
    setCpMessages([]);
    try {
      const r = await fetch(`/api/chats/admin/client-partner/${chat._id}`, { headers });
      if (r.ok) setCpMessages((await r.json()).messages || []);
    } catch { /* ignore */ }
    setCpMsgLoading(false);
  }, [headers]);

  // Bug réel corrigé (audit) : plafonné à 50, trié du plus récent au plus
  // ancien, sans aucune pagination — les dossiers les plus ANCIENS (donc les
  // plus en retard de traitement) disparaissaient silencieusement en premier
  // dès que le nombre de dossiers dépassait 50. `limit` paramétrable +
  // `kycTotal` renvoyé par le backend permettent désormais un "Charger plus"
  // réel plutôt qu'un plafond invisible.
  const loadKycList = useCallback(async (status = "", limit = kycLimit) => {
    if (!token) return;
    setKycLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (status) params.set("status", status);
      const r = await fetch(`/api/kyc/admin/list?${params}`, { headers });
      if (r.ok) { const d = await r.json(); setKycList(d.users || []); setKycTotal(d.total || 0); }
    } catch { /* ignore */ }
    setKycLoading(false);
  }, [token, headers, kycLimit]);

  const loadMoreKyc = useCallback(() => {
    const next = kycLimit + 100;
    setKycLimit(next);
    // "ALL" est compris par le serveur (aucun filtre) ; le convertir en ""
    // faisait basculer « Charger plus » sur les seuls dossiers en attente.
    loadKycList(kycFilter, next);
  }, [kycLimit, kycFilter, loadKycList]);

  // Compteur "en attente" — toujours interrogé SANS filtre de statut (le backend
  // applique alors son défaut EN_ATTENTE + A_REVOIR_MANUELLEMENT, voir
  // kycController.getKycList) donc jamais affecté par le filtre choisi dans l'UI.
  const loadKycPendingTotal = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch("/api/kyc/admin/list?limit=1", { headers });
      if (r.ok) { const d = await r.json(); setKycPendingTotal(d.total || 0); }
    } catch { /* ignore */ }
  }, [token, headers]);

  useEffect(() => { loadKycPendingTotal(); }, [loadKycPendingTotal]);

  const loadCertList = useCallback(async () => {
    if (!token) return;
    setCertLoading(true);
    try {
      // Toutes les pages (fetchPaged) : la 1re page de 100 seulement rendait
      // les enregistrements plus anciens inaccessibles (audit du 2026-10-05).
      const { items } = await fetchPaged("/api/certification/admin/list", { limit: 5000, pageSize: 100, key: "certifications" });
      setCertList(items);
    } catch { /* ignore */ }
    setCertLoading(false);
  }, [token, fetchPaged]);

  const handleCertLevelReview = useCallback(async (userId, level) => {
    setCertReviewLoading(true); setCertReviewMsg("");
    try {
      const r = await fetch(`/api/certification/admin/${userId}/level/${level}/review`, {
        method: "PATCH", headers, body: JSON.stringify(certReviewForm),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setCertReviewMsg(`✅ Niveau ${level} : ${certReviewForm.decision}`);
        setCertReviewLevel(null);
        loadCertList();
        if (certDetail?.userId?._id === userId) {
          const dr = await fetch(`/api/certification/admin/${userId}`, { headers });
          if (dr.ok) { const dd = await dr.json(); setCertDetail(dd.certification); }
        }
      } else {
        setCertReviewMsg(`❌ ${d.message || "Erreur."}`);
      }
    } catch { setCertReviewMsg("❌ Connexion impossible."); }
    setCertReviewLoading(false);
  }, [headers, certReviewForm, certDetail, loadCertList]);

  const handleCertBadge = useCallback(async (userId) => {
    setCertReviewLoading(true); setCertReviewMsg("");
    try {
      const r = await fetch(`/api/certification/admin/${userId}/badge`, {
        method: "PATCH", headers, body: JSON.stringify(certBadgeForm),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setCertReviewMsg(`✅ Badge attribué : ${certBadgeForm.badge}`);
        loadCertList();
        if (certDetail?.userId?._id === userId) {
          const dr = await fetch(`/api/certification/admin/${userId}`, { headers });
          if (dr.ok) { const dd = await dr.json(); setCertDetail(dd.certification); }
        }
      } else {
        setCertReviewMsg(`❌ ${d.message || "Erreur."}`);
      }
    } catch { setCertReviewMsg("❌ Connexion impossible."); }
    setCertReviewLoading(false);
  }, [headers, certBadgeForm, certDetail, loadCertList]);

  const handleCertRelance = useCallback(async () => {
    if (!certDetail?.userId?._id) return;
    setCertReviewLoading(true);
    try {
      const r = await fetch(`/api/certification/admin/${certDetail.userId._id}/relance`, { method: "POST", headers });
      const d = await r.json().catch(() => ({}));
      if (r.ok) showToast(`Relance envoyée (${d.missingDocs.join(", ")})`);
      else showToast(d.message || "Erreur", "error");
    } catch { showToast("Connexion impossible", "error"); }
    setCertReviewLoading(false);
  }, [headers, certDetail, showToast]);

  // Ouvre le dossier KYC — charge le détail complet (photos recto/verso/selfie,
  // permis de conduire...) depuis /api/kyc/admin/:userId, car la LISTE exclut
  // volontairement ces images base64 (trop lourdes pour un listing de 50 dossiers).
  const openKycDetail = useCallback(async (u) => {
    setKycDetailUser(u);
    setKycReviewForm({ decision: u.kycStatus === "VERIFIE" ? "EN_ATTENTE" : "VERIFIE", note: "" });
    setKycReviewMsg("");
    setKycDetailLoading(true);
    try {
      const r = await fetch(`/api/kyc/admin/${u._id}`, { headers });
      if (r.ok) {
        const d = await r.json();
        setKycDetailUser(d.user);
      }
    } catch { /* garde les données de la liste en cas d'échec réseau */ }
    setKycDetailLoading(false);
  }, [headers]);

  const handleKycReview = async (userId) => {
    setKycReviewLoading(true); setKycReviewMsg("");
    try {
      const r = await fetch(`/api/kyc/admin/${userId}/review`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(kycReviewForm),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        // La confirmation s'affichait DANS la fenêtre du dossier, fermée à la
        // ligne suivante : l'admin ne voyait rien et croyait la validation en
        // échec alors qu'elle était enregistrée (2026-10-06, dossier Sangare).
        // Toast global + mise à jour immédiate de la ligne dans la liste.
        const libelles = { VERIFIE: "validé", REFUSE: "refusé", A_REVOIR_MANUELLEMENT: "mis en révision", EN_ATTENTE: "remis en attente" };
        const nom = `${kycDetailUser?.firstName || ""} ${kycDetailUser?.lastName || ""}`.trim() || "Le dossier";
        showToast(`✅ Dossier KYC de ${nom} ${libelles[kycReviewForm.decision] || kycReviewForm.decision}.`);
        setKycList((liste) => liste.map((u) => (u._id === userId ? { ...u, kycStatus: kycReviewForm.decision } : u)));
        setKycReviewMsg("");
        setKycDetailUser(null);
        loadKycList(kycFilter);
        loadKycPendingTotal();
      } else {
        setKycReviewMsg(`❌ ${d.message || "Erreur."}`);
      }
    } catch { setKycReviewMsg("❌ Connexion impossible."); }
    setKycReviewLoading(false);
  };

  // ── PMS Admin ─────────────────────────────────────────────────────────────
  const loadPMSAdmin = useCallback(async () => {
    if (!token) return;
    setPmsLoading(true);
    try {
      const published = pmsFilter === "all" ? "" : `?published=${pmsFilter === "published"}`;
      const [statsRes, showroomsRes] = await Promise.all([
        fetch("/api/pms/admin/stats",             { headers }),
        fetch(`/api/pms/admin/showrooms${published}`, { headers }),
      ]);
      if (statsRes.ok)     setPmsStats(await statsRes.json());
      if (showroomsRes.ok) setPmsShowrooms((await showroomsRes.json()).showrooms || []);
    } catch { /* ignore */ }
    setPmsLoading(false);
  }, [token, headers, pmsFilter]);

  const loadFoundingPartners = useCallback(async () => {
    if (!token) return;
    setFoundingLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        fetchPaged("/api/partner-onboarding/admin/list", { limit: 5000, pageSize: 100, key: "onboardings" }),
        fetch("/api/partner-onboarding/admin/stats",          { headers }),
      ]);
      // Toutes les pages (fetchPaged) — l'onglet n'en montrait que 100.
      setFoundingList(listRes.items || []);
      if (statsRes.ok) setFoundingStats(await statsRes.json());
    } catch { /* ignore */ }
    setFoundingLoading(false);
  }, [token, headers, fetchPaged]);

  const foundingApprove = async (id, note) => {
    if (foundingSubmitting) return; // évite le double-clic (double envoi de LOI)
    setFoundingSubmitting(true);
    try {
      const r = await fetch(`/api/partner-onboarding/admin/${id}/approve`, {
        method: "POST", headers,
        body: JSON.stringify({ note: note || "" }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      const company = foundingList.find(o => o._id === id)?.companyInfo?.legalName || "Partenaire";
      setFoundingSignLink({ id, link: data.signLink, type: "loi", companyName: company });
      showToast("Candidature approuvée — LOI envoyée par email", "success");
      setFoundingAction(null);
      setFoundingNote("");
      loadFoundingPartners();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setFoundingSubmitting(false); }
  };

  const foundingSendAgreement = async (id) => {
    if (foundingRowActionId) return; // évite le double-clic (double envoi de l'accord)
    setFoundingRowActionId(id);
    try {
      const r = await fetch(`/api/partner-onboarding/admin/${id}/send-agreement`, {
        method: "POST", headers,
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      const company = foundingList.find(o => o._id === id)?.companyInfo?.legalName || "Partenaire";
      setFoundingSignLink({ id, link: data.signLink, type: "agreement", companyName: company });
      showToast("Accord envoyé par email", "success");
      loadFoundingPartners();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setFoundingRowActionId(null); }
  };

  // Renvoie un lien de signature FRAIS (LOI ou Accord, selon le statut actuel)
  // dans un seul email — remplace l'ancien bouton "Renvoyer l'accord" qui
  // appelait send-agreement (lequel exige status "loi_signee" et échouait donc
  // systématiquement une fois l'accord déjà envoyé), et comble l'absence totale
  // de moyen de renvoyer une LOI dont le lien a expiré ou ne s'est pas ouvert.
  const foundingResendDocuments = async (id) => {
    if (foundingRowActionId) return;
    setFoundingRowActionId(id);
    try {
      const r = await fetch(`/api/partner-onboarding/admin/${id}/resend-documents`, {
        method: "POST", headers,
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      const company = foundingList.find(o => o._id === id)?.companyInfo?.legalName || "Partenaire";
      setFoundingSignLink({ id, link: data.signLink, type: data.status === "loi_envoyee" ? "loi" : "agreement", companyName: company });
      showToast("Nouveau lien de signature envoyé par email", "success");
      loadFoundingPartners();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setFoundingRowActionId(null); }
  };

  // Relance une entité SANS AUCUN dossier Founding Partner (voir adminList,
  // lignes "orphanRows" — un partenaire ayant une entité PartnerBusiness mais
  // n'ayant jamais cliqué "Commencer ma candidature"). `id` est ici l'ID de
  // l'entité (PartnerBusiness), pas d'un PartnerOnboarding — il n'en existe pas.
  const foundingRelaunchBusiness = async (businessId) => {
    if (foundingRowActionId) return;
    setFoundingRowActionId(businessId);
    try {
      const r = await fetch(`/api/partner-onboarding/admin/relaunch-business/${businessId}`, {
        method: "POST", headers,
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast("Invitation à démarrer sa candidature envoyée par email", "success");
      loadFoundingPartners();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setFoundingRowActionId(null); }
  };

  // Relance un dossier resté incomplet (brouillon jamais soumis, ou déjà relancé
  // une première fois) — endpoint backend existant depuis longtemps
  // (adminRequestInfo) mais jusqu'ici jamais appelé depuis cette interface : un
  // partenaire ayant sauté des étapes n'avait aucun moyen d'être notifié pour
  // compléter son dossier.
  const foundingRequestInfo = async (id, infoRequested) => {
    if (!infoRequested?.trim()) { showToast("Précisez ce qui doit être complété", "error"); return; }
    if (foundingSubmitting) return;
    setFoundingSubmitting(true);
    try {
      const r = await fetch(`/api/partner-onboarding/admin/${id}/request-info`, {
        method: "POST", headers,
        body: JSON.stringify({ infoRequested }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast("Partenaire relancé — notification envoyée", "success");
      setFoundingAction(null);
      setFoundingNote("");
      loadFoundingPartners();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setFoundingSubmitting(false); }
  };

  const foundingReject = async (id, note) => {
    if (!note?.trim()) { showToast("Note de rejet requise", "error"); return; }
    if (foundingSubmitting) return; // évite le double-clic (double rejet)
    setFoundingSubmitting(true);
    try {
      const r = await fetch(`/api/partner-onboarding/admin/${id}/reject`, {
        method: "POST", headers,
        body: JSON.stringify({ note }),
      });
      if (!r.ok) { showToast("Erreur", "error"); return; }
      showToast("Dossier rejeté", "success");
      setFoundingAction(null);
      setFoundingNote("");
      loadFoundingPartners();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setFoundingSubmitting(false); }
  };

  const foundingUpdateCRM = async (id, data) => {
    try {
      const r = await fetch(`/api/partner-onboarding/admin/${id}/crm`, {
        method: "PATCH", headers,
        body: JSON.stringify(data),
      });
      const json = await r.json();
      if (!r.ok) { showToast(json.message || "Erreur CRM", "error"); return; }
      showToast("CRM mis à jour", "success");
      setFoundingCRMEdit(null);
      setFoundingList((prev) => prev.map((o) =>
        o._id === id ? { ...o, adminCRM: json.adminCRM } : o
      ));
    } catch { showToast("Erreur réseau", "error"); }
  };

  // ── CRM Partenaires (pipeline de prospection à 9 étapes) ──────────────────
  const loadPartnerCrm = useCallback(async () => {
    if (!token) return;
    setCrmLoading(true);
    setCrmErreur("");
    try {
      const params = new URLSearchParams({ limit: String(CRM_PAR_PAGE), page: String(crmPage) });
      if (crmFilter.statut)     params.set("statut", crmFilter.statut);
      if (crmFilter.pays)       params.set("pays", crmFilter.pays);
      if (crmFilter.secteur)    params.set("secteur", crmFilter.secteur);
      if (crmFilter.assignedTo) params.set("assignedTo", crmFilter.assignedTo);
      if (crmFilter.source)     params.set("source", crmFilter.source);
      if (crmFilter.aRelancer)  params.set("aRelancer", "1");
      if (crmSearch)            params.set("search", crmSearch);
      const [listRes, statsRes] = await Promise.all([
        fetch(`/api/partner-crm/admin/list?${params}`, { headers }),
        fetch("/api/partner-crm/admin/stats",           { headers }),
      ]);
      // Une erreur s'affiche comme une erreur — jamais comme « aucun prospect ».
      if (listRes.ok) {
        const l = await listRes.json();
        setCrmList(l.items || []);
        setCrmTotal(l.total || 0);
      } else {
        setCrmErreur((await listRes.json().catch(() => ({}))).message || `Chargement impossible (${listRes.status}).`);
      }
      if (statsRes.ok) setCrmStats(await statsRes.json());
    } catch { setCrmErreur("Erreur réseau : la liste n'a pas pu être chargée."); }
    setCrmLoading(false);
  }, [token, headers, crmFilter, crmSearch, crmPage]);
  // Nouveau filtre ou nouvelle recherche : retour à la première page.
  useEffect(() => { setCrmPage(1); }, [crmFilter, crmSearch]);

  const crmCreateProspect = async (confirmerDoublon = false) => {
    if (crmSubmitting) return;
    if (!crmNewForm.entreprise.trim()) { showToast("Le nom de l'entreprise est requis", "error"); return; }
    setCrmSubmitting(true);
    try {
      const r = await fetch("/api/partner-crm/admin", {
        method: "POST", headers,
        body: JSON.stringify({ ...crmNewForm, confirmerDoublon }),
      });
      const data = await r.json();
      if (r.status === 409 && data.code === "DOUBLON_POSSIBLE") { setCrmDoublons(data.doublons || []); return; }
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast("Prospect créé", "success");
      setCrmDoublons(null);
      setCrmCreating(false);
      setCrmNewForm({ entreprise: "", pays: "", ville: "", secteur: "", contactNom: "", contactTel: "", contactEmail: "", website: "", source: "", assignedTo: "", priority: "medium" });
      loadPartnerCrm();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setCrmSubmitting(false); }
  };

  const crmAdvanceStatut = async (id, statut) => {
    try {
      const r = await fetch(`/api/partner-crm/admin/${id}/statut`, {
        method: "PATCH", headers,
        body: JSON.stringify({ statut }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast(`Étape → ${statut}`, "success");
      setCrmList((prev) => prev.map((c) => c._id === id ? { ...c, statut, dateInscription: data.dateInscription || c.dateInscription } : c));
      loadPartnerCrm();
    } catch { showToast("Erreur réseau", "error"); }
  };

  const crmOpenDetail = async (id) => {
    setCrmDetail(id);
    setCrmDetailData(null);
    setCrmEditData(null);
    try {
      const r = await fetch(`/api/partner-crm/admin/${id}`, { headers });
      if (r.ok) {
        const data = await r.json();
        setCrmDetailData(data);
        setCrmEditData({
          entreprise: data.crm.entreprise || "", pays: data.crm.pays || "", ville: data.crm.ville || "",
          secteur: data.crm.secteur || "", contactNom: data.crm.contactNom || "", contactTel: data.crm.contactTel || "",
          contactEmail: data.crm.contactEmail || "", website: data.crm.website || "",
          internalNotes: data.crm.internalNotes || "", source: data.crm.source || "",
          prochaineAction: data.crm.prochaineAction || "",
          priority: data.crm.priority || "medium", assignedTo: data.crm.assignedTo?._id || "",
          lastContactDate: data.crm.lastContactDate ? new Date(data.crm.lastContactDate).toISOString().slice(0, 10) : "",
          lastContactChannel: data.crm.lastContactChannel || "",
          nextFollowUpDate: data.crm.nextFollowUpDate ? new Date(data.crm.nextFollowUpDate).toISOString().slice(0, 10) : "",
          commissionTaux: data.crm.commission?.taux ?? "", commissionNotes: data.crm.commission?.notes || "",
          contratReference: data.crm.contrat?.reference || "", contratUrl: data.crm.contrat?.url || "",
          services: (data.crm.services || []).join(", "),
        });
      }
    } catch { showToast("Erreur réseau", "error"); }
  };

  const crmSaveDetail = async () => {
    if (!crmDetail || !crmEditData) return;
    setCrmSubmitting(true);
    try {
      const r = await fetch(`/api/partner-crm/admin/${crmDetail}`, {
        method: "PATCH", headers,
        body: JSON.stringify({
          ...crmEditData,
          services: crmEditData.services.split(",").map((s) => s.trim()).filter(Boolean),
          commission: { taux: crmEditData.commissionTaux === "" ? null : Number(crmEditData.commissionTaux), notes: crmEditData.commissionNotes },
          contrat: { reference: crmEditData.contratReference, url: crmEditData.contratUrl },
        }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast("Prospect mis à jour", "success");
      loadPartnerCrm();
      crmOpenDetail(crmDetail);
    } catch { showToast("Erreur réseau", "error"); }
    finally { setCrmSubmitting(false); }
  };

  const crmLinkAccount = async () => {
    if (!crmDetail || !crmLinkUserId.trim()) return;
    setCrmSubmitting(true);
    try {
      const r = await fetch(`/api/partner-crm/admin/${crmDetail}/link`, {
        method: "PATCH", headers,
        body: JSON.stringify({ userId: crmLinkUserId.trim() }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast("Compte lié avec succès", "success");
      setCrmLinkUserId("");
      loadPartnerCrm();
      crmOpenDetail(crmDetail);
    } catch { showToast("Erreur réseau", "error"); }
    finally { setCrmSubmitting(false); }
  };

  const adminToggleShowroom = async (id) => {
    try {
      const r = await fetch(`/api/pms/admin/showrooms/${id}/toggle`, { method: "PATCH", headers });
      if (r.ok) {
        const { isPublished } = await r.json();
        setPmsShowrooms((prev) => prev.map((s) => s._id === id ? { ...s, isPublished } : s));
        showToast(isPublished ? "Showroom publié" : "Showroom dépublié", "success");
      }
    } catch { showToast("Erreur", "error"); }
  };

  // ── Partner Verification ───────────────────────────────────────────────────
  const loadPartnerVerif = useCallback(async () => {
    if (!token) return;
    setPvLoading(true);
    try {
      const params = new URLSearchParams();
      if (pvFilter.status)      params.set("status",      pvFilter.status);
      if (pvFilter.trustLevel)  params.set("trustLevel",  pvFilter.trustLevel);
      if (pvFilter.companyType) params.set("companyType", pvFilter.companyType);
      if (pvFilter.search)      params.set("search",      pvFilter.search);
      params.set("limit", "100");
      const [listRes, statsRes] = await Promise.all([
        fetch(`/api/partner-verif/admin/list?${params}`, { headers }),
        fetch("/api/partner-verif/admin/stats",          { headers }),
      ]);
      if (listRes.ok)  setPvList((await listRes.json()).verifications || []);
      if (statsRes.ok) setPvStats(await statsRes.json());
    } catch { /* ignore */ }
    setPvLoading(false);
  }, [token, headers, pvFilter]);

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

  // Chargé indépendamment de l'onglet actif (contrairement au bloc ci-dessus,
  // conditionné par activeTab === "business_config") : le message d'invitation
  // Founding Partner (vue "onboarding") a besoin des taux de commission
  // courants même si l'admin n'a jamais ouvert l'onglet Configuration métier.
  useEffect(() => { if (!bizConfig) loadBusinessConfig(); }, [bizConfig, loadBusinessConfig]);

  // Rafraîchissement périodique de la liste support (nouvelles demandes) tant que
  // l'onglet est affiché — même logique de polling que le widget chat public.
  useEffect(() => {
    if (activeTab !== "support") return undefined;
    const t = setInterval(loadSupportChats, 15_000);
    return () => clearInterval(t);
  }, [activeTab, loadSupportChats]);

  // Même logique de polling pour la supervision chats client_partner (audit 2026-08).
  useEffect(() => {
    if (activeTab !== "chat_supervision") return undefined;
    const t = setInterval(loadClientPartnerChats, 15_000);
    return () => clearInterval(t);
  }, [activeTab, loadClientPartnerChats]);

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
  }, [onSocket, cpActive, activeTab, loadClientPartnerChats]);

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
  }, [onSocket, supportActive, activeTab, loadSupportChats]);

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
  }, [activeTab]);

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
            <div className={styles.tabContent}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>🕐 Demandes à valider</h2>
                  <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>
                    Aucune réservation, demande d'essai ou achat direct n'atteint le partenaire tant qu'elle n'est pas approuvée ici.
                  </p>
                </div>
                <button style={{ background: "#f1f5f9", color: "#0f1b3f", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontWeight: 700, fontSize: ".8rem" }}
                  onClick={loadPendingValidation}>↻ Actualiser</button>
              </div>

              <h3 style={{ fontSize: ".9rem", color: "#0f1b3f", margin: "0 0 10px" }}>📋 Réservations / essais ({pendingValidationBookings.length})</h3>
              {pendingValidationLoading && pendingValidationBookings.length === 0 ? (
                <p style={{ color: "#94a3b8", fontSize: ".85rem" }}>Chargement…</p>
              ) : pendingValidationBookings.length === 0 ? (
                <p style={{ color: "#94a3b8", fontSize: ".85rem", marginBottom: 24 }}>Aucune demande en attente.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
                  {pendingValidationBookings.map((b) => {
                    const itemLabel = b.vehicle?.title || (b.driver ? `${b.driver.firstName} ${b.driver.lastName}` : b.activity?.title) || "—";
                    return (
                      <div key={b._id} style={{ border: "1.5px solid #e2e8f0", borderRadius: 12, padding: 14, background: b.adminValidation?.fastTrack ? "#fff7ed" : "#fff", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: ".88rem", color: "#0f1b3f" }}>
                            {b.adminValidation?.fastTrack && <span style={{ color: "#d97706" }}>⚡ Instantanée — </span>}
                            {b.reference} · {b.type}
                          </div>
                          <div style={{ fontSize: ".78rem", color: "#64748b", marginTop: 2 }}>
                            {b.clientInfo?.firstName} {b.clientInfo?.lastName} → {itemLabel}
                          </div>
                          <div style={{ fontSize: ".76rem", color: "#94a3b8", marginTop: 2 }}>
                            {(b.montantTotal || 0).toLocaleString("fr-FR")} $ · {timeAgo(b.createdAt)}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          {/* Les documents client (pièce d'identité, permis) sont
                              joints à la réservation : c'est ICI, au moment de la
                              décision d'approbation, que l'admin en a le plus
                              besoin — ils n'étaient consultables que depuis
                              l'onglet Réservations, une fois la décision prise. */}
                          <button onClick={() => setDocsModal({ booking: b })} title="Documents client joints à la réservation"
                            style={{ background: "#eff6ff", color: "#1d4ed8", border: "1.5px solid #bfdbfe", borderRadius: 8, padding: "8px 12px", fontWeight: 700, fontSize: ".8rem", cursor: "pointer" }}>
                            📄 Documents
                          </button>
                          <button onClick={() => adminValidateBookingReq(b._id, "approved")}
                            style={{ background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: ".8rem", cursor: "pointer" }}>
                            ✅ Approuver
                          </button>
                          <button onClick={() => { setValidationRejectModal({ kind: "booking", item: b }); setValidationRejectReason(""); }}
                            style={{ background: "#fef2f2", color: "#dc2626", border: "1.5px solid #fecaca", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: ".8rem", cursor: "pointer" }}>
                            ❌ Refuser
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <h3 style={{ fontSize: ".9rem", color: "#0f1b3f", margin: "0 0 10px" }}>🌍 Achats directs Import/Export ({pendingValidationDirect.length})</h3>
              {pendingValidationDirect.length === 0 ? (
                <p style={{ color: "#94a3b8", fontSize: ".85rem" }}>Aucun achat direct en attente.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {pendingValidationDirect.map((tx) => (
                    <div key={tx._id} style={{ border: "1.5px solid #e2e8f0", borderRadius: 12, padding: 14, background: "#fff", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: ".88rem", color: "#0f1b3f" }}>{tx.listing?.title || "Annonce"}</div>
                        <div style={{ fontSize: ".78rem", color: "#64748b", marginTop: 2 }}>
                          {tx.client?.firstName} {tx.client?.lastName} → {tx.partner?.firstName} {tx.partner?.lastName}
                        </div>
                        <div style={{ fontSize: ".76rem", color: "#94a3b8", marginTop: 2 }}>
                          {(tx.finalOffer?.totalAmount || 0).toLocaleString("fr-FR")} {tx.finalOffer?.currency || ""} · {timeAgo(tx.createdAt)}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => adminValidateDirectReq(tx._id, "approved")}
                          style={{ background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: ".8rem", cursor: "pointer" }}>
                          ✅ Approuver
                        </button>
                        <button onClick={() => { setValidationRejectModal({ kind: "direct", item: tx }); setValidationRejectReason(""); }}
                          style={{ background: "#fef2f2", color: "#dc2626", border: "1.5px solid #fecaca", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: ".8rem", cursor: "pointer" }}>
                          ❌ Refuser
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f1b3f", margin: 0 }}>
              💰 Commissions VIT-AUTO
            </h2>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="number"
                value={invoiceYear}
                onChange={(e) => setInvoiceYear(Number(e.target.value))}
                style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "6px 12px", width: 90, fontSize: "0.85rem" }}
                placeholder="Année"
              />
              <select
                value={invoiceMonth}
                onChange={(e) => setInvoiceMonth(e.target.value)}
                style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "6px 12px", fontSize: "0.85rem" }}
              >
                <option value="">Tous les mois</option>
                {MOIS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
              <button className={styles.btnRefresh} onClick={loadCommissions}>Filtrer</button>
            </div>
          </div>

          {/* KPIs */}
          {commissionsStats && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 14, marginBottom: "1.5rem" }}>
              <StatCard icon="📊" label="Transactions terminées" value={commissionsStats.count} color="#6366f1" />
              <StatCard icon="💵" label="Montant total transactions" value={fmtUSD(commissionsStats.transactions || 0)} color="#0ea5e9" />
              <StatCard icon="💰" label="Commissions générées" value={fmtUSD(commissionsStats.total || 0)} color="#10b981" />
            </div>
          )}

          {commissions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>
              <div style={{ fontSize: "3rem", marginBottom: 12 }}>💳</div>
              <p>Aucune commission pour cette période.</p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Référence</th>
                    <th>Type</th>
                    <th>Client</th>
                    <th>Montant transaction</th>
                    <th>Taux commission</th>
                    <th>Commission VIT-AUTO</th>
                    <th>Date</th>
                    <th>Facturé</th>
                  </tr>
                </thead>
                <tbody>
                  {commissions.map((b) => (
                    <tr key={b._id}>
                      <td style={{ fontWeight: 700, fontFamily: "monospace", fontSize: "0.83rem" }}>{b.reference || "—"}</td>
                      <td><Badge label={b.type} color="#6366f1" bg="#f5f3ff" /></td>
                      <td style={{ fontSize: "0.83rem" }}>{b.clientInfo?.firstName} {b.clientInfo?.lastName}</td>
                      <td style={{ fontWeight: 700 }}>
                        {fmtUSD(b.transaction?.finalAmount || b.montantTotal || 0)}
                      </td>
                      <td style={{ color: "#6366f1", fontWeight: 700 }}>
                        {Math.round((b.commissionRate || 0) * 100)} %
                      </td>
                      <td style={{ fontWeight: 800, color: "#10b981" }}>
                        {fmtUSD(b.commissionAmount || 0)}
                      </td>
                      <td style={{ fontSize: "0.83rem" }}>
                        {b.paidAt ? new Date(b.paidAt).toLocaleDateString("fr-FR") : "—"}
                      </td>
                      <td>
                        {b.invoiced
                          ? <Badge label="Facturé" color="#10b981" bg="#dcfce7" />
                          : <Badge label="Non facturé" color="#f59e0b" bg="#fef3c7" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>⚖️ Gestion des litiges</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Toutes les commandes en dispute requérant une décision administrative.</p>
            </div>
            <button className={styles.btnRefresh} style={{ background: "#f1f5f9", color: "#0f1b3f", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 14px" }} onClick={loadAll}>↻ Actualiser</button>
          </div>

          {/* Réclamations Import/Export (2026-10-31) — modèle Litige, statut des transactions inchangé. */}
          <ReclamationsIESection headers={headers} />

          {/* KPIs litiges */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 12, marginBottom: "1.5rem" }}>
            {[
              { icon: "⚖️", label: "Litiges ouverts",  value: bookings.filter(b => b.status === "disputed").length, color: "#dc2626" },
              { icon: "✅", label: "Résolus ce mois",   value: bookings.filter(b => {
                const d = b.disputeResolution?.resolvedAt;
                if (!d) return false;
                const now = new Date(); const rd = new Date(d);
                return rd.getMonth() === now.getMonth() && rd.getFullYear() === now.getFullYear();
              }).length, color: "#10b981" },
              { icon: "💰", label: "Montant en jeu",    value: fmtUSD(bookings.filter(b=>b.status==="disputed").reduce((s,b)=>s+(b.montantTotal||0),0)), color: "#f59e0b" },
            ].map(k => <StatCard key={k.label} icon={k.icon} label={k.label} value={k.value} color={k.color} />)}
          </div>

          {/* Tendance (8 dernières semaines) — calculée côté client sur les
              `bookings` déjà chargés, sans nouvel endpoint : compte les
              litiges OUVERTS par semaine (clientValidation.disputedAt), pas
              seulement ceux encore ouverts aujourd'hui. */}
          {(() => {
            const weeks = Array.from({ length: 8 }, (_, i) => {
              const start = new Date();
              start.setHours(0, 0, 0, 0);
              start.setDate(start.getDate() - start.getDay() - (7 - i) * 7);
              const end = new Date(start); end.setDate(end.getDate() + 7);
              return { start, end, count: 0 };
            });
            for (const b of bookings) {
              const d = b.clientValidation?.disputedAt;
              if (!d) continue;
              const dd = new Date(d);
              const w = weeks.find((w) => dd >= w.start && dd < w.end);
              if (w) w.count++;
            }
            const hasAny = weeks.some((w) => w.count > 0);
            if (!hasAny) return null;
            const maxCount = Math.max(...weeks.map((w) => w.count), 1);
            return (
              <div className={styles.chartCard} style={{ marginBottom: "1.5rem" }}>
                <div style={{ fontSize: ".82rem", fontWeight: 700, color: "#64748b", marginBottom: 10 }}>Litiges ouverts par semaine (8 dernières semaines)</div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 80 }}>
                  {weeks.map((w, i) => (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: ".68rem", color: "#64748b", fontWeight: 700 }}>{w.count || ""}</span>
                      <div style={{ width: "100%", height: Math.max(3, Math.round((w.count / maxCount) * 50)), background: w.count > 0 ? "linear-gradient(180deg,#f87171,#dc2626)" : "#e2e8f0", borderRadius: "4px 4px 0 0" }} />
                      <span style={{ fontSize: ".62rem", color: "#94a3b8" }}>{w.start.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {bookings.filter(b => b.status === "disputed").length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8" }}>
              <div style={{ fontSize: "3rem", marginBottom: 12 }}>⚖️</div>
              <p style={{ fontWeight: 700, color: "#64748b" }}>Aucun litige en cours.</p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Référence</th><th>Client</th><th>Véhicule / Service</th><th>Raison du litige</th><th>Montant</th><th>Date</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {bookings.filter(b => b.status === "disputed").map((b) => {
                    const clientName = `${b.clientInfo?.firstName||""} ${b.clientInfo?.lastName||""}`.trim();
                    const vName = b.vehicle ? [b.vehicle.marque, b.vehicle.modele].filter(Boolean).join(" ") : (b.driver ? `Chauffeur` : "—");
                    return (
                      <tr key={b._id} className={styles.tr} style={{ background: "#fff5f5" }}>
                        <td><strong style={{ fontSize:"0.8rem", fontFamily:"monospace", color:"#6366f1" }}>{b.reference||b._id?.slice(-6)}</strong></td>
                        <td><div><strong style={{ fontSize:"0.82rem" }}>{clientName||"—"}</strong><span className={styles.vehMeta}>{b.clientInfo?.email}</span></div></td>
                        <td style={{ fontSize:"0.82rem" }}>{vName}</td>
                        <td style={{ fontSize:"0.8rem", color:"#dc2626", maxWidth:200 }}>{b.clientValidation?.disputeReason||"Non précisée"}</td>
                        <td className={styles.tdPrice}>{b.montantTotal>0?fmtUSD(b.montantTotal):"—"}</td>
                        <td className={styles.tdDate}>{fmtDate(b.createdAt)}</td>
                        <td>
                          <button style={{ padding:"5px 12px", background:"#fee2e2", color:"#dc2626", border:"1px solid #fca5a5", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:"0.78rem" }}
                            onClick={() => { setDisputeModal({ booking:b }); setDisputeNote(""); setDisputeResol("completed"); }}>
                            ⚖️ Résoudre
                          </button>
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
        <div className={styles.tabContent}>
          <h2 style={{ fontSize:"1.1rem", fontWeight:800, color:"#0f1b3f", margin:"0 0 1.5rem" }}>🔔 Centre de notifications</h2>

          {/* Broadcast */}
          <div className={styles.chartCard} style={{ marginBottom:"1.5rem" }}>
            <h3 className={styles.chartTitle}>📢 Envoyer une notification groupée</h3>
            <div style={{ display:"flex", flexDirection:"column", gap:10, maxWidth:520 }}>
              <input style={{ borderRadius:8, border:"1.5px solid #e2e8f0", padding:"10px 14px", fontSize:"0.9rem", fontFamily:"inherit" }}
                placeholder="Titre *" value={broadcastForm.titre}
                onChange={e => setBroadcastForm({ ...broadcastForm, titre: e.target.value })} />
              <textarea style={{ borderRadius:8, border:"1.5px solid #e2e8f0", padding:"10px 14px", fontSize:"0.9rem", resize:"vertical", fontFamily:"inherit" }}
                rows={3} placeholder="Message *" value={broadcastForm.message}
                onChange={e => setBroadcastForm({ ...broadcastForm, message: e.target.value })} />
              <select style={{ borderRadius:8, border:"1.5px solid #e2e8f0", padding:"10px 14px", fontSize:"0.9rem" }}
                value={broadcastForm.targetRole} onChange={e => setBroadcastForm({ ...broadcastForm, targetRole: e.target.value })}>
                <option value="all">Tous les utilisateurs</option>
                <option value="client">Clients uniquement</option>
                <option value="partenaire">Partenaires uniquement</option>
                <option value="chauffeur">Chauffeurs uniquement</option>
                <option value="importateur">Importateurs</option>
              </select>
              <input style={{ borderRadius:8, border:"1.5px solid #e2e8f0", padding:"10px 14px", fontSize:"0.9rem", fontFamily:"inherit" }}
                placeholder="Lien interne (ex: /catalogue) — optionnel" value={broadcastForm.lien}
                onChange={e => setBroadcastForm({ ...broadcastForm, lien: e.target.value })} />
              <button className={styles.btnPrimary} style={{ width:"fit-content" }}
                disabled={broadcastSending} onClick={sendBroadcast}>
                {broadcastSending ? "Envoi en cours…" : "📤 Envoyer la notification"}
              </button>
            </div>
          </div>

          {/* Canaux disponibles */}
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>📡 Canaux de communication</h3>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:12 }}>
              {[
                { icon:"🔔", label:"Notifications in-app",  status:"Actif",       color:"#10b981" },
                { icon:"📧", label:"Email (Nodemailer)",    status:"À configurer", color:"#f59e0b" },
                { icon:"📱", label:"SMS",                   status:"Bientôt",     color:"#94a3b8" },
                { icon:"💬", label:"WhatsApp Business",     status:"Bientôt",     color:"#94a3b8" },
                { icon:"🌐", label:"Push Web (PWA)",        status:"Bientôt",     color:"#94a3b8" },
              ].map(c => (
                <div key={c.label} style={{ background:"#f8fafc", borderRadius:12, padding:"16px", border:"1.5px solid #e2e8f0" }}>
                  <div style={{ fontSize:"1.5rem", marginBottom:8 }}>{c.icon}</div>
                  <div style={{ fontWeight:700, fontSize:"0.88rem", color:"#0f1b3f", marginBottom:4 }}>{c.label}</div>
                  <Badge label={c.status} color={c.color} bg={c.color+"18"} />
                </div>
              ))}
            </div>
          </div>
        </div>
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
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>🧮 Coûts Import — Barèmes</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Configure le moteur de calcul du coût total d'importation (devis instantané côté acheteur). Montants en USD.</p>
            </div>
            <button className={styles.btnRefresh} onClick={loadImportCostData}>↻ Actualiser</button>
          </div>

          {/* ── Barèmes pays de destination ── */}
          <div className={styles.chartCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 className={styles.chartTitle} style={{ margin: 0 }}>🌍 Barèmes par pays de destination</h3>
              <button className={styles.btnApprove} style={{ fontSize: ".8rem" }}
                onClick={() => setCostConfigForm({
                  country: "", customsDutyPercent: 20, vatPercent: 18, transitFixedFeeUSD: 150,
                  redevancesFixedFeeUSD: 100, portFeesFixedUSD: 300, deliveryFixedFeeUSD: 200,
                  insurancePercent: 1, defaultSeaFreightUSD: 1200,
                  ageSurchargeThresholdYears: 8, ageSurchargePercent: 0, active: true,
                })}>+ Nouveau barème</button>
            </div>
            {importCostLoading ? (
              <div className={styles.loadingBox} style={{ minHeight: 80 }}><div className={styles.spinner} /></div>
            ) : costConfigs.length === 0 ? (
              <p style={{ textAlign: "center", color: "#94a3b8", padding: "20px 0" }}>Aucun barème configuré — le calculateur acheteur reste indisponible tant qu'aucun pays n'est configuré.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr><th>Pays</th><th>Douane</th><th>TVA</th><th>Transit</th><th>Redevances</th><th>Port</th><th>Livraison</th><th>Assurance</th><th>Fret défaut</th><th>Statut</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {costConfigs.map((c) => (
                      <tr key={c._id} className={styles.tr}>
                        <td style={{ fontWeight: 700 }}>{c.country}</td>
                        <td>{c.customsDutyPercent}%</td>
                        <td>{c.vatPercent}%</td>
                        <td>${c.transitFixedFeeUSD}</td>
                        <td>${c.redevancesFixedFeeUSD}</td>
                        <td>${c.portFeesFixedUSD}</td>
                        <td>${c.deliveryFixedFeeUSD}</td>
                        <td>{c.insurancePercent}%</td>
                        <td>${c.defaultSeaFreightUSD}</td>
                        <td><Badge label={c.active ? "Actif" : "Inactif"} color={c.active ? "#10b981" : "#94a3b8"} bg={c.active ? "#ecfdf5" : "#f1f5f9"} /></td>
                        <td>
                          <div className={styles.actionBtns}>
                            <button className={styles.btnGhost} style={{ fontSize: ".75rem" }} onClick={() => setCostConfigForm(c)}>✏️</button>
                            <button className={styles.btnDeleteSm} style={{ fontSize: ".75rem" }} onClick={() => deleteCostConfig(c._id)}>🗑️</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Liaisons de fret ── */}
          <div className={styles.chartCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 className={styles.chartTitle} style={{ margin: 0 }}>🚢 Liaisons de fret (origine → destination)</h3>
              <button className={styles.btnApprove} style={{ fontSize: ".8rem" }}
                onClick={() => setLaneForm({ sourceCountry: "", destCountry: "", seaFreightUSD: "", inlandTransportUSD: 150, carrier: "", estimatedDelayDays: "" })}>
                + Nouvelle liaison</button>
            </div>
            {laneRates.length === 0 ? (
              <p style={{ textAlign: "center", color: "#94a3b8", padding: "20px 0" }}>Aucune liaison configurée — le fret retombe sur l'estimation générique du pays de destination.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr><th>Origine</th><th>Destination</th><th>Fret maritime</th><th>Transport intérieur</th><th>Compagnie</th><th>Délai</th><th>Statut</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {laneRates.map((l) => (
                      <tr key={l._id} className={styles.tr}>
                        <td>{l.sourceCountry}</td>
                        <td>{l.destCountry}</td>
                        <td>${l.seaFreightUSD}</td>
                        <td>${l.inlandTransportUSD}</td>
                        <td>{l.carrier || "—"}</td>
                        <td>{l.estimatedDelayDays ? `${l.estimatedDelayDays} j` : "—"}</td>
                        <td><Badge label={l.active ? "Actif" : "Inactif"} color={l.active ? "#10b981" : "#94a3b8"} bg={l.active ? "#ecfdf5" : "#f1f5f9"} /></td>
                        <td>
                          <div className={styles.actionBtns}>
                            <button className={styles.btnGhost} style={{ fontSize: ".75rem" }} onClick={() => setLaneForm(l)}>✏️</button>
                            <button className={styles.btnDeleteSm} style={{ fontSize: ".75rem" }} onClick={() => deleteLaneRate(l._id)}>🗑️</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
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
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>💸 Reversements partenaire ({payoutsTotal})</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>
                Ce que VIT AUTO doit à chaque partenaire (généré automatiquement à la complétion d'une commande) — aucun virement n'est exécuté automatiquement, "Marquer payé" trace seulement qu'il a été fait manuellement (banque/mobile money).
              </p>
            </div>
            <button className={styles.btnRefresh} onClick={loadPayouts}>↻ Actualiser</button>
          </div>

          <div className={styles.filterBar} style={{ marginBottom: 16 }}>
            {["pending", "paid", ""].map((s) => (
              <button key={s || "all"}
                className={`${styles.filterBtn} ${payoutsFilter === s ? styles.filterActive : ""}`}
                onClick={() => setPayoutsFilter(s)}>
                {s === "pending" ? "En attente" : s === "paid" ? "Payés" : "Tous"}
              </button>
            ))}
          </div>

          {payoutsLoading ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Chargement…</div>
          ) : payoutsList.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Aucun reversement pour ce filtre.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Partenaire</th><th>Référence</th><th>Montant</th><th>Statut</th><th>Date</th><th>Actions</th></tr></thead>
                <tbody>
                  {payoutsList.map((p) => (
                    <tr key={p._id}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{p.partnerId?.firstName} {p.partnerId?.lastName}</div>
                        <div style={{ fontSize: ".78rem", color: "#64748b" }}>{p.partnerId?.email}</div>
                      </td>
                      <td style={{ fontSize: ".82rem" }}>{p.notes || p.transactionId}</td>
                      <td className={styles.tdPrice}>{fmtUSD(p.commissionAmount)}</td>
                      <td>
                        {p.status === "paid"
                          ? <Badge label="✅ Payé" color="#16a34a" bg="#dcfce7" />
                          : <Badge label="🕐 En attente" color="#d97706" bg="#fef3c7" />}
                        {p.status === "paid" && p.paidViaTxId && (
                          <div style={{ fontSize: ".72rem", color: "#94a3b8", marginTop: 2 }}>Réf : {p.paidViaTxId}</div>
                        )}
                      </td>
                      <td className={styles.tdDate}>{fmtDate(p.createdAt)}</td>
                      <td>
                        {p.status !== "paid" && (
                          <button disabled={payoutMarkingId === p._id} onClick={() => markPayoutPaid(p._id)}
                            style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: "#16a34a", color: "#fff", fontWeight: 700, fontSize: ".78rem", cursor: payoutMarkingId === p._id ? "not-allowed" : "pointer", opacity: payoutMarkingId === p._id ? 0.6 : 1 }}>
                            {payoutMarkingId === p._id ? "…" : "✅ Marquer payé"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
        <div className={styles.tabContent}>
          <PaymentsSection headers={headers} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f1b3f", margin: 0 }}>
              💳 Abonnements Pro & Mises en avant — confirmation de paiement
            </h2>
            <button className={styles.btnRefresh} onClick={loadSubRequests}>↻ Actualiser</button>
          </div>

          {/* ── Essai gratuit ────────────────────────────────────────────
              Un palier que personne n'a jamais vu fonctionner ne se vend pas.
              L'essai n'exige aucune plomberie de paiement : l'activation passe
              déjà par une confirmation manuelle. */}
          <div className={styles.chartCard} style={{ marginBottom: 20 }}>
            <h3 className={styles.chartTitle}>🎁 Accorder un essai gratuit de 30 jours</h3>
            <p style={{ margin: "0 0 12px", fontSize: ".83rem", color: "#64748b" }}>
              Un seul essai par compte, pour toujours. Refusé si le partenaire a déjà un abonnement actif.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ flex: "1 1 260px", position: "relative" }}>
                <input
                  value={essaiVendeur ? `${[essaiVendeur.firstName, essaiVendeur.lastName].filter(Boolean).join(" ")} — ${essaiVendeur.email || essaiVendeur.phone || ""}` : essaiRecherche}
                  onChange={(e) => chercherPartenaireEssai(e.target.value)}
                  placeholder="Rechercher un partenaire (nom ou e-mail)…"
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: ".88rem", boxSizing: "border-box" }}
                />
                {essaiResultats.length > 0 && !essaiVendeur && (
                  <ul style={{ position: "absolute", zIndex: 20, top: "100%", left: 0, right: 0, margin: "4px 0 0", padding: 0, listStyle: "none", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, boxShadow: "0 8px 24px rgba(15,27,63,.12)", maxHeight: 220, overflowY: "auto" }}>
                    {essaiResultats.map((u) => (
                      <li key={u._id}>
                        <button type="button"
                          onClick={() => { setEssaiVendeur(u); setEssaiResultats([]); }}
                          style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: "none", background: "none", cursor: "pointer", fontSize: ".85rem" }}>
                          {[u.firstName, u.lastName].filter(Boolean).join(" ")} — {u.email || u.phone || "sans contact"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <select value={essaiPalier} onChange={(e) => setEssaiPalier(e.target.value)}
                style={{ padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: ".88rem" }}>
                <option value="individuel_plus">Individuel Plus</option>
                <option value="business">Business</option>
                <option value="exportateur">Exportateur</option>
              </select>
              <button disabled={!essaiVendeur} onClick={accorderEssai}
                style={{ background: essaiVendeur ? "#16a34a" : "#cbd5e1", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", cursor: essaiVendeur ? "pointer" : "not-allowed", fontWeight: 700, fontSize: ".85rem" }}>
                Accorder l'essai
              </button>
            </div>
            {essaiRetour && (
              <p style={{ margin: "12px 0 0", fontSize: ".85rem", color: essaiRetour.ok ? "#16a34a" : "#dc2626" }}>
                {essaiRetour.message}
              </p>
            )}
          </div>

          {subLoading ? (
            <p style={{ color: "#64748b" }}>Chargement…</p>
          ) : subRequests.length === 0 ? (
            <p style={{ color: "#64748b" }}>Aucune demande en attente de confirmation.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {subRequests.map((sub) => {
                const pendingPayments = (sub.paymentHistory || []).filter((p) => p.status === "pending");
                const pendingBoosts   = (sub.boosts || []).filter((b) => !b.isActive);
                if (!pendingPayments.length && !pendingBoosts.length) return null;
                return (
                  <div key={sub._id} className={styles.chartCard}>
                    <h3 className={styles.chartTitle}>
                      {sub.vendor?.firstName} {sub.vendor?.lastName} — {sub.vendor?.email}
                    </h3>
                    {pendingPayments.map((p) => (
                      <div key={p._id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: "1px solid #f1f5f9", flexWrap: "wrap" }}>
                        <div style={{ fontSize: ".88rem" }}>
                          <strong>{PLAN_TIER_LABELS[p.planTier] || p.planTier}</strong> — {fmtUSD(p.amount)} · {p.method} · période {p.period}
                          {p.promoCode && <span style={{ marginLeft: 8, fontSize: ".72rem", fontWeight: 700, color: "#7c3aed", background: "#ede9fe", padding: "2px 8px", borderRadius: 6 }}>🎟️ {p.promoCode}</span>}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            className={styles.btnPrimary}
                            disabled={subActioning === `${sub._id}:${p._id}`}
                            onClick={() => subAction(`plan/${p._id}/approve`, sub._id, p._id)}
                          >✅ Confirmer le paiement</button>
                          <button
                            className={styles.btnDanger}
                            disabled={subActioning === `${sub._id}:${p._id}`}
                            onClick={() => subAction(`plan/${p._id}/reject`, sub._id, p._id)}
                          >❌ Rejeter</button>
                        </div>
                      </div>
                    ))}
                    {pendingBoosts.map((b) => (
                      <div key={b._id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: "1px solid #f1f5f9", flexWrap: "wrap" }}>
                        <div style={{ fontSize: ".88rem" }}>
                          <strong>Mise en avant ({b.tier})</strong> — véhicule #{String(b.vehicle).slice(-6)} · {fmtUSD(b.priceUSD)}
                          {b.promoCode && <span style={{ marginLeft: 8, fontSize: ".72rem", fontWeight: 700, color: "#7c3aed", background: "#ede9fe", padding: "2px 8px", borderRadius: 6 }}>🎟️ {b.promoCode}</span>}
                        </div>
                        <button
                          className={styles.btnPrimary}
                          disabled={subActioning === `${sub._id}:${b._id}`}
                          onClick={() => subAction(`boost/${b._id}/approve`, sub._id, b._id)}
                        >✅ Confirmer le paiement</button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          TAB AVIS CLIENTS — modération
      ══════════════════════════════════════════════════ */}
      {activeTab === "reviews" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f1b3f", margin: 0 }}>⭐ Avis clients — modération</h2>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select value={reviewsTargetType} onChange={(e) => setReviewsTargetType(e.target.value)} style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 12px", fontSize: ".85rem" }}>
                <option value="">Toutes les cibles</option>
                <option value="vehicle">Véhicule</option>
                <option value="driver">Chauffeur</option>
                <option value="partner">Agence</option>
                <option value="platform">Plateforme (VIT AUTO)</option>
                <option value="client">Client (fiabilité)</option>
              </select>
              <select value={reviewsFilter} onChange={(e) => setReviewsFilter(e.target.value)} style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 12px", fontSize: ".85rem" }}>
                <option value="">Tous les avis</option>
                <option value="true">Visibles</option>
                <option value="false">Masqués</option>
              </select>
              <button className={styles.btnRefresh} onClick={loadReviews}>↻ Actualiser</button>
            </div>
          </div>

          {reviewsTargetType === "platform" && platformReviewStats && (
            <div style={{ display: "flex", gap: 12, marginBottom: "1.5rem", flexWrap: "wrap" }}>
              <div className={styles.chartCard} style={{ flex: "1 1 160px" }}>
                <div style={{ fontSize: ".78rem", color: "#64748b", fontWeight: 700 }}>NOTE MOYENNE</div>
                <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "#0f1b3f" }}>★ {platformReviewStats.noteMoyenne}</div>
              </div>
              <div className={styles.chartCard} style={{ flex: "1 1 160px" }}>
                <div style={{ fontSize: ".78rem", color: "#64748b", fontWeight: 700 }}>TRANSACTIONS BIEN DÉROULÉES</div>
                <div style={{ fontSize: "1.6rem", fontWeight: 900, color: platformReviewStats.wentWellRate >= 80 ? "#059669" : platformReviewStats.wentWellRate >= 50 ? "#d97706" : "#dc2626" }}>
                  {platformReviewStats.wentWellRate != null ? `${platformReviewStats.wentWellRate}%` : "—"}
                </div>
              </div>
              <div className={styles.chartCard} style={{ flex: "1 1 160px" }}>
                <div style={{ fontSize: ".78rem", color: "#64748b", fontWeight: 700 }}>TOTAL AVIS</div>
                <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "#0f1b3f" }}>{platformReviewStats.total}</div>
              </div>
            </div>
          )}

          {reviewsLoading ? (
            <p style={{ color: "#64748b" }}>Chargement…</p>
          ) : reviewsList.length === 0 ? (
            <p style={{ color: "#64748b" }}>Aucun avis.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {reviewsList.map((r) => (
                <div key={r._id} className={styles.chartCard} style={{ opacity: r.visible ? 1 : 0.6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <strong>{"⭐".repeat(r.note)}</strong>{" "}
                      <span style={{ color: "#64748b", fontSize: ".85rem" }}>
                        — {r.targetType === "platform" ? "Plateforme VIT AUTO" : r.targetLabel || (r.targetType === "vehicle" ? "Véhicule" : r.targetType === "driver" ? "Chauffeur" : r.targetType === "partner" ? "Agence" : "Client")} · par {r.reviewer?.firstName} {r.reviewer?.lastName}
                      </span>
                      {r.targetType === "platform" && r.wentWell != null && (
                        <span style={{ marginLeft: 8, fontSize: ".78rem", fontWeight: 700, color: r.wentWell ? "#059669" : "#dc2626" }}>
                          {r.wentWell ? "👍 Bien déroulée" : "👎 Mal déroulée"}
                        </span>
                      )}
                      {!r.visible && <span style={{ marginLeft: 8, fontSize: ".72rem", color: "#ef4444", fontWeight: 700 }}>MASQUÉ</span>}
                      {r.commentaire && <p style={{ margin: "6px 0 0", fontSize: ".88rem", color: "#374151" }}>{r.commentaire}</p>}
                    </div>
                    <button
                      className={r.visible ? styles.btnDanger : styles.btnPrimary}
                      disabled={reviewActioning === r._id}
                      onClick={() => toggleReviewVisibility(r)}
                    >
                      {r.visible ? "🚫 Masquer" : "↺ Réafficher"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "system_health" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f1b3f", margin: 0 }}>🩺 Santé système</h2>
            <button className={styles.btnRefresh} onClick={loadSystemHealth}>↻ Actualiser</button>
          </div>

          {systemHealthLoading ? (
            <p style={{ color: "#64748b" }}>Chargement…</p>
          ) : !systemHealth ? (
            <p style={{ color: "#64748b" }}>Impossible de joindre /api/health.</p>
          ) : (
            <>
              <p style={{ color: "#64748b", fontSize: ".85rem", marginBottom: 16 }}>
                Statut global : <strong style={{ color: systemHealth.status === "healthy" ? "#059669" : "#dc2626" }}>{systemHealth.status}</strong>
                {" · "}Uptime : {Math.floor((systemHealth.uptime || 0) / 3600)}h{Math.floor(((systemHealth.uptime || 0) % 3600) / 60)}min
                {systemHealth.memory && ` · Mémoire : ${systemHealth.memory.used} / ${systemHealth.memory.total}`}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
                {Object.entries(systemHealth.services || {}).map(([name, value]) => {
                  const ok = ["connected", "ready", "resend", "smtp", "configured", true].includes(value);
                  const neutral = ["disabled", "sync-mode"].includes(value);
                  const color = ok ? "#059669" : neutral ? "#94a3b8" : "#dc2626";
                  const bg = ok ? "#f0fdf4" : neutral ? "#f8fafc" : "#fef2f2";
                  return (
                    <div key={name} className={styles.chartCard} style={{ background: bg, borderColor: color }}>
                      <div style={{ fontSize: ".72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>{name}</div>
                      <div style={{ fontSize: "1rem", fontWeight: 800, color }}>{String(value)}</div>
                    </div>
                  );
                })}
              </div>
              {systemHealth.integrations && (
                <div style={{ marginTop: "1.5rem" }}>
                  <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0f1b3f", margin: "0 0 4px" }}>🔌 Intégrations configurées en production</h3>
                  <p style={{ margin: "0 0 .75rem", fontSize: ".8rem", color: "#64748b" }}>Seuls les noms des variables manquantes sont affichés, jamais leurs valeurs. À compléter dans les variables d'environnement Render.</p>
                  <div style={{ overflowX: "auto" }}>
                    <table className={styles.table} style={{ width: "100%", fontSize: ".82rem" }}>
                      <thead><tr><th>Intégration</th><th>État</th><th>Variables manquantes</th></tr></thead>
                      <tbody>
                        {Object.entries(systemHealth.integrations).map(([nom, { etat, manquantes }]) => (
                          <tr key={nom}>
                            <td>{nom}</td>
                            <td style={{ fontWeight: 700, color: etat === "configuré" ? "#059669" : etat === "incomplet" ? "#d97706" : "#94a3b8" }}>{etat}</td>
                            <td style={{ fontFamily: "monospace", fontSize: ".75rem", overflowWrap: "anywhere" }}>{manquantes.join(", ") || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
          <MaintenanceSection headers={headers} />
        </div>
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
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>🎫 Demandes d'assistance</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>
                File ordonnée par échéance de première réponse.
                {ticketsEnRetard > 0 && <strong style={{ color: "#dc2626" }}> {ticketsEnRetard} demande{ticketsEnRetard > 1 ? "s" : ""} hors délai.</strong>}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select value={ticketsStatut} onChange={(e) => setTicketsStatut(e.target.value)}
                aria-label="Statut des demandes"
                style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 10px", fontSize: ".8rem", minHeight: 36 }}>
                <option value="">En cours</option>
                <option value="open">Ouvertes</option>
                <option value="in_progress">En traitement</option>
                <option value="waiting_user">En attente de l'utilisateur</option>
                <option value="resolved">Résolues</option>
                <option value="closed">Clôturées</option>
              </select>
              <button style={{ background: "#f1f5f9", color: "#0f1b3f", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontWeight: 700, fontSize: ".8rem" }}
                onClick={loadTickets}>↻ Actualiser</button>
            </div>
          </div>

          {tickets.length === 0 ? (
            <p style={{ color: "#64748b", fontSize: ".9rem" }}>Aucune demande en cours.</p>
          ) : (
            <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".85rem", background: "#fff" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["Objet", "Demandeur", "Formule", "Priorité", "Échéance", "État", ""].map((h) => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: "#475569", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr key={t._id} style={{ borderTop: "1px solid #f1f5f9", background: t.enRetard ? "#fef2f2" : undefined }}>
                      <td style={{ padding: "10px 12px" }}>{t.subject}</td>
                      <td style={{ padding: "10px 12px" }}>{[t.userId?.firstName, t.userId?.lastName].filter(Boolean).join(" ") || t.userId?.email || "—"}</td>
                      <td style={{ padding: "10px 12px" }}>{t.plan}</td>
                      <td style={{ padding: "10px 12px" }}>{t.priority}</td>
                      <td style={{ padding: "10px 12px", color: t.enRetard ? "#dc2626" : "#475569", fontWeight: t.enRetard ? 700 : 400 }}>
                        {t.slaDueAt ? new Date(t.slaDueAt).toLocaleString("fr-FR") : "—"}
                      </td>
                      <td style={{ padding: "10px 12px" }}>{t.status}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <button style={{ background: "#f1f5f9", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontWeight: 700, fontSize: ".78rem" }}
                          onClick={() => { setTicketOuvert(ticketOuvert?._id === t._id ? null : t); setTicketReponse(""); }}>
                          {ticketOuvert?._id === t._id ? "Fermer" : "Ouvrir"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {ticketOuvert && (
            <div style={{ marginTop: 20, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 18 }}>
              <h3 style={{ margin: "0 0 12px", fontSize: "1rem", color: "#0f1b3f" }}>{ticketOuvert.subject}</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                {(ticketOuvert.messages || []).map((m, i) => (
                  <div key={i} style={{ padding: "10px 14px", borderRadius: 10, maxWidth: "80%", alignSelf: m.isAdmin ? "flex-end" : "flex-start", background: m.isAdmin ? "#eff6ff" : "#f1f5f9" }}>
                    <strong style={{ fontSize: ".75rem", color: "#64748b" }}>{m.isAdmin ? "Support" : "Partenaire"}</strong>
                    <p style={{ margin: "4px 0 0", lineHeight: 1.55 }}>{m.content}</p>
                  </div>
                ))}
              </div>
              <textarea rows={4} value={ticketReponse} onChange={(e) => setTicketReponse(e.target.value)} placeholder="Votre réponse…"
                style={{ width: "100%", padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontFamily: "inherit", fontSize: ".9rem", boxSizing: "border-box", resize: "vertical" }} />
              <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <button style={{ background: "#f59e0b", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontWeight: 700, fontSize: ".85rem" }}
                  onClick={() => repondreTicket(ticketOuvert._id, ticketReponse)}>Répondre</button>
                <button style={{ background: "#fff", color: "#16a34a", border: "1.5px solid #bbf7d0", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontWeight: 700, fontSize: ".85rem" }}
                  onClick={() => changerStatutTicket(ticketOuvert._id, "resolved")}>Marquer résolue</button>
                <button style={{ background: "#fff", color: "#64748b", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontWeight: 700, fontSize: ".85rem" }}
                  onClick={() => changerStatutTicket(ticketOuvert._id, "closed")}>Clôturer</button>
              </div>
            </div>
          )}
        </div>
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
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>👁️ Chats Client↔Partenaire</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Supervision en lecture seule — aucun échange n'a lieu hors de la plateforme.</p>
            </div>
            <button style={{ background: "#f1f5f9", color: "#0f1b3f", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontWeight: 700, fontSize: ".8rem" }}
              onClick={loadClientPartnerChats}>↻ Actualiser</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 340px) 1fr", gap: 16, minHeight: 480, alignItems: "stretch" }}>
            <div style={{ border: "1.5px solid #e2e8f0", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", background: "#fff" }}>
              <div style={{ padding: "10px 14px", borderBottom: "1.5px solid #e2e8f0", fontSize: ".78rem", fontWeight: 700, color: "#64748b" }}>
                {cpChats.length} conversation{cpChats.length > 1 ? "s" : ""}
              </div>
              <div style={{ overflowY: "auto", flex: 1, maxHeight: 520 }}>
                {cpChatsLoading && cpChats.length === 0 ? (
                  <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: ".85rem" }}>Chargement…</div>
                ) : cpChats.length === 0 ? (
                  <div style={{ padding: 24, textAlign: "center", color: "#94a3b8" }}>
                    <div style={{ fontSize: "2rem", marginBottom: 8 }}>👁️</div>
                    <p style={{ fontSize: ".85rem", fontWeight: 600 }}>Aucune conversation client↔partenaire.</p>
                  </div>
                ) : cpChats.map((c) => {
                  const isActive = cpActive?._id === c._id;
                  return (
                    <div key={c._id} onClick={() => openClientPartnerChat(c)}
                      style={{ padding: "11px 14px", cursor: "pointer", background: isActive ? "#eff6ff" : "#fff", borderBottom: "1px solid #f1f5f9" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                        <strong style={{ fontSize: ".85rem", color: "#0f1b3f" }}>
                          {c.client?.firstName} {c.client?.lastName} ↔ {c.partner?.firstName} {c.partner?.lastName}
                        </strong>
                        <span style={{ fontSize: ".7rem", color: "#94a3b8", flexShrink: 0 }}>{timeAgo(c.lastMessageAt)}</span>
                      </div>
                      <div style={{ fontSize: ".76rem", color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.booking?.reference ? `${c.booking.reference} · ` : ""}{c.lastMessage || "Conversation ouverte"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ border: "1.5px solid #e2e8f0", borderRadius: 12, display: "flex", flexDirection: "column", background: "#fff", overflow: "hidden" }}>
              {!cpActive ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: "2.4rem" }}>👁️</div>
                  <p style={{ fontSize: ".85rem", fontWeight: 600 }}>Sélectionnez une conversation à superviser.</p>
                </div>
              ) : (
                <>
                  <div style={{ padding: "12px 16px", borderBottom: "1.5px solid #e2e8f0", fontWeight: 700, color: "#0f1b3f", fontSize: ".9rem" }}>
                    {cpActive.client?.firstName} {cpActive.client?.lastName} ↔ {cpActive.partner?.firstName} {cpActive.partner?.lastName}
                  </div>
                  <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10, maxHeight: 420 }}>
                    {cpMsgLoading ? (
                      <div style={{ textAlign: "center", color: "#94a3b8", fontSize: ".85rem" }}>Chargement…</div>
                    ) : cpMessages.length === 0 ? (
                      <div style={{ textAlign: "center", color: "#94a3b8", fontSize: ".85rem" }}>Aucun message pour l'instant.</div>
                    ) : cpMessages.map((m) => {
                      const isPartnerMsg = m.senderRole !== "client";
                      return (
                        <div key={m._id} style={{ alignSelf: isPartnerMsg ? "flex-end" : "flex-start", maxWidth: "72%" }}>
                          <div style={{
                            padding: "8px 12px", borderRadius: 12,
                            background: isPartnerMsg ? "#0f1b3f" : "#f1f5f9",
                            color: isPartnerMsg ? "#fff" : "#0f1b3f",
                            fontSize: ".85rem", whiteSpace: "pre-wrap", wordBreak: "break-word",
                          }}>
                            {m.content}
                          </div>
                          <div style={{ fontSize: ".68rem", color: "#94a3b8", marginTop: 3, textAlign: isPartnerMsg ? "right" : "left" }}>
                            {m.sender?.firstName} · {timeAgo(m.createdAt)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "reports" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>🚩 Signalements</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Signalements envoyés par les utilisateurs sur des annonces, avis ou profils.</p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <select value={reportFilter} onChange={(e) => setReportFilter(e.target.value)}
                style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".82rem" }}>
                <option value="">Tous</option>
                <option value="en_attente">En attente</option>
                <option value="examine">Examiné</option>
                <option value="classe_sans_suite">Classé sans suite</option>
                <option value="action_prise">Action prise</option>
              </select>
              <button className={styles.btnRefresh} onClick={loadReports}>↻ Actualiser</button>
            </div>
          </div>
          {reportsLoading ? (
            <div className={styles.loadingBox}><div className={styles.spinner} /></div>
          ) : (() => {
            const filtered = reportFilter ? reports.filter((r) => r.status === reportFilter) : reports;
            const STATUS_CFG = {
              en_attente:         { label: "En attente",         color: "#d97706", bg: "#fffbeb" },
              examine:            { label: "Examiné",            color: "#2563eb", bg: "#eff6ff" },
              classe_sans_suite:  { label: "Classé sans suite",  color: "#94a3b8", bg: "#f1f5f9" },
              action_prise:       { label: "Action prise",       color: "#059669", bg: "#ecfdf5" },
            };
            const REASON_LABELS = {
              fraude: "Fraude / arnaque", contenu_inapproprie: "Contenu inapproprié",
              annonce_fausse: "Annonce fausse", contenu_illicite: "Contenu illicite",
              harcelement: "Harcèlement", autre: "Autre",
            };
            return filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
                <div style={{ fontSize: "3rem", marginBottom: 12 }}>🚩</div>
                <p style={{ fontWeight: 600 }}>Aucun signalement pour ce filtre.</p>
              </div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr><th>Cible</th><th>Motif</th><th>Description</th><th>Par</th><th>Statut</th><th>Date</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => {
                      const sc = STATUS_CFG[r.status] || STATUS_CFG.en_attente;
                      return (
                        <tr key={r._id} className={styles.tr}>
                          <td style={{ fontSize: ".82rem" }}>{r.targetType} <span style={{ color: "#94a3b8", fontFamily: "monospace", fontSize: ".72rem" }}>{r.targetId}</span></td>
                          <td style={{ fontSize: ".82rem" }}>{REASON_LABELS[r.reason] || r.reason}</td>
                          <td style={{ fontSize: ".8rem", maxWidth: 240 }}>{r.description || "—"}</td>
                          <td style={{ fontSize: ".82rem" }}>{r.reporter?.firstName} {r.reporter?.lastName}</td>
                          <td><Badge label={sc.label} color={sc.color} bg={sc.bg} /></td>
                          <td className={styles.tdDate}>{fmtDate(r.createdAt)}</td>
                          <td>
                            <div className={styles.actionBtns}>
                              {r.status === "en_attente" && (
                                <>
                                  <button className={styles.btnApprove} style={{ fontSize: ".72rem" }} onClick={() => decideReport(r._id, "action_prise")}>Action prise</button>
                                  <button className={styles.btnGhost} style={{ fontSize: ".72rem" }} onClick={() => decideReport(r._id, "classe_sans_suite")}>Classer sans suite</button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      )}
      {activeTab === "whatsapp" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>💬 Bot WhatsApp partenaires</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Claude répond automatiquement aux prospects/partenaires sur WhatsApp. Conversations transférées à un humain ci-dessous.</p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <select value={waFilter} onChange={(e) => setWaFilter(e.target.value)}
                style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".82rem" }}>
                <option value="escalated">À reprendre</option>
                <option value="bot">Gérées par le bot</option>
                <option value="closed">Clôturées</option>
                <option value="">Toutes</option>
              </select>
              <button className={styles.btnRefresh} onClick={loadWaConversations}>↻ Actualiser</button>
            </div>
          </div>

          {waLoading ? (
            <div className={styles.loadingBox}><div className={styles.spinner} /></div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: waActive ? "320px 1fr" : "1fr", gap: 20, alignItems: "start" }}>
              {/* Liste des conversations */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {waConversations.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
                    <div style={{ fontSize: "3rem", marginBottom: 12 }}>💬</div>
                    <p style={{ fontWeight: 600 }}>Aucune conversation pour ce filtre.</p>
                  </div>
                ) : waConversations.map((c) => (
                  <div key={c._id} onClick={() => openWaConversation(c)}
                    style={{
                      cursor: "pointer", padding: "12px 14px", borderRadius: 10,
                      border: `1.5px solid ${waActive?._id === c._id ? "#0f1b3f" : "#e2e8f0"}`,
                      background: waActive?._id === c._id ? "#f8fafc" : "#fff",
                    }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong style={{ fontSize: ".88rem", color: "#0f1b3f" }}>{c.contactName || c.phone}</strong>
                      <Badge
                        label={{ bot: "🤖 Bot", escalated: "🚩 À reprendre", closed: "Clôturée" }[c.status]}
                        color={c.status === "escalated" ? "#dc2626" : c.status === "bot" ? "#059669" : "#94a3b8"}
                        bg={c.status === "escalated" ? "#fee2e2" : c.status === "bot" ? "#ecfdf5" : "#f1f5f9"}
                      />
                    </div>
                    <p style={{ margin: "4px 0 0", fontSize: ".78rem", color: "#64748b" }}>{c.phone}</p>
                    {c.escalationReason && <p style={{ margin: "2px 0 0", fontSize: ".75rem", color: "#dc2626" }}>{c.escalationReason}</p>}
                    <p style={{ margin: "4px 0 0", fontSize: ".72rem", color: "#94a3b8" }}>{fmtDate(c.lastMessageAt)}</p>
                  </div>
                ))}
              </div>

              {/* Thread + réponse */}
              {waActive && (
                <div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <strong style={{ color: "#0f1b3f" }}>{waActive.contactName || waActive.phone}</strong>
                      <span style={{ marginLeft: 8, fontSize: ".78rem", color: "#64748b" }}>{waActive.phone}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {waActive.status !== "bot" && (
                        <button className={styles.btnGhost} style={{ fontSize: ".76rem" }} onClick={() => waSetStatus(waActive._id, "bot")}>Rendre au bot</button>
                      )}
                      {waActive.status !== "closed" && (
                        <button className={styles.btnGhost} style={{ fontSize: ".76rem" }} onClick={() => waSetStatus(waActive._id, "closed")}>Clôturer</button>
                      )}
                    </div>
                  </div>

                  <div style={{ maxHeight: 420, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: "8px 0" }}>
                    {waActive.messages.map((m, i) => (
                      <div key={i} style={{
                        alignSelf: m.role === "user" ? "flex-start" : "flex-end",
                        maxWidth: "75%", padding: "8px 12px", borderRadius: 10, fontSize: ".85rem",
                        background: m.role === "user" ? "#f1f5f9" : m.role === "admin" ? "#0f1b3f" : "#eff6ff",
                        color: m.role === "admin" ? "#fff" : "#0f172a",
                      }}>
                        {m.role !== "user" && (
                          <div style={{ fontSize: ".68rem", fontWeight: 700, opacity: 0.7, marginBottom: 2 }}>
                            {m.role === "admin" ? "Vous (admin)" : "🤖 Bot"}
                          </div>
                        )}
                        {m.content}
                      </div>
                    ))}
                  </div>

                  {waActive.status !== "closed" && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <input value={waReply} onChange={(e) => setWaReply(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && sendWaReply()}
                        placeholder="Répondre au partenaire..."
                        style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }} />
                      <button className={styles.btnApprove} onClick={sendWaReply} disabled={!waReply.trim()}>Envoyer</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {activeTab === "email_delivery" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>📧 Emails & Livraison</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>
                Suivi réel des envois (Resend) — LOI, Accords, factures, confirmations... Un email "envoyé" n'est confirmé "livré" que via le webhook Resend
                (ou l'ouverture du message) ; "Rejeté/Signalé spam" signifie que le serveur destinataire a explicitement refusé l'email.
              </p>
            </div>
            <button className={styles.btnRefresh} onClick={loadEmailDelivery}>↻ Actualiser</button>
          </div>

          {emailDeliveryLoading ? (
            <div className={styles.loadingBox}><div className={styles.spinner} /></div>
          ) : (
            <>
              <div style={{ background: "#fffbeb", border: "1.5px solid #fcd34d", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: ".82rem", color: "#92400e" }}>
                ⚠️ Si "Rejetés/Signalés spam" reste élevé : vérifiez dans le dashboard Resend (Domains) que <code>vit-auto.com</code> est bien "Verified"
                (SPF/DKIM/DMARC) — un domaine non vérifié fait rejeter une grande partie des emails par Gmail/Outlook. Le webhook Resend doit aussi être
                configuré (Webhooks → email.delivered/bounced/complained/delivery_delayed → <code>RESEND_WEBHOOK_SECRET</code> côté serveur) pour que ce
                tableau reflète la réalité plutôt que de rester bloqué sur "Envoyé".
              </div>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
                <StatCard icon="📤" label="Envoyés (email)" value={emailStats?.email?.totalSent || 0} color="#6366f1" />
                <StatCard icon="✅" label="Livrés/Ouverts" value={emailStats?.email?.totalOpened || 0} sub={`${emailStats?.email?.openRate || 0}% de taux d'ouverture`} color="#10b981" />
                <StatCard icon="🚫" label="Rejetés / Signalés spam" value={(emailStats?.byStatus?.bounced || 0) + (emailStats?.byStatus?.complained || 0)} color="#ef4444" />
                <StatCard icon="⚠️" label="Échecs immédiats" value={emailStats?.byStatus?.failed || 0} color="#f59e0b" />
              </div>

              <h3 style={{ fontSize: ".95rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 10px" }}>Envois en échec récents</h3>
              {emailFailures.length === 0 ? (
                <div style={{ textAlign: "center", padding: "20px 0", color: "#94a3b8" }}>
                  <p style={{ margin: 0 }}>Aucun échec/bounce enregistré récemment.</p>
                </div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Destinataire</th>
                        <th>Type de document</th>
                        <th>Statut</th>
                        <th>Raison</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {emailFailures.map((f) => {
                        const stCfg = {
                          bounced:    { label: "Rejeté",        color: "#ef4444", bg: "#fef2f2" },
                          complained: { label: "Signalé spam",  color: "#dc2626", bg: "#fef2f2" },
                          failed:     { label: "Échec immédiat", color: "#f59e0b", bg: "#fffbeb" },
                        }[f.status] || { label: f.status, color: "#94a3b8", bg: "#f8fafc" };
                        return (
                          <tr key={f._id} className={styles.tr}>
                            <td style={{ fontSize: ".82rem" }}>
                              {f.to}
                              {f.userId && <span className={styles.vehMeta}>{f.userId.firstName} {f.userId.lastName}</span>}
                            </td>
                            <td style={{ fontSize: ".82rem" }}>{f.template || f.subject || "—"}</td>
                            <td><Badge label={stCfg.label} color={stCfg.color} bg={stCfg.bg} /></td>
                            <td style={{ fontSize: ".78rem", color: "#64748b", maxWidth: 320 }}>{f.errorMessage || "—"}</td>
                            <td className={styles.tdDate}>{fmtDate(f.createdAt)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
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
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f1b3f", margin: 0 }}>📑 Contrats de réservation</h2>
            <button className={styles.btnRefresh} onClick={loadContracts}>↻ Actualiser</button>
          </div>

          {contractsLoading ? (
            <p style={{ color: "#64748b" }}>Chargement…</p>
          ) : contracts.length === 0 ? (
            <p style={{ color: "#64748b" }}>Aucun contrat émis pour l'instant.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Client</th>
                    <th>Partenaire</th>
                    <th>Réservation</th>
                    <th>Montant</th>
                    <th>Signature</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((ct) => (
                    <tr key={ct._id} className={styles.tr}>
                      <td style={{ fontSize: ".8rem", fontWeight: 700, whiteSpace: "nowrap" }}>{ct.contractNumber || `#${String(ct._id).slice(-6)}`}</td>
                      <td style={{ fontSize: ".8rem", whiteSpace: "nowrap" }}>{ct.createdAt ? new Date(ct.createdAt).toLocaleDateString("fr-FR") : "—"}</td>
                      <td style={{ fontSize: ".8rem" }}>{ct.type || "—"}</td>
                      <td style={{ fontSize: ".8rem" }}>{`${ct.client?.firstName || ""} ${ct.client?.lastName || ""}`.trim() || ct.client?.email || "—"}</td>
                      <td style={{ fontSize: ".8rem" }}>{ct.vendor?.name || "—"}</td>
                      <td style={{ fontSize: ".8rem" }}>{ct.booking?.reference || "—"}</td>
                      {/* Montant affiché dans la devise PROPRE du contrat : les
                          contrats antérieurs à la refonte du modèle économique
                          sont en XOF, les suivants en USD (voir Contract.currency).
                          Les convertir ici afficherait un montant qui ne
                          correspond plus à la pièce signée. */}
                      <td style={{ fontSize: ".8rem", whiteSpace: "nowrap" }}>
                        {ct.terms?.totalXOF != null
                          ? `${Number(ct.terms.totalXOF).toLocaleString("fr-FR")} ${ct.currency || "USD"}`
                          : "—"}
                      </td>
                      <td style={{ fontSize: ".8rem", whiteSpace: "nowrap" }}>
                        {ct.isSigned
                          ? <span style={{ color: "#10b981", fontWeight: 700 }}>✅ {ct.signedAt ? new Date(ct.signedAt).toLocaleDateString("fr-FR") : ""}</span>
                          : <span style={{ color: "#94a3b8" }}>Non signé</span>}
                      </td>
                      <td><span className={styles.badge}>{ct.status || "—"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "audit" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f1b3f", margin: 0 }}>📜 Journal d'audit</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select value={auditFilter.action} onChange={(e) => setAuditFilter((f) => ({ ...f, action: e.target.value }))} style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 12px", fontSize: ".85rem" }}>
                <option value="">Toutes les actions</option>
                {auditFacets.actions.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <select value={auditFilter.resource} onChange={(e) => setAuditFilter((f) => ({ ...f, resource: e.target.value }))} style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 12px", fontSize: ".85rem" }}>
                <option value="">Toutes les ressources</option>
                {auditFacets.resources.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <select value={auditFilter.success} onChange={(e) => setAuditFilter((f) => ({ ...f, success: e.target.value }))} style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 12px", fontSize: ".85rem" }}>
                <option value="">Tous résultats</option>
                <option value="true">Succès</option>
                <option value="false">Échec</option>
              </select>
              <button className={styles.btnRefresh} onClick={loadAuditLog}>↻ Actualiser</button>
            </div>
          </div>

          {auditLoading ? (
            <p style={{ color: "#64748b" }}>Chargement…</p>
          ) : auditEntries.length === 0 ? (
            <p style={{ color: "#64748b" }}>Aucune entrée trouvée.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Admin</th>
                    <th>Action</th>
                    <th>Ressource</th>
                    <th>Résultat</th>
                  </tr>
                </thead>
                <tbody>
                  {auditEntries.map((e) => (
                    <tr key={e._id} className={styles.tr}>
                      <td style={{ fontSize: ".8rem", whiteSpace: "nowrap" }}>{new Date(e.createdAt).toLocaleString("fr-FR")}</td>
                      <td style={{ fontSize: ".8rem" }}>{e.userEmail || "—"} <span style={{ color: "#94a3b8" }}>({e.userRole})</span></td>
                      <td style={{ fontSize: ".8rem", fontWeight: 600 }}>{e.action}</td>
                      <td style={{ fontSize: ".8rem" }}>{e.resource}{e.resourceId ? ` #${String(e.resourceId).slice(-6)}` : ""}</td>
                      <td>
                        {e.success
                          ? <span style={{ color: "#10b981", fontSize: ".8rem", fontWeight: 700 }}>✅</span>
                          : <span style={{ color: "#ef4444", fontSize: ".8rem", fontWeight: 700 }} title={e.errorMessage || ""}>❌</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

        </div>
      </div>
    </div>
  );
}
