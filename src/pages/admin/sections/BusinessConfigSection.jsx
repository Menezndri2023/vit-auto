import { Badge } from "../shared.jsx";
import styles from "../../AdminPanel.module.css";

// Onglet « Configuration métier » (Finance) — extrait d'AdminPanel.jsx le 2026-11-02, à l'identique :
// l'état et les actions restent dans le panneau, passés ici en propriétés.
export default function BusinessConfigSection({
  adsConfigForm, bizConfig, bizConfigLoading, bizSaving, bizSubTab, boostsForm,
  commissionsForm, countryConfigs, deleteCountryConfigFn, deleteDiscountCampaignFn, deleteExchangeRateFn, discountCampaigns,
  exchangeRates, foundingForm, fournisseurForm, importFeeForm, loadBusinessConfig, rentalOptsForm,
  savePricingSection, serviceFeeForm, servicesForm, setAdsConfigForm, setBizSubTab, setBoostsForm,
  setCommissionsForm, setCountryForm, setDiscountForm, setFoundingForm, setFournisseurForm, setImportFeeForm,
  setRateForm, setRentalOptsForm, setServiceFeeForm, setServicesForm, setSubscriptionsForm, subscriptionsForm,
}) {
  return (
    <div className={styles.tabContent}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>⚙️ Configuration métier</h2>
          <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Commissions, abonnements, boosts, devises, pays, services et publicités — modifiables sans redéploiement. Tous les montants en USD.</p>
        </div>
        <button className={styles.btnRefresh} onClick={loadBusinessConfig}>↻ Actualiser</button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: "1.25rem", flexWrap: "wrap" }}>
        {[
          ["commissions", "💰 Commissions"],
          ["subs_boosts", "⭐ Abonnements & Boosts"],
          ["currencies", "🌍 Devises & Pays"],
          ["services_ads", "🛠️ Services & Publicités"],
          ["discounts", "🎟️ Codes promo"],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setBizSubTab(key)}
            style={{
              padding: "8px 16px", borderRadius: 9, cursor: "pointer", fontWeight: 700, fontSize: ".82rem",
              border: bizSubTab === key ? "1.5px solid #6366f1" : "1.5px solid #e2e8f0",
              background: bizSubTab === key ? "#eef2ff" : "#fff",
              color: bizSubTab === key ? "#4338ca" : "#475569",
            }}>{label}</button>
        ))}
      </div>

      {bizConfigLoading ? (
        <div className={styles.loadingBox} style={{ minHeight: 120 }}><div className={styles.spinner} /></div>
      ) : !bizConfig ? (
        <p style={{ textAlign: "center", color: "#94a3b8", padding: "30px 0" }}>Configuration non initialisée — exécutez le script server/scripts/migrate-currency-config.mjs.</p>
      ) : (
        <>
          {bizSubTab === "commissions" && commissionsForm && foundingForm && serviceFeeForm && (
            <>
              <div className={styles.chartCard}>
                <h3 className={styles.chartTitle}>💰 Commissions — Standard vs. Abonné premium</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 10 }}>
                  {["standard", "premium"].map((tier) => (
                    <div key={tier}>
                      <div style={{ fontWeight: 800, fontSize: ".82rem", color: tier === "standard" ? "#64748b" : "#6366f1", marginBottom: 8, textTransform: "uppercase" }}>
                        {tier === "standard" ? "Standard" : "Abonné premium"}
                      </div>
                      {[["vente", "Vente"], ["location", "Location"], ["chauffeur", "Chauffeur"], ["import_export", "Import/Export"], ["leasing", "Leasing"]].map(([key, label]) => (
                        <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                          <label style={{ fontSize: ".82rem", color: "#334155" }}>{label}</label>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <input type="number" step="0.1" min="0" max="100" style={{ width: 70, padding: "6px 8px", border: "1.5px solid #e2e8f0", borderRadius: 7, fontSize: ".82rem", textAlign: "right" }}
                              value={Math.round((commissionsForm[tier][key] ?? 0) * 1000) / 10}
                              onChange={(e) => setCommissionsForm((p) => ({ ...p, [tier]: { ...p[tier], [key]: Number(e.target.value) / 100 } }))} />
                            <span style={{ fontSize: ".8rem", color: "#94a3b8" }}>%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <button className={styles.btnApprove} style={{ marginTop: 8 }} disabled={bizSaving === "commissions"}
                  onClick={() => savePricingSection("commissions", commissionsForm)}>
                  {bizSaving === "commissions" ? "…" : "📅 Programmer la modification"}
                </button>
                <p style={{ fontSize: ".76rem", color: "#64748b", margin: "6px 0 0" }}>
                  Préavis : la nouvelle grille est notifiée aux partenaires et s'applique dans 30 jours, aux transactions créées à partir de cette date. Les transactions existantes gardent leur taux.
                </p>
              </div>

              <div className={styles.chartCard}>
                <h3 className={styles.chartTitle}>👑 Partenaire Fondateur</h3>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>Durée de l'offre (mois)</label>
                  <input type="number" min="1" style={{ width: 100, padding: "6px 8px", border: "1.5px solid #e2e8f0", borderRadius: 7, fontSize: ".85rem" }}
                    value={foundingForm.durationMonths}
                    onChange={(e) => setFoundingForm((p) => ({ ...p, durationMonths: Number(e.target.value) }))} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  {["entreprise", "particulier"].map((profile) => (
                    <div key={profile}>
                      <div style={{ fontWeight: 800, fontSize: ".82rem", color: "#b45309", marginBottom: 8, textTransform: "uppercase" }}>{profile}</div>
                      {["location", "vente", "import_export"].map((key) => (
                        (profile === "particulier" && key === "import_export") ? null : (
                          <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                            <label style={{ fontSize: ".82rem", color: "#334155" }}>{key === "import_export" ? "Import/Export" : key === "location" ? "Location" : "Vente"}</label>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <input type="number" step="0.1" min="0" max="100" style={{ width: 70, padding: "6px 8px", border: "1.5px solid #e2e8f0", borderRadius: 7, fontSize: ".82rem", textAlign: "right" }}
                                value={Math.round((foundingForm[profile][key] ?? 0) * 1000) / 10}
                                onChange={(e) => setFoundingForm((p) => ({ ...p, [profile]: { ...p[profile], [key]: Number(e.target.value) / 100 } }))} />
                              <span style={{ fontSize: ".8rem", color: "#94a3b8" }}>%</span>
                            </div>
                          </div>
                        )
                      ))}
                    </div>
                  ))}
                </div>
                <button className={styles.btnApprove} style={{ marginTop: 8 }} disabled={bizSaving === "foundingPartner"}
                  onClick={() => savePricingSection("foundingPartner", foundingForm)}>
                  {bizSaving === "foundingPartner" ? "…" : "📅 Programmer la modification (préavis 30 j)"}
                </button>
              </div>

              <div className={styles.chartCard}>
                <h3 className={styles.chartTitle}>🧾 Frais de service client — suspendus</h3>
                <p style={{ margin: "0 0 10px", fontSize: ".8rem", color: "#64748b" }}>Suspendus depuis le 30/10/2026 (nature, payeur et montant à valider) : aucun frais n'est appliqué, quel que soit le barème ci-dessous, conservé pour mémoire.</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, maxWidth: 460 }}>
                  <div>
                    <label style={{ fontSize: ".78rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Minimum ($)</label>
                    <input type="number" min="0" step="0.01" style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 7, fontSize: ".85rem" }}
                      value={serviceFeeForm.minUSD} onChange={(e) => setServiceFeeForm((p) => ({ ...p, minUSD: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: ".78rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Pourcentage (%)</label>
                    <input type="number" min="0" max="100" step="0.01" style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 7, fontSize: ".85rem" }}
                      value={Math.round(serviceFeeForm.percent * 1000) / 10}
                      onChange={(e) => setServiceFeeForm((p) => ({ ...p, percent: Number(e.target.value) / 100 }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: ".78rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Maximum ($)</label>
                    <input type="number" min="0" step="0.01" style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 7, fontSize: ".85rem" }}
                      value={serviceFeeForm.maxUSD} onChange={(e) => setServiceFeeForm((p) => ({ ...p, maxUSD: Number(e.target.value) }))} />
                  </div>
                </div>
                <button className={styles.btnApprove} style={{ marginTop: 12 }} disabled={bizSaving === "serviceFee"}
                  onClick={() => savePricingSection("serviceFee", serviceFeeForm)}>
                  {bizSaving === "serviceFee" ? "…" : "💾 Enregistrer les frais de service"}
                </button>
              </div>

              {importFeeForm && (
                <div className={styles.chartCard}>
                  <h3 className={styles.chartTitle}>🌍 Frais de l'estimateur d'import — suspendus</h3>
                  <p style={{ margin: "0 0 10px", fontSize: ".8rem", color: "#64748b" }}>Suspendus depuis le 30/10/2026 : ils s'ajoutaient au total de l'acheteur en plus de la commission exportateur. Aucun frais n'est appliqué ; barème conservé pour mémoire.</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, maxWidth: 460 }}>
                    <div>
                      <label style={{ fontSize: ".78rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Minimum ($)</label>
                      <input type="number" min="0" step="0.01" style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 7, fontSize: ".85rem" }}
                        value={importFeeForm.minUSD} onChange={(e) => setImportFeeForm((p) => ({ ...p, minUSD: Number(e.target.value) }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: ".78rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Pourcentage (%)</label>
                      <input type="number" min="0" max="100" step="0.01" style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 7, fontSize: ".85rem" }}
                        value={Math.round(importFeeForm.percent * 1000) / 10}
                        onChange={(e) => setImportFeeForm((p) => ({ ...p, percent: Number(e.target.value) / 100 }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: ".78rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Maximum ($)</label>
                      <input type="number" min="0" step="0.01" style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 7, fontSize: ".85rem" }}
                        value={importFeeForm.maxUSD} onChange={(e) => setImportFeeForm((p) => ({ ...p, maxUSD: Number(e.target.value) }))} />
                    </div>
                  </div>
                  <button className={styles.btnApprove} style={{ marginTop: 12 }} disabled={bizSaving === "importEstimateFee"}
                    onClick={() => savePricingSection("importEstimateFee", importFeeForm)}>
                    {bizSaving === "importEstimateFee" ? "…" : "💾 Enregistrer les frais d'estimation import"}
                  </button>
                </div>
              )}
            </>
          )}

          {bizSubTab === "subs_boosts" && subscriptionsForm && boostsForm && (
            <>
              <div className={styles.chartCard}>
                <h3 className={styles.chartTitle}>⭐ Abonnements (mensuel, USD)</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, maxWidth: 560, marginTop: 10 }}>
                  {[["individuel_plus", "Individuel Plus"], ["business", "Business"], ["exportateur", "Exportateur"]].map(([key, label]) => (
                    <div key={key}>
                      <label style={{ fontSize: ".78rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>{label} ($/mois)</label>
                      <input type="number" min="0" step="0.01" style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 7, fontSize: ".85rem" }}
                        value={subscriptionsForm[key]?.priceUSD ?? 0}
                        onChange={(e) => setSubscriptionsForm((p) => ({ ...p, [key]: { priceUSD: Number(e.target.value) } }))} />
                    </div>
                  ))}
                </div>
                <button className={styles.btnApprove} style={{ marginTop: 12 }} disabled={bizSaving === "subscriptions"}
                  onClick={() => savePricingSection("subscriptions", subscriptionsForm)}>
                  {bizSaving === "subscriptions" ? "…" : "💾 Enregistrer les abonnements"}
                </button>
              </div>

              <div className={styles.chartCard}>
                <h3 className={styles.chartTitle}>🚀 Boosts (mise en avant, USD)</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, maxWidth: 700, marginTop: 10 }}>
                  {[["24h", "24 heures"], ["7d", "7 jours"], ["30d", "30 jours"], ["international", "Internationale"]].map(([key, label]) => (
                    <div key={key}>
                      <label style={{ fontSize: ".78rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>{label} ($)</label>
                      <input type="number" min="0" step="0.01" style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 7, fontSize: ".85rem" }}
                        value={boostsForm[key] ?? 0}
                        onChange={(e) => setBoostsForm((p) => ({ ...p, [key]: Number(e.target.value) }))} />
                    </div>
                  ))}
                </div>
                <button className={styles.btnApprove} style={{ marginTop: 12 }} disabled={bizSaving === "boosts"}
                  onClick={() => savePricingSection("boosts", boostsForm)}>
                  {bizSaving === "boosts" ? "…" : "💾 Enregistrer les boosts"}
                </button>
              </div>

              {rentalOptsForm && (
                <div className={styles.chartCard}>
                  <h3 className={styles.chartTitle}>🚗 Options de location (par jour, USD)</h3>
                  <p style={{ fontSize: ".78rem", color: "#64748b", margin: "4px 0 0" }}>
                    Tarif plateforme, appliqué quand le partenaire n'a pas fixé le sien. Les suppléments d'agence
                    (conducteur additionnel, km illimité, remise gare/aéroport) restent à 0 : proposés seulement par
                    les partenaires qui les tarifent — un montant ici les rendrait payants chez tous les loueurs.
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, maxWidth: 700, marginTop: 10 }}>
                    {[["gps", "GPS"], ["babySeat", "Siège bébé"], ["insurance", "Assurance"], ["driver", "Chauffeur"], ["additionalDriver", "Conducteur additionnel"], ["unlimitedMileage", "Km illimité"], ["airportDelivery", "Remise gare/aéroport (forfait)"]].map(([key, label]) => (
                      <div key={key}>
                        <label style={{ fontSize: ".78rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>{label} ($)</label>
                        <input type="number" min="0" step="0.01" style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 7, fontSize: ".85rem" }}
                          value={rentalOptsForm[key] ?? 0}
                          onChange={(e) => setRentalOptsForm((p) => ({ ...p, [key]: Number(e.target.value) }))} />
                      </div>
                    ))}
                  </div>
                  <button className={styles.btnApprove} style={{ marginTop: 12 }} disabled={bizSaving === "rentalOptions"}
                    onClick={() => savePricingSection("rentalOptions", rentalOptsForm)}>
                    {bizSaving === "rentalOptions" ? "…" : "💾 Enregistrer les options de location"}
                  </button>
                </div>
              )}

              {fournisseurForm && (
                <div className={styles.chartCard}>
                  <h3 className={styles.chartTitle}>🧾 Fournisseur des options — assiette de la commission</h3>
                  <p style={{ fontSize: ".78rem", color: "#64748b", margin: "4px 0 0" }}>
                    Seules les options <strong>fournies par VIT AUTO</strong> entrent dans la base de la commission
                    (location, chauffeur, loisirs) ; une option fournie par le partenaire — son assurance, son GPS —
                    en est exclue, comme la livraison. Ne basculer sur « VIT AUTO » que si VIT AUTO fournit
                    réellement le service. S'applique aux réservations créées après l'enregistrement.
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, maxWidth: 760, marginTop: 10 }}>
                    {[["gps", "GPS"], ["babySeat", "Siège bébé"], ["insurance", "Assurance"], ["driver", "Chauffeur"], ["additionalDriver", "Conducteur additionnel"], ["unlimitedMileage", "Km illimité"], ["airportDelivery", "Remise gare/aéroport"]].map(([key, label]) => (
                      <div key={key}>
                        <label htmlFor={`fournisseur-${key}`} style={{ fontSize: ".78rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>{label}</label>
                        <select id={`fournisseur-${key}`} style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 7, fontSize: ".85rem", minHeight: 44 }}
                          value={fournisseurForm[key] === "vitauto" ? "vitauto" : "partenaire"}
                          onChange={(e) => setFournisseurForm((p) => ({ ...p, [key]: e.target.value }))}>
                          <option value="partenaire">Partenaire (hors commission)</option>
                          <option value="vitauto">VIT AUTO (soumis à commission)</option>
                        </select>
                      </div>
                    ))}
                  </div>
                  <button className={styles.btnApprove} style={{ marginTop: 12 }} disabled={bizSaving === "rentalOptionsFournisseur"}
                    onClick={() => savePricingSection("rentalOptionsFournisseur", fournisseurForm)}>
                    {bizSaving === "rentalOptionsFournisseur" ? "…" : "💾 Enregistrer les fournisseurs"}
                  </button>
                </div>
              )}
            </>
          )}

          {bizSubTab === "currencies" && (
            <>
              <div className={styles.chartCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <h3 className={styles.chartTitle} style={{ margin: 0 }}>💱 Devises</h3>
                  <button className={styles.btnApprove} style={{ fontSize: ".8rem" }}
                    onClick={() => setRateForm({ code: "", name: "", symbol: "", rateFromUSD: "", active: true })}>+ Nouvelle devise</button>
                </div>
                {exchangeRates.length === 0 ? (
                  <p style={{ textAlign: "center", color: "#94a3b8", padding: "20px 0" }}>Aucune devise configurée.</p>
                ) : (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead><tr><th>Code</th><th>Nom</th><th>Symbole</th><th>Taux depuis 1 USD</th><th>Statut</th><th>Actions</th></tr></thead>
                      <tbody>
                        {exchangeRates.map((r) => (
                          <tr key={r._id} className={styles.tr}>
                            <td style={{ fontWeight: 700 }}>{r.code}</td>
                            <td>{r.name}</td>
                            <td>{r.symbol}</td>
                            <td>{r.rateFromUSD}</td>
                            <td><Badge label={r.active ? "Actif" : "Inactif"} color={r.active ? "#10b981" : "#94a3b8"} bg={r.active ? "#ecfdf5" : "#f1f5f9"} /></td>
                            <td>
                              <div className={styles.actionBtns}>
                                <button className={styles.btnGhost} style={{ fontSize: ".75rem" }} onClick={() => setRateForm(r)}>✏️</button>
                                <button className={styles.btnDeleteSm} style={{ fontSize: ".75rem" }} onClick={() => deleteExchangeRateFn(r._id)}>🗑️</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className={styles.chartCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <h3 className={styles.chartTitle} style={{ margin: 0 }}>🌍 Pays</h3>
                  <button className={styles.btnApprove} style={{ fontSize: ".8rem" }}
                    onClick={() => setCountryForm({ code: "", name: "", flag: "🌍", defaultCurrency: "", locale: "fr-FR", phone: "", languages: ["fr"], paymentMethods: [], deliveryRatePerKm: 200, deliveryBaseRate: 1000, deliveryMaxKm: 100, taxPercent: 0, active: true })}>+ Nouveau pays</button>
                </div>
                {countryConfigs.length === 0 ? (
                  <p style={{ textAlign: "center", color: "#94a3b8", padding: "20px 0" }}>Aucun pays configuré.</p>
                ) : (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead><tr><th>Pays</th><th>Code</th><th>Devise</th><th>Livraison (base/km)</th><th>Taxe</th><th>Statut</th><th>Actions</th></tr></thead>
                      <tbody>
                        {countryConfigs.map((c) => (
                          <tr key={c._id} className={styles.tr}>
                            <td style={{ fontWeight: 700 }}>{c.flag} {c.name}</td>
                            <td>{c.code}</td>
                            <td>{c.defaultCurrency}</td>
                            <td>{c.deliveryBaseRate}/{c.deliveryRatePerKm}</td>
                            <td>{c.taxPercent}%</td>
                            <td><Badge label={c.active ? "Actif" : "Inactif"} color={c.active ? "#10b981" : "#94a3b8"} bg={c.active ? "#ecfdf5" : "#f1f5f9"} /></td>
                            <td>
                              <div className={styles.actionBtns}>
                                <button className={styles.btnGhost} style={{ fontSize: ".75rem" }} onClick={() => setCountryForm(c)}>✏️</button>
                                <button className={styles.btnDeleteSm} style={{ fontSize: ".75rem" }} onClick={() => deleteCountryConfigFn(c._id)}>🗑️</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {bizSubTab === "services_ads" && servicesForm && adsConfigForm && (
            <>
              <div className={styles.chartCard}>
                <h3 className={styles.chartTitle}>🛠️ Plateforme de services</h3>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead><tr><th>Service</th><th>Activé</th><th>Commission (%)</th><th>Frais fixe ($)</th></tr></thead>
                    <tbody>
                      {[
                        ["inspection", "Inspection"], ["assurance", "Assurance"], ["transport", "Transport"], ["transit", "Transit"],
                        ["douanes", "Douanes"], ["immatriculation", "Immatriculation"], ["garantie", "Garantie"],
                        ["financement", "Financement"], ["sequestre", "Séquestre"], ["change_devises", "Change de devises"],
                      ].map(([key, label]) => (
                        <tr key={key} className={styles.tr}>
                          <td style={{ fontWeight: 700 }}>{label}</td>
                          <td>
                            <input type="checkbox" checked={!!servicesForm[key]?.enabled}
                              onChange={(e) => setServicesForm((p) => ({ ...p, [key]: { ...p[key], enabled: e.target.checked } }))} />
                          </td>
                          <td>
                            <input type="number" min="0" max="100" step="0.1" style={{ width: 80, padding: "6px 8px", border: "1.5px solid #e2e8f0", borderRadius: 7, fontSize: ".82rem" }}
                              value={Math.round((servicesForm[key]?.commissionRate ?? 0) * 1000) / 10}
                              onChange={(e) => setServicesForm((p) => ({ ...p, [key]: { ...p[key], commissionRate: Number(e.target.value) / 100 } }))} />
                          </td>
                          <td>
                            <input type="number" min="0" step="0.01" style={{ width: 90, padding: "6px 8px", border: "1.5px solid #e2e8f0", borderRadius: 7, fontSize: ".82rem" }}
                              value={servicesForm[key]?.fixedFeeUSD ?? 0}
                              onChange={(e) => setServicesForm((p) => ({ ...p, [key]: { ...p[key], fixedFeeUSD: Number(e.target.value) } }))} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button className={styles.btnApprove} style={{ marginTop: 12 }} disabled={bizSaving === "services"}
                  onClick={() => savePricingSection("services", servicesForm)}>
                  {bizSaving === "services" ? "…" : "💾 Enregistrer les services"}
                </button>
              </div>

              <div className={styles.chartCard}>
                <h3 className={styles.chartTitle}>📢 Publicités</h3>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead><tr><th>Emplacement</th><th>Prix ($)</th><th>Durée (jours)</th></tr></thead>
                    <tbody>
                      {[
                        ["banner", "Bannière"], ["homepage_feature", "Mise en avant page d'accueil"],
                        ["category_promo", "Promotion catégorie"], ["seo", "SEO"],
                      ].map(([key, label]) => (
                        <tr key={key} className={styles.tr}>
                          <td style={{ fontWeight: 700 }}>{label}</td>
                          <td>
                            <input type="number" min="0" step="0.01" style={{ width: 90, padding: "6px 8px", border: "1.5px solid #e2e8f0", borderRadius: 7, fontSize: ".82rem" }}
                              value={adsConfigForm[key]?.priceUSD ?? 0}
                              onChange={(e) => setAdsConfigForm((p) => ({ ...p, [key]: { ...p[key], priceUSD: Number(e.target.value) } }))} />
                          </td>
                          <td>
                            <input type="number" min="1" style={{ width: 80, padding: "6px 8px", border: "1.5px solid #e2e8f0", borderRadius: 7, fontSize: ".82rem" }}
                              value={adsConfigForm[key]?.durationDays ?? 7}
                              onChange={(e) => setAdsConfigForm((p) => ({ ...p, [key]: { ...p[key], durationDays: Number(e.target.value) } }))} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button className={styles.btnApprove} style={{ marginTop: 12 }} disabled={bizSaving === "ads"}
                  onClick={() => savePricingSection("ads", adsConfigForm)}>
                  {bizSaving === "ads" ? "…" : "💾 Enregistrer les publicités"}
                </button>
              </div>
            </>
          )}

          {bizSubTab === "discounts" && (
            <div className={styles.chartCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <h3 className={styles.chartTitle} style={{ margin: 0 }}>🎟️ Campagnes de réduction</h3>
                <button className={styles.btnApprove} style={{ fontSize: ".8rem" }}
                  onClick={() => setDiscountForm({ code: "", label: "", discountPercent: 10, appliesTo: ["subscriptions", "boosts"], startDate: "", endDate: "", maxRedemptions: "", active: true })}>+ Nouvelle campagne</button>
              </div>
              <p style={{ margin: "0 0 10px", fontSize: ".8rem", color: "#64748b" }}>Codes promo appliqués par le partenaire à l'activation d'un abonnement ou d'un boost (champ "Code promo" optionnel).</p>
              {discountCampaigns.length === 0 ? (
                <p style={{ textAlign: "center", color: "#94a3b8", padding: "20px 0" }}>Aucune campagne configurée.</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead><tr><th>Code</th><th>Réduction</th><th>Applicable à</th><th>Période</th><th>Utilisations</th><th>Statut</th><th>Actions</th></tr></thead>
                    <tbody>
                      {discountCampaigns.map((c) => (
                        <tr key={c._id} className={styles.tr}>
                          <td style={{ fontWeight: 700 }}>{c.code}{c.label ? ` — ${c.label}` : ""}</td>
                          <td>{c.discountPercent}%</td>
                          <td>{(c.appliesTo || []).join(", ")}</td>
                          <td style={{ fontSize: ".78rem" }}>
                            {c.startDate ? new Date(c.startDate).toLocaleDateString("fr-FR") : "—"} → {c.endDate ? new Date(c.endDate).toLocaleDateString("fr-FR") : "—"}
                          </td>
                          <td>{c.redemptionCount}{c.maxRedemptions != null ? ` / ${c.maxRedemptions}` : ""}</td>
                          <td><Badge label={c.active ? "Active" : "Inactive"} color={c.active ? "#10b981" : "#94a3b8"} bg={c.active ? "#ecfdf5" : "#f1f5f9"} /></td>
                          <td>
                            <div className={styles.actionBtns}>
                              <button className={styles.btnGhost} style={{ fontSize: ".75rem" }}
                                onClick={() => setDiscountForm({ ...c, startDate: c.startDate ? c.startDate.slice(0, 10) : "", endDate: c.endDate ? c.endDate.slice(0, 10) : "", maxRedemptions: c.maxRedemptions ?? "" })}>✏️</button>
                              <button className={styles.btnDeleteSm} style={{ fontSize: ".75rem" }} onClick={() => deleteDiscountCampaignFn(c._id)}>🗑️</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
