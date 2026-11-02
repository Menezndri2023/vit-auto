import { useState, useCallback } from "react";

// Modération des avis clients : état et actions sortis d'AdminPanel.jsx le 2026-11-02, à l'identique.
export default function useModerationAvis({
  fetchPaged, headers, showToast, token,
}) {
  // Modération des avis clients
  const [reviewsList,      setReviewsList]      = useState([]);
  const [reviewsLoading,   setReviewsLoading]   = useState(false);
  const [reviewsFilter,    setReviewsFilter]    = useState(""); // "" | "true" | "false"
  const [reviewsTargetType, setReviewsTargetType] = useState(""); // "" | vehicle | driver | partner | platform | client
  const [platformReviewStats, setPlatformReviewStats] = useState(null);

  const [reviewActioning,  setReviewActioning]  = useState(null);

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

  return {
    loadReviews, platformReviewStats, reviewActioning, reviewsFilter, reviewsList,
    reviewsLoading, reviewsTargetType, setReviewsFilter, setReviewsTargetType, toggleReviewVisibility,
  };
}
