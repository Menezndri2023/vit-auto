import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useVehicles } from "../context/VehicleContext";
import { useCurrency } from "../context/CurrencyContext";
import { useToast } from "../context/ToastContext";
import { api } from "../utils/apiClient";
import {
  PART_CATEGORIES, PART_CATEGORY_LABELS, PART_CATEGORY_ICONS,
  PART_CONDITIONS, PART_CONDITION_LABELS, PART_SALE_MODE_LABELS,
  PART_SHIPPING_MODES, PART_SHIPPING_MODE_LABELS, MAX_PART_QUANTITY,
} from "../constants/spareParts";
import styles from "./VendorSubmit.module.css";

const MAX_PHOTOS = 8;

// Même recompression que ActivitySubmit.jsx / VendorSubmit.jsx.
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
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });

// Convertit un montant saisi dans la devise choisie vers l'USD de stockage.
const toUSD = (entry, currency, rateFromUSD) =>
  entry !== "" && !isNaN(Number(entry))
    ? (currency === "USD" ? Number(entry) : Math.round((Number(entry) / rateFromUSD(currency)) * 100) / 100)
    : null;

const PartSubmit = () => {
  const { token } = useAuth();
  const { addPart } = useVehicles();
  const { CURRENCIES, COUNTRIES_CONFIG, rateFromUSD } = useCurrency();
  const { success, error } = useToast();
  const navigate = useNavigate();

  const [businesses, setBusinesses] = useState([]);
  const [businessId, setBusinessId] = useState("");
  useEffect(() => {
    if (!token) return;
    api.get("/api/partner/businesses").then((res) => setBusinesses(res.businesses || [])).catch(() => {});
  }, [token]);

  const [category,    setCategory]    = useState("MOTEUR");
  const [title,       setTitle]       = useState("");
  const [description, setDescription] = useState("");
  const [brand,       setBrand]       = useState("");
  const [reference,   setReference]   = useState("");
  const [condition,   setCondition]   = useState("neuf");
  const [compat,      setCompat]      = useState([{ marque: "", modele: "", anneeDebut: "", anneeFin: "" }]);
  const [compatibilityText, setCompatibilityText] = useState("");

  const [saleMode,        setSaleMode]        = useState("direct");
  const [originCountry,   setOriginCountry]   = useState("");
  const [leadTimeDays,    setLeadTimeDays]    = useState(21);
  const [importFeesEntry, setImportFeesEntry] = useState("");
  const [customsIncluded, setCustomsIncluded] = useState(true);
  const [depositPercent,  setDepositPercent]  = useState(50);

  const [priceCurrency, setPriceCurrency] = useState("USD");
  const [priceEntry,    setPriceEntry]    = useState("");
  const [stock,         setStock]         = useState("");
  const [minOrderQty,   setMinOrderQty]   = useState(1);
  const [weightKg,      setWeightKg]      = useState("");

  const [shippingMode,    setShippingMode]    = useState("forfait");
  const [forfaitEntry,    setForfaitEntry]    = useState("");
  const [freeAboveEntry,  setFreeAboveEntry]  = useState("");
  const [deliveryDaysMin, setDeliveryDaysMin] = useState(1);
  const [deliveryDaysMax, setDeliveryDaysMax] = useState(5);
  const [shipCountries,   setShipCountries]   = useState([]);

  const [ville,      setVille]      = useState("");
  const [adresse,    setAdresse]    = useState("");
  const [photos,     setPhotos]     = useState([]);
  const [errors,     setErrors]     = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result,     setResult]     = useState(null);

  const priceUSD      = toUSD(priceEntry, priceCurrency, rateFromUSD);
  const forfaitUSD    = toUSD(forfaitEntry, priceCurrency, rateFromUSD);
  const freeAboveUSD  = toUSD(freeAboveEntry, priceCurrency, rateFromUSD);
  const importFeesUSD = toUSD(importFeesEntry, priceCurrency, rateFromUSD);

  const readFile = (file) =>
    new Promise((resolve) => {
      if (!file.type.startsWith("image/")) return resolve(null);
      if (file.size > 5 * 1024 * 1024) return resolve(null);
      const reader = new FileReader();
      reader.onload = async (e) => resolve({ id: `${file.name}-${Date.now()}`, preview: await compressImage(e.target.result) });
      reader.readAsDataURL(file);
    });
  const addFiles = async (files) => {
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) return;
    const results = await Promise.all(Array.from(files).slice(0, remaining).map(readFile));
    setPhotos((prev) => [...prev, ...results.filter(Boolean)]);
  };
  const removePhoto = (id) => setPhotos((prev) => prev.filter((p) => p.id !== id));

  const setCompatField = (i, field, value) =>
    setCompat((prev) => prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));

  const validate = () => {
    const e = {};
    if (!title.trim()) e.title = "Titre requis";
    if (!(priceUSD > 0)) e.priceEntry = "Prix requis";
    if (photos.length === 0) e.photos = "Au moins une photo est requise";
    if (saleMode === "import" && !originCountry) e.originCountry = "Pays d'origine requis pour une importation";
    if (shippingMode === "forfait" && forfaitEntry !== "" && !(forfaitUSD >= 0)) e.forfait = "Forfait invalide";
    if (Number(deliveryDaysMax) < Number(deliveryDaysMin)) e.delivery = "Le délai maximum doit être ≥ au minimum";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || submitting) return;
    setSubmitting(true);
    try {
      const saved = await addPart({
        category, title: title.trim(), description: description.trim(),
        brand: brand.trim(), reference: reference.trim(), condition,
        compatibility: compat.filter((c) => c.marque.trim()),
        compatibilityText: compatibilityText.trim(),
        saleMode,
        importInfo: saleMode === "import"
          ? { originCountry, leadTimeDays: Number(leadTimeDays) || 21, feesUSD: importFeesUSD ?? 0, customsIncluded, depositPercent: Number(depositPercent) || 0 }
          : undefined,
        price: priceUSD,
        currency: priceCurrency !== "USD" ? priceCurrency : null,
        priceEntered: priceEntry !== "" ? Number(priceEntry) : null,
        priceEntryCurrency: priceCurrency,
        stock: stock === "" ? null : Number(stock),
        minOrderQty: Number(minOrderQty) || 1,
        weightKg: weightKg === "" ? null : Number(weightKg),
        shipping: {
          mode: shippingMode, forfaitUSD: forfaitUSD ?? 0, freeAboveUSD: freeAboveUSD,
          deliveryDaysMin: Number(deliveryDaysMin) || 0, deliveryDaysMax: Number(deliveryDaysMax) || 0,
          countries: shipCountries,
        },
        ville: ville.trim(), adresse: adresse.trim(),
        images: photos.map((p) => p.preview),
        thumbnail: photos[0]?.preview || null,
        businessId: businessId || undefined,
      });
      setResult(saved);
      success("Annonce pièce soumise !");
    } catch (err) {
      if (err.code === "KYC_REQUIRED") { navigate("/kyc"); return; }
      if (err.code === "CERTIFICATION_REQUIRED") { navigate("/partner-onboarding"); return; }
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
          <h2 className={styles.resultTitle}>{result.status === "approved" ? "Annonce publiée !" : "Annonce en cours de vérification"}</h2>
          <p className={styles.resultDesc}>
            {result.status === "approved"
              ? "Votre pièce est visible dans la rubrique Pièces détachées du catalogue."
              : "Un admin va valider votre annonce avant publication — vous serez notifié(e)."}
          </p>
          <div className={styles.resultActions}>
            <button type="button" className={styles.primaryBtn} onClick={() => navigate("/vendor/dashboard")}>Aller à mon tableau de bord</button>
            <button type="button" className={styles.secondaryBtn} onClick={() => { setResult(null); setTitle(""); setReference(""); setPhotos([]); }}>Publier une autre pièce</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>🔩 Publier une pièce détachée</h1>
        <p>Pièce en stock (vente directe) ou importée à la commande (vente importation) — toujours livrée au client.</p>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Catégorie</h2>
        <div className={styles.grid3}>
          {PART_CATEGORIES.map((c) => (
            <button key={c} type="button" className={`${styles.adTypeCard} ${category === c ? styles.adTypeActive : ""}`} onClick={() => setCategory(c)}>
              <div className={styles.adTypeIcon}>{PART_CATEGORY_ICONS[c] || "📦"}</div>
              <h3>{PART_CATEGORY_LABELS[c] || c}</h3>
            </button>
          ))}
        </div>
      </div>

      {businesses.length > 0 && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Entreprise</h2>
          <select className={styles.field} value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
            <option value="">— Compte personnel —</option>
            {businesses.map((b) => <option key={b._id} value={b._id}>{b.name || b.companyName}</option>)}
          </select>
        </div>
      )}

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>La pièce</h2>
        <label className={styles.field}>
          <span>Titre de l'annonce *</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex : Plaquettes de frein avant Bosch — Golf 5/6" maxLength={160} />
        </label>
        {errors.title && <p className={styles.err}>{errors.title}</p>}
        <div className={styles.grid2}>
          <label className={styles.field}>
            <span>Fabricant / marque de la pièce</span>
            <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Ex : Bosch, Valeo, origine constructeur" maxLength={80} />
          </label>
          <label className={styles.field}>
            <span>Référence (OEM / constructeur)</span>
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ex : 1K0698151" maxLength={80} />
          </label>
        </div>
        <div className={styles.grid2}>
          <label className={styles.field}>
            <span>État</span>
            <select value={condition} onChange={(e) => setCondition(e.target.value)}>
              {PART_CONDITIONS.map((c) => <option key={c} value={c}>{PART_CONDITION_LABELS[c]}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            <span>Poids (kg, optionnel)</span>
            <input type="number" min="0" step="0.1" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
          </label>
        </div>
        <label className={styles.field}>
          <span>Description</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={4000}
            placeholder="Caractéristiques, garantie, contenu du lot…" />
        </label>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Véhicules compatibles</h2>
        {compat.map((c, i) => (
          <div key={i} className={styles.grid2} style={{ gridTemplateColumns: "1.2fr 1.2fr .7fr .7fr auto", alignItems: "end" }}>
            <label className={styles.field}><span>Marque</span><input value={c.marque} onChange={(e) => setCompatField(i, "marque", e.target.value)} placeholder="Volkswagen" /></label>
            <label className={styles.field}><span>Modèle</span><input value={c.modele} onChange={(e) => setCompatField(i, "modele", e.target.value)} placeholder="Golf" /></label>
            <label className={styles.field}><span>De</span><input type="number" min="1950" max="2100" value={c.anneeDebut} onChange={(e) => setCompatField(i, "anneeDebut", e.target.value)} placeholder="2004" /></label>
            <label className={styles.field}><span>À</span><input type="number" min="1950" max="2100" value={c.anneeFin} onChange={(e) => setCompatField(i, "anneeFin", e.target.value)} placeholder="2012" /></label>
            <button type="button" className={styles.secondaryBtn} onClick={() => setCompat((prev) => prev.filter((_, idx) => idx !== i))} disabled={compat.length === 1} aria-label="Retirer">✕</button>
          </div>
        ))}
        <button type="button" className={styles.secondaryBtn} onClick={() => setCompat((prev) => [...prev, { marque: "", modele: "", anneeDebut: "", anneeFin: "" }])} disabled={compat.length >= 30}>
          + Ajouter un véhicule compatible
        </button>
        <label className={styles.field} style={{ marginTop: 12 }}>
          <span>Précisions (texte libre)</span>
          <input value={compatibilityText} onChange={(e) => setCompatibilityText(e.target.value)} placeholder="Ex : toutes motorisations diesel, sauf 4Motion" maxLength={500} />
        </label>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Mode de vente</h2>
        <div className={styles.grid2}>
          {Object.entries(PART_SALE_MODE_LABELS).map(([mode, label]) => (
            <button key={mode} type="button" className={`${styles.adTypeCard} ${saleMode === mode ? styles.adTypeActive : ""}`} onClick={() => setSaleMode(mode)}>
              <div className={styles.adTypeIcon}>{mode === "direct" ? "📦" : "🌍"}</div>
              <h3>{label}</h3>
              <p>{mode === "direct" ? "Pièce disponible chez vous, expédiée dès confirmation." : "Pièce commandée à l'étranger : délai, origine et frais d'importation annoncés au client."}</p>
            </button>
          ))}
        </div>
        {saleMode === "import" && (
          <>
            <div className={styles.grid2} style={{ marginTop: 12 }}>
              <label className={styles.field}>
                <span>Pays d'origine *</span>
                <select value={originCountry} onChange={(e) => setOriginCountry(e.target.value)}>
                  <option value="">— Sélectionner —</option>
                  {COUNTRIES_CONFIG.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
                </select>
              </label>
              <label className={styles.field}>
                <span>Délai d'importation annoncé (jours)</span>
                <input type="number" min="1" max="120" value={leadTimeDays} onChange={(e) => setLeadTimeDays(e.target.value)} />
              </label>
            </div>
            {errors.originCountry && <p className={styles.err}>{errors.originCountry}</p>}
            <div className={styles.grid2}>
              <label className={styles.field}>
                <span>Frais d'importation par commande ({priceCurrency})</span>
                <input type="number" min="0" value={importFeesEntry} onChange={(e) => setImportFeesEntry(e.target.value)} placeholder="Transport international + douane" />
              </label>
              <label className={styles.field}>
                <span>Acompte exigé à la confirmation (%)</span>
                <input type="number" min="0" max="100" value={depositPercent} onChange={(e) => setDepositPercent(e.target.value)} />
              </label>
            </div>
            <label className={styles.switchLabel}>
              <input type="checkbox" className={styles.switchInput} checked={customsIncluded} onChange={(e) => setCustomsIncluded(e.target.checked)} />
              <span className={styles.switchSlider} />
              Droits de douane inclus dans les frais d'importation
            </label>
          </>
        )}
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Prix et stock</h2>
        <div className={styles.grid2}>
          <label className={styles.field}>
            <span>Prix unitaire *</span>
            <div className={styles.inputAffix}>
              <input type="number" min="0" value={priceEntry} onChange={(e) => setPriceEntry(e.target.value)} />
              <select value={priceCurrency} onChange={(e) => setPriceCurrency(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
              </select>
            </div>
          </label>
          <label className={styles.field}>
            <span>Stock disponible (vide = sur commande)</span>
            <input type="number" min="0" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="Ex : 12" />
          </label>
        </div>
        {errors.priceEntry && <p className={styles.err}>{errors.priceEntry}</p>}
        <label className={styles.field}>
          <span>Quantité minimale par commande (max. {MAX_PART_QUANTITY})</span>
          <input type="number" min="1" max={MAX_PART_QUANTITY} value={minOrderQty} onChange={(e) => setMinOrderQty(e.target.value)} />
        </label>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Livraison</h2>
        <p className={styles.hint}>Une pièce est toujours livrée — jamais retirée sur place. Choisissez comment vous facturez la livraison.</p>
        <label className={styles.field}>
          <span>Frais de livraison</span>
          <select value={shippingMode} onChange={(e) => setShippingMode(e.target.value)}>
            {PART_SHIPPING_MODES.map((m) => <option key={m} value={m}>{PART_SHIPPING_MODE_LABELS[m]}</option>)}
          </select>
        </label>
        {shippingMode === "forfait" && (
          <div className={styles.grid2}>
            <label className={styles.field}>
              <span>Forfait ({priceCurrency})</span>
              <input type="number" min="0" value={forfaitEntry} onChange={(e) => setForfaitEntry(e.target.value)} />
            </label>
            <label className={styles.field}>
              <span>Offerte à partir de ({priceCurrency}, optionnel)</span>
              <input type="number" min="0" value={freeAboveEntry} onChange={(e) => setFreeAboveEntry(e.target.value)} />
            </label>
          </div>
        )}
        {shippingMode === "distance" && (
          <p className={styles.hint}>Le barème au kilomètre du pays s'applique entre votre adresse (ci-dessous) et celle du client.</p>
        )}
        {errors.forfait && <p className={styles.err}>{errors.forfait}</p>}
        <div className={styles.grid2}>
          <label className={styles.field}>
            <span>Délai de livraison minimum (jours)</span>
            <input type="number" min="0" max="120" value={deliveryDaysMin} onChange={(e) => setDeliveryDaysMin(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Délai de livraison maximum (jours)</span>
            <input type="number" min="0" max="120" value={deliveryDaysMax} onChange={(e) => setDeliveryDaysMax(e.target.value)} />
          </label>
        </div>
        {errors.delivery && <p className={styles.err}>{errors.delivery}</p>}
        <label className={styles.field}>
          <span>Autres pays desservis (optionnel — votre pays l'est toujours)</span>
          <select multiple value={shipCountries} onChange={(e) => setShipCountries([...e.target.selectedOptions].map((o) => o.value))} style={{ minHeight: 96 }}>
            {COUNTRIES_CONFIG.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
          </select>
        </label>
        <div className={styles.grid2}>
          <label className={styles.field}>
            <span>Ville d'expédition</span>
            <input value={ville} onChange={(e) => setVille(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Adresse</span>
            <input value={adresse} onChange={(e) => setAdresse(e.target.value)} />
          </label>
        </div>
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
        <Link to="/vendor/dashboard" className={styles.prevBtn}>← Retour</Link>
        <button type="button" className={styles.submitBtn} onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Envoi…" : "Publier la pièce"}
        </button>
      </div>
    </div>
  );
};

export default PartSubmit;
