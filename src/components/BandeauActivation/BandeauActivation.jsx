import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

// Activation du partenaire (prompt maître §6, 2026-10-28) — distincte de la
// validation des documents (BandeauValidation) : un compte vérifié n'est
// « activé » que s'il peut réellement servir un client (profil complet, offre
// exploitable, contact vérifié). Calculé par le serveur (/api/users/me/activation).
// Le critère « documents vérifiés » est laissé au bandeau de validation, pour
// ne jamais afficher deux fois la même demande.
const LIENS = { profilComplet: "/profile", offresExploitables: "/vendor/publish", joignable: "/profile" };

export default function BandeauActivation({ token, styles }) {
  const [a, setA] = useState(null);
  useEffect(() => {
    if (!token) return undefined;
    const ctrl = new AbortController();
    fetch("/api/users/me/activation", { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setA(d?.activation || null))
      .catch(() => {});
    return () => ctrl.abort();
  }, [token]);

  if (!a || a.statut === "suspendu" || a.statut === "inscrit") return null;   // inscrit : le bandeau de validation s'en charge
  if (a.statut === "active") {
    const d = a.premieresDemandes || {};
    return (
      <div className={styles.freeBanner} style={{ borderColor: "#86efac" }}>
        <span className={styles.planBadge} style={{ background: "#dcfce7", color: "#15803d" }}>✅ Compte activé</span>
        <span>
          {a.offres.total} offre(s) en ligne · {d.recues || 0} demande(s) reçue(s), {d.repondues || 0} traitée(s)
          {d.delaiMoyenReponseMin != null ? ` · délai moyen de réponse : ${Math.round(d.delaiMoyenReponseMin)} min` : ""}.
        </span>
      </div>
    );
  }
  const manquants = a.manquants.filter((m) => m.code !== "verifie");
  if (!manquants.length) return null;
  return (
    <div className={styles.freeBanner} style={{ borderColor: "#a5b4fc" }}>
      <span className={styles.planBadge} style={{ background: "#e0e7ff", color: "#4338ca" }}>🚀 Presque activé</span>
      <span>
        Vos documents sont en règle. Pour recevoir vos premières demandes, il reste :{" "}
        {manquants.map((m, i) => <span key={m.code}>{i ? ", " : ""}<Link to={LIENS[m.code] || "/vendor/dashboard"}>{m.libelle.toLowerCase()}</Link></span>)}.
      </span>
      <Link to={LIENS[manquants[0].code] || "/vendor/dashboard"} className={styles.upgradeLink}>Compléter →</Link>
    </div>
  );
}
