import React from "react";
import { Link } from "react-router-dom";

const Section = ({ id, title, children }) => (
  <div id={id} style={{ marginBottom: 44, scrollMarginTop: 90 }}>
    <h2 style={{
      fontSize: "1rem", fontWeight: 800, color: "#0f1b3f",
      marginBottom: 14, display: "flex", alignItems: "center", gap: 10,
      borderLeft: "4px solid #ff4d2d", paddingLeft: 14, lineHeight: 1.35,
    }}>
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

const TOC_ITEMS = [
  ["fraude", "🕵️ Lutte contre la fraude"],
  ["kyc", "🛡️ Politique KYC"],
  ["aml-sanctions", "💰 AML & Sanctions internationales"],
  ["moderation", "📝 Modération des contenus"],
  ["propriete", "©️ Propriété intellectuelle"],
  ["signalement", "🚩 Signalement"],
  ["litiges", "⚖️ Gestion des litiges"],
  ["mineurs", "🔞 Protection des mineurs"],
  ["accessibilite", "♿ Accessibilité"],
  ["illicite", "⛔ Contenus illicites"],
];

export default function Policies() {
  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "48px 24px 96px" }}>

      {/* En-tête */}
      <div style={{
        background: "linear-gradient(135deg, #0f1b3f 0%, #1e3a6e 100%)",
        borderRadius: 20, padding: "36px 36px 32px", marginBottom: 24, color: "#fff",
      }}>
        <span style={{
          display: "inline-block", background: "rgba(255,77,45,.18)", color: "#ff8060",
          fontSize: "0.72rem", fontWeight: 800, padding: "4px 14px",
          borderRadius: 999, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16,
        }}>🛡️ CONFIANCE & CONFORMITÉ</span>
        <h1 style={{ margin: "0 0 10px", fontSize: "clamp(1.5rem,2.5vw,2rem)", fontWeight: 900 }}>
          Politiques de confiance et conformité
        </h1>
        <p style={{ margin: 0, color: "rgba(255,255,255,.65)", fontSize: "0.85rem" }}>
          Juillet 2026 · VIT AUTO
        </p>
      </div>

      <div style={{
        background: "#fffbeb", border: "1.5px solid #fde68a", borderRadius: 12,
        padding: "14px 18px", marginBottom: 32, fontSize: "0.85rem", color: "#92400e",
      }}>
        ⚠️ <strong>Document rédigé le 2026-07-16, à faire valider par un juriste avant publication
        officielle.</strong> Ces politiques ne sont pas toutes exigées dès le premier jour d'activité,
        mais posent une base cohérente pour une plateforme internationale. Chacune décrit fidèlement
        ce qui existe réellement aujourd'hui — pas un objectif présenté comme déjà atteint.
      </div>

      {/* Sommaire */}
      <div style={{
        background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14,
        padding: "18px 22px", marginBottom: 40, display: "flex", flexWrap: "wrap", gap: "8px 20px",
      }}>
        {TOC_ITEMS.map(([id, label]) => (
          <a key={id} href={`#${id}`} style={{ color: "#ff4d2d", fontWeight: 700, fontSize: "0.85rem", textDecoration: "none" }}>
            {label}
          </a>
        ))}
      </div>

      <Section id="fraude" title="🕵️ Lutte contre la fraude">
        <p>VIT AUTO applique plusieurs mesures concrètes contre la fraude :</p>
        <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
          <Li>Vérification d'identité (KYC) obligatoire avant publication pour tout vendeur particulier</Li>
          <Li>Détection de document déjà utilisé sur un autre compte (empreinte du document et du numéro extrait)</Li>
          <Li>Verrouillage temporaire du compte après plusieurs tentatives de connexion échouées</Li>
          <Li>Paiement par carte traité par un prestataire certifié (Stripe) — jamais de numéro de carte stocké par VIT AUTO</Li>
          <Li>Séquestre (escrow) des fonds pour les transactions Import/Export jusqu'à confirmation de livraison</Li>
          <Li>Journal d'audit des actions administratives sensibles</Li>
        </ul>
        <p style={{ marginTop: 10 }}>
          ⚠️ Il n'existe pas aujourd'hui de moteur de scoring de fraude automatisé (machine learning) ni de
          vérification en temps réel contre des bases de données externes de fraude connue — la détection
          repose sur les règles ci-dessus et la vigilance humaine (modération, support).
        </p>
      </Section>

      <Section id="kyc" title="🛡️ Politique KYC (Know Your Customer)">
        <p>Toute personne souhaitant publier une annonce en tant que vendeur particulier doit fournir :</p>
        <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
          <Li>Une pièce d'identité valide (CNI, passeport, ou équivalent selon le pays)</Li>
          <Li>Un selfie, comparé automatiquement au visage de la pièce d'identité (score de correspondance)</Li>
        </ul>
        <p style={{ marginTop: 10 }}>
          Les comptes professionnels/entreprise passent par une certification partenaire plus complète
          (documents d'enregistrement, justificatifs fiscaux). Un dossier est examiné par un administrateur
          avant validation définitive — aucune décision n'est jamais entièrement automatique.
        </p>
        <p style={{ marginTop: 10 }}>
          🔒 Les documents d'identité (photos et numéro) sont chiffrés au repos depuis le 2026-07-16.
        </p>
      </Section>

      <Section id="aml-sanctions" title="💰 AML (lutte anti-blanchiment) & Sanctions internationales">
        <p>
          ⚠️ <strong>Non applicable dans leur forme complète à ce jour</strong> — VIT AUTO est une plateforme
          de mise en relation, pas un établissement de paiement ni un service financier réglementé. Ces
          politiques deviendront pertinentes si des services financiers propres (financement, portefeuille
          électronique, etc.) sont un jour proposés directement par VIT AUTO.
        </p>
        <p style={{ marginTop: 10 }}>
          Il n'existe aujourd'hui <strong>aucun filtrage automatique</strong> contre les listes de sanctions
          internationales (OFAC, ONU, UE) ni de déclaration de soupçon type cellule de renseignement
          financier. Avant toute expansion vers des marchés ou services financiers soumis à ces obligations,
          un audit de conformité par un cabinet spécialisé est nécessaire — ce n'est pas quelque chose
          qu'une politique interne seule peut couvrir.
        </p>
      </Section>

      <Section id="moderation" title="📝 Modération des contenus">
        <p>Chaque annonce publiée passe par une modération avant apparition publique :</p>
        <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
          <Li>Score de complétude/qualité automatique à la soumission</Li>
          <Li>Revue humaine par un administrateur pour toute annonce sous le seuil d'auto-approbation</Li>
          <Li>Motif obligatoire en cas de rejet, communiqué au partenaire</Li>
          <Li>Avis clients modérables a posteriori (masquage réversible)</Li>
        </ul>
        <p style={{ marginTop: 10 }}>
          ⚠️ Aucune modération automatique du contenu visuel (détection d'images inappropriées) n'est en
          place à ce jour — la revue humaine est la seule protection contre ce type de contenu.
        </p>
      </Section>

      <Section id="propriete" title="©️ Propriété intellectuelle">
        <p>
          L'ensemble des éléments de la plateforme (marque, logo, interface, code source, algorithmes,
          textes) est la propriété exclusive de VIT AUTO ou de ses concédants, protégé par le droit
          applicable. Toute reproduction, extraction ou réutilisation non autorisée est interdite.
        </p>
        <p style={{ marginTop: 10 }}>
          Un partenaire ou client publiant du contenu (photos, descriptions) garantit détenir les droits
          nécessaires sur ce contenu et en accorde à VIT AUTO une licence d'utilisation limitée à
          l'exploitation de la plateforme (affichage, promotion des annonces).
        </p>
        <p style={{ marginTop: 10 }}>
          En cas d'atteinte alléguée à un droit de propriété intellectuelle, contactez{" "}
          <a href="mailto:contact@vit-auto.com" style={{ color: "#ff4d2d", fontWeight: 700 }}>contact@vit-auto.com</a>{" "}
          avec les éléments justificatifs — la demande sera traitée manuellement par notre équipe.
        </p>
      </Section>

      <Section id="signalement" title="🚩 Signalement">
        <p>
          ⚠️ <strong>Pas de bouton de signalement dédié à ce jour</strong> sur les annonces, avis ou
          conversations. Pour signaler un contenu ou comportement problématique, contactez le support via
          la bulle de chat du site ou{" "}
          <a href="mailto:contact@vit-auto.com" style={{ color: "#ff4d2d", fontWeight: 700 }}>contact@vit-auto.com</a>,
          en précisant le lien ou la référence de l'annonce/commande concernée. Un signalement de ce type
          sera traité manuellement par l'équipe support/modération.
        </p>
      </Section>

      <Section id="litiges" title="⚖️ Gestion des litiges">
        <p>
          Pour une réservation classique, un litige est instruit par un administrateur après déclarations
          des deux parties. Pour une transaction Import/Export, un litige peut être ouvert directement
          depuis le suivi de la transaction, à tout moment après réservation.
        </p>
        <p style={{ marginTop: 10 }}>
          La décision (remboursement total/partiel, versement au partenaire, ou solution intermédiaire) est
          prise par un administrateur après examen. ⚠️ Aucun remboursement n'est exécuté automatiquement
          par la plateforme — voir les{" "}
          <Link to="/cgv" style={{ color: "#ff4d2d", fontWeight: 700 }}>CGV</Link> article 9.
        </p>
      </Section>

      <Section id="mineurs" title="🔞 Protection des mineurs">
        <p>
          L'utilisation de VIT AUTO est réservée aux personnes majeures selon la loi de leur pays de
          résidence. ⚠️ <strong>Aucune vérification d'âge n'est actuellement demandée à l'inscription</strong>{" "}
          (pas de date de naissance collectée) — la restriction repose aujourd'hui uniquement sur la
          déclaration implicite de l'utilisateur en acceptant les CGU. Une vérification d'âge réelle à
          l'inscription est un chantier à prévoir avant toute communication affirmant une protection
          effective des mineurs.
        </p>
      </Section>

      <Section id="accessibilite" title="♿ Accessibilité">
        <p>
          VIT AUTO n'a pas fait l'objet d'un audit d'accessibilité formel (WCAG ou équivalent) à ce jour.
          Aucune conformité à un niveau d'accessibilité spécifique n'est donc affirmée. L'amélioration de
          l'accessibilité (contraste, navigation clavier, lecteurs d'écran) est une piste d'amélioration
          identifiée, pas un état déjà atteint.
        </p>
      </Section>

      <Section id="illicite" title="⛔ Lutte contre les contenus illicites">
        <p>
          Toute annonce, message ou avis à caractère illicite (contrefaçon, véhicule volé ou non
          immatriculé légalement, contenu discriminatoire, incitation à la haine, etc.) est interdit et
          entraîne le retrait de l'annonce/compte concerné après constat par l'équipe de modération.
        </p>
        <p style={{ marginTop: 10 }}>
          Un contenu manifestement illicite signalé sera retiré dans les meilleurs délais après vérification
          humaine — il n'existe pas de système de retrait automatique instantané à ce jour (voir §Signalement).
        </p>
      </Section>

      {/* Liens légaux */}
      <div style={{
        background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14,
        padding: "20px 24px", display: "flex", gap: 20, flexWrap: "wrap",
      }}>
        <Link to="/cgu" style={{ color: "#ff4d2d", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
          📄 CGU
        </Link>
        <Link to="/cgv" style={{ color: "#ff4d2d", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
          🧾 CGV
        </Link>
        <Link to="/privacy" style={{ color: "#ff4d2d", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
          🔒 Confidentialité
        </Link>
        <Link to="/cookies" style={{ color: "#ff4d2d", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
          🍪 Cookies
        </Link>
        <a href="mailto:contact@vit-auto.com" style={{ color: "#ff4d2d", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
          ✉️ Nous contacter
        </a>
      </div>
    </div>
  );
}
