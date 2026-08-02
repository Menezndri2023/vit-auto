import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useVehicles } from "../context/VehicleContext";
import { useCurrency } from "../context/CurrencyContext";
import { COUNTRIES_ALL, CURRENCIES as IE_CURRENCIES, getCountryFlag } from "../data/autocomplete";
import { useToast } from "../context/ToastContext";
import { useSocket } from "../context/SocketContext";
import { useChat } from "../context/ChatContext";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { SUBSCRIPTIONS_ENABLED } from "../config/featureFlags";
import PartnerCalendar from "../components/PartnerCalendar/PartnerCalendar";
import PartnerBusinessManager from "../components/PartnerBusinessManager/PartnerBusinessManager";
import { geocodeAddress } from "../utils/geo";
import { PARTNER_CANCEL_REASONS } from "../constants/bookingCancelReasons";
import styles from "./VendorDashboard.module.css";

/* ── Utilitaires ────────────────────────────────────────────────────────── */
// fmtXOF n'existe plus en tant que constante module — chaque composant qui en
// a besoin l'obtient via useCurrency().fmt (alias fmtUSD, voir CurrencyContext.jsx)
// puisque Vehicle/Booking/Driver sont désormais stockés en USD (migration Phase 2).
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtDateTime = (d) => d ? new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

// Repli si /api/pricing/config n'a pas encore répondu — valeurs par défaut de
// PricingConfig (server/config/defaultPricingConfig.js), remplacées dès que
// commissionRates est chargé pour ne jamais afficher un taux périmé si
// l'admin modifie les commissions depuis le panneau Configuration métier.
const DEFAULT_COMM_RATE = { location: 0.15, essai: 0.03, chauffeur: 0.10, leasing: 0.05 };
const SERVICE_FEE = 1; // repli d'affichage — le vrai frais est calculé côté serveur (pricingEngine.computeServiceFee, plancher 1 USD)

const MOIS = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];


/* ── Config statuts de réservation ────────────────────────────────────────── */
const BS = {
  "À confirmer":             { label: "Nouvelle",             color: "#d97706", bg: "#fef3c7", dot: "#f59e0b" },
  pending:                   { label: "Nouvelle",             color: "#d97706", bg: "#fef3c7", dot: "#f59e0b" },
  confirmed:                 { label: "Acceptée",             color: "#059669", bg: "#d1fae5", dot: "#10b981" },
  preparing:                 { label: "En préparation",       color: "#0891b2", bg: "#e0f2fe", dot: "#06b6d4" },
  ready:                     { label: "Prête",                color: "#7c3aed", bg: "#ede9fe", dot: "#8b5cf6" },
  in_progress:               { label: "En route",             color: "#2563eb", bg: "#dbeafe", dot: "#3b82f6" },
  client_arrived:            { label: "Client présent",       color: "#0284c7", bg: "#e0f2fe", dot: "#0ea5e9" },
  client_absent:             { label: "Client absent",        color: "#dc2626", bg: "#fee2e2", dot: "#ef4444" },
  transaction_concluded:     { label: "Transaction",          color: "#059669", bg: "#dcfce7", dot: "#22c55e" },
  transaction_not_concluded: { label: "Non conclue",          color: "#9ca3af", bg: "#f3f4f6", dot: "#d1d5db" },
  waiting_client_validation: { label: "Validation client",   color: "#b45309", bg: "#fef3c7", dot: "#f59e0b" },
  completed:                 { label: "Terminée",             color: "#475569", bg: "#f1f5f9", dot: "#94a3b8" },
  cancelled:                 { label: "Annulée",              color: "#dc2626", bg: "#fee2e2", dot: "#ef4444" },
  disputed:                  { label: "Litige",               color: "#dc2626", bg: "#fee2e2", dot: "#ef4444" },
};

/* ── Config KYC ────────────────────────────────────────────────────────────── */
const KYC_CFG = {
  VERIFIE:               { label: "KYC Vérifié",       color: "#059669", bg: "#d1fae5", icon: "✅" },
  EN_ATTENTE:            { label: "KYC En attente",    color: "#d97706", bg: "#fef3c7", icon: "⏳" },
  A_REVOIR_MANUELLEMENT: { label: "KYC En révision",   color: "#2563eb", bg: "#dbeafe", icon: "🔍" },
  REFUSE:                { label: "KYC Refusé",        color: "#dc2626", bg: "#fee2e2", icon: "❌" },
};

const PAY_LABELS = {
  cash: "Espèces", card: "Carte bancaire", orange_money: "Orange Money",
  wave: "Wave", mtn: "MTN Money", moov: "Moov Money", paypal: "PayPal", virement: "Virement",
};

/* ══════════════════════════════════════════════════════════════════════════════
   PHOTO THUMB — miniature cliquable pour zoom plein écran
   ══════════════════════════════════════════════════════════════════════════════ */
function PhotoThumb({ src, label }) {
  const [open, setOpen] = useState(false);
  if (!src) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", width:80, height:72, borderRadius:8, border:"1.5px dashed #cbd5e1", background:"#f8fafc", color:"#94a3b8", fontSize:".68rem", gap:3, flexShrink:0 }}>
      <span style={{ fontSize:"1.2rem" }}>📄</span><span>{label}</span>
    </div>
  );
  return (
    <>
      <div onClick={() => setOpen(true)} style={{ position:"relative", width:80, height:72, borderRadius:8, overflow:"hidden", cursor:"zoom-in", border:"1.5px solid #e2e8f0", flexShrink:0 }}>
        <img src={src} alt={label} style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
        <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,.35)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:".65rem", fontWeight:700, opacity:0, transition:"opacity .15s" }}
          onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=0}>🔍 Zoom</div>
        <div style={{ position:"absolute", bottom:0, left:0, right:0, background:"rgba(0,0,0,.55)", color:"#fff", fontSize:".6rem", padding:"2px 4px", textAlign:"center" }}>{label}</div>
      </div>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.8)", zIndex:99999, display:"flex", alignItems:"center", justifyContent:"center", animation:"fadeIn .15s" }}>
          <div onClick={e=>e.stopPropagation()} style={{ position:"relative", maxWidth:"92vw", maxHeight:"90vh", background:"#fff", borderRadius:14, overflow:"hidden" }}>
            <button onClick={() => setOpen(false)} style={{ position:"absolute", top:8, right:8, background:"rgba(0,0,0,.6)", color:"#fff", border:"none", borderRadius:"50%", width:32, height:32, fontSize:"1rem", cursor:"pointer", zIndex:2 }}>✕</button>
            <img src={src} alt={label} style={{ maxWidth:"88vw", maxHeight:"82vh", objectFit:"contain", display:"block" }} />
            <div style={{ padding:"8px 16px", textAlign:"center", fontSize:".82rem", fontWeight:700, color:"#64748b" }}>{label}</div>
          </div>
        </div>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   CONFIGURATION WORKFLOWS PAR TYPE DE COMMANDE VIT-AUTO
   ══════════════════════════════════════════════════════════════════════════════ */

const getOrderSubType = (order) => {
  if (order.vehicleMode === "Import/Export" || order.mode === "Import/Export") return "import_export";
  if (order.type === "leasing")   return "leasing";
  if (order.type === "chauffeur") return "chauffeur";
  if (order.type === "essai")     return "vente";
  if (order.type === "location") {
    // Priorité : pickupMethod persisté en DB → GPS présent → absence de "Retrait" dans l'adresse
    const pm = order.pickupMethod || order.location?.pickupMethod;
    const isDelivery = pm === "livraison"
      || (pm == null && order.pickupLat != null)
      || (pm == null && order.pickupAddress && !order.pickupAddress.startsWith("Retrait")
          && !!(order.pickupAddress || order.pickupLocation));
    return isDelivery ? "location_domicile" : "location_agence";
  }
  return "location_agence";
};

const ORDER_WORKFLOWS = {
  location_agence: {
    badge: "📅 Location · À l'agence", color: "#6366f1",
    steps: [
      { s:"confirmed",    l:"Acceptée",          i:"✓",  c:"#059669", desc:"Réservation confirmée" },
      { s:"preparing",    l:"Préparation",        i:"⚙️", c:"#0891b2", desc:"Véhicule en cours de préparation" },
      { s:"ready",        l:"Prêt à l'agence",   i:"🏢", c:"#7c3aed", desc:"Véhicule prêt, client attendu" },
      { s:"client_arrived",l:"Client présent",   i:"🤝", c:"#0284c7", desc:"Client arrivé à l'agence" },
      { s:"waiting_client_validation",l:"Transaction",i:"💰",c:"#b45309",desc:"Validation transaction" },
      { s:"completed",    l:"Terminée",           i:"🏁", c:"#475569", desc:"Location terminée avec succès" },
    ],
    nextBtn: {
      confirmed: { fn:"onPrepare",       label:"Commencer la préparation", icon:"⚙️" },
      preparing: { fn:"onReady",         label:"Véhicule prêt à l'agence", icon:"🏢" },
      ready:     { fn:"onClientArrived", label:"Client arrivé à l'agence", icon:"🤝" },
    },
    rdvAtStatus: null,
  },
  location_domicile: {
    badge: "📅 Location · Livraison domicile", color: "#2563eb",
    steps: [
      { s:"confirmed",    l:"Acceptée",       i:"✓",  c:"#059669", desc:"Réservation confirmée" },
      { s:"preparing",    l:"Préparation",    i:"⚙️", c:"#0891b2", desc:"Préparation du véhicule" },
      { s:"ready",        l:"Prêt",           i:"✅", c:"#7c3aed", desc:"Véhicule prêt pour livraison" },
      { s:"in_progress",  l:"En livraison",   i:"🚚", c:"#2563eb", desc:"En route vers le client" },
      { s:"client_arrived",l:"Livré",         i:"📍", c:"#0284c7", desc:"Arrivée chez le client" },
      { s:"waiting_client_validation",l:"Transaction",i:"💰",c:"#b45309",desc:"Remise véhicule + transaction" },
      { s:"completed",    l:"Terminée",       i:"🏁", c:"#475569", desc:"Location terminée avec succès" },
    ],
    nextBtn: {
      confirmed: { fn:"onPrepare",    label:"Commencer la préparation",   icon:"⚙️" },
      preparing: { fn:"onReady",      label:"Véhicule prêt à partir",     icon:"✅" },
      ready:     { fn:"onInProgress", label:"Partir en livraison",        icon:"🚚" },
    },
    rdvAtStatus: "in_progress",
    rdvLabel: "Êtes-vous arrivé chez le client ?",
    rdvPresentLabel: "Arrivé — Remise du véhicule",
    rdvAbsentLabel: "Client introuvable",
  },
  vente: {
    badge: "🔑 Essai / Vente", color: "#059669",
    steps: [
      { s:"confirmed",    l:"RDV confirmé",     i:"📅", c:"#059669", desc:"Rendez-vous fixé" },
      { s:"in_progress",  l:"Essai en cours",   i:"🚗", c:"#2563eb", desc:"Le client teste le véhicule" },
      { s:"client_arrived",l:"Négociation",     i:"🤝", c:"#0284c7", desc:"Discussion sur la vente" },
      { s:"waiting_client_validation",l:"Conclusion",i:"💰",c:"#b45309",desc:"Finalisation de la transaction" },
      { s:"completed",    l:"Vente conclue",    i:"🏁", c:"#059669", desc:"Vente finalisée avec succès" },
    ],
    nextBtn: {
      confirmed: { fn:"onInProgress", label:"Démarrer l'essai", icon:"🚗" },
    },
    rdvAtStatus: "in_progress",
    rdvLabel: "L'essai est-il terminé ?",
    rdvPresentLabel: "Essai terminé — Passer à la négociation",
    rdvAbsentLabel: "Client ne s'est pas présenté",
  },
  chauffeur: {
    badge: "🧑‍✈️ Service Chauffeur", color: "#7c3aed",
    steps: [
      { s:"confirmed",    l:"Mission acceptée",  i:"✓",   c:"#059669", desc:"Mission confirmée" },
      { s:"preparing",    l:"En route client",   i:"🚀",  c:"#0891b2", desc:"Chauffeur en route vers le client" },
      { s:"in_progress",  l:"Mission active",    i:"🧑‍✈️", c:"#2563eb", desc:"Transport en cours" },
      { s:"client_arrived",l:"Destination",      i:"📍",  c:"#0284c7", desc:"Destination atteinte" },
      { s:"waiting_client_validation",l:"Transaction",i:"💰",c:"#b45309",desc:"Validation de la mission" },
      { s:"completed",    l:"Mission terminée",  i:"🏁",  c:"#475569", desc:"Mission accomplie" },
    ],
    nextBtn: {
      confirmed: { fn:"onPrepare",    label:"Chauffeur en route vers le client", icon:"🚀" },
      preparing: { fn:"onInProgress", label:"Prise en charge du client",         icon:"🧑‍✈️" },
    },
    rdvAtStatus: "in_progress",
    rdvLabel: "La destination est-elle atteinte ?",
    rdvPresentLabel: "Destination atteinte",
    rdvAbsentLabel: "Mission annulée",
  },
  leasing: {
    badge: "📊 Leasing", color: "#d97706",
    steps: [
      { s:"confirmed",    l:"Dossier accepté",      i:"✓",  c:"#059669", desc:"Dossier de leasing accepté" },
      { s:"preparing",    l:"Étude financière",     i:"📊", c:"#0891b2", desc:"Analyse du dossier financier" },
      { s:"ready",        l:"Contrat prêt",         i:"📄", c:"#7c3aed", desc:"Contrat prêt à signer" },
      { s:"client_arrived",l:"Signature client",    i:"✍️", c:"#0284c7", desc:"Client présent pour signer" },
      { s:"waiting_client_validation",l:"Validation finale",i:"✋",c:"#b45309",desc:"Validation de la transaction de leasing" },
      { s:"completed",    l:"Leasing actif",        i:"✅", c:"#059669", desc:"Leasing en cours" },
    ],
    nextBtn: {
      confirmed: { fn:"onPrepare",       label:"Démarrer l'étude financière", icon:"📊" },
      preparing: { fn:"onReady",         label:"Contrat finalisé",           icon:"📄" },
      ready:     { fn:"onClientArrived", label:"Client présent pour signature",icon:"✍️" },
    },
    rdvAtStatus: "client_arrived",
    rdvLabel: "Le contrat a-t-il été signé ?",
    rdvPresentLabel: "Signé — Enregistrer la transaction",
    rdvAbsentLabel: "Client absent — Reporter",
  },
  import_export: {
    badge: "🌍 Import / Export", color: "#dc2626",
    steps: [
      { s:"confirmed",    l:"Commande reçue",   i:"✓",  c:"#059669", desc:"Commande d'import/export reçue" },
      { s:"preparing",    l:"En traitement",    i:"⚙️", c:"#0891b2", desc:"Traitement administratif & logistique" },
      { s:"in_progress",  l:"En transit",       i:"🚢", c:"#2563eb", desc:"Véhicule en transit international" },
      { s:"client_arrived",l:"À l'inspection",  i:"🔍", c:"#0284c7", desc:"Inspection à la réception" },
      { s:"waiting_client_validation",l:"Confirmation",i:"✋",c:"#b45309",desc:"Confirmation client de réception" },
      { s:"completed",    l:"Livraison OK",     i:"🏁", c:"#475569", desc:"Import/Export finalisé" },
    ],
    nextBtn: {
      confirmed: { fn:"onPrepare",    label:"Lancer le traitement",     icon:"⚙️" },
      preparing: { fn:"onInProgress", label:"Expédition en cours",      icon:"🚢" },
    },
    rdvAtStatus: "in_progress",
    rdvLabel: "Le véhicule est-il arrivé à destination ?",
    rdvPresentLabel: "Arrivé — Inspection en cours",
    rdvAbsentLabel: "Problème de livraison",
  },
};

/* ══════════════════════════════════════════════════════════════════════════════
   MODAL GÉRER — Gestion complète, identité intégrée, workflow par type VIT-AUTO
   ══════════════════════════════════════════════════════════════════════════════ */
function GererModal({ order, orderDetail, detailLoading, onClose, onConfirm, onPrepare, onReady, onInProgress,
  onClientArrived, onClientAbsent, onRecordTransaction, onPartnerConfirm, onComplete, onReject, onTransactionNotConcluded, onRespondToDispute, onPartnerVerifyKyc,
  onClaimCaution, commRates = DEFAULT_COMM_RATE }) {
  // Tous les hooks AVANT tout return conditionnel (règles des hooks React)
  const { fmt: fmtXOF } = useCurrency();
  const [cautionForm, setCautionForm] = useState({ retain: false, amount: "", reason: "" });
  const [cautionSubmitting, setCautionSubmitting] = useState(false);
  const [txForm, setTxForm] = useState({
    finalAmount:   order?.transaction?.finalAmount || order?.montantTotal || order?.total || "",
    paymentMethod: order?.transaction?.paymentMethod || "cash",
    comment:       order?.transaction?.comment || "",
    // Mode de financement réellement conclu (véhicules en vente uniquement) —
    // négocié sur place, peut différer des conditions publiées sur l'annonce.
    financing: {
      type:          order?.transaction?.financing?.type || "comptant",
      apportInitial: order?.transaction?.financing?.apportInitial || "",
      mensualite:    order?.transaction?.financing?.mensualite    || "",
      duree:         order?.transaction?.financing?.duree         || 36,
      tauxInteret:   order?.transaction?.financing?.tauxInteret   || 8,
    },
  });
  const [txSubmitting, setTxSubmitting] = useState(false);
  const [txError, setTxError]           = useState("");
  const [fastMode, setFastMode]         = useState(null);
  const [disputeMsg, setDisputeMsg]           = useState("");
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);

  if (!order) return null;

  // ── Sous-type et workflow ─────────────────────────────────────────────────
  const subType = getOrderSubType(order);
  const wf      = ORDER_WORKFLOWS[subType] || ORDER_WORKFLOWS.location_agence;

  // ── Statut ────────────────────────────────────────────────────────────────
  const bst    = BS[order.status] || BS.pending;
  const kycCfg = KYC_CFG[order.clientInfo?.kycStatus] || null;
  const isNew  = !order.status || order.status === "À confirmer" || order.status === "pending";
  const isActive = !isNew && !["cancelled","disputed","completed"].includes(order.status);
  const isDone   = ["completed","cancelled","disputed"].includes(order.status);

  // Action unique selon statut + sous-type (AUCUN doublon)
  const ACTION =
    isNew                                                      ? "decision"
    : order.status === "client_absent"                         ? "client_absent"
    : order.status === "client_arrived"                        ? "transaction"
    : order.status === "transaction_not_concluded"              ? "transaction_failed"
    : order.status === "waiting_client_validation"             ? "waiting"
    : order.status === "completed"                             ? "done"
    : order.status === "cancelled"                             ? "cancelled"
    : order.status === "disputed"                              ? "disputed"
    : wf.rdvAtStatus && order.status === wf.rdvAtStatus        ? "rdv"
    : (wf.nextBtn && wf.nextBtn[order.status])                 ? "progress"
    : "info";  // fallback pour statuts non mappés

  // ── Actions progression ───────────────────────────────────────────────────
  const FN_MAP = { onPrepare, onReady, onInProgress, onClientArrived: (id) => onClientArrived(id) };
  const nextBtnCfg = wf.nextBtn?.[order.status] || null;

  // Fast-mode uniquement quand le prochain pas est la remise directe au client
  const showFastMode = nextBtnCfg?.fn === "onClientArrived";

  // ── GPS / Livraison ───────────────────────────────────────────────────────
  const hasGps  = order.pickupLat != null && order.pickupLng != null;
  const pickupAddr = order.pickupAddress || order.pickupLocation || order.location?.pickupLocation;
  const isLiv   = subType === "location_domicile" || !!pickupAddr;
  const mapsUrl = hasGps
    ? `https://www.google.com/maps?q=${order.pickupLat},${order.pickupLng}`
    : pickupAddr ? `https://www.google.com/maps/search/${encodeURIComponent(pickupAddr)}` : null;

  // ── Données identité (toutes sources, par priorité) ───────────────────────
  const snap       = orderDetail?.clientKycSnapshot || {};
  const clientUser = orderDetail?.client || {};
  const frontImg   = snap.frontImage        || clientUser?.identity?.frontImage    || null;
  const backImg    = snap.backImage         || clientUser?.identity?.backImage     || null;
  const selfieImg  = snap.selfie            || clientUser?.identity?.selfie        || null;
  const licFront   = snap.licenseFrontImage || clientUser?.driverLicenseOcr?.frontImage || null;
  const licBack    = snap.licenseBackImage  || clientUser?.driverLicenseOcr?.backImage  || null;
  const ocrData    = snap.ocrData           || clientUser?.kycOcrData || null;
  const idType     = snap.idType    || order.clientVerification?.idType   || clientUser?.identity?.type   || null;
  const idNumber   = snap.idNumber  || order.clientVerification?.idNumber || clientUser?.identity?.number || null;
  const idExpiry   = ocrData?.expiryDate || clientUser?.identity?.expiryDate || null;
  const idExpired  = idExpiry ? new Date(idExpiry) < new Date() : false;
  const ocrFirst   = ocrData?.firstName || "";
  const ocrLast    = ocrData?.lastName  || "";
  const ocrDOB     = ocrData?.birthDate || null;
  const ocrGender  = ocrData?.gender    || null;
  const ocrCountry = ocrData?.issuingCountry || null;
  const ocrConf    = ocrData?.ocrConfidence  || 0;
  const faceScore  = snap.faceMatchScore || clientUser?.kycFaceMatchScore || null;
  const kycScore   = snap.kycScore || order.clientInfo?.kycScore || clientUser?.kycScore || 0;
  const licNumber  = snap.licenseNumber    || clientUser?.driverLicenseOcr?.licenseNumber || null;
  const licExpiry  = snap.licenseExpiry    || clientUser?.driverLicenseOcr?.expiryDate    || null;
  const licCats    = snap.licenseCategories || clientUser?.driverLicenseOcr?.categories   || null;
  const licExpired = licExpiry ? new Date(licExpiry) < new Date() : false;

  // ── Contrat & finances ────────────────────────────────────────────────────
  const contractId = orderDetail?.contract?._id || order.contract || null;
  const commRate   = commRates[order.type] ?? DEFAULT_COMM_RATE[order.type] ?? 0.15;
  const totalAmt   = order.montantTotal || order.total || 0;
  const commAmt    = order.commissionAmount || Math.round(totalAmt * commRate);
  const netAmt     = order.partnerPayout    || Math.max(totalAmt - commAmt - SERVICE_FEE, 0);

  // ── Helpers affichage ────────────────────────────────────────────────────
  const InfoLine = ({ label, value, color, mono }) => value ? (
    <div style={{ display:"flex", justifyContent:"space-between", fontSize:".82rem", padding:"4px 0", borderBottom:"1px solid #f1f5f9" }}>
      <span style={{ color:"#64748b", marginRight:8 }}>{label}</span>
      <strong style={{ color: color||"#0f172a", fontFamily:mono?"monospace":undefined, textAlign:"right" }}>{value}</strong>
    </div>
  ) : null;

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalSheet} onClick={(e) => e.stopPropagation()}>

        {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
        <div className={styles.modalHeader}>
          <div className={styles.modalHeaderLeft}>
            <div className={styles.modalRef}>{order.reference || `#${String(order.id).slice(-6)}`}</div>
            <div className={styles.modalVehicle}>{order.vehicleName || "Commande"}</div>
            <div className={styles.modalMeta}>
              <span className={styles.typePill} style={{ background: wf.color + "18", color: wf.color }}>{wf.badge}</span>
              <span className={styles.statusPill} style={{ background: bst.bg, color: bst.color }}>{bst.label}</span>
              {kycCfg && <span className={styles.kycPill} style={{ background: kycCfg.bg, color: kycCfg.color }}>{kycCfg.icon} {kycCfg.label}</span>}
            </div>
          </div>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>

        <div className={styles.modalBody}>

          {/* ══ BLOC 1 : CLIENT + IDENTITÉ | RÉSERVATION ════════════════════ */}
          <div className={styles.modalCols}>

            {/* ─ COL GAUCHE : Client + Identité complète ───────────────────── */}
            <div className={styles.modalCol}>
              <div className={styles.sectionCard}>
                <div className={styles.sectionCardTitle}>👤 Client & Identité</div>

                {/* Avatar + Nom + KYC */}
                <div className={styles.clientAvatar}>
                  {selfieImg
                    ? <img src={selfieImg} alt="Selfie" className={styles.avatarSelfie} onClick={() => {}} style={{ cursor:"zoom-in" }} />
                    : <div className={styles.avatarCircle}>{(order.firstName || "?").charAt(0).toUpperCase()}</div>
                  }
                  <div style={{ flex:1, minWidth:0 }}>
                    <div className={styles.clientName}>{order.firstName} {order.lastName}</div>
                    {kycCfg
                      ? <div className={styles.kycBadgeLarge} style={{ background:kycCfg.bg, color:kycCfg.color }}>{kycCfg.icon} {kycCfg.label} · {kycScore}/100</div>
                      : <div className={styles.kycBadgeLarge} style={{ background:"#f1f5f9", color:"#94a3b8" }}>KYC non soumis</div>
                    }
                    <div className={styles.verifiedRow}>
                      <span style={{ color:clientUser?.emailVerified?"#059669":"#94a3b8" }}>{clientUser?.emailVerified?"✅":"○"} Email</span>
                      <span style={{ color:clientUser?.phoneVerified?"#059669":"#94a3b8" }}>{clientUser?.phoneVerified?"✅":"○"} Tél.</span>
                    </div>
                  </div>
                </div>

                {/* Contacts */}
                <div className={styles.contactList}>
                  {order.phone && <a href={`tel:${order.phone}`} className={styles.contactItem}><span className={styles.contactIcon}>📞</span><span>{order.phone}</span><span className={styles.contactAction}>Appeler</span></a>}
                  {order.email && <a href={`mailto:${order.email}`} className={styles.contactItem}><span className={styles.contactIcon}>✉️</span><span className={styles.ellipsis}>{order.email}</span><span className={styles.contactAction}>Email</span></a>}
                  {order.phone && <a href={`https://wa.me/${order.phone?.replace(/[\s\+\-]/g,"")}`} target="_blank" rel="noopener noreferrer" className={styles.contactItem}><span className={styles.contactIcon}>💬</span><span>WhatsApp</span><span className={styles.contactAction}>Chat</span></a>}
                </div>

                {/* ── Passeport (obligatoire à la réservation) ──────────────── */}
                <div className={styles.idCardBlock}>
                  <div className={styles.idCardHeader}>
                    <span className={styles.idCardBadge}>📔 Passeport</span>
                    <span className={styles.idCardNum}>{order.clientInfo?.passportNumber || "N° non renseigné"}</span>
                  </div>
                </div>

                {/* ── Pièce d'identité ─────────────────────────────────────── */}
                <div className={styles.idCardBlock} style={{ marginTop:10 }}>
                  <div className={styles.idCardHeader}>
                    <span className={styles.idCardBadge}>🪪 {idType ? idType.toUpperCase() : "Pièce d'identité"}</span>
                    <span className={styles.idCardNum}>{idNumber || "N° non renseigné"}</span>
                  </div>

                  {detailLoading ? (
                    <div style={{ fontSize:".8rem", color:"#94a3b8", padding:"8px 0" }}>⏳ Chargement…</div>
                  ) : (
                    <>
                      {/* Photos pièce d'identité */}
                      <div className={styles.idPhotosRow}>
                        <PhotoThumb src={frontImg}  label="Recto" />
                        <PhotoThumb src={backImg}   label="Verso" />
                        <PhotoThumb src={selfieImg} label="Selfie" />
                      </div>

                      {/* Données OCR */}
                      <div style={{ marginTop:8 }}>
                        <InfoLine label="Nom complet" value={(ocrFirst||ocrLast) ? `${ocrFirst} ${ocrLast}`.trim() : `${order.firstName} ${order.lastName}`} />
                        <InfoLine label="Date de naissance" value={ocrDOB ? new Date(ocrDOB).toLocaleDateString("fr-FR") : null} />
                        <InfoLine label="Sexe" value={ocrGender === "M" ? "Masculin" : ocrGender === "F" ? "Féminin" : null} />
                        <InfoLine label="Pays émetteur" value={ocrCountry} />
                        <InfoLine label="Expiration" value={idExpiry ? new Date(idExpiry).toLocaleDateString("fr-FR") : null} color={idExpired?"#dc2626":idExpiry?"#059669":undefined} />
                        {idExpired && <div style={{ fontSize:".75rem", color:"#dc2626", fontWeight:700, marginTop:2 }}>⚠️ Document expiré</div>}
                        {ocrConf > 0 && <InfoLine label="Confiance OCR" value={`${ocrConf}%`} color={ocrConf>=70?"#059669":ocrConf>=40?"#d97706":"#dc2626"} />}
                        {faceScore != null && <InfoLine label="Face matching" value={`${faceScore}%`} color={faceScore>=65?"#059669":"#d97706"} />}
                      </div>
                    </>
                  )}
                </div>

                {/* ── Permis de conduire (location uniquement) ─────────────── */}
                {(subType === "location_agence" || subType === "location_domicile") && (
                  <div className={styles.idCardBlock} style={{ marginTop:10 }}>
                    <div className={styles.idCardHeader}>
                      <span className={styles.idCardBadge}>🚘 Permis de conduire</span>
                      <span className={styles.idCardNum}>{licNumber || "N° non fourni"}</span>
                    </div>
                    {detailLoading ? (
                      <div style={{ fontSize:".8rem", color:"#94a3b8", padding:"4px 0" }}>⏳</div>
                    ) : (
                      <>
                        <div className={styles.idPhotosRow}>
                          <PhotoThumb src={licFront} label="Permis Recto" />
                          <PhotoThumb src={licBack}  label="Permis Verso" />
                        </div>
                        <div style={{ marginTop:6 }}>
                          <InfoLine label="Expiration" value={licExpiry ? new Date(licExpiry).toLocaleDateString("fr-FR") : null} color={licExpired?"#dc2626":licExpiry?"#059669":undefined} />
                          {licExpired && <div style={{ fontSize:".75rem", color:"#dc2626", fontWeight:700, marginTop:2 }}>⚠️ Permis expiré</div>}
                          <InfoLine label="Catégories" value={licCats} />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ─ COL DROITE : Détails réservation ──────────────────────────── */}
            <div className={styles.modalCol}>
              <div className={styles.sectionCard}>
                <div className={styles.sectionCardTitle}>📋 Détails de la commande</div>
                <div className={styles.detailGrid}>
                  <div className={styles.detailItem}><span className={styles.detailLabel}>Référence</span><span className={styles.detailValue} style={{ fontFamily:"monospace", fontWeight:800, color:"#6366f1" }}>{order.reference||"—"}</span></div>
                  <div className={styles.detailItem}><span className={styles.detailLabel}>Reçue le</span><span className={styles.detailValue}>{fmtDateTime(order.createdAt)}</span></div>
                  <div className={styles.detailItem}><span className={styles.detailLabel}>Paiement</span><span className={styles.detailValue} style={{ color:order.isPaid?"#059669":"#d97706" }}>{order.isPaid?"✅ Payé":"⏳ En attente"}</span></div>
                  {order.paidWith && <div className={styles.detailItem}><span className={styles.detailLabel}>Méthode</span><span className={styles.detailValue}>{PAY_LABELS[order.paidWith]||order.paidWith}</span></div>}

                  {/* Champs spécifiques au type */}
                  {(subType==="location_agence"||subType==="location_domicile") && <>
                    <div className={styles.detailItem}><span className={styles.detailLabel}>Début</span><span className={styles.detailValue}>{fmtDate(order.startDate||order.location?.startDate)}</span></div>
                    <div className={styles.detailItem}><span className={styles.detailLabel}>Fin</span><span className={styles.detailValue}>{fmtDate(order.endDate||order.location?.endDate)}</span></div>
                    <div className={styles.detailItem}><span className={styles.detailLabel}>Durée</span><span className={styles.detailValue}>{order.days||order.location?.days||"—"} jour(s)</span></div>
                    {order.location?.returnLocation && <div className={styles.detailItem}><span className={styles.detailLabel}>Retour</span><span className={styles.detailValue}>{order.location.returnLocation}</span></div>}
                    {order.pickupMethod === "livraison" && <div className={styles.detailItem}><span className={styles.detailLabel}>Adresse livraison</span><span className={styles.detailValue}>{order.pickupAddress||"—"}</span></div>}
                    {order.pickupLat != null && order.pickupLng != null && (
                      <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>Position GPS</span>
                        <span className={styles.detailValue}>
                          <a href={`https://www.google.com/maps?q=${order.pickupLat},${order.pickupLng}`} target="_blank" rel="noopener noreferrer">🗺️ Voir sur la carte</a>
                        </span>
                      </div>
                    )}
                  </>}
                  {subType==="vente" && <>
                    <div className={styles.detailItem}><span className={styles.detailLabel}>Date RDV</span><span className={styles.detailValue}>{fmtDate(order.preferredDate||order.essai?.preferredDate)}</span></div>
                    <div className={styles.detailItem}><span className={styles.detailLabel}>Heure</span><span className={styles.detailValue}>{order.preferredTime||order.essai?.preferredTime||"—"}</span></div>
                    {order.essai?.notes && <div className={styles.detailItem} style={{gridColumn:"span 2"}}><span className={styles.detailLabel}>Notes</span><span className={styles.detailValue}>{order.essai.notes}</span></div>}
                  </>}
                  {subType==="chauffeur" && <>
                    <div className={styles.detailItem}><span className={styles.detailLabel}>Date</span><span className={styles.detailValue}>{fmtDate(order.chauffeur?.date||order.startDate)}</span></div>
                    <div className={styles.detailItem}><span className={styles.detailLabel}>Durée</span><span className={styles.detailValue}>{order.chauffeur?.heures||"—"} h</span></div>
                    <div className={styles.detailItem}><span className={styles.detailLabel}>Départ</span><span className={styles.detailValue}>{order.chauffeur?.lieuDepart||"—"}</span></div>
                    <div className={styles.detailItem}><span className={styles.detailLabel}>Destination</span><span className={styles.detailValue}>{order.chauffeur?.destination||"—"}</span></div>
                    {order.chauffeur?.notes && <div className={styles.detailItem} style={{gridColumn:"span 2"}}><span className={styles.detailLabel}>Notes</span><span className={styles.detailValue}>{order.chauffeur.notes}</span></div>}
                  </>}
                  {subType==="leasing" && <>
                    <div className={styles.detailItem}><span className={styles.detailLabel}>Apport initial</span><span className={styles.detailValue}>{fmtXOF(order.leasing?.apportInitial||0)}</span></div>
                    <div className={styles.detailItem}><span className={styles.detailLabel}>Mensualité</span><span className={styles.detailValue}>{fmtXOF(order.leasing?.mensualite||0)}</span></div>
                    <div className={styles.detailItem}><span className={styles.detailLabel}>Durée</span><span className={styles.detailValue}>{order.leasing?.duree||"—"} mois</span></div>
                    <div className={styles.detailItem}><span className={styles.detailLabel}>Taux d'intérêt</span><span className={styles.detailValue}>{order.leasing?.tauxInteret||"—"}%</span></div>
                    <div className={styles.detailItem}><span className={styles.detailLabel}>Total leasing</span><span className={styles.detailValue}>{fmtXOF(order.leasing?.totalLeasing||0)}</span></div>
                  </>}
                  {subType==="import_export" && <>
                    <div className={styles.detailItem}><span className={styles.detailLabel}>Date demande</span><span className={styles.detailValue}>{fmtDate(order.preferredDate||order.createdAt)}</span></div>
                    {order.essai?.notes && <div className={styles.detailItem} style={{gridColumn:"span 2"}}><span className={styles.detailLabel}>Détails</span><span className={styles.detailValue}>{order.essai.notes}</span></div>}
                  </>}
                </div>

                {/* Finances */}
                <div className={styles.finBreakdown}>
                  <div className={styles.finTitle}>Décomposition financière</div>
                  <div className={styles.finRow}><span>Total client</span><strong>{fmtXOF(totalAmt)}</strong></div>
                  {order.deliveryFee > 0 && <div className={styles.finRow}><span>dont livraison</span><strong>{fmtXOF(order.deliveryFee)}</strong></div>}
                  <div className={styles.finRow} style={{color:"#dc2626"}}><span>Commission VIT-AUTO ({Math.round(commRate*100)}%)</span><strong>− {fmtXOF(commAmt)}</strong></div>
                  <div className={styles.finRow} style={{color:"#dc2626"}}><span>Frais de service</span><strong>− {fmtXOF(SERVICE_FEE)}</strong></div>
                  <div className={styles.finRowNet}><span>Votre net partenaire</span><strong>{fmtXOF(netAmt)}</strong></div>
                  {order.cautionAmount > 0 && <div className={styles.finRow} style={{color:"#d97706"}}><span>Caution à percevoir sur place</span><strong>{fmtXOF(order.cautionAmount)}</strong></div>}
                </div>

                {/* Options location */}
                {order.location?.options && Object.values(order.location.options).some(Boolean) && (
                  <div className={styles.optionsList}>
                    {order.location.options.gps       && <span className={styles.optionTag}>🗺️ GPS</span>}
                    {order.location.options.babySeat  && <span className={styles.optionTag}>👶 Siège bébé</span>}
                    {order.location.options.insurance && <span className={styles.optionTag}>🛡️ Assurance</span>}
                    {order.location.options.driver    && <span className={styles.optionTag}>🧑‍✈️ Chauffeur</span>}
                  </div>
                )}

                {/* Contrat digital */}
                {contractId && (
                  <div style={{ marginTop:12 }}>
                    <Link to={`/contract/${order.id}`} target="_blank" rel="noopener noreferrer" className={styles.contractLinkLarge}>
                      📄 Voir le contrat digital
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ══ BLOC 2 : LIEU DE PRISE EN CHARGE (livraison / domicile) ════════ */}
          {isLiv && pickupAddr && (
            <div className={styles.sectionCard}>
              <div className={styles.sectionCardTitle}>📍 Adresse de {subType === "location_domicile" ? "livraison" : "prise en charge"}</div>
              <div className={styles.pickupBlock}>
                <div className={styles.pickupAddr}>
                  <div className={styles.pickupAddrText}>{pickupAddr}</div>
                  {hasGps && <div className={styles.pickupGps}>📡 GPS · {Number(order.pickupLat).toFixed(5)}, {Number(order.pickupLng).toFixed(5)}</div>}
                </div>
                <div className={styles.pickupActions}>
                  {mapsUrl && <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={styles.mapsBtn}>🗺️ Google Maps</a>}
                  {order.phone && <a href={`https://wa.me/${order.phone?.replace(/[\s\+\-]/g,"")}?text=Bonjour%20${encodeURIComponent(order.firstName||"")}%2C%20je%20confirme%20notre%20rendez-vous%20VIT%20AUTO.`} target="_blank" rel="noopener noreferrer" className={styles.whatsappBtn}>💬 WhatsApp</a>}
                </div>
              </div>
              {hasGps && <iframe title="Carte" loading="lazy" src={`https://www.openstreetmap.org/export/embed.html?bbox=${order.pickupLng-.01},${order.pickupLat-.01},${order.pickupLng+.01},${order.pickupLat+.01}&layer=mapnik&marker=${order.pickupLat},${order.pickupLng}`} className={styles.mapFrame} />}
              {order.location?.returnLocation && <div className={styles.returnRow}><span>🔄 Lieu de retour :</span><strong>{order.location.returnLocation}</strong></div>}
            </div>
          )}

          {/* ══ BLOC 3 : SUIVI — WORKFLOW PAR TYPE ══════════════════════════ */}
          {isActive && (
            <div className={styles.sectionCard}>
              <div className={styles.sectionCardTitle} style={{ color: wf.color }}>📊 {wf.badge} — Suivi de la commande</div>
              <div className={styles.timeline}>
                {wf.steps.map((step, idx) => {
                  const statusOrder = wf.steps.map(s=>s.s);
                  const curIdx = statusOrder.indexOf(order.status);
                  const myIdx  = statusOrder.indexOf(step.s);
                  const done    = curIdx > myIdx;
                  const current = curIdx === myIdx;
                  return (
                    <div key={step.s} className={[styles.timelineStep, done?styles.timelineDone:current?styles.timelineCurrent:styles.timelineFuture].join(" ")}>
                      <div className={styles.timelineDot} style={{ background:(done||current)?step.c:"#e2e8f0" }}>
                        {done ? "✓" : step.i}
                      </div>
                      {idx < wf.steps.length-1 && <div className={[styles.timelineLine, done?styles.timelineLineDone:""].join(" ")} />}
                      <div className={styles.timelineLabel}>{step.l}</div>
                    </div>
                  );
                })}
              </div>
              {/* Description de l'étape courante */}
              {(() => { const cur = wf.steps.find(s=>s.s===order.status); return cur?.desc ? <p style={{ fontSize:".82rem", color:"#64748b", margin:"8px 0 0", textAlign:"center" }}>{cur.desc}</p> : null; })()}
            </div>
          )}
          {order.status === "completed" && <div className={styles.completedBanner}>🏁 Commande terminée avec succès ! Client notifié.</div>}

          {/* ══ BLOC 4 : ACTION UNIQUE ════════════════════════════════════════ */}

          {/* ── Nouvelle commande — Décision ─────────────────────────────── */}
          {ACTION === "decision" && (
            <div className={styles.sectionCard} style={{ border:"2px solid #fde68a", background:"#fffbeb" }}>
              <div className={styles.sectionCardTitle}>⚡ Décision requise</div>
              <p className={styles.decisionHelp} style={{ marginBottom:12 }}>
                Cette commande attend votre réponse. Le client sera notifié immédiatement. <strong>Vérifiez les documents identité ci-dessus avant de confirmer.</strong>
              </p>
              <div className={styles.decisionBtns}>
                <button className={styles.btnAccept} onClick={() => onConfirm(order.id)}>
                  <span>✅</span><div><strong>Accepter la réservation</strong><span>Un contrat sera généré automatiquement</span></div>
                </button>
                <button className={styles.btnRefuse} onClick={() => onReject(order.id)}>
                  <span>✕</span><div><strong>Refuser</strong><span>Avec motif (optionnel)</span></div>
                </button>
              </div>
            </div>
          )}

          {/* ── Progression — Prochaine étape ────────────────────────────── */}
          {ACTION === "progress" && nextBtnCfg && (
            <div className={styles.sectionCard}>
              <div className={styles.sectionCardTitle} style={{ color: wf.color }}>
                ⚙️ Étape en cours — {wf.steps.find(s=>s.s===order.status)?.l || "Avancement"}
              </div>
              {wf.steps.find(s=>s.s===order.status)?.desc && (
                <p className={styles.decisionHelp}>{wf.steps.find(s=>s.s===order.status)?.desc}</p>
              )}
              <button className={styles.nextStepBtn} onClick={() => FN_MAP[nextBtnCfg.fn]?.(order.id)}>
                {nextBtnCfg.icon} {nextBtnCfg.label} →
              </button>

              {/* Fast-mode : UNIQUEMENT si la prochaine étape = remise directe au client */}
              {showFastMode && (
                <div style={{ marginTop:12, paddingTop:12, borderTop:"1px solid #f1f5f9" }}>
                  <p style={{ fontSize:".8rem", color:"#059669", fontWeight:600, margin:"0 0 8px" }}>
                    ⚡ Raccourci — le client est là maintenant, finaliser directement :
                  </p>
                  {!fastMode ? (
                    <div className={styles.decisionBtns}>
                      <button className={styles.btnAccept} onClick={() => setFastMode("present")}>
                        <span>🤝</span><div><strong>Client présent — Encaisser</strong><span>Saisir le montant encaissé directement</span></div>
                      </button>
                      <button className={styles.btnRefuse} onClick={() => onPartnerConfirm(order.id, {clientPresent:false,finalAmount:0,paymentMethod:"cash"})}>
                        <span>🚫</span><div><strong>Client absent</strong><span>Signaler l'absence et clore</span></div>
                      </button>
                    </div>
                  ) : (
                    <TxForm form={txForm} setForm={setTxForm} commRate={commRate} isVente={subType === "vente"}
                      onSubmit={() => {
                        if(!txForm.finalAmount||Number(txForm.finalAmount)<=0) return;
                        if(txForm.financing?.type!=="comptant" && (!txForm.financing?.mensualite||Number(txForm.financing.mensualite)<=0)) return;
                        onPartnerConfirm(order.id,{
                          clientPresent:true,finalAmount:Number(txForm.finalAmount),paymentMethod:txForm.paymentMethod,comment:txForm.comment,
                          financing: subType==="vente" ? {
                            type: txForm.financing?.type||"comptant",
                            apportInitial: Number(txForm.financing?.apportInitial)||0,
                            mensualite: Number(txForm.financing?.mensualite)||0,
                            duree: Number(txForm.financing?.duree)||0,
                            tauxInteret: Number(txForm.financing?.tauxInteret)||0,
                          } : undefined,
                        });
                        setFastMode(null);
                      }}
                      onCancel={() => setFastMode(null)}
                    />
                  )}
                </div>
              )}

              <div style={{ marginTop:12, display:"flex", justifyContent:"flex-end" }}>
                <button className={styles.cancelOrderBtn} onClick={() => onReject(order.id)}>✕ Annuler la commande</button>
              </div>
            </div>
          )}

          {/* ── RDV / Arrivée / Présence ─────────────────────────────────── */}
          {ACTION === "rdv" && (
            <div className={styles.sectionCard} style={{ border:"2px solid #93c5fd", background:"#eff6ff" }}>
              <div className={styles.sectionCardTitle} style={{ color:"#1d4ed8" }}>
                📍 {wf.rdvLabel || "Le client est-il présent ?"}
              </div>
              <p className={styles.decisionHelp} style={{ color:"#1e40af" }}>
                {wf.steps.find(s=>s.s===order.status)?.desc}. Vérifiez la pièce d'identité dans la section ci-dessus avant de confirmer.
              </p>
              <div className={styles.decisionBtns}>
                <button className={styles.btnAccept} onClick={() => onClientArrived(order.id)}>
                  <span>📍</span><div><strong>{wf.rdvPresentLabel || "Présent — Enregistrer transaction"}</strong><span>Identité conforme</span></div>
                </button>
                <button className={styles.btnRefuse} onClick={() => onClientAbsent(order.id)}>
                  <span>🚫</span><div><strong>{wf.rdvAbsentLabel || "Absent / Introuvable"}</strong><span>Signaler l'absence</span></div>
                </button>
              </div>
              <div style={{ marginTop:10, display:"flex", justifyContent:"flex-end" }}>
                <button className={styles.cancelOrderBtn} onClick={() => onReject(order.id)}>✕ Annuler</button>
              </div>
            </div>
          )}

          {/* ── Transaction ──────────────────────────────────────────────── */}
          {ACTION === "transaction" && (
            <div className={styles.sectionCard}>
              <div className={styles.sectionCardTitle}>💰 Enregistrement de la transaction</div>
              <p className={styles.decisionHelp}>Saisissez le montant exact encaissé auprès du client. La transaction sera soumise à validation.</p>
              {txError && <p className={styles.txError}>{txError}</p>}
              <TxForm form={txForm} setForm={setTxForm} submitting={txSubmitting} commRate={commRate} isVente={subType === "vente"}
                onSubmit={async () => {
                  if(!txForm.finalAmount||Number(txForm.finalAmount)<=0){setTxError("Saisissez un montant valide.");return;}
                  if(txForm.financing?.type!=="comptant" && (!txForm.financing?.mensualite||Number(txForm.financing.mensualite)<=0)){setTxError("Saisissez une mensualité valide pour ce financement.");return;}
                  setTxError(""); setTxSubmitting(true);
                  await onRecordTransaction(order.id,{
                    finalAmount:Number(txForm.finalAmount),paymentMethod:txForm.paymentMethod,comment:txForm.comment,
                    financing: subType==="vente" ? {
                      type: txForm.financing?.type||"comptant",
                      apportInitial: Number(txForm.financing?.apportInitial)||0,
                      mensualite: Number(txForm.financing?.mensualite)||0,
                      duree: Number(txForm.financing?.duree)||0,
                      tauxInteret: Number(txForm.financing?.tauxInteret)||0,
                    } : undefined,
                  });
                  setTxSubmitting(false);
                }}
                onCancel={() => onTransactionNotConcluded(order.id)} cancelLabel="Transaction non conclue"
              />
            </div>
          )}

          {/* ── Transaction non conclue ───────────────────────────────────── */}
          {ACTION === "transaction_failed" && (
            <div className={styles.sectionCard} style={{ background:"#fff5f5", border:"1.5px solid #fca5a5" }}>
              <div className={styles.sectionCardTitle} style={{ color:"#dc2626" }}>❌ Transaction non conclue</div>
              <p className={styles.decisionHelp} style={{ color:"#991b1b" }}>
                La transaction n'a pas abouti au rendez-vous. Vous pouvez retenter (le client est toujours là ou revient) ou annuler définitivement.
              </p>
              <div className={styles.decisionBtns}>
                <button className={styles.btnAccept} onClick={() => onInProgress(order.id)}>
                  <span>🔄</span><div><strong>Retenter la transaction</strong><span>Reprendre depuis "En route"</span></div>
                </button>
                <button className={styles.btnRefuse} onClick={() => onReject(order.id)}>
                  <span>❌</span><div><strong>Annuler définitivement</strong><span>Clore cette commande</span></div>
                </button>
              </div>
            </div>
          )}

          {/* ── Attente validation client ────────────────────────────────── */}
          {ACTION === "waiting" && (
            <div className={styles.sectionCard} style={{ background:"#fffbeb", border:"1.5px solid #fde68a" }}>
              <div className={styles.sectionCardTitle}>⏳ En attente de validation client</div>
              <div className={styles.waitingInfo}>
                <div className={styles.waitingAmount}>{fmtXOF(order.transaction?.finalAmount || totalAmt)}</div>
                <div className={styles.waitingMode}>{PAY_LABELS[order.transaction?.paymentMethod] || "—"}</div>
                <p className={styles.waitingNote}>Transaction soumise. Le client valide dans son tableau de bord.<br/>Vous serez notifié automatiquement dès confirmation.</p>
              </div>
            </div>
          )}

          {/* ── Terminé / Annulé / Litige ───────────────────────────────── */}
          {/* ── Client absent ────────────────────────────────────────────── */}
          {ACTION === "client_absent" && (
            <div className={styles.sectionCard} style={{ background:"#fff5f5", border:"1.5px solid #fca5a5" }}>
              <div className={styles.sectionCardTitle} style={{ color:"#dc2626" }}>🚫 Client non présenté au rendez-vous</div>
              <p className={styles.decisionHelp} style={{ color:"#991b1b" }}>
                Le client était absent. Recontactez-le pour replanifier ou annulez définitivement la commande.
              </p>
              <div className={styles.decisionBtns} style={{ marginBottom:12 }}>
                {order.phone && (
                  <a href={`https://wa.me/${order.phone?.replace(/[\s\+\-]/g,"")}?text=Bonjour%20${encodeURIComponent(order.firstName||"")}%2C%20nous%20avons%20constaté%20votre%20absence%20au%20rendez-vous%20VIT%20AUTO%20(réf.%20${order.reference||""}).%20Souhaitez-vous%20replanifier%20%3F`}
                    target="_blank" rel="noopener noreferrer" className={styles.btnAccept} style={{ textDecoration:"none" }}>
                    <span>💬</span><div><strong>Recontacter via WhatsApp</strong><span>Proposer un nouveau RDV</span></div>
                  </a>
                )}
                <button className={styles.btnRefuse} onClick={() => onReject(order.id)}>
                  <span>❌</span><div><strong>Annuler définitivement</strong><span>Clore cette commande</span></div>
                </button>
              </div>
              <div style={{ fontSize:".8rem", color:"#9ca3af", padding:"8px 0 0", borderTop:"1px solid #fee2e2" }}>
                ℹ️ Cette commande reste dans votre historique. VIT-AUTO sera informé automatiquement.
              </div>
            </div>
          )}

          {/* ── Commande terminée ─────────────────────────────────────────── */}
          {ACTION === "done" && (
            <div className={styles.sectionCard} style={{ background:"#f0fdf4", border:"1.5px solid #86efac" }}>
              <div className={styles.sectionCardTitle} style={{ color:"#059669" }}>🏁 Commande terminée avec succès</div>
              {order.transaction?.finalAmount && (
                <div style={{ display:"flex", flexDirection:"column", gap:6, marginTop:8 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:".88rem" }}>
                    <span style={{ color:"#64748b" }}>Montant encaissé</span>
                    <strong>{fmtXOF(order.transaction.finalAmount)}</strong>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:".88rem" }}>
                    <span style={{ color:"#64748b" }}>Mode de paiement</span>
                    <strong>{PAY_LABELS[order.transaction.paymentMethod] || order.transaction.paymentMethod || "—"}</strong>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:".88rem", fontWeight:800, color:"#059669", paddingTop:6, borderTop:"1px solid #d1fae5" }}>
                    <span>Votre net reçu</span>
                    <strong>{fmtXOF(netAmt)}</strong>
                  </div>
                  {order.transaction.comment && (
                    <div style={{ fontSize:".8rem", color:"#64748b", marginTop:4, fontStyle:"italic" }}>
                      Note : {order.transaction.comment}
                    </div>
                  )}
                </div>
              )}
              {contractId && (
                <div style={{ marginTop:12 }}>
                  <Link to={`/contract/${order.id}`} target="_blank" rel="noopener noreferrer" className={styles.contractLink}>
                    📄 Télécharger le contrat
                  </Link>
                </div>
              )}

              {/* ── Caution : à traiter une seule fois, après restitution ─────── */}
              {(subType === "location_agence" || subType === "location_domicile") && order.cautionAmount > 0 && (
                order.cautionClaim?.claimedAt ? (
                  <div style={{ marginTop:12, padding:"10px 14px", background:"#fff", border:"1.5px solid #d1fae5", borderRadius:10 }}>
                    <strong style={{ fontSize:".85rem", color:"#059669" }}>💳 Caution traitée</strong>
                    <div style={{ fontSize:".82rem", color:"#334155", marginTop:4 }}>
                      {order.cautionClaim.amountClaimed > 0
                        ? <>Retenu : <strong>{fmtXOF(order.cautionClaim.amountClaimed)}</strong> — {order.cautionClaim.reason}</>
                        : "Intégralement restituée au client."}
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop:12, padding:"12px 14px", background:"#fff", border:"1.5px solid #fde68a", borderRadius:10 }}>
                    <strong style={{ fontSize:".85rem", color:"#92400e" }}>💳 Caution perçue : {fmtXOF(order.cautionAmount)} — à traiter</strong>
                    <div style={{ display:"flex", gap:14, marginTop:8, fontSize:".82rem" }}>
                      <label style={{ display:"flex", alignItems:"center", gap:4 }}>
                        <input type="radio" name={`caution-${order.id}`} checked={!cautionForm.retain} onChange={() => setCautionForm({ retain: false, amount: "", reason: "" })} />
                        Restituer intégralement
                      </label>
                      <label style={{ display:"flex", alignItems:"center", gap:4 }}>
                        <input type="radio" name={`caution-${order.id}`} checked={cautionForm.retain} onChange={() => setCautionForm((p) => ({ ...p, retain: true }))} />
                        Retenir un montant (dommage)
                      </label>
                    </div>
                    {cautionForm.retain && (
                      <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:6 }}>
                        <input
                          type="number" min="0" max={order.cautionAmount} placeholder={`Montant retenu (max ${order.cautionAmount})`}
                          value={cautionForm.amount} onChange={(e) => setCautionForm((p) => ({ ...p, amount: e.target.value }))}
                          style={{ padding:"6px 10px", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:".82rem" }}
                        />
                        <input
                          type="text" placeholder="Motif (obligatoire) — ex. pare-choc endommagé"
                          value={cautionForm.reason} onChange={(e) => setCautionForm((p) => ({ ...p, reason: e.target.value }))}
                          style={{ padding:"6px 10px", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:".82rem" }}
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      disabled={cautionSubmitting || (cautionForm.retain && (!cautionForm.amount || !cautionForm.reason.trim()))}
                      onClick={async () => {
                        setCautionSubmitting(true);
                        await onClaimCaution(order.id, {
                          amountClaimed: cautionForm.retain ? Number(cautionForm.amount) : 0,
                          reason: cautionForm.retain ? cautionForm.reason.trim() : undefined,
                        });
                        setCautionSubmitting(false);
                      }}
                      style={{ marginTop:10, padding:"7px 16px", borderRadius:8, border:"none", background:"#d97706", color:"#fff", fontWeight:700, fontSize:".82rem", cursor:"pointer" }}
                    >
                      {cautionSubmitting ? "Traitement..." : "Valider le traitement de la caution"}
                    </button>
                  </div>
                )
              )}
            </div>
          )}

          {/* ── Statuts terminaux ─────────────────────────────────────────── */}
          {ACTION === "cancelled" && (
            <div className={styles.cancelledBlock}>
              ❌ Commande annulée{order.cancelReason ? ` — ${order.cancelReason}` : ""}
              {order.cancelledAt && <span style={{ display:"block", fontSize:".78rem", marginTop:4, opacity:.7 }}>Le {new Date(order.cancelledAt).toLocaleDateString("fr-FR")}</span>}
            </div>
          )}
          {ACTION === "disputed" && (
            <div className={styles.disputedBlock}>
              ⚠️ Litige ouvert — un administrateur VIT AUTO va trancher.
              {order.clientValidation?.disputeReason && (
                <p style={{ margin:"6px 0 0", fontSize:".82rem" }}>Raison : {order.clientValidation.disputeReason}</p>
              )}
              {/* Bug réel corrigé (audit) : jusqu'ici aucun moyen d'apporter des
                  éléments avant que l'admin ne tranche — simple spectateur passif. */}
              {order.partnerDisputeResponse?.respondedAt ? (
                <div style={{ marginTop:10, padding:"8px 12px", background:"#fff", border:"1px solid #fca5a5", borderRadius:8 }}>
                  <p style={{ margin:0, fontSize:".78rem", fontWeight:700, color:"#991b1b" }}>Votre réponse envoyée :</p>
                  <p style={{ margin:"4px 0 0", fontSize:".82rem" }}>{order.partnerDisputeResponse.message}</p>
                </div>
              ) : (
                <div style={{ marginTop:10 }}>
                  <textarea
                    rows={3}
                    placeholder="Apportez des précisions ou des éléments avant la décision de l'admin (facultatif mais recommandé)…"
                    value={disputeMsg}
                    onChange={(e) => setDisputeMsg(e.target.value)}
                    style={{ width:"100%", boxSizing:"border-box", padding:8, borderRadius:8, border:"1.5px solid #fca5a5", fontSize:".85rem", fontFamily:"inherit", resize:"vertical" }}
                  />
                  <button
                    className={styles.btnAccept}
                    style={{ marginTop:8 }}
                    disabled={disputeSubmitting || !disputeMsg.trim()}
                    onClick={async () => {
                      setDisputeSubmitting(true);
                      const r = await onRespondToDispute(order.id, disputeMsg.trim());
                      setDisputeSubmitting(false);
                      if (r?.ok) setDisputeMsg("");
                    }}>
                    {disputeSubmitting ? "Envoi…" : "💬 Envoyer ma réponse"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Fallback ─────────────────────────────────────────────────── */}
          {ACTION === "info" && (
            <div className={styles.sectionCard} style={{ background:"#f8fafc" }}>
              <div className={styles.sectionCardTitle}>ℹ️ Information</div>
              <p className={styles.decisionHelp}>Statut actuel : <strong>{bst.label}</strong>. Aucune action requise pour le moment.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Formulaire de transaction réutilisable ──────────────────────────────── */
function TxForm({ form, setForm, onSubmit, onCancel, cancelLabel = "Annuler", submitting = false, commRate = 0.15, isVente = false }) {
  const amt    = Number(form.finalAmount) || 0;
  const comm   = Math.round(amt * commRate * 100) / 100;
  const netPay = Math.max(Math.round((amt - comm - SERVICE_FEE) * 100) / 100, 0);
  const financing = form.financing || { type: "comptant" };
  const setFinancing = (patch) => setForm((p) => ({ ...p, financing: { ...(p.financing || {}), ...patch } }));
  return (
    <div className={styles.txForm}>
      <div className={styles.txRow}>
        <label className={styles.txLabel}>Montant encaissé (USD) *</label>
        <input type="number" min="1" className={styles.txInput} placeholder="Ex : 1200"
          value={form.finalAmount} onChange={(e) => setForm((p) => ({ ...p, finalAmount: e.target.value }))} />
      </div>
      <div className={styles.txRow}>
        <label className={styles.txLabel}>Mode de paiement *</label>
        <select className={styles.txSelect} value={form.paymentMethod} onChange={(e) => setForm((p) => ({ ...p, paymentMethod: e.target.value }))}>
          <option value="cash">💵 Espèces</option>
          <option value="orange_money">🟠 Orange Money</option>
          <option value="wave">🌊 Wave</option>
          <option value="mtn">🟡 MTN Mobile Money</option>
          <option value="moov">🔵 Moov Money</option>
          <option value="card">💳 Carte bancaire</option>
          <option value="virement">🏦 Virement bancaire</option>
        </select>
      </div>

      {isVente && (
        <>
          <div className={styles.txRow}>
            <label className={styles.txLabel}>Mode de financement conclu *</label>
            <select className={styles.txSelect} value={financing.type} onChange={(e) => setFinancing({ type: e.target.value })}>
              <option value="comptant">💵 Comptant (paiement intégral)</option>
              <option value="leasing">🏦 Leasing (LOA)</option>
              <option value="credit">💳 Crédit classique</option>
            </select>
          </div>
          {financing.type !== "comptant" && (
            <>
              <p style={{ fontSize: ".78rem", color: "#64748b", margin: "-4px 0 8px" }}>
                Conditions négociées sur place — le montant encaissé ci-dessus correspond à l'apport initial.
              </p>
              <div className={styles.txRow}>
                <label className={styles.txLabel}>Mensualité (USD) *</label>
                <input type="number" min="1" className={styles.txInput} placeholder="Ex : 350"
                  value={financing.mensualite} onChange={(e) => setFinancing({ mensualite: e.target.value })} />
              </div>
              <div className={styles.txRow}>
                <label className={styles.txLabel}>Durée (mois)</label>
                <select className={styles.txSelect} value={financing.duree} onChange={(e) => setFinancing({ duree: Number(e.target.value) })}>
                  {[12, 24, 36, 48, 60].map((m) => <option key={m} value={m}>{m} mois</option>)}
                </select>
              </div>
              <div className={styles.txRow}>
                <label className={styles.txLabel}>Taux d'intérêt annuel (%)</label>
                <input type="number" min="0" max="30" step="0.5" className={styles.txInput}
                  value={financing.tauxInteret} onChange={(e) => setFinancing({ tauxInteret: e.target.value })} />
              </div>
            </>
          )}
        </>
      )}

      <div className={styles.txRow}>
        <label className={styles.txLabel}>Note (optionnel)</label>
        <textarea rows={2} className={styles.txTextarea} placeholder="Observations..."
          value={form.comment} onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))} />
      </div>
      {amt > 0 && (
        <div className={styles.txPreview}>
          <div className={styles.txPreviewRow}><span>Montant encaissé</span><strong>{amt.toLocaleString("fr-FR")} USD</strong></div>
          <div className={styles.txPreviewRow} style={{ color: "#dc2626" }}><span>Commission VIT-AUTO ({Math.round(commRate * 100)}%)</span><strong>− {comm.toLocaleString("fr-FR")} USD</strong></div>
          <div className={styles.txPreviewRow} style={{ color: "#dc2626" }}><span>Frais de service</span><strong>− {SERVICE_FEE.toLocaleString("fr-FR")} USD</strong></div>
          <div className={styles.txPreviewNet}><span>Votre net</span><strong>{netPay.toLocaleString("fr-FR")} USD</strong></div>
        </div>
      )}
      <div className={styles.txActions}>
        <button className={styles.btnTxSubmit} onClick={onSubmit} disabled={submitting}>
          {submitting ? "Envoi…" : "✅ Valider et envoyer au client"}
        </button>
        <button className={styles.btnTxCancel} onClick={onCancel}>{cancelLabel}</button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   COMPOSANT PRINCIPAL — VendorDashboard
   ══════════════════════════════════════════════════════════════════════════════ */
export default function VendorDashboard() {
  const { user, isAuthenticated, token } = useAuth();
  const { partnerVehicles: myVehicles, partnerBookings, bookings, updateBookingStatus, updateVehicle, loadPartnerVehicles, loadPartnerOrders } = useVehicles();
  const { success: toastSuccess, error: toastError } = useToast();
  const { on } = useSocket();
  const { openOrCreateChat } = useChat();
  const { COUNTRIES_CONFIG, fmt: fmtXOF, CURRENCIES, rateFromUSD } = useCurrency();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [activeTab,      setActiveTab]      = useState(searchParams.get("tab") || "dashboard");
  const [contactingOrder, setContactingOrder] = useState(null);
  const [invoices,       setInvoices]       = useState([]);
  const [serviceInvoices, setServiceInvoices] = useState([]);
  const [serviceInvoiceLoading, setServiceInvoiceLoading] = useState(false);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [transactions,   setTransactions]   = useState([]);
  const [txLoading,      setTxLoading]      = useState(false);
  // Bug réel corrigé (audit) : aucune notion de virement réellement exécuté —
  // partnerPayout restait compté indéfiniment sur les commandes "completed"
  // sans distinguer ce qui est dû de ce qui a déjà été versé (voir
  // server/utils/commissionLedger.js).
  const [payoutTotals,   setPayoutTotals]   = useState(null);
  const [payoutEntries,  setPayoutEntries]  = useState([]);
  const [payoutLoading,  setPayoutLoading]  = useState(false);
  const [contracts,      setContracts]      = useState([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [legalDocuments, setLegalDocuments] = useState([]); // LOI/Agreement — voir contractController.getPartnerContracts
  const [subscription,   setSubscription]   = useState(null);
  const [subLoading,     setSubLoading]     = useState(true);
  const [commRates,      setCommRates]      = useState(null); // { location, essai, chauffeur, leasing } — depuis /api/pricing/config
  const [partnerStats,   setPartnerStats]   = useState(null); // agrégation serveur — voir loadPartnerStats
  const [analytics,      setAnalytics]      = useState(null); // tendance mensuelle, top véhicules, clientèle — voir loadAnalytics

  // ── Entités (PartnerBusiness) — un partenaire opérant plusieurs entreprises
  // filtre ses commandes/stats par entité (même principe que PartnerPMSDashboard).
  // Le sélecteur ne s'affiche que s'il y a au moins 2 entités.
  const [businesses, setBusinesses] = useState([]);
  const [filterBusinessId, setFilterBusinessId] = useState("");
  useEffect(() => {
    if (!token) return;
    fetch("/api/partner/businesses", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : { businesses: [] })
      .then((d) => setBusinesses(d.businesses || []))
      .catch(() => {});
  }, [token]);

  // Bug réel corrigé (audit) : les nombreux rechargements de la liste des
  // commandes déclenchés après une action (confirmer, enregistrer une
  // transaction, répondre à un litige…), par le bouton "Actualiser", par
  // Socket.io ou par le polling de secours appelaient tous `loadPartnerOrders()`
  // SANS filtre — le filtre d'entité sélectionné dans le menu déroulant
  // redevenait silencieusement "toutes les entités" au tout premier
  // rafraîchissement suivant, alors que le menu affichait toujours l'entité
  // choisie. `filterBusinessIdRef` évite d'avoir à répercuter `filterBusinessId`
  // dans la liste de dépendances de chacun de ces handlers.
  const filterBusinessIdRef = useRef(filterBusinessId);
  useEffect(() => { filterBusinessIdRef.current = filterBusinessId; }, [filterBusinessId]);
  const refreshOrders = useCallback(
    () => loadPartnerOrders(filterBusinessIdRef.current || undefined),
    [loadPartnerOrders]
  );

  const [boostTarget,    setBoostTarget]    = useState(null);
  const [boostModal,     setBoostModal]     = useState(null); // { vehicleId, title } — véhicule en cours de sélection de palier boost

  // ── Congés bloqués par chauffeur ──────────────────────────────────────────
  const [blackoutModal, setBlackoutModal] = useState(null); // driver en cours d'édition
  const [blackoutForm,  setBlackoutForm]  = useState({ start: "", end: "", reason: "" });
  const [blackoutSaving, setBlackoutSaving] = useState(false);

  const handleAddBlackout = async () => {
    if (!blackoutModal || !token || !blackoutForm.start || !blackoutForm.end) return;
    setBlackoutSaving(true);
    try {
      const r = await fetch(`/api/drivers/${blackoutModal._id}/blackout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(blackoutForm),
      });
      const d = await r.json();
      if (r.ok) {
        toastSuccess("Période de congé ajoutée.");
        setBlackoutModal(d.driver);
        setMyDrivers((prev) => prev.map((drv) => (drv._id === d.driver._id ? d.driver : drv)));
        setBlackoutForm({ start: "", end: "", reason: "" });
      } else toastError(d.message || "Erreur.");
    } catch { toastError("Erreur réseau."); }
    setBlackoutSaving(false);
  };

  const handleRemoveBlackout = async (blackoutId) => {
    if (!blackoutModal || !token) return;
    try {
      const r = await fetch(`/api/drivers/${blackoutModal._id}/blackout/${blackoutId}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (r.ok) {
        setBlackoutModal(d.driver);
        setMyDrivers((prev) => prev.map((drv) => (drv._id === d.driver._id ? d.driver : drv)));
      } else toastError(d.message || "Erreur.");
    } catch { toastError("Erreur réseau."); }
  };

  // ── Édition profil chauffeur ────────────────────────────────────────────
  // Bug réel corrigé (audit) : PATCH /api/drivers/:id fonctionnait déjà
  // parfaitement côté serveur (updateDriver, whitelist complète), mais aucun
  // bouton "Modifier" ni aucun appel à cette route n'existait côté frontend —
  // seule option pour corriger une faute de frappe/un tarif/une photo était
  // de supprimer le profil et le recréer (perte des avis/missionsTotal, retour
  // à "pending").
  const [driverEditModal,   setDriverEditModal]   = useState(null); // driver en cours d'édition
  const [driverEditForm,    setDriverEditForm]    = useState(null);
  const [driverEditSaving,  setDriverEditSaving]  = useState(false);
  const [driverEditCvName,  setDriverEditCvName]  = useState("");

  const openDriverEdit = (drv) => {
    setDriverEditModal(drv);
    setDriverEditForm({
      firstName: drv.firstName || "", lastName: drv.lastName || "", phone: drv.phone || "",
      title: drv.title || "", description: drv.description || "",
      tarif: drv.tarif ?? "", tarifDemiJournee: drv.tarifDemiJournee ?? "", tarifHeure: drv.tarifHeure ?? "",
      disponibilite: drv.disponibilite || "", zone: drv.zone || "", ville: drv.ville || "",
      experience: drv.experience ?? "", permisCategorie: drv.permisCategorie || "B",
      vehiculePersonnel: !!drv.vehiculePersonnel, typeVehicule: drv.typeVehicule || "",
      profilePhoto: drv.profilePhoto || null, cv: drv.cv || null,
      images: Array.isArray(drv.images) ? drv.images : [],
    });
    setDriverEditCvName("");
  };

  const handleDriverEditPhotoFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const compressed = await compressImageEdit(ev.target.result, 800, 0.8);
      setDriverEditForm((p) => ({ ...p, profilePhoto: compressed }));
    };
    reader.readAsDataURL(file);
  };

  const handleDriverEditCvFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isPdf = file.type === "application/pdf";
    const isImg = file.type.startsWith("image/");
    if (!isPdf && !isImg) { toastError("CV : PDF ou image uniquement."); return; }
    if (file.size > 8 * 1024 * 1024) { toastError("CV trop volumineux (max 8 Mo)."); return; }
    const reader = new FileReader();
    reader.onload = (ev) => { setDriverEditForm((p) => ({ ...p, cv: ev.target.result })); setDriverEditCvName(file.name); };
    reader.readAsDataURL(file);
  };

  const addDriverEditVehiclePhotos = async (files) => {
    const remaining = 6 - driverEditForm.images.length;
    if (remaining <= 0) return;
    const results = await Promise.all(Array.from(files).slice(0, remaining).map(readFileEdit));
    const valid = results.filter(Boolean);
    setDriverEditForm((p) => ({ ...p, images: [...p.images, ...valid] }));
  };

  const removeDriverEditVehiclePhoto = (idx) => {
    setDriverEditForm((p) => ({ ...p, images: p.images.filter((_, i) => i !== idx) }));
  };

  const handleSaveDriverEdit = async () => {
    if (!driverEditModal || !driverEditForm || !token) return;
    if (!driverEditForm.profilePhoto) { toastError("Photo de profil requise."); return; }
    if (driverEditForm.vehiculePersonnel && driverEditForm.images.length === 0) {
      toastError("Au moins une photo du véhicule est requise."); return;
    }
    setDriverEditSaving(true);
    try {
      const patch = {
        firstName: driverEditForm.firstName, lastName: driverEditForm.lastName, phone: driverEditForm.phone,
        title: driverEditForm.title, description: driverEditForm.description,
        tarif: Number(driverEditForm.tarif) || undefined,
        tarifDemiJournee: Number(driverEditForm.tarifDemiJournee) || undefined,
        tarifHeure: Number(driverEditForm.tarifHeure) || undefined,
        disponibilite: driverEditForm.disponibilite, zone: driverEditForm.zone, ville: driverEditForm.ville,
        experience: Number(driverEditForm.experience) || undefined,
        permisCategorie: driverEditForm.permisCategorie,
        vehiculePersonnel: driverEditForm.vehiculePersonnel,
        typeVehicule: driverEditForm.typeVehicule,
        profilePhoto: driverEditForm.profilePhoto,
        cv: driverEditForm.cv,
        images: driverEditForm.vehiculePersonnel ? driverEditForm.images : [],
      };
      const r = await fetch(`/api/drivers/${driverEditModal._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(patch),
      });
      const d = await r.json();
      if (r.ok) {
        toastSuccess("✅ Profil chauffeur mis à jour.");
        setMyDrivers((prev) => prev.map((drv) => (drv._id === d.driver._id ? d.driver : drv)));
        setDriverEditModal(null);
        setDriverEditForm(null);
      } else toastError(d.message || "Erreur lors de la mise à jour.");
    } catch { toastError("Erreur réseau."); }
    setDriverEditSaving(false);
  };
  const [boostTier,      setBoostTier]      = useState("30d");
  const [boostPromoCode, setBoostPromoCode] = useState("");
  const [boostPricing,   setBoostPricing]   = useState(null); // { "24h": priceUSD, ... } — depuis /api/subscriptions/me
  const [orderFilter,    setOrderFilter]    = useState("all");
  const [statusFilter,   setStatusFilter]   = useState("all");
  // Suppression par sélection (annonces véhicules ET profils chauffeur) —
  // Set d'IDs cochés, vidé après chaque suppression réussie ou changement de filtre.
  const [selectedVehicleIds, setSelectedVehicleIds] = useState(new Set());
  const [selectedDriverIds,  setSelectedDriverIds]  = useState(new Set());
  const [bulkDeleting,       setBulkDeleting]        = useState(false);
  const [searchQuery,    setSearchQuery]    = useState("");
  const [rejectModal,    setRejectModal]    = useState(null);
  const [rejectNote,     setRejectNote]     = useState("");
  const [rejectReasonCode, setRejectReasonCode] = useState("");
  const [promoModal,     setPromoModal]     = useState(null); // véhicule en cours d'édition promo
  // Plusieurs règles simultanées possibles (ex. "-15% dès 3 jours" ET "-25%
  // dès 7 jours" ET "-10000 dès 2 jours pour un règlement comptant") — voir
  // Vehicle.promotions et server/utils/promotion.js.
  const [promoRules,     setPromoRules]     = useState([]);
  const [promoSaving,    setPromoSaving]    = useState(false);
  const emptyPromoRule = () => ({ type: "percent", value: 15, minDays: 1, label: "", active: true, startDate: "", endDate: "" });

  // ── Journal d'entretien/incident/dommage par véhicule ─────────────────────
  const [maintenanceModal,       setMaintenanceModal]       = useState(null); // véhicule en cours de consultation
  const [maintenanceLogs,        setMaintenanceLogs]        = useState([]);
  const [maintenanceLoading,     setMaintenanceLoading]     = useState(false);
  const [maintenanceForm,        setMaintenanceForm]        = useState({ type: "entretien", description: "", cost: "", kilometrage: "" });
  const [maintenanceSubmitting,  setMaintenanceSubmitting]  = useState(false);

  const [editModal,  setEditModal]  = useState(null); // véhicule en cours d'édition
  const [editForm,   setEditForm]   = useState(null);
  // Devise de saisie du prix en édition (affichage uniquement, voir même
  // logique que VendorSubmit.jsx) — editForm.pricePerDay/priceForSale restent
  // toujours en USD, seule la valeur brute affichée change de devise.
  const [editPriceCurrency, setEditPriceCurrency] = useState("USD");
  const [editPriceEntryPerDay, setEditPriceEntryPerDay] = useState("");
  const [editPriceEntryForSale, setEditPriceEntryForSale] = useState("");
  // Bug réel corrigé (audit) : la caution était étiquetée "USD" mais n'avait
  // aucune conversion (contrairement au prix) — voir VendorSubmit.jsx pour le
  // même correctif à la création.
  const [editCautionEntry, setEditCautionEntry] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editPhotos, setEditPhotos] = useState([]); // [{ id, preview }] — photos actuelles + nouvelles
  // Conversion en annonce Import/Export — prix/devise/destinations n'existent
  // pas sur Vehicle, demandés séparément avant l'appel à convert-to-export.
  const [exportMode, setExportMode] = useState(false);
  const [exportForm, setExportForm] = useState({ price: "", currency: "XOF", availableIn: [], sourceCity: "" });
  const [exportAvailText, setExportAvailText] = useState("");
  const [exportSaving, setExportSaving] = useState(false);
  const [gererModalId,   setGererModalId]   = useState(null);
  const [orderDetail,    setOrderDetail]    = useState(null);
  const [detailLoading,  setDetailLoading]  = useState(false);
  const [myDrivers,      setMyDrivers]      = useState([]);
  const [driverLoading,  setDriverLoading]  = useState(false);
  const [employmentRequests, setEmploymentRequests] = useState([]);
  const [employmentLoading,  setEmploymentLoading]  = useState(false);
  const [employmentDeclining, setEmploymentDeclining] = useState(null); // id en cours de refus
  const [refreshing,     setRefreshing]     = useState(false);

  // ── Réservations personnelles (en tant que client) ─────────────────────────
  const [myPersonalBookings,  setMyPersonalBookings]  = useState([]);
  const [personalLoading,     setPersonalLoading]     = useState(false);
  const [personalValidating,  setPersonalValidating]  = useState(null);
  const [personalDispute,     setPersonalDispute]     = useState(null);
  const [personalDisputeText, setPersonalDisputeText] = useState("");

  useEffect(() => {
    if (!isAuthenticated || !token) { setSubLoading(false); return; }
    fetch("/api/subscriptions/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => { setSubscription(d.subscription); setBoostPricing(d.pricing?.boosts || null); })
      .catch(() => {}).finally(() => setSubLoading(false));
  }, [isAuthenticated, token]);

  // Taux de commission courants (standard ou premium selon l'abonnement actif) —
  // remplace DEFAULT_COMM_RATE dès que la config admin est chargée, pour ne
  // jamais afficher une prévision de commission périmée.
  useEffect(() => {
    fetch("/api/pricing/config")
      .then((r) => r.json())
      .then((d) => setCommRates(d.commissions))
      .catch(() => {});
  }, []);

  const isPremiumPartner = !!(subscription?.plan && subscription.plan !== "free" && subscription?.planDetails?.isActive);
  // PricingConfig utilise la clé "vente" (pricingEngine.BOOKING_TYPE_TO_PRICING_TYPE),
  // la réservation utilise "essai" — on remappe pour indexer par booking.type.
  const activeCommRates = useMemo(() => {
    const tier = commRates && (isPremiumPartner ? commRates.premium : commRates.standard);
    if (!tier) return DEFAULT_COMM_RATE;
    return { location: tier.location, essai: tier.vente, chauffeur: tier.chauffeur, leasing: tier.leasing };
  }, [commRates, isPremiumPartner]);

  const myVehicleIds = useMemo(() => new Set(myVehicles.map((v) => String(v.id || v._id))), [myVehicles]);

  const localOrders = useMemo(
    () => bookings.filter((b) => myVehicleIds.has(String(b.vehicleId))),
    [bookings, myVehicleIds]
  );

  // ── Fetch des réservations perso (client) ─────────────────────────────────
  const fetchPersonalBookings = useCallback(async () => {
    if (!token) return;
    setPersonalLoading(true);
    try {
      const res = await fetch("/api/bookings/mine", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const { bookings: raw } = await res.json();
      if (Array.isArray(raw)) {
        setMyPersonalBookings(raw.map((b) => {
          const veh = b.vehicle;
          const drv = b.driver;
          return {
            id:          b._id?.toString(),
            _id:         b._id?.toString(),
            status:      b.status || "pending",
            type:        b.type,
            reference:   b.reference,
            vehicleName: veh
              ? [veh.title, veh.marque, veh.modele].filter(Boolean).join(" ")
              : (drv ? `${drv.firstName || ""} ${drv.lastName || ""}`.trim() : "Véhicule"),
            startDate:   b.location?.startDate,
            endDate:     b.location?.endDate,
            days:        b.location?.days,
            montantTotal: b.montantTotal,
            transaction: b.transaction,
            clientValidation: b.clientValidation,
            createdAt:   b.createdAt,
            isPaid:      b.isPaid,
            devise:      b.devise || "USD",
            partnerName: veh?.contactNom || (drv ? `${drv.firstName} ${drv.lastName}` : null),
          };
        }));
      }
    } catch { /* ignore */ }
    finally { setPersonalLoading(false); }
  }, [token]);

  // Valider ou contester une transaction (en tant que client)
  const handlePersonalValidate = useCallback(async (bookingId, action, reason) => {
    if (!token || !bookingId) return;
    setPersonalValidating(bookingId);
    try {
      const r = await fetch(`/api/bookings/${bookingId}/validate`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ action, disputeReason: reason }),
      });
      const d = await r.json();
      if (r.ok) {
        toastSuccess(action === "validate" ? "✅ Transaction validée !" : "⚠️ Litige enregistré.");
        setPersonalDispute(null);
        setPersonalDisputeText("");
        await fetchPersonalBookings();
      } else {
        toastError(d.message || "Erreur lors de la validation.");
      }
    } catch { toastError("Erreur réseau."); }
    finally { setPersonalValidating(null); }
  }, [token, fetchPersonalBookings, toastSuccess, toastError]);

  // Charger au montage et quand l'onglet "reservations" est actif
  useEffect(() => {
    if (activeTab === "reservations") fetchPersonalBookings();
  }, [activeTab, fetchPersonalBookings]);

  const allOrders = useMemo(() => {
    const map = new Map();
    localOrders.forEach((b) => map.set(String(b.id), b));
    partnerBookings.forEach((b) => map.set(String(b.id), { ...map.get(String(b.id)), ...b }));
    return Array.from(map.values()).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [localOrders, partnerBookings]);

  const gererModal = useMemo(
    () => (gererModalId != null ? allOrders.find((o) => String(o.id) === String(gererModalId)) ?? null : null),
    [gererModalId, allOrders]
  );

  const filteredOrders = useMemo(() => {
    let list = allOrders;
    if (orderFilter !== "all") {
      const map = {
        new:       ["À confirmer", "pending"],
        active:    ["confirmed", "preparing", "ready", "in_progress", "client_arrived", "client_absent"],
        validate:  ["waiting_client_validation"],
        done:      ["completed"],
        cancelled: ["cancelled", "disputed", "transaction_not_concluded"],
      };
      list = list.filter((b) => (map[orderFilter] || []).includes(b.status));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((b) => (
        (b.reference || "").toLowerCase().includes(q) ||
        (b.firstName || "").toLowerCase().includes(q) ||
        (b.lastName  || "").toLowerCase().includes(q) ||
        (b.vehicleName || "").toLowerCase().includes(q) ||
        (b.clientInfo?.firstName || "").toLowerCase().includes(q)
      ));
    }
    return list;
  }, [allOrders, orderFilter, searchQuery]);

  const filteredVehicles = useMemo(
    () => statusFilter === "all" ? myVehicles : myVehicles.filter((v) => (v.status || "pending") === statusFilter),
    [myVehicles, statusFilter]
  );

  // Statistiques réelles — revenu/commission/reversement viennent de
  // l'agrégation serveur (partnerStats, getPartnerStats) dès qu'elle a
  // répondu ; repli sur un calcul client approximatif (taux de commission
  // encore en dur ici en dernier recours) tant qu'elle n'a pas chargé.
  const stats = useMemo(() => {
    const completed  = allOrders.filter((b) => b.status === "completed");
    const pending    = allOrders.filter((b) => ["À confirmer","pending"].includes(b.status));
    const active     = allOrders.filter((b) => ["confirmed","preparing","ready","in_progress","client_arrived","client_absent"].includes(b.status));
    const waiting    = allOrders.filter((b) => b.status === "waiting_client_validation");

    let revenue, netRevenue;
    if (partnerStats) {
      revenue    = partnerStats.totalRevenue;
      netRevenue = partnerStats.totalPayout;
    } else {
      revenue    = completed.reduce((s, b) => s + (b.transaction?.finalAmount || b.montantTotal || 0), 0);
      const commission = completed.reduce((s, b) => s + (b.commissionAmount || Math.round((b.montantTotal || 0) * 0.15)), 0);
      netRevenue = Math.max(revenue - commission - completed.length * SERVICE_FEE, 0);
    }

    return { totalVehicles: myVehicles.length, approved: myVehicles.filter((v) => v.status === "approved").length, totalOrders: allOrders.length, pending: pending.length, active: active.length, waiting: waiting.length, completed: completed.length, revenue, netRevenue };
  }, [allOrders, myVehicles, partnerStats]);

  // Un particulier vendant 1-2 véhicules personnels n'a aucun usage des outils
  // multi-entités (Mes entreprises) ni de l'import de flotte en masse — ces
  // sections lui étaient pourtant montrées comme à n'importe quel partenaire
  // professionnel, sans distinction. Manque réel trouvé en audit.
  const isIndividualSeller = user.sellerType === "particulier" && !user.isFounder;

  const PLAN_LABELS = { individuel_plus: "Individuel Plus", business: "Business", exportateur: "Exportateur" };
  const isPro   = subscription?.plan && subscription.plan !== "free" && subscription?.planDetails?.isActive;
  const planName = isPro ? (PLAN_LABELS[subscription.plan] || subscription.plan) : null;
  const proEnd  = subscription?.planDetails?.endDate ? new Date(subscription.planDetails.endDate).toLocaleDateString("fr-FR") : null;

  /* ── Actions ─────────────────────────────────────────────────────────────── */
  const handleBoost = async (vehicleId, tier = "30d", promoCode = "") => {
    if (!token) { navigate("/login?returnTo=/vendor/dashboard"); return; }
    setBoostTarget(vehicleId);
    try {
      const r = await fetch("/api/subscriptions/boost", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ vehicleId, tier, promoCode: promoCode.trim() || undefined }),
      });
      const d = await r.json();
      if (r.ok) { toastSuccess(d.message || "Demande de mise en avant envoyée — en attente de confirmation du paiement."); setBoostModal(null); setBoostPromoCode(""); }
      else toastError(d.message || "Erreur.");
    } catch { toastError("Erreur réseau."); }
    finally { setBoostTarget(null); }
  };

  const BOOST_TIER_LABELS = { "24h": "24 heures", "7d": "7 jours", "30d": "30 jours", international: "Internationale" };

  const handleOpenPromo = (vehicle) => {
    const existing = Array.isArray(vehicle.promotions) ? vehicle.promotions : [];
    setPromoRules(existing.map((r) => ({
      type:      r.type === "fixed" ? "fixed" : "percent",
      value:     r.value ?? 15,
      minDays:   r.minDays || 1,
      label:     r.label || "",
      active:    r.active !== false,
      startDate: r.startDate ? new Date(r.startDate).toISOString().split("T")[0] : "",
      endDate:   r.endDate   ? new Date(r.endDate).toISOString().split("T")[0]   : "",
    })));
    setPromoModal(vehicle);
  };

  const addPromoRule    = () => setPromoRules((rules) => [...rules, emptyPromoRule()]);
  const removePromoRule = (i) => setPromoRules((rules) => rules.filter((_, idx) => idx !== i));
  const updatePromoRule = (i, patch) => setPromoRules((rules) => rules.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  const handleSavePromo = async () => {
    if (!promoModal || !token) return;
    const vid = promoModal.id || promoModal._id;
    setPromoSaving(true);
    try {
      const r = await fetch(`/api/vehicles/${vid}/promotion`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rules: promoRules }),
      });
      const d = await r.json();
      if (r.ok) {
        toastSuccess(promoRules.length > 0 ? "🏷️ Promotions enregistrées." : "Promotions supprimées.");
        setPromoModal(null);
        loadPartnerVehicles();
      } else toastError(d.message || "Erreur.");
    } catch { toastError("Erreur réseau."); }
    finally { setPromoSaving(false); }
  };

  const handleOpenMaintenance = async (vehicle) => {
    setMaintenanceModal(vehicle);
    setMaintenanceForm({ type: "entretien", description: "", cost: "", kilometrage: "" });
    setMaintenanceLoading(true);
    try {
      const vidVal = vehicle.id || vehicle._id;
      const r = await fetch(`/api/vehicles/${vidVal}/maintenance`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      setMaintenanceLogs(r.ok ? (d.logs || []) : []);
    } catch { setMaintenanceLogs([]); }
    setMaintenanceLoading(false);
  };

  const handleAddMaintenanceLog = async () => {
    if (!maintenanceModal || !token || !maintenanceForm.description.trim()) return;
    const vidVal = maintenanceModal.id || maintenanceModal._id;
    setMaintenanceSubmitting(true);
    try {
      const r = await fetch(`/api/vehicles/${vidVal}/maintenance`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(maintenanceForm),
      });
      const d = await r.json();
      if (r.ok) {
        toastSuccess("Entrée ajoutée au journal.");
        setMaintenanceLogs((prev) => [d.log, ...prev]);
        setMaintenanceForm({ type: "entretien", description: "", cost: "", kilometrage: "" });
      } else toastError(d.message || "Erreur.");
    } catch { toastError("Erreur réseau."); }
    setMaintenanceSubmitting(false);
  };

  const handleDeleteMaintenanceLog = async (logId) => {
    if (!token) return;
    const vidVal = maintenanceModal.id || maintenanceModal._id;
    try {
      const r = await fetch(`/api/vehicles/${vidVal}/maintenance/${logId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setMaintenanceLogs((prev) => prev.filter((l) => l._id !== logId));
      else toastError("Erreur lors de la suppression.");
    } catch { toastError("Erreur réseau."); }
  };

  // Le bouton "Modifier" pointait auparavant vers /vendor?edit=<id>, une route
  // jamais lue par VendorSubmit.jsx (aucune donnée n'était jamais préremplie ni
  // sauvegardée) — un lien mort depuis toujours. Édition complète désormais :
  // tous les champs de l'annonce (y compris photos, type location/vente, pays)
  // via le PATCH déjà fonctionnel côté serveur (vehicleController.updateVehicle).
  // getMyVehicles (liste) ne renvoie plus qu'une seule image par véhicule
  // (optimisation payload liste — voir vehicleScoring.limitVehicleImages) : il
  // faut recharger le véhicule en entier (getVehicleById, jamais tronqué) pour
  // éditer la galerie complète.
  const MAX_PHOTOS_EDIT = 6;
  const compressImageEdit = (dataUrl, maxDim, quality) =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });

  const readFileEdit = (file) =>
    new Promise((resolve) => {
      if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) return resolve(null);
      const reader = new FileReader();
      reader.onload = async (e) => resolve(await compressImageEdit(e.target.result, 1600, 0.78));
      reader.readAsDataURL(file);
    });

  const addEditPhotos = async (files) => {
    const remaining = MAX_PHOTOS_EDIT - editPhotos.length;
    if (remaining <= 0) return;
    const results = await Promise.all(Array.from(files).slice(0, remaining).map(readFileEdit));
    const valid = results.filter(Boolean).map((preview) => ({ id: `${Date.now()}-${Math.random()}`, preview }));
    setEditPhotos((prev) => [...prev, ...valid]);
  };

  const removeEditPhoto = (id) => setEditPhotos((prev) => prev.filter((p) => p.id !== id));

  const handleOpenEdit = async (vehicle) => {
    const vid = vehicle.id || vehicle._id;
    setEditLoading(true);
    setEditModal(vehicle);
    setExportMode(false);
    setExportForm({ price: "", currency: "XOF", availableIn: [], sourceCity: "" });
    try {
      const r = await fetch(`/api/vehicles/${vid}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const d = await r.json().catch(() => null);
      const v = d?.vehicle || vehicle;
      // Si un montant exact a déjà été saisi (voir Vehicle.js pricePerDayEntered),
      // le réafficher tel quel avec sa devise d'origine plutôt que de retomber
      // sur le prix USD stocké (arrondi) affiché comme si c'était de l'USD.
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
        type:        v.type || (vehicle.mode === "Acheter" ? "vente" : "location"),
        title:       v.title || vehicle.name || "",
        marque:      v.marque || "",
        modele:      v.modele || "",
        annee:       v.annee || new Date().getFullYear(),
        etat:        v.etat || "Bon état",
        vehicleType: v.vehicleType || "SUV",
        couleur:     v.couleur || "",
        carburant:   v.carburant || "Essence",
        transmission: v.transmission || "Automatique",
        nombrePlaces: v.nombrePlaces || 5,
        nombrePortes: v.nombrePortes || 5,
        kilometrage: v.kilometrage || "",
        climatisation: !!v.climatisation,
        rentalDurationType: v.rentalDurationType || "les_deux",
        pricePerDay: v.pricePerDay || "",
        priceForSale: v.priceForSale || "",
        caution:     v.caution || "",
        country:     v.country || "",
        ville:       v.ville || "",
        adresse:     v.adresse || "",
        contactNom:  v.contactNom || "",
        contactTel:  v.contactTel || "",
        // "" = automatique (devise du visiteur) — voir Vehicle.currency.
        currency:    v.currency || "",
        description: v.description || "",
        ageMin:      v.ageMin || "",
        permisRequis: v.permisRequis !== false,
        assuranceOptionnelle: !!v.assuranceOptionnelle,
        conditionsLocation: v.conditionsLocation || "",
        conditionsVente:    v.conditionsVente || "",
        withDriver:  !!v.withDriver,
        available:   v.available !== false,
        // Bug réel corrigé (audit) : le backend acceptait déjà leasing/credit
        // en édition (EDITABLE inclut ces deux clés), mais editForm ne les
        // reprenait jamais — impossible de corriger un taux erroné ou de
        // désactiver l'option après publication (pattern "modale d'édition
        // en retard sur la création", voir VendorSubmit.jsx pour l'original).
        leasing: {
          disponible:    !!v.leasing?.disponible,
          apportInitial: v.leasing?.apportInitial ?? "",
          mensualite:    v.leasing?.mensualite ?? "",
          duree:         v.leasing?.duree ?? 36,
          tauxInteret:   v.leasing?.tauxInteret ?? 8,
          description:   v.leasing?.description ?? "",
        },
        credit: {
          disponible:    !!v.credit?.disponible,
          apportInitial: v.credit?.apportInitial ?? "",
          mensualite:    v.credit?.mensualite ?? "",
          duree:         v.credit?.duree ?? 36,
          tauxInteret:   v.credit?.tauxInteret ?? 8,
          description:   v.credit?.description ?? "",
        },
      });
      setEditPhotos((v.images || []).map((preview, i) => ({ id: `existing-${i}`, preview })));
    } catch {
      toastError("Impossible de charger l'annonce complète.");
      setEditModal(null);
    } finally {
      setEditLoading(false);
    }
  };

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

  const handleSaveEdit = async () => {
    if (!editModal || !editForm) return;
    if (editPhotos.length === 0) { toastError("Ajoutez au moins une photo."); return; }
    const vid = editModal.id || editModal._id;
    setEditSaving(true);
    try {
      const images = editPhotos.map((p) => p.preview);
      const patch = {
        type:        editForm.type,
        title:       editForm.title,
        marque:      editForm.marque,
        modele:      editForm.modele,
        annee:       Number(editForm.annee) || undefined,
        etat:        editForm.etat,
        vehicleType: editForm.vehicleType,
        couleur:     editForm.couleur,
        carburant:   editForm.carburant,
        transmission: editForm.transmission,
        nombrePlaces: Number(editForm.nombrePlaces) || undefined,
        nombrePortes: Number(editForm.nombrePortes) || undefined,
        kilometrage: Number(editForm.kilometrage) || 0,
        climatisation: editForm.climatisation,
        rentalDurationType: editForm.rentalDurationType,
        caution:     Number(editForm.caution) || 0,
        cautionEntered: editCautionEntry !== "" && !isNaN(Number(editCautionEntry)) ? Number(editCautionEntry) : null,
        description: editForm.description,
        country:     editForm.country || null,
        ville:       editForm.ville,
        adresse:     editForm.adresse,
        contactNom:  editForm.contactNom,
        contactTel:  editForm.contactTel,
        currency:    editForm.currency || null,
        ageMin:      Number(editForm.ageMin) || 0,
        permisRequis: editForm.permisRequis,
        assuranceOptionnelle: editForm.assuranceOptionnelle,
        conditionsLocation: editForm.conditionsLocation,
        conditionsVente:    editForm.conditionsVente,
        withDriver:  editForm.withDriver,
        available:   editForm.available,
        images,
      };
      // Montant exact tel que tapé (évite la perte de précision de l'aller-
      // retour de conversion via l'USD stocké — voir Vehicle.js pricePerDayEntered).
      if (editForm.type === "vente") {
        patch.priceForSale = Number(editForm.priceForSale) || 0;
        patch.priceForSaleEntered = editPriceEntryForSale !== "" && !isNaN(Number(editPriceEntryForSale)) ? Number(editPriceEntryForSale) : null;
        patch.leasing = {
          disponible:    editForm.leasing.disponible,
          apportInitial: Number(editForm.leasing.apportInitial) || 0,
          mensualite:    Number(editForm.leasing.mensualite) || 0,
          duree:         Number(editForm.leasing.duree) || 36,
          tauxInteret:   Number(editForm.leasing.tauxInteret) || 8,
          description:   editForm.leasing.description,
        };
        patch.credit = {
          disponible:    editForm.credit.disponible,
          apportInitial: Number(editForm.credit.apportInitial) || 0,
          mensualite:    Number(editForm.credit.mensualite) || 0,
          duree:         Number(editForm.credit.duree) || 36,
          tauxInteret:   Number(editForm.credit.tauxInteret) || 8,
          description:   editForm.credit.description,
        };
      } else {
        patch.pricePerDay = Number(editForm.pricePerDay) || 0;
        patch.pricePerDayEntered = editPriceEntryPerDay !== "" && !isNaN(Number(editPriceEntryPerDay)) ? Number(editPriceEntryPerDay) : null;
      }
      patch.priceEntryCurrency = editPriceCurrency;

      // Régénère la vignette dédiée à partir de la photo de couverture actuelle
      // (vues liste — voir vehicleScoring.limitVehicleImages / VendorSubmit.jsx).
      if (images[0]) {
        patch.thumbnail = await compressImageEdit(images[0], 480, 0.6);
      }

      // Adresse modifiée → re-géocoder pour garder les frais de livraison à
      // jour (voir VendorSubmit.jsx, même logique à la publication initiale).
      if (editForm.adresse !== editModal.adresse || editForm.ville !== editModal.ville) {
        const coords = await geocodeAddress(`${editForm.adresse}, ${editForm.ville}`);
        if (coords) patch.coordonnees = coords;
      }

      await updateVehicle(vid, patch);
      toastSuccess("✅ Annonce mise à jour.");
      setEditModal(null);
      setEditPhotos([]);
      loadPartnerVehicles();
    } catch (err) {
      toastError(err.message || "Erreur lors de la mise à jour.");
    } finally {
      setEditSaving(false);
    }
  };

  const addExportAvail = () => {
    const c = exportAvailText.trim();
    if (c && !exportForm.availableIn.includes(c)) setExportForm((p) => ({ ...p, availableIn: [...p.availableIn, c] }));
    setExportAvailText("");
  };

  const handleConvertToExport = async () => {
    if (!editModal) return;
    if (!exportForm.price || Number(exportForm.price) <= 0) { toastError("Indiquez un prix d'export."); return; }
    if (exportForm.availableIn.length === 0) { toastError("Indiquez au moins un pays de destination."); return; }
    const vid = editModal.id || editModal._id;
    setExportSaving(true);
    try {
      const res = await fetch(`/api/vehicles/${vid}/convert-to-export`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          price: Number(exportForm.price),
          currency: exportForm.currency,
          availableIn: exportForm.availableIn,
          sourceCity: exportForm.sourceCity,
        }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.message || "Erreur lors de la conversion.");
      toastSuccess("🌍 Annonce transformée en export, soumise à modération.");
      setEditModal(null);
      setEditPhotos([]);
      setExportMode(false);
      loadPartnerVehicles();
    } catch (err) {
      toastError(err.message || "Erreur réseau.");
    } finally {
      setExportSaving(false);
    }
  };

  const handleContactClient = async (bookingId) => {
    if (contactingOrder || !bookingId) return;
    setContactingOrder(bookingId);
    const res = await openOrCreateChat("client_partner", null, bookingId);
    if (!res.ok) toastError(res.message || "Impossible d'ouvrir la conversation.");
    setContactingOrder(null);
  };

  const handleDeleteVehicle = async (id) => {
    if (!confirm("Supprimer définitivement cette annonce ?")) return;
    try { await fetch(`/api/vehicles/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }); }
    catch { /* ignore */ }
    loadPartnerVehicles();
  };

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
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: [...selectedVehicleIds] }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { toastSuccess(d.message || "Annonces supprimées."); setSelectedVehicleIds(new Set()); loadPartnerVehicles(); }
      else toastError(d.message || "Erreur lors de la suppression.");
    } catch { toastError("Erreur réseau."); }
    setBulkDeleting(false);
  };

  const [bulkUpdating, setBulkUpdating] = useState(false);
  const handleBulkAdjustPrice = async () => {
    if (selectedVehicleIds.size === 0) return;
    const input = prompt("Ajuster le prix de la sélection de quel pourcentage ? (ex : 10 pour +10%, -15 pour -15%)");
    if (input === null) return;
    const pct = Number(input);
    if (!Number.isFinite(pct) || pct === 0) { toastError("Pourcentage invalide."); return; }
    setBulkUpdating(true);
    try {
      const r = await fetch("/api/vehicles/bulk-update", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: [...selectedVehicleIds], priceAdjustPercent: pct }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { toastSuccess(d.message || "Prix mis à jour."); setSelectedVehicleIds(new Set()); loadPartnerVehicles(); }
      else toastError(d.message || "Erreur.");
    } catch { toastError("Erreur réseau."); }
    setBulkUpdating(false);
  };

  const handleBulkTogglePause = async (paused) => {
    if (selectedVehicleIds.size === 0) return;
    setBulkUpdating(true);
    try {
      const r = await fetch("/api/vehicles/bulk-update", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: [...selectedVehicleIds], manuallyPaused: paused }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { toastSuccess(paused ? "Véhicules mis en pause." : "Disponibilité reprise."); setSelectedVehicleIds(new Set()); loadPartnerVehicles(); }
      else toastError(d.message || "Erreur.");
    } catch { toastError("Erreur réseau."); }
    setBulkUpdating(false);
  };

  const handleBulkDeleteDrivers = async () => {
    if (selectedDriverIds.size === 0) return;
    if (!confirm(`Supprimer définitivement ${selectedDriverIds.size} profil(s) sélectionné(s) ?`)) return;
    setBulkDeleting(true);
    try {
      const r = await fetch("/api/drivers/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: [...selectedDriverIds] }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        toastSuccess(d.message || "Profils supprimés.");
        setMyDrivers((prev) => prev.filter((drv) => !selectedDriverIds.has(drv._id)));
        setSelectedDriverIds(new Set());
      } else toastError(d.message || "Erreur lors de la suppression.");
    } catch { toastError("Erreur réseau."); }
    setBulkDeleting(false);
  };

  const doUpdateStatus = useCallback(async (id, status) => {
    const result = await updateBookingStatus(id, status);
    if (result.ok) setTimeout(() => refreshOrders(), 800);
    return result;
  }, [updateBookingStatus, refreshOrders]);

  // Le toast de succès n'apparaît que si le backend a réellement accepté le
  // changement — avant ce correctif il s'affichait inconditionnellement,
  // masquant les refus (ex: 409 "financement non accepté", voir
  // bookingController.updateBookingStatus) derrière un message de succès.
  const handleConfirm = useCallback(async (id) => {
    const r = await doUpdateStatus(id, "confirmed");
    if (r.ok) toastSuccess("✅ Commande acceptée."); else toastError(r.message || "Impossible d'accepter la commande.");
  }, [doUpdateStatus, toastSuccess, toastError]);
  const handlePrepare = useCallback(async (id) => {
    const r = await doUpdateStatus(id, "preparing");
    if (r.ok) toastSuccess("⚙️ En préparation."); else toastError(r.message || "Impossible de passer en préparation.");
  }, [doUpdateStatus, toastSuccess, toastError]);
  const handleReady = useCallback(async (id) => {
    const r = await doUpdateStatus(id, "ready");
    if (r.ok) toastSuccess("🚗 Véhicule prêt."); else toastError(r.message || "Impossible de marquer le véhicule prêt.");
  }, [doUpdateStatus, toastSuccess, toastError]);
  const handleInProgress = useCallback(async (id) => {
    const r = await doUpdateStatus(id, "in_progress");
    if (r.ok) toastSuccess("🚀 En route !"); else toastError(r.message || "Impossible de démarrer la course.");
  }, [doUpdateStatus, toastSuccess, toastError]);
  const handleClientArrived = useCallback(async (id) => {
    const r = await doUpdateStatus(id, "client_arrived");
    if (r.ok) toastSuccess("📍 Client arrivé."); else toastError(r.message || "Impossible d'enregistrer l'arrivée du client.");
  }, [doUpdateStatus, toastSuccess, toastError]);
  const handleClientAbsent = useCallback(async (id) => {
    const r = await doUpdateStatus(id, "client_absent");
    toastError(r.ok ? "🚫 Absence enregistrée." : (r.message || "Impossible d'enregistrer l'absence."));
  }, [doUpdateStatus, toastError]);
  const handleComplete = useCallback(async (id) => {
    const r = await doUpdateStatus(id, "completed");
    if (r.ok) toastSuccess("🏁 Commande terminée."); else toastError(r.message || "Impossible de terminer la commande.");
  }, [doUpdateStatus, toastSuccess, toastError]);
  // Bug réel corrigé (audit) : le bouton "Transaction non conclue" du formulaire
  // de transaction appelait onReject (→ status "cancelled", motif catégorisé
  // obligatoire) au lieu du statut dédié transaction_not_concluded que le
  // backend expose précisément pour ce cas (voir bookingController.js) — la
  // commande était annulée avec la mauvaise sémantique, et le client recevait
  // la notification "réservation annulée" au lieu de "transaction non conclue".
  const handleTransactionNotConcluded = useCallback(async (id) => {
    const r = await doUpdateStatus(id, "transaction_not_concluded");
    if (r.ok) toastError("❌ Transaction non conclue enregistrée."); else toastError(r.message || "Impossible d'enregistrer.");
  }, [doUpdateStatus, toastError]);

  const handleRecordTransaction = useCallback(async (id, txData) => {
    if (!token) return;
    try {
      const r = await fetch(`/api/bookings/${id}/transaction`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(txData) });
      const d = await r.json();
      if (r.ok) { toastSuccess("💰 Transaction enregistrée."); setGererModalId(null); setTimeout(() => { refreshOrders(); loadTransactions(); }, 800); }
      else toastError(d.message || "Erreur.");
    } catch { toastError("Erreur réseau."); }
  }, [token, toastSuccess, toastError, refreshOrders]);

  // Téléchargement PDF authentifié (Bearer) — le lien <a href="/api/contracts/:id/pdf">
  // ne fonctionnait en réalité jamais : ces routes exigent un header
  // Authorization que la navigation d'un simple <a> n'envoie jamais (pas de
  // cookie de session dans cette architecture), donc le clic renvoyait un 401
  // JSON au lieu d'un PDF. Bug réel trouvé en cours d'implémentation.
  const downloadAuthPdf = async (url, filename) => {
    if (!token) return;
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) { toastError("Impossible de télécharger le document."); return; }
      const blob = await r.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl; a.download = filename;
      a.click();
      URL.revokeObjectURL(objUrl);
    } catch { toastError("Erreur réseau."); }
  };

  // Bug réel corrigé (audit) : un partenaire en litige était un simple
  // spectateur passif ("contactez le support VIT AUTO"), sans aucun moyen
  // d'apporter des éléments avant que l'admin ne tranche.
  const handleRespondToDispute = useCallback(async (id, message) => {
    if (!token) return;
    try {
      const r = await fetch(`/api/bookings/${id}/dispute-response`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ message }) });
      const d = await r.json();
      if (r.ok) { toastSuccess("💬 Réponse envoyée à l'administration."); setTimeout(() => refreshOrders(), 500); }
      else toastError(d.message || "Erreur.");
      return { ok: r.ok, message: d.message };
    } catch { toastError("Erreur réseau."); return { ok: false }; }
  }, [token, toastSuccess, toastError, refreshOrders]);

  const handleClaimCaution = useCallback(async (id, payload) => {
    if (!token) return;
    try {
      const r = await fetch(`/api/bookings/${id}/caution`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
      const d = await r.json();
      if (r.ok) { toastSuccess("💳 Caution traitée."); setTimeout(() => refreshOrders(), 500); }
      else toastError(d.message || "Erreur.");
    } catch { toastError("Erreur réseau."); }
  }, [token, toastSuccess, toastError, refreshOrders]);

  const handlePartnerConfirm = useCallback(async (id, payload) => {
    if (!token) return;
    try {
      const r = await fetch(`/api/bookings/${id}/partner-confirm`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
      const d = await r.json();
      if (r.ok) {
        if (!payload.clientPresent) toastError("🚫 Absence enregistrée.");
        else toastSuccess(`✅ Transaction enregistrée — ${Number(payload.finalAmount).toLocaleString("fr-FR")} USD. Attente validation client.`);
        setGererModalId(null);
        setTimeout(() => { refreshOrders(); loadTransactions(); }, 800);
      } else toastError(d.message || "Erreur.");
    } catch { toastError("Erreur réseau."); }
  }, [token, toastSuccess, toastError, refreshOrders]);

  const loadInvoices = useCallback(async () => {
    if (!token) return;
    setInvoiceLoading(true);
    try { const r = await fetch("/api/invoices/mine", { headers: { Authorization: `Bearer ${token}` } }); if (r.ok) { const d = await r.json(); setInvoices(d.invoices || []); } }
    catch { /* ignore */ }
    setInvoiceLoading(false);
  }, [token]);

  // Factures de prestation (une par commande terminée, voir issueServiceInvoice
  // dans bookingController.js) — distinctes des factures mensuelles de commission ci-dessus.
  const loadServiceInvoices = useCallback(async () => {
    if (!token) return;
    setServiceInvoiceLoading(true);
    try { const r = await fetch("/api/service-invoices/mine", { headers: { Authorization: `Bearer ${token}` } }); if (r.ok) { const d = await r.json(); setServiceInvoices(d.invoices || []); } }
    catch { /* ignore */ }
    setServiceInvoiceLoading(false);
  }, [token]);

  const loadTransactions = useCallback(async () => {
    if (!token) return;
    setTxLoading(true);
    try { const r = await fetch("/api/invoices/transactions", { headers: { Authorization: `Bearer ${token}` } }); if (r.ok) { const d = await r.json(); setTransactions(d.transactions || []); } }
    catch { /* ignore */ }
    setTxLoading(false);
  }, [token]);

  const loadPayouts = useCallback(async () => {
    if (!token) return;
    setPayoutLoading(true);
    try {
      const r = await fetch("/api/commission-ledger/mine", { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) { const d = await r.json(); setPayoutTotals(d.totals || null); setPayoutEntries(d.entries || []); }
    } catch { /* ignore */ }
    setPayoutLoading(false);
  }, [token]);

  const loadContracts = useCallback(async () => {
    if (!token) return;
    setContractsLoading(true);
    try {
      const r = await fetch("/api/contracts/mine", { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) { const d = await r.json(); setContracts(d.contracts || []); setLegalDocuments(d.legalDocuments || []); }
    }
    catch { /* ignore */ }
    setContractsLoading(false);
  }, [token]);

  const loadMyDrivers = useCallback(async () => {
    if (!token) return;
    setDriverLoading(true);
    try { const r = await fetch("/api/drivers/mine", { headers: { Authorization: `Bearer ${token}` } }); if (r.ok) { const d = await r.json(); setMyDrivers(d.drivers || []); } }
    catch { /* ignore */ }
    finally { setDriverLoading(false); }
  }, [token]);

  // Propositions d'embauche CDD/CDI reçues pour mes chauffeurs (voir DriverEmployment.jsx côté client)
  const loadEmploymentRequests = useCallback(async () => {
    if (!token) return;
    setEmploymentLoading(true);
    try { const r = await fetch("/api/driver-employment/received", { headers: { Authorization: `Bearer ${token}` } }); if (r.ok) { const d = await r.json(); setEmploymentRequests(d.requests || []); } }
    catch { /* ignore */ }
    finally { setEmploymentLoading(false); }
  }, [token]);

  const respondToEmployment = useCallback(async (requestId, action, reason) => {
    if (!token) return;
    setEmploymentDeclining(requestId);
    try {
      const r = await fetch(`/api/driver-employment/${requestId}/respond`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, reason }),
      });
      if (r.ok) {
        toastSuccess(action === "accept" ? "✅ Proposition acceptée." : "Proposition refusée.");
        loadEmploymentRequests();
      } else {
        const d = await r.json().catch(() => ({}));
        toastError(d.message || "Erreur lors de la réponse.");
      }
    } catch { toastError("Erreur réseau."); }
    finally { setEmploymentDeclining(null); }
  }, [token, loadEmploymentRequests, toastSuccess, toastError]);

  const handleReject = useCallback(async () => {
    if (!rejectModal || !rejectReasonCode) return;
    const r = await updateBookingStatus(rejectModal, "cancelled", rejectNote, rejectReasonCode);
    if (r.ok) {
      toastSuccess("Commande refusée.");
      setRejectModal(null); setRejectNote(""); setRejectReasonCode(""); setGererModalId(null);
      setTimeout(() => refreshOrders(), 800);
    } else {
      toastError(r.message || "Impossible de refuser la commande.");
    }
  }, [rejectModal, rejectNote, rejectReasonCode, updateBookingStatus, toastSuccess, toastError, refreshOrders]);

  const handleGerer = useCallback((order) => {
    setGererModalId(order.id);
    setOrderDetail(null);
  }, []);

  // Charger le détail complet (avec snapshot KYC + images) à l'ouverture du modal
  useEffect(() => {
    if (!gererModalId || !token) return;
    setDetailLoading(true);
    fetch(`/api/bookings/${gererModalId}/detail`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.booking) setOrderDetail(d.booking); })
      .catch(() => {})
      .finally(() => setDetailLoading(false));
  }, [gererModalId, token]);

  const handlePartnerVerifyKyc = useCallback(async (id, decision, note) => {
    if (!token) return;
    try {
      const r = await fetch(`/api/bookings/${id}/partner-kyc-verify`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ decision, note }),
      });
      const d = await r.json();
      if (r.ok) {
        if (decision === "verifie") toastSuccess("✅ Identité client vérifiée en présentiel.");
        else toastError("🚫 Document rejeté. Client notifié.");
        setOrderDetail((prev) => prev ? { ...prev, partnerKycVerification: d.booking?.partnerKycVerification } : prev);
        setTimeout(() => refreshOrders(), 600);
      } else {
        toastError(d.message || "Erreur lors de la vérification.");
      }
    } catch { toastError("Erreur réseau."); }
  }, [token, toastSuccess, toastError, refreshOrders]);

  // Agrégation serveur (server/controllers/bookingController.getPartnerStats)
  // — source de vérité pour revenu/commission/reversement, jamais recalculée
  // approximativement côté client (voir stats ci-dessous).
  const loadPartnerStats = useCallback(async () => {
    if (!token) return;
    try {
      const qs = filterBusinessId ? `?businessId=${filterBusinessId}` : "";
      const r = await fetch(`/api/bookings/partner/stats${qs}`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setPartnerStats(await r.json());
    } catch { /* repli sur le calcul client approximatif ci-dessous */ }
  }, [token, filterBusinessId]);

  useEffect(() => { loadPartnerStats(); }, [loadPartnerStats]);

  // Tendance mensuelle, top véhicules et clientèle récurrente — voir
  // bookingController.getPartnerAnalytics (n'existait pas jusqu'ici : le
  // dashboard n'affichait que des totaux, jamais d'évolution dans le temps
  // ni de vue par client, manque réel trouvé en audit).
  const loadAnalytics = useCallback(async () => {
    if (!token) return;
    try {
      const qs = filterBusinessId ? `?businessId=${filterBusinessId}` : "";
      const r = await fetch(`/api/bookings/partner/analytics${qs}`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setAnalytics(await r.json());
    } catch { /* non bloquant */ }
  }, [token, filterBusinessId]);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  // Recharge la liste des commandes quand le filtre d'entité change (le
  // chargement initial est déjà déclenché par VehicleContext lui-même).
  useEffect(() => { loadPartnerOrders(filterBusinessId || undefined); }, [filterBusinessId, loadPartnerOrders]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshOrders(), loadPartnerVehicles(), loadMyDrivers(), loadInvoices(), loadTransactions(), loadContracts(), loadPartnerStats(), loadAnalytics()]);
    setRefreshing(false);
    toastSuccess("Données actualisées.");
  }, [refreshOrders, loadPartnerVehicles, loadMyDrivers, loadInvoices, loadTransactions, loadPartnerStats, loadAnalytics, toastSuccess]);

  useEffect(() => { loadMyDrivers(); }, [loadMyDrivers]);
  useEffect(() => { loadEmploymentRequests(); }, [loadEmploymentRequests]);
  useEffect(() => { loadInvoices(); loadTransactions(); loadContracts(); loadServiceInvoices(); loadPayouts(); }, [loadInvoices, loadTransactions, loadContracts, loadServiceInvoices, loadPayouts]);

  // ── Temps réel : Socket.io + polling de secours (60s) ─────────────────────
  const prevCountRef = useRef(0);
  const allOrdersRef = useRef(allOrders);
  useEffect(() => { allOrdersRef.current = allOrders; }, [allOrders]);

  useEffect(() => {
    if (!isAuthenticated || !token) return;

    // Socket.io : mise à jour instantanée
    const handleBookingUpdate = async (payload) => {
      await refreshOrders();
      // Toast selon le nouveau statut
      const label = payload.status === "cancelled"           ? `❌ Le client a annulé la commande ${payload.reference || ""}`
                  : payload.status === "waiting_client_validation" ? `⏳ Transaction en attente de validation (${payload.reference || ""})`
                  : payload.status === "completed"           ? `✅ Commande ${payload.reference || ""} validée par le client !`
                  : payload.status === "disputed"            ? `⚠️ Litige ouvert sur la commande ${payload.reference || ""}`
                  : null;
      if (label) toastSuccess(label);
    };

    const cleanupSocket = on("booking_updated", handleBookingUpdate);

    // Polling de secours toutes les 60s (en cas de coupure socket)
    const iv = setInterval(async () => {
      try {
        await refreshOrders();
        const nc = allOrdersRef.current.filter((b) => ["pending","À confirmer"].includes(b.status)).length;
        if (nc > prevCountRef.current) toastSuccess(`🔔 ${nc - prevCountRef.current} nouvelle(s) commande(s) !`);
        prevCountRef.current = nc;
      } catch { /* ignore */ }
    }, 60000);

    return () => {
      cleanupSocket();
      clearInterval(iv);
    };
  }, [isAuthenticated, token, refreshOrders, toastSuccess, on]);

  if (!isAuthenticated) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyFull}>
          <div className={styles.emptyIcon}>🏢</div>
          <h2>Espace Partenaire</h2>
          <p>Connectez-vous avec un compte partenaire pour gérer vos annonces et commandes.</p>
          <Link to="/login" className={styles.btnPrimary}>Se connecter</Link>
        </div>
      </div>
    );
  }

  const newOrdersCount   = stats.pending;
  const waitingCount     = stats.waiting;

  return (
    <div className={styles.page}>

      {/* ══ HEADER PARTENAIRE ══════════════════════════════════════════════ */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerAvatar}>{(user.firstName || "P").charAt(0)}</div>
          <div>
            <h1 className={styles.headerTitle}>Espace Partenaire</h1>
            <p className={styles.headerSub}>Bienvenue, <strong>{user.firstName} {user.lastName}</strong></p>
          </div>
        </div>
        <div className={styles.headerRight}>
          {newOrdersCount > 0 && (
            <button className={styles.alertBadge} onClick={() => { setActiveTab("commandes"); setOrderFilter("new"); }}>
              🔔 {newOrdersCount} nouvelle{newOrdersCount > 1 ? "s" : ""}
            </button>
          )}
          {waitingCount > 0 && (
            <button className={styles.warningBadge} onClick={() => { setActiveTab("commandes"); setOrderFilter("validate"); }}>
              ⏳ {waitingCount} en attente
            </button>
          )}
          <button className={styles.refreshBtn} onClick={handleRefresh} disabled={refreshing}>
            <span style={{ display: "inline-block", animation: refreshing ? "spin .8s linear infinite" : "none" }}>↻</span>
          </button>
          {!isIndividualSeller && (
            <Link to="/partner-fleet-import" style={{ display: "inline-flex", alignItems: "center", padding: "0 18px", background: "#6366f1", color: "#fff", borderRadius: 10, fontWeight: 700, textDecoration: "none", fontSize: ".88rem", whiteSpace: "nowrap" }}>
              📦 Importer ma flotte
            </Link>
          )}
          <Link to="/vendor" className={styles.btnPrimary}>+ Nouvelle annonce</Link>
        </div>
      </header>

      {/* ── Statut de vérification ────────────────────────────────────────────
          Un partenaire bloqué par KYC/certification (voir createVehicle) n'avait
          aucune indication proactive dans son propre espace — seulement une
          erreur 403 au moment de publier. Manque réel trouvé en audit. */}
      {!user.isFounder && isIndividualSeller && user.kycStatus !== "VERIFIE" && (
        <div className={styles.freeBanner} style={{ borderColor: user.kycStatus === "REFUSE" ? "#fca5a5" : "#fde68a" }}>
          <span className={styles.planBadge} style={{ background: user.kycStatus === "REFUSE" ? "#fee2e2" : "#fef3c7", color: user.kycStatus === "REFUSE" ? "#dc2626" : "#d97706" }}>
            {user.kycStatus === "REFUSE" ? "❌ KYC refusé" : "⏳ KYC en attente"}
          </span>
          <span>
            {user.kycStatus === "REFUSE"
              ? "Votre vérification d'identité a été refusée — vous ne pouvez pas publier tant qu'elle n'est pas resoumise."
              : "Complétez votre vérification d'identité (pièce + selfie) pour pouvoir publier vos annonces."}
          </span>
          <Link to="/kyc" className={styles.upgradeLink}>{user.kycStatus === "REFUSE" ? "Resoumettre →" : "Vérifier mon identité →"}</Link>
        </div>
      )}
      {!user.isFounder && !isIndividualSeller && user.certificationBadge === "none" && (
        <div className={styles.freeBanner} style={{ borderColor: "#fde68a" }}>
          <span className={styles.planBadge} style={{ background: "#fef3c7", color: "#d97706" }}>⏳ Certification requise</span>
          <span>Complétez votre vérification partenaire (entreprise/professionnel) pour pouvoir publier vos annonces.</span>
          <Link to="/partner-certification" className={styles.upgradeLink}>Compléter mon dossier →</Link>
        </div>
      )}

      {/* ── Plan Banner ── */}
      {!subLoading && (
        <div className={isPro ? styles.proBanner : styles.freeBanner}>
          <span className={styles.planBadge}>{isPro ? `✨ ${planName}` : "Gratuit"}</span>
          <span>{isPro ? `Plan ${planName} actif jusqu'au ${proEnd}` : "Passez à un plan supérieur pour réduire vos commissions et la mise en avant automatique."}</span>
          {!isPro && SUBSCRIPTIONS_ENABLED && <Link to="/plans" className={styles.upgradeLink}>Voir les plans →</Link>}
        </div>
      )}

      {/* ══ NAVIGATION ════════════════════════════════════════════════════ */}
      <nav className={styles.nav}>
        {[
          { id: "dashboard",    icon: "📊", label: "Dashboard" },
          { id: "commandes",    icon: "📋", label: "Commandes",       count: stats.totalOrders,    alert: newOrdersCount },
          { id: "annonces",     icon: "🚗", label: "Annonces",        count: stats.totalVehicles },
          !isIndividualSeller && { id: "entreprises",  icon: "🏢", label: "Mes entreprises" },
          { id: "calendrier",   icon: "📅", label: "Calendrier" },
          { id: "clients",      icon: "👥", label: "Clients",         count: analytics?.topClients?.length || null },
          { id: "finances",     icon: "💰", label: "Finances",        count: invoices.filter((i) => i.status === "pending").length || null },
          { id: "reservations", icon: "🎫", label: "Mes réservations", alert: myPersonalBookings.filter((b) => b.status === "waiting_client_validation").length || null },
        ].filter(Boolean).map(({ id, icon, label, count, alert }) => (
          <button key={id}
            className={[styles.navTab, activeTab === id ? styles.navTabActive : ""].join(" ")}
            onClick={() => setActiveTab(id)}>
            {icon} {label}
            {count !== null && count !== undefined && count > 0 && (
              <span className={alert > 0 ? styles.navBadgeAlert : styles.navBadge}>{alert > 0 ? alert : count}</span>
            )}
          </button>
        ))}
      </nav>

      {/* ══ TAB : DASHBOARD ═══════════════════════════════════════════════ */}
      {activeTab === "dashboard" && (
        <div className={styles.tabContent}>
          {/* KPIs */}
          <div className={styles.kpiGrid}>
            <div className={styles.kpiCard} style={{ borderTopColor: "#6366f1" }}>
              <div className={styles.kpiIcon} style={{ background: "#eef2ff", color: "#6366f1" }}>📋</div>
              <div className={styles.kpiBody}>
                <div className={styles.kpiValue}>{stats.totalOrders}</div>
                <div className={styles.kpiLabel}>Total commandes</div>
              </div>
            </div>
            <div className={styles.kpiCard} style={{ borderTopColor: "#f59e0b" }}>
              <div className={styles.kpiIcon} style={{ background: "#fffbeb", color: "#d97706" }}>⏳</div>
              <div className={styles.kpiBody}>
                <div className={styles.kpiValue} style={{ color: "#d97706" }}>{stats.pending}</div>
                <div className={styles.kpiLabel}>Nouvelles</div>
              </div>
            </div>
            <div className={styles.kpiCard} style={{ borderTopColor: "#2563eb" }}>
              <div className={styles.kpiIcon} style={{ background: "#dbeafe", color: "#2563eb" }}>🚀</div>
              <div className={styles.kpiBody}>
                <div className={styles.kpiValue} style={{ color: "#2563eb" }}>{stats.active}</div>
                <div className={styles.kpiLabel}>En cours</div>
              </div>
            </div>
            <div className={styles.kpiCard} style={{ borderTopColor: "#059669" }}>
              <div className={styles.kpiIcon} style={{ background: "#d1fae5", color: "#059669" }}>🏁</div>
              <div className={styles.kpiBody}>
                <div className={styles.kpiValue} style={{ color: "#059669" }}>{stats.completed}</div>
                <div className={styles.kpiLabel}>Terminées</div>
              </div>
            </div>
            <div className={styles.kpiCard} style={{ borderTopColor: "#059669" }}>
              <div className={styles.kpiIcon} style={{ background: "#d1fae5", color: "#059669" }}>💵</div>
              <div className={styles.kpiBody}>
                <div className={styles.kpiValue} style={{ color: "#059669", fontSize: "1.1rem" }}>{fmtXOF(stats.netRevenue)}</div>
                <div className={styles.kpiLabel}>Revenus nets</div>
              </div>
            </div>
            <div className={styles.kpiCard} style={{ borderTopColor: "#7c3aed" }}>
              <div className={styles.kpiIcon} style={{ background: "#ede9fe", color: "#7c3aed" }}>🚗</div>
              <div className={styles.kpiBody}>
                <div className={styles.kpiValue}>{stats.approved}<span style={{ fontSize: ".8rem", color: "#9ca3af" }}>/{stats.totalVehicles}</span></div>
                <div className={styles.kpiLabel}>Annonces actives</div>
              </div>
            </div>
          </div>

          {/* Alertes */}
          {newOrdersCount > 0 && (
            <div className={styles.alertBox} onClick={() => { setActiveTab("commandes"); setOrderFilter("new"); }}>
              <span className={styles.alertBoxIcon}>🔔</span>
              <div>
                <strong>{newOrdersCount} nouvelle{newOrdersCount > 1 ? "s" : ""} commande{newOrdersCount > 1 ? "s" : ""} en attente de votre réponse</strong>
                <p>Cliquez pour traiter immédiatement.</p>
              </div>
              <span className={styles.alertBoxArrow}>→</span>
            </div>
          )}
          {waitingCount > 0 && (
            <div className={styles.alertBox} style={{ borderColor: "#fde68a", background: "#fffbeb" }} onClick={() => { setActiveTab("commandes"); setOrderFilter("validate"); }}>
              <span className={styles.alertBoxIcon}>⏳</span>
              <div>
                <strong>{waitingCount} commande{waitingCount > 1 ? "s" : ""} en attente de validation client</strong>
                <p>Le client doit confirmer la transaction.</p>
              </div>
              <span className={styles.alertBoxArrow}>→</span>
            </div>
          )}

          {/* Analytique : tendance mensuelle, occupation, top véhicules */}
          {analytics && (analytics.monthlyRevenue.length > 0 || analytics.topVehicles.length > 0) && (
            <div className={styles.dashSection}>
              <div className={styles.dashSectionHeader}>
                <h3>📈 Analytique</h3>
                {analytics.fleetSize > 0 && (
                  <span style={{ fontSize: ".8rem", fontWeight: 700, color: analytics.occupancyRate >= 60 ? "#059669" : analytics.occupancyRate >= 30 ? "#d97706" : "#dc2626" }}>
                    Taux d'occupation (30j) : {analytics.occupancyRate}%
                  </span>
                )}
              </div>

              {analytics.monthlyRevenue.length > 0 && (
                <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 110, padding: "8px 4px 0", marginBottom: 8 }}>
                  {(() => {
                    const maxRev = Math.max(...analytics.monthlyRevenue.map((m) => m.revenue), 1);
                    return analytics.monthlyRevenue.map((m) => (
                      <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                        <span style={{ fontSize: ".7rem", color: "#64748b", fontWeight: 700 }}>{fmtXOF(m.revenue)}</span>
                        <div style={{ width: "100%", height: Math.max(4, Math.round((m.revenue / maxRev) * 70)), background: "linear-gradient(180deg,#6366f1,#4f46e5)", borderRadius: "6px 6px 0 0" }} />
                        <span style={{ fontSize: ".68rem", color: "#94a3b8" }}>{m.month.slice(5)}/{m.month.slice(2, 4)}</span>
                      </div>
                    ));
                  })()}
                </div>
              )}

              {analytics.topVehicles.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <strong style={{ fontSize: ".8rem", color: "#334155" }}>🏆 Véhicules les plus rentables</strong>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                    {analytics.topVehicles.map((v, i) => (
                      <div key={v.vehicleId} style={{ display: "flex", justifyContent: "space-between", fontSize: ".82rem", padding: "5px 0", borderBottom: i < analytics.topVehicles.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                        <span>{v.title}</span>
                        <strong>{fmtXOF(v.revenue)} <span style={{ color: "#94a3b8", fontWeight: 500 }}>({v.count} location{v.count > 1 ? "s" : ""})</span></strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Commandes récentes */}
          <div className={styles.dashSection}>
            <div className={styles.dashSectionHeader}>
              <h3>Commandes récentes</h3>
              <button className={styles.viewAllBtn} onClick={() => setActiveTab("commandes")}>Voir toutes →</button>
            </div>
            {allOrders.slice(0, 5).map((order) => {
              const bst = BS[order.status] || BS.pending;
              return (
                <div key={order.id} className={styles.miniOrderRow} onClick={() => { setGererModalId(order.id); }}>
                  <div className={styles.miniOrderDot} style={{ background: bst.dot }} />
                  <div className={styles.miniOrderMain}>
                    <span className={styles.miniOrderRef}>{order.reference || `#${String(order.id).slice(-6)}`}</span>
                    <span className={styles.miniOrderClient}>{order.firstName} {order.lastName}</span>
                  </div>
                  <div className={styles.miniOrderRight}>
                    <span className={styles.miniOrderStatus} style={{ background: bst.bg, color: bst.color }}>{bst.label}</span>
                    <span className={styles.miniOrderDate}>{fmtDate(order.createdAt)}</span>
                  </div>
                </div>
              );
            })}
            {allOrders.length === 0 && <p className={styles.emptyMsg}>Aucune commande pour le moment.</p>}
          </div>
        </div>
      )}

      {/* ══ TAB : COMMANDES ═══════════════════════════════════════════════ */}
      {activeTab === "commandes" && (
        <div className={styles.tabContent}>
          {/* Toolbar */}
          <div className={styles.ordersToolbar}>
            <div className={styles.filterTabs}>
              {[
                { v: "all",       l: "Toutes",       c: stats.totalOrders },
                { v: "new",       l: "Nouvelles",    c: stats.pending,  alert: true },
                { v: "active",    l: "En cours",     c: stats.active },
                { v: "validate",  l: "À valider",    c: stats.waiting, alert: true },
                { v: "done",      l: "Terminées",    c: stats.completed },
                { v: "cancelled", l: "Annulées",     c: null },
              ].map(({ v, l, c, alert }) => (
                <button key={v}
                  className={[styles.filterTab, orderFilter === v ? styles.filterTabActive : "", alert && c > 0 ? styles.filterTabAlert : ""].join(" ")}
                  onClick={() => setOrderFilter(v)}>
                  {l} {c !== null && c !== undefined && <span>{c}</span>}
                </button>
              ))}
            </div>
            {businesses.length > 1 && (
              <select
                value={filterBusinessId}
                onChange={(e) => setFilterBusinessId(e.target.value)}
                title="Filtrer par entreprise"
                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: ".82rem" }}
              >
                <option value="">Toutes les entités</option>
                {businesses.map((b) => <option key={b._id} value={b._id}>{b.companyName}</option>)}
              </select>
            )}
            <input type="search" className={styles.searchInput} placeholder="Rechercher référence, client, véhicule…"
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>

          {filteredOrders.length === 0 ? (
            <div className={styles.emptyFull}>
              <div className={styles.emptyIcon}>📭</div>
              <h3>Aucune commande</h3>
              <p>Les réservations apparaîtront ici.</p>
            </div>
          ) : (
            <div className={styles.orderCards}>
              {filteredOrders.map((order) => {
                const bst     = BS[order.status] || BS.pending;
                const kyc     = KYC_CFG[order.clientInfo?.kycStatus];
                const isNew   = ["À confirmer","pending"].includes(order.status);
                const isAbsent = order.status === "client_absent";
                const subT    = getOrderSubType(order);
                const wfCard  = ORDER_WORKFLOWS[subT] || ORDER_WORKFLOWS.location_agence;
                // Étapes du workflow pour mini-progress bar
                const stepStatuses = wfCard.steps.map(s => s.s);
                const curStepIdx   = stepStatuses.indexOf(order.status);
                const progressPct  = curStepIdx >= 0 ? Math.round((curStepIdx / (stepStatuses.length - 1)) * 100) : 0;

                return (
                  <div key={order.id} className={[
                    styles.orderCard,
                    isNew    ? styles.orderCardNew    : "",
                    isAbsent ? styles.orderCardAbsent : "",
                  ].filter(Boolean).join(" ")}>

                    {/* ── Header carte ── */}
                    <div className={styles.orderCardHeader}>
                      <div className={styles.orderCardRef}>
                        <span className={styles.orderRefCode}>{order.reference || `#${String(order.id).slice(-6)}`}</span>
                        <span className={styles.orderTypePill} style={{ background: wfCard.color + "18", color: wfCard.color }}>
                          {wfCard.badge}
                        </span>
                      </div>
                      <span className={styles.orderStatusBadge} style={{ background: bst.bg, color: bst.color }}>{bst.label}</span>
                    </div>

                    {/* ── Barre de progression workflow ── */}
                    {!isNew && !["cancelled","disputed","transaction_not_concluded"].includes(order.status) && (
                      <div className={styles.orderProgressBar}>
                        <div className={styles.orderProgressFill} style={{ width: `${progressPct}%`, background: wfCard.color }} />
                      </div>
                    )}

                    <div className={styles.orderCardBody}>
                      <div className={styles.orderCardVehicle}>{order.vehicleName || "Véhicule"}</div>

                      {/* Client + KYC + contacts */}
                      <div className={styles.orderClientRow}>
                        <div className={styles.orderClientAvatar}>{(order.firstName || "?").charAt(0)}</div>
                        <div className={styles.orderClientInfo}>
                          <strong>{order.firstName} {order.lastName}</strong>
                          {kyc && <span className={styles.orderKycBadge} style={{ background: kyc.bg, color: kyc.color }}>{kyc.icon} {kyc.label}</span>}
                          {order.clientVerification?.idNumber && (
                            <span style={{ fontSize:".72rem", color:"#64748b", fontFamily:"monospace" }}>
                              🪪 {(order.clientVerification.idType||"").toUpperCase()} {order.clientVerification.idNumber}
                            </span>
                          )}
                        </div>
                        <div className={styles.orderClientContacts}>
                          {order.phone && <a href={`tel:${order.phone}`} className={styles.contactBtn} title="Appeler">📞</a>}
                          {order.phone && <a href={`https://wa.me/${order.phone?.replace(/[\s\+\-]/g,"")}`} target="_blank" rel="noopener noreferrer" className={styles.contactBtn} title="WhatsApp">💬</a>}
                          <button type="button" className={styles.contactBtn} title="Message via VIT AUTO" onClick={() => handleContactClient(order.id)} disabled={contactingOrder === order.id}>🗨️</button>
                        </div>
                      </div>

                      {/* Détails adaptés au sous-type */}
                      <div className={styles.orderCardDetails}>
                        {(subT==="location_agence"||subT==="location_domicile") && <>
                          <div className={styles.orderDetailItem}>
                            <span>📅</span>
                            <span>{fmtDate(order.startDate||order.location?.startDate)} → {fmtDate(order.endDate||order.location?.endDate)} · {order.days||order.location?.days||"?"}j</span>
                          </div>
                          {subT==="location_domicile" && (order.pickupAddress||order.pickupLocation||order.location?.pickupLocation) && (
                            <div className={styles.orderDetailItem}><span>📍</span><span>{order.pickupAddress||order.pickupLocation||order.location?.pickupLocation}</span></div>
                          )}
                        </>}
                        {subT==="vente" && (
                          <div className={styles.orderDetailItem}>
                            <span>📅</span>
                            <span>RDV : {fmtDate(order.preferredDate||order.essai?.preferredDate)} {(order.preferredTime||order.essai?.preferredTime) ? `à ${order.preferredTime||order.essai?.preferredTime}` : ""}</span>
                          </div>
                        )}
                        {subT==="chauffeur" && <>
                          <div className={styles.orderDetailItem}><span>🗓️</span><span>{fmtDate(order.chauffeur?.date||order.startDate)} · {order.chauffeur?.heures||"?"}h</span></div>
                          {order.chauffeur?.lieuDepart && <div className={styles.orderDetailItem}><span>🚀</span><span>{order.chauffeur.lieuDepart} → {order.chauffeur?.destination||"?"}</span></div>}
                        </>}
                        {subT==="leasing" && <>
                          <div className={styles.orderDetailItem}><span>💰</span><span>Apport : {fmtXOF(order.leasing?.apportInitial||0)} · {order.leasing?.duree||"?"}mois</span></div>
                        </>}
                        {subT==="import_export" && (
                          <div className={styles.orderDetailItem}><span>🌍</span><span>Import/Export · {fmtDate(order.createdAt)}</span></div>
                        )}
                        <div className={styles.orderDetailItem}><span>📩</span><span>Reçue {fmtDateTime(order.createdAt)}</span></div>
                      </div>

                      {/* Montants */}
                      <div className={styles.orderCardFinance}>
                        <div className={styles.orderFinItem}>
                          <span>Total client</span>
                          <strong>{fmtXOF(order.montantTotal||order.total||0)}</strong>
                        </div>
                        <div className={styles.orderFinItem}>
                          <span>Votre net</span>
                          <strong style={{ color:"#059669" }}>{fmtXOF(order.partnerPayout||Math.max((order.montantTotal||order.total||0)*(1-(activeCommRates[order.type]??0.15))-SERVICE_FEE,0))}</strong>
                        </div>
                        <div className={styles.orderFinItem}>
                          <span>Paiement</span>
                          <strong style={{ color:order.isPaid?"#059669":"#d97706" }}>{order.isPaid?"✅ Payé":"⏳ En attente"}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Actions carte */}
                    <div className={styles.orderCardActions}>
                      <button className={styles.btnGerer} onClick={() => handleGerer(order)}>⚙️ Gérer</button>
                      {isNew && <>
                        <button className={styles.btnAcceptSmall} onClick={() => handleConfirm(order.id)}>✅ Accepter</button>
                        <button className={styles.btnRefuseSmall} onClick={() => setRejectModal(order.id)}>✕</button>
                      </>}
                      {isAbsent && order.phone && (
                        <a href={`https://wa.me/${order.phone?.replace(/[\s\+\-]/g,"")}`} target="_blank" rel="noopener noreferrer" className={styles.btnWhatsAppSmall}>💬 Recontacter</a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ TAB : ANNONCES ════════════════════════════════════════════════ */}
      {activeTab === "annonces" && (
        <div className={styles.tabContent}>
          <div className={styles.sectionToolbar}>
            <h2 className={styles.sectionTitle}>Mes véhicules ({filteredVehicles.length})</h2>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {selectedVehicleIds.size > 0 && (
                <>
                  <button className={styles.btnSecondary} disabled={bulkUpdating} onClick={handleBulkAdjustPrice}>
                    💲 Ajuster le prix ({selectedVehicleIds.size})
                  </button>
                  <button className={styles.btnSecondary} disabled={bulkUpdating} onClick={() => handleBulkTogglePause(true)}>
                    ⏸️ Mettre en pause
                  </button>
                  <button className={styles.btnSecondary} disabled={bulkUpdating} onClick={() => handleBulkTogglePause(false)}>
                    ▶️ Reprendre
                  </button>
                  <button className={styles.btnDanger} disabled={bulkDeleting} onClick={handleBulkDeleteVehicles}>
                    🗑️ Supprimer la sélection ({selectedVehicleIds.size})
                  </button>
                </>
              )}
              <select className={styles.selectFilter} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">Tous les statuts</option>
                <option value="approved">Approuvés</option>
                <option value="pending">En attente</option>
                <option value="rejected">Rejetés</option>
              </select>
              <Link to="/vendor" className={styles.btnPrimary}>+ Nouvelle annonce</Link>
            </div>
          </div>

          {filteredVehicles.length > 0 && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem", color: "#64748b", marginBottom: 10, cursor: "pointer" }}>
              <input type="checkbox"
                checked={selectedVehicleIds.size > 0 && selectedVehicleIds.size === filteredVehicles.length}
                onChange={(e) => setSelectedVehicleIds(e.target.checked ? new Set(filteredVehicles.map((v) => v.id || v._id)) : new Set())} />
              Tout sélectionner
            </label>
          )}

          {filteredVehicles.length === 0 ? (
            <div className={styles.emptyFull}>
              <div className={styles.emptyIcon}>🚗</div>
              <h3>Aucune annonce</h3>
              <p>Publiez votre première annonce pour commencer.</p>
              <Link to="/vendor" className={styles.btnPrimary} style={{ display: "inline-flex", marginTop: 12 }}>+ Publier une annonce</Link>
            </div>
          ) : (
            <div className={styles.vehicleGrid}>
              {filteredVehicles.map((vehicle) => {
                const vid  = vehicle.id || vehicle._id;
                const sc   = { approved: { l: "Publié", c: "#059669", bg: "#d1fae5" }, pending: { l: "En attente", c: "#d97706", bg: "#fef3c7" }, rejected: { l: "Rejeté", c: "#dc2626", bg: "#fee2e2" } }[vehicle.status || "pending"];
                const isBoosted = subscription?.boosts?.some((b) => b.isActive && String(b.vehicle) === String(vid));
                const orderCount = allOrders.filter((b) => String(b.vehicleId) === String(vid)).length;
                return (
                  <div key={vid} className={[styles.vehicleCard, isBoosted ? styles.vehicleCardBoosted : ""].join(" ")} style={{ position: "relative" }}>
                    <input type="checkbox" checked={selectedVehicleIds.has(vid)} onChange={() => toggleVehicleSelect(vid)}
                      style={{ position: "absolute", top: 10, left: 10, zIndex: 2, width: 18, height: 18, cursor: "pointer" }} />
                    {isBoosted && <div className={styles.boostBadge}>⭐ En vedette</div>}
                    <div className={styles.vehicleImgWrap}>
                      {vehicle.image ? <img src={vehicle.image} alt={vehicle.name} className={styles.vehicleImg} /> : <div className={styles.vehicleImgPlaceholder}>🚗</div>}
                    </div>
                    <div className={styles.vehicleCardBody}>
                      <div className={styles.vehicleCardTop}>
                        <h3 className={styles.vehicleName}>{vehicle.name}</h3>
                        <span className={styles.vehicleStatusBadge} style={{ background: sc.bg, color: sc.c }}>{sc.l}</span>
                      </div>
                      {vehicle.manuallyPaused && (
                        <span style={{ display: "inline-block", marginBottom: 6, background: "#f1f5f9", color: "#64748b", fontSize: ".72rem", fontWeight: 800, padding: "2px 8px", borderRadius: 999 }}>
                          ⏸️ En pause — non visible au catalogue
                        </span>
                      )}
                      {vehicle.validationScore != null && (
                        <div className={styles.scoreBar}>
                          <div className={styles.scoreBarFill} style={{ width: `${vehicle.validationScore}%`, background: vehicle.validationScore >= 65 ? "#10b981" : vehicle.validationScore >= 40 ? "#f59e0b" : "#ef4444" }} />
                          <span className={styles.scoreBarLabel}>{vehicle.validationScore}/100</span>
                        </div>
                      )}
                      <div className={styles.vehicleTags}>
                        {vehicle.mode && <span className={styles.vTag}>{vehicle.mode}</span>}
                        {vehicle.type && <span className={styles.vTag}>{vehicle.type}</span>}
                        {vehicle.fuel && <span className={styles.vTag}>{vehicle.fuel}</span>}
                      </div>
                      <div className={styles.vehiclePrice}>
                        {vehicle.pricePerDay ? `${fmtXOF(vehicle.pricePerDay)} / jour` : vehicle.buyPrice ? fmtXOF(vehicle.buyPrice) : "—"}
                        {(vehicle.promotions || []).filter((r) => r.active).map((r, i) => (
                          <span key={i} style={{ marginLeft: 8, background: "#fee2e2", color: "#dc2626", fontSize: "0.72rem", fontWeight: 800, padding: "2px 8px", borderRadius: 999 }}>
                            {r.type === "percent" ? `-${r.value}%` : `-${fmtXOF(r.value)}`}{r.minDays > 1 ? ` dès ${r.minDays}j` : ""}
                          </span>
                        ))}
                      </div>
                      {orderCount > 0 && (
                        <button className={styles.vehicleOrderCount} onClick={() => { setActiveTab("commandes"); setOrderFilter("all"); setSearchQuery(vehicle.name || ""); }}>
                          📋 {orderCount} commande{orderCount > 1 ? "s" : ""}
                        </button>
                      )}
                    </div>
                    <div className={styles.vehicleCardActions}>
                      <button className={styles.btnSecondary} onClick={() => handleOpenEdit(vehicle)}>✏️ Modifier</button>
                      <Link to={`/vehicle/${vid}`} className={styles.btnSecondary}>Voir</Link>
                      <button className={styles.btnSecondary} onClick={() => handleOpenPromo(vehicle)}>
                        {(vehicle.promotions || []).some((r) => r.active) ? "🏷️ Promos actives" : "🏷️ Promo"}
                      </button>
                      <button className={styles.btnSecondary} onClick={() => handleOpenMaintenance(vehicle)}>🔧 Journal</button>
                      {SUBSCRIPTIONS_ENABLED && !isBoosted && <button className={styles.btnBoost} onClick={() => { setBoostTier("30d"); setBoostPromoCode(""); setBoostModal({ vehicleId: vid, title: vehicle.name || vehicle.title }); }} disabled={boostTarget === vid}>{boostTarget === vid ? "…" : "⭐ Booster"}</button>}
                      <button className={styles.btnDanger} onClick={() => handleDeleteVehicle(vid)}>Suppr.</button>
                    </div>
                    {(vehicle.validationErrors || []).map((e, i) => <p key={i} className={styles.validErr}>❌ {e}</p>)}
                  </div>
                );
              })}
            </div>
          )}

          {/* Chauffeurs */}
          <div className={styles.sectionToolbar} style={{ marginTop: 32 }}>
            <h2 className={styles.sectionTitle}>Mes chauffeurs ({myDrivers.length})</h2>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {selectedDriverIds.size > 0 && (
                <button className={styles.btnDanger} disabled={bulkDeleting} onClick={handleBulkDeleteDrivers}>
                  🗑️ Supprimer la sélection ({selectedDriverIds.size})
                </button>
              )}
              <Link to="/vendor" className={styles.btnPrimary}>+ Ajouter</Link>
            </div>
          </div>

          {/* Alerte expiration permis — vérifiée aux points de blocage (KYC,
              réservation, publication) mais jamais signalée proactivement dans
              le dashboard. Manque réel trouvé en audit. */}
          {myDrivers.length > 0 && user.driverLicenseOcr?.expiryDate && (() => {
            const expiry = new Date(user.driverLicenseOcr.expiryDate);
            const daysLeft = Math.ceil((expiry - new Date()) / 86400000);
            if (daysLeft > 30) return null;
            const expired = daysLeft < 0;
            return (
              <div style={{ marginBottom: 14, padding: "10px 16px", background: expired ? "#fef2f2" : "#fffbeb", border: `1.5px solid ${expired ? "#fca5a5" : "#fde68a"}`, borderRadius: 10, fontSize: ".85rem", color: expired ? "#991b1b" : "#92400e" }}>
                {expired
                  ? `⚠️ Votre permis de conduire a expiré le ${expiry.toLocaleDateString("fr-FR")} — vos profils chauffeur peuvent devenir non réservables.`
                  : `⚠️ Votre permis de conduire expire le ${expiry.toLocaleDateString("fr-FR")} (dans ${daysLeft} jour${daysLeft > 1 ? "s" : ""}) — pensez à le renouveler.`}
              </div>
            );
          })()}

          {driverLoading ? <p className={styles.loadingMsg}>Chargement…</p> : myDrivers.length === 0 ? (
            <div className={styles.emptyFull} style={{ padding: "28px 20px" }}>
              <div className={styles.emptyIcon}>👨‍✈️</div>
              <h3>Aucun chauffeur</h3>
              <p>Ajoutez un profil chauffeur depuis "Nouvelle annonce".</p>
            </div>
          ) : (
            <>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem", color: "#64748b", marginBottom: 10, cursor: "pointer" }}>
                <input type="checkbox"
                  checked={selectedDriverIds.size > 0 && selectedDriverIds.size === myDrivers.length}
                  onChange={(e) => setSelectedDriverIds(e.target.checked ? new Set(myDrivers.map((d) => d._id)) : new Set())} />
                Tout sélectionner
              </label>
              <div className={styles.vehicleGrid}>
              {myDrivers.map((drv) => {
                // Fallback nécessaire : "archived" (statut posé lors de la suppression
                // du compte propriétaire, Driver.js enum) n'était mappé nulle part —
                // bug de fragilité trouvé en audit, aurait fait planter tout l'onglet.
                const sc = { approved: { l: "Validé", c: "#059669", bg: "#d1fae5" }, pending: { l: "En attente", c: "#d97706", bg: "#fef3c7" }, rejected: { l: "Rejeté", c: "#dc2626", bg: "#fee2e2" } }[drv.status || "pending"]
                  || { l: drv.status || "—", c: "#64748b", bg: "#f1f5f9" };
                return (
                  <div key={drv._id} className={styles.vehicleCard} style={{ position: "relative" }}>
                    <input type="checkbox" checked={selectedDriverIds.has(drv._id)} onChange={() => toggleDriverSelect(drv._id)}
                      style={{ position: "absolute", top: 10, left: 10, zIndex: 2, width: 18, height: 18, cursor: "pointer" }} />
                    <div className={styles.vehicleImgWrap} style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "#f1f5f9", fontSize: "3rem", height: 120 }}>
                      {drv.profilePhoto ? <img src={drv.profilePhoto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "👨‍✈️"}
                    </div>
                    <div className={styles.vehicleCardBody}>
                      <div className={styles.vehicleCardTop}>
                        <h3 className={styles.vehicleName}>{drv.firstName} {drv.lastName}</h3>
                        <span className={styles.vehicleStatusBadge} style={{ background: sc.bg, color: sc.c }}>{sc.l}</span>
                      </div>
                      <div className={styles.vehicleTags}>
                        {drv.zone && <span className={styles.vTag}>{drv.zone}</span>}
                        {drv.permisCategorie && <span className={styles.vTag}>Permis {drv.permisCategorie}</span>}
                      </div>
                      {drv.nombreAvis > 0 && (
                        <div style={{ fontSize: ".82rem", color: "#d97706", fontWeight: 700, marginTop: 4 }}>
                          ⭐ {drv.noteMoyenne?.toFixed(1)} <span style={{ color: "#94a3b8", fontWeight: 500 }}>({drv.nombreAvis} avis)</span>
                        </div>
                      )}
                      {drv.missionsTotal > 0 && (
                        <div style={{ fontSize: ".78rem", color: "#64748b", marginTop: 2 }}>{drv.missionsTotal} mission{drv.missionsTotal > 1 ? "s" : ""} terminée{drv.missionsTotal > 1 ? "s" : ""}</div>
                      )}
                      <div className={styles.vehiclePrice}>{drv.tarif ? `${fmtXOF(drv.tarif)} / jour` : "Tarif non renseigné"}</div>
                      {drv.status === "rejected" && drv.rejectionReason && (
                        <div style={{ fontSize: ".78rem", color: "#dc2626", marginTop: 4 }}>Motif : {drv.rejectionReason}</div>
                      )}
                    </div>
                    <div className={styles.vehicleCardActions}>
                      <button className={styles.btnSecondary} onClick={() => openDriverEdit(drv)}>✏️ Modifier</button>
                      <button className={styles.btnSecondary} onClick={() => { setBlackoutModal(drv); setBlackoutForm({ start: "", end: "", reason: "" }); }}>🚫 Congés</button>
                      <button className={styles.btnDanger} onClick={() => { if (confirm("Supprimer ce profil ?")) { fetch(`/api/drivers/${drv._id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).then(() => setMyDrivers((p) => p.filter((d) => d._id !== drv._id))).catch(() => {}); } }}>Supprimer</button>
                    </div>
                  </div>
                );
              })}
              </div>
            </>
          )}

          {/* Propositions d'embauche CDD/CDI reçues (voir DriverEmployment.jsx côté client) */}
          <div className={styles.sectionToolbar} style={{ marginTop: 32 }}>
            <h2 className={styles.sectionTitle}>💼 Propositions d'embauche ({employmentRequests.filter((r) => r.status === "pending").length} en attente)</h2>
          </div>
          {employmentLoading ? <p className={styles.loadingMsg}>Chargement…</p> : employmentRequests.length === 0 ? (
            <div className={styles.emptyFull} style={{ padding: "28px 20px" }}>
              <div className={styles.emptyIcon}>💼</div>
              <h3>Aucune proposition</h3>
              <p>Les propositions d'embauche à temps plein (CDD/CDI) pour vos chauffeurs apparaîtront ici.</p>
            </div>
          ) : (
            <div className={styles.vehicleGrid}>
              {employmentRequests.map((reqm) => {
                const sc = { pending: { l: "En attente", c: "#d97706", bg: "#fef3c7" }, accepted: { l: "Acceptée", c: "#059669", bg: "#d1fae5" }, declined: { l: "Refusée", c: "#dc2626", bg: "#fee2e2" }, cancelled: { l: "Annulée", c: "#64748b", bg: "#f1f5f9" } }[reqm.status];
                return (
                  <div key={reqm._id} className={styles.vehicleCard}>
                    <div className={styles.vehicleCardBody}>
                      <div className={styles.vehicleCardTop}>
                        <h3 className={styles.vehicleName}>{reqm.contractType?.toUpperCase()} — {reqm.driver?.firstName} {reqm.driver?.lastName}</h3>
                        <span className={styles.vehicleStatusBadge} style={{ background: sc.bg, color: sc.c }}>{sc.l}</span>
                      </div>
                      <div className={styles.vehicleTags}>
                        <span className={styles.vTag}>{reqm.employer?.firstName} {reqm.employer?.lastName}</span>
                        {reqm.employer?.phone && <span className={styles.vTag}>{reqm.employer.phone}</span>}
                      </div>
                      <div className={styles.vehiclePrice}>{fmtXOF(reqm.proposedSalary)} / mois</div>
                      <p style={{ margin: "6px 0 0", fontSize: ".78rem", color: "#64748b" }}>
                        Début : {reqm.startDate ? new Date(reqm.startDate).toLocaleDateString("fr-FR") : "—"}
                        {reqm.endDate && ` · Fin : ${new Date(reqm.endDate).toLocaleDateString("fr-FR")}`}
                      </p>
                      {reqm.workSchedule && <p style={{ margin: "2px 0 0", fontSize: ".78rem", color: "#64748b" }}>🕐 {reqm.workSchedule}</p>}
                      {reqm.missionDescription && <p style={{ margin: "4px 0 0", fontSize: ".82rem", color: "#374151" }}>{reqm.missionDescription}</p>}
                    </div>
                    {reqm.status === "pending" && (
                      <div className={styles.vehicleCardActions}>
                        <button className={styles.btnApprove} disabled={employmentDeclining === reqm._id}
                          onClick={() => respondToEmployment(reqm._id, "accept")}>Accepter</button>
                        <button className={styles.btnDanger} disabled={employmentDeclining === reqm._id}
                          onClick={() => { const reason = prompt("Motif du refus (optionnel) :") || ""; respondToEmployment(reqm._id, "decline", reason); }}>Refuser</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ TAB : MES ENTREPRISES ═════════════════════════════════════════ */}
      {activeTab === "entreprises" && (
        <div className={styles.tabContent}>
          <PartnerBusinessManager />
        </div>
      )}

      {/* ══ TAB : CALENDRIER ══════════════════════════════════════════════ */}
      {activeTab === "calendrier" && (
        <div className={styles.tabContent}>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ margin: "0 0 4px", fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f" }}>📅 Calendrier de disponibilité</h2>
            <p style={{ margin: 0, fontSize: "0.84rem", color: "#64748b" }}>
              Vue d'ensemble de vos véhicules et chauffeurs déjà réservés — cliquez sur un jour pour voir le détail.
            </p>
          </div>
          <PartnerCalendar bookings={allOrders} />
        </div>
      )}

      {/* ══ TAB : CLIENTS ═════════════════════════════════════════════════ */}
      {activeTab === "clients" && (
        <div className={styles.tabContent}>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ margin: "0 0 4px", fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f" }}>👥 Clientèle</h2>
            <p style={{ margin: 0, fontSize: "0.84rem", color: "#64748b" }}>
              Vos clients classés par nombre de commandes — repérez vos clients réguliers d'un coup d'œil.
            </p>
          </div>
          {!analytics?.topClients?.length ? (
            <div className={styles.emptyFull}>
              <div className={styles.emptyIcon}>👥</div>
              <h3>Aucun client pour le moment</h3>
              <p>Vos clients apparaîtront ici dès votre première commande.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {analytics.topClients.map((c, i) => (
                <div key={c.clientId || c.email || i} className={styles.sectionCard} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <strong style={{ fontSize: ".9rem" }}>{c.firstName} {c.lastName}</strong>
                    {c.totalBookings > 1 && <span style={{ marginLeft: 8, background: "#eef2ff", color: "#4f46e5", fontSize: ".72rem", fontWeight: 800, padding: "2px 8px", borderRadius: 999 }}>🔁 Client régulier</span>}
                    <div style={{ display: "flex", gap: 14, marginTop: 4, fontSize: ".8rem", color: "#64748b" }}>
                      {c.email && <a href={`mailto:${c.email}`} style={{ color: "#64748b" }}>✉️ {c.email}</a>}
                      {c.phone && <a href={`tel:${c.phone}`} style={{ color: "#64748b" }}>📞 {c.phone}</a>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: ".85rem", fontWeight: 800 }}>{c.totalBookings} commande{c.totalBookings > 1 ? "s" : ""}</div>
                    <div style={{ fontSize: ".78rem", color: "#059669" }}>{fmtXOF(c.totalSpent)} de net cumulé</div>
                    <div style={{ fontSize: ".72rem", color: "#94a3b8" }}>Dernière : {new Date(c.lastBookingAt).toLocaleDateString("fr-FR")}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ TAB : FINANCES ════════════════════════════════════════════════ */}
      {activeTab === "finances" && (
        <div className={styles.tabContent}>
          {businesses.length > 1 && (
            <div style={{ marginBottom: 14 }}>
              <select
                value={filterBusinessId}
                onChange={(e) => setFilterBusinessId(e.target.value)}
                title="Filtrer par entreprise"
                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: ".82rem" }}
              >
                <option value="">Toutes les entités</option>
                {businesses.map((b) => <option key={b._id} value={b._id}>{b.companyName}</option>)}
              </select>
            </div>
          )}
          {/* Résumé financier */}
          <div className={styles.finSummary}>
            <div className={styles.finSummaryCard}>
              <span className={styles.finSummaryLabel}>Revenus bruts</span>
              <span className={styles.finSummaryValue}>{fmtXOF(stats.revenue)}</span>
            </div>
            <div className={styles.finSummaryCard} style={{ borderColor: "#ef4444" }}>
              <span className={styles.finSummaryLabel}>Commissions VIT-AUTO</span>
              <span className={styles.finSummaryValue} style={{ color: "#dc2626" }}>{fmtXOF(stats.revenue - stats.netRevenue)}</span>
            </div>
            <div className={styles.finSummaryCard} style={{ borderColor: "#059669" }}>
              <span className={styles.finSummaryLabel}>Vos revenus nets</span>
              <span className={styles.finSummaryValue} style={{ color: "#059669" }}>{fmtXOF(stats.netRevenue)}</span>
            </div>
          </div>

          {/* Reversements — dû vs déjà versé (voir commissionLedger.js). Aucune
              intégration bancaire n'existe : le virement reste initié
              manuellement par la finance VIT AUTO, ceci n'affiche que le suivi. */}
          {payoutTotals && (payoutTotals.pending > 0 || payoutTotals.paid > 0) && (
            <div className={styles.dashSection} style={{ marginBottom: 20 }}>
              <div className={styles.dashSectionHeader}><h3>💸 Reversements</h3></div>
              <div className={styles.finSummary}>
                <div className={styles.finSummaryCard} style={{ borderColor: "#d97706" }}>
                  <span className={styles.finSummaryLabel}>En attente de virement</span>
                  <span className={styles.finSummaryValue} style={{ color: "#d97706" }}>{fmtXOF(payoutTotals.pending)}</span>
                </div>
                <div className={styles.finSummaryCard} style={{ borderColor: "#059669" }}>
                  <span className={styles.finSummaryLabel}>Déjà versé</span>
                  <span className={styles.finSummaryValue} style={{ color: "#059669" }}>{fmtXOF(payoutTotals.paid)}</span>
                </div>
              </div>
              {!payoutLoading && payoutEntries.length > 0 && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  {payoutEntries.slice(0, 10).map((p) => (
                    <div key={p._id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: ".82rem", padding: "6px 10px", background: "#f8fafc", borderRadius: 8 }}>
                      <span style={{ color: "#64748b" }}>{p.notes || p.transactionId} · {fmtDate(p.createdAt)}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <strong>{fmtXOF(p.commissionAmount)}</strong>
                        <span style={{ fontSize: ".72rem", fontWeight: 700, color: p.status === "paid" ? "#059669" : "#d97706" }}>
                          {p.status === "paid" ? "✅ Versé" : "🕐 En attente"}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Export comptable — jusqu'ici réservé à l'admin, aucun moyen pour un
              partenaire de télécharger l'historique de ses commandes. */}
          <button
            type="button"
            className={styles.btnSecondary}
            style={{ marginBottom: 16 }}
            onClick={async () => {
              try {
                const qs = filterBusinessId ? `?businessId=${filterBusinessId}` : "";
                const r = await fetch(`/api/bookings/partner/export${qs}`, { headers: { Authorization: `Bearer ${token}` } });
                if (!r.ok) { toastError("Erreur lors de l'export."); return; }
                const blob = await r.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = `mes-commandes-${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              } catch { toastError("Erreur réseau."); }
            }}
          >
            📥 Exporter mes commandes (CSV)
          </button>

          {/* Transactions */}
          <div className={styles.dashSection}>
            <div className={styles.dashSectionHeader}><h3>Transactions ({transactions.length})</h3></div>
            {txLoading ? <p className={styles.loadingMsg}>Chargement…</p> : transactions.length === 0 ? (
              <p className={styles.emptyMsg}>Aucune transaction.</p>
            ) : (
              <div className={styles.txList}>
                {transactions.map((tx) => {
                  const amt  = tx.transaction?.finalAmount || tx.montantTotal || 0;
                  const comm = tx.commissionAmount || 0;
                  const net  = tx.partnerPayout || Math.max(amt - comm - SERVICE_FEE, 0);
                  const bst  = BS[tx.status] || BS.pending;
                  return (
                    <div key={tx._id} className={styles.txCard}>
                      <div className={styles.txCardHeader}>
                        <div>
                          <div className={styles.txRef}>{tx.reference}</div>
                          <div className={styles.txClient}>{tx.clientInfo?.firstName} {tx.clientInfo?.lastName}</div>
                        </div>
                        <span className={styles.txStatus} style={{ background: bst.bg, color: bst.color }}>{bst.label}</span>
                      </div>
                      <div className={styles.txBreakdown}>
                        <div className={styles.txBRow}><span>Encaissé</span><strong>{fmtXOF(amt)}</strong></div>
                        <div className={styles.txBRow} style={{ color: "#dc2626" }}><span>Commission ({Math.round((tx.commissionRate || 0.15) * 100)}%)</span><strong>− {fmtXOF(comm)}</strong></div>
                        <div className={styles.txBRow} style={{ color: "#dc2626" }}><span>Frais service</span><strong>− {fmtXOF(SERVICE_FEE)}</strong></div>
                        <div className={styles.txBNet}><span>Net partenaire</span><strong>{fmtXOF(net)}</strong></div>
                      </div>
                      <div className={styles.txMeta}>
                        <span>{PAY_LABELS[tx.transaction?.paymentMethod] || "—"}</span>
                        <span>{fmtDate(tx.paidAt || tx.updatedAt)}</span>
                        {tx.invoiced && <span style={{ color: "#059669" }}>✅ Facturé</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Factures */}
          <div className={styles.dashSection} style={{ marginTop: 24 }}>
            <div className={styles.dashSectionHeader}><h3>Factures mensuelles ({invoices.length})</h3></div>
            {invoiceLoading ? <p className={styles.loadingMsg}>Chargement…</p> : invoices.length === 0 ? (
              <p className={styles.emptyMsg}>Aucune facture générée.</p>
            ) : (
              <div className={styles.invoiceList}>
                {invoices.map((inv) => {
                  const sc = inv.status === "paid" ? { l: "✅ Payée", c: "#059669", bg: "#dcfce7" } : inv.status === "overdue" ? { l: "⚠️ En retard", c: "#dc2626", bg: "#fee2e2" } : { l: "🕐 À payer", c: "#d97706", bg: "#fef3c7" };
                  return (
                    <div key={inv._id} className={styles.invoiceCard}>
                      <div className={styles.invoiceCardHeader}>
                        <div>
                          <div className={styles.invoiceRef}>{inv.reference}</div>
                          <div className={styles.invoicePeriod}>{MOIS[(inv.month || 1) - 1]} {inv.year}</div>
                          {/* Facture par entité (voir Invoice.businessId) — un partenaire
                              multi-entités reçoit plusieurs factures le même mois, sans ce
                              libellé elles seraient indiscernables. */}
                          {inv.businessId?.companyName && (
                            <div style={{ fontSize: ".78rem", color: "#8b5cf6", fontWeight: 600 }}>🏢 {inv.businessId.companyName}</div>
                          )}
                        </div>
                        <span className={styles.invoiceStatusBadge} style={{ background: sc.bg, color: sc.c }}>{sc.l}</span>
                      </div>
                      <div className={styles.invoiceTotalRow}>
                        <span>Total commissions dues</span>
                        <strong>{fmtXOF(inv.totalCommission || 0)}</strong>
                      </div>
                      {(inv.lines || []).map((l, i) => (
                        <div key={i} className={styles.invoiceLineRow}>
                          <span>{l.bookingRef} ({l.serviceType})</span>
                          <span style={{ color: "#dc2626" }}>{fmtXOF(l.commissionAmount || 0)}</span>
                        </div>
                      ))}
                      {inv.dueDate && inv.status !== "paid" && (
                        <div className={styles.invoiceDue}>Échéance : {fmtDate(inv.dueDate)}</div>
                      )}
                      <a href={`/api/invoices/${inv._id}/pdf`} target="_blank" rel="noopener noreferrer"
                        style={{ display:"inline-flex", alignItems:"center", gap:6, marginTop:10, padding:"6px 14px", borderRadius:8, background:"#0f1b3f", color:"#fff", textDecoration:"none", fontSize:".8rem", fontWeight:700 }}>
                        ⬇️ Télécharger la facture PDF
                      </a>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Factures de prestation — une par commande terminée (voir issueServiceInvoice) */}
          <div className={styles.dashSection} style={{ marginTop: 24 }}>
            <div className={styles.dashSectionHeader}><h3>Factures de prestation ({serviceInvoices.length})</h3></div>
            {serviceInvoiceLoading ? <p className={styles.loadingMsg}>Chargement…</p> : serviceInvoices.length === 0 ? (
              <p className={styles.emptyMsg}>Aucune facture de prestation pour l'instant.</p>
            ) : (
              <div className={styles.invoiceList}>
                {serviceInvoices.map((inv) => (
                  <div key={inv._id} className={styles.invoiceCard}>
                    <div className={styles.invoiceCardHeader}>
                      <div>
                        <div className={styles.invoiceRef}>{inv.reference}</div>
                        <div className={styles.invoicePeriod}>{inv.bookingReference} · {PAY_LABELS[inv.paymentMethod] || inv.paymentMethod || "—"}</div>
                      </div>
                      <span className={styles.invoiceStatusBadge} style={{ background: "#dcfce7", color: "#059669" }}>✅ Envoyée</span>
                    </div>
                    <div className={styles.invoiceTotalRow}>
                      <span>Net à percevoir</span>
                      <strong>{fmtXOF(inv.netPayout || 0)}</strong>
                    </div>
                    <div className={styles.invoiceLineRow}>
                      <span>Brut</span>
                      <span>{fmtXOF(inv.grossAmount || 0)}</span>
                    </div>
                    <div className={styles.invoiceLineRow}>
                      <span>Commission ({Math.round((inv.commissionRate || 0) * 100)}%)</span>
                      <span style={{ color: "#dc2626" }}>− {fmtXOF(inv.commissionAmount || 0)}</span>
                    </div>
                    <div className={styles.invoiceDue}>Terminée le {fmtDate(inv.serviceCompletedAt)}</div>
                    <a href={`/api/service-invoices/${inv._id}/pdf`} target="_blank" rel="noopener noreferrer"
                      style={{ display:"inline-flex", alignItems:"center", gap:6, marginTop:10, padding:"6px 14px", borderRadius:8, background:"#0f1b3f", color:"#fff", textDecoration:"none", fontSize:".8rem", fontWeight:700 }}>
                      ⬇️ Télécharger la facture PDF
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Contrats — vue groupée (avant, uniquement accessible commande par
              commande via le lien /contract/:bookingId de chaque réservation) */}
          <div className={styles.dashSection} style={{ marginTop: 24 }}>
            <div className={styles.dashSectionHeader}><h3>Mes contrats ({contracts.length})</h3></div>
            {contractsLoading ? <p className={styles.loadingMsg}>Chargement…</p> : contracts.length === 0 ? (
              <p className={styles.emptyMsg}>Aucun contrat généré pour l'instant.</p>
            ) : (
              <div className={styles.invoiceList}>
                {contracts.map((ct) => {
                  const cs = ct.isSigned
                    ? { l: "✅ Signé", c: "#059669", bg: "#dcfce7" }
                    : { l: "🕐 En attente de signature", c: "#d97706", bg: "#fef3c7" };
                  return (
                    <div key={ct._id} className={styles.invoiceCard}>
                      <div className={styles.invoiceCardHeader}>
                        <div>
                          <div className={styles.invoiceRef}>{ct.booking?.reference || ct.booking?._id}</div>
                          <div className={styles.invoicePeriod}>{ct.type} — {fmtXOF(ct.booking?.montantTotal || 0)}</div>
                        </div>
                        <span className={styles.invoiceStatusBadge} style={{ background: cs.bg, color: cs.c }}>{cs.l}</span>
                      </div>
                      <button type="button" onClick={() => downloadAuthPdf(`/api/contracts/${ct._id}/pdf`, `contrat-${ct.booking?.reference || ct._id}.pdf`)}
                        style={{ display:"inline-flex", alignItems:"center", gap:6, marginTop:10, padding:"6px 14px", borderRadius:8, border:"none", background:"#0f1b3f", color:"#fff", cursor:"pointer", fontSize:".8rem", fontWeight:700 }}>
                        ⬇️ Télécharger le contrat PDF
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* LOI / Accord Founding Partner — jusqu'ici absents de ce répertoire,
              le partenaire devait savoir naviguer vers l'onboarding pour les
              retrouver. Manque réel trouvé en audit. */}
          {legalDocuments.length > 0 && (
            <div className={styles.dashSection} style={{ marginTop: 24 }}>
              <div className={styles.dashSectionHeader}><h3>Documents légaux Founding Partner</h3></div>
              <div className={styles.invoiceList}>
                {legalDocuments.map((doc) => {
                  const cs = doc.isSigned
                    ? { l: "✅ Signé", c: "#059669", bg: "#dcfce7" }
                    : { l: "🕐 En attente de signature", c: "#d97706", bg: "#fef3c7" };
                  return (
                    <div key={doc.key} className={styles.invoiceCard}>
                      <div className={styles.invoiceCardHeader}>
                        <div>
                          <div className={styles.invoiceRef}>{doc.label}</div>
                          <div className={styles.invoicePeriod}>Envoyé le {new Date(doc.sentAt).toLocaleDateString("fr-FR")}</div>
                        </div>
                        <span className={styles.invoiceStatusBadge} style={{ background: cs.bg, color: cs.c }}>{cs.l}</span>
                      </div>
                      <button type="button" onClick={() => downloadAuthPdf(doc.pdfUrl, `${doc.key}.pdf`)}
                        style={{ display:"inline-flex", alignItems:"center", gap:6, marginTop:10, padding:"6px 14px", borderRadius:8, border:"none", background:"#0f1b3f", color:"#fff", cursor:"pointer", fontSize:".8rem", fontWeight:700 }}>
                        ⬇️ Télécharger le PDF
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ MODAL GÉRER ═══════════════════════════════════════════════════ */}
      {gererModal && (
        <GererModal
          order={gererModal}
          orderDetail={orderDetail}
          detailLoading={detailLoading}
          commRates={activeCommRates}
          onClose={() => { setGererModalId(null); setOrderDetail(null); }}
          onConfirm={handleConfirm}
          onPrepare={handlePrepare}
          onReady={handleReady}
          onInProgress={handleInProgress}
          onClientArrived={handleClientArrived}
          onClientAbsent={handleClientAbsent}
          onRecordTransaction={handleRecordTransaction}
          onPartnerConfirm={handlePartnerConfirm}
          onComplete={handleComplete}
          onReject={(id) => { setRejectModal(id); setGererModalId(null); setOrderDetail(null); }}
          onTransactionNotConcluded={handleTransactionNotConcluded}
          onRespondToDispute={handleRespondToDispute}
          onPartnerVerifyKyc={handlePartnerVerifyKyc}
          onClaimCaution={handleClaimCaution}
        />
      )}

      {/* ══ TAB : MES RÉSERVATIONS (client) ══════════════════════════════ */}
      {activeTab === "reservations" && (
        <div className={styles.tabContent}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:12 }}>
            <div>
              <h2 style={{ margin:"0 0 4px", fontSize:"1.1rem", fontWeight:800, color:"#0f1b3f" }}>🎫 Mes réservations personnelles</h2>
              <p style={{ margin:0, fontSize:"0.84rem", color:"#64748b" }}>Réservations que vous avez effectuées en tant que client.</p>
            </div>
            <button onClick={fetchPersonalBookings}
              style={{ background:"#f1f5f9", border:"1.5px solid #e2e8f0", borderRadius:8, padding:"7px 14px", fontWeight:700, fontSize:"0.82rem", cursor:"pointer", color:"#0f1b3f" }}>
              ↻ Actualiser
            </button>
          </div>

          {/* Alerte si validation en attente */}
          {myPersonalBookings.filter((b) => b.status === "waiting_client_validation").length > 0 && (
            <div style={{ background:"#fffbeb", border:"2px solid #f59e0b", borderRadius:12, padding:"14px 20px", marginBottom:16, display:"flex", alignItems:"center", gap:14 }}>
              <span style={{ fontSize:"1.6rem" }}>✋</span>
              <div>
                <p style={{ margin:"0 0 4px", fontWeight:800, color:"#92400e" }}>Transaction à valider</p>
                <p style={{ margin:0, fontSize:"0.86rem", color:"#78350f" }}>
                  Le partenaire a enregistré votre transaction. Validez-la ci-dessous.
                </p>
              </div>
            </div>
          )}

          {personalLoading ? (
            <div style={{ textAlign:"center", padding:"3rem", color:"#64748b" }}>
              <div style={{ width:32, height:32, border:"3px solid #e2e8f0", borderTopColor:"#2563eb", borderRadius:"50%", margin:"0 auto 12px", animation:"spin 0.8s linear infinite" }} />
              <p>Chargement…</p>
            </div>
          ) : myPersonalBookings.length === 0 ? (
            <div style={{ textAlign:"center", padding:"3rem", color:"#94a3b8" }}>
              <div style={{ fontSize:"2.5rem", marginBottom:12 }}>🎫</div>
              <p style={{ fontWeight:700, color:"#64748b" }}>Aucune réservation personnelle.</p>
              <p style={{ fontSize:"0.85rem" }}>Réservez un véhicule depuis le catalogue pour voir vos réservations ici.</p>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {myPersonalBookings.map((b) => {
                const STATUS_COLORS = {
                  pending:                   { label:"En attente",        color:"#f59e0b", bg:"#fffbeb" },
                  "À confirmer":             { label:"En attente",        color:"#f59e0b", bg:"#fffbeb" },
                  confirmed:                 { label:"Acceptée",          color:"#10b981", bg:"#ecfdf5" },
                  preparing:                 { label:"En préparation",    color:"#06b6d4", bg:"#ecfeff" },
                  ready:                     { label:"Prêt",              color:"#8b5cf6", bg:"#f5f3ff" },
                  in_progress:               { label:"En route",          color:"#3b82f6", bg:"#eff6ff" },
                  client_arrived:            { label:"Vous êtes arrivé",  color:"#0ea5e9", bg:"#e0f2fe" },
                  waiting_client_validation: { label:"✋ Validation",      color:"#d97706", bg:"#fef3c7" },
                  completed:                 { label:"Terminée",          color:"#64748b", bg:"#f8fafc" },
                  cancelled:                 { label:"Annulée",           color:"#ef4444", bg:"#fef2f2" },
                  disputed:                  { label:"Litige",            color:"#dc2626", bg:"#fef2f2" },
                };
                const sc = STATUS_COLORS[b.status] || STATUS_COLORS.pending;
                const fmtDate = (d) => d ? new Date(d).toLocaleDateString("fr-FR", { day:"2-digit", month:"short", year:"numeric" }) : "—";
                const needsValidation = b.status === "waiting_client_validation";
                return (
                  <div key={b.id} style={{
                    background:"#fff", borderRadius:14, border:`1.5px solid ${needsValidation ? "#f59e0b" : "#e2e8f0"}`,
                    padding:"16px 20px", boxShadow: needsValidation ? "0 0 0 3px rgba(245,158,11,0.12)" : "none",
                  }}>
                    {/* En-tête */}
                    <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:8, marginBottom:12 }}>
                      <div>
                        <div style={{ fontWeight:800, color:"#0f1b3f", fontSize:"0.95rem" }}>{b.vehicleName}</div>
                        <div style={{ fontSize:"0.78rem", color:"#94a3b8", marginTop:2 }}>
                          Réf. {b.reference || "—"} · {fmtDate(b.createdAt)}
                        </div>
                        {b.partnerName && (
                          <div style={{ fontSize:"0.78rem", color:"#64748b", marginTop:2 }}>Partenaire : {b.partnerName}</div>
                        )}
                      </div>
                      <span style={{ padding:"3px 12px", borderRadius:99, fontSize:"0.76rem", fontWeight:700, color:sc.color, background:sc.bg }}>
                        {sc.label}
                      </span>
                    </div>

                    {/* Dates & montant */}
                    <div style={{ display:"flex", gap:16, flexWrap:"wrap", fontSize:"0.84rem", color:"#475569", marginBottom:12 }}>
                      {b.startDate && <span>📅 {fmtDate(b.startDate)} → {fmtDate(b.endDate)}</span>}
                      {b.days > 0   && <span>⏱ {b.days} jour{b.days > 1 ? "s" : ""}</span>}
                      {b.montantTotal > 0 && <span style={{ fontWeight:700, color:"#0f1b3f" }}>💰 {Number(b.montantTotal).toLocaleString("fr-FR")} {b.devise}</span>}
                    </div>

                    {/* Bloc validation si en attente */}
                    {needsValidation && b.transaction && (
                      <div style={{ background:"#fef3c7", border:"1.5px solid #f59e0b", borderRadius:10, padding:"14px 16px", marginBottom:12 }}>
                        <p style={{ margin:"0 0 8px", fontWeight:800, color:"#92400e" }}>✋ Validation de transaction requise</p>
                        <div style={{ display:"flex", gap:20, flexWrap:"wrap", fontSize:"0.86rem", color:"#78350f", marginBottom:12 }}>
                          <span>Montant : <strong>{Number(b.transaction.finalAmount).toLocaleString("fr-FR")} {b.devise}</strong></span>
                          <span>Mode : <strong>{b.transaction.paymentMethod === "cash" ? "💵 Espèces" : b.transaction.paymentMethod}</strong></span>
                          {b.transaction.comment && <span>Note : <em>{b.transaction.comment}</em></span>}
                        </div>
                        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                          <button
                            disabled={personalValidating === b.id}
                            onClick={() => handlePersonalValidate(b.id, "validate")}
                            style={{ background:"#10b981", color:"#fff", border:"none", borderRadius:8, padding:"9px 20px", fontWeight:700, fontSize:"0.88rem", cursor:"pointer", opacity: personalValidating === b.id ? 0.6 : 1 }}>
                            {personalValidating === b.id ? "⏳ En cours…" : "✅ Valider — Service effectué"}
                          </button>
                          <button
                            disabled={personalValidating === b.id}
                            onClick={() => setPersonalDispute(b.id)}
                            style={{ background:"#fef2f2", color:"#dc2626", border:"1.5px solid #fca5a5", borderRadius:8, padding:"9px 18px", fontWeight:700, fontSize:"0.88rem", cursor:"pointer" }}>
                            ⚠️ Signaler un problème
                          </button>
                        </div>
                      </div>
                    )}

                    {b.status === "disputed" && (
                      <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8, padding:"10px 14px", fontSize:"0.85rem", color:"#991b1b" }}>
                        ⚠️ Litige signalé — Notre équipe vous contactera sous 48h.
                      </div>
                    )}

                    {b.status === "completed" && (
                      <div style={{ background:"#ecfdf5", border:"1px solid #a7f3d0", borderRadius:8, padding:"10px 14px", fontSize:"0.85rem", color:"#065f46", fontWeight:600 }}>
                        🏁 Réservation terminée avec succès.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Modal litige */}
          {personalDispute && (
            <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9000, padding:"1rem" }}
              onClick={() => setPersonalDispute(null)}>
              <div style={{ background:"#fff", borderRadius:16, padding:"2rem", maxWidth:440, width:"100%", boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }}
                onClick={(e) => e.stopPropagation()}>
                <h3 style={{ margin:"0 0 12px", color:"#0f1b3f" }}>⚠️ Signaler un problème</h3>
                <p style={{ fontSize:"0.9rem", color:"#64748b", marginBottom:12 }}>Décrivez le problème rencontré. Notre équipe vous contactera sous 48h.</p>
                <textarea rows={4}
                  placeholder="Ex : Montant incorrect, service non effectué…"
                  value={personalDisputeText}
                  onChange={(e) => setPersonalDisputeText(e.target.value)}
                  style={{ width:"100%", borderRadius:8, border:"1.5px solid #e2e8f0", padding:"10px 12px", fontSize:"0.88rem", fontFamily:"inherit", resize:"vertical", boxSizing:"border-box", marginBottom:14 }} />
                <div style={{ display:"flex", gap:10 }}>
                  <button
                    disabled={!personalDisputeText.trim() || personalValidating}
                    onClick={() => handlePersonalValidate(personalDispute, "dispute", personalDisputeText)}
                    style={{ flex:1, background:"#dc2626", color:"#fff", border:"none", borderRadius:8, padding:"10px", fontWeight:700, cursor:"pointer" }}>
                    {personalValidating ? "Envoi…" : "Confirmer le litige"}
                  </button>
                  <button onClick={() => { setPersonalDispute(null); setPersonalDisputeText(""); }}
                    style={{ background:"transparent", border:"1.5px solid #e2e8f0", borderRadius:8, padding:"10px 16px", cursor:"pointer", color:"#64748b" }}>
                    Annuler
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ MODAL REFUS ═══════════════════════════════════════════════════ */}
      {rejectModal && (
        <div className={styles.modalBackdrop} onClick={() => { setRejectModal(null); setRejectReasonCode(""); setRejectNote(""); }}>
          <div className={styles.rejectModal} onClick={(e) => e.stopPropagation()}>
            <h3>Refuser la commande</h3>
            <p>Motif du refus <span style={{ color: "#dc2626" }}>*</span> (le client sera notifié) :</p>
            <select value={rejectReasonCode} onChange={(e) => setRejectReasonCode(e.target.value)} style={{ width: "100%", marginBottom: 10 }}>
              <option value="">— Sélectionnez un motif —</option>
              {PARTNER_CANCEL_REASONS.map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
            <p>Précisions (optionnel) :</p>
            <textarea rows={3} className={styles.rejectTextarea} placeholder="Ex : Véhicule indisponible à ces dates…"
              value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} />
            <div className={styles.rejectActions}>
              <button className={styles.btnRefuseModal} disabled={!rejectReasonCode} onClick={handleReject}>Confirmer le refus</button>
              <button className={styles.btnSecondary} onClick={() => { setRejectModal(null); setRejectReasonCode(""); setRejectNote(""); }}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {boostModal && (
        <div className={styles.modalBackdrop} onClick={() => setBoostModal(null)}>
          <div className={styles.rejectModal} onClick={(e) => e.stopPropagation()}>
            <h3>⭐ Booster — {boostModal.title}</h3>
            <p style={{ margin: "0 0 14px", fontSize: "0.85rem", color: "#64748b" }}>Choisissez un palier de mise en avant. Le paiement est confirmé par un administrateur.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {Object.keys(BOOST_TIER_LABELS).map((tier) => (
                <label key={tier} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 12px", border: `1.5px solid ${boostTier === tier ? "#6366f1" : "#e2e8f0"}`, borderRadius: 9, cursor: "pointer" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="radio" name="boostTier" checked={boostTier === tier} onChange={() => setBoostTier(tier)} />
                    {BOOST_TIER_LABELS[tier]}
                  </span>
                  <strong>{boostPricing?.[tier] != null ? fmtXOF(boostPricing[tier]) : "—"}</strong>
                </label>
              ))}
            </div>
            <label style={{ fontSize: ".8rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Code promo (optionnel)</label>
            <input value={boostPromoCode} onChange={(e) => setBoostPromoCode(e.target.value)} placeholder="Ex : LAUNCH50"
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem", marginBottom: 14 }} />
            <div className={styles.rejectActions}>
              <button className={styles.btnApprove} disabled={boostTarget === boostModal.vehicleId}
                onClick={() => handleBoost(boostModal.vehicleId, boostTier, boostPromoCode)}>
                {boostTarget === boostModal.vehicleId ? "…" : "Confirmer"}
              </button>
              <button className={styles.btnSecondary} onClick={() => setBoostModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {promoModal && (
        <div className={styles.modalBackdrop} onClick={() => setPromoModal(null)}>
          <div className={styles.rejectModal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <h3>🏷️ Promotions — {promoModal.name}</h3>
            <p style={{ margin: "0 0 14px", fontSize: "0.85rem", color: "#64748b" }}>
              Configurez autant de règles que vous voulez (ex. "-15% dès 3 jours de location" ET "-25% dès 7 jours" ET
              "-10&nbsp;000 dès 2 jours pour un règlement comptant"). Au moment de la réservation, la règle la plus
              avantageuse pour la durée choisie par le client est appliquée automatiquement au prix.
            </p>

            {promoRules.length === 0 && (
              <p style={{ fontSize: "0.85rem", color: "#94a3b8", margin: "0 0 14px" }}>Aucune règle configurée pour ce véhicule.</p>
            )}

            {promoRules.map((rule, i) => (
              <div key={i} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, cursor: "pointer" }}>
                    <input type="checkbox" checked={rule.active}
                      onChange={(e) => updatePromoRule(i, { active: e.target.checked })} />
                    Règle {i + 1} active
                  </label>
                  <button type="button" className={styles.btnDanger} style={{ padding: "3px 10px", fontSize: "0.78rem" }}
                    onClick={() => removePromoRule(i)}>Supprimer</button>
                </div>

                <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Type de remise</label>
                    <select className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px", width: "100%" }}
                      value={rule.type}
                      onChange={(e) => updatePromoRule(i, { type: e.target.value })}>
                      <option value="percent">Pourcentage (%)</option>
                      <option value="fixed">Montant fixe</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>
                      {rule.type === "percent" ? "Remise (%)" : "Montant fixe déduit"}
                    </label>
                    <input type="number" min="1" max={rule.type === "percent" ? 90 : undefined}
                      className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px" }}
                      value={rule.value}
                      onChange={(e) => updatePromoRule(i, { value: Number(e.target.value) })} />
                    {rule.type === "fixed" && (
                      <p style={{ fontSize: "0.72rem", color: "#94a3b8", margin: "4px 0 0" }}>≈ {fmtXOF(rule.value || 0)} déduit du prix total du séjour</p>
                    )}
                  </div>
                </div>

                <div style={{ marginBottom: 10 }}>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>À partir de combien de jours de location ?</label>
                  <input type="number" min="1" className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px" }}
                    value={rule.minDays}
                    onChange={(e) => updatePromoRule(i, { minDays: Math.max(1, Number(e.target.value)) })} />
                </div>

                <div style={{ marginBottom: 10 }}>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Libellé (optionnel)</label>
                  <input type="text" placeholder="Ex : Offre du week-end" className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px" }}
                    value={rule.label}
                    onChange={(e) => updatePromoRule(i, { label: e.target.value })} />
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Début (optionnel)</label>
                    <input type="date" className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px", width: "100%" }}
                      value={rule.startDate}
                      onChange={(e) => updatePromoRule(i, { startDate: e.target.value })} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Fin (optionnel)</label>
                    <input type="date" className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px", width: "100%" }}
                      value={rule.endDate}
                      onChange={(e) => updatePromoRule(i, { endDate: e.target.value })} />
                  </div>
                </div>
              </div>
            ))}

            <button type="button" className={styles.btnSecondary} style={{ marginBottom: 14 }} onClick={addPromoRule}>
              ➕ Ajouter une règle
            </button>

            <div className={styles.rejectActions}>
              <button className={styles.btnAccept} onClick={handleSavePromo} disabled={promoSaving}>
                {promoSaving ? "Envoi…" : "✅ Enregistrer"}
              </button>
              <button className={styles.btnSecondary} onClick={() => setPromoModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {maintenanceModal && (
        <div className={styles.modalBackdrop} onClick={() => setMaintenanceModal(null)}>
          <div className={styles.rejectModal} style={{ maxWidth: 560, maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h3>🔧 Journal du véhicule — {maintenanceModal.name}</h3>
            <p style={{ margin: "0 0 14px", fontSize: "0.85rem", color: "#64748b" }}>
              Entretiens réalisés, incidents ou dommages constatés (utile pour justifier une retenue sur caution).
            </p>

            <div style={{ background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 10, padding: 12, marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <select value={maintenanceForm.type} onChange={(e) => setMaintenanceForm((p) => ({ ...p, type: e.target.value }))}
                  style={{ padding: "7px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".82rem" }}>
                  <option value="entretien">🛠️ Entretien</option>
                  <option value="incident">⚠️ Incident</option>
                  <option value="dommage">💥 Dommage</option>
                </select>
                <input type="number" placeholder="Kilométrage" value={maintenanceForm.kilometrage}
                  onChange={(e) => setMaintenanceForm((p) => ({ ...p, kilometrage: e.target.value }))}
                  style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".82rem" }} />
                <input type="number" placeholder="Coût (USD)" value={maintenanceForm.cost}
                  onChange={(e) => setMaintenanceForm((p) => ({ ...p, cost: e.target.value }))}
                  style={{ width: 110, padding: "7px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".82rem" }} />
              </div>
              <textarea placeholder="Description (obligatoire)" value={maintenanceForm.description}
                onChange={(e) => setMaintenanceForm((p) => ({ ...p, description: e.target.value }))}
                className={styles.rejectTextarea} style={{ width: "100%", boxSizing: "border-box", minHeight: 60 }} />
              <button className={styles.btnAccept} disabled={maintenanceSubmitting || !maintenanceForm.description.trim()}
                onClick={handleAddMaintenanceLog} style={{ marginTop: 8 }}>
                {maintenanceSubmitting ? "Envoi…" : "+ Ajouter au journal"}
              </button>
            </div>

            {maintenanceLoading ? (
              <p style={{ fontSize: ".85rem", color: "#94a3b8" }}>⏳ Chargement…</p>
            ) : maintenanceLogs.length === 0 ? (
              <p style={{ fontSize: ".85rem", color: "#94a3b8" }}>Aucune entrée pour ce véhicule.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {maintenanceLogs.map((log) => (
                  <div key={log._id} style={{ padding: 10, border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".82rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong>
                        {{ entretien: "🛠️ Entretien", incident: "⚠️ Incident", dommage: "💥 Dommage" }[log.type]} — {new Date(log.date).toLocaleDateString("fr-FR")}
                      </strong>
                      <button onClick={() => handleDeleteMaintenanceLog(log._id)} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: ".8rem" }}>🗑️</button>
                    </div>
                    <p style={{ margin: "4px 0 0", color: "#334155" }}>{log.description}</p>
                    <div style={{ display: "flex", gap: 12, marginTop: 4, color: "#64748b", fontSize: ".78rem" }}>
                      {log.kilometrage != null && <span>{log.kilometrage.toLocaleString("fr-FR")} km</span>}
                      {log.cost > 0 && <span>{fmtXOF(log.cost)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.rejectActions} style={{ marginTop: 14 }}>
              <button className={styles.btnSecondary} onClick={() => setMaintenanceModal(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {driverEditModal && driverEditForm && (
        <div className={styles.modalBackdrop} onClick={() => setDriverEditModal(null)}>
          <div className={styles.rejectModal} style={{ maxWidth: 560, maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h3>✏️ Modifier — {driverEditModal.firstName} {driverEditModal.lastName}</h3>

            <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "10px 0 16px" }}>
              {driverEditForm.profilePhoto
                ? <img src={driverEditForm.profilePhoto} alt="" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover" }} />
                : <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.6rem" }}>👨‍✈️</div>}
              <label className={styles.btnSecondary} style={{ cursor: "pointer" }}>
                Changer la photo
                <input type="file" accept="image/*" hidden onChange={handleDriverEditPhotoFile} />
              </label>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: ".78rem", color: "#64748b" }}>Prénom</label>
                <input type="text" value={driverEditForm.firstName} onChange={(e) => setDriverEditForm((p) => ({ ...p, firstName: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }} />
              </div>
              <div>
                <label style={{ fontSize: ".78rem", color: "#64748b" }}>Nom</label>
                <input type="text" value={driverEditForm.lastName} onChange={(e) => setDriverEditForm((p) => ({ ...p, lastName: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }} />
              </div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: ".78rem", color: "#64748b" }}>Téléphone</label>
              <input type="text" value={driverEditForm.phone} onChange={(e) => setDriverEditForm((p) => ({ ...p, phone: e.target.value }))}
                style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }} />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: ".78rem", color: "#64748b" }}>Titre du profil</label>
              <input type="text" value={driverEditForm.title} onChange={(e) => setDriverEditForm((p) => ({ ...p, title: e.target.value }))}
                style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }} />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: ".78rem", color: "#64748b" }}>Description</label>
              <textarea rows={3} value={driverEditForm.description} onChange={(e) => setDriverEditForm((p) => ({ ...p, description: e.target.value }))}
                style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem", resize: "vertical" }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: ".78rem", color: "#64748b" }}>Tarif / jour</label>
                <input type="number" value={driverEditForm.tarif} onChange={(e) => setDriverEditForm((p) => ({ ...p, tarif: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }} />
              </div>
              <div>
                <label style={{ fontSize: ".78rem", color: "#64748b" }}>Tarif / demi-journée</label>
                <input type="number" value={driverEditForm.tarifDemiJournee} onChange={(e) => setDriverEditForm((p) => ({ ...p, tarifDemiJournee: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }} />
              </div>
              <div>
                <label style={{ fontSize: ".78rem", color: "#64748b" }}>Tarif / heure</label>
                <input type="number" value={driverEditForm.tarifHeure} onChange={(e) => setDriverEditForm((p) => ({ ...p, tarifHeure: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: ".78rem", color: "#64748b" }}>Zone</label>
                <input type="text" value={driverEditForm.zone} onChange={(e) => setDriverEditForm((p) => ({ ...p, zone: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }} />
              </div>
              <div>
                <label style={{ fontSize: ".78rem", color: "#64748b" }}>Ville</label>
                <input type="text" value={driverEditForm.ville} onChange={(e) => setDriverEditForm((p) => ({ ...p, ville: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }} />
              </div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: ".78rem", color: "#64748b" }}>Disponibilité</label>
              <input type="text" placeholder="ex : Lun-Ven 8h-18h" value={driverEditForm.disponibilite} onChange={(e) => setDriverEditForm((p) => ({ ...p, disponibilite: e.target.value }))}
                style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: ".78rem", color: "#64748b", display: "block", marginBottom: 4 }}>CV</label>
              <label className={styles.btnSecondary} style={{ cursor: "pointer", display: "inline-block" }}>
                {driverEditCvName || (driverEditForm.cv ? "Changer le CV" : "Ajouter un CV")}
                <input type="file" accept="application/pdf,image/*" hidden onChange={handleDriverEditCvFile} />
              </label>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, fontSize: ".85rem", cursor: "pointer" }}>
              <input type="checkbox" checked={driverEditForm.vehiculePersonnel}
                onChange={(e) => setDriverEditForm((p) => ({ ...p, vehiculePersonnel: e.target.checked }))} />
              Chauffeur avec véhicule personnel
            </label>

            {driverEditForm.vehiculePersonnel && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: ".78rem", color: "#64748b" }}>Type de véhicule</label>
                <input type="text" value={driverEditForm.typeVehicule} onChange={(e) => setDriverEditForm((p) => ({ ...p, typeVehicule: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem", marginBottom: 8 }} />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {driverEditForm.images.map((img, i) => (
                    <div key={i} style={{ position: "relative" }}>
                      <img src={img} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8 }} />
                      <button type="button" onClick={() => removeDriverEditVehiclePhoto(i)}
                        style={{ position: "absolute", top: -6, right: -6, background: "#dc2626", color: "#fff", border: "none", borderRadius: "50%", width: 20, height: 20, fontSize: ".7rem", cursor: "pointer" }}>×</button>
                    </div>
                  ))}
                  {driverEditForm.images.length < 6 && (
                    <label style={{ width: 64, height: 64, border: "1.5px dashed #cbd5e1", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: "1.3rem", color: "#94a3b8" }}>
                      +
                      <input type="file" accept="image/*" multiple hidden onChange={(e) => addDriverEditVehiclePhotos(e.target.files)} />
                    </label>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className={styles.btnSecondary} onClick={() => setDriverEditModal(null)}>Annuler</button>
              <button className={styles.btnAccept} disabled={driverEditSaving} onClick={handleSaveDriverEdit}>
                {driverEditSaving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {blackoutModal && (
        <div className={styles.modalBackdrop} onClick={() => setBlackoutModal(null)}>
          <div className={styles.rejectModal} style={{ maxWidth: 520, maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h3>🚫 Congés — {blackoutModal.firstName} {blackoutModal.lastName}</h3>
            <p style={{ margin: "0 0 14px", fontSize: "0.85rem", color: "#64748b" }}>
              Bloquez des dates pendant lesquelles ce chauffeur ne peut pas être réservé (congés, indisponibilité).
            </p>

            <div style={{ background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 10, padding: 12, marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input type="date" value={blackoutForm.start} onChange={(e) => setBlackoutForm((p) => ({ ...p, start: e.target.value }))}
                  style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".82rem" }} />
                <input type="date" value={blackoutForm.end} onChange={(e) => setBlackoutForm((p) => ({ ...p, end: e.target.value }))}
                  style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".82rem" }} />
              </div>
              <input type="text" placeholder="Motif (optionnel)" value={blackoutForm.reason}
                onChange={(e) => setBlackoutForm((p) => ({ ...p, reason: e.target.value }))}
                style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".82rem" }} />
              <button className={styles.btnAccept} disabled={blackoutSaving || !blackoutForm.start || !blackoutForm.end}
                onClick={handleAddBlackout} style={{ marginTop: 8 }}>
                {blackoutSaving ? "Envoi…" : "+ Bloquer cette période"}
              </button>
            </div>

            {(blackoutModal.blackoutDates || []).length === 0 ? (
              <p style={{ fontSize: ".85rem", color: "#94a3b8" }}>Aucune période bloquée.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {blackoutModal.blackoutDates.map((b) => (
                  <div key={b._id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 10, border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".82rem" }}>
                    <div>
                      <strong>{new Date(b.start).toLocaleDateString("fr-FR")} → {new Date(b.end).toLocaleDateString("fr-FR")}</strong>
                      {b.reason && <p style={{ margin: "2px 0 0", color: "#64748b" }}>{b.reason}</p>}
                    </div>
                    <button onClick={() => handleRemoveBlackout(b._id)} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: ".8rem" }}>🗑️</button>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.rejectActions} style={{ marginTop: 14 }}>
              <button className={styles.btnSecondary} onClick={() => setBlackoutModal(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {editModal && (
        <div className={styles.modalBackdrop} onClick={() => { setEditModal(null); setEditPhotos([]); }}>
          <div className={styles.rejectModal} style={{ maxWidth: 640, maxHeight: "88vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h3>✏️ Modifier — {editModal.name}</h3>
            {editLoading || !editForm ? (
              <p style={{ textAlign: "center", color: "#94a3b8", padding: "2rem 0" }}>Chargement de l'annonce…</p>
            ) : (
              <>
                {/* Type d'annonce */}
                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  {[{ v: "location", l: "🔑 Location" }, { v: "vente", l: "💰 Vente" }].map((o) => (
                    <button key={o.v} type="button"
                      onClick={() => { setExportMode(false); setEditForm((p) => ({ ...p, type: o.v })); }}
                      style={{
                        flex: 1, padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: ".85rem",
                        border: !exportMode && editForm.type === o.v ? "2px solid #ff4d2d" : "1.5px solid #e2e8f0",
                        background: !exportMode && editForm.type === o.v ? "rgba(255,77,45,.08)" : "#fff",
                        color: !exportMode && editForm.type === o.v ? "#ff4d2d" : "#475569",
                      }}>
                      {o.l}
                    </button>
                  ))}
                  <button type="button" onClick={() => setExportMode(true)}
                    style={{
                      flex: 1, padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: ".85rem",
                      border: exportMode ? "2px solid #6366f1" : "1.5px solid #e2e8f0",
                      background: exportMode ? "rgba(99,102,241,.08)" : "#fff",
                      color: exportMode ? "#6366f1" : "#475569",
                    }}>
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
                        <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Prix d'export *</label>
                        <input type="number" min="0" className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px" }}
                          value={exportForm.price} onChange={(e) => setExportForm((p) => ({ ...p, price: e.target.value }))} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Devise</label>
                        <select className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px" }}
                          value={exportForm.currency} onChange={(e) => setExportForm((p) => ({ ...p, currency: e.target.value }))}>
                          {IE_CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Pays de destination *</label>
                      <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                        <input list="dl-export-avail" className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px", flex: 1 }}
                          value={exportAvailText} onChange={(e) => setExportAvailText(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addExportAvail())}
                          placeholder="Côte d'Ivoire, Sénégal…" />
                        <datalist id="dl-export-avail">{COUNTRIES_ALL.map((c) => <option key={c} value={c} />)}</datalist>
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
                    <div className={styles.rejectActions}>
                      <button className={styles.btnAccept} onClick={handleConvertToExport} disabled={exportSaving}>
                        {exportSaving ? "Conversion…" : "🌍 Transformer en annonce Export"}
                      </button>
                      <button className={styles.btnSecondary} onClick={() => setExportMode(false)}>Annuler</button>
                    </div>
                  </div>
                )}

                {/* Photos */}
                {!exportMode && (<>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 6 }}>Photos ({editPhotos.length}/6)</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                    {editPhotos.map((p) => (
                      <div key={p.id} style={{ position: "relative", width: 72, height: 72 }}>
                        <img src={p.preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }} />
                        <button type="button" onClick={() => removeEditPhoto(p.id)}
                          style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", border: "none", background: "#dc2626", color: "#fff", cursor: "pointer", fontSize: ".7rem", lineHeight: 1 }}>✕</button>
                      </div>
                    ))}
                    {editPhotos.length < 6 && (
                      <label style={{ width: 72, height: 72, border: "1.5px dashed #cbd5e1", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: "1.4rem", color: "#94a3b8" }}>
                        +
                        <input type="file" accept="image/*" multiple hidden onChange={(e) => addEditPhotos(e.target.files)} />
                      </label>
                    )}
                  </div>
                  <p style={{ fontSize: ".72rem", color: "#94a3b8", margin: 0 }}>La première photo devient la couverture de l'annonce.</p>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Titre de l'annonce</label>
                  <input type="text" className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px" }}
                    value={editForm.title} onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))} />
                </div>

                <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Marque</label>
                    <input type="text" className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px" }}
                      value={editForm.marque} onChange={(e) => setEditForm((p) => ({ ...p, marque: e.target.value }))} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Modèle</label>
                    <input type="text" className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px" }}
                      value={editForm.modele} onChange={(e) => setEditForm((p) => ({ ...p, modele: e.target.value }))} />
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Année</label>
                    <select className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px" }}
                      value={editForm.annee} onChange={(e) => setEditForm((p) => ({ ...p, annee: e.target.value }))}>
                      {Array.from({ length: 30 }, (_, i) => new Date().getFullYear() - i).map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>État général</label>
                    <select className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px" }}
                      value={editForm.etat} onChange={(e) => setEditForm((p) => ({ ...p, etat: e.target.value }))}>
                      {["Neuf", "Comme neuf", "Bon état", "À réparer"].map((e_) => <option key={e_} value={e_}>{e_}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Couleur</label>
                    <input type="text" className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px" }}
                      value={editForm.couleur} onChange={(e) => setEditForm((p) => ({ ...p, couleur: e.target.value }))} />
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 140px" }}>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Type de véhicule</label>
                    <select className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px" }}
                      value={editForm.vehicleType} onChange={(e) => setEditForm((p) => ({ ...p, vehicleType: e.target.value }))}>
                      {["SUV", "Berline", "Sportif", "Citadine", "Monospace", "Pick-up", "Cabriolet", "Utilitaire"].map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: "1 1 140px" }}>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Carburant</label>
                    <select className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px" }}
                      value={editForm.carburant} onChange={(e) => setEditForm((p) => ({ ...p, carburant: e.target.value }))}>
                      {["Essence", "Diesel", "Hybride", "Électrique", "GPL"].map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: "1 1 140px" }}>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Transmission</label>
                    <select className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px" }}
                      value={editForm.transmission} onChange={(e) => setEditForm((p) => ({ ...p, transmission: e.target.value }))}>
                      {["Automatique", "Manuelle"].map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Places</label>
                    <input type="number" min="1" max="20" className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px" }}
                      value={editForm.nombrePlaces} onChange={(e) => setEditForm((p) => ({ ...p, nombrePlaces: e.target.value }))} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Portes</label>
                    <input type="number" min="2" max="6" className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px" }}
                      value={editForm.nombrePortes} onChange={(e) => setEditForm((p) => ({ ...p, nombrePortes: e.target.value }))} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Kilométrage</label>
                    <input type="number" min="0" className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px" }}
                      value={editForm.kilometrage} onChange={(e) => setEditForm((p) => ({ ...p, kilometrage: e.target.value }))} />
                  </div>
                </div>

                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.85rem", marginBottom: 12 }}>
                  <input type="checkbox" checked={editForm.climatisation} onChange={(e) => setEditForm((p) => ({ ...p, climatisation: e.target.checked }))} />
                  ❄️ Climatisation
                </label>

                <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>
                      {editForm.type === "vente" ? "Prix de vente" : "Prix / jour"}
                    </label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input type="number" min="0" className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px", flex: 1 }}
                        value={editForm.type === "vente" ? editPriceEntryForSale : editPriceEntryPerDay}
                        onChange={(e) => handleEditPriceEntryChange(editForm.type === "vente" ? "priceForSale" : "pricePerDay", e.target.value)} />
                      <select className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px", width: "auto" }}
                        value={editPriceCurrency} onChange={(e) => handleEditPriceCurrencyChange(e.target.value)}>
                        {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                      </select>
                    </div>
                    {editPriceCurrency !== "USD" && (
                      <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                        ≈ {Number((editForm.type === "vente" ? editForm.priceForSale : editForm.pricePerDay) || 0).toLocaleString("fr-FR")} USD (converti automatiquement)
                      </span>
                    )}
                  </div>
                  {editForm.type !== "vente" && (
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Caution</label>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input type="number" min="0" className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px", flex: 1 }}
                          value={editCautionEntry} onChange={(e) => handleEditPriceEntryChange("caution", e.target.value)} />
                        <span style={{ display: "flex", alignItems: "center", padding: "0 8px", fontSize: "0.82rem", color: "#64748b" }}>{editPriceCurrency}</span>
                      </div>
                      {editPriceCurrency !== "USD" && (
                        <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>≈ {Number(editForm.caution || 0).toLocaleString("fr-FR")} USD (converti automatiquement)</span>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Devise d'affichage de l'annonce</label>
                  <select className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px" }}
                    value={editForm.currency || ""} onChange={(e) => setEditForm((p) => ({ ...p, currency: e.target.value }))}>
                    <option value="">Automatique (devise du visiteur)</option>
                    {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                  </select>
                  <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                    {editForm.currency
                      ? `Tous les visiteurs verront le prix en ${editForm.currency}, quel que soit leur pays.`
                      : "Par défaut : chaque visiteur voit le prix converti dans sa propre devise détectée."}
                  </span>
                </div>

                {editForm.type !== "vente" && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Durée de location proposée</label>
                    <select className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px" }}
                      value={editForm.rentalDurationType} onChange={(e) => setEditForm((p) => ({ ...p, rentalDurationType: e.target.value }))}>
                      <option value="les_deux">Courte et longue durée</option>
                      <option value="courte">Courte durée uniquement</option>
                      <option value="longue">Longue durée uniquement</option>
                    </select>
                  </div>
                )}

                <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Pays</label>
                    <select className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px" }}
                      value={editForm.country} onChange={(e) => setEditForm((p) => ({ ...p, country: e.target.value }))}>
                      <option value="">— Non précisé —</option>
                      {COUNTRIES_CONFIG.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Ville</label>
                    <input type="text" className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px" }}
                      value={editForm.ville} onChange={(e) => setEditForm((p) => ({ ...p, ville: e.target.value }))} />
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Adresse</label>
                  <input type="text" className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px" }}
                    value={editForm.adresse} onChange={(e) => setEditForm((p) => ({ ...p, adresse: e.target.value }))} />
                </div>

                {/* Bug réel corrigé (audit) : contactNom/contactTel sont saisis
                    une seule fois à la publication (identity.telephone, voir
                    VendorSubmit.jsx) et n'apparaissaient ensuite NULLE PART en
                    édition — aucun moyen de corriger un numéro faux ou de le
                    mettre à jour, alors que le backend l'accepte déjà (EDITABLE,
                    vehicleController.updateVehicle). */}
                <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Nom du contact</label>
                    <input type="text" className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px" }}
                      value={editForm.contactNom} onChange={(e) => setEditForm((p) => ({ ...p, contactNom: e.target.value }))} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Téléphone du contact</label>
                    <input type="tel" className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px" }}
                      value={editForm.contactTel} onChange={(e) => setEditForm((p) => ({ ...p, contactTel: e.target.value }))} />
                  </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Description</label>
                  <textarea className={styles.rejectTextarea} rows={3}
                    value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>
                    {editForm.type === "vente" ? "Conditions de vente particulières — optionnel" : "Conditions de location particulières — optionnel"}
                  </label>
                  {editForm.type === "vente" ? (
                    <textarea className={styles.rejectTextarea} rows={3}
                      placeholder="Ex : garantie 3 mois pièces et main d'œuvre, contrôle technique fourni..."
                      value={editForm.conditionsVente} onChange={(e) => setEditForm((p) => ({ ...p, conditionsVente: e.target.value }))} />
                  ) : (
                    <textarea className={styles.rejectTextarea} rows={3}
                      placeholder="Ex : kilométrage inclus 200km/jour, pénalité retard 5000 USD/heure..."
                      value={editForm.conditionsLocation} onChange={(e) => setEditForm((p) => ({ ...p, conditionsLocation: e.target.value }))} />
                  )}
                </div>
                {editForm.type === "vente" && (
                  <div style={{ marginBottom: 14, padding: 12, background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 10 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.85rem", fontWeight: 700, marginBottom: editForm.leasing.disponible ? 10 : 0 }}>
                      <input type="checkbox" checked={editForm.leasing.disponible}
                        onChange={(e) => setEditForm((p) => ({ ...p, leasing: { ...p.leasing, disponible: e.target.checked } }))} />
                      🏦 Option Leasing
                    </label>
                    {editForm.leasing.disponible && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <div>
                          <label style={{ fontSize: ".76rem", color: "#64748b" }}>Apport initial (USD)</label>
                          <input type="number" min="0" value={editForm.leasing.apportInitial}
                            onChange={(e) => setEditForm((p) => ({ ...p, leasing: { ...p.leasing, apportInitial: e.target.value } }))}
                            style={{ width: "100%", boxSizing: "border-box", padding: "6px 9px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".82rem" }} />
                        </div>
                        <div>
                          <label style={{ fontSize: ".76rem", color: "#64748b" }}>Mensualité (USD/mois)</label>
                          <input type="number" min="0" value={editForm.leasing.mensualite}
                            onChange={(e) => setEditForm((p) => ({ ...p, leasing: { ...p.leasing, mensualite: e.target.value } }))}
                            style={{ width: "100%", boxSizing: "border-box", padding: "6px 9px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".82rem" }} />
                        </div>
                        <div>
                          <label style={{ fontSize: ".76rem", color: "#64748b" }}>Durée</label>
                          <select value={editForm.leasing.duree}
                            onChange={(e) => setEditForm((p) => ({ ...p, leasing: { ...p.leasing, duree: Number(e.target.value) } }))}
                            style={{ width: "100%", padding: "6px 9px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".82rem" }}>
                            {[12, 24, 36, 48, 60].map((m) => <option key={m} value={m}>{m} mois</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: ".76rem", color: "#64748b" }}>Taux d'intérêt (%/an)</label>
                          <input type="number" min="0" max="30" step="0.5" value={editForm.leasing.tauxInteret}
                            onChange={(e) => setEditForm((p) => ({ ...p, leasing: { ...p.leasing, tauxInteret: e.target.value } }))}
                            style={{ width: "100%", boxSizing: "border-box", padding: "6px 9px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".82rem" }} />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {editForm.type === "vente" && (
                  <div style={{ marginBottom: 14, padding: 12, background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 10 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.85rem", fontWeight: 700, marginBottom: editForm.credit.disponible ? 10 : 0 }}>
                      <input type="checkbox" checked={editForm.credit.disponible}
                        onChange={(e) => setEditForm((p) => ({ ...p, credit: { ...p.credit, disponible: e.target.checked } }))} />
                      💳 Option Crédit classique
                    </label>
                    {editForm.credit.disponible && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <div>
                          <label style={{ fontSize: ".76rem", color: "#64748b" }}>Apport initial (USD)</label>
                          <input type="number" min="0" value={editForm.credit.apportInitial}
                            onChange={(e) => setEditForm((p) => ({ ...p, credit: { ...p.credit, apportInitial: e.target.value } }))}
                            style={{ width: "100%", boxSizing: "border-box", padding: "6px 9px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".82rem" }} />
                        </div>
                        <div>
                          <label style={{ fontSize: ".76rem", color: "#64748b" }}>Mensualité (USD/mois)</label>
                          <input type="number" min="0" value={editForm.credit.mensualite}
                            onChange={(e) => setEditForm((p) => ({ ...p, credit: { ...p.credit, mensualite: e.target.value } }))}
                            style={{ width: "100%", boxSizing: "border-box", padding: "6px 9px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".82rem" }} />
                        </div>
                        <div>
                          <label style={{ fontSize: ".76rem", color: "#64748b" }}>Durée</label>
                          <select value={editForm.credit.duree}
                            onChange={(e) => setEditForm((p) => ({ ...p, credit: { ...p.credit, duree: Number(e.target.value) } }))}
                            style={{ width: "100%", padding: "6px 9px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".82rem" }}>
                            {[12, 24, 36, 48, 60].map((m) => <option key={m} value={m}>{m} mois</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: ".76rem", color: "#64748b" }}>Taux d'intérêt (%/an)</label>
                          <input type="number" min="0" max="30" step="0.5" value={editForm.credit.tauxInteret}
                            onChange={(e) => setEditForm((p) => ({ ...p, credit: { ...p.credit, tauxInteret: e.target.value } }))}
                            style={{ width: "100%", boxSizing: "border-box", padding: "6px 9px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".82rem" }} />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {editForm.type !== "vente" && (
                  <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Âge minimum requis</label>
                      <input type="number" min="0" className={styles.rejectTextarea} style={{ minHeight: "auto", padding: "8px 12px" }}
                        value={editForm.ageMin} onChange={(e) => setEditForm((p) => ({ ...p, ageMin: e.target.value }))} />
                    </div>
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                  {editForm.type !== "vente" && (
                    <>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.85rem" }}>
                        <input type="checkbox" checked={editForm.permisRequis} onChange={(e) => setEditForm((p) => ({ ...p, permisRequis: e.target.checked }))} />
                        Permis de conduire requis
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.85rem" }}>
                        <input type="checkbox" checked={editForm.assuranceOptionnelle} onChange={(e) => setEditForm((p) => ({ ...p, assuranceOptionnelle: e.target.checked }))} />
                        Assurance optionnelle proposée
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.85rem" }}>
                        <input type="checkbox" checked={editForm.withDriver} onChange={(e) => setEditForm((p) => ({ ...p, withDriver: e.target.checked }))} />
                        Disponible avec chauffeur
                      </label>
                    </>
                  )}
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.85rem", fontWeight: 700 }}>
                    <input type="checkbox" checked={editForm.available} onChange={(e) => setEditForm((p) => ({ ...p, available: e.target.checked }))} />
                    Annonce disponible (visible au catalogue)
                  </label>
                </div>
                <div className={styles.rejectActions}>
                  <button className={styles.btnAccept} onClick={handleSaveEdit} disabled={editSaving}>
                    {editSaving ? "Envoi…" : "✅ Enregistrer"}
                  </button>
                  <button className={styles.btnSecondary} onClick={() => { setEditModal(null); setEditPhotos([]); }}>Annuler</button>
                </div>
                </>)}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
