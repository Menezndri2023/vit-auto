import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import styles from "./VendorCallout.module.css";

/**
 * Toujours visible — adapté selon le rôle :
 * - Non connecté / client → CTA "Devenir partenaire" → /register
 * - Partenaire connecté   → CTA "Publier une annonce" → /vendor
 */
const VendorCallout = () => {
  const { user } = useAuth();
  const isPartner = user?.role === "partenaire" || user?.role === "admin";

  return (
    <section className={styles.vendor}>
      <div>
        <h2>{isPartner ? "Publiez votre prochain véhicule" : "Devenez partenaire VIT AUTO"}</h2>
        <p>
          {isPartner
            ? "Ajoutez une nouvelle annonce en quelques minutes — location, vente ou chauffeur."
            : "Proposez vos véhicules en location ou à la vente. Gestion des annonces, contrats et paiements au même endroit."}
        </p>
      </div>
      <Link to={isPartner ? "/vendor" : "/register"} className={styles.btn}>
        {isPartner ? "Publier une annonce →" : "Devenir partenaire →"}
      </Link>
    </section>
  );
};

export default VendorCallout;
