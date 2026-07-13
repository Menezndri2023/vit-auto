import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useChat } from "../context/ChatContext";
import styles from "./IETransactionTracking.module.css";

const fmtPrice = (p, c = "EUR") =>
  p != null ? `${Number(p).toLocaleString("fr-FR")} ${c}` : "—";
const fmtDate = (d) =>
  d ? new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

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
        {STEPS.filter((s) => !["inspection_requested", "offer_accepted", "payment_pending"].includes(s.status)).map((s, i, arr) => {
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
function ActionPanel({ tx, role, token, onRefresh }) {
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);
  const [form, setForm]                 = useState({});
  const [cancelReason, setCancelReason] = useState(null);  // null = form masqué
  const [disputeReason, setDisputeReason] = useState(null);

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
    return (
      <div className={styles.actionCard}>
        <h4>Envoyer l'offre finale</h4>
        <p>Composez l'offre finale avec tous les frais détaillés.</p>
        <div className={styles.offerForm}>
          <div className={styles.formRow2}>
            <label><span>Prix véhicule * (EUR)</span><input type="number" placeholder="25000" onChange={(e) => setForm((f) => ({ ...f, vehiclePrice: e.target.value }))} /></label>
            <label><span>Frais d'export</span><input type="number" placeholder="500" onChange={(e) => setForm((f) => ({ ...f, exportFees: e.target.value }))} /></label>
          </div>
          <div className={styles.formRow2}>
            <label><span>Frais de transport</span><input type="number" placeholder="1200" onChange={(e) => setForm((f) => ({ ...f, shippingCost: e.target.value }))} /></label>
            <label><span>Assurance (optionnel)</span><input type="number" placeholder="300" onChange={(e) => setForm((f) => ({ ...f, insurance: e.target.value }))} /></label>
          </div>
          <label><span>Délai estimé</span><input placeholder="Ex : 45-60 jours" onChange={(e) => setForm((f) => ({ ...f, estimatedDelay: e.target.value }))} /></label>
          <label><span>Notes</span><textarea rows={2} placeholder="Conditions particulières…" onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></label>
          {form.vehiclePrice && (
            <div className={styles.offerTotal}>
              <span>Total estimé :</span>
              <strong>{fmtPrice(
                (Number(form.vehiclePrice) || 0) + (Number(form.exportFees) || 0) + (Number(form.shippingCost) || 0) + (Number(form.insurance) || 0), "EUR"
              )}</strong>
            </div>
          )}
          <button className={styles.btnPrimary} disabled={loading || !form.vehiclePrice}
            onClick={() => call(`${base}/final-offer`, "POST", { ...form, currency: "EUR" })}>
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
  if (tx.status === "payment_pending" && role === "client") {
    return (
      <div className={styles.actionCard}>
        <h4>Procédez au paiement sécurisé</h4>
        <p>Votre paiement sera placé sur un compte d'entiercement (Escrow). Les fonds ne seront versés au fournisseur qu'après confirmation de livraison.</p>
        <div className={styles.escrowInfo}>
          <div>💰 <strong>{fmtPrice(tx.finalOffer?.totalAmount, tx.finalOffer?.currency)}</strong></div>
          <p>Référence de paiement à mentionner : <code>TXN-{tx._id?.slice(-8).toUpperCase()}</code></p>
        </div>
        <div className={styles.formRow2}>
          <label><span>Moyen de paiement</span>
            <select onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))} defaultValue="">
              <option value="">Choisir…</option>
              <option value="virement">Virement bancaire</option>
              <option value="carte">Carte bancaire</option>
              <option value="mobile_money">Mobile Money</option>
              <option value="crypto">Cryptomonnaie</option>
            </select>
          </label>
          <label><span>Référence transaction</span><input placeholder="Réf de votre paiement" onChange={(e) => setForm((f) => ({ ...f, transactionRef: e.target.value }))} /></label>
        </div>
        <button className={styles.btnPrimary} disabled={loading || !form.method}
          onClick={() => call(`${base}/pay`, "POST", form)}>
          🔒 Confirmer le paiement en entiercement
        </button>
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

  const showDocs = ["in_escrow", "preparing", "shipped", "in_transit", "delivered", "funds_released", "completed"];
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
              </div>
              <div className={styles.docRight}>
                <span className={styles.docStatus} style={{ color: cfg.color, background: cfg.bg }}>{cfg.label}</span>
                {role === "partner" && doc.status !== "valide" && (
                  <select className={styles.docSelect} value={doc.status || "en_attente"} disabled={loading}
                    onChange={(e) => updateDoc(key, e.target.value)}>
                    <option value="en_attente">En attente</option>
                    <option value="fourni">Fourni</option>
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
          <ActionPanel tx={tx} role={role} token={token} onRefresh={load} />

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
                  </div>
                </div>
              );
            })()}
          </div>

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
