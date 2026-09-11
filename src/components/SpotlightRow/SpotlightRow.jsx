import { Link } from "react-router-dom";
import { useCurrency } from "../../context/CurrencyContext";
import { useSpotlight } from "../../hooks/useSpotlight";
import styles from "./SpotlightRow.module.css";

/**
 * Bande de mise en avant générique — activités et loisirs, partenaires.
 *
 * Le contenu est composé par le serveur (moteur de mise en avant) : épinglage
 * administrateur, boosts achetés, places d'abonnement, puis mérite. Aucune
 * sélection n'est faite ici.
 *
 * La section ne s'affiche PAS en dessous de `minimum` éléments : une bande à
 * une seule vignette donne l'impression d'un site vide, ce qui coûte plus
 * qu'elle ne rapporte.
 *
 * Le défaut de 3 ne convient pas à toutes les bandes. Le moteur limite chaque
 * partenaire à deux entrées (MAX_PAR_PARTENAIRE) : une rubrique servie par un
 * seul partenaire plafonne donc à deux éléments et resterait invisible pour
 * toujours, quel que soit le nombre d'annonces publiées. C'est arrivé aux
 * loisirs — dix activités en ligne, section jamais affichée. Une rubrique
 * jeune passe donc `minimum={2}` explicitement.
 */
export default function SpotlightRow({ emplacement, titre, sousTitre, minimum = 3, lienTout = null, libelleTout = null }) {
  const { chargement, items } = useSpotlight(emplacement);
  const { fmt } = useCurrency();

  if (chargement || items.length < minimum) return null;

  return (
    <section className={styles.section} aria-labelledby={`spotlight-${emplacement}`}>
      <header className={styles.entete}>
        <div>
          <h2 id={`spotlight-${emplacement}`} className={styles.titre}>{titre}</h2>
          {sousTitre && <p className={styles.sousTitre}>{sousTitre}</p>}
        </div>
        {lienTout && <Link to={lienTout} className={styles.lienTout}>{libelleTout || "Tout voir"} →</Link>}
      </header>

      <div className={styles.piste}>
        {items.map((item) => (
          <Link key={item.id} to={item.lien} className={styles.carte}>
            <div className={styles.visuel}>
              {item.image
                ? <img src={item.image} alt="" loading="lazy" />
                : <span className={styles.sansVisuel} aria-hidden="true">🎟️</span>}
            </div>
            <div className={styles.corps}>
              <h3 className={styles.nom}>{item.titre}</h3>
              {item.ville && <p className={styles.lieu}>{item.ville}</p>}
              {item.dureeMinutes && (
                <p className={styles.meta}>
                  {item.dureeMinutes} min{item.capacite ? ` · jusqu'à ${item.capacite} pers.` : ""}
                </p>
              )}
              {item.prix != null && (
                <p className={styles.prix}>
                  {fmt ? fmt(item.prix) : `${item.prix} ${item.devise}`}
                  {item.unite ? <span className={styles.unite}> / {item.unite}</span> : null}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
