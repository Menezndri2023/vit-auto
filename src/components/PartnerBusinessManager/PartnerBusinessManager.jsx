import { useEffect, useState } from "react";
import { api } from "../../utils/apiClient";
import { useToast } from "../../context/ToastContext";
import { useCurrency } from "../../context/CurrencyContext";
import { geocodeAddress } from "../../utils/geo";
import styles from "./PartnerBusinessManager.module.css";

const EMPTY_FORM = { companyName: "", country: "", ville: "", adresse: "", contactNom: "", contactTel: "" };

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
    });
    setShowForm(true);
  };

  const setF = (field, val) => setForm((p) => ({ ...p, [field]: val }));

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
      const payload = { ...form, coordonnees: coordonnees || undefined };

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
            <h3 className={styles.cardTitle}>{b.companyName}</h3>
            <p className={styles.cardLine}>{flagFor(b.country)} {nameFor(b.country)}</p>
            <p className={styles.cardLine}>📍 {b.ville}{b.adresse ? `, ${b.adresse}` : ""}</p>
            {b.contactNom && <p className={styles.cardLine}>👤 {b.contactNom}</p>}
            {b.contactTel && <p className={styles.cardLine}>📞 {b.contactTel}</p>}
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
