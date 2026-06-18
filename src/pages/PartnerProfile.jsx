import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useVehicles } from "../context/VehicleContext";
import VehicleCard from "../components/VehicleCard/VehicleCard";
import styles from "./PartnerProfile.module.css";

export default function PartnerProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { vehicles } = useVehicles();
  const [partner, setPartner] = useState(null);
  const [loading, setLoading] = useState(true);

  // Récupérer les infos du partenaire depuis l'API
  useEffect(() => {
    if (!id) { setLoading(false); return; }
    fetch(`/api/users/${id}/public`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => setPartner(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  // Véhicules du partenaire (depuis le contexte local)
  const partnerVehicles = vehicles.filter((v) => {
    const vid = v.ownerId || v.owner?._id || v.owner?.id || v.owner;
    return String(vid) === String(id) && v.available !== false;
  });

  const displayName = partner?.business?.companyName
    || (partner ? `${partner.firstName || ""} ${partner.lastName || ""}`.trim() : null)
    || "Partenaire";

  const partnerType = {
    agency:     "Agence de location",
    dealer:     "Concessionnaire",
    individual: "Particulier",
    fleet:      "Gestionnaire de flotte",
    leasing_co: "Société de leasing",
  }[partner?.partnerType] || "Partenaire";

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Chargement du profil…</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <button className={styles.backBtn} onClick={() => navigate(-1)}>← Retour</button>

      {/* ── En-tête partenaire ── */}
      <div className={styles.header}>
        <div className={styles.avatar}>
          {partner?.profilePhoto ? (
            <img src={partner.profilePhoto} alt={displayName} />
          ) : (
            <span className={styles.avatarIcon}>🤝</span>
          )}
          {partner?.subscription?.isFounder && (
            <span className={styles.founderBadge}>🏆 Fondateur</span>
          )}
          {partner?.subscription?.pack === "premium" && (
            <span className={styles.certBadge}>✓ Certifié</span>
          )}
        </div>

        <div className={styles.info}>
          <h1>{displayName}</h1>
          <p className={styles.type}>{partnerType}</p>
          {partner?.defaultLocation?.city && (
            <p className={styles.location}>📍 {partner.defaultLocation.city}</p>
          )}
          {partner?.business?.companyName && partner?.firstName && (
            <p className={styles.contact}>👤 {partner.firstName} {partner.lastName}</p>
          )}
          {partner?.phone && (
            <a href={`tel:${partner.phone}`} className={styles.phoneLink}>
              📞 {partner.phone}
            </a>
          )}
        </div>
      </div>

      {/* ── Catalogue du partenaire ── */}
      <div className={styles.catalogueSection}>
        <h2>
          Catalogue de {displayName}
          <span className={styles.count}>{partnerVehicles.length} annonce{partnerVehicles.length !== 1 ? "s" : ""}</span>
        </h2>

        {partnerVehicles.length === 0 ? (
          <div className={styles.empty}>
            <span>🚗</span>
            <p>Aucun véhicule disponible pour ce partenaire.</p>
            <button onClick={() => navigate("/catalogue")}>Voir le catalogue général</button>
          </div>
        ) : (
          <div className={styles.grid}>
            {partnerVehicles.map((car) => (
              <VehicleCard key={car._id || car.id} car={car} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
