import { useState, useMemo } from "react";
import { Link, useNavigate, Navigate, useLocation } from "react-router-dom";
import { useVehicles } from "../context/VehicleContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import styles from "./Profile.module.css";

const fmt = (n) => Number(n || 0).toLocaleString("fr-FR") + " DH";

// ── Statuts des réservations / commandes ───────────────────
const STATUS_CFG = {
  "À confirmer": { label: "En attente",  color: "#f59e0b", bg: "#fffbeb" },
  pending:       { label: "En attente",  color: "#f59e0b", bg: "#fffbeb" },
  confirmed:     { label: "Confirmé",    color: "#3b82f6", bg: "#eff6ff" },
  in_progress:   { label: "En cours",    color: "#8b5cf6", bg: "#f5f3ff" },
  completed:     { label: "Terminé",     color: "#10b981", bg: "#ecfdf5" },
  cancelled:     { label: "Annulé",      color: "#ef4444", bg: "#fef2f2" },
};

const VEHICLE_STATUS = {
  approved: { label: "Publié",      color: "#10b981", bg: "#ecfdf5" },
  pending:  { label: "En attente",  color: "#f59e0b", bg: "#fffbeb" },
  rejected: { label: "Rejeté",      color: "#ef4444", bg: "#fef2f2" },
};

// ── Carte de réservation (clients) ─────────────────────────
const BookingCard = ({ booking }) => {
  const cfg  = STATUS_CFG[booking.status] || STATUS_CFG["À confirmer"];
  const date = booking.createdAt
    ? new Date(booking.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
    : "—";
  return (
    <div className={styles.bookingCard}>
      <div className={styles.bcLeft}>
        <span className={styles.bcType}>{booking.type === "essai" ? "🔑 Essai" : "🚗 Location"}</span>
        <p className={styles.bcName}>{booking.vehicleName || "Véhicule"}</p>
        <p className={styles.bcDate}>{date}</p>
      </div>
      <div className={styles.bcRight}>
        {booking.total > 0 && <p className={styles.bcTotal}>{fmt(booking.total)}</p>}
        <span className={styles.bcBadge} style={{ color: cfg.color, background: cfg.bg }}>{cfg.label}</span>
      </div>
    </div>
  );
};

// ── Carte de commande reçue (partenaires) ──────────────────
const OrderCard = ({ order }) => {
  const cfg  = STATUS_CFG[order.status] || STATUS_CFG["À confirmer"];
  const date = order.createdAt
    ? new Date(order.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
    : order.id ? new Date(order.id).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  return (
    <div className={styles.bookingCard}>
      <div className={styles.bcLeft}>
        <span className={styles.bcType}>
          {order.type === "essai" ? "🔑 Essai" : order.type === "chauffeur" ? "👤 Chauffeur" : "🚗 Location"}
        </span>
        <p className={styles.bcName}>{order.vehicleName || "Véhicule"}</p>
        <p className={styles.bcDate}>
          Client : {order.firstName} {order.lastName} — {date}
        </p>
      </div>
      <div className={styles.bcRight}>
        {order.partnerPayout > 0 && <p className={styles.bcTotal} style={{ color: "#10b981" }}>{fmt(order.partnerPayout)}</p>}
        <span className={styles.bcBadge} style={{ color: cfg.color, background: cfg.bg }}>{cfg.label}</span>
      </div>
    </div>
  );
};

// ── Carte de publication (partenaires) ─────────────────────
const PublicationCard = ({ vehicle }) => {
  const st    = VEHICLE_STATUS[vehicle.status] || VEHICLE_STATUS.pending;
  const score = vehicle.validationScore;
  const scoreColor =
    score >= 65 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444";

  return (
    <div className={styles.pubCard}>
      <div className={styles.pubCardLeft}>
        {vehicle.image
          ? <img src={vehicle.image} alt={vehicle.name} className={styles.pubThumb} />
          : <div className={styles.pubThumbFallback}>🚗</div>
        }
      </div>
      <div className={styles.pubCardBody}>
        <div className={styles.pubCardTitle}>
          <span className={styles.pubName}>{vehicle.name || vehicle.title}</span>
          <span className={styles.bcBadge} style={{ color: st.color, background: st.bg }}>{st.label}</span>
        </div>
        <p className={styles.pubMeta}>
          {vehicle.type === "location" ? `${vehicle.pricePerDay?.toLocaleString("fr-FR") || "—"} DH / jour` : `${vehicle.priceForSale?.toLocaleString("fr-FR") || "—"} DH`}
          {vehicle.ville ? ` · ${vehicle.ville}` : ""}
        </p>

        {/* Score de validation */}
        {score != null && vehicle.status !== "approved" && (
          <div className={styles.pubScoreWrap}>
            <div className={styles.pubScoreBar}>
              <div style={{ width: `${score}%`, background: scoreColor, height: "100%", borderRadius: "99px" }} />
            </div>
            <span className={styles.pubScoreLabel} style={{ color: scoreColor }}>{score}/100</span>
          </div>
        )}

        {/* Erreurs de validation */}
        {vehicle.validationErrors?.length > 0 && vehicle.status !== "approved" && (
          <ul className={styles.pubErrors}>
            {vehicle.validationErrors.slice(0, 2).map((e, i) => (
              <li key={i}>❌ {e}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

// ── Page principale ────────────────────────────────────────
const IDENTITY_TYPE_LABELS = {
  cni:          "Carte Nationale d'Identité",
  passport:     "Passeport",
  permis:       "Permis de conduire",
  carte_sejour: "Carte de séjour",
};

const IDENTITY_STATUS_CFG = {
  not_submitted: { label: "Non soumise",   color: "#94a3b8", bg: "#f8fafc"  },
  pending:       { label: "En vérification", color: "#f59e0b", bg: "#fffbeb" },
  verified:      { label: "Vérifiée ✓",    color: "#10b981", bg: "#ecfdf5"  },
  rejected:      { label: "Refusée",        color: "#ef4444", bg: "#fef2f2"  },
};

const Profile = () => {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { user, isAuthenticated, token, updateUser } = useAuth();
  const { bookings, partnerVehicles } = useVehicles();
  const { success: toastSuccess, error: toastError } = useToast();

  const isPartner = user?.role === "partenaire" || user?.role === "admin";

  // ── Tous les hooks avant le return conditionnel ────────────
  const [activeTab, setActiveTab] = useState("personal");
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);

  // ── Identité ───────────────────────────────────────────────
  const [identityForm, setIdentityForm] = useState({
    type: "cni", number: "", expiryDate: "",
    frontImage: "", backImage: "", selfie: "",
  });
  const [identitySubmitting, setIdentitySubmitting] = useState(false);
  const [identitySubmitted,  setIdentitySubmitted]  = useState(false);

  // ── Changement de mot de passe ─────────────────────────────
  const [pwdForm,     setPwdForm]     = useState({ current: "", next: "", confirm: "" });
  const [pwdChanging, setPwdChanging] = useState(false);
  const [showPwdForm, setShowPwdForm] = useState(false);

  const [profileData, setProfileData] = useState({
    firstName:     user?.firstName     || "",
    lastName:      user?.lastName      || "",
    email:         user?.email         || "",
    phone:         user?.phone         || "",
    address:       user?.address       || "",
    licenseNumber: user?.licenseNumber || "",
    licenseExpiry: user?.licenseExpiry || "",
  });

  const [notifications, setNotifications] = useState({
    emailReminders:       user?.notif_emailReminders       ?? true,
    smsReminders:         user?.notif_smsReminders         ?? false,
    promotionalEmails:    user?.notif_promotionalEmails    ?? true,
    bookingConfirmations: user?.notif_bookingConfirmations ?? true,
  });

  // ── Données partenaire ─────────────────────────────────────
  const partnerVehicleIds = useMemo(() =>
    new Set(partnerVehicles.map((v) => String(v.id || v._id))),
    [partnerVehicles]
  );

  const partnerOrders = useMemo(() =>
    bookings.filter((b) => partnerVehicleIds.has(String(b.vehicleId))),
    [bookings, partnerVehicleIds]
  );

  const activePartnerOrders = partnerOrders.filter(
    (b) => !["completed", "cancelled"].includes(b.status)
  );

  const netRevenue = partnerOrders
    .filter((b) => b.status === "completed")
    .reduce((s, b) => s + (Number(b.partnerPayout) || 0), 0);

  // ── Données client ─────────────────────────────────────────
  const userBookings = useMemo(() =>
    bookings.filter((b) =>
      String(b.userId) === String(user?.id) ||
      (b.email && b.email.toLowerCase() === user?.email?.toLowerCase())
    ),
    [bookings, user]
  );

  const totalSpent  = userBookings.reduce((s, b) => s + (Number(b.total) || 0), 0);
  const activeCount = userBookings.filter(
    (b) => !["completed", "cancelled"].includes(b.status)
  ).length;

  // ── Avatar ─────────────────────────────────────────────────
  const initials = [user?.firstName, user?.lastName]
    .filter(Boolean)
    .map((n) => n[0].toUpperCase())
    .join("") || user?.email?.[0]?.toUpperCase() || "?";

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
    : null;

  const roleLabel = {
    client:     "Client",
    partenaire: "Partenaire",
    admin:      "Administrateur",
  }[user?.role] || "Client";

  const roleStyle = {
    client:     styles.roleClient,
    partenaire: styles.rolePartner,
    admin:      styles.roleAdmin,
  }[user?.role] || styles.roleClient;

  // ── Onglets selon le rôle ──────────────────────────────────
  const tabs = isPartner
    ? [
        { key: "personal",      label: "Informations" },
        {
          key: "publications",
          label: `Publications${partnerVehicles.length ? ` (${partnerVehicles.length})` : ""}`,
        },
        {
          key: "commandes",
          label: `Commandes${partnerOrders.length ? ` (${partnerOrders.length})` : ""}`,
        },
        { key: "notifications", label: "Notifications" },
        { key: "security",      label: "Sécurité" },
      ]
    : [
        { key: "personal",      label: "Informations" },
        {
          key: "bookings",
          label: `Réservations${userBookings.length ? ` (${userBookings.length})` : ""}`,
        },
        { key: "notifications", label: "Notifications" },
        { key: "security",      label: "Sécurité" },
      ];

  // ── Stats selon le rôle ────────────────────────────────────
  const stats = isPartner
    ? [
        {
          value: partnerVehicles.filter((v) => v.status === "approved").length,
          label: "Publiées",
        },
        {
          value: partnerVehicles.filter((v) => v.status === "pending").length,
          label: "En attente",
          warn: true,
        },
        {
          value: activePartnerOrders.length,
          label: "Commandes en cours",
        },
        {
          value: fmt(netRevenue),
          label: "Revenus nets",
          accent: true,
        },
      ]
    : [
        { value: userBookings.length, label: "Réservations" },
        { value: fmt(totalSpent),     label: "Total dépensé" },
        { value: activeCount,         label: "En cours" },
      ];

  // ── Handlers ───────────────────────────────────────────────
  const handleProfileChange = (field, value) =>
    setProfileData((p) => ({ ...p, [field]: value }));

  const handleNotifChange = (field, value) =>
    setNotifications((p) => ({ ...p, [field]: value }));

  const handleSave = async (e) => {
    e?.preventDefault();
    setSaving(true);
    const payload = {
      ...profileData,
      notif_emailReminders:       notifications.emailReminders,
      notif_smsReminders:         notifications.smsReminders,
      notif_promotionalEmails:    notifications.promotionalEmails,
      notif_bookingConfirmations: notifications.bookingConfirmations,
    };
    try {
      const res = await fetch("/api/users/me", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.user) {
        updateUser(data.user);
        toastSuccess("Profil mis à jour avec succès.");
      } else {
        toastError(data.message || "Erreur lors de la sauvegarde.");
        return;
      }
    } catch {
      // Backend indisponible — sauvegarder localement quand même
      updateUser(payload);
      toastSuccess("Profil mis à jour (hors ligne).");
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  // ── Handler identité ───────────────────────────────────────
  const handleIdentityImage = (field) => (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setIdentityForm((p) => ({ ...p, [field]: reader.result }));
    reader.readAsDataURL(file);
  };

  const handleIdentitySubmit = async (e) => {
    e.preventDefault();
    if (!identityForm.number.trim()) { toastError("Numéro de pièce requis."); return; }
    setIdentitySubmitting(true);
    try {
      const res  = await fetch("/api/users/me/identity", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify(identityForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur.");
      toastSuccess("Pièce d'identité soumise. En attente de vérification.");
      setIdentitySubmitted(true);
      updateUser({ ...user, identity: { ...user.identity, status: "pending" } });
    } catch (err) {
      toastError(err.message || "Erreur lors de la soumission.");
    } finally {
      setIdentitySubmitting(false);
    }
  };

  // ── Handler changement mot de passe ────────────────────────
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pwdForm.next.length < 6) { toastError("Minimum 6 caractères."); return; }
    if (pwdForm.next !== pwdForm.confirm) { toastError("Les mots de passe ne correspondent pas."); return; }
    setPwdChanging(true);
    try {
      const res  = await fetch("/api/auth/change-password", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ currentPassword: pwdForm.current, newPassword: pwdForm.next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur.");
      toastSuccess("Mot de passe modifié avec succès !");
      setPwdForm({ current: "", next: "", confirm: "" });
      setShowPwdForm(false);
    } catch (err) {
      toastError(err.message || "Erreur.");
    } finally {
      setPwdChanging(false);
    }
  };

  // ── Guard : redirection propre avec retour possible ────────
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <div className={styles.page}>

      {/* ── En-tête ─────────────────────────────────────── */}
      <div className={styles.profileHeader}>
        <div className={styles.avatarWrap}>
          <div className={`${styles.avatar} ${isPartner ? styles.avatarPartner : ""}`}>
            {initials}
          </div>
        </div>
        <div className={styles.profileMeta}>
          <div className={styles.profileNameRow}>
            <h1 className={styles.profileName}>
              {user?.firstName || user?.email?.split("@")[0] || "Utilisateur"}
              {user?.lastName ? ` ${user.lastName}` : ""}
            </h1>
            <span className={`${styles.roleBadge} ${roleStyle}`}>{roleLabel}</span>
          </div>
          <p className={styles.profileEmail}>{user?.email}</p>
          {memberSince && (
            <p className={styles.profileSince}>
              {isPartner ? "Partenaire" : "Membre"} depuis {memberSince}
            </p>
          )}
          {/* Shortcut vers l'espace partenaire */}
          {isPartner && (
            <button
              className={styles.partnerSpaceBtn}
              onClick={() => navigate("/vendor/dashboard")}
            >
              Espace partenaire complet →
            </button>
          )}
        </div>
      </div>

      {/* ── Stats ───────────────────────────────────────── */}
      <div className={`${styles.statsRow} ${isPartner ? styles.statsRowPartner : ""}`}>
        {stats.map(({ value, label, warn, accent }) => (
          <div key={label} className={styles.statCard}>
            <span
              className={styles.statValue}
              style={accent ? { color: "#10b981" } : warn && value > 0 ? { color: "#f59e0b" } : {}}
            >
              {value}
            </span>
            <span className={styles.statLabel}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── Onglets ─────────────────────────────────────── */}
      <div className={styles.content}>
        <nav className={styles.tabs}>
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              className={activeTab === key ? styles.activeTab : ""}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className={styles.tabContent}>

          {/* ── Informations personnelles ──────────────── */}
          {activeTab === "personal" && (
            <section className={styles.section}>
              <h2>Informations personnelles</h2>
              <form className={styles.form} onSubmit={handleSave}>
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label>Prénom</label>
                    <input type="text" placeholder="Votre prénom"
                      value={profileData.firstName}
                      onChange={(e) => handleProfileChange("firstName", e.target.value)} />
                  </div>
                  <div className={styles.field}>
                    <label>Nom</label>
                    <input type="text" placeholder="Votre nom de famille"
                      value={profileData.lastName}
                      onChange={(e) => handleProfileChange("lastName", e.target.value)} />
                  </div>
                </div>

                <div className={styles.field}>
                  <label>Adresse e-mail</label>
                  <input type="email" placeholder="votre@email.com"
                    value={profileData.email}
                    onChange={(e) => handleProfileChange("email", e.target.value)} />
                </div>

                <div className={styles.field}>
                  <label>Téléphone</label>
                  <input type="tel" placeholder="+261 34 00 000 00"
                    value={profileData.phone}
                    onChange={(e) => handleProfileChange("phone", e.target.value)} />
                </div>

                <div className={styles.field}>
                  <label>Adresse</label>
                  <input type="text" placeholder="Votre adresse complète"
                    value={profileData.address}
                    onChange={(e) => handleProfileChange("address", e.target.value)} />
                </div>

                {/* Permis (seulement clients) */}
                {!isPartner && (
                  <>
                    <div className={styles.sectionDivider}><span>Permis de conduire</span></div>
                    <div className={styles.row}>
                      <div className={styles.field}>
                        <label>Numéro de permis</label>
                        <input type="text" placeholder="Ex : MG-123456"
                          value={profileData.licenseNumber}
                          onChange={(e) => handleProfileChange("licenseNumber", e.target.value)} />
                      </div>
                      <div className={styles.field}>
                        <label>Date d'expiration</label>
                        <input type="date"
                          value={profileData.licenseExpiry}
                          onChange={(e) => handleProfileChange("licenseExpiry", e.target.value)} />
                      </div>
                    </div>
                  </>
                )}

                <div className={styles.formFooter}>
                  <button type="submit" className={styles.primaryBtn} disabled={saving}>
                    {saving ? "Sauvegarde…" : saved ? "✓ Sauvegardé !" : "Sauvegarder les modifications"}
                  </button>
                  {saved && <span className={styles.savedMsg}>Vos informations ont été mises à jour.</span>}
                </div>
              </form>

              {/* ── Vérification d'identité ──────────────── */}
              <div className={styles.sectionDivider} style={{ marginTop: "2rem" }}><span>Vérification d'identité</span></div>
              {(() => {
                const idStatus = user?.identityStatus || user?.identity?.status || "not_submitted";
                const cfg = IDENTITY_STATUS_CFG[idStatus] || IDENTITY_STATUS_CFG.not_submitted;
                return (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, color: "#374151" }}>Statut de votre pièce d'identité</p>
                        <span style={{ display: "inline-block", marginTop: 4, padding: "3px 10px", borderRadius: 20, fontSize: "0.82rem", fontWeight: 700, color: cfg.color, background: cfg.bg }}>
                          {cfg.label}
                        </span>
                      </div>
                    </div>

                    {(idStatus === "not_submitted" || idStatus === "rejected") && !identitySubmitted && (
                      <form onSubmit={handleIdentitySubmit} className={styles.form}>
                        {idStatus === "rejected" && (
                          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px", color: "#991b1b", fontSize: "0.88rem", marginBottom: 8 }}>
                            Votre pièce a été refusée. Vous pouvez en soumettre une nouvelle.
                          </div>
                        )}
                        <div className={styles.row}>
                          <div className={styles.field}>
                            <label>Type de pièce</label>
                            <select value={identityForm.type} onChange={(e) => setIdentityForm((p) => ({ ...p, type: e.target.value }))}>
                              {Object.entries(IDENTITY_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                          </div>
                          <div className={styles.field}>
                            <label>Numéro de la pièce</label>
                            <input type="text" placeholder="Ex : CI1234567" value={identityForm.number}
                              onChange={(e) => setIdentityForm((p) => ({ ...p, number: e.target.value }))} required />
                          </div>
                        </div>
                        <div className={styles.field}>
                          <label>Date d'expiration</label>
                          <input type="date" value={identityForm.expiryDate}
                            onChange={(e) => setIdentityForm((p) => ({ ...p, expiryDate: e.target.value }))} />
                        </div>
                        <div className={styles.row}>
                          <div className={styles.field}>
                            <label>Recto de la pièce</label>
                            <input type="file" accept="image/*" onChange={handleIdentityImage("frontImage")} />
                          </div>
                          <div className={styles.field}>
                            <label>Verso de la pièce</label>
                            <input type="file" accept="image/*" onChange={handleIdentityImage("backImage")} />
                          </div>
                        </div>
                        <div className={styles.field}>
                          <label>Selfie avec la pièce</label>
                          <input type="file" accept="image/*" onChange={handleIdentityImage("selfie")} />
                        </div>
                        <div className={styles.formFooter}>
                          <button type="submit" className={styles.primaryBtn} disabled={identitySubmitting}>
                            {identitySubmitting ? "Envoi en cours…" : "Soumettre pour vérification"}
                          </button>
                        </div>
                      </form>
                    )}

                    {(idStatus === "pending" || identitySubmitted) && (
                      <p style={{ color: "#f59e0b", margin: 0 }}>
                        📋 Votre dossier est en cours d'examen par notre équipe. Vous recevrez une notification une fois la vérification effectuée.
                      </p>
                    )}

                    {idStatus === "verified" && (
                      <p style={{ color: "#10b981", margin: 0 }}>
                        ✅ Votre identité a été vérifiée et validée par notre équipe.
                      </p>
                    )}
                  </div>
                );
              })()}
            </section>
          )}

          {/* ── Publications (partenaires) ─────────────── */}
          {activeTab === "publications" && (
            <section className={styles.section}>
              <div className={styles.sectionHeaderRow}>
                <h2>Mes publications</h2>
                <button className={styles.secondarySmBtn} onClick={() => navigate("/vendor")}>
                  + Nouvelle annonce
                </button>
              </div>

              {partnerVehicles.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>🚗</div>
                  <h3>Aucune publication</h3>
                  <p>Publiez votre première annonce pour commencer à recevoir des réservations.</p>
                  <button className={styles.primaryBtn} onClick={() => navigate("/vendor")}>
                    Publier une annonce
                  </button>
                </div>
              ) : (
                <>
                  {/* Résumé rapide */}
                  <div className={styles.pubSummary}>
                    {["approved", "pending", "rejected"].map((st) => {
                      const count = partnerVehicles.filter((v) => v.status === st).length;
                      if (!count) return null;
                      const cfg = VEHICLE_STATUS[st];
                      return (
                        <span key={st} className={styles.pubSumBadge} style={{ color: cfg.color, background: cfg.bg }}>
                          {cfg.label} : {count}
                        </span>
                      );
                    })}
                  </div>

                  <div className={styles.pubList}>
                    {[...partnerVehicles]
                      .sort((a, b) => (b.createdAt || 0) > (a.createdAt || 0) ? 1 : -1)
                      .map((v) => (
                        <PublicationCard key={v.id || v._id} vehicle={v} />
                      ))}
                  </div>
                </>
              )}
            </section>
          )}

          {/* ── Commandes reçues (partenaires) ────────── */}
          {activeTab === "commandes" && (
            <section className={styles.section}>
              <div className={styles.sectionHeaderRow}>
                <h2>Commandes reçues</h2>
                <button className={styles.secondarySmBtn} onClick={() => navigate("/vendor/dashboard")}>
                  Gérer les commandes →
                </button>
              </div>

              {partnerOrders.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>📭</div>
                  <h3>Aucune commande</h3>
                  <p>Les réservations de vos clients apparaîtront ici une fois vos annonces publiées.</p>
                </div>
              ) : (
                <div className={styles.bookingList}>
                  {[...partnerOrders]
                    .sort((a, b) => (b.createdAt || b.id || 0) > (a.createdAt || a.id || 0) ? 1 : -1)
                    .map((o) => (
                      <OrderCard key={o.id} order={o} />
                    ))}
                </div>
              )}
            </section>
          )}

          {/* ── Réservations (clients) ─────────────────── */}
          {activeTab === "bookings" && (
            <section className={styles.section}>
              <h2>Mes réservations</h2>
              {userBookings.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>🚗</div>
                  <h3>Aucune réservation</h3>
                  <p>Vous n'avez pas encore effectué de réservation.</p>
                  <button className={styles.primaryBtn} onClick={() => navigate("/catalogue")}>
                    Parcourir le catalogue
                  </button>
                </div>
              ) : (
                <div className={styles.bookingList}>
                  {[...userBookings]
                    .sort((a, b) => (b.createdAt || 0) > (a.createdAt || 0) ? 1 : -1)
                    .map((b) => (
                      <BookingCard key={b.id} booking={b} />
                    ))}
                </div>
              )}
            </section>
          )}

          {/* ── Notifications ─────────────────────────── */}
          {activeTab === "notifications" && (
            <section className={styles.section}>
              <h2>Préférences de notifications</h2>
              <div className={styles.notifList}>
                {[
                  { key: "emailReminders",      title: "Rappels par e-mail",          desc: "Recevoir un rappel avant chaque réservation" },
                  { key: "smsReminders",         title: "Rappels par SMS",             desc: "Recevoir un rappel par message texte" },
                  { key: "promotionalEmails",    title: "Offres et promotions",        desc: "Recevoir nos offres spéciales et réductions" },
                  { key: "bookingConfirmations", title: "Confirmations de réservation",desc: "Recevoir une confirmation après chaque réservation" },
                ].map(({ key, title, desc }) => (
                  <div key={key} className={styles.notifItem}>
                    <div>
                      <p className={styles.notifTitle}>{title}</p>
                      <p className={styles.notifDesc}>{desc}</p>
                    </div>
                    <label className={styles.toggle}>
                      <input
                        type="checkbox"
                        checked={notifications[key]}
                        onChange={(e) => handleNotifChange(key, e.target.checked)}
                      />
                      <span className={styles.toggleSlider} />
                    </label>
                  </div>
                ))}
              </div>
              <div className={styles.formFooter} style={{ marginTop: "1.5rem" }}>
                <button className={styles.primaryBtn} onClick={handleSave} disabled={saving}>
                  {saving ? "Sauvegarde…" : saved ? "✓ Sauvegardé !" : "Enregistrer les préférences"}
                </button>
              </div>
            </section>
          )}

          {/* ── Sécurité ──────────────────────────────── */}
          {activeTab === "security" && (
            <section className={styles.section}>
              <h2>Sécurité du compte</h2>
              <div className={styles.securityList}>
                {/* Changement de mot de passe */}
                <div className={styles.securityItem}>
                  <div>
                    <p className={styles.secTitle}>Changer le mot de passe</p>
                    <p className={styles.secDesc}>Mettez à jour votre mot de passe régulièrement.</p>
                  </div>
                  <button className={styles.secondaryBtn} onClick={() => setShowPwdForm((v) => !v)}>
                    {showPwdForm ? "Annuler" : "Modifier"}
                  </button>
                </div>

                {showPwdForm && (
                  <form onSubmit={handleChangePassword} className={styles.form} style={{ marginTop: 0, paddingTop: 0 }}>
                    <div className={styles.field}>
                      <label>Mot de passe actuel</label>
                      <input type="password" placeholder="Votre mot de passe actuel"
                        value={pwdForm.current} onChange={(e) => setPwdForm((p) => ({ ...p, current: e.target.value }))} required />
                    </div>
                    <div className={styles.row}>
                      <div className={styles.field}>
                        <label>Nouveau mot de passe</label>
                        <input type="password" placeholder="Min. 6 caractères"
                          value={pwdForm.next} onChange={(e) => setPwdForm((p) => ({ ...p, next: e.target.value }))} required />
                      </div>
                      <div className={styles.field}>
                        <label>Confirmer</label>
                        <input type="password" placeholder="Répéter le nouveau"
                          value={pwdForm.confirm} onChange={(e) => setPwdForm((p) => ({ ...p, confirm: e.target.value }))} required />
                      </div>
                    </div>
                    <div className={styles.formFooter}>
                      <button type="submit" className={styles.primaryBtn} disabled={pwdChanging}>
                        {pwdChanging ? "Modification…" : "Enregistrer le nouveau mot de passe"}
                      </button>
                    </div>
                  </form>
                )}

                {/* E-mail de connexion */}
                <div className={styles.securityItem}>
                  <div>
                    <p className={styles.secTitle}>Adresse e-mail de connexion</p>
                    <p className={styles.secDesc}>{user?.email}</p>
                  </div>
                  <span style={{ padding: "6px 14px", borderRadius: 20, fontSize: "0.78rem", fontWeight: 700,
                    color: user?.emailVerified ? "#10b981" : "#f59e0b",
                    background: user?.emailVerified ? "#ecfdf5" : "#fffbeb" }}>
                    {user?.emailVerified ? "✓ Vérifié" : "Non vérifié"}
                  </span>
                </div>

                {/* Supprimer le compte */}
                <div className={`${styles.securityItem} ${styles.dangerZone}`}>
                  <div>
                    <p className={styles.secTitle}>Supprimer le compte</p>
                    <p className={styles.secDesc}>Action irréversible — toutes vos données seront effacées.</p>
                  </div>
                  <button className={styles.dangerBtn}
                    onClick={() => window.confirm("Êtes-vous sûr ? Cette action est irréversible.") && toastError("Contactez le support pour supprimer votre compte.")}>
                    Supprimer
                  </button>
                </div>
              </div>
            </section>
          )}

        </div>
      </div>
    </div>
  );
};

export default Profile;
