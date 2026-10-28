import { useEffect, useState } from "react";
import { useI18n } from "../../context/I18nContext";
import ReportButton from "../ReportButton/ReportButton";
import styles from "./AvisRessource.module.css";

// Avis publics d'une ressource (activité, pièce…) — GET /api/reviews, les
// mêmes avis modérés que la fiche véhicule. Uniquement de vrais avis laissés
// après une réservation terminée ; jamais d'avis d'exemple.
export default function AvisRessource({ targetType, targetId }) {
  const { t } = useI18n();
  const [etat, setEtat] = useState({ chargement: true, avis: [], moyenne: 0 });

  useEffect(() => {
    if (!targetId) return undefined;
    const ctrl = new AbortController();
    fetch(`/api/reviews?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setEtat({ chargement: false, avis: d?.reviews || [], moyenne: d?.noteMoyenne || 0 }))
      .catch((e) => { if (e.name !== "AbortError") setEtat({ chargement: false, avis: [], moyenne: 0 }); });
    return () => ctrl.abort();
  }, [targetType, targetId]);

  if (etat.chargement) return null;

  return (
    <section className={styles.bloc} aria-labelledby={`avis-${targetId}`}>
      <h2 id={`avis-${targetId}`} className={styles.titre}>
        {t("vd.reviews")} {etat.avis.length > 0 && <>({etat.avis.length})<span className={styles.moyenne}>★ {etat.moyenne}</span></>}
      </h2>
      {etat.avis.length === 0 ? <p className={styles.vide}>{t("vd.noReviews")}</p> : (
        <ul className={styles.liste}>
          {etat.avis.map((rv) => (
            <li key={rv._id} className={styles.item}>
              <div className={styles.entete}>
                <span className={styles.auteur}>{rv.reviewer?.firstName ? `${rv.reviewer.firstName} ${(rv.reviewer.lastName || "").charAt(0)}.` : "Client VIT AUTO"}</span>
                <span className={styles.etoiles} aria-label={`${rv.note} sur 5`}>{"★".repeat(rv.note)}{"☆".repeat(5 - rv.note)}</span>
                <span className={styles.date}>{new Date(rv.createdAt).toLocaleDateString("fr-FR")}</span>
              </div>
              {rv.commentaire && <p className={styles.commentaire}>{rv.commentaire}</p>}
              <ReportButton targetType="review" targetId={rv._id} compact />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
