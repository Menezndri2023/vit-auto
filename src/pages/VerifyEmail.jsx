import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import styles from "./Auth.module.css";

const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("loading"); // loading | success | error | missing
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("missing");
      return;
    }

    fetch(`/api/auth/verify-email/${token}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setStatus("success");
        } else {
          setStatus("error");
          setMessage(data.message || "Lien invalide ou expiré.");
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("Impossible de contacter le serveur. Réessayez plus tard.");
      });
  }, [searchParams]);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>🚗 VIT AUTO</div>

        {status === "loading" && (
          <>
            <h1 style={{ textAlign: "center", color: "#0f1b3f", margin: "0 0 8px" }}>Vérification en cours…</h1>
            <p style={{ textAlign: "center", color: "#64748b", margin: 0 }}>Un instant, nous vérifions votre lien.</p>
            <div style={{ textAlign: "center", marginTop: "24px", fontSize: "2rem" }}>⏳</div>
          </>
        )}

        {status === "success" && (
          <>
            <div style={{ fontSize: "3rem", marginBottom: "12px", textAlign: "center" }}>✅</div>
            <h1 style={{ textAlign: "center", color: "#0f1b3f", margin: "0 0 12px" }}>E-mail vérifié !</h1>
            <p style={{ textAlign: "center", color: "#64748b", margin: 0 }}>
              Votre adresse e-mail a été confirmée avec succès. Vous pouvez maintenant
              vous connecter et profiter de tous les services VIT AUTO.
            </p>
            <Link to="/login" className={styles.submitBtn} style={{ display: "block", textAlign: "center", marginTop: "24px", textDecoration: "none" }}>
              Se connecter
            </Link>
          </>
        )}

        {status === "error" && (
          <>
            <div style={{ fontSize: "3rem", marginBottom: "12px", textAlign: "center" }}>❌</div>
            <h1 style={{ textAlign: "center", color: "#0f1b3f", margin: "0 0 12px" }}>Lien invalide</h1>
            <p style={{ textAlign: "center", color: "#64748b", margin: "0 0 8px" }}>{message}</p>
            <p style={{ textAlign: "center", color: "#64748b", margin: 0 }}>
              Si votre lien a expiré, vous pouvez en demander un nouveau depuis la page de connexion.
            </p>
            <Link to="/login" className={styles.submitBtn} style={{ display: "block", textAlign: "center", marginTop: "24px", textDecoration: "none" }}>
              Retour à la connexion
            </Link>
          </>
        )}

        {status === "missing" && (
          <>
            <div style={{ fontSize: "3rem", marginBottom: "12px", textAlign: "center" }}>⚠️</div>
            <h1 style={{ textAlign: "center", color: "#0f1b3f", margin: "0 0 12px" }}>Lien manquant</h1>
            <p style={{ textAlign: "center", color: "#64748b", margin: 0 }}>
              Ce lien de vérification est incomplet. Cliquez sur le lien exact reçu par e-mail.
            </p>
            <Link to="/" className={styles.submitBtn} style={{ display: "block", textAlign: "center", marginTop: "24px", textDecoration: "none" }}>
              Retour à l'accueil
            </Link>
          </>
        )}
      </div>
    </div>
  );
};

export default VerifyEmail;
