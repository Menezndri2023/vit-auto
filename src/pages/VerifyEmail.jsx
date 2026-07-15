import { useEffect, useState, useRef } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import styles from "./Auth.module.css";

const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const [status, setStatus] = useState("loading"); // loading | success | error | missing
  const [message, setMessage] = useState("");
  const [dest, setDest] = useState("/dashboard");
  const ranOnce = useRef(false);

  useEffect(() => {
    if (ranOnce.current) return;
    ranOnce.current = true;

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
          // Connexion automatique : l'utilisateur arrive directement sur son espace,
          // vérifié, sans avoir à ressaisir ses identifiants.
          if (data.user && data.token) {
            setSession(data.user, data.token);
          }
          // Comptes partenaires "entreprise/professionnel" : direction le programme
          // Founding Partner pour renseigner les informations entreprise, une fois
          // l'e-mail confirmé (jusqu'ici seule une inscription via ?plan=fondateur
          // y menait, et avant même la vérification — voir Register.jsx). Un
          // partenaire "particulier" n'a rien à faire dans ce programme pensé pour
          // des sociétés (RCCM, IBAN, export...) : direction directe la publication
          // d'annonce, où seule une vérification d'identité KYC lui sera demandée
          // (voir vehicleController.js createVehicle).
          let target = "/dashboard";
          if (data.user?.role === "partenaire") {
            target = data.user.sellerType === "particulier" ? "/vendor" : "/partner-onboarding";
          }
          setDest(target);
          setTimeout(() => navigate(target), 1800);
        } else {
          setStatus("error");
          setMessage(data.message || "Lien invalide ou expiré.");
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("Impossible de contacter le serveur. Réessayez plus tard.");
      });
  }, [searchParams, navigate, setSession]);

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
            <h1 style={{ textAlign: "center", color: "#0f1b3f", margin: "0 0 12px" }}>Vérification réussie !</h1>
            <p style={{ textAlign: "center", color: "#64748b", margin: 0 }}>
              {dest === "/partner-onboarding"
                ? "Votre adresse e-mail a été confirmée. Redirection vers le programme Founding Partner pour renseigner les informations de votre entreprise…"
                : dest === "/vendor"
                ? "Votre adresse e-mail a été confirmée. Redirection vers la publication de votre première annonce…"
                : "Votre adresse e-mail a été confirmée. Redirection vers votre espace…"}
            </p>
            <Link to={dest} className={styles.submitBtn} style={{ display: "block", textAlign: "center", marginTop: "24px", textDecoration: "none" }}>
              {dest === "/partner-onboarding"
                ? "Continuer vers le programme Founding Partner →"
                : dest === "/vendor"
                ? "Publier mon annonce →"
                : "Accéder à mon espace →"}
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
