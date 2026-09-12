// Extrait d'AdminPanel.jsx (découpe par onglet, 2026-09-12) — logique inchangée.
import { useEffect, useState } from "react";
import styles from "../../AdminPanel.module.css";

// ── Politiques de location partenaire (restructuration 2026-09) ────────────
// La politique de location (âge min, permis, ET frais de livraison "même
// ville") ne pouvait jusqu'ici être réglée que par le partenaire lui-même
// (PartnerBusinessManager.jsx) — l'admin n'avait aucun moyen de consulter ou
// ajuster ces règles pour une entité donnée. Réutilise le tri-état déjà
// utilisé côté partenaire (voir server/models/PartnerBusiness.js).
const RP_TRISTATE_OPTIONS = [
  { value: "",  label: "Pas de règle" },
  { value: "1", label: "Oui, exigé" },
  { value: "0", label: "Non, pas exigé" },
];

const rpToTristate   = (v) => v === true ? "1" : v === false ? "0" : "";

const rpFromTristate = (v) => v === "1" ? true : v === "0" ? false : null;

export function RentalPolicySection({ token }) {
  const [search, setSearch]         = useState("");
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [editing, setEditing]       = useState(null);
  const [form, setForm]             = useState(null);
  const [saving, setSaving]         = useState(false);

  const [saveError, setSaveError] = useState(null);
  const [total, setTotal] = useState(0);

  // Le serveur plafonne à 20 entités par page et renvoie total/pages, que cet
  // écran ignorait : au-delà de 20 entreprises, les politiques de location des
  // autres (âge minimum, caution, frais de livraison) étaient tout simplement
  // inaccessibles. On charge les pages successives.
  const load = async (q) => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const qs = q ? `search=${encodeURIComponent(q)}&` : "";
      const all = [];
      let grandTotal = 0;
      for (let page = 1; page <= 25; page += 1) {
        const r = await fetch(`/api/partner/businesses/admin?${qs}limit=100&page=${page}`, { headers });
        if (!r.ok) break;
        const d = await r.json();
        const batch = d.businesses || [];
        grandTotal = d.total ?? grandTotal;
        all.push(...batch);
        if (batch.length < 100 || (grandTotal && all.length >= grandTotal)) break;
      }
      setBusinesses(all);
      setTotal(grandTotal || all.length);
    } catch { /* liste vide, pas bloquant */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(""); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openEdit = (b) => {
    setEditing(b);
    setForm({
      minimumAge:               b.rentalPolicy?.minimumAge ?? "",
      minimumLicenseYears:      b.rentalPolicy?.minimumLicenseYears ?? "",
      maxDeliveryRadiusKm:      b.rentalPolicy?.maxDeliveryRadiusKm ?? "",
      deliveryFeeSameCity:      b.rentalPolicy?.deliveryFeeSameCity ?? "",
      deliverySameCityRadiusKm: b.rentalPolicy?.deliverySameCityRadiusKm ?? "",
      identityDocumentRequired: rpToTristate(b.rentalPolicy?.identityDocumentRequired),
      drivingLicenseRequired:   rpToTristate(b.rentalPolicy?.drivingLicenseRequired),
      depositRequired:          rpToTristate(b.rentalPolicy?.depositRequired),
      additionalRequirements:   b.rentalPolicy?.additionalRequirements || "",
    });
  };

  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const rentalPolicy = {
        minimumAge:               form.minimumAge               === "" ? null : Number(form.minimumAge),
        minimumLicenseYears:      form.minimumLicenseYears       === "" ? null : Number(form.minimumLicenseYears),
        maxDeliveryRadiusKm:      form.maxDeliveryRadiusKm       === "" ? null : Number(form.maxDeliveryRadiusKm),
        deliveryFeeSameCity:      form.deliveryFeeSameCity       === "" ? null : Number(form.deliveryFeeSameCity),
        deliverySameCityRadiusKm: form.deliverySameCityRadiusKm  === "" ? null : Number(form.deliverySameCityRadiusKm),
        identityDocumentRequired: rpFromTristate(form.identityDocumentRequired),
        drivingLicenseRequired:   rpFromTristate(form.drivingLicenseRequired),
        depositRequired:          rpFromTristate(form.depositRequired),
        additionalRequirements:   form.additionalRequirements.trim() || null,
      };
      const r = await fetch(`/api/partner/businesses/${editing._id}/admin-rental-policy`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rentalPolicy }),
      });
      if (r.ok) { setEditing(null); setSaveError(null); load(search); }
      else {
        // Aucun retour en cas d'échec : la modale restait ouverte, le spinner
        // s'arrêtait, et rien ne s'affichait — l'admin recliquait sans fin.
        const d = await r.json().catch(() => null);
        setSaveError(d?.message || "Enregistrement refusé par le serveur.");
      }
    } catch {
      setSaveError("Erreur réseau — modifications non enregistrées.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          placeholder="Rechercher une entreprise…" value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(search)}
          style={{ flex: 1, padding: "0.5rem", borderRadius: 8, border: "1.5px solid #e2e8f0" }}
        />
        <button className={styles.btnRefresh} onClick={() => load(search)}>Rechercher</button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>Chargement…</div>
      ) : businesses.length === 0 ? (
        <div style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>Aucune entreprise trouvée.</div>
      ) : (
        <div className={styles.tableWrap}>
          <div style={{ fontSize: ".8rem", color: "#64748b", marginBottom: 8 }}>
            {businesses.length} entreprise(s) affichée(s){total > businesses.length ? ` sur ${total}` : ""}
          </div>
          <table className={styles.table}>
            <thead><tr><th>Entreprise</th><th>Propriétaire</th><th>Pays / Ville</th><th>Livraison même ville</th><th>Actions</th></tr></thead>
            <tbody>
              {businesses.map((b) => (
                <tr key={b._id} className={styles.tr}>
                  <td><strong style={{ fontSize: ".85rem" }}>{b.companyName}</strong></td>
                  <td style={{ fontSize: ".82rem", color: "#64748b" }}>{b.owner?.firstName} {b.owner?.lastName}</td>
                  <td style={{ fontSize: ".82rem", color: "#64748b" }}>{b.country} · {b.ville}</td>
                  <td style={{ fontSize: ".82rem" }}>
                    {b.rentalPolicy?.deliveryFeeSameCity != null
                      ? `${b.rentalPolicy.deliveryFeeSameCity} (≤ ${b.rentalPolicy.deliverySameCityRadiusKm || 15} km)`
                      : <span style={{ color: "#94a3b8" }}>— (barème pays)</span>}
                  </td>
                  <td><button className={styles.btnApprove} onClick={() => openEdit(b)}>Modifier</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && form && (
        <div className={styles.overlay} onClick={() => setEditing(null)}>
          <div className={styles.confirmBox} style={{ maxWidth: 520, width: "95%" }} onClick={(e) => e.stopPropagation()}>
            <p className={styles.confirmMsg}>Politique de location — {editing.companyName}</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <label style={{ fontSize: ".8rem" }}>Âge minimum
                <input type="number" value={form.minimumAge} onChange={(e) => setF("minimumAge", e.target.value)} style={{ width: "100%", padding: 6, marginTop: 4 }} />
              </label>
              <label style={{ fontSize: ".8rem" }}>Ancienneté permis (ans)
                <input type="number" value={form.minimumLicenseYears} onChange={(e) => setF("minimumLicenseYears", e.target.value)} style={{ width: "100%", padding: 6, marginTop: 4 }} />
              </label>
              <label style={{ fontSize: ".8rem" }}>🚚 Frais livraison même ville
                <input type="number" value={form.deliveryFeeSameCity} onChange={(e) => setF("deliveryFeeSameCity", e.target.value)} placeholder="100-150" style={{ width: "100%", padding: 6, marginTop: 4 }} />
              </label>
              <label style={{ fontSize: ".8rem" }}>Rayon "même ville" (km)
                <input type="number" value={form.deliverySameCityRadiusKm} onChange={(e) => setF("deliverySameCityRadiusKm", e.target.value)} placeholder="15" style={{ width: "100%", padding: 6, marginTop: 4 }} />
              </label>
              <label style={{ fontSize: ".8rem" }}>Rayon livraison max (km)
                <input type="number" value={form.maxDeliveryRadiusKm} onChange={(e) => setF("maxDeliveryRadiusKm", e.target.value)} placeholder="Illimité" style={{ width: "100%", padding: 6, marginTop: 4 }} />
              </label>
              <label style={{ fontSize: ".8rem" }}>🪪 Identité vérifiée
                <select value={form.identityDocumentRequired} onChange={(e) => setF("identityDocumentRequired", e.target.value)} style={{ width: "100%", padding: 6, marginTop: 4 }}>
                  {RP_TRISTATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label style={{ fontSize: ".8rem" }}>🚘 Permis vérifié
                <select value={form.drivingLicenseRequired} onChange={(e) => setF("drivingLicenseRequired", e.target.value)} style={{ width: "100%", padding: 6, marginTop: 4 }}>
                  {RP_TRISTATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label style={{ fontSize: ".8rem" }}>💰 Caution exigée
                <select value={form.depositRequired} onChange={(e) => setF("depositRequired", e.target.value)} style={{ width: "100%", padding: 6, marginTop: 4 }}>
                  {RP_TRISTATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            </div>
            <label style={{ fontSize: ".8rem", display: "block", marginBottom: 12 }}>Exigences complémentaires
              <input value={form.additionalRequirements} onChange={(e) => setF("additionalRequirements", e.target.value)} style={{ width: "100%", padding: 6, marginTop: 4 }} />
            </label>
            {saveError && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: 8, padding: "8px 10px", fontSize: ".8rem", marginBottom: 10 }}>
                ⚠️ {saveError}
              </div>
            )}
            <div className={styles.confirmActions}>
              <button className={styles.btnPrimary} disabled={saving} onClick={handleSave}>{saving ? "…" : "Enregistrer"}</button>
              <button className={styles.btnGhost} onClick={() => { setEditing(null); setSaveError(null); }}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
