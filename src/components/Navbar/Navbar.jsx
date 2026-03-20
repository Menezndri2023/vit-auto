import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import styles from "./Navbar.module.css";

const Navbar = () => {
  const navigate = useNavigate();

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
      </div>
    </nav>
  );
};

export default Navbar;