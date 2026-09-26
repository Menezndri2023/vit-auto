import { useState, useCallback, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import styles from "./ImportExport.module.css";
import { COUNTRIES_ALL, VEHICLE_TYPES } from "../data/autocomplete";
import { useCurrency } from "../context/CurrencyContext";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { useI18n } from "../context/I18nContext";
import { LIBELLE_PLAN, OUTILS_PAR_SECTEUR } from "../constants/planFeatures";
import { useAuth as useAuthSession } from "../context/AuthContext";

// Repli tant que GET /api/pricing/config n'a pas répondu — mêmes valeurs que
// server/config/defaultPricingConfig.js (source de vérité réelle).
const FALLBACK_PRICING = {
  // ⚠️ Ce repli s'affiche une fraction de seconde sur une page qui annonce des
  // TAUX. Il annonçait 3 % en standard et 2 % pour un abonné premium : les
  // deux étaient faux (5 % et 5 %), et le second inventait une remise liée à
  // l'abonnement — ce que la règle du 2026-09-09 interdit explicitement. Le
  // taux réduit vient de l'Offre Fondateur, pas d'un palier payant.
  // Miroir exact de server/config/defaultPricingConfig.js.
  commissions:  { standard: { import_export: 0.05 }, premium: { import_export: 0.05 } },
  foundingPartner: { durationMonths: 12, entreprise: { import_export: 0.03 } },
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

/* ── Packs Import Assist ──
   Silver/Gold/Platinum/Executive sont des noms commerciaux : ils ne se
   traduisent pas, leur contenu si.

   ⚠️ Ces montants étaient les SEULS du site libellés en euros, figés et non
   convertis — un client ivoirien voyait des FCFA partout et « 399 € » ici.
   Ils passent par fmtUSD comme le reste et suivent la devise du visiteur.

   Grille proposée le 2026-09-26, à valider par l'exploitant : la progression
   double à chaque palier, et l'inspection à l'unité (90/220/490 $) reste
   cohérente avec ce que les packs incluent. Executive passe SUR DEVIS — une
   conciergerie 24 h/7 j avec financement, assurance et garantie de
   satisfaction ne tient pas dans un prix fixe : l'annoncer à un montant
   unique, c'est soit se tromper, soit refuser le dossier ensuite. ── */
const PACKS = [
  {
    name: "Silver", priceUSD: 390, color: "#94a3b8",
    accent: "rgba(148,163,184,.12)", border: "rgba(148,163,184,.3)",
    items: ["ie.svc.sellerCheck", "ie.svc.buyAssist", "ie.svc.fileTracking", "ie.svc.emailSupport"],
  },
  {
    name: "Gold", priceUSD: 890, color: "#f59e0b",
    accent: "rgba(245,158,11,.10)", border: "rgba(245,158,11,.35)", popular: true,
    inherits: "Silver",
    items: ["ie.svc.proInspection", "ie.svc.fullLogistics", "ie.svc.prioritySupport", "ie.svc.negotiation"],
  },
  {
    name: "Platinum", priceUSD: 1790, color: "#6366f1",
    accent: "rgba(99,102,241,.10)", border: "rgba(99,102,241,.35)",
    inherits: "Gold",
    items: ["ie.svc.fullFile", "ie.svc.customs", "ie.svc.deliveryCoord", "ie.svc.advisor"],
  },
  {
    name: "Executive", priceUSD: null, color: "#ff4d2d",
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
  // Le parcours exportateur mène à /importer-apply, réservé aux partenaires
  // connectés : un visiteur y serait refoulé sans explication.
  const { user } = useAuthSession();
  const estPartenaire = user?.role === "partenaire" || user?.role === "admin";

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
  // plat, pas de palier par valeur. Elle est à la charge du VENDEUR : elle
  // appartient donc au parcours exportateur, pas au parcours importateur.
  //
  // La seconde ligne montre le FONDATEUR, pas un « abonné premium » : les taux
  // d'abonnement sont identiques au standard, et afficher deux lignes au
  // contenu identique laissait croire à un avantage inexistant — même
  // correction que celle déjà faite sur /plans.
  const pct = (r) => r == null ? "—" : `${Math.round(r * 1000) / 10} %`;
  const stdRate = pricing.commissions?.standard?.import_export ?? FALLBACK_PRICING.commissions.standard.import_export;
  const fondateur = pricing.foundingPartner || FALLBACK_PRICING.foundingPartner;
  const fpRate = fondateur.entreprise?.import_export;
  const { minUSD, percent, maxUSD } = pricing.serviceFee || FALLBACK_PRICING.serviceFee;

  // Outils export réellement livrés, par palier — lus dans la même table que
  // /plans, pour que les deux pages ne puissent pas diverger.
  const PALIERS_EXPORT = [
    { plan: "individuel_plus", nom: LIBELLE_PLAN.individuel_plus, prix: pricing.subscriptions?.individuel_plus?.priceUSD, couleur: "#6366f1" },
    { plan: "business",        nom: LIBELLE_PLAN.business,        prix: pricing.subscriptions?.business?.priceUSD,        couleur: "#f59e0b" },
    { plan: "exportateur",     nom: LIBELLE_PLAN.exportateur,     prix: pricing.subscriptions?.exportateur?.priceUSD,     couleur: "#0ea5e9" },
    // Entreprise reste à devis manuel (pas de self-service, voir
    // PricingConfig.subscriptions) : aucun prix, et des avantages propres
    // plutôt que la table des outils, qui n'en déclare pas pour ce palier.
    { plan: "entreprise",      nom: LIBELLE_PLAN.entreprise,      prix: null, couleur: "#0f1b3f",
      avantages: ["ie.svc.customPricing", "ie.svc.unlimited", "ie.svc.allSectors"] },
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
          <a className={styles.primaryBtn} href="#importateur">{t("ie.doorImport")}</a>
          <a className={styles.secondaryBtn} href="#exportateur">{t("ie.doorExport")}</a>
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

    {/* ── LES DEUX PUBLICS ──
        La page servait un seul discours à deux métiers opposés : celui qui
        fait VENIR un véhicule (client, packs) et celui qui EXPÉDIE depuis son
        pays (partenaire, secteur + profil vérifié + abonnement). Ils ne
        partagent ni les démarches, ni ce qu'ils paient. ── */}
    <section className={styles.zonesSection}>
      <div className={styles.inner}>
        <div className={styles.sectionHeader}>
          <h2>{t("ie.chooseTitle")}</h2>
          <p>{t("ie.chooseSub")}</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18 }}>
          {[
            { ancre: "#importateur", icone: "📥", titre: t("ie.doorImport"), desc: t("ie.doorImportDesc"), qui: t("ie.doorImportWho"), couleur: "#6366f1", fond: "rgba(99,102,241,.06)" },
            { ancre: "#exportateur", icone: "📤", titre: t("ie.doorExport"), desc: t("ie.doorExportDesc"), qui: t("ie.doorExportWho"), couleur: "#0ea5e9", fond: "rgba(14,165,233,.06)" },
          ].map((porte) => (
            <a key={porte.ancre} href={porte.ancre}
              style={{ display: "block", background: porte.fond, border: `1.5px solid ${porte.couleur}33`, borderRadius: 16, padding: "22px 24px", textDecoration: "none", color: "inherit" }}>
              <div style={{ fontSize: "1.8rem", marginBottom: 8 }}>{porte.icone}</div>
              <h3 style={{ margin: "0 0 8px", color: porte.couleur, fontSize: "1.05rem", fontWeight: 800 }}>{porte.titre}</h3>
              <p style={{ margin: "0 0 12px", color: "#475569", fontSize: ".9rem", lineHeight: 1.55 }}>{porte.desc}</p>
              <span style={{ fontSize: ".76rem", color: "#64748b", fontWeight: 700, letterSpacing: ".02em" }}>{porte.qui}</span>
            </a>
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

    {/* ══════════ PARCOURS IMPORTATEUR (client) ══════════ */}
    <section id="importateur" className={styles.processSection} style={{ scrollMarginTop: 80 }}>
      <div className={styles.inner}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTag}>{t("ie.impTag")}</span>
          <h2>{t("ie.impTitle")}</h2>
          <p>{t("ie.impSub")}</p>
        </div>
        <div className={styles.sectionHeader} style={{ marginTop: 28 }}>
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
                <span className={styles.packPrice}>{p.priceUSD === null ? t("ie.onQuote") : fmtUSD(p.priceUSD)}</span>
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

    {/* ── CE QUE PAIE L'IMPORTATEUR ──
        La commission n'y figure pas : elle est à la charge du VENDEUR. La
        mettre ici laissait croire au client qu'il la payait deux fois. ── */}
    <section className={styles.econSection}>
      <div className={styles.inner}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTag}>{t("ie.feesTag")}</span>
          <h2>{t("ie.impWhatYouPay")}</h2>
          <p>{t("ie.feesSub")}</p>
        </div>
        <div className={styles.econGrid}>
          <div className={styles.econCard}>
            <div className={styles.econCardHeader}>
              <span className={styles.econIcon}>🧾</span>
              <h3>{t("ie.impWhatYouPay")}</h3>
            </div>
            <ul style={{ margin: 0, padding: "0 0 0 18px", color: "#475569", fontSize: ".9rem", lineHeight: 1.7 }}>
              <li>{t("ie.impPay1")}</li>
              <li>{t("ie.impPay2", { min: fmtUSD(minUSD), pct: percent * 100, max: fmtUSD(maxUSD) })}</li>
              <li>{t("ie.impPay3")}</li>
            </ul>
            <p style={{ marginTop: 14, padding: "10px 12px", background: "rgba(16,185,129,.08)", borderRadius: 10, color: "#047857", fontSize: ".85rem", fontWeight: 700 }}>
              ✓ {t("ie.impNoCommission")}
            </p>
          </div>

          {/* Services additionnels */}
          <div className={styles.econCard}>
            <div className={styles.econCardHeader}>
              <span className={styles.econIcon}>🛠️</span>
              <h3>{t("ie.addlServices")}</h3>
            </div>
            <div className={styles.servicesList}>
              {[
                { key: "ie.svc.inspStd",        price: fmtUSD(90) },
                { key: "ie.svc.inspPrem",       price: fmtUSD(220) },
                { key: "ie.svc.fullExpertise",  price: fmtUSD(490) },
                { key: "ie.svc.intlTransport",  price: t("ie.price.margin") },
                { key: "ie.svc.partnerIns",     price: t("ie.price.comm") },
                { key: "ie.svc.autoCredit",     price: t("ie.price.perFile", { min: fmtUSD(110), max: fmtUSD(2200) }) },
                { key: "ie.delivery",           price: t("ie.onQuote") },
              ].map((sv) => (
                <div key={sv.key} className={styles.servicesRow}>
                  <span className={styles.servicesLabel}>{t(sv.key)}</span>
                  <span className={styles.servicesPrice}>{sv.price}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 24, justifyContent: "center" }}>
          <button className={styles.primaryBtn} onClick={() => openModal()}>{t("ie.askQuote")}</button>
          <Link className={styles.secondaryBtn} to="/import-export/listings">{t("ie.seeListings")}</Link>
        </div>
      </div>
    </section>

    {/* ══════════ PARCOURS EXPORTATEUR (partenaire) ══════════
        Aucun pack de ce côté : le partenaire demande le secteur, fait vérifier
        son entreprise, publie — et ses OUTILS dépendent de son abonnement. Le
        taux réduit vient de l'Offre Fondateur, jamais d'un palier payant. ── */}
    <section id="exportateur" className={styles.subsSection} style={{ scrollMarginTop: 80 }}>
      <div className={styles.inner}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTag}>{t("ie.expTag")}</span>
          <h2>{t("ie.expTitle")}</h2>
          <p>{t("ie.expSub")}</p>
        </div>

        {/* Les trois étapes d'entrée */}
        <div className={styles.sectionHeader} style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: "1.1rem" }}>{t("ie.expHowTitle")}</h2>
        </div>
        <div className={styles.stepsGrid}>
          {["ie.expStep1", "ie.expStep2", "ie.expStep3"].map((cle, i) => (
            <div key={cle} className={styles.stepCard}>
              <div className={styles.stepNumBadge}>{String(i + 1).padStart(2, "0")}</div>
              {i < 2 && <div className={styles.stepArrow}>→</div>}
              <div className={styles.stepIcon}>{["🧭", "🛡️", "🚢"][i]}</div>
              <h4 className={styles.stepTitle}>{t(cle)}</h4>
              <p className={styles.stepDesc}>{t(`${cle}d`)}</p>
            </div>
          ))}
        </div>

        {/* Les outils, par palier — même table que /plans */}
        <div className={styles.sectionHeader} style={{ marginTop: 36 }}>
          <h2 style={{ fontSize: "1.1rem" }}>{t("ie.expToolsTitle")}</h2>
          <p>{t("ie.expToolsSub")}</p>
        </div>
        <div className={styles.subsGrid}>
          {PALIERS_EXPORT.map((palier) => {
            const outils = OUTILS_PAR_SECTEUR.exportateur?.[palier.plan] || [];
            return (
              <div key={palier.plan} className={`${styles.subCard} ${palier.plan === "exportateur" ? styles.subHighlight : ""}`}>
                <h4 className={styles.subName} style={{ color: palier.couleur }}>{palier.nom}</h4>
                <div className={styles.subPrice}>
                  {typeof palier.prix === "number" ? `${fmtUSD(palier.prix)}${t("ie.perMonth")}` : t("ie.onQuote")}
                </div>
                <ul className={styles.subFeatures}>
                  {palier.avantages
                    ? palier.avantages.map((a) => <li key={a}><span>✓</span>{t(a)}</li>)
                    : outils.length === 0
                      ? <li><span>·</span>{t("ie.expNoTools")}</li>
                      : outils.map((o) => <li key={o.key}><span>✓</span>{t(o.key)}</li>)}
                </ul>
                <Link to="/plans" className={`${styles.subBtn} ${palier.plan === "exportateur" ? styles.subBtnPrimary : ""}`}>
                  {t("ie.expCtaPlans")}
                </Link>
              </div>
            );
          })}
        </div>

        {/* La commission, à la charge du vendeur */}
        <div className={styles.econCard} style={{ marginTop: 32, maxWidth: 640, marginInline: "auto" }}>
          <div className={styles.econCardHeader}>
            <span className={styles.econIcon}>📊</span>
            <h3>{t("ie.expCommTitle")}</h3>
          </div>
          <table className={styles.econTable}>
            <tbody>
              <tr>
                <td>{t("ie.expCommStd")}</td>
                <td className={styles.econRate}>{pct(stdRate)}</td>
              </tr>
              <tr>
                <td>{t("ie.expCommFounder", { n: fondateur.durationMonths })}</td>
                <td className={styles.econRate} style={{ color: "#f59e0b" }}>{pct(fpRate)}</td>
              </tr>
            </tbody>
          </table>
          <p style={{ marginTop: 12, color: "#64748b", fontSize: ".82rem", lineHeight: 1.55 }}>{t("ie.expCommNote")}</p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 24, justifyContent: "center" }}>
          {/* /importer-apply est réservé aux partenaires connectés : un visiteur
              y serait refoulé sans explication. On l'envoie créer son compte. */}
          <Link className={styles.primaryBtn} to={estPartenaire ? "/importer-apply" : "/register"}>
            {estPartenaire ? t("ie.expCtaApply") : t("ie.expCtaRegister")}
          </Link>
          <Link className={styles.secondaryBtn} to="/plans">{t("ie.expCtaPlans")}</Link>
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
