import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import styles from "./Auth.module.css";

const Register = () => {
  const { register } = useAuth();
  const { success, error } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    role: "client",
  });

  const handleChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password || !form.firstName || !form.lastName) {
      error("Veuillez remplir tous les champs obligatoires.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      error("Les mots de passe ne correspondent pas.");
      return;
    }
    try {
      await register(form);
      success("Inscription réussie ! Redirection...");
      setTimeout(() => navigate("/dashboard"), 1500);
    } catch (err) {
      error(err.message || "Impossible de s'inscrire.");
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>🚗</div>
          <h1>VIT AUTO</h1>
          <p>Créez votre compte gratuitement</p>
        </div>

        <form className={styles.form} onSubmit={onSubmit}>
          <div className={styles.row}>
            <input
              name="firstName"
              value={form.firstName}
              onChange={handleChange}
              placeholder="Prénom *"
              required
            />
            <input
              name="lastName"
              value={form.lastName}
              onChange={handleChange}
              placeholder="Nom *"
              required
            />
          </div>

          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            placeholder="Adresse e-mail *"
            required
          />

          <input
            type="tel"
            name="phone"
            value={form.phone}
            onChange={handleChange}
            placeholder="Téléphone (ex : +221 77 000 00 00)"
          />

          <select name="role" value={form.role} onChange={handleChange}>
            <option value="client">🧑 Client — Louer des véhicules</option>
            <option value="partenaire">🤝 Partenaire — Publier des annonces</option>
          </select>

          <div className={styles.row}>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="Mot de passe *"
              required
              minLength="6"
            />
            <input
              type="password"
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={handleChange}
              placeholder="Confirmer *"
              required
            />
          </div>

          <button type="submit" className={styles.submitBtn}>
            Créer mon compte
          </button>

          <div className={styles.footerLink}>
            <span>Déjà un compte ? </span>
            <Link to="/login">Se connecter</Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Register;
