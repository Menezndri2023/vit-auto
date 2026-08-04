import { useState, useEffect, useRef } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
import NotificationBell from "../NotificationBell/NotificationBell";
import LanguageSelector from "../LanguageSelector/LanguageSelector";
import VitAutoLogo from "../Logo/VitAutoLogo";
import { ACTIVITY_TYPES, ACTIVITY_TYPE_LABELS, ACTIVITY_TYPE_ICONS } from "../../constants/activityTypes";
import styles from "./Navbar.module.css";

const Navbar = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();
  const { count: cartCount } = useCart();
  const [menuOpen, setMenuOpen]       = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  // Section OTHERS (activités culturelles/loisir — Quad, Surf, Montgolfière,
  // Jetski, Jet privé, Bateau...) — remplace l'ancien lien navbar "❤️
  // Favoris" (déplacé dans le tableau de bord client, voir Dashboard.jsx).
  const [activitiesOpen, setActivitiesOpen] = useState(false);
  const activitiesRef = useRef(null);

  const isPartner = user?.role === "partenaire" || user?.role === "admin";
  const isAdmin   = user?.role === "admin";

  const navLink = ({ isActive }) => isActive ? styles.active : undefined;

  // Fermer le dropdown si clic en dehors
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  useEffect(() => {
    const handleClick = (e) => {
      if (activitiesRef.current && !activitiesRef.current.contains(e.target)) {
        setActivitiesOpen(false);
      }
    };
    const handleEscape = (e) => { if (e.key === "Escape") setActivitiesOpen(false); };
    if (activitiesOpen) {
      document.addEventListener("mousedown", handleClick);
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [activitiesOpen]);

  const goToActivity = (activityType) => {
    setActivitiesOpen(false);
    setMenuOpen(false);
    const params = new URLSearchParams({ mode: "Autres" });
    if (activityType) params.set("activityType", activityType);
    navigate(`/catalogue?${params.toString()}`);
  };

  return (
    <nav className={styles.navbar}>
      {/* Logo */}
      <div className={styles.logo} onClick={() => navigate("/")} style={{ cursor: "pointer" }}>
        <VitAutoLogo iconSize={40} variant="white" showText tagline={false} />
      </div>

      {/* Liens principaux */}
      <ul className={`${styles.navLinks} ${menuOpen ? styles.navOpen : ""}`}>
        <li><NavLink to="/" end className={navLink} onClick={() => setMenuOpen(false)}>Accueil</NavLink></li>
        <li><NavLink to="/catalogue" className={navLink} onClick={() => setMenuOpen(false)}>Catalogue</NavLink></li>

        {/* Page Services uniquement pour non connectés */}
        {!isAuthenticated && (
          <li><NavLink to="/services" className={navLink} onClick={() => setMenuOpen(false)}>Services</NavLink></li>
        )}

        {/* Liens visibles uniquement par les partenaires */}
        {isPartner && (
          <>
            {/* end = exact match /vendor seulement, pas /vendor/dashboard */}
            <li><NavLink to="/vendor" end className={navLink} onClick={() => setMenuOpen(false)}>Publier</NavLink></li>
            <li><NavLink to="/vendor/dashboard" className={navLink} onClick={() => setMenuOpen(false)}>Mon espace</NavLink></li>
          </>
        )}

        {isAdmin && (
          <li>
            <NavLink to="/admin" onClick={() => setMenuOpen(false)}
              style={({ isActive }) => ({
                background: isActive ? "#0f1b3f" : "linear-gradient(135deg,#0f1b3f,#1e40af)",
                color: "#fff",
                border: "none",
                borderRadius: "0.5rem",
                padding: "0.35rem 1rem",
                fontWeight: 800,
                fontSize: "0.82rem",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                boxShadow: "0 2px 8px rgba(15,27,63,0.25)",
                letterSpacing: "0.02em",
              })}>
              ⚙️ Panel Admin
            </NavLink>
          </li>
        )}

        {/* Tableau de bord : clients uniquement */}
        {isAuthenticated && !isPartner && (
          <li><NavLink to="/dashboard" className={navLink} onClick={() => setMenuOpen(false)}>Tableau de bord</NavLink></li>
        )}

        {/* Section OTHERS — activités culturelles/loisir, ouverte à tous
            (pas de garde isAuthenticated : parcourir le catalogue ne
            nécessite jamais de compte, voir Catalogue.jsx). */}
        <li className={styles.activitiesDropdownWrapper} ref={activitiesRef}>
          <button
            type="button"
            className={`${styles.activitiesTrigger} ${activitiesOpen ? styles.activitiesTriggerOpen : ""}`}
            onClick={() => setActivitiesOpen((o) => !o)}
          >
            🎈 Autres
          </button>
          {activitiesOpen && (
            <>
              {/* Toile de fond : commence sous la navbar (jamais par-dessus),
                  qui reste donc pleinement visible et utilisable — rend
                  explicite que c'est un état d'overlay volontaire plutôt
                  qu'un panneau qui cache le reste du site sans raison. */}
              <div className={styles.activitiesBackdrop} onClick={() => setActivitiesOpen(false)} />
              <div className={styles.activitiesMenu}>
                <div className={styles.activitiesMenuHeader}>
                  <span className={styles.activitiesMenuTitle}>🎈 Activités & sorties</span>
                  <button className={styles.activitiesMenuAll} onClick={() => goToActivity(null)}>
                    Toutes les activités →
                  </button>
                </div>
                <div className={styles.activitiesGrid}>
                  {ACTIVITY_TYPES.filter((t) => t !== "AUTRE").map((t) => (
                    <button key={t} className={styles.activitiesGridItem} onClick={() => goToActivity(t)}>
                      <span className={styles.activitiesGridIcon}>{ACTIVITY_TYPE_ICONS[t] || "🎟️"}</span>
                      <span>{ACTIVITY_TYPE_LABELS[t] || t}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </li>

        {isAuthenticated && !isPartner && (
          <li>
            <NavLink to="/cart" className={navLink} onClick={() => setMenuOpen(false)}>
              🛒 Panier{cartCount > 0 ? ` (${cartCount})` : ""}
            </NavLink>
          </li>
        )}

        {/* Suivi des achats Import/Export (escrow, inspection, livraison) — jusqu'ici
            accessible uniquement en tapant l'URL ou depuis une transaction déjà
            ouverte, aucun lien de menu n'y menait. */}
        {isAuthenticated && !isPartner && (
          <li><NavLink to="/import-export/dashboard" className={navLink} onClick={() => setMenuOpen(false)}>📦 Mes achats Import/Export</NavLink></li>
        )}

        {/* ── Éléments additionnels dans le menu mobile (non connectés) ── */}
        {!isAuthenticated && (
          <>
            <li className={styles.mobileDivider} />
            <li className={styles.mobileOnly}>
              <NavLink to="/login"    className={navLink} onClick={() => setMenuOpen(false)}>Connexion</NavLink>
            </li>
            <li className={styles.mobileOnly}>
              <NavLink to="/register" className={navLink} onClick={() => setMenuOpen(false)}>Inscription</NavLink>
            </li>
            <li className={styles.mobileOnly}>
              <NavLink to="/help"     className={navLink} onClick={() => setMenuOpen(false)}>Centre d'aide</NavLink>
            </li>
            <li className={`${styles.mobileOnly} ${styles.mobilePartner}`}>
              <NavLink to="/register?role=partenaire" className={navLink} onClick={() => setMenuOpen(false)}>Devenez partenaire</NavLink>
            </li>
          </>
        )}
      </ul>

      {/* Partie droite */}
      <div className={styles.navRight}>
        {/* Sélecteur de langue — toujours visible */}
        <LanguageSelector />

        {isAuthenticated ? (
          <>
            <NotificationBell />
            <button
              className={isPartner ? styles.badgePartner : styles.userBadge}
              onClick={() => navigate("/profile")}
              title="Voir mon profil"
              style={{ cursor: "pointer", fontFamily: "inherit" }}
            >
              {isPartner ? "🤝 " : "👤 "}
              {user?.firstName || user?.email}
            </button>
            <button className={styles.linkBtn} onClick={logout}>Déconnexion</button>
          </>
        ) : (
          /* Dropdown burger (desktop uniquement) */
          <div className={styles.burgerDropdownWrapper} ref={dropdownRef}>
            <button
              className={`${styles.dropdownTrigger} ${dropdownOpen ? styles.dropdownTriggerOpen : ""}`}
              onClick={() => setDropdownOpen((o) => !o)}
              aria-label="Menu utilisateur"
            >
              <span className={styles.dropdownLines}>
                <span /><span /><span />
              </span>
              <span className={styles.dropdownLabel}>Menu</span>
            </button>

            {dropdownOpen && (
              <div className={styles.dropdownMenu}>
                <button onClick={() => { navigate("/login");    setDropdownOpen(false); }}>
                  <span className={styles.diIcon}>🔑</span> Connexion
                </button>
                <button onClick={() => { navigate("/register"); setDropdownOpen(false); }}>
                  <span className={styles.diIcon}>✏️</span> Inscription
                </button>

                <div className={styles.dropdownDivider} />

                <button onClick={() => { navigate("/help");     setDropdownOpen(false); }}>
                  <span className={styles.diIcon}>💬</span> Centre d'aide
                </button>
                <button
                  className={styles.partnerItem}
                  onClick={() => { navigate("/register?role=partenaire"); setDropdownOpen(false); }}
                >
                  <span className={styles.diIcon}>🤝</span> Devenez partenaire
                </button>
              </div>
            )}
          </div>
        )}

        {/* Burger mobile (toggle des navLinks) */}
        <button
          className={`${styles.burger} ${menuOpen ? styles.burgerOpen : ""}`}
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Navigation"
        >
          <span /><span /><span />
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
