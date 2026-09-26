import { useState, useCallback, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import styles from "./ImportExport.module.css";
import { COUNTRIES_ALL, VEHICLE_TYPES } from "../data/autocomplete";
import { useCurrency } from "../context/CurrencyContext";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { useI18n } from "../context/I18nContext";
import { LIBELLE_PLAN } from "../constants/planFeatures";

// Repli tant que GET /api/pricing/config n'a pas répondu — mêmes valeurs que
// server/config/defaultPricingConfig.js (source de vérité réelle).
const FALLBACK_PRICING = {
  commissions:  { standard: { import_export: 0.03 }, premium: { import_export: 0.02 } },
  serviceFee:   { minUSD: 1, percent: 0.005, maxUSD: 25 },
  subscriptions:{ individuel_plus: { priceUSD: 9.99 }, business: { priceUSD: 19.99 }, exportateur: { priceUSD: 49.99 } },
};

// Les tableaux ci-dessous portent des CLÉS de traduction, pas du texte : la
// page est déclarée `traduite`, donc tout ce qui s'affiche doit exister dans
// les cinq langues (i18n.pagesTraduites.test.js échoue sinon).

/* ── Zones géographiques ── */
const ZONES = [
  {
    flag: "🇨🇳", nameKey: "country.cn", descKey: "ie.zone.cn.desc",
    color: "#ef4444", bg: "rgba(239,68,68,.09)",
    tags: ["ie.tag.newCars", "ie.tag.electric", "ie.tag.spares", "ie.tag.lightTruck"],
  },
  {
    flag: "🇦🇪", nameKey: "ie.zone.ae.name", descKey: "ie.zone.ae.desc",
    color: "#f59e0b", bg: "rgba(245,158,11,.09)",
    tags: ["ie.tag.suvPremium", "ie.tag.pickup", "ie.tag.luxury", "ie.tag.auctions"],
  },
  {
    flag: "🇪🇺", nameKey: "ie.zone.eu.name", descKey: "ie.zone.eu.desc",
    color: "#3b82f6", bg: "rgba(59,130,246,.09)",
    tags: ["ie.tag.recentUsed", "ie.tag.pro", "ie.tag.vans", "ie.tag.parts"],
  },
  {
    flag: "🌍", nameKey: "ie.zone.wa.name", descKey: "ie.zone.wa.desc",
    color: "#10b981", bg: "rgba(16,185,129,.09)",
    tags: ["country.ci", "country.sn", "country.gh", "country.ng", "ie.tag.morePays"],
  },
  {
    flag: "🌐", nameKey: "ie.zone.mg.name", descKey: "ie.zone.mg.desc",
    color: "#8b5cf6", bg: "rgba(139,92,246,.09)",
    tags: ["country.ma", "country.dz", "country.tn", "country.mr"],
  },
];

/* ── Packs Import Assist ── Silver/Gold/Platinum/Executive sont des noms
   commerciaux : ils ne se traduisent pas, leur contenu si. ── */
const PACKS = [
  {
    name: "Silver", price: "399 €", color: "#94a3b8",
    accent: "rgba(148,163,184,.12)", border: "rgba(148,163,184,.3)",
    items: ["ie.svc.sellerCheck", "ie.svc.buyAssist", "ie.svc.fileTracking", "ie.svc.emailSupport"],
  },
  {
    name: "Gold", price: "799 €", color: "#f59e0b",
    accent: "rgba(245,158,11,.10)", border: "rgba(245,158,11,.35)", popular: true,
    inherits: "Silver",
    items: ["ie.svc.proInspection", "ie.svc.fullLogistics", "ie.svc.prioritySupport", "ie.svc.negotiation"],
  },
  {
    name: "Platinum", price: "1 499 €", color: "#6366f1",
    accent: "rgba(99,102,241,.10)", border: "rgba(99,102,241,.35)",
    inherits: "Gold",
    items: ["ie.svc.fullFile", "ie.svc.customs", "ie.svc.deliveryCoord", "ie.svc.advisor"],
  },
  {
    name: "Executive", price: "2 999 €", color: "#ff4d2d",
    accent: "rgba(255,77,45,.10)", border: "rgba(255,77,45,.35)",
    inherits: "Platinum",
    items: ["ie.svc.concierge", "ie.svc.financeIns", "ie.svc.doorToDoor", "ie.svc.satisfaction"],
  },
];

/* ── Étapes du processus ── */
const STEPS = [
  { num: "01", icon: "🎯", key: "ie.step1" },
  { num: "02", icon: "🔍", key: "ie.step2" },
  { num: "03", icon: "🔬", key: "ie.step3" },
  { num: "04", icon: "💳", key: "ie.step4" },
  { num: "05", icon: "🚢", key: "ie.step5" },
  { num: "06", icon: "📋", key: "ie.step6" },
  { num: "07", icon: "🏠", key: "ie.step7" },
];

// Les tableaux COMMISSIONS et PLANS ne sont plus des données statiques —
// construits dans le composant à partir de /api/pricing/config (voir plus
// bas), pour ne jamais afficher un modèle économique différent de celui
// réellement appliqué par pricingEngine.js / Subscription.js.

/* ── Pays de couverture ── */
const COUNTRIES = [
  { flag: "🇨🇳", key: "country.cn" }, { flag: "🇦🇪", key: "country.ae" },
  { flag: "🇩🇪", key: "country.de" }, { flag: "🇫🇷", key: "country.fr" },
  { flag: "🇧🇪", key: "country.be" }, { flag: "🇳🇱", key: "country.nl" },
  { flag: "🇪🇸", key: "country.es" }, { flag: "🇮🇹", key: "country.it" },
  { flag: "🇲🇦", key: "country.ma" }, { flag: "🇩🇿", key: "country.dz" },
  { flag: "🇹🇳", key: "country.tn" }, { flag: "🇲🇷", key: "country.mr" },
  { flag: "🇨🇮", key: "country.ci" }, { flag: "🇸🇳", key: "country.sn" },
  { flag: "🇬🇭", key: "country.gh" }, { flag: "🇳🇬", key: "country.ng" },
  { flag: "🇧🇯", key: "country.bj" }, { flag: "🇹🇬", key: "country.tg" },
  { flag: "🇲🇱", key: "country.ml" }, { flag: "🇬🇳", key: "country.gn" },
];

/* ── Partenaires stratégiques ── */
const PARTNERS = [
  { icon: "🚢", key: "ie.eco.forwarders" }, { icon: "🛡️", key: "ie.eco.insurers" },
  { icon: "🏦", key: "ie.eco.banks" },      { icon: "🏢", key: "ie.eco.dealers" },
  { icon: "🅿️", key: "ie.eco.fleets" },    { icon: "🔧", key: "ie.eco.experts" },
  { icon: "📜", key: "ie.eco.brokers" },    { icon: "🚗", key: "ie.eco.makers" },
];

/* ── Catégories de pièces détachées ── */
const PART_CATEGORIES = [
  "ie.part.engines", "ie.part.body", "ie.part.batteries",
  "ie.part.tyres", "ie.part.access", "ie.svc.electronics",
];

/* ── Formulaire de demande ── */
const INITIAL_FORM = {
  firstName: "", lastName: "", email: "", phone: "",
  serviceType: "import", pack: "Silver",
  sourceCountry: "", destCountry: "",
  vehicleType: "", vehicleMake: "", vehicleModel: "",
  budget: "", message: "",
};

function RequestModal({ defaultPack, onClose }) {
  const { token } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [form, setForm]     = useState({ ...INITIAL_FORM, pack: defaultPack || "Silver" });
  const [sending, setSending] = useState(false);
  const [done, setDone]     = useState(false);
  const [error, setError]   = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = useCallback(async (e) => {
    e.preventDefault();
    if (!form.firstName || !form.lastName || !form.email) return;
    // Tout service exige un compte (règle de l'exploitant, 2026-09-14).
    if (!token) { navigate("/login", { state: { from: { pathname: window.location.pathname + window.location.search } } }); return; }
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/import-export/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, budget: form.budget ? Number(form.budget) : undefined }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message || t("ie.serverError"));
      }
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }, [form, token, navigate, t]);

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
        <button className={styles.modalClose} onClick={onClose}>✕</button>

        {done ? (
          <div className={styles.modalSuccess}>
            <div className={styles.modalSuccessIcon}>✅</div>
            <h3>{t("ie.sent")}</h3>
            <p>{t("ie.sentDesc")} <strong>{form.email}</strong>.</p>
            <button className={styles.primaryBtn} onClick={onClose}>{t("ie.close")}</button>
          </div>
        ) : (
          <>
            <div className={styles.modalHeader}>
              <span className={styles.modalBadge}>{t("ie.modalBadge")}</span>
              <h2>{t("ie.quoteTitle")}</h2>
              <p>{t("ie.formIntro")}</p>
            </div>
            {/* Datalists pour autocomplete */}
            <datalist id="dl-countries">
              {COUNTRIES_ALL.map((c) => <option key={c} value={c} />)}
            </datalist>
            <datalist id="dl-vehicle-types">
              {VEHICLE_TYPES.map((t2) => <option key={t2} value={t2} />)}
            </datalist>

            <form onSubmit={submit} className={styles.requestForm} autoComplete="off">
              <div className={styles.formRow}>
                <label>
                  <span>{t("ie.firstName")}</span>
                  <input autoComplete="given-name" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} placeholder={t("ie.firstNamePh")} required />
                </label>
                <label>
                  <span>{t("ie.lastName")}</span>
                  <input autoComplete="family-name" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} placeholder={t("ie.lastNamePh")} required />
                </label>
              </div>
              <div className={styles.formRow}>
                <label>
                  <span>{t("ie.email")}</span>
                  <input type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder={t("ie.emailPh")} required />
                </label>
                <label>
                  <span>{t("ie.phone")}</span>
                  <input type="tel" autoComplete="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+225 07 00 00 00" />
                </label>
              </div>
              <label className={styles.formFull}>
                <span>{t("ie.service")}</span>
                <select value={form.serviceType} onChange={(e) => set("serviceType", e.target.value)}>
                  <option value="import">{t("ie.opt.import")}</option>
                  <option value="export">{t("ie.opt.export")}</option>
                  <option value="transit">{t("ie.opt.transit")}</option>
                  <option value="pieces_detachees">{t("ie.opt.parts")}</option>
                </select>
              </label>
              <div className={styles.formRow}>
                <label>
                  <span>{t("ie.sourceCountry")}</span>
                  <input
                    list="dl-countries"
                    value={form.sourceCountry}
                    onChange={(e) => set("sourceCountry", e.target.value)}
                    placeholder={t("ie.sourcePh")}
                  />
                </label>
                <label>
                  <span>{t("ie.destCountry")}</span>
                  <input
                    list="dl-countries"
                    value={form.destCountry}
                    onChange={(e) => set("destCountry", e.target.value)}
                    placeholder={t("ie.countryPh")}
                  />
                </label>
              </div>
              <div className={styles.formRow}>
                <label>
                  <span>{t("ie.vehicleType")}</span>
                  <input
                    list="dl-vehicle-types"
                    value={form.vehicleType}
                    onChange={(e) => set("vehicleType", e.target.value)}
                    placeholder={t("ie.vehicleTypePh")}
                  />
                </label>
                <label>
                  <span>{t("ie.budget")}</span>
                  <input type="number" min="0" value={form.budget} onChange={(e) => set("budget", e.target.value)} placeholder="15 000" />
                </label>
              </div>
              <label className={styles.formFull}>
                <span>{t("ie.makeModel")}</span>
                <input value={form.vehicleMake} onChange={(e) => set("vehicleMake", e.target.value)} placeholder="Toyota Land Cruiser, BYD Atto 3…" />
              </label>
              <label className={styles.formFull}>
                <span>{t("ie.message")}</span>
                <textarea rows={3} value={form.message} onChange={(e) => set("message", e.target.value)} placeholder={t("ie.needPh")} />
              </label>

              {error && <p className={styles.formError}>❌ {error}</p>}

              <button type="submit" className={styles.primaryBtn} disabled={sending}>
                {sending ? t("ie.sending") : t("ie.submit")}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

const ImportExport = () => {
  // `t` d'abord : useDocumentMeta le lit, et lire une const déclarée plus bas
  // plante toute la page (règle vit/lecture-avant-declaration).
  const { t } = useI18n();
  const { fmtUSD } = useCurrency();

  // Métadonnées propres à cette page. Sans cet appel, elle hérite du titre
  // générique d'index.html — les 153 URLs du sitemap apparaissaient toutes
  // identiques dans les résultats de recherche (voir hooks/useDocumentMeta.js).
  useDocumentMeta({
    title: t("footer.svcIE"),
    description: t("ie.metaDesc"),
    traduite: true,
  });

  const [showModal, setShowModal] = useState(false);
  const [modalPack, setModalPack] = useState("Silver");
  const [pricing, setPricing] = useState(FALLBACK_PRICING);

  useEffect(() => {
    fetch("/api/pricing/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setPricing(d); })
      .catch(() => {}); // repli déjà en place
  }, []);

  const openModal = (pack = "Silver") => { setModalPack(pack); setShowModal(true); };

  // Commission réelle sur une transaction Import/Export (voir
  // pricingEngine.resolveCommissionRate("import_export", ...)) — un seul taux
  // plat, pas de palier par valeur ; le "frais acheteur" est le frais de
  // service générique (max(min, montant×%), plafonné) sur un exemple de 15 000$.
  const stdRate = pricing.commissions.standard.import_export;
  const premRate = pricing.commissions.premium.import_export;
  const { minUSD, percent, maxUSD } = pricing.serviceFee;
  const exampleFee = Math.min(Math.max(minUSD, 15000 * percent), maxUSD);
  const COMMISSIONS = [
    { label: t("ie.standard"),        rate: `${Math.round(stdRate * 1000) / 10} %`,  fee: fmtUSD(exampleFee) },
    { label: t("ie.svc.premiumSub"),  rate: `${Math.round(premRate * 1000) / 10} %`, fee: fmtUSD(exampleFee) },
  ];

  // Abonnements réels (Subscription.js) — les mêmes 3 paliers self-service que
  // /plans, présentés ici dans le contexte Import/Export. "Enterprise" reste
  // à devis manuel (pas de self-service, voir PricingConfig.subscriptions).
  const PLANS = [
    // Pas de « commission réduite » : depuis la grille du 2026-09-09, un
    // abonnement ouvre des outils et de la visibilité, jamais une remise.
    { name: LIBELLE_PLAN.individuel_plus, price: `${fmtUSD(pricing.subscriptions.individuel_plus.priceUSD)}${t("ie.perMonth")}`, features: ["ie.svc.topRank", "ie.svc.incoterms", "ie.svc.perfStats"] },
    { name: LIBELLE_PLAN.business,        price: `${fmtUSD(pricing.subscriptions.business.priceUSD)}${t("ie.perMonth")}`,        features: ["ie.svc.fullTracking", "ie.svc.earlyLeads", "ie.svc.team3", "ie.svc.spotlights"] },
    { name: LIBELLE_PLAN.exportateur,     price: `${fmtUSD(pricing.subscriptions.exportateur.priceUSD)}${t("ie.perMonth")}`,     highlight: true, features: ["ie.svc.unlimitedAds", "ie.svc.crmExport", "ie.svc.catalogApi", "ie.svc.allSectors", "ie.svc.seats10"] },
    { name: LIBELLE_PLAN.entreprise,      price: t("ie.onQuote"), inherits: LIBELLE_PLAN.exportateur, features: ["ie.svc.customPricing", "ie.svc.unlimited"] },
  ];

  return (
  <div className={styles.page}>

    {/* ── HERO ── */}
    <section className={styles.hero}>
      <div className={styles.heroBubble1} />
      <div className={styles.heroBubble2} />
      <div className={styles.heroGlobe} />
      <div className={styles.heroContent}>
        <span className={styles.heroBadge}>{t("ie.heroBadge")}</span>
        <h1>{t("ie.h1a")}<br />{t("ie.h1b")}<br />{t("ie.h1c")}</h1>
        <p>{t("ie.heroDesc")}</p>
        <div className={styles.heroBtns}>
          <button className={styles.primaryBtn} onClick={() => openModal()}>{t("ie.askQuote")}</button>
          <Link className={styles.secondaryBtn} to="/import-export/listings">{t("ie.seeListings")}</Link>
        </div>
      </div>
    </section>

    {/* ── PAYS COUVERTS ── */}
    <section className={styles.countriesBar}>
      <div className={styles.countriesInner}>
        <span className={styles.countriesLabel}>{t("ie.coverage")}</span>
        <div className={styles.countriesScroll}>
          {COUNTRIES.map((c) => (
            <div key={c.key} className={styles.countryChip}>
              <span>{c.flag}</span>
              <span>{t(c.key)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* ── ZONES GÉOGRAPHIQUES ── */}
    <section className={styles.zonesSection}>
      <div className={styles.inner}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTag}>{t("ie.zonesTag")}</span>
          <h2>{t("ie.zonesTitle")}</h2>
          <p>{t("ie.zonesSub")}</p>
        </div>
        <div className={styles.zonesGrid}>
          {ZONES.map((z) => (
            <div key={z.nameKey} className={styles.zoneCard} style={{ borderColor: z.border || z.color + "33" }}>
              <div className={styles.zoneHeader} style={{ background: z.bg }}>
                <span className={styles.zoneFlag}>{z.flag}</span>
                <span className={styles.zoneName} style={{ color: z.color }}>{t(z.nameKey)}</span>
              </div>
              <p className={styles.zoneDesc}>{t(z.descKey)}</p>
              <div className={styles.zoneTags}>
                {z.tags.map((tag) => (
                  <span key={tag} className={styles.zoneTag} style={{ color: z.color, background: z.bg }}>
                    {t(tag)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* ── PROCESSUS 7 ÉTAPES ── */}
    <section className={styles.processSection}>
      <div className={styles.inner}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTag}>{t("ie.stepsTag")}</span>
          <h2>{t("ie.stepsTitle")}</h2>
          <p>{t("ie.stepsSub")}</p>
        </div>
        <div className={styles.stepsGrid}>
          {STEPS.map((s, i) => (
            <div key={s.num} className={styles.stepCard}>
              <div className={styles.stepNumBadge}>{s.num}</div>
              {i < STEPS.length - 1 && <div className={styles.stepArrow}>→</div>}
              <div className={styles.stepIcon}>{s.icon}</div>
              <h4 className={styles.stepTitle}>{t(s.key)}</h4>
              <p className={styles.stepDesc}>{t(`${s.key}d`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* ── PACKS IMPORT ASSIST ── */}
    <section className={styles.packsSection} id="packs">
      <div className={styles.inner}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTag}>{t("ie.packsTag")}</span>
          <h2>{t("ie.packsTitle")}</h2>
          <p>{t("ie.packsSub")}</p>
        </div>
        <div className={styles.packsGrid}>
          {PACKS.map((p) => (
            <div
              key={p.name}
              className={`${styles.packCard} ${p.popular ? styles.packPopular : ""}`}
              style={{ borderColor: p.border }}
            >
              {p.popular && <div className={styles.popularBadge}>{t("ie.mostPopular")}</div>}
              <div className={styles.packTop} style={{ background: p.accent }}>
                <span className={styles.packName} style={{ color: p.color }}>{p.name}</span>
                <span className={styles.packPrice}>{p.price}</span>
                <span className={styles.packPriceSub}>{t("ie.onePack")}</span>
              </div>
              <ul className={styles.packFeatures}>
                {p.inherits && (
                  <li key="inherits">
                    <span className={styles.packCheck} style={{ color: p.color }}>✓</span>
                    {t("ie.allIncluded", { pack: p.inherits })}
                  </li>
                )}
                {p.items.map((item) => (
                  <li key={item}>
                    <span className={styles.packCheck} style={{ color: p.color }}>✓</span>
                    {t(item)}
                  </li>
                ))}
              </ul>
              <button
                className={styles.packBtn}
                style={{ background: p.color, boxShadow: `0 4px 16px ${p.color}33` }}
                onClick={() => openModal(p.name)}
              >
                {t("ie.choose", { pack: p.name })}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* ── MODÈLE ÉCONOMIQUE ── */}
    <section className={styles.econSection}>
      <div className={styles.inner}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTag}>{t("ie.feesTag")}</span>
          <h2>{t("ie.feesTitle")}</h2>
          <p>{t("ie.feesSub")}</p>
        </div>
        <div className={styles.econGrid}>
          {/* Commissions */}
          <div className={styles.econCard}>
            <div className={styles.econCardHeader}>
              <span className={styles.econIcon}>📊</span>
              <h3>{t("ie.commission")}</h3>
            </div>
            <table className={styles.econTable}>
              <thead>
                <tr>
                  <th>{t("ie.profile")}</th>
                  <th>{t("ie.commissionCol")}</th>
                  <th>{t("ie.serviceFeeCol")}</th>
                </tr>
              </thead>
              <tbody>
                {COMMISSIONS.map((c) => (
                  <tr key={c.label}>
                    <td>{c.label}</td>
                    <td className={styles.econRate}>{c.rate}</td>
                    <td>{c.fee}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Autres services */}
          <div className={styles.econCard}>
            <div className={styles.econCardHeader}>
              <span className={styles.econIcon}>🛠️</span>
              <h3>{t("ie.addlServices")}</h3>
            </div>
            <div className={styles.servicesList}>
              {[
                { key: "ie.svc.inspStd",        price: "79 €" },
                { key: "ie.svc.inspPrem",       price: "199 €" },
                { key: "ie.svc.fullExpertise",  price: "399 €" },
                { key: "ie.svc.intlTransport",  price: t("ie.price.margin") },
                { key: "ie.svc.partnerIns",     price: t("ie.price.comm") },
                { key: "ie.svc.autoCredit",     price: t("ie.price.perFile") },
              ].map((s) => (
                <div key={s.key} className={styles.servicesRow}>
                  <span className={styles.servicesLabel}>{t(s.key)}</span>
                  <span className={styles.servicesPrice}>{s.price}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </section>

    {/* ── TARIFICATION TRANSPARENTE ──
        Les montants repris ici sont ceux des packs ci-dessus : une seule
        source affichée deux fois se contredit tôt ou tard. ── */}
    <section className={styles.pricingSection}>
      <div className={styles.inner}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTag}>{t("ie.pricesTag")}</span>
          <h2>{t("ie.pricesTitle")}</h2>
          <p>{t("ie.pricesSub")}</p>
        </div>

        <div className={styles.pricingGrid}>

          {/* Import Assist */}
          <div className={styles.pricingCard}>
            <div className={styles.pricingCardHeader} style={{ background: "rgba(99,102,241,.08)", borderColor: "rgba(99,102,241,.18)" }}>
              <span className={styles.pricingIcon}>🚘</span>
              <h3 style={{ color: "#6366f1" }}>Import Assist</h3>
              <p>{t("ie.buySupport")}</p>
            </div>
            <table className={styles.pricingTable}>
              <thead>
                <tr><th>{t("ie.planCol")}</th><th>{t("ie.priceCol")}</th></tr>
              </thead>
              <tbody>
                {PACKS.map((p) => (
                  <tr key={p.name}>
                    <td><span className={styles.pricingTier} style={{ color: p.color }}>{p.name}</span></td>
                    <td className={styles.pricingPrice}><strong>{p.price}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Inspection */}
          <div className={styles.pricingCard}>
            <div className={styles.pricingCardHeader} style={{ background: "rgba(16,185,129,.08)", borderColor: "rgba(16,185,129,.18)" }}>
              <span className={styles.pricingIcon}>🔬</span>
              <h3 style={{ color: "#10b981" }}>{t("ie.inspection")}</h3>
              <p>{t("ie.techCheck")}</p>
            </div>
            <table className={styles.pricingTable}>
              <thead>
                <tr><th>{t("ie.service")}</th><th>{t("ie.priceCol")}</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td><span className={styles.pricingTier} style={{ color: "#10b981" }}>{t("ie.standard")}</span></td>
                  <td className={styles.pricingPrice}>{t("ie.priceFrom")} <strong>79 €</strong></td>
                </tr>
                <tr>
                  <td><span className={styles.pricingTier} style={{ color: "#10b981" }}>{t("ie.premium")}</span></td>
                  <td className={styles.pricingPrice}>{t("ie.priceFrom")} <strong>199 €</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Livraison */}
          <div className={styles.pricingCard}>
            <div className={styles.pricingCardHeader} style={{ background: "rgba(245,158,11,.08)", borderColor: "rgba(245,158,11,.18)" }}>
              <span className={styles.pricingIcon}>🚢</span>
              <h3 style={{ color: "#f59e0b" }}>{t("ie.delivery")}</h3>
              <p>{t("ie.transportTo")}</p>
            </div>
            <table className={styles.pricingTable}>
              <thead>
                <tr><th>{t("ie.service")}</th><th>{t("ie.priceCol")}</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td><span className={styles.pricingTier} style={{ color: "#f59e0b" }}>{t("ie.national")}</span></td>
                  <td className={styles.pricingPrice}><strong>{t("ie.onQuote")}</strong></td>
                </tr>
                <tr>
                  <td><span className={styles.pricingTier} style={{ color: "#f59e0b" }}>{t("ie.international")}</span></td>
                  <td className={styles.pricingPrice}><strong>{t("ie.onQuote")}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

        </div>

        <p className={styles.pricingNote}>{t("ie.pricesNote")}</p>
      </div>
    </section>

    {/* ── ABONNEMENTS PROS ── */}
    <section className={styles.subsSection}>
      <div className={styles.inner}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTag}>{t("ie.prosTag")}</span>
          <h2>{t("ie.subsTitle")}</h2>
          <p>{t("ie.subsSub")}</p>
        </div>
        <div className={styles.subsGrid}>
          {PLANS.map((p) => (
            <div key={p.name} className={`${styles.subCard} ${p.highlight ? styles.subHighlight : ""}`}>
              <h4 className={styles.subName}>{p.name}</h4>
              <div className={styles.subPrice}>{p.price}</div>
              <ul className={styles.subFeatures}>
                {p.inherits && <li key="inherits"><span>✓</span>{t("ie.allIncluded", { pack: p.inherits })}</li>}
                {p.features.map((f) => <li key={f}><span>✓</span>{t(f)}</li>)}
              </ul>
              <Link to="/plans" className={`${styles.subBtn} ${p.highlight ? styles.subBtnPrimary : ""}`}>
                {t("ie.start")}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* ── PIÈCES DÉTACHÉES ── */}
    <section className={styles.partsSection}>
      <div className={styles.inner}>
        <div className={styles.partsBanner}>
          <div className={styles.partsBannerLeft}>
            <span className={styles.sectionTag}>{t("ie.partsTag")}</span>
            <h2>{t("ie.partsTitle")}</h2>
            <p>{t("ie.partsDesc")}</p>
            <button className={styles.primaryBtn} onClick={() => openModal("Silver")}>{t("ie.askCatalog")}</button>
          </div>
          <div className={styles.partsCategories}>
            {PART_CATEGORIES.map((c) => (
              <div key={c} className={styles.partChip}>{t(c)}</div>
            ))}
          </div>
        </div>
      </div>
    </section>

    {/* ── PARTENAIRES STRATÉGIQUES ── */}
    <section className={styles.partnersSection}>
      <div className={styles.inner}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTag}>{t("ie.ecoTag")}</span>
          <h2>{t("ie.ecoTitle")}</h2>
          <p>{t("ie.ecoSub")}</p>
        </div>
        <div className={styles.partnersGrid}>
          {PARTNERS.map((p) => (
            <div key={p.key} className={styles.partnerChip}>
              <span className={styles.partnerIcon}>{p.icon}</span>
              <span>{t(p.key)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* ── CTA FINAL ── */}
    <section className={styles.ctaSection}>
      <div className={styles.ctaInner}>
        <div className={styles.ctaBubble} />
        <span className={styles.ctaTag}>{t("ie.ctaTag")}</span>
        <h2>{t("ie.finalTitle")}</h2>
        <p>{t("ie.finalDesc")}</p>
        <div className={styles.ctaBtns}>
          <button className={styles.primaryBtn} onClick={() => openModal()}>{t("ie.askQuote")}</button>
          <Link className={styles.ghostBtn} to="/importer-apply">{t("ie.becomeImporter")}</Link>
        </div>
      </div>
    </section>

    {showModal && <RequestModal defaultPack={modalPack} onClose={() => setShowModal(false)} />}
  </div>
  );
};

export default ImportExport;
