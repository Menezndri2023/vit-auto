import { useState, useCallback } from "react";

// Journal d'audit : état et actions sortis d'AdminPanel.jsx le 2026-11-02, à l'identique.
export default function useJournalAudit({
  fetchPaged, headers, token,
}) {
  const [auditEntries,     setAuditEntries]     = useState([]);
  const [auditLoading,     setAuditLoading]     = useState(false);
  const [auditFacets,      setAuditFacets]      = useState({ actions: [], resources: [] });
  const [auditFilter,      setAuditFilter]      = useState({ action: "", resource: "", success: "" });

  const loadAuditLog = useCallback(async () => {
    if (!token) return;
    setAuditLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (auditFilter.action)   params.set("action",   auditFilter.action);
      if (auditFilter.resource) params.set("resource", auditFilter.resource);
      if (auditFilter.success)  params.set("success",  auditFilter.success);
      params.delete("limit"); params.delete("page");
      // Jusqu'à 1 000 entrées par filtre (fetchPaged) — 50 seulement avant.
      const [listRes, facetsRes] = await Promise.all([
        fetchPaged(`/api/audit-log/admin/list?${params}`, { limit: 1000, pageSize: 100, key: "entries" }),
        fetch("/api/audit-log/admin/actions",           { headers }),
      ]);
      setAuditEntries(listRes.items || []);
      if (facetsRes.ok) setAuditFacets(await facetsRes.json());
    } catch { /* ignore */ }
    setAuditLoading(false);
  }, [token, headers, auditFilter, fetchPaged]);

  return {
    auditEntries, auditFacets, auditFilter, auditLoading, loadAuditLog,
    setAuditFilter,
  };
}
