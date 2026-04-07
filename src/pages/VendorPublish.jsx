import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import styles from "./VendorSubmit.module.css";

const STEPS = [
  { id: 1, title: "Type d'annonce", icon: "📋" },
  { id: 2, title: "Informations principales", icon: "📄" },
  { id: 3, title: "Détails techniques", icon: "⚙️" },
  { id: 4, title: "Tarification", icon: "💰" },
  { id: 5, title: "Photos & Description", icon: "📸" },
  { id: 6, title: "Prévisualisation", icon: "👁️" }
];

const VendorPublish = () => {
  const { user } = useAuth();
  const { success, error } = useToast();
  const navigate = useNavigate();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [adType, setAdType] = useState('location');
  const [form, setForm] = useState({
    title: "",
    marque: "",
    modele: "",
    annee: "",
    kilometrage: "",
    etat: "",
    prixForSale: "",
    pricePerDay: "",
    caution: "",
    ageMin: "",
    permisRequis: true,
    assuranceOptionnelle: false,
    tarif: "",
    disponibilite: "",
    zone: "",
    experience: "",
    description: "",
    images: []
  });
  
  const [errors, setErrors] = useState({});

  if (!user || user.role !== 'partenaire') {
    return (
      <div className={styles.page}>
        <div className={styles.centerContainer}>
          <h1>Accès restreint</h1>
          <p>Seuls les partenaires peuvent publier des annonces.</p>
          <button className={styles.primaryBtn} onClick={() => navigate('/register')}>
            Devenir partenaire
          </button>
        </div>
      </div>
    );
  }

  const validateStep = useCallback(() => {
    const newErrors = {};
    // Validation logic per step
    if (currentStep === 1) {
      if (!adType) newErrors.adType = "Type requis";
    }
    // ... more validation
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [currentStep, adType]);

  const nextStep = () => {
    if (validateStep()) setCurrentStep(p => p + 1);
  };

  const prevStep = () => setCurrentStep(p => Math.max(p - 1, 1));

  const handleChange = (e) => {
    setForm(p => ({ ...p, [e.target.name]: e.target.value }));
  };

  const handleTypeChange = (type) => {
    setAdType(type);
    setForm({
      title: "",
      marque: "",
      modele: "",
      annee: "",
      kilometrage: "",
      etat: "",
      prixForSale: "",
      pricePerDay: "",
      caution: "",
      ageMin: "",
      permisRequis: true,
      assuranceOptionnelle: false,
      tarif: "",
      disponibilite: "",
      zone: "",
      experience: "",
      description: "",
      images: []
    });
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div>
            <h3>Choisissez le type d'annonce</h3>
            <div className={styles.typeCards}>
              <button className={styles.typeCard + (adType === 'location' ? ' ' + styles.active)} onClick={() => handleTypeChange('location')}>
                <div className={styles.typeIcon}>🚗</div>
                <h4>Location véhicule</h4>
                <p>Prix au jour, caution, âge min.</p>
              </button>
              <button className={styles.typeCard + (adType === 'vente' ? ' ' + styles.active)} onClick={() => handleTypeChange('vente')}>
                <div className={styles.typeIcon}>💰</div>
                <h4>Vente véhicule</h4>
                <p>Prix fixe, kilométrage, état.</p>
              </button>
              <button className={styles.typeCard + (adType === 'chauffeur' ? ' ' + styles.active)} onClick={() => handleTypeChange('chauffeur')}>
                <div className={styles.typeIcon}>👨‍✈️</div>
                <h4>Chauffeur</h4>
                <p>Tarifs, disponibilité, zone.</p>
              </button>
            </div>
          </div>
        );
      
      case 2:
        return (
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label>Titre de l'annonce *</label>
              <input name="title" value={form.title} onChange={handleChange} />
            </div>
            <div className={styles.field}>
              <label>Marque *</label>
              <input name="marque" value={form.marque} onChange={handleChange} />
            </div>
            <div className={styles.field}>
              <label>Modèle *</label>
              <input name="modele" value={form.modele} onChange={handleChange} />
            </div>
            {adType !== 'chauffeur' && (
              <>
                <div className={styles.field}>
                  <label>Année</label>
                  <input name="annee" value={form.annee} onChange={handleChange} />
                </div>
                <div className={styles.field}>
                  <label>Kilométrage (km)</label>
                  <input name="kilometrage" value={form.kilometrage} onChange={handleChange} />
                </div>
                <div className={styles.field}>
                  <label>État</label>
                  <select name="etat" value={form.etat} onChange={handleChange}>
                    <option>Neuf</option>
                    <option>Comme neuf</option>
                    <option>Bon état</option>
                    <option>À réparer</option>
                  </select>
                </div>
              </>
            )}
          </div>
        );
      
      // More cases for tarification, photos, preview...
      
      default:
        return <div>Étape {currentStep}</div>;
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.topHeader}>
        <h1>Publier une annonce</h1>
        <p>Créez votre annonce {adType} en quelques étapes</p>
      </div>
      <div className={styles.stepper}>
        {STEPS.map(step => (
          <div key={step.id} className={styles.step}>
            <div className={styles.stepNumber}>{step.id}</div>
            <div>{step.title}</div>
          </div>
        ))}
      </div>
      {renderStepContent()}
      <div className={styles.buttons}>
        <button onClick={prevStep} disabled={currentStep === 1}>Précédent</button>
        <button onClick={nextStep}>Suivant</button>
      </div>
    </div>
  );
};

export default VendorPublish;
