import React from "react";
import { Link } from "react-router-dom";

const Section = ({ title, children }) => (
  <div style={{ marginBottom: 40 }}>
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

export default function Privacy() {
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
        }}>🔒 DONNÉES & CONFIDENTIALITÉ</span>
        <h1 style={{ margin: "0 0 10px", fontSize: "clamp(1.5rem,2.5vw,2rem)", fontWeight: 900 }}>
          Politique de confidentialité
        </h1>
        <p style={{ margin: 0, color: "rgba(255,255,255,.65)", fontSize: "0.85rem" }}>
          Dernière mise à jour : Juillet 2026 · VIT AUTO · vit-auto.com
        </p>
      </div>

      <Section title="1. Responsable du traitement">
        <p><strong>VIT AUTO</strong> — Route 1029, Hay Sidi Maârouf 1, 20520 Casablanca, Maroc.</p>
        <p style={{ marginTop: 8 }}>
          Contact DPO : <a href="mailto:contact@vit-auto.com" style={{ color: "#ff4d2d" }}>contact@vit-auto.com</a>
          {" "}· <a href="tel:+2120607742672" style={{ color: "#ff4d2d" }}>+212 06 07 74 26 72</a>
        </p>
      </Section>

      <Section title="2. Données collectées">
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          <Li><strong>Identité :</strong> nom, prénom, email, téléphone, pièce d'identité (CNI/passeport)</Li>
          <Li><strong>Photos prises via l'appareil photo :</strong> photo de votre pièce d'identité et selfie de vérification (KYC), photos de véhicules lors de la publication d'une annonce</Li>
          <Li><strong>Localisation GPS :</strong> lors d'une réservation avec livraison, ou pour la recherche de véhicules à proximité — toujours avec votre consentement explicite (autorisation demandée par votre navigateur ou votre téléphone)</Li>
          <Li><strong>Jeton de notification push :</strong> sur l'application mobile, un identifiant technique (fourni par Apple/Google) nous permet de vous envoyer des notifications sur l'état de vos réservations</Li>
          <Li><strong>Données de paiement :</strong> méthode et identifiant de transaction (jamais le numéro complet de carte)</Li>
          <Li><strong>Navigation :</strong> cookies de session, logs d'accès anonymisés</Li>
          <Li><strong>Annonces publiées :</strong> photos, descriptions, prix, adresse exacte du véhicule</Li>
        </ul>
      </Section>

      <Section title="3. Finalités du traitement">
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          <Li>Création et gestion de votre compte client ou partenaire</Li>
          <Li>Traitement des réservations, commandes et paiements</Li>
          <Li>Calcul automatique des frais de livraison géolocalisée (Haversine — distance réelle partenaire ↔ client)</Li>
          <Li>Envoi du véhicule au bon endroit grâce à la position GPS du client, et affichage des véhicules disponibles près de vous</Li>
          <Li>Vérification d'identité et prévention de la fraude (photo de pièce d'identité et selfie)</Li>
          <Li>Publication d'annonces de véhicules (photos prises ou importées depuis votre galerie)</Li>
          <Li>Envoi de notifications push sur l'avancement de vos réservations, messages et documents à signer</Li>
          <Li>Communication transactionnelle (confirmations, contrats, notifications)</Li>
          <Li>Amélioration continue de nos services</Li>
        </ul>
      </Section>

      <Section title="4. Base légale">
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          <Li><strong>Exécution du contrat</strong> — données nécessaires à la réservation et à la livraison</Li>
          <Li><strong>Consentement</strong> — géolocalisation GPS et cookies non essentiels</Li>
          <Li><strong>Intérêt légitime</strong> — sécurité, prévention de la fraude, amélioration du service</Li>
        </ul>
      </Section>

      <Section title="5. Localisation GPS & Livraison">
        <p>
          Lorsque vous choisissez la <strong>livraison à domicile</strong>, nous collectons votre position GPS
          (via votre navigateur sur le site, ou via le système de géolocalisation natif sur l'application mobile,
          toujours avec votre accord explicite) pour calculer automatiquement la distance entre vous et le partenaire,
          et en déduire les frais de livraison. Ces coordonnées sont transmises au partenaire
          <strong> uniquement pour réaliser la livraison</strong>. Nous utilisons aussi votre position, si vous
          l'autorisez, pour vous proposer les véhicules disponibles les plus proches de vous — sans jamais la
          partager avec un tiers en dehors de ce cadre.
        </p>
      </Section>

      <Section title="6. Appareil photo">
        <p>
          L'application peut demander l'accès à votre appareil photo dans deux cas précis, toujours à votre
          initiative : la <strong>vérification d'identité</strong> (photo de votre pièce d'identité et selfie,
          voir « Vérification d'identité et prévention de la fraude ») et la <strong>publication d'une annonce
          de véhicule</strong> (photos du véhicule). Vous pouvez toujours choisir d'importer une photo existante
          depuis votre galerie plutôt que de prendre une nouvelle photo. Ces images sont stockées de façon
          sécurisée et ne sont jamais utilisées à d'autres fins que celles indiquées.
        </p>
      </Section>

      <Section title="7. Notifications push">
        <p>
          Sur l'application mobile, nous pouvons vous envoyer des <strong>notifications push</strong> (nouvelle
          réservation, message reçu, document à signer, mise à jour de statut) via les services de notification
          d'Apple et de Google. Vous pouvez désactiver ces notifications à tout moment depuis les réglages de
          votre téléphone, sans que cela n'affecte votre accès aux autres fonctionnalités de l'application.
        </p>
      </Section>

      <Section title="8. Conservation des données">
        <p>
          Vos données personnelles sont conservées pendant la durée d'activité de votre compte,
          puis archivées 3 ans après votre dernière activité.
        </p>
      </Section>

      <Section title="9. Partage des données">
        <p>Nous ne vendons jamais vos données. Elles peuvent être partagées avec :</p>
        <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
          <Li><strong>Partenaires</strong> — informations strictement nécessaires à la réservation et à la livraison</Li>
          <Li><strong>Prestataires de paiement</strong> — Orange Money, Wave, MTN, Stripe, CMI</Li>
          <Li><strong>Hébergeurs</strong> — Render (serveur), Vercel (frontend), MongoDB Atlas (base de données)</Li>
          <Li><strong>Diagnostic technique</strong> — Sentry (rapports d'erreur et de performance, sans donnée publicitaire)</Li>
          <Li><strong>Notifications push</strong> — Apple (APNs) et Google (Firebase Cloud Messaging), uniquement pour acheminer les notifications sur votre appareil</Li>
          <Li><strong>Autorités compétentes</strong> — sur réquisition judiciaire uniquement</Li>
        </ul>
      </Section>

      <Section title="10. Vos droits (RGPD & loi marocaine 09-08)">
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          <Li><strong>Accès</strong> — obtenir une copie de vos données personnelles</Li>
          <Li><strong>Rectification</strong> — corriger des informations inexactes</Li>
          <Li><strong>Effacement</strong> — demander la suppression de votre compte et des données associées</Li>
          <Li><strong>Opposition</strong> — vous opposer à certains traitements</Li>
          <Li><strong>Portabilité</strong> — recevoir vos données dans un format lisible</Li>
        </ul>
        <p style={{ marginTop: 14 }}>
          Pour exercer vos droits, contactez-nous à{" "}
          <a href="mailto:contact@vit-auto.com" style={{ color: "#ff4d2d", fontWeight: 700 }}>contact@vit-auto.com</a>.
          {" "}Ces demandes sont actuellement traitées <strong>manuellement par notre équipe</strong> (pas encore de suppression ou d'export
          automatisés depuis votre compte) — nous répondons sous un délai raisonnable et au plus tard dans le délai légal applicable.
        </p>
      </Section>

      <Section title="11. Cookies et technologies similaires">
        <p>
          VIT AUTO n'utilise <strong>aucun cookie ni traceur publicitaire</strong> (pas de Google Analytics, Meta Pixel
          ou équivalent). Nous utilisons uniquement <strong>Sentry</strong>, un outil de diagnostic technique qui nous
          signale les erreurs et problèmes de performance de l'application — il ne collecte aucune donnée à des fins
          publicitaires et ne vous profile pas. Vos préférences (langue, devise) et votre session de connexion sont
          conservées via le <strong>stockage local de votre navigateur</strong> (localStorage), pas via des cookies au
          sens strict — cette distinction technique n'enlève rien à votre droit de contrôle : voir notre{" "}
          <Link to="/cookies" style={{ color: "#ff4d2d", fontWeight: 700 }}>Politique Cookies</Link> dédiée pour le détail.
        </p>
      </Section>

      <Section title="12. Sécurité">
        <p>
          Vos données sont protégées par chiffrement <strong>TLS 1.3</strong>, hashage <strong>BCrypt</strong> des mots de passe,
          et contrôle d'accès par <strong>JWT</strong>. Nos serveurs sont hébergés dans des datacenters certifiés ISO 27001.
        </p>
      </Section>

      {/* Liens légaux */}
      <div style={{
        background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14,
        padding: "20px 24px", display: "flex", gap: 20, flexWrap: "wrap",
      }}>
        <Link to="/cgu" style={{ color: "#ff4d2d", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
          📄 Conditions générales d'utilisation
        </Link>
        <Link to="/faq" style={{ color: "#ff4d2d", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
          ❓ FAQ
        </Link>
        <a href="mailto:contact@vit-auto.com" style={{ color: "#ff4d2d", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
          ✉️ Contacter le DPO
        </a>
      </div>
    </div>
  );
}
