import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useVehicles } from "../context/VehicleContext";
import { useToast } from "../context/ToastContext";
import styles from "./VendorPublish.module.css";

const fmt = (n) => Number(n || 0).toLocaleString("fr-FR") + " DH";

const STATUS_CFG = {
  approved: { label: "Publié",      color: "#10b981", bg: "#ecfdf5", dot: "#10b981" },
  pending:  { label: "En attente",  color: "#f59e0b", bg: "#fffbeb", dot: "#f59e0b" },
  rejected: { label: "Rejeté",      color: "#ef4444", bg: "#fef2f2", dot: "#ef4444" },
};

const TYPE_CFG = {
  location:  { label: "Location",  color: "#6366f1", bg: "rgba(99,102,241,.10)" },
  vente:     { label: "Vente",     color: "#ff4d2d", bg: "rgba(255,77,45,.10)"  },
  chauffeur: { label: "Chauffeur", color: "#0ea5e9", bg: "rgba(14,165,233,.10)" },
};

const FILTER_TABS = [
  { key: "all",      label: "Toutes"      },
  { key: "approved", label: "Publiées"    },
  { key: "pending",  label: "En attente"  },
  { key: "rejected", label: "Rejetées"    },
];

/* ── Pseudo-stats par véhicule (générées depuis les bookings) ── */
function vehicleStats(vehicleId, partnerBookings) {
  const bks = partnerBookings.filter((b) => String(b.vehicleId) === String(vehicleId));
  const completed = bks.filter((b) => b.status === "completed");
  const revenue   = completed.reduce((s, b) => s + (Number(b.partnerPayout) || 0), 0);
  return { bookings: bks.length, completed: completed.length, revenue };
}

/* ── Score bar ── */
const ScoreBar = ({ score }) => {
  const color = score >= 65 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444";
  return (
    <div className={styles.scoreWrap}>
      <div className={styles.scoreTrack}>
        <div style={{ width: `${score}%`, background: color, height: "100%", borderRadius: 99 }} />
      </div>
      <span style={{ color, fontSize: ".70rem", fontWeight: 800 }}>{score}/100</span>
    </div>
  );
};

/* ── Carte publication ── */
const VehicleCard = ({ v, bookings, onDelete, onBoost }) => {
  const st   = STATUS_CFG[v.status]   || STATUS_CFG.pending;
  const tp   = TYPE_CFG[v.type]       || TYPE_CFG.location;
  const vst  = vehicleStats(v.id || v._id, bookings);
  const hasScore = v.validationScore != null && v.status !== "approved";

  return (
    <div className={styles.card}>
      {/* Thumb */}
      <div className={styles.cardThumb}>
        {v.image
          ? <img src={v.image} alt={v.name} />
          : <span className={styles.cardThumbFallback}>🚗</span>
        }
        {/* Status dot */}
        <span className={styles.statusDot} style={{ background: st.dot }} title={st.label} />
      </div>

      {/* Body */}
      <div className={styles.cardBody}>
        <div className={styles.cardTop}>
          <div className={styles.cardNameRow}>
            <span className={styles.cardName}>{v.name || v.title || "Véhicule"}</span>
            <span className={styles.typeBadge} style={{ color: tp.color, background: tp.bg }}>{tp.label}</span>
            <span className={styles.statusBadge} style={{ color: st.color, background: st.bg }}>{st.label}</span>
          </div>
          <p className={styles.cardMeta}>
            {v.type === "location"
              ? `${(v.pricePerDay || 0).toLocaleString("fr-FR")} DH / jour`
              : `${(v.priceForSale || 0).toLocaleString("fr-FR")} DH`}
            {v.ville ? ` · ${v.ville}` : ""}
            {v.year  ? ` · ${v.year}`  : ""}
          </p>
        </div>

        {/* Score si non approuvé */}
        {hasScore && <ScoreBar score={v.validationScore} />}

        {/* Erreurs */}
        {v.validationErrors?.length > 0 && v.status !== "approved" && (
          <div className={styles.errorsBox}>
            {v.validationErrors.slice(0, 3).map((e, i) => (
              <span key={i} className={styles.errorTag}>❌ {e}</span>
            ))}
          </div>
        )}

        {/* Mini stats */}
        <div className={styles.miniStats}>
          <div className={styles.miniStat}>
            <span className={styles.miniVal}>{vst.bookings}</span>
            <span className={styles.miniLbl}>Réservations</span>
          </div>
          <div className={styles.miniStatDivider} />
          <div className={styles.miniStat}>
            <span className={styles.miniVal}>{vst.completed}</span>
            <span className={styles.miniLbl}>Terminées</span>
          </div>
          <div className={styles.miniStatDivider} />
          <div className={styles.miniStat}>
            <span className={styles.miniVal} style={{ color: "#10b981" }}>{fmt(vst.revenue)}</span>
            <span className={styles.miniLbl}>Revenus</span>
          </div>
        </div>

        {/* Actions */}
        <div className={styles.cardActions}>
          {v.status === "approved" && (
            <button className={styles.boostBtn} onClick={() => onBoost(v)}>
              ⚡ Booster
            </button>
          )}
          {v.status === "rejected" && (
            <span className={styles.rejectTip}>Corrigez votre annonce et soumettez à nouveau</span>
          )}
          <button className={styles.deleteBtn} onClick={() => onDelete(v)}>
            🗑️ Supprimer
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Modal boost ── */
const BoostModal = ({ vehicle, onClose }) => {
  const PACKS = [
    { name: "Starter",  price: "4 900 DH", days: 7,  color: "#6366f1", features: ["Mise en avant 7 jours", "Badge Sponsorisé", "+300% de visibilité"] },
    { name: "Pro",      price: "9 900 DH", days: 15, color: "#f59e0b", popular: true, features: ["Mise en avant 15 jours", "Badge Top Annonce", "+600% de visibilité", "Notification push aux clients"] },
    { name: "Premium",  price: "17 900 DH", days: 30, color: "#ff4d2d", features: ["Mise en avant 30 jours", "Badge Premium", "+1000% de visibilité", "Push + email campagne", "Vitrine page d'accueil"] },
  ];
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.boostModal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.modalClose} onClick={onClose}>✕</button>
        <h2 className={styles.boostTitle}>⚡ Booster mon annonce</h2>
        <p className={styles.boostSub}>Multipliez la visibilité de <strong>{vehicle?.name}</strong> et recevez plus de réservations.</p>
        <div className={styles.boostPacksGrid}>
          {PACKS.map((p) => (
            <div key={p.name} className={`${styles.boostPack} ${p.popular ? styles.boostPackPopular : ""}`} style={{ borderColor: p.color + "44" }}>
              {p.popular && <div className={styles.boostPopularBadge} style={{ background: p.color }}>⭐ Plus populaire</div>}
              <div className={styles.boostPackName} style={{ color: p.color }}>{p.name}</div>
              <div className={styles.boostPackPrice}>{p.price}</div>
              <div className={styles.boostPackDays}>{p.days} jours</div>
              <ul className={styles.boostPackFeatures}>
                {p.features.map((f) => <li key={f}><span style={{ color: p.color }}>✓</span> {f}</li>)}
              </ul>
              <button className={styles.boostPackBtn} style={{ background: p.color }}>
                Choisir {p.name} →
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ── Page principale ── */
const VendorPublish = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { partnerVehicles, partnerBookings, loadPartnerVehicles } = useVehicles();
  const { success: toastOk, error: toastErr } = useToast();

  const [filter, setFilter]       = useState("all");
  const [search, setSearch]       = useState("");
  const [boostVehicle, setBoost]  = useState(null);
  const [deleteVehicle, setDelete] = useState(null);
  const [deleting, setDeleting]   = useState(false);

  /* ── Stats globales ── */
  const published  = partnerVehicles.filter((v) => v.status === "approved").length;
  const pending    = partnerVehicles.filter((v) => v.status === "pending").length;
  const rejected   = partnerVehicles.filter((v) => v.status === "rejected").length;
  const totalRevenue = useMemo(() =>
    (partnerBookings || [])
      .filter((b) => b.status === "completed")
      .reduce((s, b) => s + (Number(b.partnerPayout) || 0), 0),
    [partnerBookings]
  );

  /* ── Filtrage ── */
  const filtered = useMemo(() => {
    let list = partnerVehicles;
    if (filter !== "all") list = list.filter((v) => v.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((v) =>
        (v.name || v.title || "").toLowerCase().includes(q) ||
        (v.ville || "").toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) =>
      (b.createdAt || 0) > (a.createdAt || 0) ? 1 : -1
    );
  }, [partnerVehicles, filter, search]);

  /* ── Suppression ── */
  const confirmDelete = async () => {
    if (!deleteVehicle) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/vehicles/${deleteVehicle.id || deleteVehicle._id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("vit_token")}` },
      });
      if (res.ok) {
        toastOk("Annonce supprimée.");
        loadPartnerVehicles?.();
      } else {
        toastErr("Impossible de supprimer cette annonce.");
      }
    } catch {
      toastErr("Erreur réseau — réessayez.");
    } finally {
      setDeleting(false);
      setDelete(null);
    }
  };

  return (
    <div className={styles.page}>

      {/* ── En-tête ── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Gestion des publications</h1>
          <p className={styles.sub}>Gérez, boostez et suivez les performances de vos annonces.</p>
        </div>
        <button className={styles.newBtn} onClick={() => navigate("/vendor")}>
          + Nouvelle annonce
        </button>
      </div>

      {/* ── KPI cards ── */}
      <div className={styles.kpiRow}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiIcon}>📦</span>
          <span className={styles.kpiValue}>{partnerVehicles.length}</span>
          <span className={styles.kpiLabel}>Total annonces</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiIcon}>✅</span>
          <span className={styles.kpiValue} style={{ color: "#10b981" }}>{published}</span>
          <span className={styles.kpiLabel}>Publiées</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiIcon}>⏳</span>
          <span className={styles.kpiValue} style={{ color: "#f59e0b" }}>{pending}</span>
          <span className={styles.kpiLabel}>En attente</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiIcon}>❌</span>
          <span className={styles.kpiValue} style={{ color: "#ef4444" }}>{rejected}</span>
          <span className={styles.kpiLabel}>Rejetées</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiIcon}>💰</span>
          <span className={styles.kpiValue} style={{ color: "#10b981" }}>{fmt(totalRevenue)}</span>
          <span className={styles.kpiLabel}>Revenus générés</span>
        </div>
      </div>

      {/* ── Barre de recherche + filtres ── */}
      <div className={styles.toolbar}>
        <div className={styles.filterTabs}>
          {FILTER_TABS.map((t) => {
            const count = t.key === "all"
              ? partnerVehicles.length
              : partnerVehicles.filter((v) => v.status === t.key).length;
            return (
              <button
                key={t.key}
                className={`${styles.filterTab} ${filter === t.key ? styles.filterTabActive : ""}`}
                onClick={() => setFilter(t.key)}
              >
                {t.label}
                {count > 0 && <span className={styles.filterCount}>{count}</span>}
              </button>
            );
          })}
        </div>
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            className={styles.searchInput}
            placeholder="Rechercher par nom ou ville..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className={styles.searchClear} onClick={() => setSearch("")}>✕</button>
          )}
        </div>
      </div>

      {/* ── Guide si rejetés ── */}
      {rejected > 0 && (
        <div className={styles.rejectAlert}>
          <span>⚠️</span>
          <span>
            Vous avez <strong>{rejected} annonce{rejected > 1 ? "s" : ""} rejetée{rejected > 1 ? "s" : ""}</strong>.
            Corrigez les erreurs indiquées et publiez à nouveau depuis <button className={styles.alertLink} onClick={() => navigate("/vendor")}>Nouvelle annonce</button>.
          </span>
        </div>
      )}

      {/* ── Liste ── */}
      {filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🚗</div>
          <h3>{search ? "Aucun résultat" : "Aucune annonce"}</h3>
          <p>
            {search
              ? `Aucune annonce ne correspond à "${search}".`
              : "Publiez votre première annonce pour commencer à recevoir des réservations."}
          </p>
          {!search && (
            <button className={styles.newBtnSm} onClick={() => navigate("/vendor")}>
              Créer une annonce
            </button>
          )}
        </div>
      ) : (
        <div className={styles.cardGrid}>
          {filtered.map((v) => (
            <VehicleCard
              key={v.id || v._id}
              v={v}
              bookings={partnerBookings || []}
              onDelete={setDelete}
              onBoost={setBoost}
            />
          ))}
        </div>
      )}

      {/* ── Conseil publication ── */}
      {partnerVehicles.length > 0 && (
        <div className={styles.tipBox}>
          <span className={styles.tipIcon}>💡</span>
          <div>
            <strong>Conseil :</strong> Les annonces avec 4 photos ou plus et une description détaillée reçoivent
            en moyenne <strong>3× plus de réservations</strong>. Boostez vos annonces pour multiplier leur visibilité.
          </div>
        </div>
      )}

      {/* ── Modal boost ── */}
      {boostVehicle && (
        <BoostModal vehicle={boostVehicle} onClose={() => setBoost(null)} />
      )}

      {/* ── Modal suppression ── */}
      {deleteVehicle && (
        <div className={styles.modalOverlay} onClick={() => setDelete(null)}>
          <div className={styles.deleteModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.deleteIcon}>🗑️</div>
            <h3>Supprimer cette annonce ?</h3>
            <p>
              <strong>{deleteVehicle.name || deleteVehicle.title}</strong> sera définitivement supprimée.
              Cette action est irréversible.
            </p>
            <div className={styles.deleteActions}>
              <button className={styles.cancelBtn} onClick={() => setDelete(null)}>Annuler</button>
              <button className={styles.confirmDeleteBtn} onClick={confirmDelete} disabled={deleting}>
                {deleting ? "Suppression…" : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorPublish;
