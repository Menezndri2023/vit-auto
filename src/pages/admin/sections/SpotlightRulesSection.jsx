import { useCallback, useEffect, useState } from "react";
import { useCurrency } from "../../../context/CurrencyContext";
import styles from "../../AdminPanel.module.css";

// ── Règles de mise en avant par pays (2026-09-17) ───────────────────────────
// Ce que voit un visiteur en page d'accueil dépend de SON pays : carrousel,
// véhicules en vedette et activités & loisirs ne montrent que le contenu du
// pays ; un partenaire y occupe au plus N places dès que le pays compte S
// partenaires (2 dès 5 par défaut) ; sans partenaire dans le pays, la vitrine
// est internationale. « Partenaires à la une » reste internationale pour tous.
// L'admin règle N et S ici, globalement ou pays par pays, et vérifie le rendu
// de chaque vitrine pour un pays donné.
const EMPLACEMENTS = [
  { k: "hero",        l: "🎠 Carrousel" },
  { k: "vedette",     l: "⭐ Véhicules en vedette" },
  { k: "loisirs",     l: "🎈 Activités & loisirs" },
  { k: "partenaires", l: "🤝 Partenaires à la une (international)" },
];

export function SpotlightRulesSection({ token, showToast }) {
  const { COUNTRIES_CONFIG } = useCurrency();
  const [regles, setRegles] = useState(null);
  const [saving, setSaving] = useState(false);
  const [paysApercu, setPaysApercu] = useState("MA");
  const [apercu, setApercu] = useState({});
  const entetes = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const charger = useCallback(async () => {
    try {
      const r = await fetch("/api/spotlight/regles", { headers: entetes });
      const d = await r.json();
      if (r.ok) setRegles(d.regles);
    } catch { /* la section reste vide */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  useEffect(() => { charger(); }, [charger]);

  const chargerApercu = useCallback(async (pays) => {
    const res = {};
    await Promise.all(EMPLACEMENTS.map(async ({ k }) => {
      try {
        const r = await fetch(`/api/spotlight/${k}?country=${encodeURIComponent(pays)}&_=${Date.now()}`);
        res[k] = r.ok ? await r.json() : null;
      } catch { res[k] = null; }
    }));
    setApercu(res);
  }, []);
  useEffect(() => { chargerApercu(paysApercu); }, [paysApercu, chargerApercu]);

  const enregistrer = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/spotlight/regles", { method: "PUT", headers: entetes, body: JSON.stringify({ defaut: regles.defaut, parPays: regles.parPays }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || "Erreur");
      setRegles(d.regles);
      showToast?.("✅ Règles enregistrées — vitrines recomposées.");
      chargerApercu(paysApercu);
    } catch (e) { showToast?.(`❌ ${e.message}`); }
    finally { setSaving(false); }
  };

  const setDefaut = (champ, v) => setRegles((p) => ({ ...p, defaut: { ...p.defaut, [champ]: Number(v) || 1 } }));
  const setPays = (i, champ, v) => setRegles((p) => ({ ...p, parPays: p.parPays.map((x, j) => (j === i ? { ...x, [champ]: champ === "country" ? v : Number(v) || 1 } : x)) }));
  const ajouterPays = () => setRegles((p) => ({ ...p, parPays: [...p.parPays, { country: "", maxParPartenaire: p.defaut.maxParPartenaire, seuilPartenaires: p.defaut.seuilPartenaires }] }));
  const retirerPays = (i) => setRegles((p) => ({ ...p, parPays: p.parPays.filter((_, j) => j !== i) }));
  const nomPays = (code) => { const c = COUNTRIES_CONFIG.find((x) => x.code === code); return c ? `${c.flag} ${c.name}` : code; };
  const champ = { padding: "7px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem", width: 90 };

  if (!regles) return <p style={{ color: "#94a3b8" }}>Chargement des règles…</p>;

  return (
    <div>
      <div className={styles.chartCard} style={{ marginBottom: 20 }}>
        <h3 className={styles.chartTitle}>🌍 Règle par défaut (tous les pays)</h3>
        <p style={{ fontSize: ".82rem", color: "#64748b", margin: "4px 0 14px", lineHeight: 1.55 }}>
          Chaque visiteur voit le contenu de <strong>son pays</strong> (Maroc → Maroc, France → France). Un partenaire occupe au plus
          <strong> N places</strong> par vitrine dès que le pays compte <strong>S partenaires</strong> actifs ; en dessous, le plafond
          s'assouplit pour remplir la vitrine ; sans aucun partenaire dans le pays, la vitrine devient <strong>internationale</strong>.
          « Partenaires à la une » reste internationale, tous pays combinés.
        </p>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ fontSize: ".82rem", fontWeight: 600 }}>N — places par partenaire<br />
            <input type="number" min="1" max="20" style={champ} value={regles.defaut.maxParPartenaire} onChange={(e) => setDefaut("maxParPartenaire", e.target.value)} /></label>
          <label style={{ fontSize: ".82rem", fontWeight: 600 }}>S — seuil de partenaires<br />
            <input type="number" min="1" max="1000" style={champ} value={regles.defaut.seuilPartenaires} onChange={(e) => setDefaut("seuilPartenaires", e.target.value)} /></label>
        </div>

        <h3 className={styles.chartTitle} style={{ marginTop: 22 }}>🏳️ Exceptions par pays</h3>
        {regles.parPays.length === 0 && <p style={{ fontSize: ".82rem", color: "#94a3b8" }}>Aucune exception : la règle par défaut s'applique partout.</p>}
        {regles.parPays.map((p, i) => (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <select value={p.country} onChange={(e) => setPays(i, "country", e.target.value)} style={{ ...champ, width: 220 }}>
              <option value="">— Pays —</option>
              {COUNTRIES_CONFIG.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
            </select>
            <label style={{ fontSize: ".8rem" }}>N <input type="number" min="1" max="20" style={champ} value={p.maxParPartenaire} onChange={(e) => setPays(i, "maxParPartenaire", e.target.value)} /></label>
            <label style={{ fontSize: ".8rem" }}>S <input type="number" min="1" max="1000" style={champ} value={p.seuilPartenaires} onChange={(e) => setPays(i, "seuilPartenaires", e.target.value)} /></label>
            <button type="button" onClick={() => retirerPays(i)} style={{ background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 8, padding: "7px 12px", fontWeight: 700, cursor: "pointer", fontSize: ".8rem" }}>Retirer</button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button type="button" onClick={ajouterPays} className={styles.btnReject}>+ Ajouter une exception</button>
          <button type="button" onClick={enregistrer} disabled={saving} className={styles.btnApprove}>{saving ? "…" : "💾 Enregistrer les règles"}</button>
        </div>
      </div>

      <div className={styles.chartCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <h3 className={styles.chartTitle} style={{ margin: 0 }}>👁️ Ce que voit un visiteur</h3>
          <select value={paysApercu} onChange={(e) => setPaysApercu(e.target.value)} style={{ ...champ, width: 240 }}>
            {COUNTRIES_CONFIG.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
          </select>
        </div>
        {EMPLACEMENTS.map(({ k, l }) => {
          const v = apercu[k];
          const r = v?.regle;
          return (
            <div key={k} style={{ borderTop: "1px solid #f1f5f9", padding: "12px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
                <strong style={{ fontSize: ".88rem" }}>{l}</strong>
                <span style={{ fontSize: ".76rem", color: "#64748b" }}>
                  {!v ? "indisponible"
                    : v.repliMondial ? `🌍 internationale — ${r ? `${r.nbPartenaires ?? 0} partenaire(s) ${nomPays(paysApercu)}` : "aucun contenu du pays"}`
                    : r ? `${nomPays(paysApercu)} · ${r.nbPartenaires} partenaire(s) · ${r.plafond} place(s) max par partenaire${r.plafond !== r.maxParPartenaire ? " (assoupli, sous le seuil)" : ""}`
                    : "tous pays combinés"}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(v?.items || []).length === 0 && <span style={{ fontSize: ".8rem", color: "#94a3b8" }}>Vide.</span>}
                {(v?.items || []).map((it) => (
                  <div key={it.id} title={`origine : ${it.origine}`} style={{ width: 120, border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", fontSize: ".72rem" }}>
                    {it.image ? <img src={it.image} alt="" loading="lazy" style={{ width: "100%", height: 64, objectFit: "cover", display: "block" }} /> : <div style={{ height: 64, background: "#f1f5f9" }} />}
                    <div style={{ padding: "5px 7px" }}>
                      <div style={{ fontWeight: 700, color: "#0f1b3f", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.titre}</div>
                      <div style={{ color: "#94a3b8" }}>{it.pays || "—"} · {it.origine}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
