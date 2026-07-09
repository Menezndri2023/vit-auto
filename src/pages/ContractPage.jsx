import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import styles from "./ContractPage.module.css";

const fmt = (n) => n != null && n !== 0 ? Number(n).toLocaleString("fr-FR") + " XOF" : null;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : "—";

const TYPE_LABELS = { location: "Location de véhicule", essai: "Essai / Vente", chauffeur: "Service chauffeur", leasing: "Leasing / Achat en mensualités" };

export default function ContractPage() {
  const { bookingId } = useParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();

  const [contract, setContract] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [signing, setSigning]   = useState(false);
  const [signed, setSigned]     = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const canvasRef   = useRef(null);
  const isDrawing   = useRef(false);
  const lastPos     = useRef({ x: 0, y: 0 });

  // ── Chargement du contrat (authentification requise) ───────────────────
  useEffect(() => {
    if (!bookingId) return;
    if (!token) {
      navigate("/login", { state: { from: { pathname: `/contract/${bookingId}` }, reason: "auth" }, replace: true });
      return;
    }
    fetch(`/api/contracts/${bookingId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) {
          return { deniedMessage: "Vous n'êtes pas autorisé à consulter ce contrat." };
        }
        return r.json();
      })
      .then((d) => {
        if (d.contract) { setContract(d.contract); if (d.contract.isSigned) setSigned(true); }
        else setError(d.deniedMessage || "Contrat introuvable. Il sera disponible après acceptation par le partenaire.");
      })
      .catch(() => setError("Impossible de charger le contrat."))
      .finally(() => setLoading(false));
  }, [bookingId, token]);

  // ── Canvas signature ───────────────────────────────────────────────────
  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const src  = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  };

  const startDraw = useCallback((e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    isDrawing.current = true;
    lastPos.current = getPos(e, canvas);
  }, []);

  const draw = useCallback((e) => {
    e.preventDefault();
    if (!isDrawing.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    lastPos.current = pos;
    setHasDrawn(true);
  }, []);

  const stopDraw = useCallback(() => { isDrawing.current = false; }, []);

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  // ── Soumettre la signature ─────────────────────────────────────────────
  const handleSign = async () => {
    if (!hasDrawn) return;
    const canvas = canvasRef.current;
    const signature = canvas.toDataURL("image/png");
    setSigning(true);
    try {
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`/api/contracts/${contract._id}/sign`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          signature,
          clientEmail: user?.email || contract?.client?.email || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setContract(data.contract);
        setSigned(true);
      } else {
        alert(data.message || "Erreur lors de la signature.");
      }
    } catch {
      alert("Erreur réseau. Veuillez réessayer.");
    } finally {
      setSigning(false);
    }
  };

  // ── Impression ─────────────────────────────────────────────────────────
  const handlePrint = () => window.print();

  if (loading) return (
    <div className={styles.page}>
      <div className={styles.loadingBox}>
        <div className={styles.spinner} />
        <p>Chargement du contrat...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className={styles.page}>
      <div className={styles.errorBox}>
        <span>📄</span>
        <p>{error}</p>
        <button className={styles.btnBack} onClick={() => navigate("/dashboard")}>
          ← Mon tableau de bord
        </button>
      </div>
    </div>
  );

  const t = contract?.terms || {};
  const isLeasing = contract?.type === "leasing";

  return (
    <div className={styles.page}>
      <div className={styles.contractWrapper} id="contract-print">

        {/* ── En-tête ── */}
        <div className={styles.contractHeader}>
          <div className={styles.contractLogo}>
            <span className={styles.contractLogoIcon}>🚗</span>
            <div>
              <h1 className={styles.contractBrand}>VIT AUTO</h1>
              <p className={styles.contractSubBrand}>Plateforme de location & vente de véhicules</p>
            </div>
          </div>
          <div className={styles.contractMeta}>
            <div className={styles.contractNumber}>N° {contract.contractNumber}</div>
            <div className={styles.contractType}>{TYPE_LABELS[contract.type] || contract.type}</div>
            <div className={styles.contractDate}>Émis le {fmtDate(contract.createdAt)}</div>
            {contract.isSigned && (
              <div className={styles.contractSigned}>✅ Signé le {fmtDate(contract.signedAt)}</div>
            )}
          </div>
        </div>

        {/* ── Parties ── */}
        <div className={styles.partiesGrid}>
          <div className={styles.partyBlock}>
            <h3 className={styles.partyTitle}>👤 Client (Locataire / Acheteur)</h3>
            <div className={styles.partyInfo}>
              <span>{contract.client?.firstName} {contract.client?.lastName}</span>
              {contract.client?.email && <span>✉ {contract.client.email}</span>}
              {contract.client?.phone && <span>📞 {contract.client.phone}</span>}
              {contract.client?.idType && (
                <span className={styles.idChip}>
                  {contract.client.idType.toUpperCase()} : {contract.client.idNumber}
                </span>
              )}
            </div>
          </div>
          <div className={styles.partyBlock}>
            <h3 className={styles.partyTitle}>🏢 Partenaire (Loueur / Vendeur)</h3>
            <div className={styles.partyInfo}>
              <span>{contract.vendor?.name}</span>
              {contract.vendor?.email && <span>✉ {contract.vendor.email}</span>}
              {contract.vendor?.phone && <span>📞 {contract.vendor.phone}</span>}
            </div>
          </div>
        </div>

        {/* ── Véhicule ── */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>🚗 Véhicule concerné</h3>
          <div className={styles.vehicleGrid}>
            {contract.vehicle?.name  && <div className={styles.vehicleField}><span>Désignation</span><strong>{contract.vehicle.name}</strong></div>}
            {contract.vehicle?.brand && <div className={styles.vehicleField}><span>Marque</span><strong>{contract.vehicle.brand}</strong></div>}
            {contract.vehicle?.year  && <div className={styles.vehicleField}><span>Année</span><strong>{contract.vehicle.year}</strong></div>}
            {contract.vehicle?.color && <div className={styles.vehicleField}><span>Couleur</span><strong>{contract.vehicle.color}</strong></div>}
            {contract.vehicle?.mileage && <div className={styles.vehicleField}><span>Kilométrage</span><strong>{Number(contract.vehicle.mileage).toLocaleString("fr-FR")} km</strong></div>}
          </div>
        </section>

        {/* ── Conditions financières ── */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>💰 Conditions financières</h3>
          {!isLeasing ? (
            <div className={styles.finGrid}>
              {t.startDate && <div className={styles.finRow}><span>Date de début</span><strong>{fmtDate(t.startDate)}</strong></div>}
              {t.endDate   && <div className={styles.finRow}><span>Date de fin</span><strong>{fmtDate(t.endDate)}</strong></div>}
              {t.days      && <div className={styles.finRow}><span>Durée</span><strong>{t.days} jour{t.days > 1 ? "s" : ""}</strong></div>}
              {t.pickupLocation  && <div className={styles.finRow}><span>Lieu de retrait</span><strong>{t.pickupLocation}</strong></div>}
              {t.returnLocation  && <div className={styles.finRow}><span>Lieu de retour</span><strong>{t.returnLocation}</strong></div>}
              {fmt(t.dailyRateXOF) && <div className={styles.finRow}><span>Tarif journalier</span><strong>{fmt(t.dailyRateXOF)}</strong></div>}
              {fmt(t.optionsXOF)   && <div className={styles.finRow}><span>Options</span><strong>{fmt(t.optionsXOF)}</strong></div>}
              {fmt(t.cautionXOF)   && <div className={styles.finRow}><span>Caution</span><strong>{fmt(t.cautionXOF)}</strong></div>}
              {fmt(t.serviceFeeXOF) && <div className={styles.finRow}><span>Frais de service VIT AUTO</span><strong>{fmt(t.serviceFeeXOF)}</strong></div>}
              {fmt(t.totalXOF)     && <div className={`${styles.finRow} ${styles.finTotal}`}><span>TOTAL</span><strong>{fmt(t.totalXOF)}</strong></div>}
            </div>
          ) : (
            <div className={styles.finGrid}>
              {fmt(t.apportInitial)  && <div className={styles.finRow}><span>Apport initial</span><strong>{fmt(t.apportInitial)}</strong></div>}
              {fmt(t.mensualite)     && <div className={styles.finRow}><span>Mensualité</span><strong>{fmt(t.mensualite)} / mois</strong></div>}
              {t.dureeLeasing        && <div className={styles.finRow}><span>Durée</span><strong>{t.dureeLeasing} mois</strong></div>}
              {t.tauxInteret         && <div className={styles.finRow}><span>Taux d'intérêt</span><strong>{t.tauxInteret} % / an</strong></div>}
              {fmt(t.serviceFeeXOF)  && <div className={styles.finRow}><span>Frais de service VIT AUTO</span><strong>{fmt(t.serviceFeeXOF)}</strong></div>}
              {fmt(t.totalLeasing)   && <div className={`${styles.finRow} ${styles.finTotal}`}><span>TOTAL LEASING</span><strong>{fmt(t.totalLeasing)}</strong></div>}
            </div>
          )}
        </section>

        {/* ── Conditions générales ── */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>📜 Conditions générales</h3>
          <div className={styles.conditionsBox}>
            {(contract.conditions || "").split("\n").filter(Boolean).map((line, i) => (
              <p key={i} className={styles.conditionLine}>{line}</p>
            ))}
          </div>
        </section>

        {/* ── Zone de signature ── */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>✍️ Signature électronique</h3>

          {signed ? (
            <div className={styles.signedBlock}>
              <div className={styles.signedIcon}>✅</div>
              <p className={styles.signedText}>Contrat signé électroniquement le {fmtDate(contract.signedAt)}</p>
              {contract.clientSignature && (
                <img src={contract.clientSignature} alt="Signature" className={styles.signatureImg} />
              )}
              <p className={styles.signatureLegal}>
                Signature numérique validée — Ce document a valeur contractuelle conformément aux lois en vigueur.
              </p>
            </div>
          ) : (
            <div className={styles.signatureBlock}>
              <p className={styles.signatureInfo}>
                En signant ci-dessous, vous confirmez avoir lu et accepté toutes les conditions du présent contrat.
              </p>
              <div className={styles.canvasWrapper}>
                <canvas
                  ref={canvasRef}
                  width={600}
                  height={150}
                  className={styles.signatureCanvas}
                  onMouseDown={startDraw}
                  onMouseMove={draw}
                  onMouseUp={stopDraw}
                  onMouseLeave={stopDraw}
                  onTouchStart={startDraw}
                  onTouchMove={draw}
                  onTouchEnd={stopDraw}
                />
                <span className={styles.canvasHint}>Signez ici en utilisant votre souris ou votre doigt</span>
              </div>
              <div className={styles.signatureActions}>
                <button className={styles.btnClear} onClick={clearSignature} disabled={!hasDrawn}>
                  ↺ Effacer
                </button>
                <button
                  className={styles.btnSign}
                  onClick={handleSign}
                  disabled={!hasDrawn || signing}
                >
                  {signing ? "Signature en cours..." : "✍️ Signer le contrat"}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ── Pied de page légal ── */}
        <div className={styles.contractFooter}>
          <p>VIT AUTO — Plateforme agréée de location et vente de véhicules — Abidjan, Côte d'Ivoire</p>
          <p>Contrat N° {contract.contractNumber} · Généré le {fmtDate(contract.createdAt)}</p>
        </div>
      </div>

      {/* ── Actions hors impression ── */}
      <div className={styles.pageActions}>
        <button className={styles.btnBack} onClick={() => navigate(-1)}>← Retour</button>
        <button className={styles.btnPrint} onClick={handlePrint}>🖨️ Imprimer / PDF</button>
      </div>
    </div>
  );
}
