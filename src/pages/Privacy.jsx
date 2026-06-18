import React from "react";

const Section = ({ title, children }) => (
  <div style={{ marginBottom: 36 }}>
    <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", marginBottom: 12, borderLeft: "3px solid #ff4d2d", paddingLeft: 12 }}>
      {title}
    </h2>
    <div style={{ color: "#4a5876", fontSize: "0.93rem", lineHeight: 1.75 }}>{children}</div>
  </div>
);

export default function Privacy() {
  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "48px 24px 80px" }}>
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontSize: "clamp(1.6rem,2.5vw,2.2rem)", fontWeight: 900, color: "#0f1b3f", margin: "0 0 8px" }}>
          Politique de confidentialité
        </h1>
        <p style={{ color: "#8493b0", fontSize: "0.85rem" }}>Dernière mise à jour : Juin 2026 · Applicable à VIT AUTO (vit-auto.com)</p>
      </div>

      <Section title="1. Responsable du traitement">
        <p>VIT AUTO, société basée à Route 1029, Hay Sidi Maârouf 1, 20520 Casablanca, Maroc.<br />
        Contact DPO : <a href="mailto:contact@vit-auto.com" style={{ color: "#ff4d2d" }}>contact@vit-auto.com</a> · +212 0607742672</p>
      </Section>

      <Section title="2. Données collectées">
        <p>Nous collectons les données suivantes :</p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          <li><strong>Identité :</strong> nom, prénom, email, téléphone, pièce d'identité (CNI/passeport)</li>
          <li><strong>Localisation :</strong> position GPS (uniquement lors de la réservation, avec votre consentement explicite)</li>
          <li><strong>Données de paiement :</strong> méthode de paiement, identifiant de transaction (jamais le numéro de carte complet)</li>
          <li><strong>Navigation :</strong> cookies de session, logs d'accès anonymisés</li>
          <li><strong>Véhicules publiés :</strong> photos, descriptions, prix, localisation de l'annonce</li>
        </ul>
      </Section>

      <Section title="3. Finalités du traitement">
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
          <li>Création et gestion de votre compte</li>
          <li>Traitement des réservations et paiements</li>
          <li>Calcul de la livraison géolocalisée (distance partenaire ↔ client)</li>
          <li>Vérification d'identité et prévention de la fraude</li>
          <li>Communication transactionnelle (confirmations, contrats, SMS OTP)</li>
          <li>Amélioration de nos services</li>
        </ul>
      </Section>

      <Section title="4. Base légale">
        <p>Le traitement est fondé sur :</p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          <li><strong>Exécution d'un contrat</strong> — pour les données nécessaires à la réservation</li>
          <li><strong>Consentement</strong> — pour la géolocalisation et les cookies non essentiels</li>
          <li><strong>Intérêt légitime</strong> — pour la sécurité et la prévention de la fraude</li>
        </ul>
      </Section>

      <Section title="5. Conservation des données">
        <p>Vos données personnelles sont conservées pendant la durée de votre compte actif, puis archivées 3 ans après la dernière activité, conformément aux obligations légales. Les données de localisation GPS sont supprimées après 90 jours.</p>
      </Section>

      <Section title="6. Partage des données">
        <p>Nous ne vendons jamais vos données. Elles peuvent être partagées avec :</p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          <li><strong>Les partenaires</strong> — uniquement les informations nécessaires à votre réservation</li>
          <li><strong>Prestataires de paiement</strong> — Orange Money, Wave, Stripe, CMI</li>
          <li><strong>Hébergeurs</strong> — Railway (serveur), Vercel (frontend), MongoDB Atlas (base de données)</li>
          <li><strong>Autorités compétentes</strong> — sur réquisition judiciaire uniquement</li>
        </ul>
      </Section>

      <Section title="7. Vos droits">
        <p>Conformément au RGPD et à la loi marocaine 09-08, vous disposez des droits suivants :</p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          <li><strong>Accès</strong> — obtenir une copie de vos données</li>
          <li><strong>Rectification</strong> — corriger des données inexactes</li>
          <li><strong>Effacement</strong> — supprimer votre compte et données associées</li>
          <li><strong>Opposition</strong> — vous opposer à certains traitements</li>
          <li><strong>Portabilité</strong> — recevoir vos données dans un format lisible</li>
        </ul>
        <p style={{ marginTop: 12 }}>Pour exercer vos droits : <a href="mailto:contact@vit-auto.com" style={{ color: "#ff4d2d" }}>contact@vit-auto.com</a></p>
      </Section>

      <Section title="8. Cookies">
        <p>Nous utilisons des cookies strictement nécessaires au fonctionnement du site (session, préférences de langue et devise). Aucun cookie publicitaire tiers n'est installé sans votre consentement.</p>
      </Section>

      <Section title="9. Sécurité">
        <p>Vos données sont protégées par chiffrement TLS 1.3, hashage BCrypt des mots de passe, et contrôle d'accès par JWT. Nos serveurs sont hébergés dans des datacenters certifiés ISO 27001.</p>
      </Section>

      <Section title="10. Contact">
        <p>Pour toute question relative à la protection de vos données :<br />
        📧 <a href="mailto:contact@vit-auto.com" style={{ color: "#ff4d2d" }}>contact@vit-auto.com</a><br />
        📞 <a href="tel:+2120607742672" style={{ color: "#ff4d2d" }}>+212 0607742672</a><br />
        📍 Route 1029, Hay Sidi Maârouf 1, 20520 Casablanca, Maroc</p>
      </Section>
    </div>
  );
}
