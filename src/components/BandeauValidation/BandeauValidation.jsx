import { Link } from "react-router-dom";
import useValidationPartenaire from "../../hooks/useValidationPartenaire";

// Validation du partenaire (2026-10-09) : un seul bandeau, qui liste les
// pièces exigées pour SON métier et SON entité (permis et CV pour un
// chauffeur, pièce d'identité pour un particulier, registre de commerce pour
// une entreprise…) — calculées par le serveur (/api/users/me/validation).
// Remplace les bandeaux « KYC en attente » / « Certification requise », qui
// réclamaient à un chauffeur des documents qu'on ne lui demande pas.
export default function BandeauValidation({ token, styles, publicationOuverte }) {
  const v = useValidationPartenaire(token);
  if (!v || v.statut === "valide") return null;

  if (v.statut === "suspendu") {
    return (
      <div className={styles.freeBanner} style={{ borderColor: "#fca5a5" }}>
        <span className={styles.planBadge} style={{ background: "#fee2e2", color: "#dc2626" }}>⛔ Dossier suspendu</span>
        <span>Votre dossier partenaire est suspendu. Contactez l'assistance VIT AUTO.</span>
        <Link to="/help" className={styles.upgradeLink}>Contacter l'assistance →</Link>
      </div>
    );
  }
  const premier = v.manquants[0];
  return (
    <div className={styles.freeBanner} style={{ borderColor: publicationOuverte ? "#a5b4fc" : "#fde68a" }}>
      <span className={styles.planBadge} style={publicationOuverte ? { background: "#e0e7ff", color: "#4338ca" } : { background: "#fef3c7", color: "#d97706" }}>
        {publicationOuverte ? "✓ Publication ouverte" : "⏳ Compte à valider"}
      </span>
      <span>
        {publicationOuverte ? "Vos annonces sont en ligne. Pour finaliser votre compte, il reste : " : "Pour valider votre compte, il reste à fournir : "}
        {v.manquants.map((m, i) => (
          <span key={m.code}>{i ? ", " : ""}<Link to={m.lien}>{m.libelle}</Link></span>
        ))}.
      </span>
      {premier && <Link to={premier.lien} className={styles.upgradeLink}>Compléter →</Link>}
    </div>
  );
}
