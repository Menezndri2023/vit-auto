import { useEffect, useState } from "react";
import { api } from "../../utils/apiClient";
import { useToast } from "../../context/ToastContext";
import { useCurrency } from "../../context/CurrencyContext";
import { geocodeAddress } from "../../utils/geo";
import styles from "./PartnerBusinessManager.module.css";

// Booking Engine — Éligibilité (2026-09) — voir server/services/eligibilityEngine.js.
// Chaînes vides pour les champs numériques (pas 0/null) pour que les <input
// type="number"> restent vides tant que le partenaire n'a rien saisi, plutôt
// que d'afficher un "0" trompeur (0 an minimum de permis, par exemple).
// "" = pas de règle partenaire (tri-état, voir server/models/PartnerBusiness.js)
// — jamais true/false par défaut, pour qu'enregistrer une seule règle (ex.
// l'âge minimum) n'active pas silencieusement les autres exigences.
const EMPTY_RENTAL_POLICY = {
  minimumAge: "", minimumLicenseYears: "",
  identityDocumentRequired: "", drivingLicenseRequired: "",
  internationalLicenseRequired: "", depositRequired: "",
  maxDeliveryRadiusKm: "", additionalRequirements: "",
};

// Représente le tri-état (aucune règle / oui / non) dans un <select> — un
// simple checkbox ne peut pas représenter "aucune règle" distinctement de "non".
const TRISTATE_OPTIONS = [
  { value: "",  label: "Pas de règle" },
  { value: "1", label: "Oui, exigé" },
  { value: "0", label: "Non, pas exigé" },
];
const toTristateValue = (v) => v === true ? "1" : v === false ? "0" : "";
const fromTristateValue = (v) => v === "1" ? true : v === "0" ? false : null;

const EMPTY_FORM = { companyName: "", country: "", ville: "", adresse: "", contactNom: "", contactTel: "", isConcessionnaire: false, rentalPolicy: EMPTY_RENTAL_POLICY };

const PartnerBusinessManager = () => {
  const { success, error } = useToast();
  const { COUNTRIES_CONFIG } = useCurrency();

  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [editingId, setEditingId]   = useState(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);

  const load = async () => {
    try {
      const res = await api.get("/api/partner/businesses");
      setBusinesses(res.businesses || []);
    } catch (e) {
      error(e.message || "Erreur de chargement des entreprises.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (b) => {
    setEditingId(b._id);
    setForm({
      companyName: b.companyName || "", country: b.country || "", ville: b.ville || "",
      adresse: b.adresse || "", contactNom: b.contactNom || "", contactTel: b.contactTel || "",
      isConcessionnaire: !!b.isConcessionnaire,
      rentalPolicy: {
        minimumAge:           b.rentalPolicy?.minimumAge ?? "",
        minimumLicenseYears:  b.rentalPolicy?.minimumLicenseYears ?? "",
        identityDocumentRequired:     toTristateValue(b.rentalPolicy?.identityDocumentRequired),
        drivingLicenseRequired:       toTristateValue(b.rentalPolicy?.drivingLicenseRequired),
        internationalLicenseRequired: toTristateValue(b.rentalPolicy?.internationalLicenseRequired),
        depositRequired:              toTristateValue(b.rentalPolicy?.depositRequired),
        maxDeliveryRadiusKm:  b.rentalPolicy?.maxDeliveryRadiusKm ?? "",
        additionalRequirements: b.rentalPolicy?.additionalRequirements || "",
      },
    });
    setShowForm(true);
  };

  const setF  = (field, val) => setForm((p) => ({ ...p, [field]: val }));
  const setRP = (field, val) => setForm((p) => ({ ...p, rentalPolicy: { ...p.rentalPolicy, [field]: val } }));

  const handleSave = async () => {
    if (!form.companyName.trim() || !form.country || !form.ville.trim()) {
      error("Nom de l'entreprise, pays et ville sont requis.");
      return;
    }
    setSaving(true);
    try {
      const coordonnees = form.adresse.trim()
        ? await geocodeAddress(`${form.adresse}, ${form.ville}`)
        : null;
      const rentalPolicy = {
        minimumAge:          form.rentalPolicy.minimumAge          === "" ? null : Number(form.rentalPolicy.minimumAge),
        minimumLicenseYears: form.rentalPolicy.minimumLicenseYears === "" ? null : Number(form.rentalPolicy.minimumLicenseYears),
        maxDeliveryRadiusKm: form.rentalPolicy.maxDeliveryRadiusKm === "" ? null : Number(form.rentalPolicy.maxDeliveryRadiusKm),
        additionalRequirements: form.rentalPolicy.additionalRequirements.trim() || null,
        identityDocumentRequired:     fromTristateValue(form.rentalPolicy.identityDocumentRequired),
        drivingLicenseRequired:       fromTristateValue(form.rentalPolicy.drivingLicenseRequired),
        internationalLicenseRequired: fromTristateValue(form.rentalPolicy.internationalLicenseRequired),
        depositRequired:              fromTristateValue(form.rentalPolicy.depositRequired),
      };
      const payload = { ...form, rentalPolicy, coordonnees: coordonnees || undefined };

      if (editingId) {
        await api.patch(`/api/partner/businesses/${editingId}`, payload);
        success("Entreprise mise à jour.");
      } else {
        await api.post("/api/partner/businesses", payload);
        success("Entreprise ajoutée.");
      }
      setShowForm(false);
      await load();
    } catch (e) {
      error(e.message || "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (b) => {
    if (!window.confirm(`Supprimer "${b.companyName}" ? Les annonces déjà publiées sous cette entreprise resteront en ligne.`)) return;
    try {
      await api.delete(`/api/partner/businesses/${b._id}`);
      success("Entreprise supprimée.");
      await load();
    } catch (e) {
      error(e.message || "Erreur lors de la suppression.");
    }
  };

  const handleSetDefault = async (b) => {
    try {
      await api.patch(`/api/partner/businesses/${b._id}/default`);
      await load();
    } catch (e) {
      error(e.message || "Erreur lors de la mise à jour.");
    }
  };

  const flagFor = (code) => COUNTRIES_CONFIG.find((c) => c.code === code)?.flag || "";
  const nameFor = (code) => COUNTRIES_CONFIG.find((c) => c.code === code)?.name || code;

  if (loading) return <div className={styles.wrap}><p className={styles.hint}>Chargement…</p></div>;

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>🏢 Mes entreprises</h2>
          <p className={styles.hint}>
            Gérez plusieurs entreprises domiciliées à des endroits différents — choisissez celle concernée
            lorsque vous publiez un véhicule, pour que son pays/ville/adresse soient corrects automatiquement.
          </p>
        </div>
        <button className={styles.addBtn} onClick={openCreate}>+ Ajouter une entreprise</button>
      </div>

      {businesses.length === 0 && !showForm && (
        <div className={styles.empty}>
          <p>Aucune entreprise enregistrée pour l'instant.</p>
          <button className={styles.addBtn} onClick={openCreate}>+ Ajouter ma première entreprise</button>
        </div>
      )}

      <div className={styles.grid}>
        {businesses.map((b) => (
          <div key={b._id} className={styles.card}>
            {b.isDefault && <span className={styles.defaultBadge}>Par défaut</span>}
            {b.isConcessionnaire && <span className={styles.defaultBadge} style={{ background: "#eef2ff", color: "#4338ca" }}>🏬 Concessionnaire</span>}
            <h3 className={styles.cardTitle}>{b.companyName}</h3>
            <p className={styles.cardLine}>{flagFor(b.country)} {nameFor(b.country)}</p>
            <p className={styles.cardLine}>📍 {b.ville}{b.adresse ? `, ${b.adresse}` : ""}</p>
            {b.contactNom && <p className={styles.cardLine}>👤 {b.contactNom}</p>}
            {b.contactTel && <p className={styles.cardLine}>📞 {b.contactTel}</p>}
            {b.rentalPolicy?.minimumAge && <p className={styles.cardLine}>🛡️ Âge min. {b.rentalPolicy.minimumAge} ans</p>}
            <div className={styles.cardActions}>
              {!b.isDefault && (
                <button className={styles.linkBtn} onClick={() => handleSetDefault(b)}>Définir par défaut</button>
              )}
              <button className={styles.linkBtn} onClick={() => openEdit(b)}>Modifier</button>
              <button className={styles.linkBtnDanger} onClick={() => handleDelete(b)}>Supprimer</button>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className={styles.formCard}>
          <h3 className={styles.cardTitle}>{editingId ? "Modifier l'entreprise" : "Nouvelle entreprise"}</h3>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label>Nom de l'entreprise *</label>
              <input value={form.companyName} onChange={(e) => setF("companyName", e.target.value)} placeholder="Ex : Transport Elite SARL" />
            </div>
            <div className={styles.field}>
              <label>Pays *</label>
              <select value={form.country} onChange={(e) => setF("country", e.target.value)}>
                <option value="">Choisir un pays</option>
                {COUNTRIES_CONFIG.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label>Ville *</label>
              <input value={form.ville} onChange={(e) => setF("ville", e.target.value)} placeholder="Ex : Dakar, Abidjan, Bamako..." />
            </div>
            <div className={`${styles.field} ${styles.colSpan2}`}>
              <label>Adresse</label>
              <input value={form.adresse} onChange={(e) => setF("adresse", e.target.value)} placeholder="Ex : Rue 10, Plateau, Abidjan" />
            </div>
            <div className={styles.field}>
              <label>Contact — nom</label>
              <input value={form.contactNom} onChange={(e) => setF("contactNom", e.target.value)} />
            </div>
            <div className={styles.field}>
              <label>Contact — téléphone</label>
              <input value={form.contactTel} onChange={(e) => setF("contactTel", e.target.value)} placeholder="+221 77 000 00 00" />
            </div>
            <div className={`${styles.field} ${styles.colSpan2}`}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={form.isConcessionnaire} onChange={(e) => setF("isConcessionnaire", e.target.checked)} />
                🏬 Cette entité est un concessionnaire (affiché comme badge sur ses annonces)
              </label>
            </div>
          </div>

          {/* Booking Engine — Éligibilité (2026-09) : politique de location par
              défaut de cette entité, appliquée en plus des réglages propres à
              chaque véhicule (voir server/services/eligibilityEngine.js).
              Laisser un champ vide = pas de règle partenaire pour ce critère. */}
          <h3 className={styles.cardTitle} style={{ marginTop: 24 }}>🛡️ Politique de location</h3>
          <p className={styles.hint}>
            Ces règles s'appliquent par défaut à toutes les réservations sur les véhicules de cette entité,
            en plus des réglages propres à chaque annonce. Laissez un champ vide pour ne poser aucune exigence.
          </p>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label>Âge minimum du client</label>
              <input type="number" min="18" value={form.rentalPolicy.minimumAge}
                onChange={(e) => setRP("minimumAge", e.target.value)} placeholder="Ex : 23" />
            </div>
            <div className={styles.field}>
              <label>Ancienneté minimale du permis (années)</label>
              <input type="number" min="0" value={form.rentalPolicy.minimumLicenseYears}
                onChange={(e) => setRP("minimumLicenseYears", e.target.value)} placeholder="Ex : 2" />
            </div>
            <div className={styles.field}>
              <label>Rayon de livraison maximum (km)</label>
              <input type="number" min="0" value={form.rentalPolicy.maxDeliveryRadiusKm}
                onChange={(e) => setRP("maxDeliveryRadiusKm", e.target.value)} placeholder="Illimité" />
            </div>
            <div className={styles.field}>
              <label>🪪 Pièce d'identité vérifiée</label>
              <select value={form.rentalPolicy.identityDocumentRequired} onChange={(e) => setRP("identityDocumentRequired", e.target.value)}>
                {TRISTATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label>🚘 Permis de conduire vérifié</label>
              <select value={form.rentalPolicy.drivingLicenseRequired} onChange={(e) => setRP("drivingLicenseRequired", e.target.value)}>
                {TRISTATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label>🌍 Permis international (clients étrangers)</label>
              <select value={form.rentalPolicy.internationalLicenseRequired} onChange={(e) => setRP("internationalLicenseRequired", e.target.value)}>
                {TRISTATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label>💰 Caution exigée par défaut</label>
              <select value={form.rentalPolicy.depositRequired} onChange={(e) => setRP("depositRequired", e.target.value)}>
                {TRISTATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className={`${styles.field} ${styles.colSpan2}`}>
              <label>Exigences complémentaires (affichées au client)</label>
              <input value={form.rentalPolicy.additionalRequirements}
                onChange={(e) => setRP("additionalRequirements", e.target.value)}
                placeholder="Ex : carte bancaire au nom du conducteur requise" />
            </div>
          </div>

          <div className={styles.formActions}>
            <button className={styles.cancelBtn} onClick={() => setShowForm(false)} disabled={saving}>Annuler</button>
            <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PartnerBusinessManager;
