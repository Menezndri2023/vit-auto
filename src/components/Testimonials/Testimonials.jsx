import { useEffect, useState } from "react";
import { useI18n } from "../../context/I18nContext";
import styles from "./Testimonials.module.css";

// ═══════════════════════════════════════════════════════════════════════════
// TÉMOIGNAGES — avis RÉELS uniquement
// ═══════════════════════════════════════════════════════════════════════════
// Cette section affichait quatre témoignages FABRIQUÉS : personnes inventées
// avec nom, fonction et ville, affirmations chiffrées précises (« Livraison à
// Abidjan en 35 jours », « Revenue doubled in 6 months »), toutes notées
// 5 étoiles — plus une note globale « 4,9 / 5, basé sur 2 400+ avis vérifiés »
// écrite en dur.
//
// Sur une plateforme qui encaisse des paiements et séquestre des fonds, ce sont
// des allégations commerciales trompeuses, et « avis vérifiés » est une mention
// réglementée. Le risque pratique est tout aussi réel : un visiteur qui
// reconnaît de faux témoignages doute ensuite de tout le reste du site — de
// l'inspection, du séquestre, des délais annoncés.
//
// La section s'alimente désormais aux avis réels, déjà modérés
// (GET /api/reviews/showcase). Tant qu'il n'y en a pas assez, elle ne s'affiche
// PAS : mieux vaut une page d'accueil plus courte qu'une preuve sociale
// inventée. Elle réapparaîtra d'elle-même dès que les avis arriveront.

const MINIMUM_AVIS = 3;

// Code pays ISO → drapeau (indicateurs régionaux Unicode).
const drapeau = (code) => {
  if (!code || code.length !== 2) return "";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));
};

const initiales = (nom = "") => nom.split(" ").filter(Boolean).slice(0, 2).map((m) => m[0]).join("");

const Stars = ({ n }) => (
  <div className={styles.stars}>
    {[...Array(5)].map((_, i) => (
      <span key={i} className={i < n ? styles.starOn : styles.starOff}>★</span>
    ))}
  </div>
);

const Testimonials = () => {
  const { t } = useI18n();
  const [avis, setAvis] = useState(null);

  useEffect(() => {
    let annule = false;
    fetch("/api/reviews/showcase?limit=6")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!annule) setAvis(d?.reviews || []); })
      .catch(() => { if (!annule) setAvis([]); });
    return () => { annule = true; };
  }, []);

  // En cours de chargement (null) comme en cas d'avis insuffisants : rien.
  // Aucun état de chargement visible — une section qui apparaît puis disparaît
  // serait plus déroutante que son absence.
  if (!avis || avis.length < MINIMUM_AVIS) return null;

  const moyenne = Math.round((avis.reduce((s, a) => s + a.note, 0) / avis.length) * 10) / 10;

  return (
    <section className={styles.section}>
      <div className={styles.container}>

        <div className={styles.header}>
          <span className={styles.tag}>{t("home.reviewsTag")}</span>
          <h2 className={styles.title}>{t("home.reviewsTitle")}</h2>
          <p className={styles.sub}>
            {t("home.reviewsSubtitle")}
          </p>
        </div>

        <div className={styles.grid}>
          {avis.map((a) => (
            <article key={a._id} className={styles.card}>
              <span className={styles.quote}>&quot;</span>
              <Stars n={a.note} />
              <p className={styles.text}>{a.commentaire}</p>
              <div className={styles.footer}>
                <div className={styles.avatarCircle}>{initiales(a.auteur)}</div>
                <div>
                  <span className={styles.name}>{drapeau(a.pays)} {a.auteur}</span>
                  <span className={styles.role}>
                    {new Date(a.createdAt).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>

        {/* Note calculée sur les avis réellement affichés — jamais un chiffre
            décoratif. Le nombre indiqué est celui des avis présents ci-dessus,
            sans arrondi flatteur ni « + ». */}
        <div className={styles.globalRating}>
          <div className={styles.ratingStars}>{"★".repeat(Math.round(moyenne))}</div>
          <div className={styles.ratingText}>
            <strong>{moyenne.toLocaleString("fr-FR")} / 5</strong>
            {" — "}{t("home.reviewsAverage", { n: avis.length })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
