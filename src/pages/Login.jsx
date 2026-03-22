import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import styles from "./Profile.module.css";

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
      success("Connexion réussie !");
      setTimeout(() => navigate("/dashboard"), 1500);
    } catch (err) {
      error(err.message || "Identifiants incorrects.");
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.centerContainer}>
        <h1>Connexion</h1>
        <form className={styles.form} onSubmit={onSubmit}>
          <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="Email" required />
          <input type="password" name="password" value={form.password} onChange={handleChange} placeholder="Mot de passe" required />
          <button type="submit" className={styles.primaryBtn}>Se connecter</button>
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
