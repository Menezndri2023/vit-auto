import { useState, useCallback } from "react";

// Certifications partenaires : état et actions sortis d'AdminPanel.jsx le 2026-11-02, à l'identique.
export default function useCertifications({
  fetchPaged, headers, showToast, token,
}) {
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

  return {
    certBadgeForm, certDetail, certFilter, certList, certLoading,
    certReviewForm, certReviewLevel, certReviewLoading, certReviewMsg, handleCertBadge,
    handleCertLevelReview, handleCertRelance, loadCertList, setCertBadgeForm, setCertDetail,
    setCertFilter, setCertReviewForm, setCertReviewLevel, setCertReviewMsg,
  };
}
