import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import styles from "./Profile.module.css";

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
  });

  const handleChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      error("Les mots de passe ne correspondent pas.");
      return;
    }
    if (!form.email || !form.password || !form.firstName || !form.lastName) {
      error("Veuillez remplir tous les champs obligatoires.");
      return;
    }

    try {
      await register({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        password: form.password,
      });
      success("Inscription réussie ! Redirection...");
      setTimeout(() => navigate("/dashboard"), 1500);
    } catch (err) {
      error(err.message || "Impossible de s'inscrire.");
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.centerContainer}>
        <h1>Créer un compte</h1>
        <form className={styles.form} onSubmit={onSubmit}>
          <div className={styles.row}>
            <input name="firstName" value={form.firstName} onChange={handleChange} placeholder="Prénom" required />
            <input name="lastName" value={form.lastName} onChange={handleChange} placeholder="Nom" required />
          </div>
          <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="Email" required />
          <input type="tel" name="phone" value={form.phone} onChange={handleChange} placeholder="Téléphone" />
          <div className={styles.row}>
            <input type="password" name="password" value={form.password} onChange={handleChange} placeholder="Mot de passe" required />
            <input type="password" name="confirmPassword" value={form.confirmPassword} onChange={handleChange} placeholder="Confirmer le mot de passe" required />
          </div>
          <button type="submit" className={styles.primaryBtn}>S'inscrire</button>
        </form>
      </div>
    </div>
  );
};

export default Register;
