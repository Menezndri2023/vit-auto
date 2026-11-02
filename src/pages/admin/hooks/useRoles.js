import { useState, useCallback } from "react";

// Rôles & permissions : état et actions sortis d'AdminPanel.jsx le 2026-11-02, à l'identique.
export default function useRoles({
  headers, showToast, token,
}) {
  // Rôles & Permissions
  const [adminAccounts,     setAdminAccounts]     = useState([]);
  const [rolesLoading,      setRolesLoading]      = useState(false);
  const [rolesSavingId,     setRolesSavingId]     = useState(null);

  // ── Rôles & Permissions ──────────────────────────────────────────────────────
  const loadAdminAccounts = useCallback(async () => {
    if (!token) return;
    setRolesLoading(true);
    try {
      const r = await fetch("/api/users/admin/accounts", { headers });
      if (r.ok) setAdminAccounts((await r.json()).admins || []);
    } catch { /* ignore */ }
    setRolesLoading(false);
  }, [token, headers]);

  const applyAdminScope = async (adminId, next) => {
    setRolesSavingId(adminId);
    try {
      const r = await fetch(`/api/users/admin/${adminId}/scope`, {
        method: "PATCH", headers,
        body: JSON.stringify({ scope: next }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast("Permissions mises à jour", "success");
      loadAdminAccounts();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setRolesSavingId(null); }
  };

  return {
    adminAccounts, applyAdminScope, loadAdminAccounts, rolesLoading, rolesSavingId,
  };
}
