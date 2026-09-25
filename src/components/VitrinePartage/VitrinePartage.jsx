import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext.jsx";
import styles from "./VitrinePartage.module.css";

// ── Le lien que le partenaire donne à ses clients ──────────────────────────
//
// Demande de l'exploitant (2026-09-25) : chaque partenaire dispose d'un lien
// de vitrine qu'il peut partager, ne contenant QUE ses annonces ;
// l'administrateur peut partager ces liens ; ils sont octroyés selon le plan.
//
// La page /partner/<id> existait depuis longtemps — ce qui manquait, c'est
// qu'aucun écran, nulle part, ne DONNAIT le lien. Un partenaire ne pouvait
// l'obtenir qu'en le fabriquant à la main depuis la barre d'adresse.
//
// Ce composant sert les deux cas : le partenaire pour lui-même (sans
// `partenaireId`), l'administrateur pour un partenaire donné.
export default function VitrinePartage({ partenaireId = null, compact = false }) {
  // Le site s'authentifie par JETON, pas par cookie de session. Écrit d'abord
  // avec `credentials: "include"`, ce composant recevait un 401 sur le tableau
  // de bord partenaire — attrapé par le balayage navigateur du hook, qui
  // surveille les requêtes en échec, et par rien d'autre : l'écran se
  // contentait de ne rien afficher.
  const { token } = useAuth();
  const [vitrine, setVitrine] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [copie, setCopie] = useState(null);

  useEffect(() => {
    if (!token) return undefined;
    let annule = false;
    const url = partenaireId ? `/api/partenaires/${partenaireId}/vitrine` : "/api/partenaires/ma-vitrine";
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (!annule) setVitrine(d); })
      .catch(() => { if (!annule) setErreur("Lien de vitrine indisponible pour le moment."); });
    return () => { annule = true; };
  }, [partenaireId, token]);

  // Retour visible et bref. Sans lui, le partenaire appuie deux fois faute de
  // savoir si le premier appui a compté — c'est exactement la plainte remontée
  // sur les autres boutons de l'application.
  const copier = async (valeur, cle) => {
    try {
      await navigator.clipboard.writeText(valeur);
      setCopie(cle);
      setTimeout(() => setCopie((c) => (c === cle ? null : c)), 1800);
    } catch {
      setErreur("Copie impossible — sélectionnez le lien pour le copier à la main.");
    }
  };

  const partager = async (url, titre) => {
    // Sur mobile, le partage natif ouvre WhatsApp, Messages et le reste : c'est
    // là que ces liens circulent réellement. Le presse-papier reste le repli.
    if (navigator.share) {
      try { await navigator.share({ title: titre, url }); return; } catch { /* annulé par l'utilisateur */ }
    }
    copier(url, "partage");
  };

  if (erreur && !vitrine) return <div className={styles.carte}><p className={styles.alerte}>{erreur}</p></div>;
  if (!vitrine) return null;

  const { lien, lienCourt, qr, annonces, partenaire, lienCourtOuvert, planRequis, message } = vitrine;
  const aPartager = lienCourt || lien;

  return (
    <section className={styles.carte} aria-labelledby="vitrine-partage-titre">
      <div className={styles.entete}>
        <h3 className={styles.titre} id="vitrine-partage-titre">
          {partenaireId ? `Vitrine de ${partenaire?.nom || "ce partenaire"}` : "Ma vitrine à partager"}
        </h3>
      </div>
      {!compact && (
        <p className={styles.sous}>
          Une seule adresse à donner — carte de visite, WhatsApp, devanture. Le client y voit
          {partenaireId ? " les annonces de ce partenaire" : " vos annonces"} et réserve directement.
        </p>
      )}

      <p className={styles.compte}>
        {annonces === 0
          ? "Aucune annonce publiée pour l'instant : la page existe, mais elle sera vide."
          : `${annonces} annonce${annonces > 1 ? "s" : ""} visible${annonces > 1 ? "s" : ""} sur cette page.`}
      </p>

      {/* UN SEUL lien. Cet écran en affichait deux — l'adresse courte ET
          l'adresse longue, chacune avec son bouton « Copier » — au motif que
          la longue fonctionne quel que soit le palier. À l'usage, le partenaire
          ne sait plus lequel donner : deux adresses pour une même page, c'est
          une hésitation à chaque partage, et deux liens qui circulent pour la
          même vitrine. On donne la meilleure disponible : l'adresse courte
          quand le palier l'ouvre, la longue sinon. (Constat de l'exploitant,
          2026-09-25.) */}
      <div className={styles.ligne}>
        <input
          className={styles.champ}
          value={aPartager}
          readOnly
          aria-label="Adresse de la vitrine"
          onFocus={(e) => e.target.select()}
        />
        <button type="button" className={styles.bouton} onClick={() => copier(aPartager, "lien")}>
          {copie === "lien" ? "Copié ✓" : "Copier"}
        </button>
        <button type="button" className={`${styles.bouton} ${styles.secondaire}`} onClick={() => partager(aPartager, partenaire?.nom)}>
          Partager
        </button>
      </div>

      {qr && (
        <div className={styles.qrBloc}>
          <img className={styles.qr} src={qr} alt={`QR code de la vitrine ${partenaire?.nom || ""}`} width="132" height="132" />
          <p className={styles.qrTexte}>
            À imprimer sur une devanture, une carte ou un flyer : le client scanne et arrive sur la vitrine.{" "}
            <a href={qr} download={`vitrine-${partenaire?.nom || "vit-auto"}.png`}>Télécharger l'image</a>
          </p>
        </div>
      )}

      {!lienCourtOuvert && (
        <p className={styles.verrou}>
          <strong>Adresse courte et QR code</strong> — {message
            || `Inclus à partir du plan ${planRequis === "individuel_plus" ? "Essentiel" : planRequis}.`}
          {" "}Votre page reste publique et partageable avec l'adresse ci-dessus.
        </p>
      )}

      {erreur && <p className={styles.alerte}>{erreur}</p>}
      {aPartager && <span hidden data-lien-vitrine={aPartager} />}
    </section>
  );
}
