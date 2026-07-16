import React from "react";
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

export default function CGV() {
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
        }}>🧾 CONDITIONS DE VENTE</span>
        <h1 style={{ margin: "0 0 10px", fontSize: "clamp(1.5rem,2.5vw,2rem)", fontWeight: 900 }}>
          Conditions Générales de Vente
        </h1>
        <p style={{ margin: 0, color: "rgba(255,255,255,.65)", fontSize: "0.85rem" }}>
          Juillet 2026 · VIT AUTO
        </p>
      </div>

      <div style={{
        background: "#fffbeb", border: "1.5px solid #fde68a", borderRadius: 12,
        padding: "14px 18px", marginBottom: 40, fontSize: "0.85rem", color: "#92400e",
      }}>
        ⚠️ <strong>Document rédigé le 2026-07-16, à faire valider par un juriste avant publication
        officielle</strong> — en particulier les articles 6 (droit de rétractation) et 8 (garanties),
        dont l'application exacte dépend du pays de l'acheteur et du statut (particulier/professionnel)
        du vendeur, et doit être confirmée pays par pays (voir la phase "International" de ce projet).
      </div>

      <Art n="1" title="Objet et champ d'application">
        <p>
          Les présentes Conditions Générales de Vente (CGV) s'appliquent à toute transaction d'<strong>achat</strong> conclue
          sur la plateforme VIT AUTO : vente de véhicule au comptant, achat à crédit ou en leasing, et transaction
          Import/Export. Elles complètent, sans s'y substituer, les{" "}
          <Link to="/cgu" style={{ color: "#ff4d2d", fontWeight: 700 }}>Conditions Générales d'Utilisation</Link>{" "}
          qui régissent l'accès et l'usage général de la plateforme.
        </p>
        <p style={{ marginTop: 10 }}>
          VIT AUTO est une plateforme d'<strong>intermédiation</strong> : le contrat de vente se conclut entre le
          client et le partenaire vendeur/exportateur. VIT AUTO n'est jamais elle-même vendeuse du véhicule.
        </p>
      </Art>

      <Art n="2" title="Formation de la commande">
        <p>Une commande est réputée formée lorsque :</p>
        <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
          <Li>Pour un achat classique : le paiement est confirmé (ou l'acompte pour un financement) et une confirmation est envoyée au client</Li>
          <Li>Pour une transaction Import/Export : le fournisseur a confirmé la réservation, puis envoyé une <strong>offre finale</strong> détaillant tous les frais, acceptée explicitement par le client avant tout paiement</Li>
        </ul>
      </Art>

      <Art n="3" title="Prix, devise et frais">
        <p>
          Les prix affichés sont indiqués dans la devise choisie ou détectée automatiquement pour l'acheteur, à titre
          indicatif — la devise de référence contractuelle reste celle définie par le vendeur/partenaire au moment de
          la publication de l'annonce. Pour une transaction Import/Export, le montant final inclut, le cas échéant :
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
          <Li>Le prix du véhicule</Li>
          <Li>Le transport intérieur (garage → port d'origine) et le fret maritime</Li>
          <Li>L'assurance transport, les frais portuaires, les droits de douane et taxes du pays de destination</Li>
          <Li>La livraison finale jusqu'à la ville de destination</Li>
          <Li>Les frais de service VIT AUTO applicables</Li>
        </ul>
        <p style={{ marginTop: 10 }}>
          Une estimation de ces frais peut être affichée avant réservation à titre indicatif — seule l'<strong>offre finale</strong>{" "}
          envoyée par le fournisseur et acceptée par le client constitue l'engagement contractuel définitif.
        </p>
      </Art>

      <Art n="4" title="Moyens de paiement">
        <p>Selon le service, un ou plusieurs moyens de paiement peuvent être proposés :</p>
        <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
          <Li><strong>Paiement par carte bancaire</strong> — traité et confirmé automatiquement via notre prestataire de paiement</Li>
          <Li><strong>Orange Money / Wave</strong> — traité et confirmé automatiquement</Li>
          <Li><strong>Virement bancaire, mobile money (autre opérateur), cryptomonnaie ou espèces</strong> — le client déclare son paiement, qui est ensuite <strong>vérifié manuellement</strong> par un administrateur avant validation ; ce délai de vérification manuelle peut retarder la confirmation de quelques heures à quelques jours ouvrés</Li>
        </ul>
        <p style={{ marginTop: 10 }}>
          Pour les transactions Import/Export, les fonds sont conservés en <strong>séquestre (escrow)</strong> par VIT AUTO
          jusqu'à confirmation de la livraison par le client, puis libérés au partenaire.
        </p>
      </Art>

      <Art n="5" title="Livraison et délais">
        <p>
          Les délais indiqués (livraison locale ou expédition internationale) sont des <strong>estimations</strong>, non
          des engagements de résultat, et dépendent de facteurs hors du contrôle de VIT AUTO (transporteurs, douanes,
          conditions locales). En cas de retard significatif, le client peut contacter le support ou, pour une
          transaction Import/Export, ouvrir un litige directement depuis le suivi de sa transaction.
        </p>
      </Art>

      <Art n="6" title="Droit de rétractation">
        <p>
          ⚠️ <strong>À confirmer par un juriste selon la juridiction de l'acheteur</strong> — l'existence et l'étendue d'un
          droit de rétractation pour l'achat d'un véhicule à distance varient selon le pays, le statut du vendeur
          (particulier ou professionnel) et le type de transaction. Certaines juridictions excluent ou limitent ce
          droit pour les biens fabriqués/personnalisés à la demande, ou une fois la prestation de transport engagée.
          Cette clause doit être complétée pays par pays avant publication officielle.
        </p>
      </Art>

      <Art n="7" title="Annulation">
        <p>
          Une réservation peut être annulée par le client tant qu'elle n'a pas été confirmée par le partenaire, ou
          selon les conditions spécifiques affichées à l'étape de réservation (le cas échéant, caution ou acompte non
          remboursable). Pour une transaction Import/Export, l'annulation est possible à certaines étapes du parcours
          (voir le détail affiché dans le suivi de transaction) ; au-delà de la mise sous séquestre des fonds,
          l'annulation passe par la procédure de litige (article 9).
        </p>
      </Art>

      <Art n="8" title="État du véhicule et garanties">
        <p>
          Sauf mention contraire explicite dans l'annonce, les véhicules d'occasion sont vendus <strong>en l'état</strong>,
          sur la base des informations, photos et éventuel rapport d'inspection indépendante fournis par le vendeur/partenaire.
          Le client est invité à vérifier ces informations avant tout engagement, et à demander une inspection
          indépendante lorsque ce service est disponible (transactions Import/Export).
        </p>
        <p style={{ marginTop: 10 }}>
          ⚠️ La garantie légale contre les vices cachés et, le cas échéant, la garantie de conformité applicable aux
          ventes par un professionnel à un consommateur, s'appliquent selon le droit applicable et ne peuvent être
          exclues par une simple mention "vendu en l'état" — <strong>à confirmer et détailler par un juriste</strong> pour
          chaque pays d'opération.
        </p>
      </Art>

      <Art n="9" title="Remboursement et résolution des litiges">
        <p>
          Les remboursements ne sont pas automatiques : ils font l'objet d'une <strong>décision au cas par cas</strong> par
          notre équipe support/administration, après examen du litige entre le client et le partenaire, puis sont
          exécutés manuellement (le prestataire de paiement concerné n'est pas débité automatiquement par la
          plateforme). Pour une transaction Import/Export, un litige peut être ouvert directement depuis le suivi de
          la transaction ; un administrateur VIT AUTO tranche après avoir recueilli les éléments des deux parties, et
          peut décider d'un remboursement total ou partiel du client, du versement au partenaire, ou d'une solution
          intermédiaire.
        </p>
      </Art>

      <Art n="10" title="Responsabilité">
        <p>
          VIT AUTO agit en tant qu'intermédiaire technique et de mise en relation. Elle ne saurait être tenue
          responsable de l'inexécution ou de la mauvaise exécution du contrat de vente par le vendeur/partenaire,
          ni des conséquences d'informations inexactes fournies par ce dernier.
        </p>
      </Art>

      <Art n="11" title="Droit applicable et litiges">
        <p>
          À défaut de disposition impérative contraire applicable dans le pays de l'acheteur, les présentes CGV sont
          régies par le droit marocain. En cas de désaccord persistant après tentative de résolution amiable via le
          support VIT AUTO, les tribunaux compétents de Casablanca seront saisis — sous réserve des règles de
          protection du consommateur d'ordre public applicables dans le pays de résidence de l'acheteur.
        </p>
      </Art>

      {/* Liens légaux */}
      <div style={{
        background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14,
        padding: "20px 24px", display: "flex", gap: 20, flexWrap: "wrap",
      }}>
        <Link to="/cgu" style={{ color: "#ff4d2d", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
          📄 Conditions générales d'utilisation
        </Link>
        <Link to="/privacy" style={{ color: "#ff4d2d", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
          🔒 Politique de confidentialité
        </Link>
        <Link to="/cookies" style={{ color: "#ff4d2d", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
          🍪 Politique Cookies
        </Link>
        <a href="mailto:contact@vit-auto.com" style={{ color: "#ff4d2d", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
          ✉️ Nous contacter
        </a>
      </div>
    </div>
  );
}
