import useVersionCheck from "../../hooks/useVersionCheck";
import styles from "./UpdateBanner.module.css";

const UpdateBanner = () => {
  const updateAvailable = useVersionCheck();
  if (!updateAvailable) return null;

  return (
    <div className={styles.bar}>
      <span>🔄 Une nouvelle version de VIT AUTO est disponible.</span>
      <button className={styles.btn} onClick={() => window.location.reload()}>
        Recharger
      </button>
    </div>
  );
};

export default UpdateBanner;
