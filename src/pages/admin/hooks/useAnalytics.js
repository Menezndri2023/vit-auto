import { useState, useCallback } from "react";

// Analytics : état et actions sortis d'AdminPanel.jsx le 2026-11-02, à l'identique.
export default function useAnalytics({
  headers, token,
}) {
  // Analytics avancé
  const [analytics,        setAnalytics]        = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // ── Analytics avancé ────────────────────────────────────────────────────────
  const loadAnalytics = useCallback(async () => {
    if (!token) return;
    setAnalyticsLoading(true);
    try {
      const r = await fetch("/api/analytics/admin", { headers });
      if (r.ok) setAnalytics(await r.json());
    } catch { /* ignore */ }
    setAnalyticsLoading(false);
  }, [token, headers]);

  return {
    analytics, analyticsLoading, loadAnalytics,
  };
}
