import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useVehicles } from "../context/VehicleContext";
import { useToast } from "../context/ToastContext";
import styles from "./VendorSubmit.module.css";

// ─── Constantes ───────────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: "Identité",         icon: "👤" },
  { id: 2, label: "Type d'annonce",   icon: "📋" },
  { id: 3, label: "Informations",     icon: "🚗" },
  { id: 4, label: "Caractéristiques", icon: "⚙️"  },
  { id: 5, label: "Tarification",     icon: "💰" },
  { id: 6, label: "Photos & Desc.",   icon: "📸" },
  { id: 7, label: "Vérification",     icon: "✅" },
];

const VEHICLE_TYPES  = ["SUV", "Berline", "Sportif", "Citadine", "Monospace", "Pick-up", "Cabriolet", "Utilitaire"];
const FUELS          = ["Essence", "Diesel", "Hybride", "Électrique", "GPL"];
const TRANSMISSIONS  = ["Automatique", "Manuelle"];
const ETATS          = ["Neuf", "Comme neuf", "Bon état", "À réparer"];
const DISPOS         = ["Temps plein", "Weekends", "Soirées", "Sur demande", "En semaine"];
const LANGUES        = ["Français", "Anglais", "Arabe", "Wolof", "Portugais", "Espagnol"];
const ANNEES         = Array.from({ length: 30 }, (_, i) => new Date().getFullYear() - i);

const fmt = (n) => Number(n || 0).toLocaleString("fr-FR");

// ─── Composant ─────────────────────────────────────────────────────────────────
const VendorSubmit = () => {
  const { user, token } = useAuth();
  const { success, error } = useToast();
  const { addVehicle } = useVehicles();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState(null); // { status, score, errors, warnings, vehicleName }

  // Photos : { id, preview (dataURL), name, size }
  const [photos, setPhotos] = useState([]);
  const MAX_PHOTOS = 6;
  const fileInputRef = useRef(null);

  // ── Étape 1 : Identité du partenaire
  const [identity, setIdentity] = useState({
    typePubliant: "particulier",   // particulier | entreprise | professionnel
    nom:          "",
    prenom:       "",
    nomEntreprise:"",
    telephone:    "",
    ville:        "",
    adresse:      "",
  });

  // ── Étape 2 : Type d'annonce
  const [adType, setAdType] = useState(""); // "location" | "vente" | "chauffeur"

  // ── Données véhicule
  const [vehicle, setVehicle] = useState({
    title: "", marque: "", modele: "", annee: new Date().getFullYear(),
    etat: "Bon état", couleur: "",
    carburant: "Essence", transmission: "Automatique",
    nombrePlaces: 5, nombrePortes: 4, climatisation: true, withDriver: false,
    kilometrage: "",
    pricePerDay: "", priceForSale: "", caution: "",
    ageMin: 21, permisRequis: true, assuranceOptionnelle: true,
    description: "", images: [""],
  });

  // ── Données chauffeur
  const [driver, setDriver] = useState({
    firstName: "", lastName: "", title: "", telephone: "",
    tarif: "", tarifHeure: "",
    disponibilite: "Temps plein", zone: "", ville: "",
    experience: "", langues: ["Français"],
    permisCategorie: "B", vehiculePersonnel: false, typeVehicule: "",
    description: "", images: [""],
  });

  const [errors, setErrors] = useState({});

  const isPartner = !!user && ["partenaire", "admin"].includes(user.role);

  // Redirections via effect — jamais pendant le render (évite removeChild en StrictMode)
  useEffect(() => {
    if (!user) return;
    if (!token) {
      error("🔐 Session expirée ou incomplète. Reconnectez-vous pour publier.");
      navigate("/login", { replace: true });
    } else if (!isPartner) {
      error("Compte partenaire requis pour publier des annonces.");
      navigate("/register?role=partenaire", { replace: true });
    }
  }, [user, token, isPartner]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Garde d'accès ──────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div className={styles.page}>
        <div className={styles.accessCard}>
          <div className={styles.accessIcon}>🔒</div>
          <h2>Connexion requise</h2>
          <p>Vous devez être connecté pour publier une annonce.</p>
          <button className={styles.primaryBtn} onClick={() => navigate("/login")}>
            Se connecter
          </button>
        </div>
      </div>
    );
  }

  if (!token || !isPartner) {
    // useEffect gère la redirection ; on évite tout rendu de formulaire
    return (
      <div className={styles.page}>
        <div className={styles.accessCard}>
          <div className={styles.accessIcon}>🤝</div>
          <h2>Accès restreint</h2>
          <p>Seuls les partenaires peuvent publier des annonces.</p>
          <button className={styles.primaryBtn} onClick={() => navigate("/register?role=partenaire")}>
            Devenir partenaire
          </button>
        </div>
      </div>
    );
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const setId   = (field, val) => setIdentity(p => ({ ...p, [field]: val }));
  const setVeh  = (field, val) => setVehicle(p => ({ ...p, [field]: val }));
  const setDrv  = (field, val) => setDriver(p => ({ ...p, [field]: val }));

  const handleVehChange = (e) => {
    const { name, value, type, checked } = e.target;
    setVehicle(p => ({
      ...p,
      [name]: type === "checkbox" ? checked
        : ["nombrePlaces","nombrePortes","annee","ageMin","pricePerDay","priceForSale","caution","kilometrage"].includes(name)
          ? value === "" ? "" : Number(value)
          : value,
    }));
  };

  const handleDrvChange = (e) => {
    const { name, value, type, checked } = e.target;
    setDriver(p => ({
      ...p,
      [name]: type === "checkbox" ? checked
        : ["tarif","tarifHeure"].includes(name) ? (value === "" ? "" : Number(value))
        : value,
    }));
  };

  const toggleLangue = (lang) => {
    setDriver(p => ({
      ...p,
      langues: p.langues.includes(lang)
        ? p.langues.filter(l => l !== lang)
        : [...p.langues, lang],
    }));
  };

  // ── Gestion photos réelles ───────────────────────────────────────────────
  const readFile = (file) =>
    new Promise((resolve) => {
      if (!file.type.startsWith("image/")) return resolve(null);
      if (file.size > 5 * 1024 * 1024) return resolve(null); // max 5 Mo
      const reader = new FileReader();
      reader.onload = (e) => resolve({ id: `${file.name}-${Date.now()}`, preview: e.target.result, name: file.name, size: file.size });
      reader.readAsDataURL(file);
    });

  const addFiles = async (files) => {
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) return;
    const toProcess = Array.from(files).slice(0, remaining);
    const results = await Promise.all(toProcess.map(readFile));
    const valid = results.filter(Boolean);
    setPhotos(prev => [...prev, ...valid]);
  };

  const removePhoto = (id) => setPhotos(prev => prev.filter(p => p.id !== id));

  const handleFileInput = (e) => addFiles(e.target.files);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  // ─── Validation par étape ────────────────────────────────────────────────────
  const validate = () => {
    const e = {};
    if (step === 1) {
      if (identity.typePubliant !== "particulier" && !identity.nomEntreprise.trim())
        e.nomEntreprise = "Nom de structure requis";
      if (identity.typePubliant === "particulier" && !identity.prenom.trim())
        e.prenom = "Prénom requis";
      if (!identity.nom.trim())   e.nom       = "Nom requis";
      if (!identity.telephone.trim()) e.telephone = "Téléphone requis";
      if (!identity.ville.trim()) e.ville     = "Ville requise";
    }
    if (step === 2) {
      if (!adType) e.adType = "Choisissez un type d'annonce";
    }
    if (step === 3) {
      if (adType !== "chauffeur") {
        if (!vehicle.title.trim())  e.title  = "Titre requis";
        if (!vehicle.marque.trim()) e.marque = "Marque requise";
        if (!vehicle.modele.trim()) e.modele = "Modèle requis";
      } else {
        if (!driver.firstName.trim()) e.firstName = "Prénom requis";
        if (!driver.lastName.trim())  e.lastName  = "Nom requis";
        if (!driver.title.trim())     e.title     = "Titre du service requis";
        if (!driver.experience.trim())e.experience= "Expérience requise";
      }
    }
    if (step === 4 && adType === "chauffeur") {
      if (!driver.zone.trim())         e.zone         = "Zone de couverture requise";
      if (!driver.disponibilite)       e.disponibilite= "Disponibilité requise";
    }
    if (step === 5) {
      if (adType === "location" && (!vehicle.pricePerDay || vehicle.pricePerDay < 1000))
        e.pricePerDay = "Prix/jour requis (min 1 000 FCFA)";
      if (adType === "vente" && (!vehicle.priceForSale || vehicle.priceForSale < 1000))
        e.priceForSale = "Prix de vente requis (min 1 000 FCFA)";
      if (adType === "chauffeur" && (!driver.tarif || driver.tarif < 1000))
        e.tarif = "Tarif requis (min 1 000 FCFA)";
    }
    if (step === 6) {
      const desc = adType === "chauffeur" ? driver.description : vehicle.description;
      if (desc.trim().length > 0 && desc.trim().length < 10)
        e.description = "Description trop courte (min 10 caractères si renseignée)";
      if (adType !== "chauffeur" && photos.length === 0)
        e.photos = "Au moins 1 photo est requise pour votre annonce véhicule";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => { if (validate()) setStep(s => s + 1); };
  const prev = () => { setErrors({}); setStep(s => Math.max(s - 1, 1)); };

  // ─── Soumission finale ───────────────────────────────────────────────────────
  const handleSubmit = async () => {
    // Double-check token before API call
    if (!token) {
      error("Session invalide. Rechargez la page ou reconnectez-vous.");
      navigate("/login", { replace: true });
      return;
    }
    if (!validate()) return;
    setSubmitting(true);

    const contactInfo = {
      ville: identity.ville,
      adresse: identity.adresse,
      contactNom: identity.typePubliant === "particulier"
        ? `${identity.prenom} ${identity.nom}`
        : identity.nomEntreprise || identity.nom,
      contactTel: identity.telephone,
    };

    const imageUrls = photos.map(p => p.preview);

    try {
      if (adType === "chauffeur") {
        const headers = { "Content-Type": "application/json" };
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch("/api/drivers", {
          method: "POST",
          headers,
          body: JSON.stringify({ ...driver, ...contactInfo, images: imageUrls }),
        });
        if (res.ok) {
          success("Votre profil chauffeur est soumis pour vérification !");
        } else {
          const data = await res.json();
          error(data.message || "Erreur lors de la publication.");
          return;
        }
      } else {
        const saved = await addVehicle({
          ...vehicle,
          type: adType,
          vehicleType: vehicle.vehicleType || "SUV",
          ...contactInfo,
          images: imageUrls,
        });

        // Afficher le résultat de validation
        setResult({
          status:      saved?.status,
          score:       saved?.validationScore,
          errors:      saved?.validationErrors   || [],
          warnings:    saved?.validationWarnings || [],
          vehicleName: saved?.name || saved?.title || vehicle.title,
        });
        return; // ne pas naviguer ici, on affiche l'écran résultat
      }
      setTimeout(() => navigate("/vendor/dashboard"), 2000);
    } catch {
      error("Impossible de joindre le serveur. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Rendu des étapes ────────────────────────────────────────────────────────
  const renderStep = () => {
    switch (step) {

      // ── ÉTAPE 1 : Identité ────────────────────────────────────────────────
      case 1:
        return (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>👤 Votre identité</h2>
            <p className={styles.cardSub}>Ces informations apparaîtront comme contact de l'annonce.</p>

            <div className={styles.typeToggle}>
              {[
                { v: "particulier",    label: "🧑 Particulier" },
                { v: "professionnel",  label: "🏢 Professionnel" },
                { v: "entreprise",     label: "🏛️ Entreprise" },
              ].map(({ v, label }) => (
                <button
                  key={v}
                  type="button"
                  className={`${styles.typeBtn} ${identity.typePubliant === v ? styles.typeBtnActive : ""}`}
                  onClick={() => setId("typePubliant", v)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className={styles.grid2}>
              {identity.typePubliant !== "particulier" && (
                <div className={`${styles.field} ${styles.colSpan2}`}>
                  <label>Nom de l'entreprise / structure *</label>
                  <input value={identity.nomEntreprise} onChange={e => setId("nomEntreprise", e.target.value)}
                    placeholder="Ex : Transport Elite SARL" />
                  {errors.nomEntreprise && <span className={styles.err}>{errors.nomEntreprise}</span>}
                </div>
              )}
              <div className={styles.field}>
                <label>{identity.typePubliant === "particulier" ? "Prénom *" : "Prénom du responsable *"}</label>
                <input value={identity.prenom} onChange={e => setId("prenom", e.target.value)}
                  placeholder="Ex : Mamadou" />
                {errors.prenom && <span className={styles.err}>{errors.prenom}</span>}
              </div>
              <div className={styles.field}>
                <label>{identity.typePubliant === "particulier" ? "Nom *" : "Nom du responsable *"}</label>
                <input value={identity.nom} onChange={e => setId("nom", e.target.value)}
                  placeholder="Ex : Diallo" />
                {errors.nom && <span className={styles.err}>{errors.nom}</span>}
              </div>
              <div className={styles.field}>
                <label>Téléphone *</label>
                <input value={identity.telephone} onChange={e => setId("telephone", e.target.value)}
                  placeholder="+221 77 000 00 00" type="tel" />
                {errors.telephone && <span className={styles.err}>{errors.telephone}</span>}
              </div>
              <div className={styles.field}>
                <label>Ville *</label>
                <input value={identity.ville} onChange={e => setId("ville", e.target.value)}
                  placeholder="Ex : Dakar, Abidjan, Bamako..." />
                {errors.ville && <span className={styles.err}>{errors.ville}</span>}
              </div>
              <div className={`${styles.field} ${styles.colSpan2}`}>
                <label>Adresse (optionnel)</label>
                <input value={identity.adresse} onChange={e => setId("adresse", e.target.value)}
                  placeholder="Ex : Rue 10, Plateau" />
              </div>
            </div>
          </div>
        );

      // ── ÉTAPE 2 : Type d'annonce ──────────────────────────────────────────
      case 2:
        return (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>📋 Type d'annonce</h2>
            <p className={styles.cardSub}>Quel service souhaitez-vous proposer ?</p>
            {errors.adType && <p className={styles.err}>{errors.adType}</p>}

            <div className={styles.adTypeGrid}>
              <button type="button" className={`${styles.adTypeCard} ${adType === "location" ? styles.adTypeActive : ""}`}
                onClick={() => setAdType("location")}>
                <div className={styles.adTypeIcon}>🚗</div>
                <h3>Location de véhicule</h3>
                <p>Mettez votre véhicule en location à la journée. Définissez vos tarifs et conditions.</p>
                <ul className={styles.adTypeList}>
                  <li>✓ Tarif à la journée (FCFA)</li>
                  <li>✓ Caution paramétrable</li>
                  <li>✓ Conditions d'âge & permis</li>
                </ul>
              </button>

              <button type="button" className={`${styles.adTypeCard} ${adType === "vente" ? styles.adTypeActive : ""}`}
                onClick={() => setAdType("vente")}>
                <div className={styles.adTypeIcon}>💰</div>
                <h3>Vente de véhicule</h3>
                <p>Publiez votre véhicule à la vente. Les acheteurs peuvent demander un essai.</p>
                <ul className={styles.adTypeList}>
                  <li>✓ Prix de vente fixe</li>
                  <li>✓ Prise de rendez-vous essai</li>
                  <li>✓ Fiche technique complète</li>
                </ul>
              </button>

              <button type="button" className={`${styles.adTypeCard} ${adType === "chauffeur" ? styles.adTypeActive : ""}`}
                onClick={() => setAdType("chauffeur")}>
                <div className={styles.adTypeIcon}>👨‍✈️</div>
                <h3>Service chauffeur</h3>
                <p>Proposez vos services de transport avec chauffeur privé ou professionnel.</p>
                <ul className={styles.adTypeList}>
                  <li>✓ Tarif à l'heure ou au jour</li>
                  <li>✓ Zone de couverture</li>
                  <li>✓ Profil vérifié</li>
                </ul>
              </button>
            </div>
          </div>
        );

      // ── ÉTAPE 3 : Informations principales ───────────────────────────────
      case 3:
        if (adType === "chauffeur") return (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>👨‍✈️ Profil du chauffeur</h2>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label>Prénom du chauffeur *</label>
                <input name="firstName" value={driver.firstName} onChange={handleDrvChange}
                  placeholder="Ex : Ibrahima" />
                {errors.firstName && <span className={styles.err}>{errors.firstName}</span>}
              </div>
              <div className={styles.field}>
                <label>Nom du chauffeur *</label>
                <input name="lastName" value={driver.lastName} onChange={handleDrvChange}
                  placeholder="Ex : Sarr" />
                {errors.lastName && <span className={styles.err}>{errors.lastName}</span>}
              </div>
              <div className={`${styles.field} ${styles.colSpan2}`}>
                <label>Titre du service *</label>
                <input name="title" value={driver.title} onChange={handleDrvChange}
                  placeholder="Ex : Chauffeur VIP Dakar — Disponible 7j/7" />
                {errors.title && <span className={styles.err}>{errors.title}</span>}
              </div>
              <div className={styles.field}>
                <label>Téléphone de contact</label>
                <input name="telephone" value={driver.telephone} onChange={handleDrvChange}
                  placeholder="+221 77 000 00 00" type="tel" />
              </div>
              <div className={styles.field}>
                <label>Années d'expérience *</label>
                <input name="experience" value={driver.experience} onChange={handleDrvChange}
                  placeholder="Ex : 5 ans, 10 ans..." />
                {errors.experience && <span className={styles.err}>{errors.experience}</span>}
              </div>
              <div className={styles.field}>
                <label>Catégorie de permis</label>
                <select name="permisCategorie" value={driver.permisCategorie} onChange={handleDrvChange}>
                  {["B", "C", "D", "E", "B+C"].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>
        );

        return (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>🚗 Informations du véhicule</h2>
            <div className={styles.grid2}>
              <div className={`${styles.field} ${styles.colSpan2}`}>
                <label>Titre de l'annonce *</label>
                <input name="title" value={vehicle.title} onChange={handleVehChange}
                  placeholder="Ex : BMW X5 2022 — Très bon état, full options" />
                {errors.title && <span className={styles.err}>{errors.title}</span>}
              </div>
              <div className={styles.field}>
                <label>Marque *</label>
                <input name="marque" value={vehicle.marque} onChange={handleVehChange}
                  placeholder="Ex : Toyota, Mercedes, Renault..." />
                {errors.marque && <span className={styles.err}>{errors.marque}</span>}
              </div>
              <div className={styles.field}>
                <label>Modèle *</label>
                <input name="modele" value={vehicle.modele} onChange={handleVehChange}
                  placeholder="Ex : Hilux, Classe C, Clio..." />
                {errors.modele && <span className={styles.err}>{errors.modele}</span>}
              </div>
              <div className={styles.field}>
                <label>Année</label>
                <select name="annee" value={vehicle.annee} onChange={handleVehChange}>
                  {ANNEES.map(y => <option key={y}>{y}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label>État général</label>
                <select name="etat" value={vehicle.etat} onChange={handleVehChange}>
                  {ETATS.map(e => <option key={e}>{e}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label>Type de véhicule</label>
                <select name="vehicleType" value={vehicle.vehicleType || "SUV"} onChange={e => setVeh("vehicleType", e.target.value)}>
                  {VEHICLE_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label>Couleur</label>
                <input name="couleur" value={vehicle.couleur} onChange={handleVehChange}
                  placeholder="Ex : Noir, Blanc, Gris métallisé..." />
              </div>
            </div>
          </div>
        );

      // ── ÉTAPE 4 : Caractéristiques techniques ─────────────────────────────
      case 4:
        if (adType === "chauffeur") return (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>⚙️ Disponibilité & Zone</h2>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label>Disponibilité *</label>
                <select name="disponibilite" value={driver.disponibilite} onChange={handleDrvChange}>
                  {DISPOS.map(d => <option key={d}>{d}</option>)}
                </select>
                {errors.disponibilite && <span className={styles.err}>{errors.disponibilite}</span>}
              </div>
              <div className={styles.field}>
                <label>Zone couverte *</label>
                <input name="zone" value={driver.zone} onChange={handleDrvChange}
                  placeholder="Ex : Grand Dakar, Toute la Côte d'Ivoire..." />
                {errors.zone && <span className={styles.err}>{errors.zone}</span>}
              </div>
              <div className={styles.field}>
                <label>Ville principale</label>
                <input name="ville" value={driver.ville} onChange={handleDrvChange}
                  placeholder="Ex : Dakar" />
              </div>

              <div className={`${styles.field} ${styles.colSpan2}`}>
                <label>Langues parlées</label>
                <div className={styles.checkboxGrid}>
                  {LANGUES.map(l => (
                    <label key={l} className={`${styles.checkItem} ${driver.langues.includes(l) ? styles.checkActive : ""}`}>
                      <input type="checkbox" checked={driver.langues.includes(l)}
                        onChange={() => toggleLangue(l)} />
                      {l}
                    </label>
                  ))}
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.switchLabel}>
                  <span>Je possède mon propre véhicule</span>
                  <input type="checkbox" name="vehiculePersonnel" checked={driver.vehiculePersonnel}
                    onChange={handleDrvChange} className={styles.switchInput} />
                  <span className={styles.switchSlider} />
                </label>
              </div>
              {driver.vehiculePersonnel && (
                <div className={styles.field}>
                  <label>Type de véhicule personnel</label>
                  <input name="typeVehicule" value={driver.typeVehicule} onChange={handleDrvChange}
                    placeholder="Ex : Berline, SUV, Minibus..." />
                </div>
              )}
            </div>
          </div>
        );

        return (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>⚙️ Caractéristiques techniques</h2>
            <div className={styles.grid3}>
              <div className={styles.field}>
                <label>Carburant</label>
                <select name="carburant" value={vehicle.carburant} onChange={handleVehChange}>
                  {FUELS.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label>Transmission</label>
                <select name="transmission" value={vehicle.transmission} onChange={handleVehChange}>
                  {TRANSMISSIONS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label>Nombre de places</label>
                <input type="number" name="nombrePlaces" min="1" max="20"
                  value={vehicle.nombrePlaces} onChange={handleVehChange} />
              </div>
              <div className={styles.field}>
                <label>Nombre de portes</label>
                <input type="number" name="nombrePortes" min="2" max="6"
                  value={vehicle.nombrePortes} onChange={handleVehChange} />
              </div>
              <div className={styles.field}>
                <label>Kilométrage</label>
                <input type="number" name="kilometrage" value={vehicle.kilometrage}
                  onChange={handleVehChange} placeholder="Ex : 45000" />
              </div>
            </div>

            <div className={styles.checkboxRow}>
              <label className={`${styles.checkItem} ${vehicle.climatisation ? styles.checkActive : ""}`}>
                <input type="checkbox" name="climatisation" checked={vehicle.climatisation} onChange={handleVehChange} />
                ❄️ Climatisation
              </label>
              {adType === "location" && (
                <label className={`${styles.checkItem} ${vehicle.withDriver ? styles.checkActive : ""}`}>
                  <input type="checkbox" name="withDriver" checked={vehicle.withDriver} onChange={handleVehChange} />
                  👤 Option avec chauffeur disponible
                </label>
              )}
            </div>
          </div>
        );

      // ── ÉTAPE 5 : Tarification ────────────────────────────────────────────
      case 5:
        if (adType === "chauffeur") return (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>💰 Tarification du service</h2>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label>Tarif à la journée (FCFA) *</label>
                <div className={styles.inputAffix}>
                  <input type="number" name="tarif" value={driver.tarif} onChange={handleDrvChange}
                    placeholder="Ex : 50000" min="1000" />
                  <span>FCFA / jour</span>
                </div>
                {errors.tarif && <span className={styles.err}>{errors.tarif}</span>}
              </div>
              <div className={styles.field}>
                <label>Tarif à l'heure (FCFA) — optionnel</label>
                <div className={styles.inputAffix}>
                  <input type="number" name="tarifHeure" value={driver.tarifHeure} onChange={handleDrvChange}
                    placeholder="Ex : 8000" />
                  <span>FCFA / h</span>
                </div>
              </div>
            </div>
            {driver.tarif > 0 && (
              <div className={styles.pricePreview}>
                <div className={styles.priceItem}><span>Tarif journée</span><strong>{fmt(driver.tarif)} FCFA</strong></div>
                {driver.tarifHeure > 0 && <div className={styles.priceItem}><span>Tarif heure</span><strong>{fmt(driver.tarifHeure)} FCFA</strong></div>}
              </div>
            )}
          </div>
        );

        return (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>💰 Tarification</h2>
            <div className={styles.grid2}>
              {adType === "location" && <>
                <div className={styles.field}>
                  <label>Prix par jour (FCFA) *</label>
                  <div className={styles.inputAffix}>
                    <input type="number" name="pricePerDay" value={vehicle.pricePerDay}
                      onChange={handleVehChange} placeholder="Ex : 50000" min="1000" />
                    <span>FCFA / jour</span>
                  </div>
                  {errors.pricePerDay && <span className={styles.err}>{errors.pricePerDay}</span>}
                </div>
                <div className={styles.field}>
                  <label>Caution (FCFA)</label>
                  <div className={styles.inputAffix}>
                    <input type="number" name="caution" value={vehicle.caution}
                      onChange={handleVehChange} placeholder="Ex : 100000" />
                    <span>FCFA</span>
                  </div>
                </div>
                <div className={styles.field}>
                  <label>Âge minimum du conducteur</label>
                  <div className={styles.inputAffix}>
                    <input type="number" name="ageMin" value={vehicle.ageMin}
                      onChange={handleVehChange} min="18" max="99" />
                    <span>ans</span>
                  </div>
                </div>
                <div className={styles.field}>
                  <div className={styles.checkboxCol}>
                    <label className={`${styles.checkItem} ${vehicle.permisRequis ? styles.checkActive : ""}`}>
                      <input type="checkbox" name="permisRequis" checked={vehicle.permisRequis} onChange={handleVehChange} />
                      📄 Permis de conduire requis
                    </label>
                    <label className={`${styles.checkItem} ${vehicle.assuranceOptionnelle ? styles.checkActive : ""}`}>
                      <input type="checkbox" name="assuranceOptionnelle" checked={vehicle.assuranceOptionnelle} onChange={handleVehChange} />
                      🛡️ Assurance optionnelle proposée
                    </label>
                  </div>
                </div>
              </>}

              {adType === "vente" && (
                <div className={`${styles.field} ${styles.colSpan2}`}>
                  <label>Prix de vente (FCFA) *</label>
                  <div className={styles.inputAffix}>
                    <input type="number" name="priceForSale" value={vehicle.priceForSale}
                      onChange={handleVehChange} placeholder="Ex : 12000000" min="1000" />
                    <span>FCFA</span>
                  </div>
                  {errors.priceForSale && <span className={styles.err}>{errors.priceForSale}</span>}
                </div>
              )}
            </div>

            {(vehicle.pricePerDay > 0 || vehicle.priceForSale > 0) && (
              <div className={styles.pricePreview}>
                {adType === "location" && <>
                  <div className={styles.priceItem}><span>Prix / jour</span><strong>{fmt(vehicle.pricePerDay)} FCFA</strong></div>
                  {vehicle.caution > 0 && <div className={styles.priceItem}><span>Caution</span><strong>{fmt(vehicle.caution)} FCFA</strong></div>}
                </>}
                {adType === "vente" && (
                  <div className={styles.priceItem}><span>Prix de vente</span><strong>{fmt(vehicle.priceForSale)} FCFA</strong></div>
                )}
              </div>
            )}
          </div>
        );

      // ── ÉTAPE 6 : Photos & Description ────────────────────────────────────
      case 6: {
        const isDriverMode = adType === "chauffeur";
        const desc = isDriverMode ? driver.description : vehicle.description;
        const canAdd = photos.length < MAX_PHOTOS;

        return (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>📸 Photos & Description</h2>

            {errors.photos && (
              <p className={styles.err} style={{ marginBottom: "0.75rem" }}>{errors.photos}</p>
            )}

            {/* ── Zone upload ── */}
            <div className={styles.uploadSection}>
              <div className={styles.uploadMeta}>
                <span>{photos.length} / {MAX_PHOTOS} photos</span>
                <span className={styles.uploadHint}>JPG, PNG, WEBP · max 5 Mo par photo</span>
              </div>

              {/* Grille de photos */}
              {photos.length > 0 && (
                <div className={styles.photoGrid}>
                  {photos.map((p, idx) => (
                    <div key={p.id} className={`${styles.photoSlot} ${idx === 0 ? styles.photoMain : ""}`}>
                      <img src={p.preview} alt={p.name} />
                      {idx === 0 && <span className={styles.mainBadge}>Photo principale</span>}
                      <button
                        type="button"
                        className={styles.photoRemove}
                        onClick={() => removePhoto(p.id)}
                        title="Supprimer"
                      >✕</button>
                    </div>
                  ))}

                  {/* Slot pour ajouter si place restante */}
                  {canAdd && (
                    <button
                      type="button"
                      className={styles.photoAdd}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <span>+</span>
                      <small>Ajouter</small>
                    </button>
                  )}
                </div>
              )}

              {/* Zone drag & drop (si aucune photo ou toutes les slots pas remplies) */}
              {photos.length === 0 && (
                <div
                  className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ""}`}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className={styles.dropIcon}>🖼️</div>
                  <p className={styles.dropTitle}>Glissez vos photos ici</p>
                  <p className={styles.dropSub}>ou cliquez pour sélectionner</p>
                  <span className={styles.dropBtn}>Parcourir les fichiers</span>
                </div>
              )}

              {/* Bouton secondaire si déjà des photos mais pas au max */}
              {photos.length > 0 && canAdd && (
                <div
                  className={`${styles.dropZoneSmall} ${dragOver ? styles.dropZoneActive : ""}`}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <span>📎</span>
                  <span> Glisser ou cliquer pour ajouter d'autres photos</span>
                  <span className={styles.remainBadge}>
                    {`${MAX_PHOTOS - photos.length} restante${MAX_PHOTOS - photos.length > 1 ? "s" : ""}`}
                  </span>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={handleFileInput}
              />
            </div>

            {/* ── Description ── */}
            <div className={`${styles.field} ${styles.mt2}`}>
              <label>
                Description
                <span className={styles.charCount}>{desc.length} / 1000</span>
              </label>
              <p className={styles.hint}>
                Décrivez ce que vous proposez — équipements, état, points forts, conditions...
                <em> (facultatif, 10 caractères minimum si renseignée)</em>
              </p>
              <textarea
                rows="6"
                value={desc}
                onChange={e => isDriverMode ? setDrv("description", e.target.value) : setVeh("description", e.target.value)}
                placeholder={isDriverMode
                  ? "Ex : Chauffeur expérimenté, ponctuel, véhicule climatisé, disponible 7j/7..."
                  : "Ex : Véhicule en excellent état, entretien récent, full options, GPS intégré, jamais accidenté..."}
                maxLength={1000}
              />
              {errors.description && <span className={styles.err}>{errors.description}</span>}
            </div>
          </div>
        );
      }

      // ── ÉTAPE 7 : Vérification & soumission ──────────────────────────────
      case 7: {
        const isC = adType === "chauffeur";
        const mainImg = photos[0]?.preview || null;
        return (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>✅ Vérification de l'annonce</h2>
            <p className={styles.cardSub}>Vérifiez toutes les informations avant de publier. Votre annonce sera examinée par notre équipe sous 24h.</p>

            <div className={styles.previewBox}>
              <div className={styles.previewHeader}>
                {mainImg && <img src={mainImg} alt="" className={styles.previewImg} onError={e => e.target.style.display="none"} />}
                <div>
                  <h3>{isC ? driver.title : vehicle.title}</h3>
                  <div className={styles.tagRow}>
                    <span className={styles.tagBlue}>{adType === "location" ? "Location" : adType === "vente" ? "Vente" : "Chauffeur"}</span>
                    {!isC && <span className={styles.tagGray}>{vehicle.vehicleType || "Véhicule"}</span>}
                    {!isC && <span className={styles.tagGray}>{vehicle.marque} {vehicle.modele} {vehicle.annee}</span>}
                  </div>
                </div>
              </div>

              <div className={styles.summaryGrid}>
                <div className={styles.summaryBlock}>
                  <h4>Contact</h4>
                  <p>{identity.typePubliant !== "particulier" && identity.nomEntreprise ? identity.nomEntreprise + " — " : ""}{identity.prenom} {identity.nom}</p>
                  <p>📞 {identity.telephone}</p>
                  <p>📍 {identity.ville}{identity.adresse ? ", " + identity.adresse : ""}</p>
                </div>

                {!isC && (
                  <div className={styles.summaryBlock}>
                    <h4>Caractéristiques</h4>
                    <p>⛽ {vehicle.carburant} · ⚙️ {vehicle.transmission}</p>
                    <p>🧍 {vehicle.nombrePlaces} places · 🚪 {vehicle.nombrePortes} portes</p>
                    {vehicle.kilometrage && <p>📏 {fmt(vehicle.kilometrage)} km</p>}
                    {vehicle.couleur && <p>🎨 {vehicle.couleur}</p>}
                  </div>
                )}

                {isC && (
                  <div className={styles.summaryBlock}>
                    <h4>Profil</h4>
                    <p>👤 {driver.firstName} {driver.lastName}</p>
                    <p>🗺️ {driver.zone}</p>
                    <p>🕐 {driver.disponibilite}</p>
                    <p>💬 {driver.langues.join(", ")}</p>
                  </div>
                )}

                <div className={styles.summaryBlock}>
                  <h4>Tarif</h4>
                  {adType === "location" && <>
                    <p className={styles.bigPrice}>{fmt(vehicle.pricePerDay)} FCFA<small>/jour</small></p>
                    {vehicle.caution > 0 && <p>Caution : {fmt(vehicle.caution)} FCFA</p>}
                  </>}
                  {adType === "vente" && (
                    <p className={styles.bigPrice}>{fmt(vehicle.priceForSale)} FCFA</p>
                  )}
                  {isC && <>
                    <p className={styles.bigPrice}>{fmt(driver.tarif)} FCFA<small>/jour</small></p>
                    {driver.tarifHeure > 0 && <p>{fmt(driver.tarifHeure)} FCFA/h</p>}
                  </>}
                </div>
              </div>

              <div className={styles.summaryBlock}>
                <h4>Description</h4>
                <p className={styles.descText}>{isC ? driver.description : vehicle.description}</p>
              </div>
            </div>

            <div className={styles.submitNotice}>
              <span>ℹ️</span>
              <p>En publiant, vous acceptez que votre annonce soit examinée par notre équipe. Elle sera visible après validation (sous 24h).</p>
            </div>
          </div>
        );
      }

      default: return null;
    }
  };

  // ─── Écran résultat de validation ───────────────────────────────────────────
  if (result) {
    const cfg = {
      approved: {
        icon:    "✅",
        title:   "Annonce approuvée et publiée !",
        color:   "#10b981",
        bg:      "#ecfdf5",
        border:  "#6ee7b7",
        desc:    "Votre annonce est maintenant visible dans le catalogue. Les clients peuvent la consulter et effectuer des réservations.",
        cta:     "Voir mon espace partenaire",
      },
      pending: {
        icon:    "⏳",
        title:   "Annonce en cours d'examen",
        color:   "#f59e0b",
        bg:      "#fffbeb",
        border:  "#fcd34d",
        desc:    "Notre équipe examine votre annonce. Vous recevrez une notification dès qu'elle sera validée (sous 24h).",
        cta:     "Suivre mes annonces",
      },
      rejected: {
        icon:    "❌",
        title:   "Annonce non conforme",
        color:   "#ef4444",
        bg:      "#fef2f2",
        border:  "#fca5a5",
        desc:    "Votre annonce ne répond pas aux critères de publication. Corrigez les points ci-dessous et soumettez à nouveau.",
        cta:     "Corriger et republier",
      },
    }[result.status] || {};

    const scoreColor =
      result.score >= 65 ? "#10b981" :
      result.score >= 40 ? "#f59e0b" : "#ef4444";

    return (
      <div className={styles.page}>
        <div className={styles.resultCard} style={{ borderColor: cfg.border, background: cfg.bg }}>
          {/* Icone + titre */}
          <div className={styles.resultIcon}>{cfg.icon}</div>
          <h2 className={styles.resultTitle} style={{ color: cfg.color }}>{cfg.title}</h2>
          <p className={styles.resultDesc}>{cfg.desc}</p>

          {/* Nom de l'annonce */}
          {result.vehicleName && (
            <div className={styles.resultVehicle}>"{result.vehicleName}"</div>
          )}

          {/* Score de qualité */}
          {result.score != null && (
            <div className={styles.resultScoreWrap}>
              <div className={styles.resultScoreLabel}>
                Score de qualité : <strong style={{ color: scoreColor }}>{result.score}/100</strong>
              </div>
              <div className={styles.resultScoreBar}>
                <div
                  className={styles.resultScoreFill}
                  style={{ width: `${result.score}%`, background: scoreColor }}
                />
              </div>
            </div>
          )}

          {/* Erreurs bloquantes */}
          {result.errors.length > 0 && (
            <div className={styles.resultErrors}>
              <p className={styles.resultSectionTitle}>Problèmes à corriger :</p>
              <ul>
                {result.errors.map((e, i) => (
                  <li key={i}>❌ {e}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Avertissements */}
          {result.warnings.length > 0 && (
            <div className={styles.resultWarnings}>
              <p className={styles.resultSectionTitle}>
                {result.errors.length > 0 ? "Améliorations suggérées :" : "Points à améliorer :"}
              </p>
              <ul>
                {result.warnings.map((w, i) => (
                  <li key={i}>⚠️ {w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className={styles.resultActions}>
            <button
              className={styles.primaryBtn}
              onClick={() => navigate("/vendor/dashboard")}
            >
              {cfg.cta} →
            </button>
            {result.status === "rejected" && (
              <button
                className={styles.secondaryBtn}
                onClick={() => { setResult(null); setStep(1); }}
              >
                Modifier et soumettre à nouveau
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── UI principal ────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      {/* En-tête */}
      <div className={styles.header}>
        <h1>Publier une annonce</h1>
        <p>Étape {step} sur {STEPS.length} — {STEPS[step - 1].label}</p>
      </div>

      {/* Stepper */}
      <div className={styles.stepper}>
        {STEPS.map((s, i) => (
          <div key={s.id} className={styles.stepWrap}>
            <div className={`${styles.stepDot} ${step > s.id ? styles.done : step === s.id ? styles.active : ""}`}>
              {step > s.id ? "✓" : s.icon}
            </div>
            <span className={`${styles.stepLbl} ${step === s.id ? styles.stepLblActive : ""}`}>{s.label}</span>
            {i < STEPS.length - 1 && <div className={`${styles.stepLine} ${step > s.id ? styles.stepLineDone : ""}`} />}
          </div>
        ))}
      </div>

      {/* Contenu de l'étape — key force un remontage propre à chaque changement d'étape */}
      <div key={step}>
        {renderStep()}
      </div>

      {/* Navigation */}
      <div className={styles.nav}>
        {step > 1 && (
          <button type="button" className={styles.prevBtn} onClick={prev}>
            ← Précédent
          </button>
        )}
        <div style={{ flex: 1 }} />
        {step < STEPS.length ? (
          <button type="button" className={styles.nextBtn} onClick={next}>
            Suivant →
          </button>
        ) : (
          <button type="button" className={styles.submitBtn} onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Publication en cours..." : "🚀 Publier l'annonce"}
          </button>
        )}
      </div>
    </div>
  );
};

export default VendorSubmit;
