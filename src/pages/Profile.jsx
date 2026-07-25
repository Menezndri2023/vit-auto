import { useState, useMemo } from "react";
import { Link, useNavigate, Navigate, useLocation } from "react-router-dom";
import { useVehicles } from "../context/VehicleContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useCurrency } from "../context/CurrencyContext";
import { useI18n } from "../context/I18nContext";
import styles from "./Profile.module.css";

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
const BookingCard = ({ booking, onCancel, fmt }) => {
  const cfg  = STATUS_CFG[booking.status] || STATUS_CFG["À confirmer"];
  const date = booking.createdAt
    ? new Date(booking.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
    : "—";
  const canCancel = ["pending", "À confirmer", "confirmed"].includes(booking.status);
  const typeLabel = booking.type === "essai" ? "🔑 Essai" : booking.type === "chauffeur" ? "🧑‍✈️ Chauffeur" : booking.type === "leasing" ? "📊 Leasing" : "🚗 Location";
  return (
    <div className={styles.bookingCard}>
      <div className={styles.bcLeft}>
        <span className={styles.bcType}>{typeLabel}</span>
        <p className={styles.bcName}>{booking.vehicleName || "Véhicule"}</p>
        <p className={styles.bcDate}>{booking.reference ? `Réf. ${booking.reference} · ` : ""}{date}</p>
      </div>
      <div className={styles.bcRight}>
        {(booking.total || booking.montantTotal) > 0 && (
          <p className={styles.bcTotal}>{fmt(booking.total || booking.montantTotal)}</p>
        )}
        <span className={styles.bcBadge} style={{ color: cfg.color, background: cfg.bg }}>{cfg.label}</span>
        {canCancel && onCancel && (
          <button className={styles.cancelBtnSmall} onClick={() => onCancel(booking.id, "Annulé par le client")} title="Annuler">
            ✕ Annuler
          </button>
        )}
      </div>
    </div>
  );
};

// ── Carte de commande reçue (partenaires) ──────────────────
const OrderCard = ({ order, fmt }) => {
  const cfg  = STATUS_CFG[order.status] || STATUS_CFG["À confirmer"];
  const date = order.createdAt
    ? new Date(order.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
    : "—";
  const typeLabel = order.type === "essai" ? "🔑 Essai" : order.type === "chauffeur" ? "🧑‍✈️ Chauffeur" : order.type === "leasing" ? "📊 Leasing" : "🚗 Location";
  return (
    <div className={styles.bookingCard}>
      <div className={styles.bcLeft}>
        <span className={styles.bcType}>{typeLabel}</span>
        <p className={styles.bcName}>{order.vehicleName || "Véhicule"}</p>
        <p className={styles.bcDate}>
          Client : {order.firstName} {order.lastName} — {date}
        </p>
        {order.reference && <p className={styles.bcDate} style={{ fontFamily:"monospace" }}>Réf. {order.reference}</p>}
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
  const { fmt } = useCurrency();
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
          {vehicle.type === "location" ? `${fmt(vehicle.pricePerDay)} / jour` : fmt(vehicle.priceForSale || vehicle.buyPrice)}
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
  not_submitted: { label: "Non soumise",     color: "#94a3b8", bg: "#f8fafc"  },
  pending:       { label: "En vérification", color: "#f59e0b", bg: "#fffbeb"  },
  verified:      { label: "Vérifiée ✓",      color: "#10b981", bg: "#ecfdf5"  },
  rejected:      { label: "Refusée",         color: "#ef4444", bg: "#fef2f2"  },
};

// Statuts KYC avancé (nouveau système OCR + face match)
const KYC_STATUS_CFG = {
  EN_ATTENTE:            { label: "KYC en attente",     color: "#f59e0b", bg: "#fffbeb", icon: "⏳" },
  A_REVOIR_MANUELLEMENT: { label: "KYC en révision",    color: "#2563eb", bg: "#dbeafe", icon: "🔍" },
  VERIFIE:               { label: "KYC vérifié ✓",      color: "#059669", bg: "#d1fae5", icon: "✅" },
  REFUSE:                { label: "KYC refusé",          color: "#dc2626", bg: "#fee2e2", icon: "❌" },
};

const Profile = () => {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { user, isAuthenticated, token, updateUser, setSession } = useAuth();
  const { bookings, partnerVehicles, partnerBookings, removeBooking } = useVehicles();
  const { success: toastSuccess, error: toastError } = useToast();
  const { fmt, COUNTRIES_CONFIG } = useCurrency();
  const { t } = useI18n();

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
  const [showOldPwd,     setShowOldPwd]     = useState(false);
  const [showNewPwd,     setShowNewPwd]     = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);

  const [profileData, setProfileData] = useState({
    firstName:     user?.firstName     || "",
    lastName:      user?.lastName      || "",
    email:         user?.email         || "",
    phone:         user?.phone         || "",
    address:       user?.address       || "",
    country:       user?.country       || "",
    licenseNumber: user?.licenseNumber || "",
    licenseExpiry: user?.licenseExpiry || "",
    profilePhoto:  user?.profilePhoto  || "",
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
    partnerBookings.length > 0
      ? partnerBookings
      : bookings.filter((b) => partnerVehicleIds.has(String(b.vehicleId))),
    [partnerBookings, bookings, partnerVehicleIds]
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
        { key: "personal",      label: t("profile.info") },
        {
          key: "publications",
          label: `${t("profile.publications")}${partnerVehicles.length ? ` (${partnerVehicles.length})` : ""}`,
        },
        {
          key: "commandes",
          label: `${t("dash.myOrders")}${partnerOrders.length ? ` (${partnerOrders.length})` : ""}`,
        },
        { key: "notifications", label: "Notifications" },
        { key: "security",      label: t("profile.security") },
      ]
    : [
        { key: "personal",      label: t("profile.info") },
        {
          key: "bookings",
          label: `${t("profile.bookings")}${userBookings.length ? ` (${userBookings.length})` : ""}`,
        },
        { key: "notifications", label: "Notifications" },
        { key: "security",      label: t("profile.security") },
      ];

  // ── Stats selon le rôle ────────────────────────────────────
  const stats = isPartner
    ? [
        {
          value: partnerVehicles.filter((v) => v.status === "approved").length,
          label: t("vehicle.available") || "Publiées",
        },
        {
          value: partnerVehicles.filter((v) => v.status === "pending").length,
          label: t("dash.status.pending") || "En attente",
          warn: true,
        },
        {
          value: activePartnerOrders.length,
          label: t("dash.myOrders") || "Commandes en cours",
        },
        {
          value: fmt(netRevenue),
          label: t("profile.revenue") || "Revenus nets",
          accent: true,
        },
      ]
    : [
        { value: userBookings.length, label: t("profile.bookings") || "Réservations" },
        { value: fmt(totalSpent),     label: t("dash.spend")       || "Total dépensé" },
        { value: activeCount,         label: t("dash.status.active") || "En cours" },
      ];

  // ── Handlers ───────────────────────────────────────────────
  const handleProfileChange = (field, value) =>
    setProfileData((p) => ({ ...p, [field]: value }));

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
      toastError("Format d'image invalide (SVG non accepté).");
      return;
    }
    if (file.size > 3 * 1024 * 1024) { toastError("Image trop lourde (max 3 Mo)."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const photo = reader.result;
      setProfileData((p) => ({ ...p, profilePhoto: photo }));
      // Passé explicitement : setProfileData ne met à jour l'état que de façon asynchrone,
      // donc handleSave() lirait encore l'ancienne valeur (sans la photo) s'il fallait
      // compter sur la fermeture de `profileData` au lieu de cette valeur fraîche.
      handleSave(null, { profilePhoto: photo });
    };
    reader.readAsDataURL(file);
  };

  const handleNotifChange = (field, value) =>
    setNotifications((p) => ({ ...p, [field]: value }));

  const handleSave = async (e, overrides = {}) => {
    e?.preventDefault();
    setSaving(true);
    const payload = {
      ...profileData,
      ...overrides,
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
      const data = await res.json().catch(() => null);
      if (res.ok && data?.user) {
        updateUser(data.user);
        toastSuccess("Profil mis à jour avec succès.");
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        // Ne jamais prétendre que c'est sauvegardé si le serveur a répondu une erreur —
        // sinon la photo/les préférences donnent l'illusion d'être enregistrées alors
        // qu'elles ne le sont pas (bug observé précédemment).
        toastError(data?.message || "Erreur lors de la sauvegarde. Réessayez.");
      }
    } catch {
      toastError("Erreur réseau — impossible de contacter le serveur. Réessayez.");
    } finally {
      setSaving(false);
    }
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
      // Le changement de mot de passe invalide l'ancien token (voir tokenVersion,
      // server/middleware/auth.js) — sans appliquer le nouveau immédiatement, la
      // session en cours serait rejetée (401) à la toute prochaine requête.
      if (data.token) setSession(user, data.token);
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
        <div className={styles.avatarWrap} style={{ position: "relative" }}>
          <label
            htmlFor="profilePhotoInput"
            title="Changer la photo de profil"
            style={{ cursor: "pointer", display: "block" }}
          >
            <div
              className={`${styles.avatar} ${isPartner ? styles.avatarPartner : ""}`}
              style={profileData.profilePhoto ? {
                backgroundImage: `url(${profileData.profilePhoto})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              } : undefined}
            >
              {!profileData.profilePhoto && initials}
            </div>
            <span style={{
              position: "absolute", bottom: 0, right: 0,
              background: "#0f1b3f", color: "#fff", borderRadius: "50%",
              width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "0.85rem", border: "2px solid #fff",
            }}>
              📷
            </span>
          </label>
          <input
            id="profilePhotoInput"
            type="file"
            accept="image/*"
            onChange={handlePhotoChange}
            style={{ display: "none" }}
          />
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
              {isPartner ? "Partenaire" : t("profile.memberSince")} {memberSince}
            </p>
          )}
          {/* Shortcut vers l'espace partenaire */}
          {isPartner && (
            <button
              className={styles.partnerSpaceBtn}
              onClick={() => navigate("/vendor/dashboard")}
            >
              {t("profile.partnerSpace")}
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
              <h2>{t("profile.info")}</h2>
              <form className={styles.form} onSubmit={handleSave}>
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label>{t("profile.firstName")}</label>
                    <input type="text" placeholder={t("profile.firstName")}
                      value={profileData.firstName}
                      onChange={(e) => handleProfileChange("firstName", e.target.value)} />
                  </div>
                  <div className={styles.field}>
                    <label>{t("profile.lastName")}</label>
                    <input type="text" placeholder={t("profile.lastName")}
                      value={profileData.lastName}
                      onChange={(e) => handleProfileChange("lastName", e.target.value)} />
                  </div>
                </div>

                <div className={styles.field}>
                  <label>{t("profile.email")}</label>
                  <input type="email" placeholder="votre@email.com"
                    value={profileData.email}
                    onChange={(e) => handleProfileChange("email", e.target.value)} />
                </div>

                <div className={styles.field}>
                  <label>{t("profile.phone")}</label>
                  <input type="tel" placeholder="+261 34 00 000 00"
                    value={profileData.phone}
                    onChange={(e) => handleProfileChange("phone", e.target.value)} />
                </div>

                <div className={styles.field}>
                  <label>{t("auth.address") || "Adresse"}</label>
                  <input type="text" placeholder={t("auth.address") || "Votre adresse complète"}
                    value={profileData.address}
                    onChange={(e) => handleProfileChange("address", e.target.value)} />
                </div>

                <div className={styles.field}>
                  <label>Pays</label>
                  <select value={profileData.country} onChange={(e) => handleProfileChange("country", e.target.value)}>
                    <option value="">— Sélectionner —</option>
                    {COUNTRIES_CONFIG.map((c) => (
                      <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                    ))}
                  </select>
                  <small style={{ color: "#8493b0", fontSize: "0.78rem" }}>
                    📍 Détermine les annonces de votre pays affichées dans le catalogue.
                  </small>
                </div>

                {/* Permis (seulement clients) */}
                {!isPartner && (
                  <>
                    <div className={styles.sectionDivider}><span>{t("vd.licenseRequired")}</span></div>
                    <div className={styles.row}>
                      <div className={styles.field}>
                        <label>{t("auth.license") || "Numéro de permis"}</label>
                        <input type="text" placeholder="Ex : MG-123456"
                          value={profileData.licenseNumber}
                          onChange={(e) => handleProfileChange("licenseNumber", e.target.value)} />
                      </div>
                      <div className={styles.field}>
                        <label>{t("auth.licenseExpiry") || "Date d'expiration"}</label>
                        <input type="date"
                          value={profileData.licenseExpiry}
                          onChange={(e) => handleProfileChange("licenseExpiry", e.target.value)} />
                      </div>
                    </div>
                  </>
                )}

                <div className={styles.formFooter}>
                  <button type="submit" className={styles.primaryBtn} disabled={saving}>
                    {saving ? `${t("dash.loading")}` : saved ? `✓ ${t("profile.saved")}` : t("profile.save")}
                  </button>
                  {saved && <span className={styles.savedMsg}>{t("profile.saved")}</span>}
                </div>
              </form>

              {/* ── Vérification d'identité ──────────────── */}
              <div className={styles.sectionDivider} style={{ marginTop: "2rem" }}><span>Vérification d'identité</span></div>
              {(() => {
                const idStatus  = user?.identityStatus || user?.identity?.status || "not_submitted";
                const cfg       = IDENTITY_STATUS_CFG[idStatus] || IDENTITY_STATUS_CFG.not_submitted;
                const kycStatus = user?.kycStatus;
                const kycCfg    = kycStatus ? KYC_STATUS_CFG[kycStatus] : null;
                const kycScore  = user?.kycScore ?? 0;
                return (
                  <div>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, color: "#374151" }}>Statut de votre pièce d'identité</p>
                        <span style={{ display: "inline-block", marginTop: 4, padding: "3px 10px", borderRadius: 20, fontSize: "0.82rem", fontWeight: 700, color: cfg.color, background: cfg.bg }}>
                          {cfg.label}
                        </span>
                      </div>
                      {/* Badge KYC avancé (OCR + face match) */}
                      {kycCfg && (
                        <div style={{ background: kycCfg.bg, border: `1.5px solid ${kycCfg.color}40`, borderRadius: 12, padding: "10px 16px", textAlign: "right" }}>
                          <p style={{ margin: 0, fontSize: "0.76rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 700 }}>Vérification KYC</p>
                          <p style={{ margin: "4px 0 0", fontWeight: 800, color: kycCfg.color, fontSize: "0.88rem" }}>
                            {kycCfg.icon} {kycCfg.label}
                          </p>
                          {kycScore > 0 && (
                            <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: "#64748b" }}>Score : {kycScore}/100</p>
                          )}
                          {kycStatus === "VERIFIE" && (
                            <p style={{ margin: "4px 0 0", fontSize: "0.75rem", color: "#059669" }}>
                              Vous pouvez effectuer des réservations en toute confiance.
                            </p>
                          )}
                          {(kycStatus === "REFUSE" || kycStatus === "EN_ATTENTE") && (
                            <Link to="/kyc" style={{ display: "inline-block", marginTop: 6, fontSize: "0.75rem", color: kycCfg.color, fontWeight: 700, textDecoration: "underline" }}>
                              {kycStatus === "REFUSE" ? "Resoumettre mon dossier →" : "Suivre mon dossier →"}
                            </Link>
                          )}
                        </div>
                      )}
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
                      <OrderCard key={o.id} order={o} fmt={fmt} />
                    ))}
                </div>
              )}
            </section>
          )}

          {/* ── Réservations (clients) ─────────────────── */}
          {activeTab === "bookings" && (
            <section className={styles.section}>
              <h2>{t("dash.myBookings")}</h2>
              {userBookings.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>🚗</div>
                  <h3>{t("dash.noBookings")}</h3>
                  <p>{t("dash.noBookings")}</p>
                  <button className={styles.primaryBtn} onClick={() => navigate("/catalogue")}>
                    {t("vehicle.details")}
                  </button>
                </div>
              ) : (
                <div className={styles.bookingList}>
                  {[...userBookings]
                    .sort((a, b) => (b.createdAt || 0) > (a.createdAt || 0) ? 1 : -1)
                    .map((b) => (
                      <BookingCard key={b.id} booking={b} fmt={fmt} onCancel={removeBooking} />
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
                  {saving ? t("dash.loading") : saved ? `✓ ${t("profile.saved")}` : t("profile.save")}
                </button>
              </div>
            </section>
          )}

          {/* ── Sécurité ──────────────────────────────── */}
          {activeTab === "security" && (
            <section className={styles.section}>
              <h2>{t("profile.security")}</h2>
              <div className={styles.securityList}>
                {/* Changement de mot de passe */}
                <div className={styles.securityItem}>
                  <div>
                    <p className={styles.secTitle}>{t("profile.changePwd")}</p>
                    <p className={styles.secDesc}>{t("auth.password")}</p>
                  </div>
                  <button className={styles.secondaryBtn} onClick={() => setShowPwdForm((v) => !v)}>
                    {showPwdForm ? t("profile.cancel") : t("profile.edit")}
                  </button>
                </div>

                {showPwdForm && (
                  <form onSubmit={handleChangePassword} className={styles.form} style={{ marginTop: 0, paddingTop: 0 }}>
                    <div className={styles.field}>
                      <label>{t("profile.oldPwd")}</label>
                      <div style={{ position: "relative" }}>
                        <input type={showOldPwd ? "text" : "password"} placeholder={t("profile.oldPwd")}
                          value={pwdForm.current} onChange={(e) => setPwdForm((p) => ({ ...p, current: e.target.value }))} required
                          style={{ width: "100%", boxSizing: "border-box", paddingRight: 40 }} />
                        <button type="button" onClick={() => setShowOldPwd((v) => !v)}
                          aria-label={showOldPwd ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                          style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: "1rem" }}>
                          {showOldPwd ? "🙈" : "👁️"}
                        </button>
                      </div>
                    </div>
                    <div className={styles.row}>
                      <div className={styles.field}>
                        <label>{t("profile.newPwd")}</label>
                        <div style={{ position: "relative" }}>
                          <input type={showNewPwd ? "text" : "password"} placeholder={t("profile.newPwd")}
                            value={pwdForm.next} onChange={(e) => setPwdForm((p) => ({ ...p, next: e.target.value }))} required
                            style={{ width: "100%", boxSizing: "border-box", paddingRight: 40 }} />
                          <button type="button" onClick={() => setShowNewPwd((v) => !v)}
                            aria-label={showNewPwd ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                            style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: "1rem" }}>
                            {showNewPwd ? "🙈" : "👁️"}
                          </button>
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label>{t("profile.confirmPwd")}</label>
                        <div style={{ position: "relative" }}>
                          <input type={showConfirmPwd ? "text" : "password"} placeholder={t("profile.confirmPwd")}
                            value={pwdForm.confirm} onChange={(e) => setPwdForm((p) => ({ ...p, confirm: e.target.value }))} required
                            style={{ width: "100%", boxSizing: "border-box", paddingRight: 40 }} />
                          <button type="button" onClick={() => setShowConfirmPwd((v) => !v)}
                            aria-label={showConfirmPwd ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                            style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: "1rem" }}>
                            {showConfirmPwd ? "🙈" : "👁️"}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className={styles.formFooter}>
                      <button type="submit" className={styles.primaryBtn} disabled={pwdChanging}>
                        {pwdChanging ? t("dash.loading") : t("profile.changePwd")}
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
