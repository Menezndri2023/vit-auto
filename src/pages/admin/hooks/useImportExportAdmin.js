import { useState, useCallback } from "react";

// Import/Export : demandes et transactions : état et actions sortis d'AdminPanel.jsx le 2026-11-02, à l'identique.
export default function useImportExportAdmin({
  fetchPaged, headers, showToast, token,
}) {
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

  return {
    deleteIeRequest, handleCompleteIeInspection, handleResolveIeDispute, handleVerifyIePayment, ieActionSaving,
    ieLoading, ieRequests, ieRequestsTotal, ieTransactions, ieTxLoading,
    ieTxModal, ieTxNote, ieTxRelease, ieTxSaving, loadIeTransactions,
    loadImportExport, loadMoreIeRequests, setIeTxModal, setIeTxNote, setIeTxRelease,
    updateIeRequestStatus,
  };
}
