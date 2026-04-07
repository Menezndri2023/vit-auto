import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import styles from "./Auth.module.css";

const Login = () => {
  const { login } = useAuth();
  const { success, error } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });

  const handleChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      error("Veuillez remplir tous les champs.");
      return;
    }
    try {
      await login({ email: form.email, password: form.password });
      success("Connexion réussie ! Redirection...");
      setTimeout(() => navigate("/dashboard"), 1500);
    } catch (err) {
      error(err.message || "Identifiants incorrects.");
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>🚗</div>
          <h1>VIT AUTO</h1>
          <p>Connectez-vous à votre espace</p>
        </div>

        <form className={styles.form} onSubmit={onSubmit}>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            placeholder="Adresse e-mail"
            required
          />
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            placeholder="Mot de passe"
            required
            minLength="6"
          />
          <button type="submit" className={styles.submitBtn}>
            Se connecter
          </button>
          <div className={styles.footerLink}>
            <span>Pas encore de compte ? </span>
            <Link to="/register">Créer un compte</Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
