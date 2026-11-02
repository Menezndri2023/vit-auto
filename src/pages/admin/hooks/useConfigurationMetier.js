import { useState, useCallback, useEffect } from "react";

// Configuration métier (PricingConfig, devises, pays, campagnes promo) : état
// et actions sortis d'AdminPanel.jsx le 2026-11-02, à l'identique.
export default function useConfigurationMetier({ token, headers, showToast, setConfirm }) {
  // Configuration métier (PricingConfig + ExchangeRate + CountryConfig)
  const [bizSubTab,        setBizSubTab]        = useState("commissions");
  const [bizConfig,        setBizConfig]        = useState(null); // PricingConfig brut
  const [bizConfigLoading, setBizConfigLoading] = useState(false);
  const [bizSaving,        setBizSaving]        = useState(null); // clé de section en cours de sauvegarde
  const [commissionsForm,  setCommissionsForm]  = useState(null);
  const [foundingForm,     setFoundingForm]     = useState(null);
  const [serviceFeeForm,   setServiceFeeForm]   = useState(null);
  const [importFeeForm,    setImportFeeForm]    = useState(null);
  const [subscriptionsForm,setSubscriptionsForm]= useState(null);
  const [boostsForm,       setBoostsForm]       = useState(null);
  const [rentalOptsForm,   setRentalOptsForm]   = useState(null);
  const [fournisseurForm,  setFournisseurForm]  = useState(null);
  const [servicesForm,     setServicesForm]     = useState(null);
  const [adsConfigForm,    setAdsConfigForm]    = useState(null);
  const [discountCampaigns, setDiscountCampaigns] = useState([]);
  const [discountForm,    setDiscountForm]      = useState(null); // objet en cours d'édition/création, ou null
  const [exchangeRates,    setExchangeRates]    = useState([]);
  const [countryConfigs,   setCountryConfigs]   = useState([]);
  const [rateForm,         setRateForm]         = useState(null); // null = fermé
  const [countryForm,      setCountryForm]      = useState(null);

  // ── Configuration métier — PricingConfig + ExchangeRate + CountryConfig ─────
  const loadBusinessConfig = useCallback(async () => {
    if (!token) return;
    setBizConfigLoading(true);
    try {
      const [pRes, rRes, cRes, dRes] = await Promise.all([
        fetch("/api/admin/business-config/pricing", { headers }),
        fetch("/api/admin/business-config/exchange-rates", { headers }),
        fetch("/api/admin/business-config/countries", { headers }),
        fetch("/api/admin/business-config/discount-campaigns", { headers }),
      ]);
      if (pRes.ok) {
        const { config } = await pRes.json();
        setBizConfig(config);
        setCommissionsForm(config.commissions);
        setFoundingForm(config.foundingPartner);
        setServiceFeeForm(config.serviceFee);
        setImportFeeForm(config.importEstimateFee);
        setSubscriptionsForm(config.subscriptions);
        setBoostsForm(config.boosts);
        setRentalOptsForm(config.rentalOptions);
        setFournisseurForm(config.rentalOptionsFournisseur || {});
        setServicesForm(config.services);
        setAdsConfigForm(config.ads);
      }
      if (rRes.ok) setExchangeRates((await rRes.json()).rates || []);
      if (cRes.ok) setCountryConfigs((await cRes.json()).countries || []);
      if (dRes.ok) setDiscountCampaigns((await dRes.json()).campaigns || []);
    } catch { /* ignore */ }
    setBizConfigLoading(false);
  }, [token, headers]);

  const savePricingSection = async (section, payload) => {
    setBizSaving(section);
    try {
      const r = await fetch(`/api/admin/business-config/pricing/${section}`, {
        method: "PATCH", headers, body: JSON.stringify(payload),
      });
      const d = await r.json().catch(() => null);
      // Commissions / grille fondateur (2026-10-30) : le serveur programme une
      // version (202, préavis) au lieu d'appliquer — son message le dit, et la
      // grille en vigueur est rechargée telle quelle.
      if (r.ok) {
        showToast(d?.message || "Configuration enregistrée.");
        if (d?.config) setBizConfig(d.config); else loadBusinessConfig();
      }
      else showToast(d?.message || "Erreur", "error");
    } catch { showToast("Erreur réseau", "error"); }
    finally { setBizSaving(null); }
  };

  const saveExchangeRate = async () => {
    if (!rateForm?.code || !rateForm?.name || !rateForm?.symbol || !rateForm?.rateFromUSD) {
      showToast("Code, nom, symbole et taux sont requis", "error"); return;
    }
    try {
      const r = await fetch("/api/admin/business-config/exchange-rates", {
        method: "POST", headers, body: JSON.stringify(rateForm),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) { showToast("Devise enregistrée."); setRateForm(null); loadBusinessConfig(); }
      else showToast(d?.message || "Erreur", "error");
    } catch { showToast("Erreur réseau", "error"); }
  };

  // Fenêtre de confirmation du panneau : `confirm` y désigne son état, pas
  // window.confirm — l'appel levait « confirm is not a function » (2026-11-02).
  const deleteExchangeRateFn = (id) => setConfirm({ message: "Supprimer cette devise ?", danger: true, action: () => deleteExchangeRateFnConfirme(id) });
  const deleteExchangeRateFnConfirme = async (id) => {
    try {
      const r = await fetch(`/api/admin/business-config/exchange-rates/${id}`, { method: "DELETE", headers });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        showToast(d?.message || "Suppression refusée par le serveur.", "error");
        return;
      }
      showToast("Devise supprimée.");
      loadBusinessConfig();
    } catch { showToast("Erreur réseau — rien n'a été supprimé.", "error"); }
  };

  const saveCountryConfig = async () => {
    if (!countryForm?.code || !countryForm?.name || !countryForm?.defaultCurrency) {
      showToast("Code, nom et devise par défaut sont requis", "error"); return;
    }
    try {
      const r = await fetch("/api/admin/business-config/countries", {
        method: "POST", headers, body: JSON.stringify(countryForm),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) { showToast("Pays enregistré."); setCountryForm(null); loadBusinessConfig(); }
      else showToast(d?.message || "Erreur", "error");
    } catch { showToast("Erreur réseau", "error"); }
  };

  // Fenêtre de confirmation du panneau : `confirm` y désigne son état, pas
  // window.confirm — l'appel levait « confirm is not a function » (2026-11-02).
  const deleteCountryConfigFn = (id) => setConfirm({ message: "Supprimer ce pays ?", danger: true, action: () => deleteCountryConfigFnConfirme(id) });
  const deleteCountryConfigFnConfirme = async (id) => {
    try {
      const r = await fetch(`/api/admin/business-config/countries/${id}`, { method: "DELETE", headers });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        showToast(d?.message || "Suppression refusée par le serveur.", "error");
        return;
      }
      showToast("Pays supprimé.");
      loadBusinessConfig();
    } catch { showToast("Erreur réseau — rien n'a été supprimé.", "error"); }
  };

  const saveDiscountCampaign = async () => {
    if (!discountForm?.code || !discountForm?.discountPercent) {
      showToast("Code et pourcentage de réduction requis", "error"); return;
    }
    try {
      const payload = {
        ...discountForm,
        maxRedemptions: discountForm.maxRedemptions === "" ? null : discountForm.maxRedemptions,
        startDate: discountForm.startDate || null,
        endDate: discountForm.endDate || null,
      };
      const r = await fetch("/api/admin/business-config/discount-campaigns", {
        method: "POST", headers, body: JSON.stringify(payload),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) { showToast("Campagne enregistrée."); setDiscountForm(null); loadBusinessConfig(); }
      else showToast(d?.message || "Erreur", "error");
    } catch { showToast("Erreur réseau", "error"); }
  };

  // Fenêtre de confirmation du panneau : `confirm` y désigne son état, pas
  // window.confirm — l'appel levait « confirm is not a function » (2026-11-02).
  const deleteDiscountCampaignFn = (id) => setConfirm({ message: "Supprimer cette campagne ?", danger: true, action: () => deleteDiscountCampaignFnConfirme(id) });
  const deleteDiscountCampaignFnConfirme = async (id) => {
    try {
      const r = await fetch(`/api/admin/business-config/discount-campaigns/${id}`, { method: "DELETE", headers });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        showToast(d?.message || "Suppression refusée par le serveur.", "error");
        return;
      }
      showToast("Campagne supprimée.");
      loadBusinessConfig();
    } catch { showToast("Erreur réseau — rien n'a été supprimé.", "error"); }
  };

  // Chargé indépendamment de l'onglet actif (contrairement au bloc ci-dessus,
  // conditionné par activeTab === "business_config") : le message d'invitation
  // Founding Partner (vue "onboarding") a besoin des taux de commission
  // courants même si l'admin n'a jamais ouvert l'onglet Configuration métier.
  useEffect(() => { if (!bizConfig) loadBusinessConfig(); }, [bizConfig, loadBusinessConfig]);

  return {
    adsConfigForm, bizConfig, bizConfigLoading, bizSaving, bizSubTab,
    boostsForm, commissionsForm, countryConfigs, countryForm, deleteCountryConfigFn,
    deleteDiscountCampaignFn, deleteExchangeRateFn, discountCampaigns, discountForm, exchangeRates,
    foundingForm, fournisseurForm, importFeeForm, loadBusinessConfig, rateForm,
    rentalOptsForm, saveCountryConfig, saveDiscountCampaign, saveExchangeRate, savePricingSection,
    serviceFeeForm, servicesForm, setAdsConfigForm, setBizSubTab, setBoostsForm,
    setCommissionsForm, setCountryForm, setDiscountForm, setFoundingForm, setFournisseurForm,
    setImportFeeForm, setRateForm, setRentalOptsForm, setServiceFeeForm, setServicesForm,
    setSubscriptionsForm, subscriptionsForm,
  };
}
