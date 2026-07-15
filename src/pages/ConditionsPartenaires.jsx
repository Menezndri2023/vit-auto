import { Link } from "react-router-dom";

const Art = ({ n, title, children }) => (
  <div style={{ marginBottom: 36 }}>
    <h2 style={{
      fontSize: "1rem", fontWeight: 800, color: "#0f1b3f",
      marginBottom: 12, display: "flex", gap: 10, alignItems: "flex-start",
    }}>
      <span style={{
        background: "#ff4d2d", color: "#fff", fontSize: "0.74rem",
        fontWeight: 900, padding: "3px 10px", borderRadius: 999, flexShrink: 0,
        marginTop: 2,
      }}>{n}</span>
      {title}
    </h2>
    <div style={{ color: "#4a5876", fontSize: "0.92rem", lineHeight: 1.8, paddingLeft: 4 }}>
      {children}
    </div>
  </div>
);

const Li = ({ children }) => (
  <li style={{ marginBottom: 6, display: "flex", gap: 8 }}>
    <span style={{ color: "#ff4d2d", flexShrink: 0, marginTop: 2 }}>›</span>
    <span>{children}</span>
  </li>
);

export default function ConditionsPartenaires() {
  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "48px 24px 96px" }}>

      {/* En-tête */}
      <div style={{
        background: "linear-gradient(135deg, #0f1b3f 0%, #1e3a6e 100%)",
        borderRadius: 20, padding: "36px 36px 32px", marginBottom: 44, color: "#fff",
      }}>
        <span style={{
          display: "inline-block", background: "rgba(255,77,45,.18)", color: "#ff8060",
          fontSize: "0.72rem", fontWeight: 800, padding: "4px 14px",
          borderRadius: 999, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16,
        }}>🤝 CONDITIONS PARTENAIRES</span>
        <h1 style={{ margin: "0 0 10px", fontSize: "clamp(1.5rem,2.5vw,2rem)", fontWeight: 900 }}>
          Conditions Générales Partenaires
        </h1>
        <p style={{ margin: 0, color: "rgba(255,255,255,.65)", fontSize: "0.85rem" }}>
          En vigueur depuis le 1er Janvier 2026 · VIT AUTO · vit-auto.com
        </p>
      </div>

      {/* Intro */}
      <div style={{
        background: "rgba(255,77,45,.06)", border: "1px solid rgba(255,77,45,.2)",
        borderRadius: 14, padding: "18px 22px", marginBottom: 36,
      }}>
        <p style={{ margin: 0, color: "#0f1b3f", fontSize: "0.9rem", lineHeight: 1.7 }}>
          Les présentes Conditions Générales Partenaires (CGP) régissent la relation entre <strong>VIT AUTO</strong> et
          toute personne physique ou morale souhaitant publier des véhicules ou proposer des services
          via la plateforme <em>vit-auto.com</em>. En créant un compte partenaire, vous acceptez intégralement
          les présentes CGP.
        </p>
      </div>

      <Art n="1" title="Définitions">
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          <Li><strong>Partenaire :</strong> toute agence de location, concessionnaire, particulier ou chauffeur professionnel inscrit sur la plateforme pour proposer des véhicules ou services.</Li>
          <Li><strong>Annonce :</strong> toute publication de véhicule (location, vente) ou de service (chauffeur) effectuée par un partenaire.</Li>
          <Li><strong>Réservation :</strong> toute demande validée par un client et confirmée par le partenaire via la plateforme.</Li>
          <Li><strong>Commission :</strong> pourcentage prélevé par VIT AUTO sur chaque transaction.</Li>
          <Li><strong>Partenaire Fondateur :</strong> l'un des 20 premiers partenaires inscrits par pays, bénéficiant d'avantages exclusifs.</Li>
        </ul>
      </Art>

      <Art n="2" title="Conditions d'éligibilité">
        <p>Pour devenir partenaire VIT AUTO, vous devez :</p>
        <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
          <Li>Être majeur (18 ans ou plus) et disposer de la capacité juridique de contracter</Li>
          <Li>Fournir une pièce d'identité valide (CNI, passeport ou document équivalent)</Li>
          <Li>Fournir un numéro de téléphone valide et vérifiable</Li>
          <Li>Être propriétaire ou avoir le droit légal de louer/vendre les véhicules publiés</Li>
          <Li>Disposer de documents en règle pour chaque véhicule : assurance, carte grise, contrôle technique</Li>
          <Li>Fournir une adresse exacte pour le calcul GPS des frais de livraison</Li>
        </ul>
      </Art>

      <Art n="3" title="Obligations du partenaire">
        <p>En tant que partenaire, vous vous engagez à :</p>
        <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
          <Li>Publier des informations <strong>exactes, complètes et récentes</strong> sur chaque véhicule (photos réelles, état, kilométrage, prix)</Li>
          <Li>Renseigner l'adresse GPS précise du véhicule (indispensable pour le calcul automatique des frais de livraison)</Li>
          <Li>Confirmer ou refuser toute réservation dans les <strong>24 heures</strong> suivant la demande</Li>
          <Li>Assurer la disponibilité effective du véhicule aux dates confirmées</Li>
          <Li>Maintenir en règle les documents obligatoires (assurance, contrôle technique, carte grise)</Li>
          <Li>Effectuer la livraison à l'adresse GPS communiquée par le client, si ce service est activé</Li>
          <Li>Traiter les clients avec professionnalisme et respect</Li>
          <Li>Signaler immédiatement à VIT AUTO tout incident survenu lors d'une réservation</Li>
          <Li>Ne pas contourner la plateforme pour réaliser des transactions directes avec des clients issus de VIT AUTO</Li>
        </ul>
      </Art>

      <Art n="4" title="Publications et contenu">
        <p>Chaque annonce publiée doit respecter les règles suivantes :</p>
        <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
          <Li>Photos réelles et récentes du véhicule (minimum 3 photos)</Li>
          <Li>Prix clairement affiché en Dirhams (DH) ou en devise locale selon le pays</Li>
          <Li>Description honnête de l'état du véhicule (kilométrage, options, défauts éventuels)</Li>
          <Li>Conditions spéciales (âge minimum du conducteur, caution demandée) clairement indiquées</Li>
        </ul>
        <p style={{ marginTop: 12 }}>
          VIT AUTO se réserve le droit de <strong>suspendre ou supprimer</strong> toute annonce ne respectant pas ces critères,
          sans préavis ni indemnité.
        </p>
      </Art>

      <Art n="5" title="Commissions et paiements">
        <p>Les commissions appliquées sont les suivantes :</p>
        <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
          <Li><strong>Location :</strong> 15 % du montant de la réservation (10 % pour les Partenaires Fondateurs entreprise/professionnel/exportateur pendant 12 mois ; 5 % en permanence pour un Partenaire Fondateur particulier)</Li>
          <Li><strong>Vente :</strong> 3 % du prix de vente (2 % pour les Partenaires Fondateurs entreprise/professionnel/exportateur pendant 12 mois ; 1 % en permanence pour un Partenaire Fondateur particulier)</Li>
          <Li><strong>Chauffeur :</strong> 10 % du montant de la course</Li>
          <Li><strong>Assurance :</strong> commission négociée directement avec le partenaire assureur (généralement 5–15 %)</Li>
          <Li><strong>Crédit / Leasing :</strong> commission négociée avec la banque ou le courtier (généralement 1–3 % du montant financé)</Li>
          <Li><strong>Frais de service client :</strong> 15 DH fixes par transaction (à la charge du client)</Li>
          <Li><strong>Livraison GPS :</strong> 15 DH de base + 3 DH/km, calculée dynamiquement, à la charge du client</Li>
        </ul>
        <p style={{ marginTop: 12 }}>
          Les commissions sont automatiquement déduites à chaque transaction. Le solde net est viré
          au partenaire dans un délai de <strong>2 à 5 jours ouvrés</strong> après confirmation de la réservation.
        </p>
      </Art>

      <Art n="6" title="Offre Partenaire Fondateur">
        <p>
          Les 20 premiers partenaires inscrits et validés sur la plateforme, <strong>par pays</strong>, bénéficient du statut
          <strong> Partenaire Fondateur</strong>, avec les avantages suivants :
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
          <Li>Accès gratuit à toutes les fonctionnalités (sans abonnement mensuel)</Li>
          <Li>Commission réduite pendant 12 mois : 10 % sur location, 2 % sur vente (entreprise/professionnel/exportateur) — 5 % et 1 %, acquis en permanence, pour un Partenaire Fondateur particulier</Li>
          <Li>Badge "Partenaire Fondateur" affiché sur toutes les annonces</Li>
          <Li>Mise en avant prioritaire dans les résultats de recherche et le catalogue</Li>
          <Li>Un Partenaire Fondateur particulier reste limité à 10 annonces actives simultanées</Li>
        </ul>
        <p style={{ marginTop: 12 }}>
          Passé les 12 premiers mois, un Partenaire Fondateur entreprise/professionnel/exportateur revient au tarif
          standard (15 % / 3 %). Un Partenaire Fondateur particulier conserve son tarif réduit (5 % / 1 %) de façon
          permanente. VIT AUTO se réserve le droit d'ajuster cette offre avec un préavis de <strong>30 jours</strong>.
        </p>
      </Art>

      <Art n="7" title="Responsabilités">
        <p>Le partenaire est <strong>seul responsable</strong> :</p>
        <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
          <Li>De l'exactitude des informations publiées sur ses annonces</Li>
          <Li>De l'état du véhicule remis au client</Li>
          <Li>Du bon déroulement de la livraison lorsqu'il propose ce service</Li>
          <Li>Du respect des obligations fiscales et légales liées à son activité</Li>
          <Li>Des litiges nés de la relation directe avec le client</Li>
        </ul>
        <p style={{ marginTop: 12 }}>
          VIT AUTO n'est pas partie au contrat de location ou de vente entre le client et le partenaire.
        </p>
      </Art>

      <Art n="8" title="Suspension et résiliation">
        <p>VIT AUTO peut suspendre ou résilier un compte partenaire en cas de :</p>
        <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
          <Li>Non-respect des présentes Conditions Générales Partenaires</Li>
          <Li>Publication d'informations fausses ou trompeuses</Li>
          <Li>Comportement frauduleux ou nuisible aux clients</Li>
          <Li>Tentative de contournement de la plateforme</Li>
          <Li>Inactivité prolongée de plus de 6 mois sans notification</Li>
        </ul>
        <p style={{ marginTop: 12 }}>
          En cas de résiliation, les commissions dues sur les réservations en cours restent exigibles.
          Le partenaire peut également résilier son compte à tout moment depuis son tableau de bord.
        </p>
      </Art>

      <Art n="9" title="Confidentialité des données">
        <p>
          VIT AUTO traite les données personnelles des partenaires conformément à sa{" "}
          <Link to="/privacy" style={{ color: "#ff4d2d", fontWeight: 700 }}>Politique de confidentialité</Link>{" "}
          et à la loi marocaine 09-08. Les données sont utilisées uniquement pour la gestion du compte
          et l'exécution des services.
        </p>
      </Art>

      <Art n="10" title="Droit applicable et litiges">
        <p>
          Les présentes CGP sont régies par le <strong>droit marocain</strong>.
          Tout litige sera soumis en priorité à une procédure de médiation.
          À défaut de résolution amiable, les tribunaux de <strong>Casablanca</strong> seront compétents.
        </p>
        <p style={{ marginTop: 12 }}>
          Contact :{" "}
          <a href="mailto:contact@vit-auto.com" style={{ color: "#ff4d2d", fontWeight: 700, textDecoration: "none" }}>contact@vit-auto.com</a>
          {" "}·{" "}
          <a href="tel:+2120607742672" style={{ color: "#ff4d2d", fontWeight: 700, textDecoration: "none" }}>+212 06 07 74 26 72</a>
        </p>
      </Art>

      {/* Liens légaux */}
      <div style={{
        background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14,
        padding: "20px 24px", display: "flex", gap: 20, flexWrap: "wrap",
        marginBottom: 28,
      }}>
        <Link to="/cgu" style={{ color: "#ff4d2d", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
          📄 CGU (Clients)
        </Link>
        <Link to="/privacy" style={{ color: "#ff4d2d", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
          🔒 Politique de confidentialité
        </Link>
        <Link to="/mentions-legales" style={{ color: "#ff4d2d", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
          ⚖️ Mentions légales
        </Link>
      </div>

      {/* CTA */}
      <div style={{ textAlign: "center" }}>
        <Link to="/register?role=partenaire" style={{
          background: "#ff4d2d", color: "#fff", fontWeight: 800, fontSize: "0.95rem",
          padding: "14px 32px", borderRadius: 12, textDecoration: "none",
          boxShadow: "0 4px 18px rgba(255,77,45,.35)", display: "inline-block",
        }}>
          Devenir partenaire →
        </Link>
      </div>

    </div>
  );
}
