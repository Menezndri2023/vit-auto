import { useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./Help.module.css";

const faqs = [
  {
    q: "Comment créer un compte sur VIT AUTO ?",
    a: "Cliquez sur « Inscription » en haut de la page, renseignez vos informations (nom, e-mail, mot de passe) et validez. Vous recevrez un e-mail de confirmation.",
  },
  {
    q: "Comment réserver un véhicule ?",
    a: "Parcourez le catalogue, choisissez votre véhicule et cliquez sur « Réserver ». Sélectionnez vos dates, vérifiez le récapitulatif, puis confirmez la réservation.",
  },
  {
    q: "Quels modes de paiement sont acceptés ?",
    a: "Nous acceptons les cartes bancaires (Visa, Mastercard) ainsi que les paiements via Mobile Money. Le paiement est sécurisé et chiffré.",
  },
  {
    q: "Puis-je annuler ma réservation ?",
    a: "Oui. Vous pouvez annuler depuis votre tableau de bord jusqu'à 24 h avant la date de prise en charge pour obtenir un remboursement complet.",
  },
  {
    q: "Comment devenir partenaire (loueur) ?",
    a: "Inscrivez-vous puis sélectionnez le rôle « Partenaire ». Après validation de votre profil, vous pourrez publier vos véhicules et gérer vos réservations depuis votre espace partenaire.",
  },
  {
    q: "Que faire en cas de panne pendant la location ?",
    a: "Contactez notre assistance 24h/24 via le numéro fourni dans votre confirmation de réservation. Un service de dépannage sera dépêché dans les meilleurs délais.",
  },
];

const FAQ = ({ q, a }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className={`${styles.faqItem} ${open ? styles.faqOpen : ""}`}>
      <button className={styles.faqQuestion} onClick={() => setOpen((o) => !o)}>
        <span>{q}</span>
        <span className={styles.faqIcon}>{open ? "−" : "+"}</span>
      </button>
      {open && <div className={styles.faqAnswer}>{a}</div>}
    </div>
  );
};

const Help = () => {
  const navigate = useNavigate();

  return (
    <div className={styles.page}>
      {/* Hero */}
      <section className={styles.hero}>
        <span className={styles.heroBadge}>Centre d'aide</span>
        <h1>Comment pouvons-nous vous aider ?</h1>
        <p>Trouvez rapidement des réponses à vos questions sur VIT AUTO.</p>
      </section>

      {/* Quick links */}
      <section className={styles.quickLinks}>
        <div className={styles.qlCard} onClick={() => navigate("/catalogue")}>
          <span className={styles.qlIcon}>🚗</span>
          <h3>Nos véhicules</h3>
          <p>Parcourir le catalogue</p>
        </div>
        <div className={styles.qlCard} onClick={() => navigate("/register")}>
          <span className={styles.qlIcon}>👤</span>
          <h3>Mon compte</h3>
          <p>Créer ou accéder à mon compte</p>
        </div>
        <div className={styles.qlCard} onClick={() => navigate("/services")}>
          <span className={styles.qlIcon}>🛡️</span>
          <h3>Nos services</h3>
          <p>Découvrir ce que nous offrons</p>
        </div>
      </section>

      {/* FAQ */}
      <section className={styles.faqSection}>
        <div className={styles.sectionHeader}>
          <h2>Questions fréquentes</h2>
          <p>Vous ne trouvez pas votre réponse ? Contactez-nous directement.</p>
        </div>
        <div className={styles.faqList}>
          {faqs.map((f) => (
            <FAQ key={f.q} q={f.q} a={f.a} />
          ))}
        </div>
      </section>

      {/* Contact */}
      <section className={styles.contact}>
        <div className={styles.contactCard}>
          <div className={styles.contactIcon}>✉️</div>
          <h3>Contactez-nous</h3>
          <p>Notre équipe répond sous 24 heures.</p>
          <a href="mailto:support@vitauto.com" className={styles.contactBtn}>
            support@vitauto.com
          </a>
        </div>
        <div className={styles.contactCard}>
          <div className={styles.contactIcon}>📞</div>
          <h3>Assistance téléphonique</h3>
          <p>Disponible du lundi au vendredi, 8h – 20h.</p>
          <a href="tel:+261340000000" className={styles.contactBtn}>
            +261 34 00 000 00
          </a>
        </div>
      </section>
    </div>
  );
};

export default Help;
