import { useState, useRef, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useChat } from "../../context/ChatContext";
import styles from "./BottomNav.module.css";

// Barre d'onglets mobile — remplace le menu hamburger sur petit écran.
// Navbar reste montée en parallèle (logo, notifications, langue) : voir Layout.jsx.
export default function BottomNav() {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();
  const { setOpen: setChatOpen, unreadTotal } = useChat();
  const [moreOpen, setMoreOpen] = useState(false);
  const sheetRef = useRef(null);

  const isPartner = user?.role === "partenaire" || user?.role === "admin";
  const isAdmin   = user?.role === "admin";

  useEffect(() => {
    if (!moreOpen) return;
    const handle = (e) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [moreOpen]);

  const goAuthGated = (path) => {
    navigate(isAuthenticated ? path : "/login");
  };

  const navClass = ({ isActive }) => `${styles.item} ${isActive ? styles.active : ""}`;

  return (
    <>
      <nav className={styles.bar} aria-label="Navigation principale">
        <NavLink to="/" end className={navClass}>
          <span className={styles.icon}>🏠</span>
          <span className={styles.label}>Accueil</span>
        </NavLink>

        <NavLink to="/catalogue" className={navClass}>
          <span className={styles.icon}>🚗</span>
          <span className={styles.label}>Catalogue</span>
        </NavLink>

        {/* Section OTHERS (activités : Quad, Surf, Montgolfière, Jetski, Jet
            privé, Bateau...) — remplace l'ancien onglet "❤️ Favoris" (déplacé
            dans le tableau de bord client, voir Dashboard.jsx). Ouvert à
            tous, parcourir le catalogue ne nécessite jamais de compte. */}
        <button className={styles.item} onClick={() => navigate("/catalogue?mode=Autres")}>
          <span className={styles.icon}>🎈</span>
          {/* Libellé abrégé : les 5 onglets se partagent la largeur à égalité
              (voir .item flex:1) — "Activités et Loisirs" en entier y
              passait sur 2 lignes, seul onglet plus haut que les autres. */}
          <span className={styles.label}>Loisirs</span>
        </button>

        <button
          className={styles.item}
          onClick={() => (isAuthenticated ? setChatOpen(true) : navigate("/login"))}
        >
          <span className={styles.icon}>
            💬
            {unreadTotal > 0 && <span className={styles.badge}>{unreadTotal > 9 ? "9+" : unreadTotal}</span>}
          </span>
          <span className={styles.label}>Chat</span>
        </button>

        <button className={styles.item} onClick={() => goAuthGated("/profile")}>
          <span className={styles.icon}>👤</span>
          <span className={styles.label}>Profil</span>
        </button>

        <button
          className={`${styles.item} ${moreOpen ? styles.active : ""}`}
          onClick={() => setMoreOpen((o) => !o)}
          aria-label="Plus d'options"
          aria-expanded={moreOpen}
        >
          <span className={styles.icon}>☰</span>
          <span className={styles.label}>Plus</span>
        </button>
      </nav>

      {moreOpen && (
        <div className={styles.overlay}>
          <div className={styles.sheet} ref={sheetRef}>
            <div className={styles.sheetHandle} />

            {isAuthenticated ? (
              <>
                {isAdmin && (
                  <button className={styles.sheetItem} onClick={() => { navigate("/admin"); setMoreOpen(false); }}>
                    ⚙️ Panel Admin
                  </button>
                )}
                {isPartner ? (
                  <>
                    <button className={styles.sheetItem} onClick={() => { navigate("/vendor"); setMoreOpen(false); }}>
                      📢 Publier
                    </button>
                    <button className={styles.sheetItem} onClick={() => { navigate("/vendor/dashboard"); setMoreOpen(false); }}>
                      🤝 Mon espace
                    </button>
                  </>
                ) : (
                  <>
                    <button className={styles.sheetItem} onClick={() => { navigate("/dashboard"); setMoreOpen(false); }}>
                      📊 Tableau de bord
                    </button>
                    <button className={styles.sheetItem} onClick={() => { navigate("/import-export/dashboard"); setMoreOpen(false); }}>
                      📦 Mes achats Import/Export
                    </button>
                  </>
                )}
                <button className={styles.sheetItem} onClick={() => { navigate("/help"); setMoreOpen(false); }}>
                  💬 Centre d'aide
                </button>
                <div className={styles.sheetDivider} />
                <button className={styles.sheetItem} onClick={() => { logout(); setMoreOpen(false); }}>
                  🚪 Déconnexion
                </button>
              </>
            ) : (
              <>
                <button className={styles.sheetItem} onClick={() => { navigate("/login"); setMoreOpen(false); }}>
                  🔑 Connexion
                </button>
                <button className={styles.sheetItem} onClick={() => { navigate("/register"); setMoreOpen(false); }}>
                  ✏️ Inscription
                </button>
                <button className={styles.sheetItem} onClick={() => { navigate("/help"); setMoreOpen(false); }}>
                  💬 Centre d'aide
                </button>
                <div className={styles.sheetDivider} />
                <button
                  className={`${styles.sheetItem} ${styles.sheetPartner}`}
                  onClick={() => { navigate("/register?role=partenaire"); setMoreOpen(false); }}
                >
                  🤝 Devenez partenaire
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
