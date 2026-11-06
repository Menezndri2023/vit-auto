import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { CalendarDays, Car, FilePen, Hand, LayoutDashboard, Receipt, Search } from "lucide-react";
import styles from "./WelcomeGuide.module.css";

const SEEN_KEY_PREFIX = "vit-welcome-guide-seen-";

// 3 conseils courts, adaptés au rôle — jamais un "tour" à étapes multiples
// (délibérément : "pas encombrant"), juste une carte discrète en coin d'écran,
// visible une seule fois par compte (localStorage), qui se ferme seule.
const GUIDES = {
  partenaire: {
    emoji: <Hand size={17} aria-hidden="true" />,
    title: "Bienvenue, partenaire !",
    tips: [
      { icon: <FilePen size={17} aria-hidden="true" />, text: "Complétez votre profil et vos documents (KYC) pour être vérifié." },
      { icon: <Car size={17} aria-hidden="true" />, text: "Publiez votre première annonce depuis votre tableau de bord." },
      { icon: <LayoutDashboard size={17} aria-hidden="true" />, text: "Suivez vos réservations et paiements en temps réel." },
    ],
    cta: { label: "Mon tableau de bord", to: "/vendor/dashboard" },
  },
  client: {
    emoji: <Hand size={17} aria-hidden="true" />,
    title: "Bienvenue chez VIT AUTO !",
    tips: [
      { icon: <Search size={17} aria-hidden="true" />, text: "Parcourez le catalogue et filtrez par ville, prix ou type de véhicule." },
      { icon: <CalendarDays size={17} aria-hidden="true" />, text: "Réservez en quelques clics — location, achat ou chauffeur privé." },
      { icon: <Receipt size={17} aria-hidden="true" />, text: "Retrouvez vos réservations depuis Mon Compte à tout moment." },
    ],
    cta: { label: "Voir le catalogue", to: "/catalogue" },
  },
};

const AUTO_DISMISS_MS = 25_000;
const APPEAR_DELAY_MS = 900; // laisse la page respirer avant d'afficher quoi que ce soit

export default function WelcomeGuide() {
  const { user, isAuthenticated } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Un admin n'a pas besoin d'un guide "explorez le catalogue" — ce compte
    // n'a jamais de parcours client/partenaire "première connexion" à guider.
    if (!isAuthenticated || !user?.id || user.role === "admin") return undefined;
    const key = `${SEEN_KEY_PREFIX}${user.id}`;
    let seen;
    try { seen = localStorage.getItem(key); } catch { seen = "1"; } // pas de localStorage → ne jamais gêner
    if (seen) return undefined;

    const appearTimer = setTimeout(() => setVisible(true), APPEAR_DELAY_MS);
    return () => clearTimeout(appearTimer);
  }, [isAuthenticated, user?.id, user?.role]);

  const dismiss = () => {
    setVisible(false);
    try {
      if (user?.id) localStorage.setItem(`${SEEN_KEY_PREFIX}${user.id}`, "1");
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!visible) return undefined;
    const t = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible || !user) return null;
  const guide = GUIDES[user.role] || GUIDES.client;

  return (
    <div className={styles.card} role="dialog" aria-label="Guide de bienvenue">
      <button className={styles.close} onClick={dismiss} aria-label="Fermer le guide">×</button>
      <div className={styles.header}>
        <span className={styles.emoji}>{guide.emoji}</span>
        <h4 className={styles.title}>{guide.title}</h4>
      </div>
      <ul className={styles.tips}>
        {guide.tips.map((tip, i) => (
          <li key={i} className={styles.tip}>
            <span className={styles.tipIcon}>{tip.icon}</span>
            <span>{tip.text}</span>
          </li>
        ))}
      </ul>
      <Link to={guide.cta.to} className={styles.cta} onClick={dismiss}>{guide.cta.label} →</Link>
    </div>
  );
}
