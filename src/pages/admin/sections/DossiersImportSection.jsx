import { useCallback, useEffect, useState } from "react";
import { fmtDate } from "../shared.jsx";
import { ETAPES, libelleEtape, nomPays, DESTINATIONS, ORIGINES, STATUTS_DOCUMENT, STATUTS_PACK } from "../../../constants/dossierImport";
import css from "./DossiersImportSection.module.css";

// ── Dossiers d'import (2026-10-07) ─────────────────────────────────────────
// Pilotage par VIT AUTO de chaque importation client : devis, frais
// d'accompagnement, étapes du suivi (le client est prévenu à chaque étape
// visible), documents, expédition, notes internes. Autonome : charge ses
// données lui-même (/api/dossiers-import).

const lireFichier = (fichier) => new Promise((ok, ko) => {
  const r = new FileReader();
  r.onload = () => ok(r.result);
  r.onerror = () => ko(new Error("Lecture du fichier impossible."));
  r.readAsDataURL(fichier);
});

function Detail({ id, headers, moi, onFermer, onChange }) {
  const [d, setD] = useState(null);
  const [ports, setPorts] = useState([]);
  const [erreur, setErreur] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [etape, setEtape] = useState({ code: "", note: "", visible: true });
  const [note, setNote] = useState("");
  const [lignes, setLignes] = useState([]);
  const [prestataires, setPrestataires] = useState([]);
  const [choixPresta, setChoixPresta] = useState("");

  const appel = useCallback(async (url, options = {}) => {
    setOccupe(true); setErreur("");
    try {
      const r = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...headers } });
      const c = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(c.message || "Erreur.");
      if (c.dossier) { setD(c.dossier); onChange?.(); }
      return c;
    } catch (e) { setErreur(e.message); return null; } finally { setOccupe(false); }
  }, [headers, onChange]);

  useEffect(() => {
    appel(`/api/dossiers-import/${id}`).then((c) => c?.dossier && setLignes(c.dossier.devis?.lignes?.length ? c.dossier.devis.lignes : [{ libelle: "", montant: "" }]));
    fetch("/api/dossiers-import/referentiel", { headers }).then((r) => r.json()).then((c) => setPorts(c.ports || [])).catch(() => {});
    fetch("/api/transit/admin/prestataires", { headers }).then((r) => r.json()).then((c) => setPrestataires((c.prestataires || []).filter((p) => p.statut === "actif"))).catch(() => {});
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!d) return <div className={css.panneau}><p>{erreur || "Chargement…"}</p></div>;

  const modifier = (corps) => appel(`/api/dossiers-import/${id}`, { method: "PATCH", body: JSON.stringify(corps) });
  const champ = (chemin, valeur) => {
    const [a, b] = chemin.split(".");
    return modifier({ [a]: { [b]: valeur } });
  };
  const portsDe = (pays) => ports.filter((p) => !pays || p.pays === pays);

  return (
    <div className={css.panneau}>
      <div className={css.panneauEntete}>
        <div>
          <h3>{d.reference} — {d.vehicule?.titre || "Véhicule à définir"}</h3>
          <p className={css.muted}>
            {d.client?.firstName} {d.client?.lastName} · {d.client?.email} · {d.client?.phone || "sans téléphone"}
          </p>
        </div>
        <button type="button" className={css.btnSec} onClick={onFermer}>Fermer</button>
      </div>
      {erreur && <p className={css.erreur}>{erreur}</p>}

      <div className={css.grille2}>
        <fieldset className={css.bloc}>
          <legend>Trajet</legend>
          <label>Origine
            <select value={d.origine?.pays || ""} onChange={(e) => champ("origine.pays", e.target.value)} disabled={occupe}>
              <option value="">—</option>{ORIGINES.map((o) => <option key={o.code} value={o.code}>{o.nom}</option>)}
            </select>
          </label>
          <label>Port de départ
            <select value={d.origine?.port || ""} onChange={(e) => champ("origine.port", e.target.value)} disabled={occupe}>
              <option value="">—</option>{portsDe(d.origine?.pays).map((p) => <option key={p.code} value={p.code}>{p.nom}</option>)}
            </select>
          </label>
          <label>Destination
            <select value={d.destination?.pays || ""} onChange={(e) => champ("destination.pays", e.target.value)} disabled={occupe}>
              <option value="">—</option>{DESTINATIONS.map((o) => <option key={o.code} value={o.code}>{o.nom}</option>)}
            </select>
          </label>
          <label>Port d'arrivée
            <select value={d.destination?.port || ""} onChange={(e) => champ("destination.port", e.target.value)} disabled={occupe}>
              <option value="">—</option>{portsDe(d.destination?.pays).map((p) => <option key={p.code} value={p.code}>{p.nom}</option>)}
            </select>
          </label>
          <p className={css.muted}>Conseiller : {d.conseiller ? `${d.conseiller.firstName} ${d.conseiller.lastName}` : "aucun"}{" "}
            {moi && String(d.conseiller?._id || d.conseiller) !== String(moi) && (
              <button type="button" className={css.lien} onClick={() => modifier({ conseiller: moi })} disabled={occupe}>M'attribuer le dossier</button>
            )}
          </p>
        </fieldset>

        <fieldset className={css.bloc}>
          <legend>Zone Transit</legend>
          {(d.prestataires || []).length === 0 && <p className={css.muted}>Aucun prestataire affecté.</p>}
          {(d.prestataires || []).map((p) => (
            <p key={p.user?._id || p.user} className={css.muted}>
              {p.user?.firstName} {p.user?.lastName} ({p.type}){" "}
              <button type="button" className={css.lien} disabled={occupe} onClick={() => appel(`/api/transit/admin/dossiers/${id}/prestataires`, { method: "POST", body: JSON.stringify({ prestataireUserId: p.user?._id || p.user, retirer: true }) }).then(() => appel(`/api/dossiers-import/${id}`))}>Retirer</button>
            </p>
          ))}
          <div className={css.ligneForm}>
            <select value={choixPresta} onChange={(e) => setChoixPresta(e.target.value)} aria-label="Prestataire à affecter">
              <option value="">Affecter un prestataire…</option>
              {prestataires.filter((p) => !d.destination?.pays || !(p.pays || []).length || p.pays.includes(d.destination.pays)).map((p) => (
                <option key={p._id} value={p.user?._id}>{p.raisonSociale} — {(p.types || []).join(", ")}</option>
              ))}
            </select>
            <button type="button" className={css.btn} disabled={occupe || !choixPresta}
              onClick={async () => { if (await appel(`/api/transit/admin/dossiers/${id}/prestataires`, { method: "POST", body: JSON.stringify({ prestataireUserId: choixPresta }) })) { setChoixPresta(""); appel(`/api/dossiers-import/${id}`); } }}>
              Affecter
            </button>
          </div>
          <p className={css.muted}>Le prestataire voit le dossier (sans les montants) dans son espace Zone Transit.</p>
        </fieldset>

        <fieldset className={css.bloc}>
          <legend>Accompagnement</legend>
          <p>{d.pack?.code || "—"} · {d.pack?.prix != null ? `${d.pack.prix} ${d.pack.devise}` : "sur devis"} · <strong>{STATUTS_PACK[d.pack?.statut]}</strong></p>
          {d.pack?.referenceReglement && <p className={css.muted}>Référence déclarée : {d.pack.referenceReglement}</p>}
          <div className={css.actions}>
            <button type="button" className={css.btn} disabled={occupe || d.pack?.statut === "regle"} onClick={() => appel(`/api/dossiers-import/${id}/pack`, { method: "PATCH", body: JSON.stringify({ statut: "regle" }) })}>Règlement reçu</button>
            <button type="button" className={css.btnSec} disabled={occupe} onClick={() => appel(`/api/dossiers-import/${id}/pack`, { method: "PATCH", body: JSON.stringify({ statut: "offert" }) })}>Offrir</button>
          </div>
        </fieldset>
      </div>

      <fieldset className={css.bloc}>
        <legend>Étape — actuelle : {libelleEtape(d.etape)}{d.statut !== "en_cours" ? ` (${d.statut})` : ""}</legend>
        <div className={css.ligneForm}>
          <select value={etape.code} onChange={(e) => setEtape({ ...etape, code: e.target.value })} aria-label="Nouvelle étape">
            <option value="">Choisir l'étape…</option>
            {ETAPES.map((e) => <option key={e.code} value={e.code}>{e.libelle}</option>)}
          </select>
          <input value={etape.note} onChange={(e) => setEtape({ ...etape, note: e.target.value })} placeholder="Message au client (facultatif)" aria-label="Message au client" />
          <label className={css.case}><input type="checkbox" checked={etape.visible} onChange={(e) => setEtape({ ...etape, visible: e.target.checked })} /> Visible du client</label>
          <button type="button" className={css.btn} disabled={occupe || !etape.code || d.statut !== "en_cours"}
            onClick={async () => { if (await appel(`/api/dossiers-import/${id}/etape`, { method: "POST", body: JSON.stringify({ etape: etape.code, note: etape.note, visibleClient: etape.visible }) })) setEtape({ code: "", note: "", visible: true }); }}>
            Enregistrer l'étape
          </button>
        </div>
        <ul className={css.historique}>
          {[...(d.historique || [])].reverse().map((h) => (
            <li key={h._id}>{fmtDate(h.date)} — <strong>{libelleEtape(h.etape)}</strong>{h.visibleClient === false ? " (interne)" : ""}{h.note ? ` : ${h.note}` : ""}</li>
          ))}
        </ul>
      </fieldset>

      <fieldset className={css.bloc}>
        <legend>Devis {d.devis?.envoyeLe ? `(envoyé le ${fmtDate(d.devis.envoyeLe)})` : "(pas encore envoyé)"}</legend>
        {lignes.map((l, i) => (
          <div key={i} className={css.ligneForm}>
            <input value={l.libelle} onChange={(e) => setLignes(lignes.map((x, j) => (j === i ? { ...x, libelle: e.target.value } : x)))} placeholder="Libellé (véhicule, fret, douane…)" aria-label="Libellé" />
            <input type="number" inputMode="decimal" value={l.montant} onChange={(e) => setLignes(lignes.map((x, j) => (j === i ? { ...x, montant: e.target.value } : x)))} placeholder="Montant USD" aria-label="Montant" className={css.montant} />
            <button type="button" className={css.btnSec} onClick={() => setLignes(lignes.filter((_, j) => j !== i))} aria-label="Retirer la ligne">✕</button>
          </div>
        ))}
        <div className={css.actions}>
          <button type="button" className={css.btnSec} onClick={() => setLignes([...lignes, { libelle: "", montant: "" }])}>+ Ligne</button>
          <button type="button" className={css.btn} disabled={occupe} onClick={() => modifier({ devis: { lignes } })}>Enregistrer le devis</button>
          <span className={css.muted}>Total : {d.devis?.total ?? "—"} {d.devis?.devise}</span>
        </div>
        <p className={css.muted}>Pour l'envoyer au client, passez le dossier à l'étape « Devis envoyé ».</p>
      </fieldset>

      <fieldset className={css.bloc}>
        <legend>Expédition</legend>
        <div className={css.grille3}>
          {[["compagnie", "Compagnie maritime"], ["navire", "Navire"], ["numeroBL", "N° connaissement"], ["numeroConteneur", "N° conteneur"]].map(([k, l]) => (
            <label key={k}>{l}<input defaultValue={d.expedition?.[k] || ""} onBlur={(e) => e.target.value !== (d.expedition?.[k] || "") && champ(`expedition.${k}`, e.target.value)} /></label>
          ))}
          <label>Mode
            <select value={d.expedition?.mode || ""} onChange={(e) => champ("expedition.mode", e.target.value || null)}>
              <option value="">—</option><option value="roro">Roulier (RoRo)</option><option value="conteneur">Conteneur</option>
            </select>
          </label>
          <label>Départ<input type="date" defaultValue={d.expedition?.departLe?.slice(0, 10) || ""} onBlur={(e) => champ("expedition.departLe", e.target.value || null)} /></label>
          <label>Arrivée prévue<input type="date" defaultValue={d.expedition?.arriveePrevueLe?.slice(0, 10) || ""} onBlur={(e) => champ("expedition.arriveePrevueLe", e.target.value || null)} /></label>
        </div>
      </fieldset>

      <fieldset className={css.bloc}>
        <legend>Documents</legend>
        <ul className={css.documents}>
          {(d.documents || []).map((doc) => (
            <li key={doc.code}>
              <span className={css.docNom}>{doc.libelle}</span>
              <span style={{ color: STATUTS_DOCUMENT[doc.statut]?.couleur, fontWeight: 600 }}>{STATUTS_DOCUMENT[doc.statut]?.libelle}</span>
              {doc.url && <a href={doc.url} target="_blank" rel="noreferrer">Ouvrir</a>}
              <label className={css.btnSec}>Joindre
                <input type="file" accept="application/pdf,image/*" hidden onChange={async (e) => {
                  const f = e.target.files?.[0]; if (!f) return;
                  try { const fichier = await lireFichier(f); await appel(`/api/dossiers-import/${id}/documents/${doc.code}`, { method: "POST", body: JSON.stringify({ fichier }) }); }
                  catch (err) { setErreur(err.message); }
                  e.target.value = "";
                }} />
              </label>
              <select value={doc.statut} aria-label={`Statut — ${doc.libelle}`} onChange={(e) => appel(`/api/dossiers-import/${id}/documents/${doc.code}`, { method: "POST", body: JSON.stringify({ statut: e.target.value }) })}>
                {Object.entries(STATUTS_DOCUMENT).map(([k, v]) => <option key={k} value={k}>{v.libelle}</option>)}
              </select>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className={css.bloc}>
        <legend>Notes internes (jamais montrées au client)</legend>
        <ul className={css.historique}>
          {(d.notesInternes || []).map((n) => <li key={n._id}>{fmtDate(n.date)} — {n.texte}</li>)}
        </ul>
        <div className={css.ligneForm}>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ajouter une note" aria-label="Note interne" />
          <button type="button" className={css.btn} disabled={occupe || !note.trim()} onClick={async () => { if (await appel(`/api/dossiers-import/${id}/notes`, { method: "POST", body: JSON.stringify({ texte: note }) })) setNote(""); }}>Ajouter</button>
        </div>
      </fieldset>

      {d.statut === "en_cours" && (
        <div className={css.actions}>
          <button type="button" className={css.btnDanger} disabled={occupe} onClick={() => {
            const motif = window.prompt("Motif de l'annulation (transmis au client) :");
            if (motif) appel(`/api/dossiers-import/${id}/annuler`, { method: "POST", body: JSON.stringify({ motif }) });
          }}>Annuler le dossier</button>
        </div>
      )}
    </div>
  );
}

export function DossiersImportSection({ headers, moi }) {
  const [filtres, setFiltres] = useState({ statut: "en_cours", etape: "", destination: "", q: "" });
  const [liste, setListe] = useState({ dossiers: [], total: 0 });
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [ouvert, setOuvert] = useState(null);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const qs = new URLSearchParams(Object.entries(filtres).filter(([, v]) => v)).toString();
      const r = await fetch(`/api/dossiers-import?${qs}`, { headers });
      const c = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(c.message || "Chargement impossible.");
      setListe({ dossiers: c.dossiers || [], total: c.total || 0 });
      setErreur("");
    } catch (e) { setErreur(e.message); } finally { setChargement(false); }
  }, [filtres, headers]);
  useEffect(() => { charger(); }, [charger]);

  return (
    <div className={css.section}>
      <div className={css.filtres}>
        <select value={filtres.statut} onChange={(e) => setFiltres({ ...filtres, statut: e.target.value })} aria-label="Statut">
          <option value="en_cours">En cours</option><option value="termine">Terminés</option><option value="annule">Annulés</option><option value="">Tous</option>
        </select>
        <select value={filtres.etape} onChange={(e) => setFiltres({ ...filtres, etape: e.target.value })} aria-label="Étape">
          <option value="">Toutes les étapes</option>{ETAPES.map((e) => <option key={e.code} value={e.code}>{e.libelle}</option>)}
        </select>
        <select value={filtres.destination} onChange={(e) => setFiltres({ ...filtres, destination: e.target.value })} aria-label="Destination">
          <option value="">Toutes destinations</option>{DESTINATIONS.map((o) => <option key={o.code} value={o.code}>{o.nom}</option>)}
        </select>
        <input value={filtres.q} onChange={(e) => setFiltres({ ...filtres, q: e.target.value })} placeholder="Référence, véhicule…" aria-label="Recherche" />
        <span className={css.muted}>{liste.total} dossier(s)</span>
      </div>
      {erreur && <p className={css.erreur}>{erreur}</p>}
      {chargement && <p className={css.muted}>Chargement…</p>}
      {!chargement && liste.dossiers.length === 0 && <p className={css.muted}>Aucun dossier pour ces filtres.</p>}
      <div className={css.tableWrap}>
        <table className={css.table}>
          <thead><tr><th>Référence</th><th>Client</th><th>Véhicule</th><th>Trajet</th><th>Étape</th><th>Accompagnement</th><th>Mis à jour</th></tr></thead>
          <tbody>
            {liste.dossiers.map((d) => (
              <tr key={d._id} onClick={() => setOuvert(d._id)} className={ouvert === d._id ? css.actif : ""}>
                <td><button type="button" className={css.lien} onClick={() => setOuvert(d._id)}>{d.reference}</button></td>
                <td>{d.client?.firstName} {d.client?.lastName}</td>
                <td>{d.vehicule?.titre || "—"}</td>
                <td>{nomPays(d.origine?.pays)} → {nomPays(d.destination?.pays)}</td>
                <td>{libelleEtape(d.etape)}</td>
                <td>{d.pack?.code ? `${d.pack.code} · ${STATUTS_PACK[d.pack.statut]}` : "—"}</td>
                <td>{fmtDate(d.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ouvert && <Detail key={ouvert} id={ouvert} headers={headers} moi={moi} onFermer={() => setOuvert(null)} onChange={charger} />}
    </div>
  );
}
