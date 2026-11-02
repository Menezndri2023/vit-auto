import { Badge, CERTIF_CFG, CountryFlag, KYC_CFG, Pagination, ROLE_CONFIG, fmtDate } from "../shared.jsx";
import styles from "../../AdminPanel.module.css";

// Onglet « Comptes » — extrait d'AdminPanel.jsx le 2026-11-02, à l'identique :
// l'état et les actions restent dans le panneau, passés ici en propriétés.
export default function ComptesSection({
  COUNTRIES_CONFIG, changeRole, deleteUser, filteredUsers, loadMoreUsers, openLoyalty,
  openTrustOverview, paginate, setConfirm, setUserCountry, setUserPage, setUserRole,
  setUserSearch, setVitrineModal, toggleBlock, totalPages, updatePhone, user,
  userCountry, userCountryOptions, userPage, userRole, userSearch, users,
  usersTotal,
}) {
  return (
    <div className={styles.tabContent}>
      <div className={styles.filterBar}>
        <input className={styles.searchInput} placeholder="🔍 Rechercher un utilisateur..."
          value={userSearch} onChange={(e) => { setUserSearch(e.target.value); setUserPage(1); }} />
        <select className={styles.filterSelect} value={userRole}
          onChange={(e) => { setUserRole(e.target.value); setUserPage(1); }}>
          <option value="all">Tous les rôles</option>
          <option value="client">Clients</option>
          <option value="partenaire">Partenaires</option>
          <option value="admin">Admins</option>
          <option value="chauffeur">Chauffeurs</option>
        </select>
        <select className={styles.filterSelect} value={userCountry}
          onChange={(e) => { setUserCountry(e.target.value); setUserPage(1); }}>
          <option value="all">Tous les pays</option>
          {userCountryOptions.map((code) => {
            const cfg = COUNTRIES_CONFIG.find((c) => c.code === code);
            return <option key={code} value={code}>{cfg ? `${cfg.flag} ${cfg.name}` : code}</option>;
          })}
        </select>
        <span className={styles.filterCount}>{filteredUsers.length} résultat{filteredUsers.length !== 1 ? "s" : ""}</span>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr><th>Utilisateur</th><th>Email</th><th>Rôle</th><th>Compte</th><th>KYC</th><th>Certif.</th><th>Inscrit le</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {paginate(filteredUsers, userPage).map((u) => {
              const rc = ROLE_CONFIG[u.role] || ROLE_CONFIG.client;
              const isSelf = String(u._id) === String(user?.id ?? user?._id);
              const kyc    = KYC_CFG[u.kycStatus] || { label: "—", color: "#94a3b8", bg: "#f8fafc" };
              const certif = CERTIF_CFG[u.certificationBadge];
              return (
                <tr key={u._id} className={`${styles.tr} ${!u.isActive ? styles.trBlocked : ""}`}>
                  <td>
                    <div className={styles.userCell}>
                      <div className={styles.avatar}>
                        {u.profilePhoto ? <img src={u.profilePhoto} alt="" loading="lazy" decoding="async" /> : <span>{(u.firstName?.[0] || "?").toUpperCase()}</span>}
                      </div>
                      <div>
                        <strong>{u.firstName} {u.lastName}<CountryFlag code={u.country} countriesConfig={COUNTRIES_CONFIG} /></strong>
                        {isSelf && <span className={styles.selfTag}>Vous</span>}
                        {/* Registre de Commerce — saisi à l'inscription
                            par les entités professionnelles. Affiché ici
                            parce que c'est la seule pièce qui rattache un
                            compte à une société réelle ; sans elle sous
                            les yeux, l'admin valide un partenaire dont il
                            ne peut pas vérifier l'existence légale. */}
                        {u.business?.rccm && (
                          <div style={{ fontSize: ".72rem", color: "#475569" }}>
                            RC : <strong>{u.business.rccm}</strong>
                          </div>
                        )}
                        <div style={{ fontSize:".72rem", color: u.phone ? "#94a3b8" : "#cbd5e1", display: "flex", alignItems: "center", gap: 4 }}>
                          {u.phone || "— aucun numéro —"}
                          <button type="button" onClick={() => updatePhone(u._id, u.phone)} title="Modifier le téléphone"
                            style={{ border: "none", background: "none", cursor: "pointer", padding: 0, fontSize: ".78rem", lineHeight: 1 }}>
                            ✏️
                          </button>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className={styles.tdEmail}>{u.email}</td>
                  <td>
                    <select className={styles.roleSelect} value={u.role} disabled={isSelf}
                      onChange={(e) => setConfirm({ message: `Changer le rôle de ${u.firstName} en "${e.target.value}" ?`, action: () => changeRole(u._id, e.target.value) })}
                      style={{ color: rc.color, background: rc.bg, borderColor: rc.color + "60" }}>
                      <option value="client">Client</option>
                      <option value="partenaire">Partenaire</option>
                      <option value="admin">Admin</option>
                      {/* « Chauffeur » retiré : ce n'est pas un rôle de COMPTE
                          (usersController.updateUserRole n'accepte que client/
                          partenaire/admin). Un chauffeur est une fiche publiée
                          par un partenaire — le choisir ici renvoyait toujours
                          400, sans message exploitable. */}
                    </select>
                  </td>
                  <td>{u.isActive ? <Badge label="Actif" color="#10b981" bg="#ecfdf5" /> : <Badge label="Bloqué" color="#ef4444" bg="#fef2f2" />}</td>
                  <td><Badge label={kyc.label} color={kyc.color} bg={kyc.bg} /></td>
                  <td>{certif ? <Badge label={certif.label} color={certif.color} bg={certif.bg} /> : <span style={{ color:"#cbd5e1", fontSize:".75rem" }}>—</span>}</td>
                  <td className={styles.tdDate}>{fmtDate(u.createdAt)}</td>
                  <td>
                    <div className={styles.actionBtns}>
                      {!isSelf && (
                        <button className={u.isActive ? styles.btnBlock : styles.btnUnblock}
                          onClick={() => setConfirm({ message: `${u.isActive ? "Bloquer" : "Débloquer"} le compte de ${u.firstName} ${u.lastName} ?`, action: () => toggleBlock(u._id) })}
                          title={u.isActive ? "Bloquer" : "Débloquer"}>
                          {u.isActive ? "🚫 Bloquer" : "✅ Débloquer"}
                        </button>
                      )}
                      {!isSelf && (
                        <button className={styles.btnDeleteSm}
                          onClick={() => setConfirm({ message: `Supprimer définitivement ${u.firstName} ${u.lastName} ? Cette action est irréversible.`, danger: true, action: () => deleteUser(u._id) })}
                          title="Supprimer">🗑️</button>
                      )}
                      {u.role === "partenaire" && (
                        <button className={styles.btnGhost} style={{ fontSize: ".72rem" }}
                          onClick={() => openTrustOverview(u)}
                          title="Vue de confiance unifiée">🛡️ Confiance</button>
                      )}
                      {/* L'administrateur partage lui aussi les liens
                          de vitrine des partenaires (consigne du
                          2026-09-25). Le lien court suit le palier DU
                          PARTENAIRE, pas les droits de l'admin. */}
                      {u.role === "partenaire" && (
                        <button className={styles.btnGhost} style={{ fontSize: ".72rem" }}
                          onClick={() => setVitrineModal(u)}
                          title="Lien de vitrine à partager">🔗 Vitrine</button>
                      )}
                      {u.role === "client" && (
                        <button className={styles.btnGhost} style={{ fontSize: ".72rem" }}
                          onClick={() => openLoyalty(u)}
                          title="Points de fidélité et historique">🎁 Fidélité</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={userPage} total={totalPages(filteredUsers)} onChange={setUserPage} />
      {/* Bug réel corrigé (audit) : plafond de 200 comptes chargés,
          invisible pour l'admin — voir loadMoreUsers. */}
      {users.length < usersTotal && (
        <div style={{ textAlign: "center", marginTop: 10 }}>
          <p style={{ fontSize: ".8rem", color: "#94a3b8", marginBottom: 6 }}>{users.length} chargés sur {usersTotal} au total</p>
          <button onClick={loadMoreUsers}
            style={{ padding: "6px 16px", borderRadius: 10, border: "1.5px solid #6366f1", background: "#fff", color: "#6366f1", fontWeight: 700, fontSize: ".8rem", cursor: "pointer" }}>
            Charger plus
          </button>
        </div>
      )}
    </div>
  );
}
