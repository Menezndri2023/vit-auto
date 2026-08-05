import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useVehicles } from "../context/VehicleContext";
import { useCurrency } from "../context/CurrencyContext";
import { useToast } from "../context/ToastContext";
import { api } from "../utils/apiClient";
import { ACTIVITY_TYPES, ACTIVITY_TYPE_LABELS, ACTIVITY_TYPE_ICONS } from "../constants/activityTypes";
import styles from "./VendorSubmit.module.css";

const MAX_PHOTOS = 8;

// Même logique de recompression que VendorSubmit.jsx (compressImage) — champ
// d'application volontairement réduit à cette page (formulaire à un seul écran,
// pas besoin du reste de l'assistant véhicule/chauffeur).
const MAX_DIMENSION = 1600;
const compressImage = (dataUrl) =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });

const ActivitySubmit = () => {
  const { token } = useAuth();
  const { addActivity } = useVehicles();
  const { CURRENCIES, rateFromUSD } = useCurrency();
  const { success, error } = useToast();
  const navigate = useNavigate();

  const [businesses, setBusinesses] = useState([]);
  const [businessId, setBusinessId] = useState("");

  useEffect(() => {
    if (!token) return;
    api.get("/api/partner/businesses")
      .then((res) => setBusinesses(res.businesses || []))
      .catch(() => {});
  }, [token]);

  const [activityType, setActivityType] = useState("QUAD");
  const [title,        setTitle]        = useState("");
  const [description,  setDescription]  = useState("");
  const [priceUnit,    setPriceUnit]    = useState("per_person");
  const [priceCurrency, setPriceCurrency] = useState("USD");
  const [priceEntry,   setPriceEntry]   = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [capacity,     setCapacity]     = useState(1);
  const [essaiDisponible, setEssaiDisponible] = useState(false);
  const [essaiDurationMinutes, setEssaiDurationMinutes] = useState(30);
  const [essaiPriceEntry, setEssaiPriceEntry] = useState("");
  const [ville,        setVille]        = useState("");
  const [adresse,      setAdresse]      = useState("");
  const [photos,       setPhotos]       = useState([]); // [{ id, preview }]
  const [errors,       setErrors]       = useState({});
  const [submitting,   setSubmitting]   = useState(false);
  const [result,       setResult]       = useState(null);

  const priceUSD = priceEntry !== "" && !isNaN(Number(priceEntry))
    ? (priceCurrency === "USD" ? Number(priceEntry) : Math.round((Number(priceEntry) / rateFromUSD(priceCurrency)) * 100) / 100)
    : 0;
  const essaiPriceUSD = essaiPriceEntry !== "" && !isNaN(Number(essaiPriceEntry))
    ? (priceCurrency === "USD" ? Number(essaiPriceEntry) : Math.round((Number(essaiPriceEntry) / rateFromUSD(priceCurrency)) * 100) / 100)
    : null;

  const readFile = (file) =>
    new Promise((resolve) => {
      if (!file.type.startsWith("image/")) return resolve(null);
      if (file.size > 5 * 1024 * 1024) return resolve(null);
      const reader = new FileReader();
      reader.onload = async (e) => {
        const compressed = await compressImage(e.target.result);
        resolve({ id: `${file.name}-${Date.now()}`, preview: compressed });
      };
      reader.readAsDataURL(file);
    });

  const addFiles = async (files) => {
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) return;
    const toProcess = Array.from(files).slice(0, remaining);
    const results = await Promise.all(toProcess.map(readFile));
    setPhotos((prev) => [...prev, ...results.filter(Boolean)]);
  };

  const removePhoto = (id) => setPhotos((prev) => prev.filter((p) => p.id !== id));

  const validate = () => {
    const e = {};
    if (!title.trim()) e.title = "Titre requis";
    if (!priceUSD || priceUSD <= 0) e.priceEntry = "Prix requis";
    if (photos.length === 0) e.photos = "Au moins une photo est requise";
    if (essaiDisponible && essaiPriceEntry !== "" && essaiPriceUSD <= 0) e.essaiPriceEntry = "Prix d'essai invalide";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || submitting) return;
    setSubmitting(true);
    try {
      const saved = await addActivity({
        activityType, title: title.trim(), description: description.trim(),
        price: priceUSD, priceUnit,
        currency: priceCurrency !== "USD" ? priceCurrency : null,
        priceEntered: priceEntry !== "" ? Number(priceEntry) : null,
        priceEntryCurrency: priceCurrency,
        durationMinutes: Number(durationMinutes) || 60,
        capacity: Number(capacity) || 1,
        essaiDisponible,
        essaiDurationMinutes: Number(essaiDurationMinutes) || 30,
        essaiPrice: essaiDisponible && essaiPriceUSD != null ? essaiPriceUSD : null,
        ville: ville.trim(), adresse: adresse.trim(),
        images: photos.map((p) => p.preview),
        thumbnail: photos[0]?.preview || null,
        businessId: businessId || undefined,
      });
      setResult(saved);
      success("Annonce activité soumise !");
    } catch (err) {
      if (err.code === "KYC_REQUIRED") {
        navigate("/kyc");
        return;
      }
      if (err.code === "CERTIFICATION_REQUIRED") {
        navigate("/partner-onboarding");
        return;
      }
      error(err.message || "Erreur lors de la soumission.");
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className={styles.page}>
        <div className={styles.resultCard}>
          <div className={styles.resultIcon}>{result.status === "approved" ? "✅" : "⏳"}</div>
          <h2 className={styles.resultTitle}>
            {result.status === "approved" ? "Annonce publiée !" : "Annonce en cours de vérification"}
          </h2>
          <p className={styles.resultDesc}>
            {result.status === "approved"
              ? "Votre activité est maintenant visible dans la section Activités et Loisirs du catalogue."
              : "Un admin va valider votre annonce avant publication — vous serez notifié(e)."}
          </p>
          <div className={styles.resultActions}>
            <button type="button" className={styles.primaryBtn} onClick={() => navigate("/vendor/dashboard")}>
              Aller à mon tableau de bord
            </button>
            <button type="button" className={styles.secondaryBtn} onClick={() => { setResult(null); setTitle(""); setPhotos([]); }}>
              Publier une autre activité
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>🎈 Publier une activité — Activités et Loisirs</h1>
        <p>Quad, Surf, Montgolfière, Jetski, Jet privé, Bateau... proposez une sortie réservable par les clients.</p>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Type d'activité</h2>
        <div className={styles.grid3}>
          {ACTIVITY_TYPES.map((t) => (
            <button key={t} type="button"
              className={`${styles.adTypeCard} ${activityType === t ? styles.adTypeActive : ""}`}
              onClick={() => setActivityType(t)}>
              <div className={styles.adTypeIcon}>{ACTIVITY_TYPE_ICONS[t] || "🎟️"}</div>
              <h3>{ACTIVITY_TYPE_LABELS[t] || t}</h3>
            </button>
          ))}
        </div>
      </div>

      {businesses.length > 0 && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Entreprise</h2>
          <select className={styles.field} value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
            <option value="">— Compte personnel —</option>
            {businesses.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
          </select>
        </div>
      )}

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Informations</h2>
        <label className={styles.field}>
          <span>Titre de l'annonce *</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex : Sortie Quad 2h dans les dunes" />
        </label>
        {errors.title && <p className={styles.err}>{errors.title}</p>}
        <label className={styles.field}>
          <span>Description</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
        </label>
        <div className={styles.grid2}>
          <label className={styles.field}>
            <span>Ville</span>
            <input value={ville} onChange={(e) => setVille(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Adresse</span>
            <input value={adresse} onChange={(e) => setAdresse(e.target.value)} />
          </label>
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Tarification</h2>
        <div className={styles.grid2}>
          <label className={styles.field}>
            <span>Prix *</span>
            <div className={styles.inputAffix}>
              <input type="number" min="0" value={priceEntry} onChange={(e) => setPriceEntry(e.target.value)} />
              <select value={priceCurrency} onChange={(e) => setPriceCurrency(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
              </select>
            </div>
          </label>
          <label className={styles.field}>
            <span>Unité de prix</span>
            <select value={priceUnit} onChange={(e) => setPriceUnit(e.target.value)}>
              <option value="per_person">Par personne</option>
              <option value="per_session">Forfait par sortie</option>
            </select>
          </label>
        </div>
        {errors.priceEntry && <p className={styles.err}>{errors.priceEntry}</p>}
        <div className={styles.grid2}>
          <label className={styles.field}>
            <span>Durée de la session (minutes)</span>
            <input type="number" min="1" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Capacité (participants max. par créneau)</span>
            <input type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          </label>
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Essai / découverte</h2>
        <label className={styles.switchLabel}>
          <input type="checkbox" className={styles.switchInput} checked={essaiDisponible}
            onChange={(e) => setEssaiDisponible(e.target.checked)} />
          <span className={styles.switchSlider} />
          Proposer un essai/découverte (session courte avant réservation complète)
        </label>
        {essaiDisponible && (
          <div className={styles.grid2} style={{ marginTop: 12 }}>
            <label className={styles.field}>
              <span>Durée de l'essai (minutes)</span>
              <input type="number" min="1" value={essaiDurationMinutes} onChange={(e) => setEssaiDurationMinutes(e.target.value)} />
            </label>
            <label className={styles.field}>
              <span>Prix de l'essai ({priceCurrency}, vide = même prix)</span>
              <input type="number" min="0" value={essaiPriceEntry} onChange={(e) => setEssaiPriceEntry(e.target.value)} />
            </label>
          </div>
        )}
        {errors.essaiPriceEntry && <p className={styles.err}>{errors.essaiPriceEntry}</p>}
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Photos *</h2>
        <div className={styles.photoGrid}>
          {photos.map((p) => (
            <div key={p.id} className={styles.previewBox}>
              <img src={p.preview} alt="" className={styles.previewImg} />
              <button type="button" className={styles.photoRemove} onClick={() => removePhoto(p.id)}>✕</button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <label className={styles.photoAdd}>
              <input type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
              <span className={styles.dropIcon}>📷</span>
              <span className={styles.dropTitle}>Ajouter</span>
            </label>
          )}
        </div>
        {errors.photos && <p className={styles.err}>{errors.photos}</p>}
      </div>

      <div className={styles.nav}>
        <Link to="/vendor" className={styles.prevBtn}>← Retour</Link>
        <button type="button" className={styles.submitBtn} onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Envoi…" : "Publier l'activité"}
        </button>
      </div>
    </div>
  );
};

export default ActivitySubmit;
