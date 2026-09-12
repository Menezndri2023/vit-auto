import { useState, useEffect, useRef } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
import NotificationBell from "../NotificationBell/NotificationBell";
import LanguageSelector from "../LanguageSelector/LanguageSelector";
import VitAutoLogo from "../Logo/VitAutoLogo";
import styles from "./Navbar.module.css";

const Navbar = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();
  const { count: cartCount } = useCart();
  const [menuOpen, setMenuOpen]       = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const menuRef = useRef(null);
  const isPartner = user?.role === "partenaire" || user?.role === "admin";
  const isAdmin   = user?.role === "admin";

  const navLink = ({ isActive }) => isActive ? styles.active : undefined;

  // Menu mobile (burger) : se ferme à Échap ou au toucher hors du menu — il
  // restait ouvert tant qu'on ne cliquait pas un lien ou la croix.
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    const handleEscape = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchstart", handleClick, { passive: true });
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

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
    <nav className={styles.navbar} ref={menuRef}>
      {/* Logo */}
      <div className={styles.logo} onClick={() => navigate("/")} style={{ cursor: "pointer" }}>
        <VitAutoLogo iconSize={40} variant="white" showText tagline={false} />
      </div>

      {/* Liens principaux — sur mobile, c'est le menu ouvert par le burger */}
      <ul id="navigation-principale" className={`${styles.navLinks} ${menuOpen ? styles.navOpen : ""}`}>
        <li><NavLink to="/" end className={navLink} onClick={() => setMenuOpen(false)}>Accueil</NavLink></li>
        <li><NavLink to="/catalogue" className={navLink} onClick={() => setMenuOpen(false)}>Catalogue</NavLink></li>

        {/* Import/Export N'EST PAS ici, volontairement. Elle y a figuré
            brièvement — au motif qu'elle n'était accessible que par le pied de
            page — puis a été retirée : le catalogue porte déjà un mode
            Import/Export, et un second point d'entrée dans la barre principale
            encombrait la navigation sans rien ouvrir de neuf. L'accès reste
            assuré par le catalogue et par le pied de page, mieux structuré.
            Une barre de navigation se juge à ce qu'on en retire. */}

        {/* Services (assurance, financement, transport…) : réservé jusqu'ici
            aux visiteurs NON connectés, ce qui revenait à le retirer du menu
            au moment précis où le client devient susceptible d'y souscrire. */}
        <li><NavLink to="/services" className={navLink} onClick={() => setMenuOpen(false)}>Services</NavLink></li>

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
          <li><NavLink to="/import-export/dashboard" className={navLink} onClick={() => setMenuOpen(false)}>📦 Mes achats</NavLink></li>
        )}

        {/* ── Menu mobile, connecté : profil, aide, déconnexion — le badge
            profil et « Déconnexion » de la barre sont masqués sous 900 px,
            le menu burger doit donc les porter lui-même (cohérence avec le
            menu non connecté ci-dessous). ── */}
        {isAuthenticated && (
          <>
            <li className={styles.mobileDivider} />
            <li className={styles.mobileOnly}>
              <NavLink to="/profile" className={navLink} onClick={() => setMenuOpen(false)}>
                {isPartner ? "🤝" : "👤"} Mon profil{user?.firstName ? ` · ${user.firstName}` : ""}
              </NavLink>
            </li>
            <li className={styles.mobileOnly}>
              <NavLink to="/help" className={navLink} onClick={() => setMenuOpen(false)}>Centre d'aide</NavLink>
            </li>
            <li className={styles.mobileOnly}>
              <a href="/" className={styles.mobileLogout} onClick={(e) => { e.preventDefault(); setMenuOpen(false); logout(); }}>Déconnexion</a>
            </li>
          </>
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
            {/* PAS de bouton d'aide ici. Il y a figuré brièvement — au motif
                qu'un client connecté n'avait plus d'accès au support depuis le
                menu — puis a été retiré : la barre de navigation n'est pas un
                fourre-tout, et le support reste joignable par le pied de page,
                la page Aide et le chat. Une barre se juge à ce qu'on en
                retire. */}
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
          aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={menuOpen}
          aria-controls="navigation-principale"
        >
          <span /><span /><span />
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
