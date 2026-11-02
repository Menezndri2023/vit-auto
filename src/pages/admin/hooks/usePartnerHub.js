import { useState, useCallback } from "react";

// Partner Hub PMS : état et actions sortis d'AdminPanel.jsx le 2026-11-02, à l'identique.
export default function usePartnerHub({
  headers, showToast, token,
}) {
  // PMS Admin
  const [pmsStats,    setPmsStats]    = useState(null);
  const [pmsShowrooms,setPmsShowrooms]= useState([]);
  const [pmsLoading,  setPmsLoading]  = useState(false);
  const [pmsFilter,   setPmsFilter]   = useState("all");

  // ── PMS Admin ─────────────────────────────────────────────────────────────
  const loadPMSAdmin = useCallback(async () => {
    if (!token) return;
    setPmsLoading(true);
    try {
      const published = pmsFilter === "all" ? "" : `?published=${pmsFilter === "published"}`;
      const [statsRes, showroomsRes] = await Promise.all([
        fetch("/api/pms/admin/stats",             { headers }),
        fetch(`/api/pms/admin/showrooms${published}`, { headers }),
      ]);
      if (statsRes.ok)     setPmsStats(await statsRes.json());
      if (showroomsRes.ok) setPmsShowrooms((await showroomsRes.json()).showrooms || []);
    } catch { /* ignore */ }
    setPmsLoading(false);
  }, [token, headers, pmsFilter]);

  const adminToggleShowroom = async (id) => {
    try {
      const r = await fetch(`/api/pms/admin/showrooms/${id}/toggle`, { method: "PATCH", headers });
      if (r.ok) {
        const { isPublished } = await r.json();
        setPmsShowrooms((prev) => prev.map((s) => s._id === id ? { ...s, isPublished } : s));
        showToast(isPublished ? "Showroom publié" : "Showroom dépublié", "success");
      }
    } catch { showToast("Erreur", "error"); }
  };

  return {
    adminToggleShowroom, loadPMSAdmin, pmsFilter, pmsLoading, pmsShowrooms,
    pmsStats, setPmsFilter,
  };
}
