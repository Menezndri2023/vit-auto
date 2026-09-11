import { useEffect, useState, useRef } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { resolveRequirements } from "../utils/partnerRequirements";
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
          // La destination dépend du couple activité/type de compte choisi à
          // l'inscription (voir Register.jsx et src/utils/partnerRequirements.js) —
          // un particulier loueur/vendeur/exportateur n'a besoin que du KYC
          // identité, pas du wizard Founding Partner complet.
          const target = data.user?.role === "partenaire"
            ? resolveRequirements({ activity: data.user.activity, entityType: data.user.entityType }).postRegistrationRedirect
            : "/dashboard";
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
        {/* Quatre états pour un même écran : ils partagent désormais la même
            structure (icône, titre, explication, action) au lieu de quatre
            empilements de styles en ligne légèrement différents. */}
        {status === "loading" && (
          <div className={styles.statut}>
            <div className={styles.statutIcone}>⏳</div>
            <h1 className={styles.statutTitre}>Vérification en cours…</h1>
            <p className={styles.statutTexte}>Un instant, nous vérifions votre lien.</p>
          </div>
        )}

        {status === "success" && (
          <div className={styles.statut}>
            <div className={styles.statutIcone}>✅</div>
            <h1 className={styles.statutTitre}>Vérification réussie !</h1>
            <p className={styles.statutTexte}>
              {dest.startsWith("/kyc")
                ? "Votre adresse e-mail a été confirmée. Redirection vers la vérification d'identité (KYC), nécessaire avant de publier…"
                : "Votre adresse e-mail a été confirmée. Redirection vers votre espace…"}
            </p>
            <Link to={dest} className={`${styles.submitBtn} ${styles.btnLien}`}>
              {dest.startsWith("/kyc")
                ? "Continuer vers la vérification d'identité →"
                : "Accéder à mon espace →"}
            </Link>
          </div>
        )}

        {status === "error" && (
          <div className={styles.statut}>
            <div className={styles.statutIcone}>❌</div>
            <h1 className={styles.statutTitre}>Lien invalide</h1>
            <p className={styles.statutTexte}>{message}</p>
            <p className={styles.statutTexte}>
              Si votre lien a expiré, vous pouvez en demander un nouveau depuis la page de connexion.
            </p>
            <Link to="/login" className={`${styles.submitBtn} ${styles.btnLien}`}>
              Retour à la connexion
            </Link>
          </div>
        )}

        {status === "missing" && (
          <div className={styles.statut}>
            <div className={styles.statutIcone}>⚠️</div>
            <h1 className={styles.statutTitre}>Lien manquant</h1>
            <p className={styles.statutTexte}>
              Ce lien de vérification est incomplet. Cliquez sur le lien exact reçu par e-mail.
            </p>
            <Link to="/" className={`${styles.submitBtn} ${styles.btnLien}`}>
              Retour à l'accueil
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default VerifyEmail;
