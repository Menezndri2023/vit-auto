import { GoogleLogin } from "@react-oauth/google";
import styles from "./GoogleAuthButton.module.css";

// Se masque tant que VITE_GOOGLE_CLIENT_ID n'est pas configuré — évite un
// bouton cassé avant la création du Client ID sur Google Cloud Console (voir
// server/.env.example GOOGLE_OAUTH_CLIENT_ID pour la contrepartie serveur).
const GoogleAuthButton = ({ onCredential, disabled = false, disabledHint }) => {
  if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) return null;

  return (
    <div className={styles.wrap}>
      <div className={disabled ? styles.disabled : ""}>
        <GoogleLogin
          onSuccess={(res) => onCredential(res.credential)}
          onError={() => onCredential(null)}
          width="100%"
          text="continue_with"
          locale="fr"
        />
      </div>
      {disabled && disabledHint && <p className={styles.hint}>{disabledHint}</p>}
    </div>
  );
};

export default GoogleAuthButton;
