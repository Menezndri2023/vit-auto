// Extrait d'AdminPanel.jsx (découpe par onglet, 2026-09-12) — logique inchangée.
import { useEffect, useState } from "react";
import styles from "../../AdminPanel.module.css";

// ── Assignation logistique (restructuration Import/Export, 2026-09) ────────
// Dès que les fonds d'une transaction sont sécurisés (in_escrow), le serveur
// propose déjà automatiquement un transitaire actif pour le pays de
// destination (voir ieTransactionController.onEscrowSecured) — cette section
// rend cette assignation visible et réassignable par un admin, ou permet de
// garder le dossier en interne (agent VIT AUTO) plutôt qu'un transitaire
// externe.
// ── Documents client d'une réservation (2026-09) ──────────────────────────
// Les images (pièce d'identité, permis, selfie) sont en `select: false` sur
// Booking.clientKycSnapshot : elles ne remontent que via getBookingDetail, qui
// les inclut explicitement pour l'admin et pour le partenaire propriétaire
// (voir bookingController.getBookingDetail). La liste des réservations, elle,
// ne les contient jamais — d'où le chargement à la demande ci-dessous.
export function ClientDocuments({ docs, reference }) {
  const items = [
    { key: "id-recto",     url: docs?.frontImage,        label: "Identité — recto" },
    { key: "id-verso",     url: docs?.backImage,         label: "Identité — verso" },
    { key: "permis-recto", url: docs?.licenseFrontImage, label: "Permis — recto" },
    { key: "permis-verso", url: docs?.licenseBackImage,  label: "Permis — verso" },
    { key: "selfie",       url: docs?.selfie,            label: "Selfie KYC" },
  ].filter((i) => i.url);

  if (!items.length) {
    return <p style={{ fontSize: ".85rem", color: "#94a3b8", margin: 0 }}>Aucun document joint à cette réservation.</p>;
  }

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {items.map((i) => (
        <div key={i.key} style={{ textAlign: "center" }}>
          <a href={i.url} target="_blank" rel="noopener noreferrer">
            <img src={i.url} alt={i.label} style={{ maxHeight: 110, borderRadius: 8, border: "1px solid #e2e8f0" }} />
          </a>
          <div style={{ fontSize: ".7rem", color: "#64748b", marginTop: 3 }}>{i.label}</div>
          <a href={i.url} download={`${i.key}-${reference || "reservation"}.jpg`} style={{ fontSize: ".7rem", color: "#2563eb" }}>💾 Télécharger</a>
        </div>
      ))}
    </div>
  );
}

export function ClientDocumentsModal({ booking, token, onClose }) {
  const [docs, setDocs]       = useState(null);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState(null);

  useEffect(() => {
    // L'échec était avalé : un refus de permission ou une erreur réseau
    // s'affichait exactement comme « aucun document fourni ».
    fetch(`/api/bookings/${booking._id}/detail`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (!r.ok) {
          setError(d?.message || `Documents non chargés (erreur ${r.status}).`);
          return;
        }
        setDocs(d?.booking?.clientKycSnapshot || null);
      })
      .catch(() => setError("Connexion au serveur impossible — documents non chargés."))
      .finally(() => setLoading(false));
  }, [booking._id, token]);

  const ci = booking.clientInfo || {};
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.confirmBox} style={{ maxWidth: 660, width: "95%" }} onClick={(e) => e.stopPropagation()}>
        <p className={styles.confirmMsg}>📄 Documents client — {booking.reference || booking._id?.slice(-6)}</p>
        <p style={{ fontSize: ".83rem", color: "#64748b", margin: "0 0 12px" }}>
          {ci.firstName} {ci.lastName}{ci.email ? ` · ${ci.email}` : ""}
          {docs?.idType ? ` · ${String(docs.idType).toUpperCase()}${docs.idNumber ? ` ${docs.idNumber}` : ""}` : ""}
        </p>
        {loading
          ? <p style={{ color: "#94a3b8", fontSize: ".85rem" }}>Chargement…</p>
          : error
            ? <p style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: 8, padding: "8px 10px", fontSize: ".83rem" }}>⚠️ {error}</p>
            : <ClientDocuments docs={docs} reference={booking.reference} />}
        <div className={styles.confirmActions} style={{ marginTop: 14 }}>
          <button className={styles.btnGhost} onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
