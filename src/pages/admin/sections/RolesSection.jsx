// Extrait d'AdminPanel.jsx (découpe par onglet, 2026-09-12) — logique inchangée.
import { ADMIN_SCOPE_CFG } from "../shared.jsx";


// ── Rôles & Permissions — permissions fines pour les comptes admin (voir
// server/middleware/auth.js requireAdminScope). adminScope=[] = accès complet
// (comportement historique) ; seules les routes nouvellement ajoutées avec
// requireAdminScope() vérifient réellement ces permissions pour l'instant —
// retrofit des routes admin existantes volontairement laissé pour plus tard
// (risque de régression trop élevé pour un rattrapage en une passe).

export function RolesSection({ admins, loading, savingId, onToggle, currentUserId }) {
  if (loading) return <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Chargement…</div>;
  if (!admins.length) return <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Aucun compte admin.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {admins.map((a) => {
        const scope = a.adminScope || [];
        // Aucun domaine assigné = ADMINISTRATEUR GÉNÉRAL (accès à tout, sans
        // permission à demander). Restreindre est une décision explicite.
        const isGeneral = scope.length === 0 || scope.includes("super_admin");
        const assigned  = scope.filter((x) => x !== "super_admin");
        return (
          <div key={a._id} style={{ background: "#fff", border: "1.5px solid", borderColor: isGeneral ? "#fbbf24" : "#e2e8f0", borderRadius: 12, padding: "14px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
              <div>
                <strong style={{ fontSize: ".9rem", color: "#0f1b3f" }}>{a.firstName} {a.lastName}</strong>
                {a._id === currentUserId && <span style={{ marginLeft: 8, fontSize: ".72rem", color: "#6366f1", fontWeight: 700 }}>(vous)</span>}
                <div style={{ fontSize: ".78rem", color: "#94a3b8" }}>{a.email}</div>
              </div>
              <span style={{ fontSize: ".74rem", fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: isGeneral ? "#fef3c7" : assigned.length ? "#eff6ff" : "#fef2f2", color: isGeneral ? "#b45309" : assigned.length ? "#1d4ed8" : "#b91c1c" }}>
                {isGeneral ? "👑 Administrateur général — accès à tout" : `${assigned.length} domaine${assigned.length > 1 ? "s" : ""} assigné${assigned.length > 1 ? "s" : ""}`}
              </span>
            </div>

            {/* Bascule ADMIN GÉNÉRAL — séparée des domaines : c'est un niveau,
                pas un domaine de plus. Un administrateur général passe partout
                et gère les autres comptes admin. */}
            <button disabled={savingId === a._id} onClick={() => onToggle(a._id, scope, "super_admin")}
              style={{
                width: "100%", textAlign: "left", padding: "10px 14px", borderRadius: 10,
                border: "1.5px solid", borderColor: isGeneral ? "#f59e0b" : "#e2e8f0",
                background: isGeneral ? "#fffbeb" : "#f8fafc", cursor: savingId === a._id ? "wait" : "pointer",
                marginBottom: 12, fontFamily: "inherit",
              }}>
              <div style={{ fontWeight: 800, fontSize: ".84rem", color: isGeneral ? "#b45309" : "#475569" }}>
                {isGeneral ? "👑 Administrateur général — accès total" : "👑 Faire de ce compte un administrateur général"}
              </div>
              <div style={{ fontSize: ".76rem", color: "#94a3b8", marginTop: 2 }}>
                Accès à toute l'administration, sans aucune permission à attribuer — ses identifiants
                de connexion suffisent. Peut aussi créer, restreindre ou désactiver les autres comptes admin.
              </div>
            </button>

            <div style={{ fontSize: ".76rem", color: "#64748b", fontWeight: 700, marginBottom: 6 }}>
              {isGeneral
                ? "Domaines — en assigner un RESTREINT ce compte à ce seul périmètre"
                : "Domaines assignés à ce compte"}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, opacity: isGeneral ? 0.45 : 1 }}>
              {ADMIN_SCOPE_CFG.map((s) => {
                const active = scope.includes(s.key);
                return (
                  <button key={s.key} title={s.desc} disabled={savingId === a._id}
                    onClick={() => onToggle(a._id, scope, s.key)}
                    style={{
                      padding: "6px 12px", borderRadius: 20, border: "1.5px solid",
                      borderColor: active ? "#6366f1" : "#e2e8f0",
                      background: active ? "#6366f1" : "#f8fafc",
                      color: active ? "#fff" : "#64748b",
                      fontWeight: 700, fontSize: ".78rem", cursor: savingId === a._id ? "wait" : "pointer",
                      opacity: savingId === a._id ? 0.6 : 1,
                    }}>
                    {s.icon} {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
