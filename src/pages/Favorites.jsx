import { useEffect, useState, useCallback } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import VehicleCard from "../components/VehicleCard/VehicleCard";
import styles from "./Favorites.module.css";

export default function Favorites() {
  const { isAuthenticated, authFetch } = useAuth();
  const [favorites, setFavorites] = useState([]);
  const [loading,   setLoading]   = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/favorites");
      if (res.ok) setFavorites((await res.json()).favorites || []);
    } catch { /* liste vide affichée par défaut */ }
    setLoading(false);
  }, [authFetch]);

  useEffect(() => { load(); }, [load]);

  if (!isAuthenticated) return <Navigate to="/login" state={{ from: { pathname: "/favorites" } }} replace />;

  const vehicles = favorites.filter((f) => f.itemType === "vehicle");
  const listings  = favorites.filter((f) => f.itemType === "ie_listing");

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>❤️ Mes favoris</h1>
        <p>Retrouvez ici les véhicules et annonces que vous avez enregistrés.</p>
      </div>

      {loading ? (
        <p className={styles.muted}>Chargement…</p>
      ) : favorites.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🤍</div>
          <p>Aucun favori pour l'instant.</p>
          <Link to="/catalogue" className={styles.cta}>Explorer le catalogue →</Link>
        </div>
      ) : (
        <>
          {vehicles.length > 0 && (
            <>
              <h2 className={styles.sectionTitle}>🚗 Véhicules ({vehicles.length})</h2>
              <div className={styles.grid}>
                {vehicles.map((f) => <VehicleCard key={f.favoriteId} car={f.item} />)}
              </div>
            </>
          )}
          {listings.length > 0 && (
            <>
              <h2 className={styles.sectionTitle}>🌍 Annonces Import/Export ({listings.length})</h2>
              <div className={styles.grid}>
                {listings.map((f) => (
                  <Link key={f.favoriteId} to={`/import-export/listings/${f.item._id}`} className={styles.ieCard}>
                    {f.item.mainPhoto && <img src={f.item.mainPhoto} alt={f.item.title} />}
                    <div className={styles.ieCardBody}>
                      <strong>{f.item.title}</strong>
                      <span>{f.item.make} {f.item.model} — {f.item.year}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
