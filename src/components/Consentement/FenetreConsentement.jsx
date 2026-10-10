import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useI18n } from "../../context/I18nContext";
import styles from "./FenetreConsentement.module.css";

// Consentements exprès (dossier CNDP, 2026-10-10) : un compte créé avant leur
// mise en place — ou par Google depuis la page de connexion — les donne ici,
// une fois. Le serveur dit si le compte est à jour (`consentementAJour`) ; on
// n'ouvre la fenêtre que sur un `false` explicite.
const PAGES_LEGALES = ["/privacy", "/cgu", "/cgv", "/mentions-legales", "/conditions-partenaires"];

export default function FenetreConsentement() {
  const { user, token, updateUser, logout } = useAuth();
  const { t } = useI18n();
  const [cgu, setCgu] = useState(false);
  const [transfert, setTransfert] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const { pathname } = useLocation();

  if (!user || !token || user.consentementAJour !== false) return null;
  // Les textes à accepter doivent rester lisibles : jamais de fenêtre par-dessus.
  if (PAGES_LEGALES.includes(pathname)) return null;

  const valider = async (e) => {
    e.preventDefault();
    if (!cgu || !transfert) { setErreur(t("consent.required")); return; }
    setEnvoi(true); setErreur("");
    try {
      const r = await fetch("/api/users/me/consentements", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ consentements: { cgu, transfert } }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || t("consent.required"));
      updateUser({ ...user, consentementAJour: true });
    } catch (err) { setErreur(err.message); } finally { setEnvoi(false); }
  };

  return (
    <div className={styles.fond} role="dialog" aria-modal="true" aria-labelledby="consent-titre">
      <form className={styles.fenetre} onSubmit={valider}>
        <h2 id="consent-titre">{t("consent.title")}</h2>
        <p>{t("consent.intro")}</p>
        <label className={styles.ligne}>
          <input type="checkbox" checked={cgu} onChange={(e) => setCgu(e.target.checked)} />
          <span>{t("consent.cgu")}</span>
        </label>
        <label className={styles.ligne}>
          <input type="checkbox" checked={transfert} onChange={(e) => setTransfert(e.target.checked)} />
          <span>{t("consent.transfert")}</span>
        </label>
        <Link to="/privacy" className={styles.lien}>{t("consent.links")}</Link>
        {erreur && <p className={styles.erreur} role="alert">{erreur}</p>}
        <button type="submit" className={styles.bouton} disabled={envoi || !cgu || !transfert}>{t("consent.btn")}</button>
        <button type="button" className={styles.secondaire} onClick={logout}>{t("consent.logout")}</button>
      </form>
    </div>
  );
}
