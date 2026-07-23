import React, { useState } from "react";
import { Link } from "react-router-dom";

const FAQS = [
  {
    cat: "📋 Réservation",
    items: [
      {
        q: "Comment réserver un véhicule ?",
        a: "Depuis le catalogue, choisissez un véhicule, cliquez sur « Réserver » puis suivez les 3 étapes : informations personnelles, vérification d'identité et paiement. La confirmation est immédiate avec contrat digital.",
      },
      {
        q: "Puis-je réserver sans compte ?",
        a: "Oui, une réservation invité est possible. Cependant, créer un compte vous permet de suivre vos réservations, accéder à vos contrats et obtenir un support prioritaire.",
      },
      {
        q: "Comment annuler une réservation ?",
        a: "Rendez-vous dans Tableau de bord > Mes réservations, puis cliquez sur « Annuler ». Les conditions d'annulation (remboursement, délai) sont précisées dans votre contrat digital.",
      },
      {
        q: "Quelle est la durée minimale de location ?",
        a: "La durée minimale est de 1 jour (24h). Certains partenaires proposent des locations à l'heure — cela est précisé dans l'annonce.",
      },
    ],
  },
  {
    cat: "💳 Paiement",
    items: [
      {
        q: "Quels modes de paiement acceptez-vous ?",
        a: "Orange Money, Wave, MTN Mobile Money, Moov Money, Carte bancaire (Visa/Mastercard), PayPal, Virement SEPA (Europe), CMI et CIH (Maroc), et espèces à la livraison pour certains partenaires.",
      },
      {
        q: "Le paiement est-il sécurisé ?",
        a: "Oui. Toutes les transactions sont chiffrées (TLS 1.3). Les données bancaires ne sont jamais stockées sur nos serveurs.",
      },
      {
        q: "Qu'est-ce que la caution ?",
        a: "La caution est un dépôt de garantie prélevé à la réservation et remboursé intégralement après restitution du véhicule en bon état. Le montant est précisé dans chaque annonce.",
      },
      {
        q: "Quand suis-je débité ?",
        a: "Vous êtes débité lors de la confirmation de la réservation. En cas d'annulation selon les conditions prévues, un remboursement est initié dans les 5–7 jours ouvrés.",
      },
    ],
  },
  {
    cat: "🚚 Livraison GPS",
    items: [
      {
        q: "Comment fonctionne la livraison à domicile ?",
        a: "Sélectionnez « Livraison à domicile » lors de la réservation. Votre position GPS est détectée automatiquement pour calculer la distance réelle entre le partenaire et vous (algorithme Haversine). Les frais sont : 15 DH de base + 3 DH/km. Le partenaire confirme la livraison et se déplace avec le véhicule.",
      },
      {
        q: "Comment le partenaire trouve mon adresse ?",
        a: "Lors de la réservation, vous partagez votre position GPS ou saisissez une adresse précise. Cette information est transmise au partenaire après confirmation du paiement. Il peut ainsi vous livrer avec précision.",
      },
      {
        q: "Puis-je retirer le véhicule en agence ?",
        a: "Oui. Choisissez « Retrait en agence » — c'est gratuit. L'adresse exacte du partenaire vous sera communiquée après confirmation de la réservation.",
      },
      {
        q: "Dans quelles villes livrez-vous ?",
        a: "VIT AUTO opère dans 50+ villes à travers 20+ pays : Côte d'Ivoire, Sénégal, Ghana, Nigeria, Maroc, Algérie, Tunisie, Mali, Burkina Faso, Guinée, France, Belgique, Espagne, Suisse, et plus. La disponibilité dépend de chaque partenaire.",
      },
    ],
  },
  {
    cat: "🤝 Partenaires",
    items: [
      {
        q: "Comment devenir partenaire ?",
        a: "Créez un compte avec le rôle « Partenaire », puis complétez le programme Founding Partner (Letter of Intent + Accord de Partenariat) — une étape obligatoire pour tout partenaire avant de publier. Renseignez ensuite votre identité et publiez votre première annonce ; l'adresse exacte est obligatoire pour le calcul de livraison.",
      },
      {
        q: "Quelles sont les commissions ?",
        a: "15 % sur les locations et 3 % sur les ventes en tarif standard. Pendant les 12 premiers mois suivant la signature de l'Accord Founding Partner, tout partenaire (particulier, professionnel, entreprise, exportateur) bénéficie de 10 % sur les locations, et 1,5 % (entreprise/professionnel/exportateur) ou 2 % (particulier) sur les ventes — puis retour automatique au tarif standard.",
      },
      {
        q: "Comment sont versés mes revenus ?",
        a: "Après chaque réservation confirmée et terminée, le montant net (prix − commission − frais de service) est versé via la méthode de paiement renseignée dans votre profil.",
      },
      {
        q: "Puis-je publier depuis l'étranger ?",
        a: "Oui ! VIT AUTO est une plateforme mondiale. Publiez depuis 20+ pays : Maroc, France, Sénégal, Côte d'Ivoire, Dubaï, Allemagne, Chine et tout autre pays couvert.",
      },
    ],
  },
  {
    cat: "🌍 Import / Export International",
    items: [
      {
        q: "Qu'est-ce que le service Import/Export ?",
        a: "VIT AUTO vous permet d'importer des véhicules depuis la Chine, Dubaï ou l'Europe, ou d'en exporter vers 20+ pays en Afrique et au Maghreb. Nous gérons l'inspection, le transport maritime, le dédouanement et la livraison de A à Z.",
      },
      {
        q: "Quels sont les packs disponibles ?",
        a: "Trois formules : Silver (à partir de 299 €) pour la vérification vendeur et l'assistance achat, Gold (à partir de 599 €) avec inspection et suivi logistique, Platinum sur devis pour une gestion complète incluant dédouanement et livraison porte-à-porte.",
      },
      {
        q: "Combien coûte une inspection avant achat ?",
        a: "L'inspection Standard démarre à 79 €, l'inspection Premium à 199 €. Le rapport est transmis avant tout engagement d'achat.",
      },
      {
        q: "Qui peut utiliser le service Import/Export ?",
        a: "Toute personne souhaitant acheter un véhicule à l'international (particuliers et professionnels). Les importateurs et concessionnaires bénéficient de conditions préférentielles via le plan Corporate.",
      },
      {
        q: "Depuis quels pays puis-je importer ?",
        a: "Principalement depuis la Chine (BYD, Geely, Chery…), les Émirats arabes unis (Dubaï), et l'Europe (Allemagne, France, Belgique, Pays-Bas, Espagne, Italie). La liste s'étend régulièrement.",
      },
    ],
  },
  {
    cat: "🛡️ Sécurité & Données",
    items: [
      {
        q: "Comment mes données sont-elles protégées ?",
        a: "Conformément au RGPD et à la loi marocaine 09-08, vos données sont chiffrées (TLS 1.3), non revendues et supprimables sur demande. Consultez notre Politique de confidentialité.",
      },
      {
        q: "Que se passe-t-il en cas d'accident ?",
        a: "Contactez immédiatement notre service client au +212 06 07 74 26 72 (24h/24). Selon l'option assurance souscrite, la procédure de déclaration sera déclenchée.",
      },
      {
        q: "Les véhicules sont-ils vérifiés ?",
        a: "Chaque annonce est modérée par notre équipe avant publication. Les partenaires doivent fournir des documents d'identité et de propriété vérifiés.",
      },
      {
        q: "Ma position GPS est-elle stockée ?",
        a: "Votre position GPS n'est collectée que lors d'une réservation avec livraison, avec votre consentement explicite, et uniquement pour calculer les frais et guider la livraison. Elle est supprimée après 90 jours.",
      },
    ],
  },
];

const FAQItem = ({ q, a }) => {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid #f0f4ff" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", textAlign: "left", background: "transparent",
          border: "none", padding: "15px 0", cursor: "pointer",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          gap: 12, fontFamily: "inherit",
        }}
      >
        <span style={{ fontWeight: 700, color: "#0f1b3f", fontSize: "0.92rem", lineHeight: 1.4 }}>{q}</span>
        <span style={{
          fontSize: "1.2rem", color: "#ff4d2d", flexShrink: 0,
          transform: open ? "rotate(45deg)" : "none",
          transition: "transform .2s",
          lineHeight: 1,
        }}>+</span>
      </button>
      {open && (
        <div style={{ padding: "0 0 16px", color: "#5a6a88", fontSize: "0.88rem", lineHeight: 1.7 }}>
          {a}
        </div>
      )}
    </div>
  );
};

export default function FAQ() {
  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: "48px 24px 96px" }}>

      {/* En-tête */}
      <div style={{ textAlign: "center", marginBottom: 52 }}>
        <span style={{
          display: "inline-block", background: "rgba(255,77,45,.08)", color: "#ff4d2d",
          fontSize: "0.72rem", fontWeight: 800, padding: "4px 14px",
          borderRadius: 999, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16,
        }}>
          AIDE & SUPPORT
        </span>
        <h1 style={{ fontSize: "clamp(1.75rem,2.5vw,2.4rem)", fontWeight: 900, color: "#0f1b3f", margin: "0 0 14px" }}>
          Questions fréquentes
        </h1>
        <p style={{ color: "#5a6a88", fontSize: "1rem", maxWidth: 520, margin: "0 auto", lineHeight: 1.6 }}>
          Vous ne trouvez pas votre réponse ?{" "}
          <a href="tel:+2120607742672" style={{ color: "#ff4d2d", fontWeight: 700, textDecoration: "none" }}>
            Appelez-nous
          </a>{" "}
          ou{" "}
          <Link to="/help" style={{ color: "#ff4d2d", fontWeight: 700, textDecoration: "none" }}>
            chattez avec nous
          </Link>.
        </p>
      </div>

      {/* Catégories */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {FAQS.map((cat) => (
          <div key={cat.cat} style={{
            background: "#fff",
            border: "1.5px solid #e8edf8",
            borderRadius: 18,
            padding: "22px 28px",
            boxShadow: "0 2px 16px rgba(15,27,63,.05)",
          }}>
            <h2 style={{
              fontSize: "0.95rem", fontWeight: 800, color: "#0f1b3f",
              margin: "0 0 14px", display: "flex", alignItems: "center", gap: 8,
            }}>
              {cat.cat}
            </h2>
            {cat.items.map((item) => (
              <FAQItem key={item.q} {...item} />
            ))}
          </div>
        ))}
      </div>

      {/* Lien vers autres pages légales */}
      <div style={{
        marginTop: 48, background: "#f8fafc", border: "1px solid #e2e8f0",
        borderRadius: 14, padding: "20px 24px",
        display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center",
      }}>
        <Link to="/cgu" style={{ color: "#ff4d2d", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
          📄 CGU
        </Link>
        <Link to="/privacy" style={{ color: "#ff4d2d", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
          🔒 Confidentialité
        </Link>
        <a href="mailto:contact@vit-auto.com" style={{ color: "#ff4d2d", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
          ✉️ contact@vit-auto.com
        </a>
        <a href="tel:+2120607742672" style={{ color: "#ff4d2d", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
          📞 +212 06 07 74 26 72
        </a>
      </div>
    </div>
  );
}
