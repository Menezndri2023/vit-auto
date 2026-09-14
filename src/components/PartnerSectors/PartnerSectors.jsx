import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { ACTIVITY_LABELS, SECTEUR_LABELS } from "../../constants/partnerTaxonomy";
import { LIBELLE_PLAN } from "../../constants/planFeatures";

// ── Secteurs d'activité du partenaire ──────────────────────────────────────
//
// Un secteur (location, vente, export, chauffeur, loisirs) délimite ce que le
// compte publie et voit. Il s'ajoute par une DEMANDE que l'administration
// approuve — jamais par un simple bouton : chaque secteur a sa charge
// documentaire. Le plan fixe combien de secteurs se cumulent, et le quota
// d'annonces actives par secteur (source : GET /api/partner-sectors/me, qui
// fait autorité ; ce composant n'autorise rien).

const STATUT = {
  pending:  { label: "En attente",  bg: "#fef3c7", color: "#b45309" },
  approved: { label: "Accordé",     bg: "#d1fae5", color: "#047857" },
  rejected: { label: "Refusé",      bg: "#fee2e2", color: "#dc2626" },
};

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "");

export default function PartnerSectors() {
  const { authFetch } = useAuth();
  const [data, setData]       = useState(null);
  const [erreur, setErreur]   = useState("");
  const [secteur, setSecteur] = useState("");
  const [motif, setMotif]     = useState("");
  const [envoi, setEnvoi]     = useState(false);
  const [retour, setRetour]   = useState(null); // { ok, message }

  const charger = async () => {
    try {
      const r = await authFetch("/api/partner-sectors/me");
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Chargement impossible.");
      const d = await r.json();
      // Réponse défensive : une charge inattendue ne doit pas faire tomber
      // tout l'onglet Annonces pour une section.
      setData({ ...d, secteurs: d.secteurs || [], demandes: d.demandes || [], secteursDisponibles: d.secteursDisponibles || [], maxSecteurs: d.maxSecteurs ?? 1 });
      setErreur("");
    } catch (e) {
      setErreur(e.message);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- chargement initial uniquement
  useEffect(() => { charger(); }, []);

  const demander = async (e) => {
    e.preventDefault();
    if (!secteur) return;
    setEnvoi(true);
    setRetour(null);
    try {
      const r = await authFetch("/api/partner-sectors/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secteur, motif }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setRetour({ ok: false, message: d.message || "Demande refusée.", planRequis: d.code === "PLAN_REQUIS" });
      } else {
        setRetour({ ok: true, message: "Demande envoyée. L'équipe VIT AUTO l'examine avec les documents de votre dossier." });
        setSecteur("");
        setMotif("");
        await charger();
      }
    } catch {
      setRetour({ ok: false, message: "Erreur réseau, réessayez." });
    } finally {
      setEnvoi(false);
    }
  };

  if (erreur) return <p style={{ color: "#dc2626", fontSize: ".85rem" }}>{erreur}</p>;
  if (!data) return <p style={{ color: "#94a3b8", fontSize: ".85rem" }}>Chargement…</p>;

  const max = data.maxSecteurs;
  const peutAjouter = max === null || data.secteurs.length < max;
  const enAttente = data.demandes.filter((d) => d.status === "pending");

  return (
    <div>
      <p style={{ fontSize: ".85rem", color: "#64748b", margin: "0 0 12px" }}>
        Plan <strong>{LIBELLE_PLAN[data.plan] || data.plan}</strong> — {max === null ? "tous les secteurs" : `${max} secteur${max > 1 ? "s" : ""}`} sur ce compte.
        {data.immuniteJusquau && <> Annonces sans quota jusqu'au {fmtDate(data.immuniteJusquau)}.</>}
        {!data.immuniteJusquau && data.fondateur && <> Partenaire Fondateur : annonces sans quota.</>}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10, marginBottom: 16 }}>
        {data.secteurs.map((s) => (
          <div key={s.secteur} style={{ border: "1.5px solid #e2e8f0", borderRadius: 12, padding: "10px 12px", background: "#fff" }}>
            <div style={{ fontWeight: 700, color: "#0f1b3f", fontSize: ".9rem" }}>{s.label}</div>
            <div style={{ fontSize: ".78rem", color: "#64748b" }}>
              {s.actives} annonce{s.actives > 1 ? "s" : ""} active{s.actives > 1 ? "s" : ""}
              {s.quota !== null && <> sur {s.quota}</>}
            </div>
            {s.quota !== null && s.actives >= s.quota && (
              <div style={{ fontSize: ".74rem", color: "#b45309", marginTop: 4 }}>Quota atteint — <Link to="/plans">changer de plan</Link></div>
            )}
          </div>
        ))}
        {data.secteurs.length === 0 && (
          <div style={{ fontSize: ".82rem", color: "#94a3b8" }}>Aucun secteur déclaré : demandez-en un ci-dessous.</div>
        )}
      </div>

      {enAttente.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {enAttente.map((d) => (
            <div key={d._id} style={{ fontSize: ".8rem", color: "#b45309", background: "#fef3c7", borderRadius: 8, padding: "6px 10px", marginBottom: 6 }}>
              ⏳ Demande en attente : {SECTEUR_LABELS[d.secteur] || d.secteur} (déposée le {fmtDate(d.createdAt)})
            </div>
          ))}
        </div>
      )}

      {data.secteursDisponibles.length > 0 && (
        <form onSubmit={demander} style={{ display: "grid", gap: 8, maxWidth: 520 }}>
          <label style={{ fontSize: ".8rem", fontWeight: 600, color: "#334155" }}>
            Ajouter un secteur
            <select
              value={secteur}
              onChange={(e) => setSecteur(e.target.value)}
              disabled={!peutAjouter || envoi}
              style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
            >
              <option value="">— Choisir —</option>
              {data.secteursDisponibles
                .filter((s) => !enAttente.some((d) => d.secteur === s.id))
                .map((s) => <option key={s.id} value={s.id}>{ACTIVITY_LABELS[s.id] || s.label}</option>)}
            </select>
          </label>
          <label style={{ fontSize: ".8rem", fontWeight: 600, color: "#334155" }}>
            Ce que vous comptez y publier (facultatif)
            <textarea
              value={motif}
              onChange={(e) => setMotif(e.target.value.slice(0, 1000))}
              rows={2}
              disabled={!peutAjouter || envoi}
              placeholder="Ex. : 12 véhicules d'occasion à la vente, en plus de notre parc de location."
              style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem", fontFamily: "inherit" }}
            />
          </label>
          {!peutAjouter ? (
            <p style={{ fontSize: ".8rem", color: "#64748b", margin: 0 }}>
              Votre plan permet {max} secteur{max > 1 ? "s" : ""}. <Link to="/plans">Voir les plans</Link> pour en cumuler davantage.
            </p>
          ) : (
            <button
              type="submit"
              disabled={!secteur || envoi}
              style={{ justifySelf: "start", padding: "8px 16px", borderRadius: 8, border: "none", background: "#0f1b3f", color: "#fff", fontWeight: 700, fontSize: ".85rem", cursor: secteur && !envoi ? "pointer" : "not-allowed", opacity: secteur && !envoi ? 1 : .6 }}
            >
              {envoi ? "Envoi…" : "Demander l'ajout"}
            </button>
          )}
          {retour && (
            <p role="status" style={{ fontSize: ".82rem", margin: 0, color: retour.ok ? "#047857" : "#dc2626" }}>
              {retour.message}{retour.planRequis && <> <Link to="/plans">Voir les plans</Link></>}
            </p>
          )}
        </form>
      )}

      {data.demandes.some((d) => d.status !== "pending") && (
        <details style={{ marginTop: 14 }}>
          <summary style={{ fontSize: ".8rem", color: "#64748b", cursor: "pointer" }}>Historique des demandes</summary>
          <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", fontSize: ".8rem" }}>
            {data.demandes.filter((d) => d.status !== "pending").map((d) => (
              <li key={d._id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                <span style={{ padding: "2px 8px", borderRadius: 999, fontWeight: 700, fontSize: ".72rem", background: STATUT[d.status].bg, color: STATUT[d.status].color }}>{STATUT[d.status].label}</span>
                <span>{SECTEUR_LABELS[d.secteur] || d.secteur} — {fmtDate(d.reviewedAt || d.createdAt)}</span>
                {d.note && <span style={{ color: "#64748b" }}>· {d.note}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
