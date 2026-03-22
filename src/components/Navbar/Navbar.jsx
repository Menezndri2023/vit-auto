import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import styles from "./Navbar.module.css";

const Navbar = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <nav className={styles.navbar}>
      <div className={styles.logo}>🚘</div>

      <ul className={styles.navLinks}>
        <li>
          <NavLink to="/" className={({ isActive }) => (isActive ? styles.active : undefined)}>
            Accueil
          </NavLink>
        </li>
        <li>
          <NavLink to="/catalogue" className={({ isActive }) => (isActive ? styles.active : undefined)}>
            Catalogue
          </NavLink>
        </li>
        <li>
          <NavLink to="/vendor" className={({ isActive }) => (isActive ? styles.active : undefined)}>
            Publier
          </NavLink>
        </li>
        {isAuthenticated && (
          <li>
            <NavLink to="/vendor/dashboard" className={({ isActive }) => (isActive ? styles.active : undefined)}>
              Mon espace vendeur
            </NavLink>
          </li>
        )}
        {user?.role === "admin" && (
          <li>
            <NavLink to="/admin" className={({ isActive }) => (isActive ? styles.active : undefined)}>
              Admin
            </NavLink>
          </li>
        )}
        <li>
          <NavLink to="/dashboard" className={({ isActive }) => (isActive ? styles.active : undefined)}>
            Tableau de bord
          </NavLink>
        </li>
        <li>
          <NavLink to="/profile" className={({ isActive }) => (isActive ? styles.active : undefined)}>
            Profil
          </NavLink>
        </li>
      </ul>

      <div className={styles.navRight}>
        <span className={styles.location}>📍 Paris, France</span>
        <button className={styles.ctaBtn} onClick={() => navigate("/catalogue")}>Trouver un véhicule</button>
        {isAuthenticated ? (
          <>
            <span className={styles.userBadge}>Bonjour, {user?.firstName || user?.email}</span>
            <button className={styles.linkBtn} onClick={logout}>Déconnexion</button>
          </>
        ) : (
          <>
            <button className={styles.linkBtn} onClick={() => navigate("/login")}>Connexion</button>
            <button className={styles.ctaBtn} onClick={() => navigate("/register")}>Inscription</button>
          </>
        )}
      </div>
    </nav>
  );
};

export default Navbar;