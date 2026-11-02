import { useState, useCallback } from "react";

// Signalements et confiance : état et actions sortis d'AdminPanel.jsx le 2026-11-02, à l'identique.
export default function useSignalements({
  fetchPaged, headers, showToast, token,
}) {
  const [reports,         setReports]         = useState([]);
  const [trustModal,      setTrustModal]      = useState(null);   // utilisateur ciblé
  const [trustOverview,   setTrustOverview]   = useState(null);

  const [trustLoading,    setTrustLoading]    = useState(false);
  const [reportsLoading,  setReportsLoading]  = useState(false);
  const [reportFilter,    setReportFilter]    = useState("en_attente");

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

  return {
    decideReport, loadReports, openTrustOverview, reportFilter, reports,
    reportsLoading, setReportFilter, setTrustModal, trustLoading, trustModal,
    trustOverview,
  };
}
