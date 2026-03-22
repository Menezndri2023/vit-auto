import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useVehicles } from "../context/VehicleContext";
import { useToast } from "../context/ToastContext";
import styles from "./VendorSubmit.module.css";

const STEPS = [
  { id: 1, title: "Informations de base", icon: "📋" },
  { id: 2, title: "Caractéristiques", icon: "⚙️" },
  { id: 3, title: "Tarification", icon: "💰" },
  { id: 4, title: "Photos & Description", icon: "📸" },
  { id: 5, title: "Prévisualisation", icon: "👁️" }
];

const VEHICLE_TYPES = ["SUV", "Berline", "Sportif", "Citadine", "Viano", "Utilitaire"];
const FUELS = ['Essence', 'Diesel', 'Hybride', 'Électrique'];
const TRANSMISSIONS = ['Automatique', 'Manuelle'];

const VendorSubmit = () => {
  const { user } = useAuth();
  const { addVehicle } = useVehicles();
  const { success, error } = useToast();
  const navigate = useNavigate();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [vehicle, setVehicle] = useState({
    name: "",
    type: "SUV",
    mode: "Louer",
    pricePerDay: 0,
    buyPrice: 0,
    fuel: "Essence",
    transmission: "Automatique",
    seats: 4,
    distance: 1,
    image: "",
    images: [],
    description: "",
  });
  
  const [errors, setErrors] = useState({});

  if (!user) {
    return (
      <div className={styles.page}>
        <div className={styles.centerContainer}>
          <h1>Accès restreint</h1>
          <p>Vous devez être connecté pour publier un véhicule.</p>
          <button className={styles.primaryBtn} onClick={() => navigate('/login')}>
            Se connecter
          </button>
        </div>
      </div>
    );
  }

  const validateStep = useCallback(() => {
    const newErrors = {};
    
    if (currentStep === 1) {
      if (!vehicle.name.trim()) newErrors.name = "Nom du véhicule requis";
    }
    
    if (currentStep === 3) {
      if (vehicle.pricePerDay <= 0) newErrors.pricePerDay = "Prix par jour requis (minimum 20€)";
      if (vehicle.mode === "Acheter" && vehicle.buyPrice <= 0) newErrors.buyPrice = "Prix d'achat requis";
    }
    
    if (currentStep === 4) {
      if (!vehicle.description.trim()) newErrors.description = "Description requise (minimum 50 caractères)";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [currentStep, vehicle]);

  const nextStep = () => {
    if (validateStep()) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const prevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setVehicle(prev => ({
      ...prev,
      [name]: type === "checkbox" ? checked : 
             ["pricePerDay", "buyPrice", "seats", "distance"].includes(name) ? Number(value) || 0 : value
    }));
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setVehicle(prev => ({ ...prev, image: e.target.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (!validateStep()) return;

    const newVehicle = {
      id: Date.now(),
      ...vehicle,
      userId: user.id,
      available: true,
      rating: 5,
      reviews: 0,
      status: "pending"
    };

    try {
      addVehicle(newVehicle);
      
      const response = await fetch("/api/vehicles", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("vit-auto-token") || ""}` 
        },
        body: JSON.stringify(newVehicle),
      });
      
      if (response.ok) {
        success("✅ Véhicule publié avec succès ! En attente de validation.");
      } else {
        success("📱 Véhicule sauvegardé localement. Connectez-vous au backend pour synchroniser.");
      }
      
      setTimeout(() => navigate("/vendor/dashboard"), 2000);
    } catch (err) {
      console.error(err);
      success("💾 Véhicule ajouté à votre espace vendeur.");
      setTimeout(() => navigate("/vendor/dashboard"), 2000);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className={styles.formSection}>
            <div className={styles.sectionTitle}>
              <span className={styles.sectionIcon}>{STEPS[0].icon}</span>
              {STEPS[0].title}
            </div>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label>Nom du véhicule *</label>
                <input 
                  name="name" 
                  value={vehicle.name} 
                  onChange={handleChange}
                  placeholder="Mercedes Classe A 2024"
                />
                {errors.name && <span className={styles.error}>{errors.name}</span>}
              </div>
              <div className={styles.field}>
                <label>Type *</label>
                <select name="type" value={vehicle.type} onChange={handleChange}>
                  {VEHICLE_TYPES.map(item => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label>Mode *</label>
                <select name="mode" value={vehicle.mode} onChange={handleChange}>
                  <option value="Louer">Location</option>
                  <option value="Acheter">Achat</option>
                </select>
              </div>
              <div className={styles.field}>
                <label>Sièges</label>
                <input 
                  type="number" 
                  name="seats" 
                  min="1" 
                  max="9"
                  value={vehicle.seats} 
                  onChange={handleChange}
                  placeholder="5"
                />
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className={styles.formSection}>
            <div className={styles.sectionTitle}>
              <span className={styles.sectionIcon}>{STEPS[1].icon}</span>
              {STEPS[1].title}
            </div>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label>Carburant</label>
                <select name="fuel" value={vehicle.fuel} onChange={handleChange}>
                  {FUELS.map(item => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label>Transmission</label>
                <select name="transmission" value={vehicle.transmission} onChange={handleChange}>
                  {TRANSMISSIONS.map(item => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label>Distance parcourue (km)</label>
                <input 
                  type="number" 
                  name="distance" 
                  value={vehicle.distance} 
                  onChange={handleChange}
                  placeholder="50000"
                />
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className={styles.formSection}>
            <div className={styles.sectionTitle}>
              <span className={styles.sectionIcon}>{STEPS[2].icon}</span>
              {STEPS[2].title}
            </div>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label>Prix par jour (€) *</label>
                <input 
                  type="number" 
                  name="pricePerDay" 
                  min="20"
                  value={vehicle.pricePerDay} 
                  onChange={handleChange}
                  placeholder="85"
                />
                {errors.pricePerDay && <span className={styles.error}>{errors.pricePerDay}</span>}
              </div>
              {vehicle.mode === "Acheter" && (
                <div className={styles.field}>
                  <label>Prix d'achat (€) *</label>
                  <input 
                    type="number" 
                    name="buyPrice" 
                    value={vehicle.buyPrice} 
                    onChange={handleChange}
                    placeholder="45000"
                  />
                  {errors.buyPrice && <span className={styles.error}>{errors.buyPrice}</span>}
                </div>
              )}
            </div>
          </div>
        );

      case 4:
        return (
          <div className={styles.formSection}>
            <div className={styles.sectionTitle}>
              <span className={styles.sectionIcon}>{STEPS[3].icon}</span>
              {STEPS[3].title}
            </div>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label>Photo principale</label>
                <div 
                  className={styles.imagePreview}
                  onClick={() => document.getElementById('image-upload').click()}
                >
                  {vehicle.image ? (
                    <img src={vehicle.image} alt="Preview" />
                  ) : (
                    <>
                      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📷</div>
                      <p>Cliquez pour ajouter une photo ou collez une URL</p>
                      <small>Format recommandé: 800x600px, JPG/PNG</small>
                    </>
                  )}
                </div>
                <input
                  id="image-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  style={{ display: 'none' }}
                />
                <input 
                  type="text" 
                  name="image" 
                  value={vehicle.image} 
                  onChange={handleChange}
                  placeholder="https://example.com/image.jpg"
                  style={{ marginTop: '1rem' }}
                />
              </div>
              <div className={styles.field}>
                <label>Description détaillée *</label>
                <textarea 
                  name="description" 
                  value={vehicle.description} 
                  onChange={handleChange}
                  rows="6"
                  placeholder="Décrivez les caractéristiques uniques, l'état du véhicule, équipements spéciaux, entretien récent..."
                />
                {errors.description && <span className={styles.error}>{errors.description}</span>}
              </div>
            </div>
          </div>
        );

      case 5:
        return (
          <div className={styles.previewSection}>
            <h2 className={styles.previewTitle}>Prévisualisation de l'annonce</h2>
            <div className={styles.previewVehicle}>
              <div className={styles.vehicleHeader}>
                <div className={styles.vehicleImage} style={{ backgroundImage: `url(${vehicle.image})`, backgroundSize: 'cover' }} />
                <div className={styles.vehicleInfo}>
                  <h3>{vehicle.name || 'Nom du véhicule'}</h3>
                  <div className={styles.vehicleTags}>
                    <span className={styles.tag + ' ' + styles.tagType}>{vehicle.type}</span>
                    <span className={styles.tag + ' ' + styles.tagMode}>{vehicle.mode}</span>
                    <span className={styles.tag + ' ' + styles.tagPrice}>
                      {vehicle.pricePerDay}€/jour
                    </span>
                  </div>
                </div>
              </div>
              <p>{vehicle.description.substring(0, 150)}...</p>
              <div style={{ marginTop: '1.5rem', color: '#6b7280', fontSize: '0.9rem' }}>
                <strong>Caractéristiques :</strong> {vehicle.seats} sièges • {vehicle.fuel} • {vehicle.transmission} • {vehicle.distance.toLocaleString()} km
              </div>
            </div>
            {Object.keys(errors).length > 0 && (
              <div className={styles.validationErrors}>
                <h4>⚠️ Corrections nécessaires</h4>
                <ul className={styles.errorList}>
                  {Object.values(errors).map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.topHeader}>
        <h1>Publier un véhicule</h1>
        <p>Créez une annonce professionnelle en 5 étapes simples. Toutes les annonces sont modérées.</p>
      </div>

      <div className={styles.stepper}>
        {STEPS.map((step, index) => (
          <div 
            key={step.id}
            className={`
              ${styles.step}
              ${currentStep > step.id ? styles.stepCompleted : ''}
              ${currentStep === step.id ? styles.stepActive : ''}
            `}
          >
            <div className={styles.stepNumber}>
              {currentStep > step.id ? '✓' : step.id}
            </div>
            <div className={styles.stepLabel}>{step.title}</div>
            {index < STEPS.length - 1 && <div className={styles.stepLine}></div>}
          </div>
        ))}
      </div>

      {renderStepContent()}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem' }}>
        {currentStep > 1 && (
          <button className={styles.secondaryBtn} onClick={prevStep} type="button">
            Étape précédente
          </button>
        )}
        {currentStep < 5 ? (
          <button className={styles.primaryBtn} onClick={nextStep} type="button">
            Étape suivante
          </button>
        ) : (
          <button className={styles.primaryBtn} onClick={handleSubmit}>
            🚀 Publier l'annonce
          </button>
        )}
      </div>
    </div>
  );
};

export default VendorSubmit;

