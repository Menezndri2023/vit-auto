import { useEffect, useRef, useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import styles from "./GoogleAuthButton.module.css";

// Se masque tant que VITE_GOOGLE_CLIENT_ID n'est pas configuré — évite un
// bouton cassé avant la création du Client ID sur Google Cloud Console (voir
// server/.env.example GOOGLE_OAUTH_CLIENT_ID pour la contrepartie serveur).
// `onDisabledClick` : le bouton grisé avale le clic (pointer-events: none sur
// la couche interne), l'utilisateur ne comprenait pas pourquoi rien ne se
// passait. Le conteneur, lui, reçoit le clic et peut amener au champ qui
// manque.
//
// Largeur : Google n'accepte qu'un nombre de pixels (400 au plus), jamais
// « 100% » — le bouton restait à ~210 px, étroit et décentré sous les champs
// pleine largeur du formulaire. On mesure le conteneur et on suit ses
// changements (rotation du téléphone).
const LARGEUR_MAX_GOOGLE = 400;

const GoogleAuthButton = ({ onCredential, disabled = false, disabledHint, onDisabledClick }) => {
  const conteneur = useRef(null);
  const [largeur, setLargeur] = useState(0);

  useEffect(() => {
    const el = conteneur.current;
    if (!el) return undefined;
    const mesurer = () => setLargeur(Math.min(LARGEUR_MAX_GOOGLE, Math.floor(el.getBoundingClientRect().width)));
    mesurer();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) return null;

  return (
    <div className={styles.wrap} ref={conteneur} onClick={disabled && onDisabledClick ? onDisabledClick : undefined}>
      <div className={disabled ? styles.disabled : styles.inner}>
        {largeur > 0 && (
          <GoogleLogin
            onSuccess={(res) => onCredential(res.credential)}
            onError={() => onCredential(null)}
            width={String(largeur)}
            size="large"
            text="continue_with"
            locale="fr"
          />
        )}
      </div>
      {disabled && disabledHint && <p className={styles.hint}>{disabledHint}</p>}
    </div>
  );
};

export default GoogleAuthButton;
