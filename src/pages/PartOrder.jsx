import { useParams, useNavigate, Link } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { useVehicles } from "../context/VehicleContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useCurrency } from "../context/CurrencyContext";
import ReportButton from "../components/ReportButton/ReportButton";
import PriceTag from "../components/PriceTag/PriceTag";
import DeliveryMapPicker from "../components/DeliveryMapPicker/DeliveryMapPicker";
import {
  PART_CATEGORY_LABELS, PART_CATEGORY_ICONS, PART_CONDITION_LABELS, MAX_PART_QUANTITY,
} from "../constants/spareParts";
import styles from "./Booking.module.css";
import dbStyles from "./DriverBooking.module.css";

// Fiche d'une pièce détachée + commande (secteur « pièces », 2026-09-14).
// Une pièce est TOUJOURS livrée : le client renseigne son adresse, le devis de
// livraison vient du serveur (même calcul que la facturation — voir
// services/partShipping.js), et la commande part directement chez le vendeur.
const PartOrder = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getItemById } = useVehicles();
  const { user, token } = useAuth();
  const { success, error } = useToast();
  const { COUNTRIES_CONFIG, rateFromUSD } = useCurrency();

  const fromContext = getItemById(id);
  const [fetched, setFetched] = useState(null);
  useEffect(() => {
    if (fromContext || !id) return;
    // Annonce absente du contexte (accès direct avant le chargement du
    // catalogue, ou fiche filtrée par pays) : on la lit directement.
    fetch(`/api/parts/${id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.part) setFetched(d.part); })
      .catch(() => {});
  }, [id, fromContext, token]);
  const part = fromContext || fetched;

  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName,  setLastName]  = useState(user?.lastName  || "");
  const [email,     setEmail]     = useState(user?.email     || "");
  const [phone,     setPhone]     = useState(user?.phone     || "");
  const [quantity,  setQuantity]  = useState(1);
  const [address,   setAddress]   = useState(user?.address || "");
  const [ville,     setVille]     = useState(user?.defaultLocation?.city || "");
  const [country,   setCountry]   = useState(user?.country || "");
  const [editInfos, setEditInfos] = useState(!(user?.firstName && user?.phone));
  const [position,  setPosition]  = useState(null);
  const [showMap,   setShowMap]   = useState(false);
  const [instructions, setInstructions] = useState("");
  const [quote,     setQuote]     = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (part?.minOrderQty > 1) setQuantity(part.minOrderQty);
  }, [part?.minOrderQty]);
  // Pays de livraison : celui du client s'il est desservi, sinon celui de
  // l'annonce — un client ivoirien qui commande une pièce marocaine voyait
  // « Côte d'Ivoire » présélectionné et un refus à l'envoi.
  useEffect(() => {
    if (!part) return;
    const desservis = [part.country, ...(part.shipping?.countries || [])].filter(Boolean);
    setCountry((c) => (c && desservis.includes(c)) ? c : (desservis[0] || c || ""));
  }, [part]);

  const photo = useMemo(() => part?.thumbnail || part?.images?.[0] || null, [part]);
  const [activePhoto, setActivePhoto] = useState(null);

  // Devis de livraison — recalculé à chaque changement de quantité/position.
  useEffect(() => {
    if (!part?._id) return;
    const q = new URLSearchParams({ quantity: String(quantity || 1) });
    if (position?.lat != null) { q.set("lat", position.lat); q.set("lng", position.lng); }
    const ctrl = new AbortController();
    fetch(`/api/parts/${part._id}/shipping-quote?${q}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setQuote(d); })
      .catch(() => {});
    return () => ctrl.abort();
  }, [part?._id, quantity, position]);

  if (!part) {
    return (
      <div className={styles.content} style={{ maxWidth: 560, margin: "40px auto" }}>
        <h1 className={dbStyles.driverName}>Pièce introuvable</h1>
        <p className={dbStyles.driverSubtitle}>Cette pièce n'est plus disponible ou n'existe pas.</p>
        <Link to="/catalogue?mode=Pieces" className={dbStyles.notFoundLink}>← Retour aux pièces détachées</Link>
      </div>
    );
  }

  const isImport = part.saleMode === "import";
  const qty = Math.max(1, Math.floor(Number(quantity) || 1));
  const stockInsuffisant = part.stock != null && qty > part.stock;
  const needsPosition = part.shipping?.mode === "distance" && !position;
  // Montants dans la devise saisie par le vendeur (380 DH), pas la
  // conversion USD arrondie (376,86 DH) : les frais, stockés en USD, sont
  // convertis au même taux.
  const entryCur = part.priceEntryCurrency || part.currency || null;
  const entered = (usd) => (entryCur && entryCur !== "USD" && part.priceEntered != null ? Math.round(usd * rateFromUSD(entryCur) * 100) / 100 : null);
  const sousTotalEntered = part.priceEntered != null ? part.priceEntered * qty : null;
  const feesUSD = (quote?.importFeesUSD ?? (isImport ? part.importInfo?.feesUSD || 0 : 0)) + (quote?.shipping?.feeUSD ?? 0);
  const totalEntered = sousTotalEntered != null && quote?.totalUSD != null ? Math.round((sousTotalEntered + (entered(feesUSD) ?? feesUSD)) * 100) / 100 : null;
  const compat = (part.compatibility || []).map((c) =>
    `${c.marque}${c.modele ? ` ${c.modele}` : ""}${c.anneeDebut || c.anneeFin ? ` (${c.anneeDebut || "…"}–${c.anneeFin || "…"})` : ""}`);

  const handleMapConfirm = ({ lat, lng, address: addr, city }) => {
    setPosition({ lat, lng });
    if (addr) setAddress(addr);
    if (city) setVille(city);
    setShowMap(false);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    // POST /api/bookings exige un compte (routes/bookings.js) : sans ce
    // renvoi, un visiteur non connecté recevait « Token manquant » en toast
    // (Booking.jsx avait déjà ce garde, pas les autres tunnels).
    if (!token) {
      navigate("/login", { state: { from: { pathname: window.location.pathname + window.location.search } } });
      return;
    }
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim()) { error("Veuillez remplir toutes vos informations."); return; }
    if (!address.trim() || !ville.trim() || !country) { error("Adresse de livraison complète requise (adresse, ville, pays)."); return; }
    if (qty < (part.minOrderQty || 1) || qty > MAX_PART_QUANTITY) { error(`Quantité invalide (minimum ${part.minOrderQty || 1}, maximum ${MAX_PART_QUANTITY}).`); return; }
    if (stockInsuffisant) { error(`Stock insuffisant : ${part.stock} disponible(s).`); return; }
    if (needsPosition) { error("Placez votre adresse sur la carte pour calculer la livraison."); return; }

    setSubmitting(true);
    try {
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch("/api/bookings", {
        method: "POST", headers,
        body: JSON.stringify({
          type: "piece",
          partId: part._id,
          clientInfo: { firstName, lastName, email, phone },
          piece: {
            quantity: qty,
            delivery: { address: address.trim(), ville: ville.trim(), country, lat: position?.lat ?? null, lng: position?.lng ?? null, instructions: instructions.trim() || undefined },
          },
          payment: { method: "cash" },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur lors de la commande.");
      success("Commande transmise au vendeur !");
      navigate("/booking/success", { state: { booking: data.booking, payment: { paymentMethod: "cash" } } });
    } catch (err) {
      error(err.message || "Erreur lors de la commande.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.content} style={{ maxWidth: 720, margin: "32px auto" }}>
      <Link to="/catalogue?mode=Pieces" className={dbStyles.backLink}>← Toutes les pièces détachées</Link>

      <div className={dbStyles.driverSummary} style={{ flexWrap: "wrap" }}>
        {photo
          ? <img src={activePhoto || photo} alt={part.title} className={dbStyles.driverAvatar} style={{ borderRadius: 12, width: 96, height: 96, objectFit: "cover" }} />
          : <div className={dbStyles.driverAvatarFallback}>{PART_CATEGORY_ICONS[part.category] || "📦"}</div>}
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <strong className={dbStyles.driverName}>{part.title}</strong>
          <p className={dbStyles.driverSubtitle}>
            {PART_CATEGORY_ICONS[part.category] || "📦"} {PART_CATEGORY_LABELS[part.category] || part.category}
            {part.brand && <> · {part.brand}</>}
            {part.reference && <> · réf. {part.reference}</>}
          </p>
          <p className={dbStyles.driverMeta}>
            {PART_CONDITION_LABELS[part.condition] || part.condition} · {isImport ? "🌍 Vente importation" : "📦 En stock — vente directe"}
            {part.ville && <> · 📍 {part.ville}</>}
            {part.noteMoyenne > 0 && <> · ⭐ {part.noteMoyenne.toFixed(1)} ({part.nombreAvis || 0})</>}
          </p>
        </div>
        <div className={dbStyles.reportWrap}>
          <ReportButton targetType="part" targetId={part._id} compact />
        </div>
      </div>

      {part.images?.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 16px" }}>
          {part.images.map((img) => (
            <button key={img} type="button" onClick={() => setActivePhoto(img)}
              style={{ padding: 0, border: `2px solid ${(activePhoto || photo) === img ? "#ff4d2d" : "#e2e8f0"}`, borderRadius: 8, background: "none", cursor: "pointer" }}>
              <img src={img} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 6, display: "block" }} loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {part.description && <p className={dbStyles.description} style={{ whiteSpace: "pre-line" }}>{part.description}</p>}

      {(compat.length > 0 || part.compatibilityText) && (
        <div className={dbStyles.fieldBlock}>
          <span className={dbStyles.fieldLabel}>🚗 Véhicules compatibles</span>
          <p className={dbStyles.hoursHint} style={{ margin: 0 }}>{[...compat, part.compatibilityText].filter(Boolean).join(" · ")}</p>
        </div>
      )}

      <div className={dbStyles.fieldBlock} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 14px" }}>
        <span className={dbStyles.fieldLabel}>🚚 Livraison</span>
        <p className={dbStyles.hoursHint} style={{ margin: 0 }}>
          {part.shipping?.mode === "gratuit" ? "Livraison offerte"
            : part.shipping?.mode === "forfait" ? <>Forfait de livraison : <PriceTag amountUSD={part.shipping.forfaitUSD || 0} pinnedCurrency={part.currency} compact />{part.shipping?.freeAboveUSD != null && <> — offerte à partir de <PriceTag amountUSD={part.shipping.freeAboveUSD} pinnedCurrency={part.currency} compact /></>}</>
            : "Frais calculés selon la distance (barème du pays)"}
          {" · "}délai {part.shipping?.deliveryDaysMin ?? 1}–{part.shipping?.deliveryDaysMax ?? 5} jours
          {isImport && <> après réception de la pièce importée (≈ {part.importInfo?.leadTimeDays || "—"} jours depuis {COUNTRIES_CONFIG.find((c) => c.code === part.importInfo?.originCountry)?.name || part.importInfo?.originCountry || "l'étranger"})</>}
        </p>
        {isImport && (
          <p className={dbStyles.hoursHint}>
            Frais d'importation par commande : <PriceTag amountUSD={part.importInfo?.feesUSD || 0} pinnedCurrency={part.currency} compact />
            {part.importInfo?.customsIncluded ? " (droits de douane inclus)" : " (hors droits de douane)"}
            {part.importInfo?.depositPercent > 0 && <> · acompte de {part.importInfo.depositPercent} % à la confirmation</>}
          </p>
        )}
      </div>

      <h2 className={dbStyles.sectionTitle}>Vos coordonnées</h2>
      {editInfos ? (
        <div className={dbStyles.formGrid2}>
          <input className={styles.input} placeholder="Prénom *" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
          <input className={styles.input} placeholder="Nom *" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
          <input className={styles.input} type="email" placeholder="E-mail *" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <input className={styles.input} type="tel" placeholder="Téléphone *" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
        </div>
      ) : (
        // Client connecté : ses coordonnées sont connues, une ligne suffit.
        <div className={dbStyles.fieldBlock} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "10px 14px" }}>
          <span style={{ fontSize: ".9rem", color: "#0f1b3f" }}><strong>{firstName} {lastName}</strong> · {phone}{email ? ` · ${email}` : ""}</span>
          <button type="button" onClick={() => setEditInfos(true)} style={{ background: "none", border: "none", color: "#2563eb", fontWeight: 700, cursor: "pointer", fontSize: ".85rem" }}>Modifier</button>
        </div>
      )}

      <h2 className={dbStyles.sectionTitle}>Quantité</h2>
      <div className={dbStyles.fieldBlock}>
        <input type="number" min={part.minOrderQty || 1} max={part.stock != null ? Math.min(part.stock, MAX_PART_QUANTITY) : MAX_PART_QUANTITY}
          value={quantity} onChange={(e) => setQuantity(e.target.value)} className={dbStyles.textInput} style={{ maxWidth: 140 }} />
        <p className={dbStyles.hoursHint}>
          <PriceTag amountUSD={part.price} pinnedCurrency={part.currency} enteredAmount={part.priceEntered} enteredCurrency={part.priceEntryCurrency} compact /> l'unité
          {part.stock != null && <> · {part.stock} en stock</>}
          {part.minOrderQty > 1 && <> · minimum {part.minOrderQty}</>}
        </p>
        {stockInsuffisant && <div className={dbStyles.conflictWarning}>⛔ Stock insuffisant pour cette quantité.</div>}
      </div>

      <h2 className={dbStyles.sectionTitle}>Adresse de livraison</h2>
      <div className={dbStyles.formGrid2}>
        <input className={`${styles.input} ${dbStyles.fieldFull}`} placeholder="Adresse (rue, numéro, repère) *" value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" />
        <input className={styles.input} placeholder="Ville *" value={ville} onChange={(e) => setVille(e.target.value)} autoComplete="address-level2" />
        <select className={styles.input} value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">Pays *</option>
          {COUNTRIES_CONFIG.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
        </select>
        <input className={`${styles.input} ${dbStyles.fieldFull}`} placeholder="Instructions pour le livreur (optionnel)" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
      </div>
      {/* La carte n'est utile que si le vendeur facture au kilomètre : ailleurs
          elle encombrait le formulaire sans rien apporter. */}
      {part.shipping?.mode === "distance" && (
      <div className={dbStyles.fieldBlock}>
        <button type="button" onClick={() => setShowMap(true)}
          style={{ background: "#fff", color: "#0f1b3f", border: "1.5px solid #d1d9e8", padding: "10px 16px", borderRadius: 10, cursor: "pointer", fontWeight: 700 }}>
          🗺️ {position ? "Modifier la position sur la carte" : "Placer mon adresse sur la carte"}
        </button>
        {position && <p className={dbStyles.hoursHint}>Position enregistrée ({position.lat.toFixed(4)}, {position.lng.toFixed(4)}).</p>}
        {needsPosition && <p className={dbStyles.hoursHint} style={{ color: "#b45309" }}>Ce vendeur facture la livraison selon la distance : placez votre adresse sur la carte pour connaître le montant.</p>}
        {showMap && (
          <DeliveryMapPicker initialPosition={position} fallbackCenter={part.coordonnees?.lat != null ? part.coordonnees : undefined}
            onConfirm={handleMapConfirm} onClose={() => setShowMap(false)} />
        )}
      </div>
      )}

      <h2 className={dbStyles.sectionTitle}>Paiement</h2>
      <p style={{ margin: "0 0 18px", fontSize: ".86rem", color: "#475569", lineHeight: 1.55 }}>
        💵 <strong>Espèces au livreur, à la réception.</strong>{isImport && part.importInfo?.depositPercent > 0 && <> Acompte de {part.importInfo.depositPercent} % réglé au vendeur à la confirmation.</>} Le vendeur reçoit votre commande immédiatement et vous tient informé(e) de l'expédition.
      </p>

      <div className={dbStyles.totalBar} style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span className={dbStyles.totalLabel}>Pièce × {qty}</span><span><PriceTag amountUSD={part.price * qty} pinnedCurrency={part.currency} enteredAmount={sousTotalEntered} enteredCurrency={part.priceEntryCurrency} compact /></span></div>
        {isImport && <div style={{ display: "flex", justifyContent: "space-between" }}><span className={dbStyles.totalLabel}>Frais d'importation</span><span><PriceTag amountUSD={quote?.importFeesUSD ?? part.importInfo?.feesUSD ?? 0} pinnedCurrency={part.currency} compact /></span></div>}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span className={dbStyles.totalLabel}>Livraison</span>
          <span>{quote?.shipping?.feeUSD == null ? (quote?.shipping?.detail || "—") : <PriceTag amountUSD={quote.shipping.feeUSD} pinnedCurrency={part.currency} compact />}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #e2e8f0", paddingTop: 6 }}>
          <span className={dbStyles.totalLabel}>Total estimé</span>
          <strong className={dbStyles.totalValue}>{quote?.totalUSD == null ? "—" : <PriceTag amountUSD={quote.totalUSD} pinnedCurrency={part.currency} enteredAmount={totalEntered} enteredCurrency={part.priceEntryCurrency} />}</strong>
        </div>
        {quote?.depositUSD > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".86rem", color: "#475569" }}>
            <span>dont acompte à la confirmation</span><span><PriceTag amountUSD={quote.depositUSD} pinnedCurrency={part.currency} compact /></span>
          </div>
        )}
      </div>

      <button onClick={handleSubmit} disabled={submitting || stockInsuffisant || needsPosition} className={dbStyles.submitBtn}>
        {submitting ? "Envoi en cours…" : "Commander cette pièce"}
      </button>
    </div>
  );
};

export default PartOrder;
