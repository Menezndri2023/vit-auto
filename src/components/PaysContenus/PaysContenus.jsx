import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useCurrency } from "../../context/CurrencyContext";
import { useVehicles } from "../../context/VehicleContext";
import { useI18n } from "../../context/I18nContext";
import { WORLD_COUNTRIES } from "../../data/worldCountries";
import styles from "./PaysContenus.module.css";

// Règle de l'exploitant (2026-10-09) : le site ne montre que les offres du
// pays du visiteur (géolocalisé), sauf s'il en choisit un autre. Ce bandeau
// dit quel pays est affiché et permet d'en changer depuis l'accueil — le
// sélecteur n'existait que dans le catalogue. Quand le pays n'a encore aucune
// offre, il le dit et propose l'international : jamais une page muette.
export default function PaysContenus() {
  const { catalogCountry, setCatalogCountry, paysPret, COUNTRIES_CONFIG, COUNTRY_INTERNATIONAL } = useCurrency();
  const { vehicles, drivers, activities, vehiclesLoading } = useVehicles();
  const { t } = useI18n();

  const pays = WORLD_COUNTRIES.find((c) => c.code === catalogCountry);
  const international = catalogCountry === COUNTRY_INTERNATIONAL;
  const aucuneOffre = useMemo(() => {
    if (!paysPret || international || vehiclesLoading) return false;
    return !vehicles.some((v) => v.country === catalogCountry) && !drivers?.length && !activities?.length;
  }, [paysPret, international, vehiclesLoading, vehicles, drivers, activities, catalogCountry]);

  if (!paysPret) return null;
  const options = COUNTRIES_CONFIG.some((c) => c.code === catalogCountry) || international
    ? COUNTRIES_CONFIG
    : [...COUNTRIES_CONFIG, { code: catalogCountry, flag: pays?.flag || "🌍", name: pays?.name || catalogCountry }];

  return (
    <section className={styles.bandeau} aria-label={t("pays.offresPour")}>
      <label className={styles.ligne}>
        <span>📍 {t("pays.offresPour")}</span>
        <select value={catalogCountry} onChange={(e) => setCatalogCountry(e.target.value)} className={styles.select}>
          <option value={COUNTRY_INTERNATIONAL}>{t("catalogue.allCountriesInternational")}</option>
          {options.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
        </select>
      </label>
      {aucuneOffre && (
        <p className={styles.vide}>
          {t("pays.aucuneOffre", { pays: pays?.name || catalogCountry })}{" "}
          <button type="button" className={styles.lien} onClick={() => setCatalogCountry(COUNTRY_INTERNATIONAL)}>{t("pays.voirInternational")}</button>
          {" · "}<Link to="/partenaires" className={styles.lien}>{t("pays.devenirPartenaire")}</Link>
        </p>
      )}
    </section>
  );
}
