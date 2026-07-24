import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useChat } from "../context/ChatContext";
import styles from "./IETransactionTracking.module.css";

const fmtPrice = (p, c = "EUR") =>
  p != null ? `${Number(p).toLocaleString("fr-FR")} ${c}` : "—";
const fmtDate = (d) =>
  d ? new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

// Contrairement aux réservations classiques (location/essai — voir
// VendorDashboard.jsx), le partenaire ne voyait ici que nom/téléphone/email du
// client, sans aucune indication de vérification d'identité — même champ
// User.kycStatus pourtant déjà exposé côté location. Même config que
// VendorDashboard.jsx pour un rendu cohérent entre les deux flux.
const KYC_CFG = {
  VERIFIE:               { label: "KYC Vérifié",    color: "#059669", bg: "#d1fae5", icon: "✅" },
  EN_ATTENTE:            { label: "KYC En attente", color: "#d97706", bg: "#fef3c7", icon: "⏳" },
  A_REVOIR_MANUELLEMENT: { label: "KYC En révision", color: "#2563eb", bg: "#dbeafe", icon: "🔍" },
  REFUSE:                { label: "KYC Refusé",     color: "#dc2626", bg: "#fee2e2", icon: "❌" },
};

// ── Définition des 14 étapes ───────────────────────────────────────────────
const STEPS = [
  { status: "reserved",             label: "Réservation",         icon: "📋", step: 4  },
  { status: "confirmed",            label: "Confirmation",         icon: "✅", step: 5  },
  { status: "in_discussion",        label: "Discussion",           icon: "💬", step: 6  },
  { status: "inspection_requested", label: "Inspection demandée",  icon: "🔍", step: 7  },
  { status: "inspection_done",      label: "Inspection terminée",  icon: "🔍", step: 7  },
  { status: "offer_sent",           label: "Offre finale",         icon: "📄", step: 8  },
  { status: "offer_accepted",       label: "Offre acceptée",       icon: "🤝", step: 8  },
  { status: "payment_pending",      label: "Paiement requis",      icon: "💳", step: 9  },
  { status: "payment_submitted",    label: "Paiement en vérification", icon: "⏳", step: 9  },
  { status: "in_escrow",            label: "Fonds sécurisés",      icon: "🔒", step: 9  },
  { status: "preparing",            label: "Préparation export",   icon: "📦", step: 10 },
  { status: "shipped",              label: "Expédié",              icon: "🚢", step: 11 },
  { status: "in_transit",           label: "En transit",           icon: "🌍", step: 11 },
  { status: "delivered",            label: "Livré",                icon: "📬", step: 12 },
  { status: "funds_released",       label: "Fonds libérés",        icon: "💰", step: 13 },
  { status: "completed",            label: "Terminé",              icon: "⭐", step: 14 },
];

const STATUS_ORDER = STEPS.map((s) => s.status);

const DOC_LABELS = {
  commercialInvoice: "Facture commerciale",
  customsDocs:       "Documents douaniers",
  originCertificate: "Certificat d'origine",
  billOfLading:      "Connaissement (B/L)",
  inspectionDocs:    "Documents d'inspection",
  transportBooking:  "Réservation transport",
};

const DOC_STATUS_CFG = {
  en_attente: { label: "En attente", color: "#f59e0b", bg: "#fffbeb" },
  fourni:     { label: "Fourni",     color: "#3b82f6", bg: "#eff6ff" },
  valide:     { label: "Validé",     color: "#10b981", bg: "#ecfdf5" },
  non_requis: { label: "N/R",        color: "#94a3b8", bg: "#f8fafc" },
};

// ── Barre de progression ───────────────────────────────────────────────────
function ProgressBar({ status }) {
  const currentIdx = STATUS_ORDER.indexOf(status);
  const terminalStatuses = ["cancelled", "disputed"];

  if (terminalStatuses.includes(status)) {
    return (
      <div className={styles.progressWrap}>
        <div className={`${styles.statusBadge} ${styles[`badge_${status}`]}`}>
          {status === "cancelled" ? "❌ Annulée" : "⚠️ Litige en cours"}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.progressWrap}>
      <div className={styles.stepsTrack}>
        {STEPS.filter((s) => !["inspection_requested", "offer_accepted", "payment_pending", "payment_submitted"].includes(s.status)).map((s, i, arr) => {
          const stepIdx   = STATUS_ORDER.indexOf(s.status);
          const isDone    = currentIdx >= stepIdx;
          const isCurrent = STATUS_ORDER[currentIdx] === s.status;
          return (
            <div key={s.status} className={styles.stepItem}>
              <div className={`${styles.stepDot} ${isDone ? styles.stepDotDone : ""} ${isCurrent ? styles.stepDotCurrent : ""}`}>
                {isDone ? "✓" : s.icon}
              </div>
              <p className={`${styles.stepLabel} ${isCurrent ? styles.stepLabelCurrent : ""}`}>{s.label}</p>
              {i < arr.length - 1 && (
                <div className={`${styles.stepLine} ${isDone && currentIdx > stepIdx ? styles.stepLineDone : ""}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Panneau d'action selon statut et rôle ─────────────────────────────────
function ActionPanel({ tx, role, token, onRefresh, paymentProfile }) {
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);
  const [form, setForm]                 = useState({});
  const [cancelReason, setCancelReason] = useState(null);  // null = form masqué
  const [disputeReason, setDisputeReason] = useState(null);

  // ── "Devis partenaire" (niveau 2 de l'Import Cost Engine) ────────────────
  // Pré-remplit l'offre finale à partir du devis auto-calculé à la réservation
  // (tx.costEstimate) — le partenaire valide ou ajuste au lieu de repartir de
  // zéro. Une fois envoyée puis acceptée par le client, l'offre est verrouillée
  // (acceptOffer ne peut plus être suivi d'un nouvel appel à sendFinalOffer) :
  // c'est le niveau 3 "Prix garanti", déjà assuré par le pipeline existant.
  useEffect(() => {
    const est = tx.costEstimate;
    if (est?.available && ["confirmed", "in_discussion", "inspection_done"].includes(tx.status)) {
      setForm((f) => (f.vehiclePrice !== undefined ? f : {
        vehiclePrice: est.breakdown.vehiclePrice,
        exportFees:   Math.round((est.breakdown.portFees + est.breakdown.customs + est.breakdown.commission) * 100) / 100,
        shippingCost: Math.round((est.breakdown.inlandTransport + est.breakdown.seaFreight + est.breakdown.delivery) * 100) / 100,
        insurance:    est.breakdown.insurance,
        currency:     est.currency,
        prefilled:    true,
      }));
    }
  }, [tx.costEstimate, tx.status]);

  const call = async (url, method = "PATCH", body = {}) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const base = `/api/import-export/transactions/${tx._id}`;

  // ── Étape 5 : confirmation partenaire ─────────────────────────────────
  if (tx.status === "reserved" && role === "partner") {
    return (
      <div className={styles.actionCard}>
        <h4>Action requise — Confirmez la disponibilité</h4>
        <p>Le client a réservé ce véhicule. Confirmez que le véhicule est disponible, que le prix est valable et que les informations sont exactes.</p>
        {cancelReason !== null ? (
          <div className={styles.inlineForm}>
            <input
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Motif d'annulation (optionnel)"
              className={styles.inlineInput}
            />
            <div className={styles.actionBtns}>
              <button className={styles.btnDanger} disabled={loading}
                onClick={() => { call(`${base}/cancel`, "PATCH", { reason: cancelReason }); setCancelReason(null); }}>
                Confirmer l'annulation
              </button>
              <button className={styles.btnGhost} onClick={() => setCancelReason(null)}>Fermer</button>
            </div>
          </div>
        ) : (
          <div className={styles.actionBtns}>
            <button className={styles.btnPrimary} disabled={loading} onClick={() => call(`${base}/confirm`)}>
              ✅ Confirmer la disponibilité
            </button>
            <button className={styles.btnDanger} disabled={loading} onClick={() => setCancelReason("")}>
              Annuler la réservation
            </button>
          </div>
        )}
        {error && <p className={styles.err}>{error}</p>}
      </div>
    );
  }

  // ── Étape 6 : client peut demander inspection ou passer à la discussion ─
  if (tx.status === "confirmed" && role === "client") {
    return (
      <div className={styles.actionCard}>
        <h4>Votre véhicule est confirmé !</h4>
        <p>Le fournisseur a confirmé la disponibilité. Vous pouvez maintenant discuter directement ou demander une inspection indépendante VIT AUTO.</p>
        <div className={styles.actionBtns}>
          <button className={styles.btnSecondary} disabled={loading} onClick={() => call(`${base}/request-inspection`, "PATCH")}>
            🔍 Demander une inspection indépendante
          </button>
        </div>
        <p className={styles.actionNote}>L'inspection indépendante est réalisée par un inspecteur partenaire VIT AUTO. Elle peut prendre 3 à 7 jours.</p>
        {error && <p className={styles.err}>{error}</p>}
      </div>
    );
  }

  // ── Étape 8 : offre finale — partenaire ────────────────────────────────
  if (["confirmed", "in_discussion", "inspection_done"].includes(tx.status) && role === "partner") {
    const offerCurrency = form.currency || "EUR";
    return (
      <div className={styles.actionCard}>
        <h4>Envoyer l'offre finale</h4>
        <p>Composez l'offre finale avec tous les frais détaillés.</p>
        {form.prefilled && (
          <p className={styles.actionNote}>💡 Pré-rempli à partir du devis automatique (transport, douanes et commission VIT AUTO déjà inclus dans "Frais d'export"/"Frais de transport") — ajustez si besoin avant d'envoyer.</p>
        )}
        <div className={styles.offerForm}>
          <div className={styles.formRow2}>
            <label><span>Prix véhicule * ({offerCurrency})</span>
              <input type="number" placeholder="25000" value={form.vehiclePrice ?? ""} onChange={(e) => setForm((f) => ({ ...f, vehiclePrice: e.target.value }))} /></label>
            <label><span>Frais d'export (douanes, port, commission)</span>
              <input type="number" placeholder="500" value={form.exportFees ?? ""} onChange={(e) => setForm((f) => ({ ...f, exportFees: e.target.value }))} /></label>
          </div>
          <div className={styles.formRow2}>
            <label><span>Frais de transport (intérieur + fret + livraison)</span>
              <input type="number" placeholder="1200" value={form.shippingCost ?? ""} onChange={(e) => setForm((f) => ({ ...f, shippingCost: e.target.value }))} /></label>
            <label><span>Assurance (optionnel)</span>
              <input type="number" placeholder="300" value={form.insurance ?? ""} onChange={(e) => setForm((f) => ({ ...f, insurance: e.target.value }))} /></label>
          </div>
          <label><span>Délai estimé</span><input placeholder="Ex : 45-60 jours" value={form.estimatedDelay ?? ""} onChange={(e) => setForm((f) => ({ ...f, estimatedDelay: e.target.value }))} /></label>
          <label><span>Notes</span><textarea rows={2} placeholder="Conditions particulières…" value={form.notes ?? ""} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></label>
          {form.vehiclePrice && (
            <div className={styles.offerTotal}>
              <span>Total estimé :</span>
              <strong>{fmtPrice(
                (Number(form.vehiclePrice) || 0) + (Number(form.exportFees) || 0) + (Number(form.shippingCost) || 0) + (Number(form.insurance) || 0), offerCurrency
              )}</strong>
            </div>
          )}
          <button className={styles.btnPrimary} disabled={loading || !form.vehiclePrice}
            onClick={() => call(`${base}/final-offer`, "POST", { ...form, currency: offerCurrency })}>
            📄 Envoyer l'offre finale
          </button>
        </div>
        {error && <p className={styles.err}>{error}</p>}
      </div>
    );
  }

  // ── Étape 8 : offre finale — client ────────────────────────────────────
  if (tx.status === "offer_sent" && role === "client") {
    const o = tx.finalOffer;
    return (
      <div className={styles.actionCard}>
        <h4>Offre finale reçue</h4>
        <div className={styles.offerBreakdown}>
          <div className={styles.offerLine}><span>Prix du véhicule</span><strong>{fmtPrice(o.vehiclePrice, o.currency)}</strong></div>
          <div className={styles.offerLine}><span>Frais d'export</span><strong>{fmtPrice(o.exportFees, o.currency)}</strong></div>
          <div className={styles.offerLine}><span>Frais de transport</span><strong>{fmtPrice(o.shippingCost, o.currency)}</strong></div>
          {o.insurance > 0 && <div className={styles.offerLine}><span>Assurance</span><strong>{fmtPrice(o.insurance, o.currency)}</strong></div>}
          <div className={`${styles.offerLine} ${styles.offerTotal}`}><span>TOTAL</span><strong>{fmtPrice(o.totalAmount, o.currency)}</strong></div>
          {o.estimatedDelay && <div className={styles.offerLine}><span>⏱️ Délai estimé</span><strong>{o.estimatedDelay}</strong></div>}
          {o.notes && <p className={styles.offerNotes}>{o.notes}</p>}
        </div>
        {cancelReason !== null ? (
          <div className={styles.inlineForm}>
            <input
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Motif du refus (optionnel)"
              className={styles.inlineInput}
            />
            <div className={styles.actionBtns}>
              <button className={styles.btnDanger} disabled={loading}
                onClick={() => { call(`${base}/cancel`, "PATCH", { reason: cancelReason }); setCancelReason(null); }}>
                Confirmer le refus
              </button>
              <button className={styles.btnGhost} onClick={() => setCancelReason(null)}>Fermer</button>
            </div>
          </div>
        ) : (
          <div className={styles.actionBtns}>
            <button className={styles.btnPrimary} disabled={loading} onClick={() => call(`${base}/accept-offer`)}>
              🤝 Accepter l'offre
            </button>
            <button className={styles.btnDanger} disabled={loading} onClick={() => setCancelReason("")}>
              Décliner l'offre
            </button>
          </div>
        )}
        {error && <p className={styles.err}>{error}</p>}
      </div>
    );
  }

  // ── Étape 9 : paiement ─────────────────────────────────────────────────
  // "Carte" redirige vers un vrai Stripe Checkout (payé et confirmé par
  // webhook — jamais déclaré). Les autres méthodes ne peuvent pas être
  // vérifiées automatiquement (pas d'intégration bancaire réelle) : le client
  // déclare son paiement, un admin VIT AUTO doit ensuite confirmer la
  // réception réelle des fonds avant que l'entiercement ne soit sécurisé.
  if (tx.status === "payment_pending" && role === "client") {
    const isManual = form.method && form.method !== "carte";
    const isLc = form.method === "lc";
    const installmentAllowed = isManual;
    const depositPercent = Number(form.depositPercent) || 30;
    const total = tx.finalOffer?.totalAmount || 0;
    const payAction = async () => {
      setLoading(true); setError(null);
      try {
        const body = { ...form };
        if (form.installmentEnabled) {
          body.installment = { enabled: true, depositPercent };
        }
        const res = await fetch(`${base}/pay`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        if (data.checkoutUrl) { window.location.href = data.checkoutUrl; return; }
        onRefresh();
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    return (
      <div className={styles.actionCard}>
        <h4>Procédez au paiement sécurisé</h4>
        <p>Votre paiement sera placé sur un compte d'entiercement (Escrow). Les fonds ne seront versés au fournisseur qu'après confirmation de livraison.</p>
        {paymentProfile && (
          <p className={styles.actionNote}>
            ℹ️ Profil fournisseur : <strong>{paymentProfile.label}</strong> — méthodes recommandées : {paymentProfile.recommended?.map((m) => ({ carte: "Carte", virement: "Virement SWIFT", lc: "Lettre de Crédit" }[m] || m)).join(", ")}.
            Ceci n'est qu'une recommandation, vous restez libre de choisir n'importe quelle option ci-dessous.
          </p>
        )}
        <div className={styles.escrowInfo}>
          <div>💰 <strong>{fmtPrice(total, tx.finalOffer?.currency)}</strong></div>
        </div>
        <div className={styles.formRow2}>
          <label><span>Moyen de paiement</span>
            <select onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))} defaultValue="">
              <option value="">Choisir…</option>
              <option value="carte">Carte bancaire (paiement sécurisé en ligne)</option>
              <option value="virement">Virement bancaire (SWIFT)</option>
              <option value="mobile_money">Mobile Money</option>
              <option value="crypto">Cryptomonnaie</option>
              <option value="lc">Lettre de Crédit (LC)</option>
            </select>
          </label>
          {isManual && !isLc && (
            <label><span>Référence transaction</span><input placeholder="Réf de votre paiement" onChange={(e) => setForm((f) => ({ ...f, transactionRef: e.target.value }))} /></label>
          )}
        </div>
        {isLc && (
          <div className={styles.formRow2}>
            <label><span>Référence LC (fournie par votre banque)</span>
              <input placeholder="Ex : LC-2026-00123" onChange={(e) => setForm((f) => ({ ...f, lcReference: e.target.value }))} />
            </label>
          </div>
        )}
        {isLc && (
          <p className={styles.actionNote}>
            🏦 VIT AUTO ne gère pas l'exécution bancaire de la LC : votre banque libérera les fonds au fournisseur une fois les documents d'export (facture commerciale, connaissement, certificat d'origine, rapport d'inspection) validés par VIT AUTO.
          </p>
        )}
        {installmentAllowed && (
          <div className={styles.formRow2}>
            <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={!!form.installmentEnabled} onChange={(e) => setForm((f) => ({ ...f, installmentEnabled: e.target.checked }))} />
              <span>Payer en 2 fois (acompte + solde)</span>
            </label>
            {form.installmentEnabled && (
              <label><span>Pourcentage d'acompte</span>
                <input type="number" min={1} max={99} placeholder="30" onChange={(e) => setForm((f) => ({ ...f, depositPercent: e.target.value }))} />
              </label>
            )}
          </div>
        )}
        {form.installmentEnabled && (
          <p className={styles.actionNote}>
            💡 Acompte à déclarer maintenant : <strong>{fmtPrice(Math.round(total * depositPercent / 100), tx.finalOffer?.currency)}</strong> ({depositPercent}%). Le solde de {fmtPrice(total - Math.round(total * depositPercent / 100), tx.finalOffer?.currency)} sera à régler avant l'expédition, une fois l'acompte vérifié.
          </p>
        )}
        {isManual && (
          <p className={styles.actionNote}>
            ⏳ Cette méthode ne peut pas être vérifiée automatiquement — VIT AUTO confirmera manuellement la réception des fonds avant de sécuriser l'entiercement.
          </p>
        )}
        <button className={styles.btnPrimary} disabled={loading || !form.method || (isLc && !form.lcReference)} onClick={payAction}>
          {form.method === "carte" ? "💳 Payer par carte" : "🔒 Déclarer mon paiement"}
        </button>
        {error && <p className={styles.err}>{error}</p>}
      </div>
    );
  }

  // ── Étape 9 : paiement déclaré, en attente de vérification VIT AUTO ────
  if (tx.status === "payment_submitted") {
    const inst = tx.payment?.installment;
    const depositVerified = !!inst?.depositPaidAt;
    const balanceDeclared = !!inst?.balanceSubmittedAt;
    const canPayBalance = role === "client" && inst?.enabled && depositVerified && !balanceDeclared;

    const payBalance = async () => {
      setLoading(true); setError(null);
      try {
        const res = await fetch(`${base}/pay-balance`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        onRefresh();
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className={styles.actionCard}>
        <h4>⏳ Paiement en cours de vérification</h4>
        <p>
          {role === "client"
            ? "Vous avez déclaré votre paiement. VIT AUTO vérifie la réception réelle des fonds avant de sécuriser l'entiercement — vous serez notifié dès confirmation."
            : "Le client a déclaré son paiement. VIT AUTO vérifie la réception des fonds avant de sécuriser l'entiercement — vous serez notifié dès confirmation."}
        </p>
        <div className={styles.escrowInfo}>
          <div>💰 <strong>{fmtPrice(tx.payment?.amount, tx.payment?.currency)}</strong></div>
          {tx.payment?.transactionRef && <p>Référence déclarée : <code>{tx.payment.transactionRef}</code></p>}
          {tx.payment?.method === "lc" && tx.payment?.lc?.reference && (
            <p>🏦 Lettre de Crédit : <code>{tx.payment.lc.reference}</code> — les documents d'export doivent être validés avant tout déblocage de fonds.</p>
          )}
        </div>
        {inst?.enabled && (
          <div className={styles.escrowInfo}>
            <p>Acompte ({inst.depositPercent}%) : <strong>{fmtPrice(inst.depositAmount, tx.payment?.currency)}</strong> — {depositVerified ? "✅ vérifié" : "⏳ en attente de vérification"}</p>
            {depositVerified && (
              <p>Solde restant : <strong>{fmtPrice(inst.balanceAmount || (tx.payment?.amount - inst.depositAmount), tx.payment?.currency)}</strong> — {balanceDeclared ? (inst.balancePaidAt ? "✅ vérifié" : "⏳ en attente de vérification") : "à déclarer"}</p>
            )}
          </div>
        )}
        {canPayBalance && (
          <div className={styles.inlineForm}>
            <input placeholder="Référence de votre paiement du solde" onChange={(e) => setForm((f) => ({ ...f, transactionRef: e.target.value }))} className={styles.inlineInput} />
            <button className={styles.btnPrimary} disabled={loading} onClick={payBalance}>💰 Déclarer le règlement du solde</button>
          </div>
        )}
        {error && <p className={styles.err}>{error}</p>}
      </div>
    );
  }

  // ── Étape 11 : expédition — partenaire ─────────────────────────────────
  if (tx.status === "in_escrow" || (tx.status === "preparing" && role === "partner")) {
    if (role !== "partner") return null;
    return (
      <div className={styles.actionCard}>
        <h4>Enregistrer l'expédition</h4>
        <div className={styles.formRow2}>
          <label><span>Transporteur</span><input placeholder="MSC, CMA CGM…" onChange={(e) => setForm((f) => ({ ...f, carrier: e.target.value }))} /></label>
          <label><span>N° de suivi</span><input placeholder="MSCU1234567" onChange={(e) => setForm((f) => ({ ...f, trackingNumber: e.target.value }))} /></label>
        </div>
        <div className={styles.formRow2}>
          <label><span>Type</span>
            <select onChange={(e) => setForm((f) => ({ ...f, shippingType: e.target.value }))}>
              <option value="maritime">Maritime</option>
              <option value="terrestre">Terrestre</option>
              <option value="aerien">Aérien</option>
            </select>
          </label>
          <label><span>Date de départ</span><input type="date" onChange={(e) => setForm((f) => ({ ...f, departureDate: e.target.value }))} /></label>
        </div>
        <label><span>Arrivée estimée</span><input type="date" onChange={(e) => setForm((f) => ({ ...f, estimatedArrival: e.target.value }))} /></label>
        <button className={styles.btnPrimary} disabled={loading}
          onClick={() => call(`${base}/ship`, "PATCH", { ...form, shippingType: form.shippingType || "maritime" })}>
          🚢 Marquer comme expédié
        </button>
        {error && <p className={styles.err}>{error}</p>}
      </div>
    );
  }

  // ── Étape 12 : confirmation livraison — client ──────────────────────────
  if (["shipped", "in_transit"].includes(tx.status) && role === "client") {
    return (
      <div className={styles.actionCard}>
        <h4>Confirmer la réception</h4>
        <p>Avez-vous bien reçu le véhicule dans l'état convenu ?</p>
        <label><span>Notes de livraison (optionnel)</span><textarea rows={2} placeholder="Tout est conforme / Observations…" onChange={(e) => setForm((f) => ({ ...f, deliveryNotes: e.target.value }))} /></label>
        {disputeReason !== null ? (
          <div className={styles.inlineForm}>
            <p className={styles.disputeWarning}>⚠️ Décrivez le problème constaté :</p>
            <textarea
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="Décrivez le problème (véhicule non conforme, retard excessif…)"
              rows={3}
              className={styles.inlineTextarea}
            />
            <div className={styles.actionBtns}>
              <button className={styles.btnDanger} disabled={loading || !disputeReason.trim()}
                onClick={() => { call(`${base}/dispute`, "POST", { reason: disputeReason }); setDisputeReason(null); }}>
                Confirmer le litige
              </button>
              <button className={styles.btnGhost} onClick={() => setDisputeReason(null)}>Annuler</button>
            </div>
          </div>
        ) : (
          <div className={styles.actionBtns}>
            <button className={styles.btnPrimary} disabled={loading} onClick={() => call(`${base}/deliver`, "PATCH", form)}>
              📬 Confirmer la réception
            </button>
            <button className={styles.btnDanger} disabled={loading} onClick={() => setDisputeReason("")}>
              ⚠️ Ouvrir un litige
            </button>
          </div>
        )}
        {error && <p className={styles.err}>{error}</p>}
      </div>
    );
  }

  // ── Étape 13 : libération des fonds — client / admin ───────────────────
  if (tx.status === "delivered" && (role === "client" || role === "admin")) {
    return (
      <div className={styles.actionCard}>
        <h4>Libérer les fonds</h4>
        <p>En confirmant que le véhicule est conforme, les fonds seront versés au fournisseur.</p>
        <div className={styles.escrowInfo}>
          <div>💰 <strong>{fmtPrice(tx.payment?.amount, tx.payment?.currency)}</strong> → Fournisseur</div>
          <p>Réf. entiercement : <code>{tx.payment?.escrowRef}</code></p>
        </div>
        {disputeReason !== null ? (
          <div className={styles.inlineForm}>
            <p className={styles.disputeWarning}>⚠️ Décrivez le problème constaté :</p>
            <textarea
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="Décrivez le problème (véhicule non conforme, dommages à la livraison…)"
              rows={3}
              className={styles.inlineTextarea}
            />
            <div className={styles.actionBtns}>
              <button className={styles.btnDanger} disabled={loading || !disputeReason.trim()}
                onClick={() => { call(`${base}/dispute`, "POST", { reason: disputeReason }); setDisputeReason(null); }}>
                Confirmer le litige
              </button>
              <button className={styles.btnGhost} onClick={() => setDisputeReason(null)}>Annuler</button>
            </div>
          </div>
        ) : (
          <div className={styles.actionBtns}>
            <button className={styles.btnPrimary} disabled={loading} onClick={() => call(`${base}/release-funds`)}>
              💰 Libérer les fonds au fournisseur
            </button>
            <button className={styles.btnDanger} disabled={loading} onClick={() => setDisputeReason("")}>
              ⚠️ Ouvrir un litige
            </button>
          </div>
        )}
        {error && <p className={styles.err}>{error}</p>}
      </div>
    );
  }

  // ── Étape 14 : évaluations ─────────────────────────────────────────────
  if (["funds_released", "completed"].includes(tx.status)) {
    const hasMyReview = (role === "client" && tx.clientReview?.rating) || (role === "partner" && tx.partnerReview?.rating);
    if (hasMyReview) return (
      <div className={styles.actionCard}>
        <h4>✅ Vous avez déjà laissé votre évaluation</h4>
        {role === "client" && <div className={styles.stars}>{"⭐".repeat(tx.clientReview.rating)}</div>}
        {role === "partner" && <div className={styles.stars}>{"⭐".repeat(tx.partnerReview.rating)}</div>}
      </div>
    );
    return (
      <div className={styles.actionCard}>
        <h4>⭐ Laissez votre évaluation</h4>
        <p>Votre note alimente le Trust Score de la plateforme.</p>
        <div className={styles.starPicker}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} className={`${styles.starBtn} ${(form.rating || 0) >= n ? styles.starActive : ""}`}
              onClick={() => setForm((f) => ({ ...f, rating: n }))}>⭐</button>
          ))}
        </div>
        <textarea rows={2} placeholder="Commentaire (optionnel)…" onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))} className={styles.reviewTextarea} />
        <button className={styles.btnPrimary} disabled={loading || !form.rating} onClick={() => call(`${base}/review`, "POST", form)}>
          Envoyer mon évaluation
        </button>
        {error && <p className={styles.err}>{error}</p>}
      </div>
    );
  }

  return null;
}

// ── Documents d'export ─────────────────────────────────────────────────────
function DocsPanel({ docs, txId, token, role, status, onRefresh }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const showDocs = ["payment_submitted", "in_escrow", "preparing", "shipped", "in_transit", "delivered", "funds_released", "completed"];
  if (!showDocs.includes(status)) return null;

  const updateDoc = async (docKey, newStatus) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/import-export/transactions/${txId}/documents`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ documents: { [docKey]: { status: newStatus, uploadedAt: new Date() } } }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      onRefresh();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  // ── Fichier réel du document (facture, connaissement, certificat...) ──────
  // Le champ `url` existait sur le schéma mais aucune UI ne le renseignait
  // jamais — seul un statut ("fourni") était déclaré, sans jamais joindre le
  // document lui-même. Manque réel trouvé en audit.
  const MAX_DOC_MB = 8;
  const uploadDocFile = (docKey, file) => {
    if (!file) return;
    if (!["image/", "application/pdf"].some((p) => file.type.startsWith(p))) {
      setError("Formats acceptés : image ou PDF."); return;
    }
    if (file.size > MAX_DOC_MB * 1024 * 1024) {
      setError(`Fichier trop volumineux (max ${MAX_DOC_MB} Mo).`); return;
    }
    setLoading(true); setError(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const res = await fetch(`/api/import-export/transactions/${txId}/documents`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ documents: { [docKey]: { url: e.target.result, status: "fourni", uploadedAt: new Date() } } }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
        onRefresh();
      } catch (err) { setError(err.message); }
      finally { setLoading(false); }
    };
    reader.onerror = () => { setError("Impossible de lire le fichier."); setLoading(false); };
    reader.readAsDataURL(file);
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}><span>📄</span><h3>Documents d'export</h3></div>
      <div className={styles.docsList}>
        {Object.entries(DOC_LABELS).map(([key, label]) => {
          const doc    = docs?.[key] || {};
          const cfg    = DOC_STATUS_CFG[doc.status || "en_attente"];
          return (
            <div key={key} className={styles.docItem}>
              <div className={styles.docLeft}>
                <span className={styles.docLabel}>{label}</span>
                {doc.uploadedAt && <span className={styles.docDate}>{fmtDate(doc.uploadedAt)}</span>}
                {doc.url && <a href={doc.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: ".78rem", color: "#6366f1" }}>📎 Voir le document</a>}
              </div>
              <div className={styles.docRight}>
                <span className={styles.docStatus} style={{ color: cfg.color, background: cfg.bg }}>{cfg.label}</span>
                {(role === "partner" || role === "admin") && doc.status !== "valide" && (
                  <label style={{ cursor: "pointer", fontSize: ".78rem", color: "#6366f1" }}>
                    📤 {doc.url ? "Remplacer" : "Joindre"}
                    <input type="file" accept="image/*,application/pdf" style={{ display: "none" }} disabled={loading}
                      onChange={(e) => uploadDocFile(key, e.target.files?.[0])} />
                  </label>
                )}
                {role === "partner" && doc.status !== "valide" && (
                  <select className={styles.docSelect} value={doc.status || "en_attente"} disabled={loading}
                    onChange={(e) => updateDoc(key, e.target.value)}>
                    <option value="en_attente">En attente</option>
                    <option value="fourni">Fourni</option>
                    <option value="non_requis">Non requis</option>
                  </select>
                )}
                {role === "admin" && (
                  <select className={styles.docSelect} value={doc.status || "en_attente"} disabled={loading}
                    onChange={(e) => updateDoc(key, e.target.value)}>
                    <option value="en_attente">En attente</option>
                    <option value="fourni">Fourni</option>
                    <option value="valide">✅ Valider (conformité vérifiée)</option>
                    <option value="non_requis">Non requis</option>
                  </select>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {error && <p className={styles.err}>{error}</p>}
    </div>
  );
}

// ── Suivi expédition ───────────────────────────────────────────────────────
function ShippingPanel({ shipping, txId, token, role, status, onRefresh }) {
  const [form, setForm]   = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const showShipping = ["shipped", "in_transit", "delivered", "funds_released", "completed"];
  if (!showShipping.includes(status) || !shipping?.shippedAt) return null;

  const update = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/import-export/transactions/${txId}/tracking`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      onRefresh(); setForm({});
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}><span>🚢</span><h3>Suivi d'expédition</h3></div>
      <div className={styles.shippingInfo}>
        {shipping.carrier       && <div className={styles.shippingRow}><span>Transporteur</span><strong>{shipping.carrier}</strong></div>}
        {shipping.trackingNumber && <div className={styles.shippingRow}><span>N° de suivi</span><strong className={styles.tracking}>{shipping.trackingNumber}</strong></div>}
        {shipping.shippingType   && <div className={styles.shippingRow}><span>Type</span><strong style={{ textTransform: "capitalize" }}>{shipping.shippingType}</strong></div>}
        {shipping.departureDate  && <div className={styles.shippingRow}><span>Date de départ</span><strong>{fmtDate(shipping.departureDate)}</strong></div>}
        {shipping.estimatedArrival && <div className={styles.shippingRow}><span>Arrivée estimée</span><strong>{fmtDate(shipping.estimatedArrival)}</strong></div>}
        {shipping.currentStatus  && (
          <div className={styles.currentStatus}>
            <span>📡 Statut actuel</span>
            <p>{shipping.currentStatus}</p>
          </div>
        )}
      </div>
      {role === "partner" && ["shipped", "in_transit"].includes(status) && (
        <div className={styles.trackingUpdate}>
          <input placeholder="Nouveau statut de livraison…" value={form.currentStatus || ""} onChange={(e) => setForm((f) => ({ ...f, currentStatus: e.target.value }))} />
          <button className={styles.btnSecondary} disabled={loading || !form.currentStatus} onClick={update}>
            Mettre à jour
          </button>
        </div>
      )}
      {error && <p className={styles.err}>{error}</p>}
    </div>
  );
}

// ── Historique ─────────────────────────────────────────────────────────────
function HistoryPanel({ history }) {
  const [open, setOpen] = useState(false);
  if (!history?.length) return null;
  return (
    <div className={styles.section}>
      <button className={styles.historyToggle} onClick={() => setOpen((o) => !o)}>
        🕐 Historique ({history.length}) {open ? "▲" : "▼"}
      </button>
      {open && (
        <div className={styles.historyList}>
          {[...history].reverse().map((h, i) => (
            <div key={i} className={styles.historyItem}>
              <span className={styles.historyDot} />
              <div>
                <p className={styles.historyStatus}>{h.status}</p>
                <p className={styles.historyDate}>{fmtDate(h.changedAt)}</p>
                {h.note && <p className={styles.historyNote}>{h.note}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE PRINCIPALE
// ═══════════════════════════════════════════════════════════════════════════
export default function IETransactionTracking() {
  const { id }        = useParams();
  const { user, token } = useAuth();
  const navigate      = useNavigate();
  const { selectChat, setOpen: setChatOpen } = useChat();

  const [tx,      setTx]      = useState(null);
  const [paymentProfile, setPaymentProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/import-export/transactions/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Transaction introuvable.");
      const d = await res.json();
      setTx(d.transaction);
      setPaymentProfile(d.paymentProfile || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    if (!token) { navigate("/login"); return; }
    load();
  }, [load, token, navigate]);

  if (loading) return (
    <div className={styles.page}>
      <div className={styles.centeredLoad}><div className={styles.spinner} /><p>Chargement de la transaction…</p></div>
    </div>
  );

  if (error || !tx) return (
    <div className={styles.page}>
      <div className={styles.centeredLoad}>
        <span className={styles.errIcon}>😕</span>
        <p>{error || "Transaction introuvable."}</p>
        <Link to="/import-export/dashboard" className={styles.btnPrimary}>← Mes transactions</Link>
      </div>
    </div>
  );

  const userId    = user?._id?.toString();
  const isClient  = tx.client?._id?.toString() === userId || tx.client?.toString() === userId;
  const isPartner = tx.partner?._id?.toString() === userId || tx.partner?.toString() === userId;
  const isAdmin   = user?.role === "admin";
  const role      = isClient ? "client" : isPartner ? "partner" : "admin";

  const currentStep = STEPS.find((s) => s.status === tx.status);

  return (
    <div className={styles.page}>
      {/* ── Breadcrumb ── */}
      <div className={styles.breadcrumb}>
        <Link to={role === "partner" ? "/importer-dashboard" : "/import-export/dashboard"}>
          {role === "partner" ? "Dashboard importateur" : "Mes transactions"}
        </Link>
        <span>/</span>
        <span>Transaction {tx._id?.slice(-8).toUpperCase()}</span>
      </div>

      {/* ── En-tête ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          {tx.listing?.mainPhoto && <img src={tx.listing.mainPhoto} alt="" className={styles.headerImg} />}
          <div>
            <h1 className={styles.headerTitle}>{tx.listing?.title || "Véhicule"}</h1>
            <p className={styles.headerMeta}>
              {tx.listing?.make} {tx.listing?.model} {tx.listing?.year} · 🌍 {tx.listing?.sourceCountry}
              {tx.destCountry && <> → {tx.destCountry}{tx.destCity ? `, ${tx.destCity}` : ""}</>}
            </p>
            <p className={styles.headerRef}>Réf. TXN-{tx._id?.slice(-8).toUpperCase()} · {fmtDate(tx.createdAt)}</p>
          </div>
        </div>
        <div className={styles.headerRight}>
          <span className={`${styles.statusChip} ${styles[`chip_${tx.status}`]}`}>
            {currentStep?.icon} {currentStep?.label || tx.status}
          </span>
          {tx.finalOffer?.totalAmount && (
            <p className={styles.headerPrice}>{fmtPrice(tx.finalOffer.totalAmount, tx.finalOffer.currency)}</p>
          )}
        </div>
      </div>

      {/* ── Barre de progression ── */}
      <div className={styles.card}><ProgressBar status={tx.status} /></div>

      <div className={styles.layout}>
        <div className={styles.main}>
          {/* Panneau d'action */}
          <ActionPanel tx={tx} role={role} token={token} onRefresh={load} paymentProfile={paymentProfile} />

          {/* Documents export */}
          <DocsPanel docs={tx.documents} txId={tx._id} token={token} role={role} status={tx.status} onRefresh={load} />

          {/* Suivi expédition */}
          <ShippingPanel shipping={tx.shipping} txId={tx._id} token={token} role={role} status={tx.status} onRefresh={load} />

          {/* Inspection indépendante */}
          {tx.independentInspection?.requested && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}><span>🔍</span><h3>Inspection indépendante VIT AUTO</h3></div>
              <div className={styles.inspStatus}>
                {tx.independentInspection.completedAt ? (
                  <>
                    <span className={styles.inspDone}>✅ Inspection terminée le {fmtDate(tx.independentInspection.completedAt)}</span>
                    {tx.independentInspection.reportNotes && (
                      <div className={styles.inspReport}>
                        <strong>Rapport :</strong>
                        <p>{tx.independentInspection.reportNotes}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <span className={styles.inspPending}>⏳ Demandée le {fmtDate(tx.independentInspection.requestedAt)} — En cours d'organisation par VIT AUTO</span>
                )}
              </div>
            </div>
          )}

          {/* Évaluations */}
          {(tx.clientReview?.rating || tx.partnerReview?.rating) && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}><span>⭐</span><h3>Évaluations</h3></div>
              {tx.clientReview?.rating && (
                <div className={styles.reviewCard}>
                  <span className={styles.reviewRole}>Client</span>
                  <div className={styles.stars}>{"⭐".repeat(tx.clientReview.rating)}</div>
                  {tx.clientReview.comment && <p>{tx.clientReview.comment}</p>}
                  <span className={styles.reviewDate}>{fmtDate(tx.clientReview.createdAt)}</span>
                </div>
              )}
              {tx.partnerReview?.rating && (
                <div className={styles.reviewCard}>
                  <span className={styles.reviewRole}>Fournisseur</span>
                  <div className={styles.stars}>{"⭐".repeat(tx.partnerReview.rating)}</div>
                  {tx.partnerReview.comment && <p>{tx.partnerReview.comment}</p>}
                  <span className={styles.reviewDate}>{fmtDate(tx.partnerReview.createdAt)}</span>
                </div>
              )}
            </div>
          )}

          {/* Litige */}
          {tx.dispute?.opened && (
            <div className={`${styles.section} ${styles.disputeSection}`}>
              <div className={styles.sectionHeader}><span>⚠️</span><h3>Litige en cours</h3></div>
              <p><strong>Motif :</strong> {tx.dispute.reason}</p>
              <p className={styles.disputeDate}>Ouvert le {fmtDate(tx.dispute.openedAt)}</p>
              {tx.dispute.resolution && (
                <div className={styles.resolution}>
                  <strong>Résolution VIT AUTO :</strong>
                  <p>{tx.dispute.resolution}</p>
                </div>
              )}
            </div>
          )}

          {/* Historique */}
          <HistoryPanel history={tx.statusHistory} />
        </div>

        {/* ── Sidebar ── */}
        <div className={styles.sidebar}>
          {/* Interlocuteur */}
          <div className={styles.sideCard}>
            <h4>Votre interlocuteur</h4>
            {(() => {
              const other = role === "client" ? tx.partner : tx.client;
              if (!other) return null;
              return (
                <div className={styles.contactCard}>
                  <div className={styles.contactAvatar}>
                    {other.profilePhoto ? <img src={other.profilePhoto} alt="" /> : <span>{other.firstName?.[0] || ""}{other.lastName?.[0] || ""}</span>}
                  </div>
                  <div>
                    <p className={styles.contactName}>{other.firstName} {other.lastName}</p>
                    {other.business?.name && <p className={styles.contactCo}>{other.business.name}</p>}
                    <p className={styles.contactRole}>{role === "client" ? "🏢 Importateur VIT AUTO" : "👤 Client"}</p>
                    {role === "partner" && (() => {
                      const kycCfg = KYC_CFG[other.kycStatus] || null;
                      return kycCfg ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 6, padding: "3px 10px", borderRadius: 999, fontSize: ".75rem", fontWeight: 700, color: kycCfg.color, background: kycCfg.bg }}>
                          {kycCfg.icon} {kycCfg.label}
                        </span>
                      ) : (
                        <span style={{ display: "inline-block", marginTop: 6, padding: "3px 10px", borderRadius: 999, fontSize: ".75rem", fontWeight: 700, color: "#64748b", background: "#f1f5f9" }}>
                          KYC non soumis
                        </span>
                      );
                    })()}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Devis estimatif (Import Cost Engine) — avant l'offre finale contractuelle */}
          {!tx.finalOffer?.totalAmount && tx.costEstimate?.available && (
            <div className={styles.sideCard}>
              <h4>🧮 Devis estimatif</h4>
              <div className={styles.finLines}>
                <div className={styles.finLine}><span>Véhicule</span><strong>{fmtPrice(tx.costEstimate.breakdown.vehiclePrice, tx.costEstimate.currency)}</strong></div>
                <div className={styles.finLine}><span>Transport intérieur</span><strong>{fmtPrice(tx.costEstimate.breakdown.inlandTransport, tx.costEstimate.currency)}</strong></div>
                <div className={styles.finLine}><span>Fret maritime</span><strong>{fmtPrice(tx.costEstimate.breakdown.seaFreight, tx.costEstimate.currency)}</strong></div>
                <div className={styles.finLine}><span>Assurance</span><strong>{fmtPrice(tx.costEstimate.breakdown.insurance, tx.costEstimate.currency)}</strong></div>
                <div className={styles.finLine}><span>Frais portuaires</span><strong>{fmtPrice(tx.costEstimate.breakdown.portFees, tx.costEstimate.currency)}</strong></div>
                <div className={styles.finLine}><span>Douanes / transit</span><strong>{fmtPrice(tx.costEstimate.breakdown.customs, tx.costEstimate.currency)}</strong></div>
                <div className={styles.finLine}><span>Livraison finale</span><strong>{fmtPrice(tx.costEstimate.breakdown.delivery, tx.costEstimate.currency)}</strong></div>
                <div className={styles.finLine}><span>Commission VIT AUTO</span><strong>{fmtPrice(tx.costEstimate.breakdown.commission, tx.costEstimate.currency)}</strong></div>
                <div className={`${styles.finLine} ${styles.finTotal}`}><span>TOTAL ESTIMÉ</span><strong>{fmtPrice(tx.costEstimate.grandTotal, tx.costEstimate.currency)}</strong></div>
              </div>
              <p className={styles.actionNote}>Estimation automatique — l'offre finale du fournisseur fera foi.</p>
            </div>
          )}

          {/* Récap financier */}
          {tx.finalOffer?.totalAmount && (
            <div className={styles.sideCard}>
              <h4>Récapitulatif financier</h4>
              <div className={styles.finLines}>
                <div className={styles.finLine}><span>Véhicule</span><strong>{fmtPrice(tx.finalOffer.vehiclePrice, tx.finalOffer.currency)}</strong></div>
                <div className={styles.finLine}><span>Export</span><strong>{fmtPrice(tx.finalOffer.exportFees, tx.finalOffer.currency)}</strong></div>
                <div className={styles.finLine}><span>Transport</span><strong>{fmtPrice(tx.finalOffer.shippingCost, tx.finalOffer.currency)}</strong></div>
                {tx.finalOffer.insurance > 0 && <div className={styles.finLine}><span>Assurance</span><strong>{fmtPrice(tx.finalOffer.insurance, tx.finalOffer.currency)}</strong></div>}
                <div className={`${styles.finLine} ${styles.finTotal}`}><span>TOTAL</span><strong>{fmtPrice(tx.finalOffer.totalAmount, tx.finalOffer.currency)}</strong></div>
              </div>
              {tx.payment?.escrowRef && (
                <p className={styles.escrowRef}>🔒 Escrow : {tx.payment.escrowRef}</p>
              )}
              {/* Reçu de paiement — jusqu'ici aucun reçu n'existait pour un paiement
                  Import/Export, contrairement aux bookings location/vente/essai. */}
              {role === "client" && tx.payment?.paidAt && (
                <button
                  type="button"
                  style={{ marginTop: 8, background: "none", border: "none", color: "#6366f1", cursor: "pointer", textDecoration: "underline", fontSize: ".85rem", padding: 0 }}
                  onClick={async () => {
                    const res = await fetch(`/api/import-export/transactions/${tx._id}/receipt`, { headers: { Authorization: `Bearer ${token}` } });
                    if (!res.ok) return;
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url; a.download = `recu-ie-${tx._id}.pdf`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  📥 Télécharger le reçu
                </button>
              )}
            </div>
          )}

          {/* Lien chat — le chat est déjà créé à la réservation (createTransactionChat,
              voir ieTransactionController.js), donc on l'ouvre directement par son ID
              plutôt que via getOrCreateChat (qui exige un bookingId réel — une
              IETransaction n'en a pas). */}
          {tx.chat && (
            <button
              type="button"
              className={styles.sideCard}
              style={{ width: "100%", textAlign: "left", cursor: "pointer", border: "none" }}
              onClick={() => {
                const other = role === "client" ? tx.partner : tx.client;
                selectChat({ _id: tx.chat, other, type: "client_partner" });
                setChatOpen(true);
              }}
            >
              <h4>💬 Messagerie sécurisée</h4>
              <p className={styles.chatNote}>Toutes vos communications sont enregistrées et sécurisées sur VIT AUTO. Cliquez pour ouvrir la conversation.</p>
            </button>
          )}

          {/* Lien vers l'annonce */}
          <Link to={`/import-export/listings/${tx.listing?._id}`} className={styles.listingLink}>
            👁️ Voir l'annonce complète
          </Link>
        </div>
      </div>
    </div>
  );
}
