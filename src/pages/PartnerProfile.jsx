import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useVehicles } from "../context/VehicleContext";
import VehicleCard from "../components/VehicleCard/VehicleCard";
import { DriverCard, ActivityCard, PartCard } from "./Catalogue";
import ReportButton from "../components/ReportButton/ReportButton";
import { getCustomerServiceContact } from "../utils/customerServiceContact";
import styles from "./PartnerProfile.module.css";

const CERT_BADGE = {
  premium:   { icon: "⭐", label: "Partenaire Premium",   bg: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff" },
  fondateur: { icon: "🏆", label: "Partenaire Fondateur", bg: "linear-gradient(135deg,#d97706,#f59e0b)", color: "#fff" },
  verifie:   { icon: "🟢", label: "Partenaire Vérifié",   bg: "linear-gradient(135deg,#059669,#10b981)", color: "#fff" },
};

export default function PartnerProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { vehicles, drivers, activities, parts } = useVehicles();
  const [partner, setPartner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [certBadge, setCertBadge] = useState(null);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    // Profil partenaire + certification en parallèle
    Promise.all([
      fetch(`/api/users/${id}/public`).then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/certification/public/${id}`).then((r) => r.ok ? r.json() : null).catch(() => null),
    ]).then(([partnerData, certData]) => {
      setPartner(partnerData);
      if (certData?.certificationBadge && certData.certificationBadge !== "none") {
        setCertBadge({ ...CERT_BADGE[certData.certificationBadge], score: certData.certificationScore, statement: certData.publicStatement });
      }
    }).finally(() => setLoading(false));
  }, [id]);

  // ── La flotte vient du SERVEUR, pas du catalogue déjà chargé ─────────────
  // Filtrer `useVehicles()` paraissait économique, mais ce contexte est paginé
  // à 100 annonces ET filtré sur le pays du visiteur. Mesuré en production le
  // 2026-09-24 sur le partenaire le plus fourni (270 annonces) : 12 % de sa
  // flotte visible depuis le Maroc, 1 % sans pays détecté, et ZÉRO depuis la
  // Côte d'Ivoire. Un partenaire qui partageait son lien à un client à
  // l'étranger l'envoyait sur une page vide.
  //
  // `country=INTL` est délibéré : on regarde CE partenaire, on ne parcourt pas
  // le catalogue de son propre pays. Le filtre pays n'a aucun sens ici.
  const [flotte, setFlotte] = useState(null);
  useEffect(() => {
    if (!id) return undefined;
    let annule = false;
    fetch(`/api/vehicles?owner=${encodeURIComponent(id)}&country=INTL&limit=100`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!annule) setFlotte(d?.vehicles || []); })
      .catch(() => { if (!annule) setFlotte([]); });
    return () => { annule = true; };
  }, [id]);

  const ownerOf = (x) => String(x.ownerId || x.owner?._id || x.owner?.id || x.owner);
  // Repli sur le contexte tant que la requête n'a pas répondu : la page reste
  // utile pendant le chargement plutôt que d'afficher « aucun véhicule ».
  const partnerVehicles = (flotte ?? vehicles.filter((v) => ownerOf(v) === String(id)))
    .filter((v) => v.available !== false);
  // Un partenaire loisirs ou chauffeur n'a AUCUN véhicule : sa page publique
  // affichait « Aucun véhicule disponible » alors qu'il a des annonces
  // (2026-09-14, NEMO Diving). Chauffeurs, activités et pièces restent servis
  // par le contexte : leurs volumes se comptent en dizaines, pas en centaines.
  const partnerDrivers    = (drivers || []).filter((d) => ownerOf(d) === String(id));
  const partnerActivities = (activities || []).filter((a) => ownerOf(a) === String(id));
  // Pièces détachées : secteur distinct des loisirs, section à part.
  const partnerParts = (parts || []).filter((p) => ownerOf(p) === String(id));
  const totalListings = partnerVehicles.length + partnerDrivers.length + partnerActivities.length + partnerParts.length;

  const displayName = partner?.business?.companyName
    || (partner ? `${partner.firstName || ""} ${partner.lastName || ""}`.trim() : null)
    || "Partenaire";

  const partnerType = {
    agency:     "Agence de location",
    dealer:     "Concessionnaire",
    individual: "Particulier",
    fleet:      "Gestionnaire de flotte",
    leasing_co: "Société de leasing",
  }[partner?.partnerType] || {
    loueur:      "Location de véhicules",
    vendeur:     "Vente de véhicules",
    exportateur: "Import / export de véhicules",
    chauffeur:   "Chauffeur professionnel",
    loisirs:     "Activités & loisirs",
    pieces:      "Pièces détachées",
  }[partner?.partnerActivity] || "Partenaire";

  const logo = partner?.business?.logo || partner?.profilePhoto || null;

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
          {logo ? (
            <img src={logo} alt={displayName} />
          ) : (
            <span className={styles.avatarIcon}>🤝</span>
          )}
          {partner?.isFounder && (
            <span className={styles.founderBadge}>🏆 Fondateur</span>
          )}
        </div>

        <div className={styles.info}>
          <div className={styles.nameRow}>
            <h1>{displayName}</h1>
            {/* ── Badge de certification VIT AUTO ── */}
            {certBadge && (
              <span
                className={styles.certificationBadge}
                style={{ background: certBadge.bg, color: certBadge.color }}
                title={`Certifié par VIT AUTO — Score ${certBadge.score}/100`}
              >
                {certBadge.icon} {certBadge.label}
              </span>
            )}
          </div>
          <p className={styles.type}>{partnerType}</p>
          {partner?.rating?.count > 0 && (
            <p className={styles.location} title={`${partner.rating.average}/5 sur ${partner.rating.count} avis (véhicules et chauffeurs confondus)`}>
              <span style={{ color: "#f59e0b", letterSpacing: 1 }}>
                {"★".repeat(Math.round(partner.rating.average))}{"☆".repeat(5 - Math.round(partner.rating.average))}
              </span>
              <span style={{ marginLeft: 6, fontWeight: 700 }}>{partner.rating.average.toFixed(1)}</span>
              <span style={{ marginLeft: 4, color: "#94a3b8" }}>({partner.rating.count} avis)</span>
            </p>
          )}
          {partner?.defaultLocation?.city && (
            <p className={styles.location}>📍 {partner.defaultLocation.city}</p>
          )}
          {partner?.business?.companyName && partner?.firstName && (
            <p className={styles.contact}>👤 {partner.firstName} {partner.lastName}</p>
          )}
          {partner?.business?.description && (
            <p className={styles.description}>{partner.business.description}</p>
          )}
          {/* Aucun contact direct partenaire n'est plus jamais exposé (audit
              2026-08) — l'appel passe uniquement par le service client VIT AUTO
              dédié au pays du partenaire. */}
          {partner && (
            <a href={`tel:${getCustomerServiceContact(partner.country).tel}`} className={styles.phoneLink}>
              📞 Appeler le service client VIT AUTO
            </a>
          )}
          <div style={{ marginTop: 10 }}>
            <ReportButton targetType="user" targetId={id} compact />
          </div>

          {/* ── Explication badge VIT AUTO ── */}
          {certBadge && (
            <div className={styles.certExplainer}>
              <div className={styles.certExplainerInner}>
                <span className={styles.certExplainerIcon}>🛡️</span>
                <div>
                  <p className={styles.certExplainerTitle}>Vérifié par VIT AUTO</p>
                  <p className={styles.certExplainerSub}>
                    Ce partenaire a été soumis à un processus de certification rigoureux :
                    vérification de l'entreprise, identité du représentant, activité commerciale,
                    compte bancaire professionnel et documents d'export.
                  </p>
                  {certBadge.statement && (
                    <p className={styles.certStatement}>"{certBadge.statement}"</p>
                  )}
                </div>
              </div>
              <div className={styles.certScore}>
                <svg width="48" height="48" viewBox="0 0 48 48">
                  <circle cx="24" cy="24" r="19" fill="none" stroke="#e2e8f0" strokeWidth="4" />
                  <circle
                    cx="24" cy="24" r="19"
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 19}`}
                    strokeDashoffset={`${2 * Math.PI * 19 * (1 - (certBadge.score || 0) / 100)}`}
                    transform="rotate(-90 24 24)"
                  />
                  <text x="24" y="28" textAnchor="middle" fontSize="10" fontWeight="800" fill="#0f172a">
                    {certBadge.score}%
                  </text>
                </svg>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Catalogue du partenaire ── */}
      <div className={styles.catalogueSection}>
        <h2>
          Catalogue de {displayName}
          <span className={styles.count}>{totalListings} annonce{totalListings !== 1 ? "s" : ""}</span>
        </h2>

        {totalListings === 0 ? (
          <div className={styles.empty}>
            <span>🗂️</span>
            <p>Aucune annonce disponible pour ce partenaire.</p>
            <button onClick={() => navigate("/catalogue")}>Voir le catalogue général</button>
          </div>
        ) : (
          <>
            {partnerVehicles.length > 0 && (
              <div className={styles.grid}>
                {partnerVehicles.map((car) => (
                  <VehicleCard key={car._id || car.id} car={car} />
                ))}
              </div>
            )}
            {partnerActivities.length > 0 && (
              <>
                <h3 className={styles.subTitle}>🎈 Activités & loisirs ({partnerActivities.length})</h3>
                <div className={styles.grid}>
                  {partnerActivities.map((a) => <ActivityCard key={a._id} a={a} />)}
                </div>
              </>
            )}
            {partnerParts.length > 0 && (
              <>
                <h3 className={styles.subTitle}>🔩 Pièces détachées ({partnerParts.length})</h3>
                <div className={styles.grid}>
                  {partnerParts.map((p) => <PartCard key={p._id} p={p} />)}
                </div>
              </>
            )}
            {partnerDrivers.length > 0 && (
              <>
                <h3 className={styles.subTitle}>🧑‍✈️ Chauffeurs ({partnerDrivers.length})</h3>
                <div className={styles.grid}>
                  {partnerDrivers.map((d) => <DriverCard key={d._id} d={d} />)}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
