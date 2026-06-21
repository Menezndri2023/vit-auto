import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import styles from "./ImportExport.module.css";
import { COUNTRIES_ALL, VEHICLE_TYPES } from "../data/autocomplete";

/* ── Zones géographiques ── */
const ZONES = [
  {
    flag: "🇨🇳",
    label: "Chine",
    color: "#ef4444",
    bg: "rgba(239,68,68,.09)",
    desc: "Premier exportateur mondial de véhicules. BYD, Geely, Chery, Great Wall Motor, SAIC. VE, utilitaires, pièces détachées.",
    tags: ["Véhicules neufs", "Électriques", "Pièces détachées", "Camions légers"],
  },
  {
    flag: "🇦🇪",
    label: "Dubaï / EAU",
    color: "#f59e0b",
    bg: "rgba(245,158,11,.09)",
    desc: "Hub mondial du véhicule premium. SUV, Pick-up, Luxe, Utilitaires. Ventes aux enchères, leasing, concessionnaires.",
    tags: ["SUV Premium", "Pick-up", "Luxe", "Enchères"],
  },
  {
    flag: "🇪🇺",
    label: "Europe",
    color: "#3b82f6",
    bg: "rgba(59,130,246,.09)",
    desc: "Allemagne, France, Belgique, Pays-Bas, Espagne, Italie. Occasion récente, véhicules professionnels, utilitaires.",
    tags: ["Occasion récente", "Professionnels", "Utilitaires", "Pièces"],
  },
  {
    flag: "🌍",
    label: "Afrique de l'Ouest",
    color: "#10b981",
    bg: "rgba(16,185,129,.09)",
    desc: "Côte d'Ivoire, Sénégal, Ghana, Togo, Bénin, Nigeria, Mali, Guinée, Burkina Faso et plus. Marché en forte croissance.",
    tags: ["CI", "Sénégal", "Ghana", "Nigeria", "+7 pays"],
  },
  {
    flag: "🌐",
    label: "Maghreb",
    color: "#8b5cf6",
    bg: "rgba(139,92,246,.09)",
    desc: "Maroc, Algérie, Tunisie, Mauritanie, Libye. Proximité Europe-Afrique, carrefour stratégique du commerce automobile.",
    tags: ["Maroc", "Algérie", "Tunisie", "Mauritanie"],
  },
];

/* ── Packs Import Assist ── */
const PACKS = [
  {
    name: "Silver",
    price: "399 €",
    color: "#94a3b8",
    accent: "rgba(148,163,184,.12)",
    border: "rgba(148,163,184,.3)",
    items: [
      "Vérification du vendeur",
      "Assistance à l'achat",
      "Suivi de dossier",
      "Support par email",
    ],
  },
  {
    name: "Gold",
    price: "799 €",
    color: "#f59e0b",
    accent: "rgba(245,158,11,.10)",
    border: "rgba(245,158,11,.35)",
    popular: true,
    items: [
      "Tout Silver inclus",
      "Inspection professionnelle",
      "Suivi logistique complet",
      "Support prioritaire",
      "Négociation vendeur",
    ],
  },
  {
    name: "Platinum",
    price: "1 499 €",
    color: "#6366f1",
    accent: "rgba(99,102,241,.10)",
    border: "rgba(99,102,241,.35)",
    items: [
      "Tout Gold inclus",
      "Gestion complète du dossier",
      "Assistance dédouanement",
      "Coordination livraison",
      "Conseiller dédié",
    ],
  },
  {
    name: "Executive",
    price: "2 999 €",
    color: "#ff4d2d",
    accent: "rgba(255,77,45,.10)",
    border: "rgba(255,77,45,.35)",
    items: [
      "Tout Platinum inclus",
      "Conciergerie 24h/7j",
      "Financement & assurance",
      "Livraison porte-à-porte",
      "Garantie satisfaction",
    ],
  },
];

/* ── Étapes du processus ── */
const STEPS = [
  { num: "01", icon: "🎯", title: "Choisir le service", desc: "Achat local, importation ou exportation selon votre besoin." },
  { num: "02", icon: "🔍", title: "Recherche du véhicule", desc: "Notre équipe localise le véhicule dans le pays source." },
  { num: "03", icon: "🔬", title: "Inspection", desc: "Vérification technique par un expert partenaire sur place." },
  { num: "04", icon: "💳", title: "Paiement sécurisé", desc: "Transaction protégée sur la plateforme VIT AUTO." },
  { num: "05", icon: "🚢", title: "Transport international", desc: "Coordination avec nos transitaires partenaires." },
  { num: "06", icon: "📋", title: "Dédouanement", desc: "Accompagnement par nos courtiers agréés en douane." },
  { num: "07", icon: "🏠", title: "Livraison", desc: "Remise du véhicule à votre adresse avec tous les documents." },
];

/* ── Commissions ── */
const COMMISSIONS = [
  { range: "< 10 000 €",          rate: "3 %",  fee: "150 €" },
  { range: "10 000 – 30 000 €",   rate: "4 %",  fee: "300 €" },
  { range: "> 30 000 €",          rate: "5 %",  fee: "500 €" },
];

/* ── Abonnements professionnels ── */
const PLANS = [
  { name: "Starter",              price: "49 €/mois",    features: ["10 annonces", "Badge basique", "Statistiques de base"] },
  { name: "Business",             price: "199 €/mois",   features: ["50 annonces", "Badge vérifié", "Statistiques avancées", "Mise en avant"] },
  { name: "Enterprise",           price: "599 €/mois",   features: ["Annonces illimitées", "Badge Premium", "Tableau de bord dédié", "Support prioritaire"] },
  { name: "Corporate International", price: "1 499 €/mois", highlight: true, features: ["Tout Enterprise inclus", "Accès multi-pays", "Gestionnaire de compte dédié", "API intégrée"] },
];

/* ── Pays de couverture ── */
const COUNTRIES = [
  { flag: "🇨🇳", name: "Chine" }, { flag: "🇦🇪", name: "Émirats" },
  { flag: "🇩🇪", name: "Allemagne" }, { flag: "🇫🇷", name: "France" },
  { flag: "🇧🇪", name: "Belgique" }, { flag: "🇳🇱", name: "Pays-Bas" },
  { flag: "🇪🇸", name: "Espagne" }, { flag: "🇮🇹", name: "Italie" },
  { flag: "🇲🇦", name: "Maroc" }, { flag: "🇩🇿", name: "Algérie" },
  { flag: "🇹🇳", name: "Tunisie" }, { flag: "🇲🇷", name: "Mauritanie" },
  { flag: "🇨🇮", name: "Côte d'Ivoire" }, { flag: "🇸🇳", name: "Sénégal" },
  { flag: "🇬🇭", name: "Ghana" }, { flag: "🇳🇬", name: "Nigeria" },
  { flag: "🇧🇯", name: "Bénin" }, { flag: "🇹🇬", name: "Togo" },
  { flag: "🇲🇱", name: "Mali" }, { flag: "🇬🇳", name: "Guinée" },
];

/* ── Partenaires stratégiques ── */
const PARTNERS = [
  { icon: "🚢", label: "Transitaires internationaux" },
  { icon: "🛡️", label: "Assureurs partenaires" },
  { icon: "🏦", label: "Banques & crédit auto" },
  { icon: "🏢", label: "Concessionnaires agréés" },
  { icon: "🅿️", label: "Parcs automobiles" },
  { icon: "🔧", label: "Experts techniques" },
  { icon: "📜", label: "Courtiers en douane" },
  { icon: "🚗", label: "Constructeurs asiatiques" },
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
  const [form, setForm]     = useState({ ...INITIAL_FORM, pack: defaultPack || "Silver" });
  const [sending, setSending] = useState(false);
  const [done, setDone]     = useState(false);
  const [error, setError]   = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = useCallback(async (e) => {
    e.preventDefault();
    if (!form.firstName || !form.lastName || !form.email) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/import-export/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, budget: form.budget ? Number(form.budget) : undefined }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message || "Erreur serveur");
      }
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }, [form]);

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
        <button className={styles.modalClose} onClick={onClose}>✕</button>

        {done ? (
          <div className={styles.modalSuccess}>
            <div className={styles.modalSuccessIcon}>✅</div>
            <h3>Demande envoyée !</h3>
            <p>Notre équipe vous contactera sous 24h à l'adresse <strong>{form.email}</strong>.</p>
            <button className={styles.primaryBtn} onClick={onClose}>Fermer</button>
          </div>
        ) : (
          <>
            <div className={styles.modalHeader}>
              <span className={styles.modalBadge}>🌍 IMPORT / EXPORT</span>
              <h2>Demande de devis gratuit</h2>
              <p>Remplissez ce formulaire, notre équipe vous répond sous 24h.</p>
            </div>
            {/* Datalists pour autocomplete */}
            <datalist id="dl-countries">
              {COUNTRIES_ALL.map((c) => <option key={c} value={c} />)}
            </datalist>
            <datalist id="dl-vehicle-types">
              {VEHICLE_TYPES.map((t) => <option key={t} value={t} />)}
            </datalist>

            <form onSubmit={submit} className={styles.requestForm} autoComplete="off">
              <div className={styles.formRow}>
                <label>
                  <span>Prénom *</span>
                  <input autoComplete="given-name" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} placeholder="Jean" required />
                </label>
                <label>
                  <span>Nom *</span>
                  <input autoComplete="family-name" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} placeholder="Dupont" required />
                </label>
              </div>
              <div className={styles.formRow}>
                <label>
                  <span>Email *</span>
                  <input type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="vous@exemple.com" required />
                </label>
                <label>
                  <span>Téléphone</span>
                  <input type="tel" autoComplete="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+225 07 00 00 00" />
                </label>
              </div>
              <div className={styles.formRow}>
                <label>
                  <span>Service</span>
                  <select value={form.serviceType} onChange={(e) => set("serviceType", e.target.value)}>
                    <option value="import">Importation</option>
                    <option value="export">Exportation</option>
                    <option value="transit">Transit</option>
                    <option value="pieces_detachees">Pièces détachées</option>
                  </select>
                </label>
                <label>
                  <span>Pack souhaité</span>
                  <select value={form.pack} onChange={(e) => set("pack", e.target.value)}>
                    <option value="Silver">Silver — 399 €</option>
                    <option value="Gold">Gold — 799 €</option>
                    <option value="Platinum">Platinum — 1 499 €</option>
                    <option value="Executive">Executive — 2 999 €</option>
                  </select>
                </label>
              </div>
              <div className={styles.formRow}>
                <label>
                  <span>Pays d'origine</span>
                  <input
                    list="dl-countries"
                    value={form.sourceCountry}
                    onChange={(e) => set("sourceCountry", e.target.value)}
                    placeholder="Chine, EAU, France…"
                  />
                </label>
                <label>
                  <span>Pays de destination</span>
                  <input
                    list="dl-countries"
                    value={form.destCountry}
                    onChange={(e) => set("destCountry", e.target.value)}
                    placeholder="Côte d'Ivoire, Sénégal…"
                  />
                </label>
              </div>
              <div className={styles.formRow}>
                <label>
                  <span>Type de véhicule</span>
                  <input
                    list="dl-vehicle-types"
                    value={form.vehicleType}
                    onChange={(e) => set("vehicleType", e.target.value)}
                    placeholder="SUV, berline, camion…"
                  />
                </label>
                <label>
                  <span>Budget estimé (€)</span>
                  <input type="number" min="0" value={form.budget} onChange={(e) => set("budget", e.target.value)} placeholder="15 000" />
                </label>
              </div>
              <label className={styles.formFull}>
                <span>Marque &amp; modèle recherché</span>
                <input value={form.vehicleMake} onChange={(e) => set("vehicleMake", e.target.value)} placeholder="Toyota Land Cruiser, BYD Atto 3…" />
              </label>
              <label className={styles.formFull}>
                <span>Message / précisions</span>
                <textarea rows={3} value={form.message} onChange={(e) => set("message", e.target.value)} placeholder="Décrivez votre besoin en détail…" />
              </label>

              {error && <p className={styles.formError}>❌ {error}</p>}

              <button type="submit" className={styles.primaryBtn} disabled={sending}>
                {sending ? "Envoi en cours..." : "Envoyer ma demande →"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

const ImportExport = () => {
  const [showModal, setShowModal] = useState(false);
  const [modalPack, setModalPack] = useState("Silver");

  const openModal = (pack = "Silver") => { setModalPack(pack); setShowModal(true); };

  return (
  <div className={styles.page}>

    {/* ── HERO ── */}
    <section className={styles.hero}>
      <div className={styles.heroBubble1} />
      <div className={styles.heroBubble2} />
      <div className={styles.heroGlobe} />
      <div className={styles.heroContent}>
        <span className={styles.heroBadge}>🌍 IMPORT / EXPORT INTERNATIONAL</span>
        <h1>La passerelle automobile<br />entre l'Afrique, l'Europe,<br />l'Asie & le Moyen-Orient</h1>
        <p>
          Achetez, vendez, importez ou exportez un véhicule partout dans le monde.
          VIT AUTO gère tout : recherche, inspection, transport, dédouanement et livraison.
        </p>
        <div className={styles.heroBtns}>
          <button className={styles.primaryBtn} onClick={() => openModal()}>Demander un devis gratuit</button>
          <Link className={styles.secondaryBtn} to="/import-export/listings">Voir les annonces disponibles →</Link>
        </div>
      </div>
    </section>

    {/* ── PAYS COUVERTS ── */}
    <section className={styles.countriesBar}>
      <div className={styles.countriesInner}>
        <span className={styles.countriesLabel}>Couverture mondiale :</span>
        <div className={styles.countriesScroll}>
          {COUNTRIES.map((c) => (
            <div key={c.name} className={styles.countryChip}>
              <span>{c.flag}</span>
              <span>{c.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* ── ZONES GÉOGRAPHIQUES ── */}
    <section className={styles.zonesSection}>
      <div className={styles.inner}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTag}>🌐 ZONES STRATÉGIQUES</span>
          <h2>Des marchés clés, un seul service</h2>
          <p>VIT AUTO opère sur les 5 grands bassins du commerce automobile international.</p>
        </div>
        <div className={styles.zonesGrid}>
          {ZONES.map((z) => (
            <div key={z.label} className={styles.zoneCard} style={{ borderColor: z.border || z.color + "33" }}>
              <div className={styles.zoneHeader} style={{ background: z.bg }}>
                <span className={styles.zoneFlag}>{z.flag}</span>
                <span className={styles.zoneName} style={{ color: z.color }}>{z.label}</span>
              </div>
              <p className={styles.zoneDesc}>{z.desc}</p>
              <div className={styles.zoneTags}>
                {z.tags.map((t) => (
                  <span key={t} className={styles.zoneTag} style={{ color: z.color, background: z.bg }}>
                    {t}
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
          <span className={styles.sectionTag}>⚡ PROCESSUS</span>
          <h2>De la recherche à la livraison</h2>
          <p>Un accompagnement clé en main en 7 étapes pour votre importation ou exportation.</p>
        </div>
        <div className={styles.stepsGrid}>
          {STEPS.map((s, i) => (
            <div key={s.num} className={styles.stepCard}>
              <div className={styles.stepNumBadge}>{s.num}</div>
              {i < STEPS.length - 1 && <div className={styles.stepArrow}>→</div>}
              <div className={styles.stepIcon}>{s.icon}</div>
              <h4 className={styles.stepTitle}>{s.title}</h4>
              <p className={styles.stepDesc}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* ── PACKS IMPORT ASSIST ── */}
    <section className={styles.packsSection} id="packs">
      <div className={styles.inner}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTag}>🚀 IMPORT ASSIST</span>
          <h2>Choisissez votre niveau d'accompagnement</h2>
          <p>Des packs conciergerie automobile adaptés à chaque besoin, du simple achat à la gestion complète.</p>
        </div>
        <div className={styles.packsGrid}>
          {PACKS.map((p) => (
            <div
              key={p.name}
              className={`${styles.packCard} ${p.popular ? styles.packPopular : ""}`}
              style={{ borderColor: p.border }}
            >
              {p.popular && <div className={styles.popularBadge}>⭐ Plus populaire</div>}
              <div className={styles.packTop} style={{ background: p.accent }}>
                <span className={styles.packName} style={{ color: p.color }}>{p.name}</span>
                <span className={styles.packPrice}>{p.price}</span>
                <span className={styles.packPriceSub}>pack unique</span>
              </div>
              <ul className={styles.packFeatures}>
                {p.items.map((item) => (
                  <li key={item}>
                    <span className={styles.packCheck} style={{ color: p.color }}>✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <button
                className={styles.packBtn}
                style={{ background: p.color, boxShadow: `0 4px 16px ${p.color}33` }}
                onClick={() => openModal(p.name)}
              >
                Choisir {p.name} →
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
          <span className={styles.sectionTag}>💰 TARIFICATION</span>
          <h2>Transparent & compétitif</h2>
          <p>Des frais clairs sur chaque transaction internationale.</p>
        </div>
        <div className={styles.econGrid}>
          {/* Commissions */}
          <div className={styles.econCard}>
            <div className={styles.econCardHeader}>
              <span className={styles.econIcon}>📊</span>
              <h3>Commission sur transaction</h3>
            </div>
            <table className={styles.econTable}>
              <thead>
                <tr>
                  <th>Valeur du véhicule</th>
                  <th>Commission</th>
                  <th>Frais acheteur</th>
                </tr>
              </thead>
              <tbody>
                {COMMISSIONS.map((c) => (
                  <tr key={c.range}>
                    <td>{c.range}</td>
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
              <h3>Services additionnels</h3>
            </div>
            <div className={styles.servicesList}>
              {[
                { label: "Inspection standard",    price: "79 €" },
                { label: "Inspection premium",     price: "199 €" },
                { label: "Expertise complète",     price: "399 €" },
                { label: "Transport international", price: "5–15 % marge" },
                { label: "Assurance partenaire",   price: "10–25 % comm." },
                { label: "Crédit auto",            price: "100–2 000 €/dossier" },
              ].map((s) => (
                <div key={s.label} className={styles.servicesRow}>
                  <span className={styles.servicesLabel}>{s.label}</span>
                  <span className={styles.servicesPrice}>{s.price}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </section>

    {/* ── TARIFICATION TRANSPARENTE ── */}
    <section className={styles.pricingSection}>
      <div className={styles.inner}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTag}>💶 TARIFICATION TRANSPARENTE</span>
          <h2>Des prix clairs, sans surprises</h2>
          <p>Nous affichons nos tarifs publiquement. Vous savez exactement ce que vous payez avant de commencer.</p>
        </div>

        <div className={styles.pricingGrid}>

          {/* Import Assist */}
          <div className={styles.pricingCard}>
            <div className={styles.pricingCardHeader} style={{ background: "rgba(99,102,241,.08)", borderColor: "rgba(99,102,241,.18)" }}>
              <span className={styles.pricingIcon}>🚘</span>
              <h3 style={{ color: "#6366f1" }}>Import Assist</h3>
              <p>Accompagnement à l'achat international</p>
            </div>
            <table className={styles.pricingTable}>
              <thead>
                <tr><th>Formule</th><th>Prix</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td><span className={styles.pricingTier} style={{ color: "#94a3b8" }}>Silver</span></td>
                  <td className={styles.pricingPrice}>À partir de <strong>299 €</strong></td>
                </tr>
                <tr>
                  <td><span className={styles.pricingTier} style={{ color: "#f59e0b" }}>Gold</span></td>
                  <td className={styles.pricingPrice}>À partir de <strong>599 €</strong></td>
                </tr>
                <tr>
                  <td><span className={styles.pricingTier} style={{ color: "#6366f1" }}>Platinum</span></td>
                  <td className={styles.pricingPrice}><strong>Sur devis</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Inspection */}
          <div className={styles.pricingCard}>
            <div className={styles.pricingCardHeader} style={{ background: "rgba(16,185,129,.08)", borderColor: "rgba(16,185,129,.18)" }}>
              <span className={styles.pricingIcon}>🔬</span>
              <h3 style={{ color: "#10b981" }}>Inspection</h3>
              <p>Vérification technique avant achat</p>
            </div>
            <table className={styles.pricingTable}>
              <thead>
                <tr><th>Service</th><th>Prix</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td><span className={styles.pricingTier} style={{ color: "#10b981" }}>Standard</span></td>
                  <td className={styles.pricingPrice}>À partir de <strong>79 €</strong></td>
                </tr>
                <tr>
                  <td><span className={styles.pricingTier} style={{ color: "#10b981" }}>Premium</span></td>
                  <td className={styles.pricingPrice}>À partir de <strong>199 €</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Livraison */}
          <div className={styles.pricingCard}>
            <div className={styles.pricingCardHeader} style={{ background: "rgba(245,158,11,.08)", borderColor: "rgba(245,158,11,.18)" }}>
              <span className={styles.pricingIcon}>🚢</span>
              <h3 style={{ color: "#f59e0b" }}>Livraison</h3>
              <p>Transport du pays source jusqu'à vous</p>
            </div>
            <table className={styles.pricingTable}>
              <thead>
                <tr><th>Service</th><th>Prix</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td><span className={styles.pricingTier} style={{ color: "#f59e0b" }}>Nationale</span></td>
                  <td className={styles.pricingPrice}><strong>Sur devis</strong></td>
                </tr>
                <tr>
                  <td><span className={styles.pricingTier} style={{ color: "#f59e0b" }}>Internationale</span></td>
                  <td className={styles.pricingPrice}><strong>Sur devis</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

        </div>

        <p className={styles.pricingNote}>
          * Les prix varient selon le pays d'origine, le volume et les options choisies.
          Demandez un devis personnalisé — réponse sous 24h.
        </p>
      </div>
    </section>

    {/* ── ABONNEMENTS PROS ── */}
    <section className={styles.subsSection}>
      <div className={styles.inner}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTag}>🏢 PROFESSIONNELS</span>
          <h2>Abonnements pour vendeurs & importateurs</h2>
          <p>Concessionnaires, garages et importateurs : gérez vos annonces à l'international.</p>
        </div>
        <div className={styles.subsGrid}>
          {PLANS.map((p) => (
            <div key={p.name} className={`${styles.subCard} ${p.highlight ? styles.subHighlight : ""}`}>
              <h4 className={styles.subName}>{p.name}</h4>
              <div className={styles.subPrice}>{p.price}</div>
              <ul className={styles.subFeatures}>
                {p.features.map((f) => <li key={f}><span>✓</span>{f}</li>)}
              </ul>
              <Link to="/plans" className={`${styles.subBtn} ${p.highlight ? styles.subBtnPrimary : ""}`}>
                Commencer →
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
            <span className={styles.sectionTag}>🔩 NOUVELLE ACTIVITÉ</span>
            <h2>Pièces détachées internationales</h2>
            <p>
              Importation depuis la Chine, Dubaï et l'Europe. Distribution en Afrique de l'Ouest et au Maghreb.
              Moteurs, carrosserie, pneumatiques, batteries, accessoires.
            </p>
            <button className={styles.primaryBtn} onClick={() => openModal("Silver")}>Demander un catalogue</button>
          </div>
          <div className={styles.partsCategories}>
            {["⚙️ Moteurs", "🚗 Carrosserie", "🔋 Batteries & VE", "🛞 Pneumatiques", "🔧 Accessoires", "💡 Électronique"].map((c) => (
              <div key={c} className={styles.partChip}>{c}</div>
            ))}
          </div>
        </div>
      </div>
    </section>

    {/* ── PARTENAIRES STRATÉGIQUES ── */}
    <section className={styles.partnersSection}>
      <div className={styles.inner}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTag}>🤝 ÉCOSYSTÈME</span>
          <h2>Nos partenaires stratégiques</h2>
          <p>Un réseau solide pour garantir chaque étape de votre transaction internationale.</p>
        </div>
        <div className={styles.partnersGrid}>
          {PARTNERS.map((p) => (
            <div key={p.label} className={styles.partnerChip}>
              <span className={styles.partnerIcon}>{p.icon}</span>
              <span>{p.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* ── CTA FINAL ── */}
    <section className={styles.ctaSection}>
      <div className={styles.ctaInner}>
        <div className={styles.ctaBubble} />
        <span className={styles.ctaTag}>🌍 COMMENCEZ MAINTENANT</span>
        <h2>Votre prochain véhicule, de n'importe où dans le monde</h2>
        <p>
          Contactez notre équipe pour un devis personnalisé. Import depuis la Chine, Dubaï, l'Europe —
          livraison en Afrique ou partout ailleurs.
        </p>
        <div className={styles.ctaBtns}>
          <button className={styles.primaryBtn} onClick={() => openModal()}>Demander un devis gratuit</button>
          <Link className={styles.ghostBtn} to="/importer-apply">Devenir partenaire importateur →</Link>
        </div>
      </div>
    </section>

    {showModal && <RequestModal defaultPack={modalPack} onClose={() => setShowModal(false)} />}
  </div>
  );
};

export default ImportExport;
