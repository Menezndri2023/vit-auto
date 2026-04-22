import { useState, useEffect, useRef } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import styles from "./Navbar.module.css";

const Navbar = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();
  const [menuOpen, setMenuOpen]       = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

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

  return (
    <nav className={styles.navbar}>
      {/* Logo */}
      <div className={styles.logo} onClick={() => navigate("/")} style={{ cursor: "pointer" }}>
        VIT AUTO
      </div>

      {/* Liens principaux */}
      <ul className={`${styles.navLinks} ${menuOpen ? styles.navOpen : ""}`}>
        <li><NavLink to="/"          className={navLink} onClick={() => setMenuOpen(false)}>Accueil</NavLink></li>
        <li><NavLink to="/catalogue" className={navLink} onClick={() => setMenuOpen(false)}>Catalogue</NavLink></li>

        {/* Page Services uniquement pour non connectés */}
        {!isAuthenticated && (
          <li><NavLink to="/services" className={navLink} onClick={() => setMenuOpen(false)}>Services</NavLink></li>
        )}

        {/* Liens visibles uniquement par les partenaires */}
        {isPartner && (
          <>
            <li><NavLink to="/vendor"           className={navLink} onClick={() => setMenuOpen(false)}>Publier</NavLink></li>
            <li><NavLink to="/vendor/dashboard" className={navLink} onClick={() => setMenuOpen(false)}>Mon espace</NavLink></li>
            <li><NavLink to="/plans"            className={navLink} onClick={() => setMenuOpen(false)}>Tarifs</NavLink></li>
          </>
        )}

        {isAdmin && (
          <li><NavLink to="/admin" className={navLink} onClick={() => setMenuOpen(false)}>Admin</NavLink></li>
        )}

        {/* Tableau de bord : uniquement pour les clients */}
        {isAuthenticated && !isPartner && (
          <li><NavLink to="/dashboard" className={navLink} onClick={() => setMenuOpen(false)}>Tableau de bord</NavLink></li>
        )}

        {isAuthenticated && (
          <li><NavLink to="/profile" className={navLink} onClick={() => setMenuOpen(false)}>Profil</NavLink></li>
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
              <NavLink to="/register" className={navLink} onClick={() => setMenuOpen(false)}>Devenez partenaire</NavLink>
            </li>
          </>
        )}
      </ul>

      {/* Partie droite */}
      <div className={styles.navRight}>
        {isAuthenticated ? (
          <>
            <span className={isPartner ? styles.badgePartner : styles.userBadge}>
              {isPartner ? "🤝 " : "👤 "}
              {user?.firstName || user?.email}
            </span>
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
                  onClick={() => { navigate("/register"); setDropdownOpen(false); }}
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
