import { Link } from "react-router-dom";
import { LIBELLE_PLAN } from "../../constants/planFeatures";
import styles from "./VerrouOutil.module.css";

// Cadenas d'un outil d'abonnement, affiché AVANT le clic. Ne rend rien tant
// que l'outil n'est pas explicitement fermé à ce compte (voir useOutils) :
// un abonné ne voit aucune mention, un compte gratuit voit ce qui lui manque
// et où le demander. L'activation reste SUR DEMANDE au support depuis la page
// Tarifs — aucun paiement dans l'interface (contrainte App Store 3.1.1).
export default function VerrouOutil({ outils, feature, nom, lecture }) {
  const requis = outils.planRequis(feature);
  if (!requis) return null;
  return (
    <p className={styles.verrou} role="note" data-verrou-outil={feature}>
      🔒 <strong>{nom}</strong> — inclus à partir du plan {LIBELLE_PLAN[requis] || requis}.
      {lecture ? ` ${lecture}` : ""}{" "}
      <Link to="/plans">Voir les plans</Link>
    </p>
  );
}
