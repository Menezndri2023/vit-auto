import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { useSocket } from "../context/SocketContext";
import { Link, useNavigate } from "react-router-dom";
import styles from "./AdminPanel.module.css";
import { ListingForm as IEListingEditForm } from "./ImporterDashboard";
import { COUNTRIES_ALL, CURRENCIES as IE_CURRENCIES, getCountryFlag } from "../data/autocomplete";
import { INCOTERMS as IE_LISTING_INCOTERMS } from "../constants/incoterms";
import { PARTNER_CANCEL_REASONS } from "../constants/bookingCancelReasons";

// Drapeau pays — reconnaissance rapide du pays d'un partenaire/client par
// l'admin, à partir du code ISO stocké sur User/Vehicle/Driver (voir
// CurrencyContext.COUNTRIES_CONFIG pour la liste des pays supportés).
const CountryFlag = ({ code, countriesConfig }) => {
  if (!code) return null;
  const c = countriesConfig.find((x) => x.code === code);
  if (!c) return null;
  return <span title={c.name} style={{ marginLeft: 6 }}>{c.flag}</span>;
};

// ─── Utilitaires ───────────────────────────────────────────────────────────────
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const timeAgo = (d) => {
  if (!d) return "";
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  if (m < 1)  return "à l'instant";
  if (m < 60) return `${m}min`;
  if (h < 24) return `${h}h`;
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
};
const MOIS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
const PLAN_TIER_LABELS = { individuel_plus: "Individuel Plus", business: "Business", exportateur: "Exportateur" };
// Sanitise une URL avant de l'utiliser dans href (bloque javascript: et autres schémas dangereux)
const safeHref = (url) => {
  if (!url) return "#";
  const s = String(url).trim();
  if (/^(https?|mailto):/i.test(s)) return s;
  return "#";
};
// Version pour les images : autorise aussi les data:image/... (KYC documents stockés en base64)
const safeImgHref = (url) => {
  if (!url) return "#";
  const s = String(url).trim();
  if (/^(https?|data:image\/)/.test(s)) return s;
  return "#";
};

const ROLE_CONFIG = {
  client:     { label: "Client",     color: "#3b82f6", bg: "#eff6ff" },
  partenaire: { label: "Partenaire", color: "#10b981", bg: "#ecfdf5" },
  admin:      { label: "Admin",      color: "#f59e0b", bg: "#fffbeb" },
  chauffeur:  { label: "Chauffeur",  color: "#8b5cf6", bg: "#f5f3ff" },
};

const KYC_CFG = {
  VERIFIE:               { label: "✅ Vérifié",    color: "#16a34a", bg: "#dcfce7" },
  EN_ATTENTE:            { label: "⏳ Attente",    color: "#d97706", bg: "#fef3c7" },
  REFUSE:                { label: "❌ Refusé",     color: "#dc2626", bg: "#fee2e2" },
  A_REVOIR_MANUELLEMENT: { label: "🔍 À revoir",  color: "#7c3aed", bg: "#ede9fe" },
};

const CERTIF_CFG = {
  premium:   { label: "⭐ Premium",   color: "#7c3aed", bg: "#ede9fe" },
  fondateur: { label: "🏆 Fondateur", color: "#d97706", bg: "#fef3c7" },
  verifie:   { label: "🟢 Vérifié",  color: "#16a34a", bg: "#dcfce7" },
};

// Champs texte + documents soumis par niveau de certification partenaire (voir
// server/models/PartnerCertification.js) — utilisé pour afficher à l'admin ce que
// le partenaire a réellement soumis avant qu'il approuve/refuse un niveau (avant ce
// mapping, le modal d'examen ne montrait que le statut, jamais les données/documents).
const CERT_LEVEL_FIELDS = {
  1: {
    docs: [
      { key: "registrationDoc",  label: "Registre de commerce" },
      { key: "taxDoc",           label: "Attestation fiscale" },
      { key: "addressProofDoc",  label: "Justificatif d'adresse" },
    ],
    fields: [
      { key: "companyName",        label: "Société" },
      { key: "legalForm",          label: "Forme juridique" },
      { key: "country",            label: "Pays" },
      { key: "registrationType",   label: "Type d'immatriculation" },
      { key: "registrationNumber", label: "N° d'immatriculation" },
      { key: "taxId",              label: "N° fiscal" },
      { key: "officialAddress",    label: "Adresse" },
      { key: "city",               label: "Ville" },
      { key: "website",            label: "Site web" },
      { key: "businessEmail",      label: "Email pro" },
    ],
  },
  2: {
    docs: [
      { key: "idFrontDoc",  label: "Pièce d'identité — recto" },
      { key: "idBackDoc",   label: "Pièce d'identité — verso" },
      { key: "selfieDoc",   label: "Selfie" },
      { key: "profCardDoc", label: "Carte professionnelle" },
    ],
    fields: [
      { key: "repFirstName",   label: "Prénom" },
      { key: "repLastName",    label: "Nom" },
      { key: "repFunction",    label: "Fonction" },
      { key: "repIdType",      label: "Type de pièce" },
      { key: "repIdNumber",    label: "N° de pièce" },
      { key: "hasProfCard",    label: "Carte professionnelle", bool: true },
      { key: "videoCallDone",  label: "Appel vidéo effectué",  bool: true },
      { key: "videoCallDate",  label: "Date appel vidéo",      date: true },
    ],
  },
  3: {
    docs: [],
    fields: [
      { key: "yearsExperience",   label: "Années d'expérience" },
      { key: "exportCountries",   label: "Pays d'export",           list: true },
      { key: "monthlyVolume",     label: "Volume mensuel" },
      { key: "portsUsed",         label: "Ports utilisés",          list: true },
      { key: "paymentMethods",    label: "Moyens de paiement",      list: true },
      { key: "averageDelay",      label: "Délai moyen" },
      { key: "activityTypes",     label: "Types d'activité",        list: true },
      { key: "vehicleCategories", label: "Catégories de véhicules", list: true },
    ],
  },
  4: {
    docs: [{ key: "bankDoc", label: "Relevé bancaire / RIB" }],
    fields: [
      { key: "bankName",      label: "Banque" },
      { key: "accountHolder", label: "Titulaire du compte" },
      { key: "iban",          label: "IBAN" },
      { key: "swift",         label: "SWIFT" },
      { key: "bankCountry",   label: "Pays de la banque" },
    ],
  },
  5: {
    docs: [
      { key: "grayCardDoc", label: "Carte grise" },
      { key: "photoDoc",    label: "Photo du véhicule" },
      { key: "invoiceDoc",  label: "Facture d'achat" },
    ],
    fields: [
      { key: "make",          label: "Marque" },
      { key: "model",         label: "Modèle" },
      { key: "year",          label: "Année" },
      { key: "vin",           label: "VIN" },
      { key: "mileage",       label: "Kilométrage" },
      { key: "hasVideo",      label: "Vidéo fournie",          bool: true },
      { key: "hasInspection", label: "Rapport d'inspection",   bool: true },
      { key: "hasHistory",    label: "Historique fourni",      bool: true },
    ],
  },
  6: {
    docs: [{ key: "sampleDoc", label: "Exemple de document export" }],
    fields: [
      { key: "canProvideProforma",         label: "Facture proforma",        bool: true },
      { key: "canProvideCommercialInvoice",label: "Facture commerciale",     bool: true },
      { key: "canProvidePackingList",      label: "Packing list",            bool: true },
      { key: "canProvideBillOfLading",     label: "Connaissement (B/L)",     bool: true },
      { key: "canProvideOriginCert",       label: "Certificat d'origine",    bool: true },
      { key: "canProvideInspectionCert",   label: "Certificat d'inspection", bool: true },
      { key: "canProvideCustomsDocs",      label: "Documents douaniers",     bool: true },
    ],
  },
  7: {
    docs: [],
    fields: [
      { key: "agreedToGCU",       label: "CGU acceptées",              bool: true },
      { key: "agreedToCharte",    label: "Charte acceptée",            bool: true },
      { key: "agreedToAntifraud", label: "Engagement anti-fraude",     bool: true },
      { key: "agreedToDelays",    label: "Engagement délais",          bool: true },
      { key: "agreedToDataProt",  label: "Protection des données",     bool: true },
      { key: "agreedToRefund",    label: "Politique de remboursement", bool: true },
      { key: "signedAt",          label: "Signé le",                   date: true },
      { key: "signerIp",          label: "IP de signature" },
    ],
  },
};

const fmtCertField = (f, v) => {
  if (v === null || v === undefined || v === "") return "—";
  if (f.bool) return v ? "✅ Oui" : "❌ Non";
  if (f.date) return new Date(v).toLocaleString("fr-FR");
  if (f.list) return Array.isArray(v) && v.length ? v.join(", ") : "—";
  return String(v);
};

// ── Documents soumis pour un niveau de certification (image + lien plein écran,
// même pattern que les documents Partner Verification / Import-Export) ──────────
function CertLevelDocs({ level, lv }) {
  const cfg = CERT_LEVEL_FIELDS[level];
  if (!cfg) return null;
  const hasFields = cfg.fields.some((f) => lv?.[f.key] !== undefined && lv?.[f.key] !== null && lv?.[f.key] !== "");
  if (!hasFields && cfg.docs.length === 0) return null;

  return (
    <div style={{ marginTop: 10 }}>
      {hasFields && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px,1fr))", gap: "4px 14px",
          background: "#f8fafc", borderRadius: 8, padding: "10px 12px",
          marginBottom: cfg.docs.length ? 10 : 0, fontSize: ".78rem",
        }}>
          {cfg.fields.map((f) => (
            <div key={f.key}><span style={{ color: "#94a3b8" }}>{f.label} </span><strong style={{ color: "#0f1b3f" }}>{fmtCertField(f, lv?.[f.key])}</strong></div>
          ))}
        </div>
      )}
      {cfg.docs.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: 10 }}>
          {cfg.docs.map(({ key, label }) => {
            const doc = lv?.[key];
            return (
              <div key={key} style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
                <div style={{ fontSize: ".68rem", fontWeight: 700, color: "#64748b", padding: "5px 8px", background: "#f1f5f9", textTransform: "uppercase", letterSpacing: ".03em" }}>{label}</div>
                {doc?.data ? (
                  <a href={safeImgHref(doc.data)} target="_blank" rel="noreferrer noopener">
                    <img src={doc.data} alt={label} loading="lazy" decoding="async" style={{ width: "100%", height: 90, objectFit: "cover", display: "block" }}
                      onError={(e) => { e.target.parentElement.innerHTML = '<div style="height:90px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:.72rem;padding:6px;text-align:center">Aperçu indisponible</div>'; }} />
                  </a>
                ) : (
                  <div style={{ height: 60, display: "flex", alignItems: "center", justifyContent: "center", color: "#cbd5e1", fontSize: ".72rem" }}>Non fourni</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Documents légaux + médias plateforme soumis lors de l'onboarding Founding Partner
// (voir server/models/PartnerOnboarding.js — legalDocs/platformMedia) — jusqu'ici
// jamais rendus dans le détail admin, qui n'affichait que les métadonnées LOI/Accord.
const FOUNDING_LEGAL_DOCS = [
  { key: "businessRegistration", label: "Registre de commerce" },
  { key: "businessLicense",      label: "Licence commerciale" },
  { key: "exportLicense",        label: "Licence d'export" },
  { key: "taxCertificate",       label: "Certificat fiscal" },
  { key: "proofOfAddress",       label: "Justificatif d'adresse" },
];

const FOUNDING_PHOTO_GROUPS = [
  { key: "companyPhotos",   label: "Photos entreprise" },
  { key: "officePhotos",    label: "Photos bureaux" },
  { key: "showroomPhotos",  label: "Photos showroom" },
  { key: "warehousePhotos", label: "Photos entrepôt" },
  { key: "teamPhotos",      label: "Photos équipe" },
];

const INDIVIDUAL_DOC_TYPE_LABELS = { cni: "Carte Nationale d'Identité", passeport: "Passeport", autre: "Autre document justificatif" };

function FoundingDocs({ o }) {
  const isIndividual = o.legalEntityType === "particulier";
  const legal = o.legalDocs || {};
  const media = o.platformMedia || {};
  const individualDoc = o.individualDoc || {};
  const hasLegal = FOUNDING_LEGAL_DOCS.some((d) => legal[d.key]);
  const hasMedia = !!media.logo || FOUNDING_PHOTO_GROUPS.some((g) => media[g.key]?.length) || !!media.promotionalVideo;
  const hasIndividualDoc = !!individualDoc.file;

  if (isIndividual) {
    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: ".72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>
          🧑 Pièce justificative (partenaire particulier)
        </div>
        {hasIndividualDoc ? (
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", background: "#fff", maxWidth: 200 }}>
            <div style={{ fontSize: ".68rem", fontWeight: 700, color: "#64748b", padding: "5px 8px", background: "#f1f5f9", textTransform: "uppercase", letterSpacing: ".03em" }}>
              {INDIVIDUAL_DOC_TYPE_LABELS[individualDoc.type] || "Pièce justificative"}
            </div>
            <a href={safeImgHref(individualDoc.file)} target="_blank" rel="noreferrer noopener">
              <img src={individualDoc.file} alt="Pièce justificative" loading="lazy" decoding="async" style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }}
                onError={(e) => { e.target.parentElement.innerHTML = '<div style="height:120px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:.72rem;padding:6px;text-align:center">Aperçu indisponible</div>'; }} />
            </a>
          </div>
        ) : (
          <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 10, padding: "10px 14px", fontSize: ".8rem", color: "#dc2626" }}>
            ⚠️ Aucune pièce justificative soumise par ce partenaire particulier.
          </div>
        )}
      </div>
    );
  }

  if (!hasLegal && !hasMedia) {
    return (
      <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 10, padding: "10px 14px", marginTop: 12, fontSize: ".8rem", color: "#dc2626" }}>
        ⚠️ Aucun document légal ni média soumis par ce partenaire.
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      {hasLegal && (
        <div style={{ marginBottom: hasMedia ? 12 : 0 }}>
          <div style={{ fontSize: ".72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>📁 Documents légaux</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: 10 }}>
            {FOUNDING_LEGAL_DOCS.map(({ key, label }) => (
              <div key={key} style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
                <div style={{ fontSize: ".68rem", fontWeight: 700, color: "#64748b", padding: "5px 8px", background: "#f1f5f9", textTransform: "uppercase", letterSpacing: ".03em" }}>{label}</div>
                {legal[key] ? (
                  <a href={safeImgHref(legal[key])} target="_blank" rel="noreferrer noopener">
                    <img src={legal[key]} alt={label} loading="lazy" decoding="async" style={{ width: "100%", height: 90, objectFit: "cover", display: "block" }}
                      onError={(e) => { e.target.parentElement.innerHTML = '<div style="height:90px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:.72rem;padding:6px;text-align:center">Aperçu indisponible</div>'; }} />
                  </a>
                ) : (
                  <div style={{ height: 60, display: "flex", alignItems: "center", justifyContent: "center", color: "#cbd5e1", fontSize: ".72rem" }}>Non fourni</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {hasMedia && (
        <div>
          <div style={{ fontSize: ".72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>🖼️ Médias plateforme</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px,1fr))", gap: 8 }}>
            {media.logo && (
              <a href={safeImgHref(media.logo)} target="_blank" rel="noreferrer noopener" title="Logo">
                <img src={media.logo} alt="Logo" loading="lazy" decoding="async" style={{ width: "100%", height: 70, objectFit: "contain", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }} />
              </a>
            )}
            {FOUNDING_PHOTO_GROUPS.flatMap(({ key, label }) =>
              (media[key] || []).map((url, i) => (
                <a key={`${key}-${i}`} href={safeImgHref(url)} target="_blank" rel="noreferrer noopener" title={label}>
                  <img src={url} alt={label} loading="lazy" decoding="async" style={{ width: "100%", height: 70, objectFit: "cover", borderRadius: 8, border: "1px solid #e2e8f0" }} />
                </a>
              ))
            )}
          </div>
          {media.promotionalVideo && (
            <a href={safeHref(media.promotionalVideo)} target="_blank" rel="noreferrer noopener" style={{ display: "inline-block", marginTop: 8, fontSize: ".78rem", color: "#2563eb", textDecoration: "underline" }}>
              🎬 Voir la vidéo promotionnelle ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// Sections du dossier Founding Partner remplies par le partenaire mais jusqu'ici
// jamais rendues dans le détail admin (voir server/models/PartnerOnboarding.js —
// businessVerification/vehicleInventory/exportCapabilities/paymentInfo/
// commercialTerms) : seuls companyInfo, legalDocs et platformMedia l'étaient.
const ENTITY_TYPE_LABELS  = { factory: "Usine", dealer: "Concessionnaire", exporter: "Exportateur", importer: "Importateur", agent: "Agent" };
const VEHICLE_INV_LABELS  = { newVehicles: "Neufs", usedVehicles: "Occasion", electricVehicles: "Électriques", hybridVehicles: "Hybrides", luxuryVehicles: "Luxe", commercialVehicles: "Utilitaires" };
const INCOTERM_LABELS     = { exw: "EXW", fob: "FOB", cif: "CIF", dap: "DAP", ddp: "DDP" };
// Distinct de INCOTERM_LABELS ci-dessus (capacités déclaratives du Founding
// Partner à l'onboarding) — celui-ci couvre les 11 Incoterms 2020 épinglés
// sur une annonce ImportExportListing (voir src/constants/incoterms.js).
const ieListingIncotermLabel = (code) => IE_LISTING_INCOTERMS.find((i) => i.code === code)?.label || code;
const PAYMENT_MODE_LABELS = { wire_transfer: "Virement", lc: "Crédit documentaire", tt: "T/T", cash: "Espèces", escrow: "Séquestre" };

function InfoField({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: ".72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: ".82rem", color: "#0f1b3f" }}>{value ?? "—"}</div>
    </div>
  );
}

function TagList({ items, labels }) {
  if (!items?.length) return <span style={{ color: "#94a3b8" }}>—</span>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {items.map((v) => (
        <span key={v} style={{ fontSize: ".72rem", fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: "#eff6ff", color: "#1d4ed8" }}>
          {labels?.[v] || v}
        </span>
      ))}
    </div>
  );
}

function FoundingBusinessInfo({ o }) {
  const bv = o.businessVerification || {};
  const vi = o.vehicleInventory     || {};
  const ec = o.exportCapabilities   || {};
  const pi = o.paymentInfo          || {};
  const ct = o.commercialTerms      || {};

  const activeVehicleTypes = Object.entries(vi).filter(([, v]) => v).map(([k]) => k);
  const activeIncoterms    = Object.entries(ec.incoterms || {}).filter(([, v]) => v).map(([k]) => k);

  const hasAny = bv.companyPresentation || bv.brands?.length || bv.mainActivities?.length || bv.exportMarkets?.length
    || bv.entityTypes?.length || activeVehicleTypes.length || ec.shippingPorts?.length || activeIncoterms.length
    || pi.acceptedMethods?.length || pi.bankName || ct.paymentModes?.length || ct.deliveryDays || ct.depositPercentage;

  if (!hasAny) {
    return (
      <div style={{ background: "#fffbeb", border: "1.5px solid #fde68a", borderRadius: 10, padding: "10px 14px", marginTop: 12, fontSize: ".8rem", color: "#92400e" }}>
        ⚠️ Aucune information commerciale (activité, export, paiement, conditions) renseignée par ce partenaire.
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: ".72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>🏢 Vérification commerciale</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
          <InfoField label="Présentation" value={bv.companyPresentation} />
          <InfoField label="Années d'expérience" value={bv.yearsExperience || "—"} />
          <InfoField label="Capacité export annuelle" value={bv.annualExportCapacity} />
          <InfoField label="Autorisation OEM" value={bv.oemAuthorization} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginTop: 10 }}>
          <div>
            <div style={{ fontSize: ".72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Types d'entité</div>
            <TagList items={bv.entityTypes} labels={ENTITY_TYPE_LABELS} />
          </div>
          <div>
            <div style={{ fontSize: ".72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Marques représentées</div>
            <TagList items={bv.brands} />
          </div>
          <div>
            <div style={{ fontSize: ".72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Activités principales</div>
            <TagList items={bv.mainActivities} />
          </div>
          <div>
            <div style={{ fontSize: ".72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Marchés export</div>
            <TagList items={bv.exportMarkets} />
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: ".72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>🚗 Inventaire véhicules</div>
        <TagList items={activeVehicleTypes} labels={VEHICLE_INV_LABELS} />
      </div>

      <div>
        <div style={{ fontSize: ".72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>🚢 Capacités export</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
          <div>
            <div style={{ fontSize: ".72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Ports d'expédition</div>
            <TagList items={ec.shippingPorts} />
          </div>
          <div>
            <div style={{ fontSize: ".72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Méthodes d'expédition</div>
            <TagList items={ec.shippingMethods} />
          </div>
          <div>
            <div style={{ fontSize: ".72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Incoterms</div>
            <TagList items={activeIncoterms} labels={INCOTERM_LABELS} />
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: ".72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>💳 Paiement & conditions commerciales</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
          <InfoField label="Banque" value={pi.bankName} />
          <InfoField label="Devise préférée" value={pi.preferredCurrency} />
          <InfoField label="Quantité minimum" value={ct.minimumOrderQuantity} />
          <InfoField label="Acompte" value={ct.depositPercentage != null ? `${ct.depositPercentage}% (${ct.depositTiming || "—"})` : "—"} />
          <InfoField label="Délai de livraison" value={ct.deliveryDays ? `${ct.deliveryDays} jours` : "—"} />
          <InfoField label="Garantie" value={ct.warrantyAvailable == null ? "—" : ct.warrantyAvailable ? `${ct.warrantyMonths || "—"} mois` : "Non"} />
          <InfoField label="Inspection" value={ct.inspectionType ? `${ct.inspectionType}${ct.inspectionAgency ? " · " + ct.inspectionAgency : ""}` : "—"} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginTop: 10 }}>
          <div>
            <div style={{ fontSize: ".72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Méthodes de paiement acceptées</div>
            <TagList items={pi.acceptedMethods} />
          </div>
          <div>
            <div style={{ fontSize: ".72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Modes de paiement (transaction)</div>
            <TagList items={ct.paymentModes} labels={PAYMENT_MODE_LABELS} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Onglet Analytics avancé — construit entièrement à partir des données déjà
// collectées (Booking/IETransaction/User), voir server/controllers/analyticsController.js.
// Palette catégorielle fixe (jamais réordonnée selon les données affichées) et
// une seule mesure par graphique (jamais deux échelles sur le même axe).
const IE_STATUS_LABELS = {
  reserved: "Réservée", confirmed: "Confirmée", in_discussion: "Discussion",
  inspection_requested: "Inspection demandée", inspection_done: "Inspection faite",
  offer_sent: "Offre envoyée", offer_accepted: "Offre acceptée",
  payment_pending: "Paiement en attente", payment_submitted: "Paiement à vérifier",
  in_escrow: "En entiercement", preparing: "Préparation", shipped: "Expédiée",
  in_transit: "En transit", delivered: "Livrée", funds_released: "Fonds libérés",
  completed: "Terminée", disputed: "Litige", cancelled: "Annulée",
};

function MonthTrendChart({ data, valueKey, color, label, formatValue }) {
  const max = Math.max(1, ...data.map((d) => d[valueKey] || 0));
  const fmt = formatValue || ((v) => v.toLocaleString("fr-FR"));
  return (
    <div>
      <div style={{ fontSize: ".78rem", fontWeight: 700, color: "#64748b", marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 90 }}>
        {data.map((d) => {
          const v = d[valueKey] || 0;
          const h = Math.max(2, Math.round((v / max) * 100));
          const [y, m] = d.month.split("-");
          return (
            <div key={d.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }} title={`${m}/${y} — ${fmt(v)}`}>
              <div style={{ width: "100%", maxWidth: 22, height: `${h}%`, background: color, borderRadius: "4px 4px 0 0", minHeight: 2 }} />
              <span style={{ fontSize: ".6rem", color: "#94a3b8" }}>{m}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BreakdownList({ items, labelKey, valueKey, color, formatValue, labels }) {
  const max = Math.max(1, ...items.map((i) => i[valueKey] || 0));
  const fmt = formatValue || ((v) => v.toLocaleString("fr-FR"));
  if (!items.length) return <div style={{ color: "#94a3b8", fontSize: ".82rem" }}>Aucune donnée.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((i) => (
        <div key={i[labelKey]}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".78rem", marginBottom: 3 }}>
            <span style={{ color: "#0f1b3f", fontWeight: 600 }}>{labels?.[i[labelKey]] || i[labelKey]}</span>
            <span style={{ color: "#64748b" }}>{fmt(i[valueKey] || 0)}</span>
          </div>
          <MiniBar value={i[valueKey] || 0} max={max} color={color} />
        </div>
      ))}
    </div>
  );
}

function AnalyticsSection({ analytics, loading }) {
  if (loading && !analytics) {
    return <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Chargement…</div>;
  }
  if (!analytics) {
    return <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Aucune donnée disponible.</div>;
  }

  const totalBookings12mo = analytics.monthlyBookings.reduce((s, d) => s + d.count, 0);
  const totalRevenueByPrimaryCurrency = analytics.byCurrency[0];
  const totalNewUsers12mo = analytics.monthlyUsers.reduce((s, d) => s + d.count, 0);
  const activeIe = analytics.ieByStatus
    .filter((s) => !["completed", "cancelled"].includes(s.status))
    .reduce((s, d) => s + d.count, 0);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 14, marginBottom: "1.5rem" }}>
        <StatCard icon="📦" label="Réservations (12 mois)" value={totalBookings12mo} color="#6366f1" />
        <StatCard icon="💰" label={`CA réalisé (${totalRevenueByPrimaryCurrency?.currency || "—"})`}
          value={(totalRevenueByPrimaryCurrency?.total || 0).toLocaleString("fr-FR")} color="#10b981" />
        <StatCard icon="🧑‍🤝‍🧑" label="Nouveaux comptes (12 mois)" value={totalNewUsers12mo} color="#f59e0b" />
        <StatCard icon="🌍" label="Transactions I/E actives" value={activeIe} color="#0891b2" />
      </div>

      <div className={styles.chartCard} style={{ marginBottom: "1.5rem" }}>
        <h3 className={styles.chartTitle} style={{ marginBottom: 14 }}>📈 Tendances mensuelles (12 derniers mois)</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px,1fr))", gap: 24 }}>
          <MonthTrendChart data={analytics.monthlyBookings} valueKey="count" color="#6366f1" label="Volume de réservations" />
          <MonthTrendChart data={analytics.monthlyBookings} valueKey="revenue" color="#10b981" label="Chiffre d'affaires (toutes devises confondues)" />
          <MonthTrendChart data={analytics.monthlyUsers} valueKey="count" color="#f59e0b" label="Nouveaux comptes" />
          <MonthTrendChart data={analytics.ieMonthly} valueKey="count" color="#0891b2" label="Nouvelles transactions Import/Export" />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px,1fr))", gap: 20 }}>
        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle} style={{ marginBottom: 14 }}>💱 Chiffre d'affaires par devise</h3>
          <BreakdownList items={analytics.byCurrency} labelKey="currency" valueKey="total" color="#10b981" />
        </div>
        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle} style={{ marginBottom: 14 }}>🚗 Chiffre d'affaires par service</h3>
          <BreakdownList items={analytics.byType} labelKey="type" valueKey="total" color="#6366f1"
            labels={{ location: "Location", essai: "Vente", chauffeur: "Chauffeur", leasing: "Leasing" }} />
        </div>
        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle} style={{ marginBottom: 14 }}>🌍 Top pays (clients)</h3>
          <BreakdownList items={analytics.byCountry} labelKey="country" valueKey="total" color="#f59e0b" />
        </div>
        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle} style={{ marginBottom: 14 }}>📦 Pipeline Import/Export par statut</h3>
          <BreakdownList items={analytics.ieByStatus} labelKey="status" valueKey="count" color="#0891b2" labels={IE_STATUS_LABELS} formatValue={(v) => `${v}`} />
        </div>
      </div>
    </div>
  );
}

// ── Transport International — construit à partir de IETransaction.shipping,
// déjà collecté via le pipeline export 14 étapes (markShipped/updateTracking,
// voir ieTransactionController.js) mais jusqu'ici jamais affiché à l'admin :
// aucune nouvelle donnée, uniquement une vue dédiée sur les transactions déjà
// en logistique (aucun endpoint backend créé — réutilise ieTransactions,
// chargé sans filtre par loadIeTransactions).
const SHIPPING_TYPE_LABELS = { maritime: "🚢 Maritime", terrestre: "🚚 Terrestre", aerien: "✈️ Aérien" };

function TransportSection({ ieTransactions, loading }) {
  const inLogistics = ieTransactions.filter((t) => ["preparing", "shipped", "in_transit", "delivered"].includes(t.status));
  const counts = {
    preparing: inLogistics.filter((t) => t.status === "preparing").length,
    shipped:   inLogistics.filter((t) => t.status === "shipped").length,
    in_transit:inLogistics.filter((t) => t.status === "in_transit").length,
    delivered: inLogistics.filter((t) => t.status === "delivered").length,
  };

  if (loading) return <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Chargement…</div>;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 14, marginBottom: "1.5rem" }}>
        <StatCard icon="📦" label="En préparation" value={counts.preparing}  color="#f59e0b" />
        <StatCard icon="🚢" label="Expédiées"       value={counts.shipped}   color="#6366f1" />
        <StatCard icon="🌊" label="En transit"      value={counts.in_transit} color="#0891b2" />
        <StatCard icon="✅" label="Livrées"          value={counts.delivered} color="#10b981" />
      </div>

      {inLogistics.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>🚢</div>
          <p style={{ fontWeight: 600 }}>Aucune cargaison en cours d'acheminement.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Client</th><th>Partenaire</th><th>Transporteur</th><th>N° suivi</th><th>Type</th><th>Départ</th><th>Arrivée est.</th><th>Statut</th></tr>
            </thead>
            <tbody>
              {inLogistics.map((t) => {
                const st = { preparing: { l: "Préparation", c: "#f59e0b", bg: "#fef3c7" }, shipped: { l: "Expédiée", c: "#6366f1", bg: "#eef2ff" },
                  in_transit: { l: "En transit", c: "#0891b2", bg: "#ecfeff" }, delivered: { l: "Livrée", c: "#10b981", bg: "#d1fae5" } }[t.status];
                return (
                  <tr key={t._id} className={styles.tr}>
                    <td><strong style={{ fontSize: ".85rem" }}>{t.client?.firstName} {t.client?.lastName}</strong></td>
                    <td><strong style={{ fontSize: ".85rem" }}>{t.partner?.firstName} {t.partner?.lastName}</strong></td>
                    <td style={{ fontSize: ".82rem" }}>{t.shipping?.carrier || "—"}</td>
                    <td style={{ fontSize: ".82rem", fontFamily: "monospace" }}>{t.shipping?.trackingNumber || "—"}</td>
                    <td style={{ fontSize: ".82rem" }}>{SHIPPING_TYPE_LABELS[t.shipping?.shippingType] || "—"}</td>
                    <td className={styles.tdDate}>{fmtDate(t.shipping?.departureDate)}</td>
                    <td className={styles.tdDate}>{fmtDate(t.shipping?.estimatedArrival)}</td>
                    <td><Badge label={st.l} color={st.c} bg={st.bg} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Escrow / Séquestre — construit à partir de IETransaction.payment, déjà
// collecté via payEscrow/confirmEscrowPayment/releaseFunds (voir
// ieTransactionController.js) mais jusqu'ici jamais consolidé dans une vue
// financière dédiée pour l'admin.
function EscrowSection({ ieTransactions, loading }) {
  const held     = ieTransactions.filter((t) => t.status === "in_escrow");
  const released = ieTransactions.filter((t) => t.payment?.releasedAt);
  const totalHeld = held.reduce((s, t) => s + (t.payment?.amount || 0), 0);
  const thisMonth = new Date(); thisMonth.setDate(1); thisMonth.setHours(0, 0, 0, 0);
  const releasedThisMonth = released.filter((t) => new Date(t.payment.releasedAt) >= thisMonth)
    .reduce((s, t) => s + (t.payment?.amount || 0), 0);

  if (loading) return <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Chargement…</div>;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 14, marginBottom: "1.5rem" }}>
        <StatCard icon="🔐" label="Dossiers en séquestre" value={held.length} color="#0891b2" />
        <StatCard icon="💰" label="Total bloqué"          value={`${totalHeld.toLocaleString("fr-FR")}`} color="#f59e0b" />
        <StatCard icon="✅" label="Dossiers libérés"       value={released.length} color="#10b981" />
        <StatCard icon="📤" label="Libéré ce mois"         value={`${releasedThisMonth.toLocaleString("fr-FR")}`} color="#6366f1" />
      </div>

      {held.length === 0 && released.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>🔐</div>
          <p style={{ fontWeight: 600 }}>Aucun fonds en séquestre pour le moment.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Client</th><th>Partenaire</th><th>Montant</th><th>Méthode</th><th>Référence</th><th>Mis en séquestre le</th><th>Statut</th></tr>
            </thead>
            <tbody>
              {[...held, ...released.filter((t) => t.status !== "in_escrow")].map((t) => (
                <tr key={t._id} className={styles.tr}>
                  <td><strong style={{ fontSize: ".85rem" }}>{t.client?.firstName} {t.client?.lastName}</strong></td>
                  <td><strong style={{ fontSize: ".85rem" }}>{t.partner?.firstName} {t.partner?.lastName}</strong></td>
                  <td className={styles.tdPrice}>{(t.payment?.amount || 0).toLocaleString("fr-FR")} {t.payment?.currency}</td>
                  <td style={{ fontSize: ".82rem" }}>{t.payment?.method || "—"}</td>
                  <td style={{ fontSize: ".78rem", fontFamily: "monospace" }}>{t.payment?.escrowRef || t.payment?.transactionRef || "—"}</td>
                  <td className={styles.tdDate}>{fmtDate(t.payment?.paidAt)}</td>
                  <td>{t.payment?.releasedAt
                    ? <Badge label="Libéré" color="#10b981" bg="#d1fae5" />
                    : <Badge label="En séquestre" color="#0891b2" bg="#ecfeff" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Financement — demandes leasing/crédit (Booking type="leasing", voir
// server/models/Booking.js champ leasing.decision). Décision manuelle admin :
// aucune banque/société de leasing partenaire n'est intégrée pour l'instant
// (partie technique à raccorder plus tard).
const FINANCING_DECISION_CFG = {
  en_etude: { label: "🔍 En étude", color: "#d97706", bg: "#fef3c7" },
  accepte:  { label: "✅ Accepté",  color: "#10b981", bg: "#d1fae5" },
  refuse:   { label: "❌ Refusé",   color: "#dc2626", bg: "#fee2e2" },
};

function FinancingSection({ requests, loading, onDecide }) {
  const counts = {
    en_etude: requests.filter((r) => (r.leasing?.decision || "en_etude") === "en_etude").length,
    accepte:  requests.filter((r) => r.leasing?.decision === "accepte").length,
    refuse:   requests.filter((r) => r.leasing?.decision === "refuse").length,
  };

  if (loading) return <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Chargement…</div>;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 14, marginBottom: "1.5rem" }}>
        <StatCard icon="📋" label="Total demandes" value={requests.length}     color="#6366f1" />
        <StatCard icon="🔍" label="En étude"        value={counts.en_etude}    color="#d97706" />
        <StatCard icon="✅" label="Acceptées"       value={counts.accepte}     color="#10b981" />
        <StatCard icon="❌" label="Refusées"        value={counts.refuse}      color="#dc2626" />
      </div>

      {requests.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>🏦</div>
          <p style={{ fontWeight: 600 }}>Aucune demande de financement pour le moment.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Client</th><th>Véhicule</th><th>Produit</th><th>Apport</th><th>Mensualité</th><th>Durée</th><th>Taux</th><th>Décision</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const l  = r.leasing || {};
                const st = FINANCING_DECISION_CFG[l.decision || "en_etude"];
                return (
                  <tr key={r._id} className={styles.tr}>
                    <td><strong style={{ fontSize: ".85rem" }}>{r.client?.firstName} {r.client?.lastName}</strong><div style={{ fontSize: ".74rem", color: "#94a3b8" }}>{r.client?.email}</div></td>
                    <td style={{ fontSize: ".82rem" }}>{r.vehicle?.title || `${r.vehicle?.marque || ""} ${r.vehicle?.modele || ""}`.trim() || "—"}</td>
                    <td style={{ fontSize: ".82rem" }}>{l.financingType === "credit" ? "Crédit classique" : "Leasing (LOA)"}</td>
                    <td className={styles.tdPrice}>{(l.apportInitial || 0).toLocaleString("fr-FR")}</td>
                    <td className={styles.tdPrice}>{(l.mensualite || 0).toLocaleString("fr-FR")}</td>
                    <td style={{ fontSize: ".82rem" }}>{l.duree || "—"} mois</td>
                    <td style={{ fontSize: ".82rem" }}>{l.tauxInteret || "—"}%</td>
                    <td><Badge label={st.label} color={st.color} bg={st.bg} /></td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        {l.decision !== "accepte" && (
                          <button className={styles.btnRefresh} style={{ background: "#10b981", color: "#fff", border: "none" }}
                            onClick={() => onDecide({ id: r._id, decision: "accepte" })}>✅</button>
                        )}
                        {l.decision !== "refuse" && (
                          <button className={styles.btnRefresh} style={{ background: "#dc2626", color: "#fff", border: "none" }}
                            onClick={() => onDecide({ id: r._id, decision: "refuse" })}>❌</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Rôles & Permissions — permissions fines pour les comptes admin (voir
// server/middleware/auth.js requireAdminScope). adminScope=[] = accès complet
// (comportement historique) ; seules les routes nouvellement ajoutées avec
// requireAdminScope() vérifient réellement ces permissions pour l'instant —
// retrofit des routes admin existantes volontairement laissé pour plus tard
// (risque de régression trop élevé pour un rattrapage en une passe).
const ADMIN_SCOPE_CFG = [
  { key: "super_admin",   label: "Super Admin",       icon: "👑", desc: "Accès total, y compris gestion des permissions des autres admins." },
  { key: "finance",       label: "Finance",           icon: "💰", desc: "Paiements, commissions, factures, financement." },
  { key: "kyc",           label: "KYC",               icon: "🛡️", desc: "Identités et documents." },
  { key: "import_export", label: "Import/Export",     icon: "🌍", desc: "Dossiers internationaux." },
  { key: "support",       label: "Support",           icon: "🎧", desc: "Tickets clients." },
  { key: "moderation",    label: "Modérateur",        icon: "📝", desc: "Annonces et contenu." },
];

function RolesSection({ admins, loading, savingId, onToggle, currentUserId }) {
  if (loading) return <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Chargement…</div>;
  if (!admins.length) return <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Aucun compte admin.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {admins.map((a) => {
        const scope = a.adminScope || [];
        const isFullAccess = scope.length === 0 || scope.includes("super_admin");
        return (
          <div key={a._id} style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 12, padding: "14px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
              <div>
                <strong style={{ fontSize: ".9rem", color: "#0f1b3f" }}>{a.firstName} {a.lastName}</strong>
                {a._id === currentUserId && <span style={{ marginLeft: 8, fontSize: ".72rem", color: "#6366f1", fontWeight: 700 }}>(vous)</span>}
                <div style={{ fontSize: ".78rem", color: "#94a3b8" }}>{a.email}</div>
              </div>
              <span style={{ fontSize: ".74rem", fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: isFullAccess ? "#fef3c7" : "#eff6ff", color: isFullAccess ? "#b45309" : "#1d4ed8" }}>
                {isFullAccess ? "🔓 Accès complet" : `${scope.length} permission${scope.length > 1 ? "s" : ""}`}
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {ADMIN_SCOPE_CFG.map((s) => {
                const active = scope.includes(s.key);
                return (
                  <button key={s.key} title={s.desc} disabled={savingId === a._id}
                    onClick={() => onToggle(a._id, scope, s.key)}
                    style={{
                      padding: "6px 12px", borderRadius: 20, border: "1.5px solid",
                      borderColor: active ? "#6366f1" : "#e2e8f0",
                      background: active ? "#6366f1" : "#f8fafc",
                      color: active ? "#fff" : "#64748b",
                      fontWeight: 700, fontSize: ".78rem", cursor: savingId === a._id ? "wait" : "pointer",
                      opacity: savingId === a._id ? 0.6 : 1,
                    }}>
                    {s.icon} {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Publicités & Campagnes — le backend (server/models/Ad.js, controllers/
// adsController.js, routes/ads.js) existait déjà en entier (CRUD + tracking
// clics) mais n'était consommé par aucune interface, ni admin ni publique.
const AD_POSITION_LABELS = {
  featured_section: "Section vedette (accueil)",
  catalogue_top:    "Haut du catalogue",
  catalogue_mid:    "Milieu du catalogue",
  sidebar:          "Barre latérale",
};

const emptyAdForm = () => ({ title: "", description: "", image: "", link: "", linkLabel: "En savoir plus", position: "featured_section", active: true, priority: 0 });

function AdsSection({ ads, loading, form, setForm, saving, onSave, onToggle, onDelete }) {
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <button className={styles.btnRefresh} style={{ background: "#0f1b3f", color: "#fff", border: "none" }}
          onClick={() => setForm(emptyAdForm())}>
          + Nouvelle annonce
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Chargement…</div>
      ) : ads.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>📢</div>
          <p style={{ fontWeight: 600 }}>Aucune bannière/campagne pour le moment.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))", gap: 14 }}>
          {ads.map((ad) => (
            <div key={ad._id} style={{ border: `2px solid ${ad.active ? "#10b981" : "#e2e8f0"}`, borderRadius: 12, overflow: "hidden", background: "#fff" }}>
              {ad.image
                ? <img src={ad.image} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: 100, objectFit: "cover" }} onError={(e) => { e.target.style.display = "none"; }} />
                : <div style={{ height: 100, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2rem" }}>📢</div>}
              <div style={{ padding: "10px 12px" }}>
                <div style={{ fontSize: ".85rem", fontWeight: 700, color: "#0f1b3f" }}>{ad.title}</div>
                <div style={{ fontSize: ".74rem", color: "#94a3b8", marginBottom: 6 }}>{AD_POSITION_LABELS[ad.position] || ad.position}</div>
                <div style={{ fontSize: ".76rem", color: "#64748b", marginBottom: 8 }}>👁️ {ad.views || 0} vues · 🖱️ {ad.clicks || 0} clics</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setForm(ad)} style={{ flex: 1, padding: "5px 0", borderRadius: 8, border: "1.5px solid #e2e8f0", background: "#fff", cursor: "pointer", fontWeight: 700, fontSize: ".76rem" }}>✏️ Éditer</button>
                  <button onClick={() => onToggle(ad)} style={{ flex: 1, padding: "5px 0", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: ".76rem", background: ad.active ? "#fef3c7" : "#d1fae5", color: ad.active ? "#b45309" : "#047857" }}>
                    {ad.active ? "⏸️ Pause" : "▶️ Activer"}
                  </button>
                  <button onClick={() => onDelete(ad._id)} style={{ padding: "5px 10px", borderRadius: 8, border: "none", background: "#fee2e2", color: "#dc2626", cursor: "pointer", fontWeight: 700, fontSize: ".76rem" }}>🗑️</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <div className={styles.modalBackdrop} onClick={() => setForm(null)}>
          <div className={styles.rejectModal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h3>{form._id ? "✏️ Modifier l'annonce" : "+ Nouvelle annonce"}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "14px 0" }}>
              <input placeholder="Titre *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                style={{ padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              <textarea placeholder="Description (optionnel)" value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })}
                style={{ padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem", minHeight: 60, fontFamily: "inherit" }} />
              <input placeholder="URL de l'image" value={form.image || ""} onChange={(e) => setForm({ ...form, image: e.target.value })}
                style={{ padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              <input placeholder="Lien de redirection au clic" value={form.link || ""} onChange={(e) => setForm({ ...form, link: e.target.value })}
                style={{ padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              <input placeholder="Texte du bouton" value={form.linkLabel || ""} onChange={(e) => setForm({ ...form, linkLabel: e.target.value })}
                style={{ padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              <select value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })}
                style={{ padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }}>
                {Object.entries(AD_POSITION_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".85rem" }}>
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                Active immédiatement
              </label>
            </div>
            <div className={styles.rejectActions}>
              <button className={styles.btnAccept} onClick={onSave} disabled={saving}>{saving ? "Envoi…" : "Enregistrer"}</button>
              <button className={styles.btnSecondary} onClick={() => setForm(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Assurance — décision manuelle admin (aucun assureur partenaire intégré
// via API pour l'instant, voir server/models/InsuranceRequest.js).
const INSURANCE_TYPE_LABELS = { auto: "🚗 Auto", location: "🔑 Location", import_export: "🌍 Import/Export" };
const INSURANCE_STATUS_CFG = {
  pending:  { label: "🔍 En attente", color: "#d97706", bg: "#fef3c7" },
  approved: { label: "✅ Approuvée",  color: "#10b981", bg: "#d1fae5" },
  rejected: { label: "❌ Refusée",    color: "#dc2626", bg: "#fee2e2" },
};

function InsuranceSection({ requests, loading, onDecide }) {
  const counts = {
    pending:  requests.filter((r) => r.status === "pending").length,
    approved: requests.filter((r) => r.status === "approved").length,
    rejected: requests.filter((r) => r.status === "rejected").length,
  };

  if (loading) return <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Chargement…</div>;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 14, marginBottom: "1.5rem" }}>
        <StatCard icon="📋" label="Total demandes" value={requests.length}  color="#6366f1" />
        <StatCard icon="🔍" label="En attente"      value={counts.pending}  color="#d97706" />
        <StatCard icon="✅" label="Approuvées"      value={counts.approved} color="#10b981" />
        <StatCard icon="❌" label="Refusées"        value={counts.rejected} color="#dc2626" />
      </div>

      {requests.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>🔒</div>
          <p style={{ fontWeight: 600 }}>Aucune demande d'assurance pour le moment.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Client</th><th>Type</th><th>Véhicule</th><th>Durée</th><th>Notes</th><th>Statut</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const st = INSURANCE_STATUS_CFG[r.status];
                return (
                  <tr key={r._id} className={styles.tr}>
                    <td><strong style={{ fontSize: ".85rem" }}>{r.client?.firstName} {r.client?.lastName}</strong><div style={{ fontSize: ".74rem", color: "#94a3b8" }}>{r.client?.email}</div></td>
                    <td style={{ fontSize: ".82rem" }}>{INSURANCE_TYPE_LABELS[r.type] || r.type}</td>
                    <td style={{ fontSize: ".82rem" }}>{r.vehicle?.title || r.vehicleInfo || "—"}</td>
                    <td style={{ fontSize: ".82rem" }}>{r.coveragePeriodMonths} mois</td>
                    <td style={{ fontSize: ".78rem", color: "#64748b", maxWidth: 180 }}>{r.notes || "—"}</td>
                    <td><Badge label={st.label} color={st.color} bg={st.bg} /></td>
                    <td>
                      {r.status === "pending" && (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className={styles.btnRefresh} style={{ background: "#10b981", color: "#fff", border: "none" }}
                            onClick={() => onDecide({ id: r._id, status: "approved" })}>✅</button>
                          <button className={styles.btnRefresh} style={{ background: "#dc2626", color: "#fff", border: "none" }}
                            onClick={() => onDecide({ id: r._id, status: "rejected" })}>❌</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Demandes de services génériques (transport/transit/douanes/immatriculation/
// garantie/financement/change de devises) — décision manuelle admin, commission
// calculée à l'approbation depuis PricingConfig.services.<catégorie>.
const SVC_REQ_CATEGORY_LABELS = {
  transport: "🚢 Transport", transit: "🛃 Transit", douanes: "🏛️ Douanes",
  immatriculation: "🪪 Immatriculation", garantie: "🛡️ Garantie",
  financement: "🏦 Financement", change_devises: "💱 Change de devises",
};
const SVC_REQ_STATUS_CFG = {
  pending:  { label: "🔍 En attente", color: "#d97706", bg: "#fef3c7" },
  approved: { label: "✅ Approuvée",  color: "#10b981", bg: "#d1fae5" },
  rejected: { label: "❌ Refusée",    color: "#dc2626", bg: "#fee2e2" },
};

function ServiceRequestsSection({ requests, loading, category, onCategoryChange, onDecide }) {
  const counts = {
    pending:  requests.filter((r) => r.status === "pending").length,
    approved: requests.filter((r) => r.status === "approved").length,
    rejected: requests.filter((r) => r.status === "rejected").length,
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <select value={category} onChange={(e) => onCategoryChange(e.target.value)}
          style={{ padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }}>
          <option value="">Toutes les catégories</option>
          {Object.entries(SVC_REQ_CATEGORY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 14, marginBottom: "1.5rem" }}>
        <StatCard icon="📋" label="Total demandes" value={requests.length}  color="#6366f1" />
        <StatCard icon="🔍" label="En attente"      value={counts.pending}  color="#d97706" />
        <StatCard icon="✅" label="Approuvées"      value={counts.approved} color="#10b981" />
        <StatCard icon="❌" label="Refusées"        value={counts.rejected} color="#dc2626" />
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Chargement…</div>
      ) : requests.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>🧰</div>
          <p style={{ fontWeight: 600 }}>Aucune demande pour le moment.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Client</th><th>Catégorie</th><th>Véhicule</th><th>Détails</th><th>Notes</th><th>Statut</th><th>Devis / Commission</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const st = SVC_REQ_STATUS_CFG[r.status];
                const detailsStr = Object.entries(r.details || {}).filter(([, v]) => v !== "" && v != null).map(([k, v]) => `${k}: ${v}`).join(" · ");
                return (
                  <tr key={r._id} className={styles.tr}>
                    <td><strong style={{ fontSize: ".85rem" }}>{r.client?.firstName} {r.client?.lastName}</strong><div style={{ fontSize: ".74rem", color: "#94a3b8" }}>{r.client?.email}</div></td>
                    <td style={{ fontSize: ".82rem" }}>{SVC_REQ_CATEGORY_LABELS[r.category] || r.category}</td>
                    <td style={{ fontSize: ".82rem" }}>{r.vehicle?.title || r.vehicleInfo || "—"}</td>
                    <td style={{ fontSize: ".76rem", color: "#64748b", maxWidth: 200 }}>{detailsStr || "—"}</td>
                    <td style={{ fontSize: ".78rem", color: "#64748b", maxWidth: 160 }}>{r.notes || "—"}</td>
                    <td><Badge label={st.label} color={st.color} bg={st.bg} /></td>
                    <td style={{ fontSize: ".78rem" }}>
                      {r.quotedAmountUSD != null ? `$${r.quotedAmountUSD}` : "—"}
                      {r.commission?.amount != null && <div style={{ color: "#10b981" }}>Comm. ${r.commission.amount}</div>}
                    </td>
                    <td>
                      {r.status === "pending" && (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className={styles.btnRefresh} style={{ background: "#10b981", color: "#fff", border: "none" }}
                            onClick={() => onDecide({ id: r._id, status: "approved" })}>✅</button>
                          <button className={styles.btnRefresh} style={{ background: "#dc2626", color: "#fff", border: "none" }}
                            onClick={() => onDecide({ id: r._id, status: "rejected" })}>❌</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const STATUS_VEH = {
  approved: { label: "Publiée",     color: "#10b981", bg: "#ecfdf5" },
  pending:  { label: "En attente",  color: "#f59e0b", bg: "#fffbeb" },
  rejected: { label: "Rejetée",     color: "#ef4444", bg: "#fef2f2" },
};

const STATUS_BK = {
  "À confirmer":             { label: "Nouvelle",           color: "#f59e0b", bg: "#fffbeb" },
  pending:                   { label: "Nouvelle",           color: "#f59e0b", bg: "#fffbeb" },
  confirmed:                 { label: "Acceptée",           color: "#10b981", bg: "#ecfdf5" },
  preparing:                 { label: "En cours",           color: "#06b6d4", bg: "#ecfeff" },
  ready:                     { label: "Prête",              color: "#8b5cf6", bg: "#f5f3ff" },
  in_progress:               { label: "En route",           color: "#3b82f6", bg: "#eff6ff" },
  client_arrived:            { label: "Client arrivé",      color: "#0ea5e9", bg: "#e0f2fe" },
  client_absent:             { label: "Client absent",      color: "#dc2626", bg: "#fef2f2" },
  transaction_concluded:     { label: "Transaction",        color: "#16a34a", bg: "#dcfce7" },
  waiting_client_validation: { label: "Validation client",  color: "#d97706", bg: "#fef3c7" },
  completed:                 { label: "Terminée",           color: "#64748b", bg: "#f8fafc" },
  cancelled:                 { label: "Annulée",            color: "#ef4444", bg: "#fef2f2" },
  disputed:                  { label: "Litige",             color: "#dc2626", bg: "#fef2f2" },
};

// ─── Mini barre de graphique ────────────────────────────────────────────────────
function MiniBar({ value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className={styles.miniBarWrap}>
      <div className={styles.miniBar} style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

// ─── Carte de stat ──────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color }) {
  return (
    <div className={styles.statCard} style={{ borderTop: `4px solid ${color}` }}>
      <div className={styles.statIcon} style={{ background: color + "20", color }}>{icon}</div>
      <div className={styles.statBody}>
        <span className={styles.statValue}>{value}</span>
        <span className={styles.statLabel}>{label}</span>
        {sub && <span className={styles.statSub}>{sub}</span>}
      </div>
    </div>
  );
}

// ─── Badge rôle / statut ────────────────────────────────────────────────────────
function Badge({ label, color, bg }) {
  return <span className={styles.badge} style={{ color, background: bg }}>{label}</span>;
}

// ─── Modal confirmation ─────────────────────────────────────────────────────────
function ConfirmModal({ message, onConfirm, onCancel, danger }) {
  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
        <p className={styles.confirmMsg}>{message}</p>
        <div className={styles.confirmActions}>
          <button className={danger ? styles.btnDanger : styles.btnPrimary} onClick={onConfirm}>Confirmer</button>
          <button className={styles.btnGhost} onClick={onCancel}>Annuler</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
export default function AdminPanel() {
  const { user, isAuthenticated, token, logout } = useAuth();
  const { COUNTRIES_CONFIG, fmtUSD } = useCurrency();
  const { on: onSocket } = useSocket();
  const navigate = useNavigate();

  const [activeTab, setActiveTab]   = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 900);
  const isMobile = useRef(window.innerWidth <= 900);

  // Détecter le passage mobile/desktop et adapter la sidebar
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const handler = (e) => {
      isMobile.current = e.matches;
      setSidebarOpen(!e.matches);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  const [ieRequests, setIeRequests]       = useState([]);
  const [ieRequestsTotal, setIeRequestsTotal] = useState(0);
  const [ieRequestsLimit, setIeRequestsLimit] = useState(100);
  const [ieLoading,  setIeLoading]        = useState(false);
  const [ieActionSaving, setIeActionSaving] = useState(false);
  // Transactions IE réelles (pipeline escrow 14 étapes) — distinctes des
  // "requests" ci-dessus (demandes initiales étapes 1-3). Aucune interface
  // admin n'exposait auparavant les litiges ou l'inspection indépendante de
  // ce pipeline, alors que de l'argent réel y est bloqué en entiercement.
  const [ieTransactions, setIeTransactions] = useState([]);
  const [ieTxLoading,    setIeTxLoading]    = useState(false);
  const [ieTxModal,      setIeTxModal]      = useState(null); // { tx, mode: "dispute"|"inspection" }
  const [ieTxNote,       setIeTxNote]       = useState("");
  const [ieTxRelease,    setIeTxRelease]    = useState(true);
  const [ieTxSaving,     setIeTxSaving]     = useState(false);
  // Commissions & Factures
  const [commissions,      setCommissions]      = useState([]);
  const [commissionsStats, setCommissionsStats] = useState(null);
  const [invoices,         setInvoices]         = useState([]);
  const [invoicesStats,    setInvoicesStats]    = useState(null);
  const [invoiceLoading,   setInvoiceLoading]   = useState(false);
  const [invoiceYear,      setInvoiceYear]      = useState(new Date().getFullYear());
  const [invoiceMonth,     setInvoiceMonth]     = useState("");

  // Abonnements Pro / Boosts en attente de confirmation manuelle de paiement
  const [subRequests,      setSubRequests]      = useState([]);
  const [subLoading,       setSubLoading]       = useState(false);
  const [subActioning,     setSubActioning]     = useState(null);

  // Modération des avis clients
  const [reviewsList,      setReviewsList]      = useState([]);
  const [reviewsLoading,   setReviewsLoading]   = useState(false);
  const [reviewsFilter,    setReviewsFilter]    = useState(""); // "" | "true" | "false"
  const [reviewActioning,  setReviewActioning]  = useState(null);

  // Analytics avancé
  const [analytics,        setAnalytics]        = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  // Emails & livraison — voir commWebhookController.js pour l'origine des
  // statuts "bounced"/"complained" (webhook Resend, sans lequel un email
  // rejeté par le serveur destinataire restait indiscernable d'un email
  // réellement livré).
  const [emailStats,           setEmailStats]           = useState(null);
  const [emailFailures,        setEmailFailures]        = useState([]);
  const [emailDeliveryLoading, setEmailDeliveryLoading] = useState(false);

  // Financement (leasing/crédit)
  const [financingRequests, setFinancingRequests] = useState([]);
  const [financingLoading,  setFinancingLoading]  = useState(false);
  const [financingModal,    setFinancingModal]    = useState(null); // { id, decision }
  const [financingNote,     setFinancingNote]     = useState("");
  const [financingSaving,   setFinancingSaving]   = useState(false);

  // Rôles & Permissions
  const [adminAccounts,     setAdminAccounts]     = useState([]);
  const [rolesLoading,      setRolesLoading]      = useState(false);
  const [rolesSavingId,     setRolesSavingId]     = useState(null);

  // Publicités & Campagnes
  const [adsList,        setAdsList]        = useState([]);
  const [adsLoading,     setAdsLoading]     = useState(false);
  const [adForm,         setAdForm]         = useState(null); // objet en édition/création, null = fermé
  const [adSaving,       setAdSaving]       = useState(false);

  // Assurance
  const [insuranceList,    setInsuranceList]    = useState([]);
  const [costConfigs,      setCostConfigs]      = useState([]);
  const [laneRates,        setLaneRates]        = useState([]);
  const [importCostLoading, setImportCostLoading] = useState(false);
  const [costConfigForm,  setCostConfigForm]    = useState(null); // null = fermé, {} = nouveau, objet = édition
  const [laneForm,        setLaneForm]          = useState(null);
  const [insuranceLoading, setInsuranceLoading] = useState(false);
  const [insuranceModal,   setInsuranceModal]   = useState(null); // { id, status }
  // Reversements partenaire (suivi dû vs déjà versé — voir commissionLedger.js)
  const [payoutsList,      setPayoutsList]      = useState([]);
  const [payoutsTotal,     setPayoutsTotal]     = useState(0);
  const [payoutsPendingCount, setPayoutsPendingCount] = useState(0);
  const [payoutsLoading,   setPayoutsLoading]   = useState(false);
  const [payoutsFilter,    setPayoutsFilter]    = useState("pending");
  const [payoutMarkingId,  setPayoutMarkingId]  = useState(null);
  const [insurancePremium, setInsurancePremium] = useState("");
  const [insuranceNote,    setInsuranceNote]    = useState("");

  // Demandes de services génériques (transport/transit/douanes/immatriculation/
  // garantie/financement/change de devises) — voir server/models/ServiceRequest.js
  const [svcReqList,       setSvcReqList]       = useState([]);
  const [svcReqLoading,    setSvcReqLoading]    = useState(false);
  const [svcReqCategory,   setSvcReqCategory]   = useState("");
  const [svcReqModal,      setSvcReqModal]      = useState(null); // { id, status }
  const [svcReqAmount,     setSvcReqAmount]     = useState("");
  const [svcReqNote,       setSvcReqNote]       = useState("");
  const [svcReqSaving,     setSvcReqSaving]     = useState(false);

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
  const [servicesForm,     setServicesForm]     = useState(null);
  const [adsConfigForm,    setAdsConfigForm]    = useState(null);
  const [discountCampaigns, setDiscountCampaigns] = useState([]);
  const [discountForm,    setDiscountForm]      = useState(null); // objet en cours d'édition/création, ou null
  const [exchangeRates,    setExchangeRates]    = useState([]);
  const [countryConfigs,   setCountryConfigs]   = useState([]);
  const [rateForm,         setRateForm]         = useState(null); // null = fermé
  const [countryForm,      setCountryForm]      = useState(null);
  const [insuranceSaving,  setInsuranceSaving]  = useState(false);

  // Journal d'audit
  const [auditEntries,     setAuditEntries]     = useState([]);
  const [auditLoading,     setAuditLoading]     = useState(false);
  const [auditFacets,      setAuditFacets]      = useState({ actions: [], resources: [] });
  const [auditFilter,      setAuditFilter]      = useState({ action: "", resource: "", success: "" });
  const [generateForm,     setGenerateForm]     = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear() });
  const [generating,       setGenerating]       = useState(false);
  const [importerProfiles, setImporterProfiles] = useState([]);
  const [importerListings, setImporterListings] = useState([]);
  const [importerListingsTotal, setImporterListingsTotal] = useState(0);
  // Bug réel corrigé (audit) : plafond fixe à 100 (comme pour les véhicules
  // avant correctif) — 211 annonces Import/Export réelles en base au moment
  // de l'audit, toutes "pending", dont 111 invisibles ici. Défaut au plafond
  // admin réel du backend (getAdminListings maxLimit=500) au lieu de 100.
  const [importerListingsLimit, setImporterListingsLimit] = useState(500);
  const [importerLoading,  setImporterLoading]  = useState(false);
  // "" = Tous (par défaut) — un défaut sur "pending" cachait silencieusement les
  // dossiers déjà vérifiés/refusés dès l'ouverture de l'onglet (voir loadImporters).
  const [importerFilter,   setImporterFilter]   = useState("");
  const [listingFilter,    setListingFilter]     = useState("");
  const [editingIeListing, setEditingIeListing]  = useState(null); // annonce complète en édition (admin)
  // importerProfiles/importerListings contiennent TOUJOURS tous les statuts
  // (voir loadImporters) — le filtre ne s'applique qu'à l'affichage du tableau,
  // jamais aux KPI (Total/Vérifiés/Refusés...) qui doivent refléter la réalité
  // complète quel que soit le filtre actif.
  const filteredImporterProfiles = useMemo(
    () => importerFilter ? importerProfiles.filter((p) => p.status === importerFilter) : importerProfiles,
    [importerProfiles, importerFilter]
  );
  const [listingCountryFilter, setListingCountryFilter] = useState("");
  const [listingVilleFilter,   setListingVilleFilter]   = useState("");
  const filteredImporterListings = useMemo(
    () => importerListings
      .filter((l) => !listingFilter || l.status === listingFilter)
      .filter((l) => !listingCountryFilter || l.sourceCountry === listingCountryFilter)
      .filter((l) => !listingVilleFilter || l.sourceCity === listingVilleFilter),
    [importerListings, listingFilter, listingCountryFilter, listingVilleFilter]
  );
  const importerListingVilleOptions = useMemo(
    () => [...new Set(importerListings.map((l) => l.sourceCity).filter(Boolean))].sort(),
    [importerListings]
  );
  // sourceCountry est une saisie libre (pas un code ISO — voir ImporterDashboard.jsx
  // "Pays d'origine", placeholder "Émirats Arabes Unis"), donc pas de correspondance
  // possible avec COUNTRIES_CONFIG (codes ISO-2) : liste construite depuis les
  // valeurs distinctes réellement présentes, comme pour la ville.
  const importerListingCountryOptions = useMemo(
    () => [...new Set(importerListings.map((l) => l.sourceCountry).filter(Boolean))].sort(),
    [importerListings]
  );
  const [reviewModal,      setReviewModal]       = useState(null);
  const [reviewDecision,   setReviewDecision]    = useState({ status: "verified", rejectionReason: "", badgeLevel: "silver" });
  const [listingRejectModal, setListingRejectModal] = useState(null);
  const [listingRejectNote,  setListingRejectNote]  = useState("");
  const [exporterDetail,     setExporterDetail]     = useState(null);
  // KYC Admin
  const [kycList,       setKycList]       = useState([]);
  const [kycTotal,      setKycTotal]      = useState(0);
  const [kycLimit,      setKycLimit]      = useState(50);
  const [kycLoading,    setKycLoading]    = useState(false);
  // "ALL" par défaut — un défaut sur "EN_ATTENTE" rendait un compte déjà
  // vérifié/refusé introuvable dans cet onglet tant que l'admin ne pensait pas
  // à cliquer sur le filtre correspondant (le backend gérait déjà ce cas, voir
  // getKycList, mais le défaut front ne l'exploitait pas).
  const [kycFilter,     setKycFilter]     = useState("ALL");
  const [kycSearch,     setKycSearch]     = useState("");
  const [kycDetailUser, setKycDetailUser] = useState(null);
  const [kycDetailLoading, setKycDetailLoading] = useState(false);
  const [kycReviewForm, setKycReviewForm] = useState({ decision: "VERIFIE", note: "" });
  const [kycReviewLoading, setKycReviewLoading] = useState(false);
  const [kycReviewMsg,  setKycReviewMsg]  = useState("");
  // Compteur "en attente" indépendant du filtre actuellement affiché (kycList
  // change selon kycFilter — un badge calculé dessus mentirait dès que l'admin
  // clique sur un autre filtre, voir loadKycPendingTotal ci-dessous).
  const [kycPendingTotal, setKycPendingTotal] = useState(0);
  // Support Client (inbox chats client_support / partner_support)
  const [supportChats,    setSupportChats]    = useState([]);
  const [reports,         setReports]         = useState([]);
  const [trustModal,      setTrustModal]      = useState(null);   // utilisateur ciblé
  const [trustOverview,   setTrustOverview]   = useState(null);
  const [trustLoading,    setTrustLoading]    = useState(false);
  const [reportsLoading,  setReportsLoading]  = useState(false);
  const [reportFilter,    setReportFilter]    = useState("en_attente");
  // Bot WhatsApp partenaires — conversations à reprendre (status="escalated")
  const [waConversations, setWaConversations] = useState([]);
  const [waLoading,       setWaLoading]       = useState(false);
  const [waFilter,        setWaFilter]        = useState("escalated");
  const [waActive,        setWaActive]        = useState(null);   // conversation ouverte (détail complet)
  const [waReply,         setWaReply]         = useState("");
  const [supportLoading,  setSupportLoading]  = useState(false);
  const [supportActive,   setSupportActive]   = useState(null);   // chat sélectionné (résumé liste)
  const [supportMessages, setSupportMessages] = useState([]);
  const [supportMsgLoading, setSupportMsgLoading] = useState(false);
  const [supportReply,    setSupportReply]    = useState("");
  const [supportSending,  setSupportSending]  = useState(false);
  // Certification Partenaire
  const [certList,          setCertList]          = useState([]);
  const [certLoading,       setCertLoading]        = useState(false);
  const [certFilter,        setCertFilter]         = useState("all");
  const [certDetail,        setCertDetail]         = useState(null);
  const [certReviewLevel,   setCertReviewLevel]    = useState(null);
  const [certReviewForm,    setCertReviewForm]     = useState({ decision: "approved", note: "" });
  const [certBadgeForm,     setCertBadgeForm]      = useState({ badge: "verifie", publicStatement: "", note: "" });
  const [certReviewLoading, setCertReviewLoading]  = useState(false);
  const [certReviewMsg,     setCertReviewMsg]      = useState("");

  // Partner Verification System
  const [pvList,            setPvList]            = useState([]);
  const [pvStats,           setPvStats]           = useState(null);
  const [pvLoading,         setPvLoading]         = useState(false);
  const [pvFilter,          setPvFilter]          = useState({ status: "", trustLevel: "", companyType: "", search: "" });
  const [pvDetail,          setPvDetail]          = useState(null);
  const [pvCreateModal,     setPvCreateModal]     = useState(false);
  const [pvCreateForm,      setPvCreateForm]      = useState({ userId: "", companyName: "", companyType: "importateur", country: "", city: "", website: "", phone: "", email: "", description: "", exportCountries: [], importCountries: [], vehicleCategories: [], yearsExperience: 0, annualVolume: "", adminNote: "" });
  const [pvSaving,          setPvSaving]          = useState(false);
  const [pvCriterionLoading,setPvCriterionLoading]= useState("");

  const [stats,     setStats]     = useState(null);
  const [users,     setUsers]     = useState([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersLimit, setUsersLimit] = useState(200);
  const [vehicles,  setVehicles]  = useState([]);
  const [vehiclesTotal, setVehiclesTotal] = useState(0);
  // Défaut au plafond admin réel du backend (getVehicles maxLimit=500, voir
  // vehicleController.js) plutôt que 200 : avec le volume actuel d'annonces,
  // 200 laissait déjà les plus anciennes invisibles dès le premier chargement,
  // sans même attendre un futur "Charger plus".
  const [vehiclesLimit, setVehiclesLimit] = useState(500);
  const [bookings,  setBookings]  = useState([]);
  const [bookingsTotal, setBookingsTotal] = useState(0);
  const [bookingsLimit, setBookingsLimit] = useState(200);
  const [drivers,   setDrivers]   = useState([]);
  const [activeDrivers, setActiveDrivers] = useState([]); // Driver.status==="approved" — remplace l'ancien filtre User.role==="chauffeur" (jamais assignable, voir Register.jsx)
  const [loading,   setLoading]   = useState(true);
  const [toast,     setToast]     = useState(null);

  // Bug réel corrigé (audit) : les badges "Annonces & Validations" et
  // "Litiges" ne se mettaient jamais à jour en temps réel — la clochette
  // générale (NotificationContext) reçoit bien le push socket
  // "notification_new" (notifyAdmins() côté serveur), mais rien dans
  // AdminPanel ne l'écoutait, forçant un rechargement manuel pour voir une
  // nouvelle annonce/un nouveau litige. Compteurs "live" ajoutés à l'affichage
  // sans re-fetch complet (évite un flash de chargement sur tout le panel) —
  // remis à zéro dès que loadAll() rafraîchit les vraies listes.
  const [liveNewListings, setLiveNewListings] = useState(0);
  const [liveDisputes,    setLiveDisputes]    = useState(0);

  // PMS Admin
  const [pmsStats,    setPmsStats]    = useState(null);
  const [pmsShowrooms,setPmsShowrooms]= useState([]);
  const [pmsLoading,  setPmsLoading]  = useState(false);
  const [pmsFilter,   setPmsFilter]   = useState("all");

  // Founding Partner Onboarding Admin
  const [foundingList,      setFoundingList]     = useState([]);
  const [foundingStats,     setFoundingStats]    = useState(null);
  const [foundingLoading,   setFoundingLoading]  = useState(false);
  const [foundingDetail,    setFoundingDetail]   = useState(null);
  const [foundingSignLink,  setFoundingSignLink] = useState(null); // { id, link, type, companyName }
  const [foundingNote,      setFoundingNote]     = useState("");
  const [foundingAction,    setFoundingAction]   = useState(null); // { id, type: 'approve'|'reject'|'agreement' }
  const [foundingSubmitting, setFoundingSubmitting] = useState(false); // évite le double-clic (envoi LOI/accord/rejet en double) — utilisé uniquement par le MODAL (une seule cible à la fois)
  // Bug réel corrigé (audit — remonté par l'utilisateur) : les boutons "Relancer"/
  // "Envoyer Accord"/"Renvoyer la LOI"/"Renvoyer l'accord" de CHAQUE ligne du
  // tableau Founding Partner partageaient tous le même booléen foundingSubmitting
  // — cliquer "Relancer" sur UN partenaire désactivait/grisait visuellement les
  // boutons de TOUS les autres partenaires de la liste pendant l'appel réseau
  // (aucun mauvais envoi ne partait réellement, mais l'admin le percevait comme
  // "le bouton s'active pour tous"). Un id précis (plutôt qu'un booléen global)
  // permet de ne griser que le bouton de la ligne réellement concernée.
  const [foundingRowActionId, setFoundingRowActionId] = useState(null);
  // CRM Directory
  const [foundingView,      setFoundingView]     = useState("onboarding"); // "onboarding" | "crm"
  const [foundingCRMFilter, setFoundingCRMFilter]= useState("");           // crmStatus filter
  const [foundingCRMEdit,   setFoundingCRMEdit]  = useState(null);         // { id, data: {...} }

  // Filtres
  const [userSearch,  setUserSearch]  = useState("");
  const [userRole,    setUserRole]    = useState("all");
  const [userCountry, setUserCountry] = useState("all");
  const [vehStatus,   setVehStatus]   = useState("all");
  const [bkStatus,    setBkStatus]    = useState("all");

  // Pagination
  const [userPage,  setUserPage]  = useState(1);
  const [vehPage,   setVehPage]   = useState(1);
  const [bkPage,    setBkPage]    = useState(1);
  const PAGE_SIZE = 10;

  // Confirmation
  const [confirm, setConfirm] = useState(null);

  // Rejection reason (vehicles)
  const [rejectModal, setRejectModal] = useState(null); // { vid, name }
  const [rejectReason, setRejectReason] = useState("");

  // Rejection reason (drivers) — utilisé dans le modal + la section Validations
  const [driverRejectModal,  setDriverRejectModal]  = useState(null);
  const [driverRejectReason, setDriverRejectReason] = useState("");

  // Booking action
  const [bkActionModal,   setBkActionModal]   = useState(null); // { id, name, action }
  const [bkCancelReason,  setBkCancelReason]  = useState("");
  const [bkCancelReasonCode, setBkCancelReasonCode] = useState("");
  const [bkSearch,        setBkSearch]        = useState("");
  const [bkType,          setBkType]          = useState("all");
  // Dispute & Force complete modals
  const [disputeModal,    setDisputeModal]    = useState(null); // { booking }
  const [disputeNote,     setDisputeNote]     = useState("");
  const [disputeResol,    setDisputeResol]    = useState("completed");
  const [forceModal,      setForceModal]      = useState(null); // { booking }
  const [forceAmount,     setForceAmount]     = useState("");
  const [forceNote,       setForceNote]       = useState("");

  // Broadcast notification
  const [broadcastModal, setBroadcastModal] = useState(false);
  const [broadcastForm, setBroadcastForm] = useState({ titre: "", message: "", targetRole: "all", lien: "" });
  const [broadcastSending, setBroadcastSending] = useState(false);

  // ── Toasts ─────────────────────────────────────────────────────────────────
  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Recherche globale classée par entité ────────────────────────────────────
  // Bug réel corrigé (audit) : chaque type d'annonce (véhicule, chauffeur,
  // Import/Export) vit dans un onglet séparé avec sa propre recherche locale —
  // un admin qui cherche "Kouassi" ne sait pas d'avance dans quel onglet
  // regarder, et une annonce chauffeur en particulier était rapportée comme
  // introuvable. Cette recherche interroge les 3 entités en une seule fois,
  // classées par type, accessible depuis n'importe quel onglet (barre du haut).
  const [globalSearch, setGlobalSearch] = useState("");
  const globalSearchResults = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (q.length < 2) return null;
    const matchesAny = (fields) => fields.some((f) => f && String(f).toLowerCase().includes(q));

    const matchVehicles = vehicles.filter((v) =>
      matchesAny([v.title, v.name, v.marque, v.modele, v.owner?.firstName, v.owner?.lastName])
    ).slice(0, 8);

    // `drivers` couvre désormais tous les statuts (voir loadAll) — recouvre déjà
    // ce que fournissait `activeDrivers` (approved uniquement), n'ajouter ce
    // dernier que pour les profils qu'il serait seul à connaître (dédoublonné
    // par _id, sinon un chauffeur publié apparaissait deux fois dans les résultats).
    const knownDriverIds = new Set(drivers.map((d) => d._id));
    const matchDrivers = [
      ...drivers.map((d) => ({ ...d, _searchStatus: d.status || "pending" })),
      ...activeDrivers.filter((d) => !knownDriverIds.has(d._id)).map((d) => ({ ...d, _searchStatus: d.status || "approved" })),
    ].filter((d) =>
      matchesAny([d.firstName, d.lastName, d.title, d.owner?.firstName, d.owner?.lastName])
    ).slice(0, 8);

    const matchListings = importerListings.filter((l) =>
      matchesAny([l.title, l.make, l.model, l.partner?.firstName, l.partner?.lastName])
    ).slice(0, 8);

    return { vehicles: matchVehicles, drivers: matchDrivers, listings: matchListings };
  }, [globalSearch, vehicles, drivers, activeDrivers, importerListings]);

  const globalSearchTotal = globalSearchResults
    ? globalSearchResults.vehicles.length + globalSearchResults.drivers.length + globalSearchResults.listings.length
    : 0;

  // ── Headers API ─────────────────────────────────────────────────────────────
  const headers = useMemo(() => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  }), [token]);

  // ── Chargement données ──────────────────────────────────────────────────────
  // usersLimit/bookingsLimit/vehiclesLimit paramétrables (bug réel corrigé —
  // voir loadMoreUsers/loadMoreBookings/loadMoreVehicles) : un plafond fixe
  // rendait tout ce qui dépassait ce nombre invisible en silence, la fausse
  // "pagination" de l'UI ne faisant que découper côté client ces résultats
  // déjà tronqués. Le plafond vehicles était resté à 200 en dur (jamais
  // corrigé en même temps que users/bookings) alors que le tri est
  // `createdAt desc` : au-delà de 200 annonces au total, les plus anciennes
  // (annonces déjà publiées ou rejetées de longue date) disparaissaient de
  // l'onglet "Annonces & Validations", et les compteurs "En attente"/
  // "Publiées" de cet onglet (calculés sur ce même tableau tronqué) pouvaient
  // diverger silencieusement des vrais totaux (stats.vehicles.*, eux corrects
  // car agrégés côté serveur sans pagination).
  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [sRes, uRes, vRes, bRes, dRes, adRes] = await Promise.all([
        fetch("/api/users/stats",    { headers }),
        fetch(`/api/users?limit=${usersLimit}`, { headers }),
        fetch(`/api/vehicles?limit=${vehiclesLimit}&status=all`, { headers }),
        fetch(`/api/bookings?limit=${bookingsLimit}`, { headers }),
        fetch("/api/drivers/pending?status=all", { headers }),
        fetch("/api/drivers", { headers }),
      ]);
      if (sRes.ok) setStats((await sRes.json()));
      if (uRes.ok) { const d = await uRes.json(); setUsers(d.users || []); setUsersTotal(d.total || 0); }
      if (vRes.ok) {
        const d = await vRes.json();
        setVehicles(Array.isArray(d) ? d : d.vehicles || []);
        setVehiclesTotal(d.total || 0);
      }
      if (bRes.ok) { const d = await bRes.json(); setBookings(d.bookings || []); setBookingsTotal(d.total || 0); }
      if (dRes.ok) setDrivers((await dRes.json()).drivers || []);
      if (adRes.ok) { const ad = await adRes.json(); setActiveDrivers(Array.isArray(ad) ? ad : ad.drivers || []); }
      setLiveNewListings(0);
      setLiveDisputes(0);
    } catch { /* ignore */ }
    setLoading(false);
  }, [token, headers, usersLimit, bookingsLimit, vehiclesLimit]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Bug réel corrigé (audit) : à l'arrivée d'une notification new_vehicle/
  // new_driver/litige, seul le badge du compteur était mis à jour (voir
  // liveNewListings/liveDisputes plus haut) — jamais la vraie liste
  // (vehicles/drivers/bookings). L'admin voyait donc le badge bouger mais
  // ne trouvait rien de nouveau dans l'onglet tant qu'il ne cliquait pas
  // manuellement sur "↻ Actualiser" ou ne rechargeait la page — confirmé
  // par test réel en production (l'annonce existait bien côté serveur,
  // /api/drivers/pending la renvoyait, mais l'UI déjà ouverte ne la
  // récupérait jamais). Rafraîchit les listes concernées sans le flash de
  // chargement complet de loadAll() (pas de setLoading ici).
  const refreshPendingListings = useCallback(async () => {
    if (!token) return;
    try {
      const [vRes, dRes, bRes] = await Promise.all([
        fetch(`/api/vehicles?limit=${vehiclesLimit}&status=all`, { headers }),
        fetch("/api/drivers/pending?status=all", { headers }),
        fetch(`/api/bookings?limit=${bookingsLimit}`, { headers }),
      ]);
      if (vRes.ok) {
        const d = await vRes.json();
        setVehicles(Array.isArray(d) ? d : d.vehicles || []);
        setVehiclesTotal(d.total || 0);
      }
      if (dRes.ok) setDrivers((await dRes.json()).drivers || []);
      if (bRes.ok) { const d = await bRes.json(); setBookings(d.bookings || []); setBookingsTotal(d.total || 0); }
      setLiveNewListings(0);
      setLiveDisputes(0);
    } catch { /* ignore — le badge live reste affiché, l'admin peut réessayer via Actualiser */ }
  }, [token, headers, vehiclesLimit, bookingsLimit]);

  const loadMoreUsers = useCallback(() => setUsersLimit((l) => l + 200), []);
  const loadMoreBookings = useCallback(() => setBookingsLimit((l) => l + 200), []);
  const loadMoreVehicles = useCallback(() => setVehiclesLimit((l) => l + 200), []);

  const handleGlobalApproveDriver = useCallback(async (id) => {
    const r = await fetch(`/api/drivers/${id}/status`, { method: "PATCH", headers, body: JSON.stringify({ status: "approved" }) });
    if (r.ok) { showToast("Chauffeur approuvé"); setGlobalSearch(""); loadAll(); }
    else showToast("Erreur approbation", "error");
  }, [headers, showToast, loadAll]);

  // ── Demandes Import/Export ──────────────────────────────────────────────────
  const loadImportExport = useCallback(async () => {
    if (!token) return;
    setIeLoading(true);
    try {
      const res = await fetch(`/api/import-export/requests?limit=${ieRequestsLimit}`, { headers });
      if (res.ok) {
        const d = await res.json();
        setIeRequests(Array.isArray(d) ? d : d.requests || []);
        setIeRequestsTotal(Array.isArray(d) ? d.length : d.total || 0);
      }
    } catch { /* endpoint optionnel */ }
    setIeLoading(false);
  }, [token, headers, ieRequestsLimit]);

  const loadMoreIeRequests = useCallback(() => setIeRequestsLimit((l) => l + 200), []);

  // Bug réel corrigé (audit) : ce tableau était 100% en lecture seule côté
  // admin alors que le backend expose déjà un workflow complet (approuver/
  // rejeter/marquer contacté/supprimer, avec notification au client — voir
  // updateRequestStatus/deleteRequest, importExportController.js). Le badge
  // de navigation "Transactions I/E" affichait un compteur "en attente" comme
  // si ces demandes étaient actionnables depuis cet onglet — elles ne
  // l'étaient pas.
  const updateIeRequestStatus = useCallback(async (id, status) => {
    if (ieActionSaving) return;
    setIeActionSaving(true);
    try {
      const r = await fetch(`/api/import-export/requests/${id}/status`, {
        method: "PATCH", headers, body: JSON.stringify({ status }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast("Demande mise à jour", "success");
      loadImportExport();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setIeActionSaving(false); }
  }, [headers, showToast, loadImportExport, ieActionSaving]);

  const deleteIeRequest = useCallback(async (id) => {
    if (ieActionSaving) return;
    setIeActionSaving(true);
    try {
      const r = await fetch(`/api/import-export/requests/${id}`, { method: "DELETE", headers });
      if (!r.ok) { const data = await r.json().catch(() => ({})); showToast(data.message || "Erreur", "error"); return; }
      setIeRequests((prev) => prev.filter((r2) => r2._id !== id));
      showToast("Demande supprimée", "success");
    } catch { showToast("Erreur réseau", "error"); }
    finally { setIeActionSaving(false); }
  }, [headers, showToast, ieActionSaving]);

  const loadIeTransactions = useCallback(async () => {
    if (!token) return;
    setIeTxLoading(true);
    try {
      const res = await fetch("/api/import-export/transactions?limit=100", { headers });
      if (res.ok) { const d = await res.json(); setIeTransactions(d.transactions || []); }
    } catch { /* ignore */ }
    setIeTxLoading(false);
  }, [token, headers]);

  const handleResolveIeDispute = async () => {
    if (!ieTxModal?.tx) return;
    setIeTxSaving(true);
    try {
      const r = await fetch(`/api/import-export/transactions/${ieTxModal.tx._id}/dispute/resolve`, {
        method: "PATCH", headers,
        body: JSON.stringify({ resolution: ieTxNote, releaseToPartner: ieTxRelease }),
      });
      const d = await r.json();
      if (r.ok) { showToast("Litige résolu.", "success"); setIeTxModal(null); setIeTxNote(""); loadIeTransactions(); }
      else showToast(d.message || "Erreur.", "error");
    } catch { showToast("Erreur réseau.", "error"); }
    setIeTxSaving(false);
  };

  const handleCompleteIeInspection = async () => {
    if (!ieTxModal?.tx) return;
    setIeTxSaving(true);
    try {
      const r = await fetch(`/api/import-export/transactions/${ieTxModal.tx._id}/complete-inspection`, {
        method: "PATCH", headers,
        body: JSON.stringify({ reportNotes: ieTxNote }),
      });
      const d = await r.json();
      if (r.ok) { showToast("Inspection complétée.", "success"); setIeTxModal(null); setIeTxNote(""); loadIeTransactions(); }
      else showToast(d.message || "Erreur.", "error");
    } catch { showToast("Erreur réseau.", "error"); }
    setIeTxSaving(false);
  };

  // Paiement manuel (virement/mobile money/crypto, ou carte sans Stripe
  // configuré) déclaré par le client — aucune vérification automatique
  // possible sans intégration bancaire réelle, un admin doit confirmer avant
  // que l'entiercement ne soit considéré comme sécurisé.
  const handleVerifyIePayment = async (approve) => {
    if (!ieTxModal?.tx) return;
    setIeTxSaving(true);
    try {
      const r = await fetch(`/api/import-export/transactions/${ieTxModal.tx._id}/${approve ? "verify-payment" : "reject-payment"}`, {
        method: "PATCH", headers,
        body: JSON.stringify({ reason: ieTxNote }),
      });
      const d = await r.json();
      if (r.ok) { showToast(approve ? "Paiement vérifié." : "Paiement rejeté.", "success"); setIeTxModal(null); setIeTxNote(""); loadIeTransactions(); }
      else showToast(d.message || "Erreur.", "error");
    } catch { showToast("Erreur réseau.", "error"); }
    setIeTxSaving(false);
  };

  // ── Profils & annonces importateurs ────────────────────────────────────────
  // Récupère TOUJOURS la liste complète (tous statuts confondus) — le filtre
  // pending/verified/rejected/suspended s'applique ensuite côté client (voir
  // filteredImporterProfiles/filteredImporterListings). Avant ce correctif, le
  // filtre était appliqué côté serveur ET les KPI (Total, Vérifiés, Refusés...)
  // étaient calculés sur cette même liste déjà filtrée : avec le filtre par
  // défaut "En attente", le KPI "Total exportateurs" n'affichait jamais que les
  // dossiers en attente — un partenaire déjà vérifié (donc jamais "pending")
  // restait invisible sans qu'aucun indice ne signale son existence.
  const loadImporters = useCallback(async () => {
    if (!token) return;
    setImporterLoading(true);
    try {
      const [pRes, lRes] = await Promise.all([
        fetch(`/api/import-export/importer-profiles?limit=100`, { headers }),
        fetch(`/api/import-export/listings/admin?limit=${importerListingsLimit}`, { headers }),
      ]);
      if (pRes.ok) { const d = await pRes.json(); setImporterProfiles(d.profiles || []); }
      if (lRes.ok) { const d = await lRes.json(); setImporterListings(d.listings || []); setImporterListingsTotal(d.total || 0); }
    } catch {}
    setImporterLoading(false);
  }, [token, headers, importerListingsLimit]);

  const loadMoreImporterListings = useCallback(() => setImporterListingsLimit((l) => l + 200), []);

  // /listings/admin (liste) ne renvoie plus le tableau `photos` complet — voir
  // importExportController.getAdminListings (optimisation payload liste). Il
  // faut recharger l'annonce en entier (getListingById, jamais tronqué).
  const openEditIeListing = async (id) => {
    try {
      const r = await fetch(`/api/import-export/listings/${id}`, { headers });
      const d = await r.json();
      if (!r.ok) throw new Error();
      setEditingIeListing(d.listing);
    } catch { showToast("Impossible de charger l'annonce.", "error"); }
  };

  const loadCommissions = useCallback(async () => {
    if (!token) return;
    try {
      const params = new URLSearchParams({ year: invoiceYear });
      if (invoiceMonth) params.set("month", invoiceMonth);
      const r = await fetch(`/api/invoices/commissions?${params}`, { headers });
      if (r.ok) {
        const d = await r.json();
        setCommissions(d.bookings || []);
        setCommissionsStats({ total: d.totalCommissions, transactions: d.totalTransactions, count: d.count });
      }
    } catch { /* ignore */ }
  }, [token, headers, invoiceYear, invoiceMonth]);

  const loadInvoices = useCallback(async () => {
    if (!token) return;
    setInvoiceLoading(true);
    try {
      const r = await fetch("/api/invoices?limit=100", { headers });
      if (r.ok) {
        const d = await r.json();
        setInvoices(d.invoices || []);
        setInvoicesStats({ totalPaid: d.totalPaid, totalPending: d.totalPending });
      }
    } catch { /* ignore */ }
    setInvoiceLoading(false);
  }, [token, headers]);

  // Factures de PRESTATION (une par commande terminée, voir issueServiceInvoice
  // dans bookingController.js) — distinctes des factures mensuelles de commission
  // ci-dessus (ce que le partenaire doit à VIT AUTO) : ici, ce que le partenaire
  // a encaissé/à percevoir, enregistré côté admin pour supervision.
  const [serviceInvoicesAdmin, setServiceInvoicesAdmin] = useState([]);
  const [serviceInvoicesAdminLoading, setServiceInvoicesAdminLoading] = useState(false);
  const loadServiceInvoicesAdmin = useCallback(async () => {
    if (!token) return;
    setServiceInvoicesAdminLoading(true);
    try {
      const r = await fetch("/api/service-invoices?limit=100", { headers });
      if (r.ok) { const d = await r.json(); setServiceInvoicesAdmin(d.invoices || []); }
    } catch { /* ignore */ }
    setServiceInvoicesAdminLoading(false);
  }, [token, headers]);

  // ── Abonnements Pro / Boosts (paiements en attente de confirmation) ─────────
  const loadSubRequests = useCallback(async () => {
    if (!token) return;
    setSubLoading(true);
    try {
      const r = await fetch("/api/subscriptions/admin/pending", { headers });
      if (r.ok) setSubRequests((await r.json()).subscriptions || []);
    } catch { /* ignore */ }
    setSubLoading(false);
  }, [token, headers]);

  const subAction = async (path, subId, itemId) => {
    const key = `${subId}:${itemId}`;
    if (subActioning) return;
    setSubActioning(key);
    try {
      const r = await fetch(`/api/subscriptions/admin/${subId}/${path}`, { method: "PATCH", headers });
      const d = await r.json().catch(() => null);
      if (r.ok) { showToast(d?.message || "Effectué."); loadSubRequests(); }
      else showToast(d?.message || "Erreur", "error");
    } catch { showToast("Erreur réseau", "error"); }
    finally { setSubActioning(null); }
  };

  // ── Modération des avis ──────────────────────────────────────────────────────
  const loadReviews = useCallback(async () => {
    if (!token) return;
    setReviewsLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (reviewsFilter) params.set("visible", reviewsFilter);
      const r = await fetch(`/api/reviews/admin/list?${params}`, { headers });
      if (r.ok) setReviewsList((await r.json()).reviews || []);
    } catch { /* ignore */ }
    setReviewsLoading(false);
  }, [token, headers, reviewsFilter]);

  const toggleReviewVisibility = async (review) => {
    if (reviewActioning) return;
    setReviewActioning(review._id);
    try {
      const r = await fetch(`/api/reviews/${review._id}/${review.visible ? "hide" : "unhide"}`, { method: "PATCH", headers });
      if (r.ok) { showToast(review.visible ? "Avis masqué." : "Avis réaffiché."); loadReviews(); }
      else showToast("Erreur", "error");
    } catch { showToast("Erreur réseau", "error"); }
    finally { setReviewActioning(null); }
  };

  // ── Analytics avancé ────────────────────────────────────────────────────────
  const loadAnalytics = useCallback(async () => {
    if (!token) return;
    setAnalyticsLoading(true);
    try {
      const r = await fetch("/api/analytics/admin", { headers });
      if (r.ok) setAnalytics(await r.json());
    } catch { /* ignore */ }
    setAnalyticsLoading(false);
  }, [token, headers]);

  // ── Emails & livraison (bounces/échecs Resend) ───────────────────────────────
  const loadEmailDelivery = useCallback(async () => {
    if (!token) return;
    setEmailDeliveryLoading(true);
    try {
      const [sRes, fRes] = await Promise.all([
        fetch("/api/comm/stats", { headers }),
        fetch("/api/comm/failures?limit=100", { headers }),
      ]);
      if (sRes.ok) setEmailStats((await sRes.json()).stats);
      if (fRes.ok) setEmailFailures((await fRes.json()).failures || []);
    } catch { /* ignore */ }
    setEmailDeliveryLoading(false);
  }, [token, headers]);

  // ── Financement ──────────────────────────────────────────────────────────────
  const loadFinancing = useCallback(async () => {
    if (!token) return;
    setFinancingLoading(true);
    try {
      const r = await fetch("/api/bookings/admin/financing", { headers });
      if (r.ok) setFinancingRequests((await r.json()).requests || []);
    } catch { /* ignore */ }
    setFinancingLoading(false);
  }, [token, headers]);

  const submitFinancingDecision = async () => {
    if (!financingModal) return;
    setFinancingSaving(true);
    try {
      const r = await fetch(`/api/bookings/${financingModal.id}/financing-decision`, {
        method: "PATCH", headers,
        body: JSON.stringify({ decision: financingModal.decision, note: financingNote }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast("Décision enregistrée — client notifié", "success");
      setFinancingModal(null);
      setFinancingNote("");
      loadFinancing();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setFinancingSaving(false); }
  };

  // ── Rôles & Permissions ──────────────────────────────────────────────────────
  const loadAdminAccounts = useCallback(async () => {
    if (!token) return;
    setRolesLoading(true);
    try {
      const r = await fetch("/api/users/admin/accounts", { headers });
      if (r.ok) setAdminAccounts((await r.json()).admins || []);
    } catch { /* ignore */ }
    setRolesLoading(false);
  }, [token, headers]);

  const applyAdminScope = async (adminId, next) => {
    setRolesSavingId(adminId);
    try {
      const r = await fetch(`/api/users/admin/${adminId}/scope`, {
        method: "PATCH", headers,
        body: JSON.stringify({ scope: next }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast("Permissions mises à jour", "success");
      loadAdminAccounts();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setRolesSavingId(null); }
  };

  // Bug réel corrigé (audit) : cliquer une SEULE permission sur un admin à
  // "accès complet" (adminScope=[]) le restreignait immédiatement et
  // silencieusement à CETTE seule permission (next = [...[], scopeKey]),
  // sans aucune confirmation. Risque concret : un admin unique à accès
  // complet se retire lui-même l'accès complet par erreur, puis ne peut plus
  // se le rendre depuis l'UI (updateAdminScope exige déjà un accès complet
  // ou super_admin pour modifier des scopes — voir usersController.js) —
  // auto-verrouillage irréversible sans intervention directe en base. Le
  // backend (updateAdminScope) refuse désormais aussi toute modification qui
  // laisserait 0 admin à accès complet sur toute la plateforme, en filet de
  // sécurité final si cette confirmation était contournée.
  const toggleAdminScope = (adminId, currentScope, scopeKey) => {
    const wasFullAccess = currentScope.length === 0;
    const next = currentScope.includes(scopeKey)
      ? currentScope.filter((s) => s !== scopeKey)
      : [...currentScope, scopeKey];

    if (wasFullAccess) {
      const label = ADMIN_SCOPE_CFG.find((s) => s.key === scopeKey)?.label || scopeKey;
      setConfirm({
        message: `Ce compte a actuellement un ACCÈS COMPLET. Cette action va le restreindre uniquement à "${label}" — il perdra l'accès à tout le reste. Continuer ?`,
        danger: true,
        action: () => applyAdminScope(adminId, next),
      });
      return;
    }
    applyAdminScope(adminId, next);
  };

  // ── Publicités & Campagnes ───────────────────────────────────────────────────
  const loadAds = useCallback(async () => {
    if (!token) return;
    setAdsLoading(true);
    try {
      const r = await fetch("/api/ads/all", { headers });
      if (r.ok) setAdsList(await r.json());
    } catch { /* ignore */ }
    setAdsLoading(false);
  }, [token, headers]);

  const saveAd = async () => {
    if (!adForm?.title?.trim()) { showToast("Titre requis", "error"); return; }
    setAdSaving(true);
    try {
      const isNew = !adForm._id;
      const r = await fetch(isNew ? "/api/ads" : `/api/ads/${adForm._id}`, {
        method: isNew ? "POST" : "PUT", headers,
        body: JSON.stringify(adForm),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast(isNew ? "Annonce créée." : "Annonce mise à jour.", "success");
      setAdForm(null);
      loadAds();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setAdSaving(false); }
  };

  const toggleAdActive = async (ad) => {
    try {
      const r = await fetch(`/api/ads/${ad._id}`, {
        method: "PUT", headers,
        body: JSON.stringify({ active: !ad.active }),
      });
      if (r.ok) loadAds();
    } catch { showToast("Erreur réseau", "error"); }
  };

  const deleteAd = async (id) => {
    if (!window.confirm("Supprimer définitivement cette annonce ?")) return;
    try {
      const r = await fetch(`/api/ads/${id}`, { method: "DELETE", headers });
      if (r.ok) { showToast("Annonce supprimée.", "success"); loadAds(); }
    } catch { showToast("Erreur réseau", "error"); }
  };

  // ── Reversements partenaire ────────────────────────────────────────────────
  const loadPayouts = useCallback(async () => {
    if (!token) return;
    setPayoutsLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (payoutsFilter) params.set("status", payoutsFilter);
      const r = await fetch(`/api/commission-ledger/admin?${params}`, { headers });
      if (r.ok) { const d = await r.json(); setPayoutsList(d.entries || []); setPayoutsTotal(d.total || 0); }
      const rPending = await fetch(`/api/commission-ledger/admin?status=pending&limit=1`, { headers });
      if (rPending.ok) setPayoutsPendingCount((await rPending.json()).total || 0);
    } catch { /* ignore */ }
    setPayoutsLoading(false);
  }, [token, headers, payoutsFilter]);

  const markPayoutPaid = async (id) => {
    if (payoutMarkingId) return;
    const paidViaTxId = window.prompt("Référence du virement (optionnel — banque/mobile money) :", "");
    if (paidViaTxId === null) return; // annulé
    setPayoutMarkingId(id);
    try {
      const r = await fetch(`/api/commission-ledger/admin/${id}/mark-paid`, {
        method: "PATCH", headers, body: JSON.stringify({ paidViaTxId: paidViaTxId || undefined }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast("Reversement marqué comme payé", "success");
      loadPayouts();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setPayoutMarkingId(null); }
  };

  // ── Assurance ────────────────────────────────────────────────────────────────
  const loadInsurance = useCallback(async () => {
    if (!token) return;
    setInsuranceLoading(true);
    try {
      const r = await fetch("/api/insurance/admin/list", { headers });
      if (r.ok) setInsuranceList((await r.json()).requests || []);
    } catch { /* ignore */ }
    setInsuranceLoading(false);
  }, [token, headers]);

  const submitInsuranceDecision = async () => {
    if (!insuranceModal) return;
    setInsuranceSaving(true);
    try {
      const r = await fetch(`/api/insurance/${insuranceModal.id}/decision`, {
        method: "PATCH", headers,
        body: JSON.stringify({ status: insuranceModal.status, premium: insurancePremium, note: insuranceNote }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast("Décision enregistrée — client notifié", "success");
      setInsuranceModal(null);
      setInsurancePremium("");
      setInsuranceNote("");
      loadInsurance();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setInsuranceSaving(false); }
  };

  // ── Demandes de services génériques ──────────────────────────────────────────
  const loadServiceRequests = useCallback(async () => {
    if (!token) return;
    setSvcReqLoading(true);
    try {
      const params = svcReqCategory ? `?category=${svcReqCategory}` : "";
      const r = await fetch(`/api/service-requests/admin/list${params}`, { headers });
      if (r.ok) setSvcReqList((await r.json()).requests || []);
    } catch { /* ignore */ }
    setSvcReqLoading(false);
  }, [token, headers, svcReqCategory]);

  const submitServiceRequestDecision = async () => {
    if (!svcReqModal) return;
    setSvcReqSaving(true);
    try {
      const r = await fetch(`/api/service-requests/${svcReqModal.id}/decision`, {
        method: "PATCH", headers,
        body: JSON.stringify({ status: svcReqModal.status, quotedAmountUSD: svcReqAmount, note: svcReqNote }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast("Décision enregistrée — client notifié", "success");
      setSvcReqModal(null);
      setSvcReqAmount("");
      setSvcReqNote("");
      loadServiceRequests();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setSvcReqSaving(false); }
  };

  // ── Import Cost Engine — barèmes pays + liaisons de fret ─────────────────────
  const loadImportCostData = useCallback(async () => {
    if (!token) return;
    setImportCostLoading(true);
    try {
      const [cRes, lRes] = await Promise.all([
        fetch("/api/import-cost/admin/configs", { headers }),
        fetch("/api/import-cost/admin/lanes",   { headers }),
      ]);
      if (cRes.ok) setCostConfigs((await cRes.json()).configs || []);
      if (lRes.ok) setLaneRates((await lRes.json()).lanes || []);
    } catch { /* ignore */ }
    setImportCostLoading(false);
  }, [token, headers]);

  const saveCostConfig = async () => {
    if (!costConfigForm?.country) { showToast("Pays requis", "error"); return; }
    try {
      const r = await fetch("/api/import-cost/admin/configs", {
        method: "POST", headers, body: JSON.stringify(costConfigForm),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) { showToast("Barème enregistré."); setCostConfigForm(null); loadImportCostData(); }
      else showToast(d?.message || "Erreur", "error");
    } catch { showToast("Erreur réseau", "error"); }
  };

  const deleteCostConfig = async (id) => {
    if (!confirm("Supprimer ce barème ?")) return;
    await fetch(`/api/import-cost/admin/configs/${id}`, { method: "DELETE", headers });
    showToast("Barème supprimé.");
    loadImportCostData();
  };

  const saveLaneRate = async () => {
    if (!laneForm?.sourceCountry || !laneForm?.destCountry || !laneForm?.seaFreightUSD) {
      showToast("Pays d'origine, destination et tarif de fret requis", "error"); return;
    }
    try {
      const isEdit = !!laneForm._id;
      const r = await fetch(isEdit ? `/api/import-cost/admin/lanes/${laneForm._id}` : "/api/import-cost/admin/lanes", {
        method: isEdit ? "PATCH" : "POST", headers, body: JSON.stringify(laneForm),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) { showToast("Liaison enregistrée."); setLaneForm(null); loadImportCostData(); }
      else showToast(d?.message || "Erreur", "error");
    } catch { showToast("Erreur réseau", "error"); }
  };

  const deleteLaneRate = async (id) => {
    if (!confirm("Supprimer cette liaison ?")) return;
    await fetch(`/api/import-cost/admin/lanes/${id}`, { method: "DELETE", headers });
    showToast("Liaison supprimée.");
    loadImportCostData();
  };

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
      if (r.ok) { showToast("Configuration enregistrée."); setBizConfig(d.config); }
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

  const deleteExchangeRateFn = async (id) => {
    if (!confirm("Supprimer cette devise ?")) return;
    await fetch(`/api/admin/business-config/exchange-rates/${id}`, { method: "DELETE", headers });
    showToast("Devise supprimée.");
    loadBusinessConfig();
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

  const deleteCountryConfigFn = async (id) => {
    if (!confirm("Supprimer ce pays ?")) return;
    await fetch(`/api/admin/business-config/countries/${id}`, { method: "DELETE", headers });
    showToast("Pays supprimé.");
    loadBusinessConfig();
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

  const deleteDiscountCampaignFn = async (id) => {
    if (!confirm("Supprimer cette campagne ?")) return;
    await fetch(`/api/admin/business-config/discount-campaigns/${id}`, { method: "DELETE", headers });
    showToast("Campagne supprimée.");
    loadBusinessConfig();
  };

  // ── Journal d'audit ──────────────────────────────────────────────────────────
  const loadAuditLog = useCallback(async () => {
    if (!token) return;
    setAuditLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (auditFilter.action)   params.set("action",   auditFilter.action);
      if (auditFilter.resource) params.set("resource", auditFilter.resource);
      if (auditFilter.success)  params.set("success",  auditFilter.success);
      const [listRes, facetsRes] = await Promise.all([
        fetch(`/api/audit-log/admin/list?${params}`,   { headers }),
        fetch("/api/audit-log/admin/actions",           { headers }),
      ]);
      if (listRes.ok)   setAuditEntries((await listRes.json()).entries || []);
      if (facetsRes.ok) setAuditFacets(await facetsRes.json());
    } catch { /* ignore */ }
    setAuditLoading(false);
  }, [token, headers, auditFilter]);

  // ── Support Client ──────────────────────────────────────────────────────────
  const loadSupportChats = useCallback(async () => {
    if (!token) return;
    setSupportLoading(true);
    try {
      const r = await fetch("/api/chats/support", { headers });
      if (r.ok) { const d = await r.json(); setSupportChats(d.chats || []); }
    } catch { /* ignore */ }
    setSupportLoading(false);
  }, [token, headers]);

  // Toujours chargé sans filtre serveur — le filtre (reportFilter) s'applique
  // côté client, pour que le badge "en attente" reste exact quel que soit le
  // filtre actuellement affiché (voir pendingReports plus haut).
  const loadReports = useCallback(async () => {
    if (!token) return;
    setReportsLoading(true);
    try {
      const r = await fetch("/api/reports/admin?limit=100", { headers });
      if (r.ok) { const d = await r.json(); setReports(d.reports || []); }
    } catch { /* ignore */ }
    setReportsLoading(false);
  }, [token, headers]);

  const openTrustOverview = async (u) => {
    setTrustModal(u);
    setTrustOverview(null);
    setTrustLoading(true);
    try {
      const r = await fetch(`/api/users/${u._id}/trust-overview`, { headers });
      if (r.ok) { const d = await r.json(); setTrustOverview(d.overview); }
    } catch { /* ignore */ }
    setTrustLoading(false);
  };

  const decideReport = async (id, status) => {
    const note = status === "classe_sans_suite" ? null : prompt("Note (optionnel) :") || null;
    try {
      const r = await fetch(`/api/reports/admin/${id}`, {
        method: "PATCH", headers, body: JSON.stringify({ status, reviewNote: note }),
      });
      if (r.ok) { showToast("Signalement mis à jour."); loadReports(); }
      else showToast("Erreur", "error");
    } catch { showToast("Erreur réseau", "error"); }
  };

  const loadWaConversations = useCallback(async () => {
    if (!token) return;
    setWaLoading(true);
    try {
      const r = await fetch(`/api/whatsapp/admin/conversations?status=${waFilter}`, { headers });
      if (r.ok) { const d = await r.json(); setWaConversations(d.conversations || []); }
    } catch { /* ignore */ }
    setWaLoading(false);
  }, [token, headers, waFilter]);

  const openWaConversation = async (conv) => {
    try {
      const r = await fetch(`/api/whatsapp/admin/conversations/${conv._id}`, { headers });
      if (r.ok) { const d = await r.json(); setWaActive(d.conversation); }
    } catch { showToast("Erreur réseau", "error"); }
  };

  const sendWaReply = async () => {
    if (!waReply.trim() || !waActive) return;
    try {
      const r = await fetch(`/api/whatsapp/admin/conversations/${waActive._id}/reply`, {
        method: "POST", headers, body: JSON.stringify({ message: waReply.trim() }),
      });
      const d = await r.json();
      if (r.ok) { setWaActive(d.conversation); setWaReply(""); loadWaConversations(); }
      else showToast(d.message || "Échec d'envoi.", "error");
    } catch { showToast("Erreur réseau", "error"); }
  };

  const waSetStatus = async (id, status) => {
    try {
      const r = await fetch(`/api/whatsapp/admin/conversations/${id}/status`, {
        method: "PATCH", headers, body: JSON.stringify({ status }),
      });
      if (r.ok) {
        showToast(status === "bot" ? "Rendu au bot." : "Conversation clôturée.");
        setWaActive(null);
        loadWaConversations();
      }
    } catch { showToast("Erreur réseau", "error"); }
  };

  const openSupportChat = useCallback(async (chat) => {
    setSupportActive(chat);
    setSupportMsgLoading(true);
    setSupportMessages([]);
    try {
      const r = await fetch(`/api/chats/${chat._id}`, { headers });
      if (r.ok) {
        const d = await r.json();
        setSupportMessages(d.messages || []);
        setSupportChats((prev) => prev.map((c) => c._id === chat._id ? { ...c, unread: 0, needsReply: false } : c));
      }
    } catch { /* ignore */ }
    setSupportMsgLoading(false);
  }, [headers]);

  const sendSupportReply = useCallback(async () => {
    const content = supportReply.trim();
    if (!content || !supportActive) return;
    setSupportSending(true);
    try {
      const r = await fetch(`/api/chats/${supportActive._id}`, {
        method: "POST", headers, body: JSON.stringify({ content }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setSupportMessages((prev) => [...prev, d.message]);
        setSupportReply("");
        setSupportChats((prev) => prev.map((c) =>
          c._id === supportActive._id
            ? { ...c, lastMessage: content.slice(0, 100), lastMessageAt: new Date().toISOString(), needsReply: false }
            : c
        ));
      } else {
        showToast(d.message || "Erreur lors de l'envoi.", "error");
      }
    } catch { showToast("Erreur réseau.", "error"); }
    setSupportSending(false);
  }, [headers, supportReply, supportActive, showToast]);

  // Bug réel corrigé (audit) : plafonné à 50, trié du plus récent au plus
  // ancien, sans aucune pagination — les dossiers les plus ANCIENS (donc les
  // plus en retard de traitement) disparaissaient silencieusement en premier
  // dès que le nombre de dossiers dépassait 50. `limit` paramétrable +
  // `kycTotal` renvoyé par le backend permettent désormais un "Charger plus"
  // réel plutôt qu'un plafond invisible.
  const loadKycList = useCallback(async (status = "", limit = kycLimit) => {
    if (!token) return;
    setKycLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (status) params.set("status", status);
      const r = await fetch(`/api/kyc/admin/list?${params}`, { headers });
      if (r.ok) { const d = await r.json(); setKycList(d.users || []); setKycTotal(d.total || 0); }
    } catch { /* ignore */ }
    setKycLoading(false);
  }, [token, headers, kycLimit]);

  const loadMoreKyc = useCallback(() => {
    const next = kycLimit + 100;
    setKycLimit(next);
    loadKycList(kycFilter === "ALL" ? "" : kycFilter, next);
  }, [kycLimit, kycFilter, loadKycList]);

  // Compteur "en attente" — toujours interrogé SANS filtre de statut (le backend
  // applique alors son défaut EN_ATTENTE + A_REVOIR_MANUELLEMENT, voir
  // kycController.getKycList) donc jamais affecté par le filtre choisi dans l'UI.
  const loadKycPendingTotal = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch("/api/kyc/admin/list?limit=1", { headers });
      if (r.ok) { const d = await r.json(); setKycPendingTotal(d.total || 0); }
    } catch { /* ignore */ }
  }, [token, headers]);

  useEffect(() => { loadKycPendingTotal(); }, [loadKycPendingTotal]);

  const loadCertList = useCallback(async () => {
    if (!token) return;
    setCertLoading(true);
    try {
      const r = await fetch(`/api/certification/admin/list?limit=100`, { headers });
      if (r.ok) { const d = await r.json(); setCertList(d.certifications || []); }
    } catch { /* ignore */ }
    setCertLoading(false);
  }, [token, headers]);

  const handleCertLevelReview = useCallback(async (userId, level) => {
    setCertReviewLoading(true); setCertReviewMsg("");
    try {
      const r = await fetch(`/api/certification/admin/${userId}/level/${level}/review`, {
        method: "PATCH", headers, body: JSON.stringify(certReviewForm),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setCertReviewMsg(`✅ Niveau ${level} : ${certReviewForm.decision}`);
        setCertReviewLevel(null);
        loadCertList();
        if (certDetail?.userId?._id === userId) {
          const dr = await fetch(`/api/certification/admin/${userId}`, { headers });
          if (dr.ok) { const dd = await dr.json(); setCertDetail(dd.certification); }
        }
      } else {
        setCertReviewMsg(`❌ ${d.message || "Erreur."}`);
      }
    } catch { setCertReviewMsg("❌ Connexion impossible."); }
    setCertReviewLoading(false);
  }, [headers, certReviewForm, certDetail, loadCertList]);

  const handleCertBadge = useCallback(async (userId) => {
    setCertReviewLoading(true); setCertReviewMsg("");
    try {
      const r = await fetch(`/api/certification/admin/${userId}/badge`, {
        method: "PATCH", headers, body: JSON.stringify(certBadgeForm),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setCertReviewMsg(`✅ Badge attribué : ${certBadgeForm.badge}`);
        loadCertList();
        if (certDetail?.userId?._id === userId) {
          const dr = await fetch(`/api/certification/admin/${userId}`, { headers });
          if (dr.ok) { const dd = await dr.json(); setCertDetail(dd.certification); }
        }
      } else {
        setCertReviewMsg(`❌ ${d.message || "Erreur."}`);
      }
    } catch { setCertReviewMsg("❌ Connexion impossible."); }
    setCertReviewLoading(false);
  }, [headers, certBadgeForm, certDetail, loadCertList]);

  const handleCertRelance = useCallback(async () => {
    if (!certDetail?.userId?._id) return;
    setCertReviewLoading(true);
    try {
      const r = await fetch(`/api/certification/admin/${certDetail.userId._id}/relance`, { method: "POST", headers });
      const d = await r.json().catch(() => ({}));
      if (r.ok) showToast(`Relance envoyée (${d.missingDocs.join(", ")})`);
      else showToast(d.message || "Erreur", "error");
    } catch { showToast("Connexion impossible", "error"); }
    setCertReviewLoading(false);
  }, [headers, certDetail, showToast]);

  // Ouvre le dossier KYC — charge le détail complet (photos recto/verso/selfie,
  // permis de conduire...) depuis /api/kyc/admin/:userId, car la LISTE exclut
  // volontairement ces images base64 (trop lourdes pour un listing de 50 dossiers).
  const openKycDetail = useCallback(async (u) => {
    setKycDetailUser(u);
    setKycReviewForm({ decision: u.kycStatus === "VERIFIE" ? "EN_ATTENTE" : "VERIFIE", note: "" });
    setKycReviewMsg("");
    setKycDetailLoading(true);
    try {
      const r = await fetch(`/api/kyc/admin/${u._id}`, { headers });
      if (r.ok) {
        const d = await r.json();
        setKycDetailUser(d.user);
      }
    } catch { /* garde les données de la liste en cas d'échec réseau */ }
    setKycDetailLoading(false);
  }, [headers]);

  const handleKycReview = async (userId) => {
    setKycReviewLoading(true); setKycReviewMsg("");
    try {
      const r = await fetch(`/api/kyc/admin/${userId}/review`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(kycReviewForm),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setKycReviewMsg(`✅ Décision enregistrée : ${kycReviewForm.decision}`);
        setKycDetailUser(null);
        loadKycList(kycFilter);
        loadKycPendingTotal();
      } else {
        setKycReviewMsg(`❌ ${d.message || "Erreur."}`);
      }
    } catch { setKycReviewMsg("❌ Connexion impossible."); }
    setKycReviewLoading(false);
  };

  // ── PMS Admin ─────────────────────────────────────────────────────────────
  const loadPMSAdmin = useCallback(async () => {
    if (!token) return;
    setPmsLoading(true);
    try {
      const published = pmsFilter === "all" ? "" : `?published=${pmsFilter === "published"}`;
      const [statsRes, showroomsRes] = await Promise.all([
        fetch("/api/pms/admin/stats",             { headers }),
        fetch(`/api/pms/admin/showrooms${published}`, { headers }),
      ]);
      if (statsRes.ok)     setPmsStats(await statsRes.json());
      if (showroomsRes.ok) setPmsShowrooms((await showroomsRes.json()).showrooms || []);
    } catch { /* ignore */ }
    setPmsLoading(false);
  }, [token, headers, pmsFilter]);

  const loadFoundingPartners = useCallback(async () => {
    if (!token) return;
    setFoundingLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        fetch("/api/partner-onboarding/admin/list?limit=100", { headers }),
        fetch("/api/partner-onboarding/admin/stats",          { headers }),
      ]);
      if (listRes.ok)  setFoundingList((await listRes.json()).onboardings || []);
      if (statsRes.ok) setFoundingStats(await statsRes.json());
    } catch { /* ignore */ }
    setFoundingLoading(false);
  }, [token, headers]);

  const foundingApprove = async (id, note) => {
    if (foundingSubmitting) return; // évite le double-clic (double envoi de LOI)
    setFoundingSubmitting(true);
    try {
      const r = await fetch(`/api/partner-onboarding/admin/${id}/approve`, {
        method: "POST", headers,
        body: JSON.stringify({ note: note || "" }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      const company = foundingList.find(o => o._id === id)?.companyInfo?.legalName || "Partenaire";
      setFoundingSignLink({ id, link: data.signLink, type: "loi", companyName: company });
      showToast("Candidature approuvée — LOI envoyée par email", "success");
      setFoundingAction(null);
      setFoundingNote("");
      loadFoundingPartners();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setFoundingSubmitting(false); }
  };

  const foundingSendAgreement = async (id) => {
    if (foundingRowActionId) return; // évite le double-clic (double envoi de l'accord)
    setFoundingRowActionId(id);
    try {
      const r = await fetch(`/api/partner-onboarding/admin/${id}/send-agreement`, {
        method: "POST", headers,
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      const company = foundingList.find(o => o._id === id)?.companyInfo?.legalName || "Partenaire";
      setFoundingSignLink({ id, link: data.signLink, type: "agreement", companyName: company });
      showToast("Accord envoyé par email", "success");
      loadFoundingPartners();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setFoundingRowActionId(null); }
  };

  // Renvoie un lien de signature FRAIS (LOI ou Accord, selon le statut actuel)
  // dans un seul email — remplace l'ancien bouton "Renvoyer l'accord" qui
  // appelait send-agreement (lequel exige status "loi_signee" et échouait donc
  // systématiquement une fois l'accord déjà envoyé), et comble l'absence totale
  // de moyen de renvoyer une LOI dont le lien a expiré ou ne s'est pas ouvert.
  const foundingResendDocuments = async (id) => {
    if (foundingRowActionId) return;
    setFoundingRowActionId(id);
    try {
      const r = await fetch(`/api/partner-onboarding/admin/${id}/resend-documents`, {
        method: "POST", headers,
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      const company = foundingList.find(o => o._id === id)?.companyInfo?.legalName || "Partenaire";
      setFoundingSignLink({ id, link: data.signLink, type: data.status === "loi_envoyee" ? "loi" : "agreement", companyName: company });
      showToast("Nouveau lien de signature envoyé par email", "success");
      loadFoundingPartners();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setFoundingRowActionId(null); }
  };

  // Relance une entité SANS AUCUN dossier Founding Partner (voir adminList,
  // lignes "orphanRows" — un partenaire ayant une entité PartnerBusiness mais
  // n'ayant jamais cliqué "Commencer ma candidature"). `id` est ici l'ID de
  // l'entité (PartnerBusiness), pas d'un PartnerOnboarding — il n'en existe pas.
  const foundingRelaunchBusiness = async (businessId) => {
    if (foundingRowActionId) return;
    setFoundingRowActionId(businessId);
    try {
      const r = await fetch(`/api/partner-onboarding/admin/relaunch-business/${businessId}`, {
        method: "POST", headers,
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast("Invitation à démarrer sa candidature envoyée par email", "success");
      loadFoundingPartners();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setFoundingRowActionId(null); }
  };

  // Relance un dossier resté incomplet (brouillon jamais soumis, ou déjà relancé
  // une première fois) — endpoint backend existant depuis longtemps
  // (adminRequestInfo) mais jusqu'ici jamais appelé depuis cette interface : un
  // partenaire ayant sauté des étapes n'avait aucun moyen d'être notifié pour
  // compléter son dossier.
  const foundingRequestInfo = async (id, infoRequested) => {
    if (!infoRequested?.trim()) { showToast("Précisez ce qui doit être complété", "error"); return; }
    if (foundingSubmitting) return;
    setFoundingSubmitting(true);
    try {
      const r = await fetch(`/api/partner-onboarding/admin/${id}/request-info`, {
        method: "POST", headers,
        body: JSON.stringify({ infoRequested }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast("Partenaire relancé — notification envoyée", "success");
      setFoundingAction(null);
      setFoundingNote("");
      loadFoundingPartners();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setFoundingSubmitting(false); }
  };

  const foundingReject = async (id, note) => {
    if (!note?.trim()) { showToast("Note de rejet requise", "error"); return; }
    if (foundingSubmitting) return; // évite le double-clic (double rejet)
    setFoundingSubmitting(true);
    try {
      const r = await fetch(`/api/partner-onboarding/admin/${id}/reject`, {
        method: "POST", headers,
        body: JSON.stringify({ note }),
      });
      if (!r.ok) { showToast("Erreur", "error"); return; }
      showToast("Dossier rejeté", "success");
      setFoundingAction(null);
      setFoundingNote("");
      loadFoundingPartners();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setFoundingSubmitting(false); }
  };

  const foundingUpdateCRM = async (id, data) => {
    try {
      const r = await fetch(`/api/partner-onboarding/admin/${id}/crm`, {
        method: "PATCH", headers,
        body: JSON.stringify(data),
      });
      const json = await r.json();
      if (!r.ok) { showToast(json.message || "Erreur CRM", "error"); return; }
      showToast("CRM mis à jour", "success");
      setFoundingCRMEdit(null);
      setFoundingList((prev) => prev.map((o) =>
        o._id === id ? { ...o, adminCRM: json.adminCRM } : o
      ));
    } catch { showToast("Erreur réseau", "error"); }
  };

  const adminToggleShowroom = async (id) => {
    try {
      const r = await fetch(`/api/pms/admin/showrooms/${id}/toggle`, { method: "PATCH", headers });
      if (r.ok) {
        const { isPublished } = await r.json();
        setPmsShowrooms((prev) => prev.map((s) => s._id === id ? { ...s, isPublished } : s));
        showToast(isPublished ? "Showroom publié" : "Showroom dépublié", "success");
      }
    } catch { showToast("Erreur", "error"); }
  };

  // ── Partner Verification ───────────────────────────────────────────────────
  const loadPartnerVerif = useCallback(async () => {
    if (!token) return;
    setPvLoading(true);
    try {
      const params = new URLSearchParams();
      if (pvFilter.status)      params.set("status",      pvFilter.status);
      if (pvFilter.trustLevel)  params.set("trustLevel",  pvFilter.trustLevel);
      if (pvFilter.companyType) params.set("companyType", pvFilter.companyType);
      if (pvFilter.search)      params.set("search",      pvFilter.search);
      params.set("limit", "100");
      const [listRes, statsRes] = await Promise.all([
        fetch(`/api/partner-verif/admin/list?${params}`, { headers }),
        fetch("/api/partner-verif/admin/stats",          { headers }),
      ]);
      if (listRes.ok)  setPvList((await listRes.json()).verifications || []);
      if (statsRes.ok) setPvStats(await statsRes.json());
    } catch { /* ignore */ }
    setPvLoading(false);
  }, [token, headers, pvFilter]);

  useEffect(() => {
    if (activeTab === "import_export")  { loadImportExport(); loadIeTransactions(); }
    if (activeTab === "exportateurs")   loadImporters();
    if (activeTab === "commissions")    loadCommissions();
    if (activeTab === "factures")       { loadInvoices(); loadServiceInvoicesAdmin(); }
    if (activeTab === "kyc")            loadKycList(kycFilter);
    if (activeTab === "certification")  loadCertList();
    if (activeTab === "partner_verif")     loadPartnerVerif();
    if (activeTab === "pms_partners")      loadPMSAdmin();
    if (activeTab === "founding_partners") loadFoundingPartners();
    if (activeTab === "support")           loadSupportChats();
    if (activeTab === "paiements")         loadSubRequests();
    if (activeTab === "reviews")           loadReviews();
    if (activeTab === "audit")             loadAuditLog();
    if (activeTab === "analytics")         loadAnalytics();
    if (activeTab === "email_delivery")    loadEmailDelivery();
    if (activeTab === "financement")       loadFinancing();
    if (activeTab === "roles")             loadAdminAccounts();
    if (activeTab === "ads" || activeTab === "marketing") loadAds();
    if (activeTab === "assurance")         loadInsurance();
    if (activeTab === "service_requests")  loadServiceRequests();
    if (activeTab === "import_cost")       loadImportCostData();
    if (activeTab === "reports")           loadReports();
    if (activeTab === "whatsapp")          loadWaConversations();
    if (activeTab === "business_config")   loadBusinessConfig();
    if (activeTab === "reversements")      loadPayouts();
  }, [activeTab, loadImportExport, loadIeTransactions, loadImporters, loadCommissions, loadInvoices, loadKycList, kycFilter, loadCertList, loadPartnerVerif, loadPMSAdmin, loadFoundingPartners, loadSupportChats, loadSubRequests, loadReviews, loadAuditLog, loadAnalytics, loadFinancing, loadAdminAccounts, loadAds, loadInsurance, loadServiceRequests, loadImportCostData, loadReports, loadWaConversations, loadBusinessConfig, loadPayouts]);

  // Chargé indépendamment de l'onglet actif (contrairement au bloc ci-dessus,
  // conditionné par activeTab === "business_config") : le message d'invitation
  // Founding Partner (vue "onboarding") a besoin des taux de commission
  // courants même si l'admin n'a jamais ouvert l'onglet Configuration métier.
  useEffect(() => { if (!bizConfig) loadBusinessConfig(); }, [bizConfig, loadBusinessConfig]);

  // Rafraîchissement périodique de la liste support (nouvelles demandes) tant que
  // l'onglet est affiché — même logique de polling que le widget chat public.
  useEffect(() => {
    if (activeTab !== "support") return undefined;
    const t = setInterval(loadSupportChats, 15_000);
    return () => clearInterval(t);
  }, [activeTab, loadSupportChats]);

  // Temps réel : un client/partenaire qui écrit doit apparaître instantanément
  // dans la file support partagée, sans attendre jusqu'à 15s de polling — et si
  // la conversation ouverte par cet admin reçoit un message, l'afficher tout de
  // suite plutôt qu'au prochain clic.
  useEffect(() => {
    return onSocket("chat:message", ({ chatId, message }) => {
      if (supportActive?._id === chatId) {
        setSupportMessages((prev) => prev.some((m) => m._id === message._id) ? prev : [...prev, message]);
      }
      if (activeTab === "support") loadSupportChats();
    });
  }, [onSocket, supportActive, activeTab, loadSupportChats]);

  // Bug réel corrigé (audit) : le backend émettait déjà "refund_needed" à
  // plusieurs endroits (annulation payée par le client/partenaire, litige
  // résolu en compensation) mais AUCUN écouteur n'existait côté front — le
  // signal se perdait silencieusement, sans aucune trace exploitable pour
  // l'admin qui doit traiter le remboursement manuellement.
  useEffect(() => {
    return onSocket("refund_needed", ({ reference, reason }) => {
      showToast(`💸 Remboursement à traiter — ${reference || ""} : ${reason || ""}`, "error");
    });
  }, [onSocket, showToast]);

  useEffect(() => {
    return onSocket("notification_new", (payload) => {
      if (payload?.type === "new_vehicle" || payload?.type === "new_driver") {
        // Bump immédiat du badge (feedback instantané) + rechargement réel de
        // la liste juste après (l'admin voit l'annonce elle-même, pas
        // seulement un chiffre qui bouge — voir refreshPendingListings).
        setLiveNewListings((n) => n + 1);
        showToast(payload.titre || "🚗 Nouvelle annonce à valider", "info");
        refreshPendingListings();
      } else if (payload?.type === "system" && /litige/i.test(payload?.titre || "")) {
        setLiveDisputes((n) => n + 1);
        showToast(payload.titre || "⚖️ Nouveau litige", "info");
        refreshPendingListings();
      } else if (payload?.type === "ie_request") {
        // Bug réel corrigé (audit) : createRequest (Import/Export) notifiait
        // déjà l'admin via Notification.insertMany, mais sans émission socket
        // — jamais de rafraîchissement temps réel de l'onglet "Demandes
        // Import/Export", même trou que vehicle/driver comblé plus tôt.
        showToast(payload.titre || "🌍 Nouvelle demande Import/Export", "info");
        loadImportExport();
      } else if (payload?.type === "ie_profile" || payload?.type === "ie_listing") {
        showToast(payload.titre || "📦 Nouveauté Import/Export à examiner", "info");
        loadImporters();
      }
    });
  }, [onSocket, showToast, refreshPendingListings, loadImportExport, loadImporters]);

  // Ferme tous les modals au changement d'onglet pour éviter les états résiduels
  useEffect(() => {
    setConfirm(null);
    setRejectModal(null);
    setRejectReason("");
    setDriverRejectModal(null);
    setDriverRejectReason("");
    setBkActionModal(null);
    setBkCancelReason("");
    setDisputeModal(null);
    setForceModal(null);
    setReviewModal(null);
    setListingRejectModal(null);
    setExporterDetail(null);
    setKycDetailUser(null);
    setPvDetail(null);
    setPvCreateModal(false);
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions utilisateurs ────────────────────────────────────────────────────
  const toggleBlock = useCallback(async (uid) => {
    try {
      const res = await fetch(`/api/users/${uid}/toggle`, { method: "PATCH", headers });
      if (!res.ok) throw new Error();
      const { user: updated } = await res.json();
      setUsers((prev) => prev.map((u) => u._id === uid ? { ...u, isActive: updated.isActive } : u));
      showToast(updated.isActive ? "Compte réactivé" : "Compte bloqué");
    } catch { showToast("Erreur lors du blocage", "error"); }
  }, [headers, showToast]);

  const changeRole = useCallback(async (uid, role) => {
    try {
      const res = await fetch(`/api/users/${uid}/role`, {
        method: "PATCH", headers, body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error();
      const { user: updated } = await res.json();
      setUsers((prev) => prev.map((u) => u._id === uid ? { ...u, role: updated.role } : u));
      showToast(`Rôle changé → ${updated.role}`);
    } catch { showToast("Erreur lors du changement de rôle", "error"); }
  }, [headers, showToast]);

  const deleteUser = useCallback(async (uid) => {
    try {
      const res = await fetch(`/api/users/${uid}`, { method: "DELETE", headers });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      setUsers((prev) => prev.filter((u) => u._id !== uid));
      showToast("Utilisateur supprimé");
    } catch (e) { showToast(e.message || "Erreur lors de la suppression", "error"); }
  }, [headers, showToast]);

  // Bug réel corrigé (audit) : aucun formulaire n'exposait le numéro de
  // téléphone d'un compte en écriture côté admin (affiché en lecture seule
  // uniquement) — un partenaire inscrit sans téléphone, ou avec un numéro
  // faux/périmé, n'avait aucun moyen d'être corrigé par le support.
  const updatePhone = useCallback(async (uid, currentPhone) => {
    const next = window.prompt("Numéro de téléphone (laisser vide pour retirer) :", currentPhone || "");
    if (next === null) return; // annulé
    try {
      const res = await fetch(`/api/users/${uid}/phone`, {
        method: "PATCH", headers, body: JSON.stringify({ phone: next.trim() || null }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.message || "Erreur lors de la mise à jour.");
      setUsers((prev) => prev.map((u) => u._id === uid ? { ...u, phone: d.user.phone, phoneVerified: d.user.phoneVerified } : u));
      showToast("Téléphone mis à jour");
    } catch (e) { showToast(e.message || "Erreur lors de la mise à jour", "error"); }
  }, [headers, showToast]);

  // ── Actions véhicules ───────────────────────────────────────────────────────
  const updateVehicleStatus = useCallback(async (vid, status, reason = "") => {
    try {
      const res = await fetch(`/api/vehicles/${vid}/status`, {
        method: "PATCH", headers, body: JSON.stringify({ status, rejectionReason: reason }),
      });
      if (!res.ok) throw new Error();
      setVehicles((prev) => prev.map((v) => (v._id || v.id) === vid ? { ...v, status } : v));
      showToast(`Annonce ${status === "approved" ? "approuvée" : "rejetée"}`);
    } catch { showToast("Erreur lors de la mise à jour", "error"); }
  }, [headers, showToast]);

  const deleteVehicle = useCallback(async (vid) => {
    try {
      const res = await fetch(`/api/vehicles/${vid}`, { method: "DELETE", headers });
      if (!res.ok) throw new Error();
      setVehicles((prev) => prev.filter((v) => (v._id || v.id) !== vid));
      showToast("Annonce supprimée");
    } catch { showToast("Erreur lors de la suppression", "error"); }
  }, [headers, showToast]);

  // Même endpoint que updateDriverStatus ci-dessous, mais met à jour le
  // statut EN PLACE (map) au lieu de retirer le chauffeur de la liste — pour
  // CatalogueSection, qui affiche désormais tous les statuts (voir sous-
  // filtres pending/approved/rejected/all) : filtrer ferait disparaître la
  // ligne au lieu de simplement changer son badge de statut. `updateDriverStatus`
  // (filter) reste utilisé tel quel par l'onglet "Chauffeurs" dédié, dont la
  // liste pending-only doit bien voir la ligne disparaître une fois traitée.
  const updateDriverStatusInPlace = useCallback(async (did, status, reason = "") => {
    try {
      const res = await fetch(`/api/drivers/${did}/status`, {
        method: "PATCH", headers, body: JSON.stringify({ status, rejectionReason: reason }),
      });
      if (!res.ok) throw new Error();
      setDrivers((prev) => prev.map((d) => (d._id === did ? { ...d, status, rejectionReason: reason || d.rejectionReason } : d)));
      showToast(`Chauffeur ${status === "approved" ? "approuvé" : "rejeté"}`);
    } catch { showToast("Erreur lors de la mise à jour", "error"); }
  }, [headers, showToast]);

  // ── Actions chauffeurs ──────────────────────────────────────────────────────
  const updateDriverStatus = useCallback(async (did, status, reason = "") => {
    try {
      const res = await fetch(`/api/drivers/${did}/status`, {
        method: "PATCH", headers, body: JSON.stringify({ status, rejectionReason: reason }),
      });
      if (!res.ok) throw new Error();
      setDrivers((prev) => prev.filter((d) => d._id !== did));
      showToast(`Chauffeur ${status === "approved" ? "approuvé" : "rejeté"}`);
    } catch { showToast("Erreur lors de la mise à jour", "error"); }
  }, [headers, showToast]);

  // Retire un chauffeur actif du catalogue public (repasse en "rejected" —
  // Driver.status n'a pas de statut "suspendu" dédié) — action utilisée par la
  // section "Chauffeurs actifs" (voir tab chauffeurs).
  const deactivateActiveDriver = useCallback(async (did) => {
    try {
      const res = await fetch(`/api/drivers/${did}/status`, {
        method: "PATCH", headers, body: JSON.stringify({ status: "rejected", rejectionReason: "Désactivé par l'administration" }),
      });
      if (!res.ok) throw new Error();
      setActiveDrivers((prev) => prev.filter((d) => d._id !== did));
      showToast("Chauffeur retiré du catalogue.");
    } catch { showToast("Erreur lors de la mise à jour", "error"); }
  }, [headers, showToast]);

  // ── Actions commandes (admin) ───────────────────────────────────────────────
  const adminUpdateBooking = useCallback(async (bid, status, reason = "", cancelReasonCode = null) => {
    try {
      const res = await fetch(`/api/bookings/${bid}/status`, {
        method: "PATCH", headers, body: JSON.stringify({ status, cancelReason: reason, cancelReasonCode }),
      });
      if (!res.ok) throw new Error();
      setBookings((prev) => prev.map((b) => b._id === bid ? { ...b, status } : b));
      showToast(`Commande ${status === "cancelled" ? "annulée" : status === "confirmed" ? "confirmée" : "mise à jour"}`);
    } catch { showToast("Erreur lors de la mise à jour", "error"); }
  }, [headers, showToast]);

  const adminResolveDispute = useCallback(async (bid, resolution, note, refundClient = false) => {
    try {
      const res = await fetch(`/api/bookings/${bid}/resolve-dispute`, {
        method: "PATCH", headers, body: JSON.stringify({ resolution, note, refundClient }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      setBookings((prev) => prev.map((b) => b._id === bid ? { ...b, status: resolution === "compensated" ? "completed" : resolution } : b));
      showToast(`Litige résolu — ${resolution}`);
    } catch (e) { showToast(e.message || "Erreur résolution litige", "error"); }
  }, [headers, showToast]);

  const adminForceComplete = useCallback(async (bid, finalAmount, note) => {
    try {
      const res = await fetch(`/api/bookings/${bid}/admin-force-complete`, {
        method: "PATCH", headers, body: JSON.stringify({ finalAmount, note }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      setBookings((prev) => prev.map((b) => b._id === bid ? { ...b, status: "completed" } : b));
      showToast("Commande finalisée avec succès.");
    } catch (e) { showToast(e.message || "Erreur finalisation", "error"); }
  }, [headers, showToast]);

  const adminDeleteBooking = useCallback(async (bid) => {
    try {
      const res = await fetch(`/api/bookings/${bid}/admin-delete`, { method: "DELETE", headers });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      setBookings((prev) => prev.filter((b) => b._id !== bid));
      showToast("Commande supprimée.");
    } catch (e) { showToast(e.message || "Erreur suppression", "error"); }
  }, [headers, showToast]);

  const exportBookings = useCallback((fmt = "csv") => {
    const params = new URLSearchParams({ format: fmt });
    if (bkStatus !== "all") params.set("status", bkStatus);
    if (bkSearch.trim()) params.set("search", bkSearch.trim());
    window.open(`/api/bookings/admin/export?${params}&_t=${token}`, "_blank");
  }, [bkStatus, bkSearch, token]);

  // ── Broadcast notification ─────────────────────────────────────────────────
  const sendBroadcast = useCallback(async () => {
    if (!broadcastForm.titre || !broadcastForm.message) {
      showToast("Titre et message requis", "error"); return;
    }
    setBroadcastSending(true);
    try {
      const res = await fetch("/api/notifications/admin/broadcast", {
        method: "POST", headers, body: JSON.stringify(broadcastForm),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      showToast(d.message || "Notification envoyée");
      setBroadcastModal(false);
      setBroadcastForm({ titre: "", message: "", targetRole: "all", lien: "" });
    } catch (e) { showToast(e.message || "Erreur envoi", "error"); }
    finally { setBroadcastSending(false); }
  }, [broadcastForm, headers, showToast]);

  // ── Filtres & pagination ────────────────────────────────────────────────────
  // Pays réellement présents parmi les comptes (dynamique — ne dépend pas
  // d'une liste figée, couvre aussi un code pays détecté par géoloc/IP qui ne
  // serait pas dans COUNTRIES_CONFIG).
  const userCountryOptions = useMemo(() => {
    const codes = [...new Set(users.map((u) => u.country).filter(Boolean))];
    return codes.sort((a, b) => (COUNTRIES_CONFIG.find((c) => c.code === a)?.name || a)
      .localeCompare(COUNTRIES_CONFIG.find((c) => c.code === b)?.name || b));
  }, [users, COUNTRIES_CONFIG]);

  const filteredUsers = useMemo(() => {
    let r = users;
    if (userRole !== "all") r = r.filter((u) => u.role === userRole);
    if (userCountry !== "all") r = r.filter((u) => u.country === userCountry);
    if (userSearch.trim()) {
      const q = userSearch.toLowerCase();
      r = r.filter((u) =>
        u.firstName?.toLowerCase().includes(q) ||
        u.lastName?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q)
      );
    }
    return r;
  }, [users, userRole, userCountry, userSearch]);

  const filteredVehicles = useMemo(() =>
    vehStatus === "all" ? vehicles : vehicles.filter((v) => v.status === vehStatus),
    [vehicles, vehStatus]
  );

  const filteredBookings = useMemo(() => {
    let list = bookings;
    if (bkStatus !== "all") {
      // Le KPI "En cours" agrège plusieurs statuts (voir bkStatus="confirmed,preparing,...")
      // — sans ce split, cliquer dessus ne filtrait jamais rien (aucune
      // réservation n'a littéralement ce statut composé), bug réel corrigé.
      const wanted = bkStatus.split(",");
      list = list.filter((b) => wanted.includes(b.status));
    }
    if (bkType   !== "all") list = list.filter((b) => b.type   === bkType);
    if (bkSearch.trim()) {
      const q = bkSearch.toLowerCase();
      list = list.filter((b) =>
        (b.reference || "").toLowerCase().includes(q) ||
        (b.clientInfo?.firstName || "").toLowerCase().includes(q) ||
        (b.clientInfo?.lastName  || "").toLowerCase().includes(q) ||
        (b.clientInfo?.email     || "").toLowerCase().includes(q) ||
        (b.clientInfo?.phone     || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [bookings, bkStatus, bkType, bkSearch]);

  const paginate = (arr, page) => arr.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = (arr) => Math.ceil(arr.length / PAGE_SIZE) || 1;

  // ── Guard ───────────────────────────────────────────────────────────────────
  if (!isAuthenticated || user?.role !== "admin") return null;

  // ── Revenue chart data ──────────────────────────────────────────────────────
  const revByMonth = stats?.revenue?.byMonth || [];
  const maxRev     = Math.max(...revByMonth.map((m) => m.total), 1);

  // ── NAV_GROUPS (défini dans le rendu pour accès au state) ──────────────────
  const pendingVeh = vehicles.filter((v) => v.status === "pending").length;
  const pendingBk  = bookings.filter((b) => b.status === "pending").length;
  const disputedBk = bookings.filter((b) => b.status === "disputed").length;
  // `drivers` couvre désormais tous les statuts (voir loadAll, /api/drivers/pending
  // ?status=all — auparavant "pending" uniquement) : les badges de compteur "à
  // traiter" doivent explicitement filtrer sur pending pour ne pas gonfler avec
  // les profils déjà publiés/rejetés.
  const pendingDriversList = drivers.filter((d) => d.status === "pending");
  const pendingDrivers = pendingDriversList.length;
  // Ne PAS dériver ce badge de kycList : cette liste est filtrée par kycFilter
  // (statut choisi dans l'UI) et change de contenu selon l'onglet affiché — un
  // badge basé dessus retomberait trompeusement à 0 dès qu'un autre filtre est
  // sélectionné. kycPendingTotal est interrogé indépendamment (voir plus haut).
  const pendingKyc  = kycPendingTotal;
  const pendingCert = certList.filter((c) => ["level1","level2","level3","level4","level5","level6","level7"].some((l) => c[l]?.status === "submitted")).length;
  const pendingImp = importerProfiles.filter((p) => p.status === "pending").length;
  const pendingInv = invoices.filter((i) => i.status === "pending").length;
  const pendingSub = subRequests.reduce((sum, s) =>
    sum + (s.paymentHistory || []).filter((p) => p.status === "pending").length
        + (s.boosts || []).filter((b) => !b.isActive).length, 0);
  const pendingIe  = ieRequests.filter((r) => r.status === "pending").length;
  const pendingSvcReq = svcReqList.filter((r) => r.status === "pending").length;
  const pendingSupport = supportChats.filter((c) => c.needsReply).length;
  const pendingReports = reports.filter((r) => r.status === "en_attente").length;
  const pendingWa = waConversations.filter((c) => c.status === "escalated").length;
  // Basé sur pvStats (non filtré) plutôt que pvList — pvList reflète les filtres
  // actifs de l'onglet (statut/niveau/type/recherche), donc son décompte
  // s'effondrait faussement dès qu'un admin appliquait un filtre (même bug que
  // l'ancien badge KYC, corrigé séparément).
  const pendingPv       = (pvStats?.byStatus?.en_attente || 0) + (pvStats?.byStatus?.en_cours || 0);
  const foundingPending = foundingList.filter((o) => ["soumis", "en_review"].includes(o.status)).length;

  // Onglets restreints par scope admin — miroir exact des routes réellement
  // gardées par requireAdminScope() côté serveur (server/routes/*.js). Un
  // onglet absent d'ici reste visible à tout admin (aucune route serveur
  // associée ne vérifie de scope, donc le restreindre ici serait trompeur :
  // ni plus ni moins permissif que le backend). adminScope vide/absent ou
  // contenant "super_admin" = accès complet, même règle que requireAdminScope.
  const TAB_SCOPES = {
    kyc:              "kyc",
    support:          "support",
    whatsapp:         "support",
    reviews:          "moderation",
    reports:          "moderation",
    import_export:    "import_export",
    exportateurs:     "import_export",
    assurance:        "finance",
    financement:      "finance",
    service_requests: "finance",
    business_config:  "finance",
    // Bug réel corrigé (audit) : server/routes/importCost.js protège tous ses
    // endpoints admin avec requireAdminScope("finance"), mais cette entrée
    // manquait ici — un admin sans ce scope voyait l'onglet dans le menu et
    // n'obtenait que des 403 en boucle (tableau vide, aucune action possible).
    import_cost:      "finance",
    reversements:     "finance",
  };
  const canSeeTab = (key) => {
    const scope = TAB_SCOPES[key];
    if (!scope) return true;
    const scopes = user?.adminScope || [];
    return scopes.length === 0 || scopes.includes("super_admin") || scopes.includes(scope);
  };

  const NAV_GROUPS_ALL = [
    {
      label: "TABLEAU DE BORD",
      items: [
        { key: "dashboard",  icon: "📊", label: "Vue d'ensemble" },
        { key: "analytics",  icon: "📈", label: "Analytics" },
      ],
    },
    {
      label: "UTILISATEURS & CONFORMITÉ",
      items: [
        { key: "users",         icon: "👥", label: `Comptes (${users.length})` },
        { key: "kyc",           icon: "🛡️", label: "KYC / Identités",         badge: pendingKyc },
        { key: "certification", icon: "🏆", label: "Certifications",           badge: pendingCert },
      ],
    },
    {
      label: "CATALOGUE",
      items: [
        { key: "catalogue", icon: "🚗", label: "Annonces & Validations", badge: pendingVeh + pendingDrivers + liveNewListings },
      ],
    },
    {
      label: "MARKETING & CMS",
      items: [
        { key: "marketing", icon: "🎨", label: "Contenu & Mise en avant" },
      ],
    },
    {
      label: "SERVICES",
      items: [
        { key: "bookings",      icon: "📋", label: "Réservations",          badge: pendingBk },
        { key: "litiges",       icon: "⚖️",  label: "Litiges",              badge: disputedBk + liveDisputes },
        { key: "chauffeurs",    icon: "👨‍✈️", label: "Chauffeurs",           badge: pendingDrivers },
        { key: "import_export", icon: "🌍", label: "Transactions I/E",      badge: pendingIe },
        { key: "exportateurs",  icon: "📦", label: "Partenaires Export",    badge: pendingImp },
        { key: "transport",     icon: "🚢", label: "Transport Intl." },
        { key: "import_cost",   icon: "🧮", label: "Coûts Import" },
        { key: "financement",   icon: "🏦", label: "Financement" },
        { key: "assurance",     icon: "🔒", label: "Assurance" },
        { key: "reversements",  icon: "💸", label: "Reversements", badge: payoutsPendingCount || undefined },
        { key: "service_requests", icon: "🧰", label: "Autres services", badge: pendingSvcReq || undefined },
      ],
    },
    {
      label: "PARTENAIRES",
      items: [
        { key: "partner_verif",    icon: "🔍", label: "Vérification Partenaires", badge: pendingPv },
        { key: "pms_partners",     icon: "🏪", label: "Partner Hub PMS",          badge: pmsShowrooms.filter(s => !s.isPublished).length || undefined },
        { key: "founding_partners",icon: "🌟", label: "Founding Partners",        badge: foundingPending || undefined },
      ],
    },
    {
      label: "FINANCE",
      items: [
        { key: "commissions",     icon: "💰", label: "Commissions" },
        { key: "factures",        icon: "📄", label: "Factures",          badge: pendingInv },
        { key: "paiements",       icon: "💳", label: "Paiements",         badge: pendingSub || undefined },
        { key: "escrow",          icon: "🔐", label: "Escrow / Séquestre" },
        { key: "business_config", icon: "⚙️", label: "Configuration métier" },
      ],
    },
    {
      label: "COMMUNICATION",
      items: [
        { key: "notifications", icon: "🔔", label: "Notifications & Broadcast" },
        { key: "reviews",       icon: "⭐", label: "Avis clients" },
        { key: "ads",           icon: "📢", label: "Publicités & Campagnes" },
        { key: "support",       icon: "🎧", label: "Support Client",           badge: pendingSupport || undefined },
        { key: "reports",       icon: "🚩", label: "Signalements",             badge: pendingReports || undefined },
        { key: "whatsapp",      icon: "💬", label: "Bot WhatsApp partenaires", badge: pendingWa || undefined },
        { key: "email_delivery",icon: "📧", label: "Emails & Livraison",       badge: emailFailures.length || undefined },
      ],
    },
    {
      label: "SYSTÈME",
      items: [
        { key: "roles", icon: "🔑", label: "Rôles & Permissions" },
        { key: "audit", icon: "📜", label: "Audit Logs" },
      ],
    },
  ];

  const NAV_GROUPS = NAV_GROUPS_ALL
    .map((group) => ({ ...group, items: group.items.filter((i) => canSeeTab(i.key)) }))
    .filter((group) => group.items.length > 0);

  // Titre de l'onglet actif
  const activeLabel = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.key === activeTab)?.label || "Dashboard";

  return (
    <div className={styles.erp}>

      {/* ── Toast ── */}
      {toast && (
        <div className={`${styles.toast} ${toast.type === "error" ? styles.toastError : styles.toastSuccess}`}>
          {toast.type === "error" ? "❌" : "✅"} {toast.msg}
        </div>
      )}

      {/* ── Confirmation modal ── */}
      {confirm && (
        <ConfirmModal
          message={confirm.message}
          danger={confirm.danger}
          onConfirm={() => { confirm.action(); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* ── Booking action modal ── */}
      {bkActionModal && (
        <div className={styles.overlay} onClick={() => setBkActionModal(null)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            <p className={styles.confirmMsg}>
              {bkActionModal.action === "cancelled" ? `Annuler la commande de « ${bkActionModal.name} » ?` : `Confirmer la commande de « ${bkActionModal.name} » ?`}
            </p>
            {bkActionModal.action === "cancelled" && (
              <>
                <select
                  style={{ width: "100%", borderRadius: 8, border: "1px solid #e2e8f0", padding: "0.6rem", fontSize: "0.9rem", marginBottom: "0.5rem" }}
                  value={bkCancelReasonCode} onChange={(e) => setBkCancelReasonCode(e.target.value)}
                >
                  <option value="">— Motif de l'annulation (obligatoire) —</option>
                  {PARTNER_CANCEL_REASONS.map(([code, label]) => (
                    <option key={code} value={code}>{label}</option>
                  ))}
                </select>
                <textarea
                  style={{ width: "100%", borderRadius: 8, border: "1px solid #e2e8f0", padding: "0.6rem", fontSize: "0.9rem", marginBottom: "0.75rem", resize: "vertical" }}
                  rows={2} placeholder="Précisions (optionnel)..."
                  value={bkCancelReason} onChange={(e) => setBkCancelReason(e.target.value)}
                />
              </>
            )}
            <div className={styles.confirmActions}>
              <button
                className={bkActionModal.action === "cancelled" ? styles.btnDanger : styles.btnPrimary}
                disabled={bkActionModal.action === "cancelled" && !bkCancelReasonCode}
                onClick={() => {
                  adminUpdateBooking(bkActionModal.id, bkActionModal.action, bkCancelReason, bkCancelReasonCode);
                  setBkActionModal(null); setBkCancelReason(""); setBkCancelReasonCode("");
                }}
              >Confirmer</button>
              <button className={styles.btnGhost} onClick={() => { setBkActionModal(null); setBkCancelReason(""); setBkCancelReasonCode(""); }}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal résolution litige ── */}
      {disputeModal && (
        <div className={styles.overlay} onClick={() => setDisputeModal(null)}>
          <div className={styles.confirmBox} style={{ maxWidth:500, width:"95%" }} onClick={e => e.stopPropagation()}>
            <p className={styles.confirmMsg}>⚖️ Résoudre le litige — {disputeModal.booking.reference}</p>
            <p style={{ fontSize:".85rem", color:"#64748b", marginBottom:12 }}>
              Client : <strong>{disputeModal.booking.clientInfo?.firstName} {disputeModal.booking.clientInfo?.lastName}</strong><br/>
              Raison : {disputeModal.booking.clientValidation?.disputeReason || "Non précisée"}
            </p>
            {/* Bug réel corrigé (audit) : le partenaire peut désormais répondre à
                un litige (VendorDashboard) — sans ça, l'admin tranchait sans
                jamais voir ses éventuels éléments de réponse. */}
            {disputeModal.booking.partnerDisputeResponse?.respondedAt && (
              <div style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:8, padding:"8px 12px", marginBottom:12 }}>
                <p style={{ margin:0, fontSize:".78rem", fontWeight:700, color:"#0f1b3f" }}>💬 Réponse du partenaire :</p>
                <p style={{ margin:"4px 0 0", fontSize:".83rem", color:"#334155" }}>{disputeModal.booking.partnerDisputeResponse.message}</p>
              </div>
            )}
            <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:14 }}>
              <label style={{ fontSize:".85rem", fontWeight:600 }}>Décision :</label>
              <select value={disputeResol} onChange={e=>setDisputeResol(e.target.value)}
                style={{ padding:"0.5rem", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:".9rem" }}>
                <option value="completed">✅ Valider — service effectué (marquer terminé)</option>
                <option value="compensated">💰 Compensation — service partiel (terminé + remboursement partiel)</option>
                <option value="cancelled">❌ Annuler — service non conforme</option>
              </select>
              <textarea rows={3} placeholder="Note administrative (visible dans les logs)..."
                value={disputeNote} onChange={e=>setDisputeNote(e.target.value)}
                style={{ padding:"0.5rem", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:".85rem", resize:"vertical" }} />
            </div>
            <div className={styles.confirmActions}>
              <button className={disputeResol==="cancelled"?styles.btnDanger:styles.btnPrimary}
                onClick={() => { adminResolveDispute(disputeModal.booking._id, disputeResol, disputeNote, disputeResol === "compensated"); setDisputeModal(null); }}>
                ⚖️ Confirmer la résolution
              </button>
              <button className={styles.btnGhost} onClick={() => setDisputeModal(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal force complétion ── */}
      {forceModal && (
        <div className={styles.overlay} onClick={() => setForceModal(null)}>
          <div className={styles.confirmBox} style={{ maxWidth:460, width:"95%" }} onClick={e => e.stopPropagation()}>
            <p className={styles.confirmMsg}>⚡ Forcer la complétion — {forceModal.booking.reference}</p>
            <p style={{ fontSize:".85rem", color:"#64748b", marginBottom:12 }}>
              Cette action finalise la commande sans validation client. À utiliser uniquement si la commande est bloquée.
            </p>
            <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:14 }}>
              <label style={{ fontSize:".85rem", fontWeight:600 }}>Montant final (USD) :</label>
              <input type="number" min="0" value={forceAmount} onChange={e=>setForceAmount(e.target.value)}
                placeholder={`Montant original: ${forceModal.booking.montantTotal||0}`}
                style={{ padding:"0.5rem", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:".9rem" }} />
              <label style={{ fontSize:".85rem", fontWeight:600 }}>Motif (obligatoire) :</label>
              <textarea rows={2} placeholder="Ex: Accord verbal confirmé par partenaire le 22/06/2026..."
                value={forceNote} onChange={e=>setForceNote(e.target.value)} required
                style={{ padding:"0.5rem", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:".85rem", resize:"vertical" }} />
            </div>
            <div className={styles.confirmActions}>
              <button className={styles.btnPrimary} disabled={!forceNote.trim()}
                onClick={() => { adminForceComplete(forceModal.booking._id, Number(forceAmount)||forceModal.booking.montantTotal, forceNote); setForceModal(null); }}>
                ⚡ Finaliser la commande
              </button>
              <button className={styles.btnGhost} onClick={() => setForceModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Broadcast notification modal ── */}
      {broadcastModal && (
        <div className={styles.overlay} onClick={() => setBroadcastModal(false)}>
          <div className={styles.confirmBox} style={{ maxWidth: 480, width: "95%" }} onClick={(e) => e.stopPropagation()}>
            <p className={styles.confirmMsg}>📢 Envoyer une notification à tous les utilisateurs</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "0.75rem" }}>
              <input style={{ borderRadius: 8, border: "1px solid #e2e8f0", padding: "0.55rem 0.75rem", fontSize: "0.9rem" }}
                placeholder="Titre *" value={broadcastForm.titre}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, titre: e.target.value })} />
              <textarea style={{ borderRadius: 8, border: "1px solid #e2e8f0", padding: "0.55rem 0.75rem", fontSize: "0.9rem", resize: "vertical" }}
                rows={3} placeholder="Message *" value={broadcastForm.message}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, message: e.target.value })} />
              <select style={{ borderRadius: 8, border: "1px solid #e2e8f0", padding: "0.55rem 0.75rem", fontSize: "0.9rem" }}
                value={broadcastForm.targetRole}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, targetRole: e.target.value })}>
                <option value="all">Tous les utilisateurs</option>
                <option value="client">Clients uniquement</option>
                <option value="partenaire">Partenaires uniquement</option>
                <option value="chauffeur">Chauffeurs uniquement</option>
                <option value="importateur">Importateurs (Corporate)</option>
              </select>
              <input style={{ borderRadius: 8, border: "1px solid #e2e8f0", padding: "0.55rem 0.75rem", fontSize: "0.9rem" }}
                placeholder="Lien (ex: /catalogue) — optionnel" value={broadcastForm.lien}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, lien: e.target.value })} />
            </div>
            <div className={styles.confirmActions}>
              <button className={styles.btnPrimary} disabled={broadcastSending} onClick={sendBroadcast}>
                {broadcastSending ? "Envoi..." : "📤 Envoyer"}
              </button>
              <button className={styles.btnGhost} onClick={() => setBroadcastModal(false)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ OVERLAY MOBILE ══ */}
      {sidebarOpen && isMobile.current && (
        <div className={`${styles.sidebarOverlay} ${styles.visible}`}
          onClick={() => setSidebarOpen(false)} />
      )}

      {/* ══ SIDEBAR ══ */}
      <aside className={`${styles.sidebar} ${!sidebarOpen ? styles.sidebarCollapsed : styles.sidebarOpen}`}>
        {/* Logo */}
        <div className={styles.sidebarLogo}>
          <span className={styles.sidebarLogoIcon}>⚙️</span>
          <span className={styles.sidebarLogoText}>VIT-AUTO ERP</span>
        </div>

        {/* Navigation groupée */}
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <span className={styles.navGroup}>{group.label}</span>
            {group.items.map((item) => (
              <button
                key={item.key}
                className={`${styles.navItem} ${activeTab === item.key ? styles.navActive : ""}`}
                onClick={() => {
                  setActiveTab(item.key);
                  if (isMobile.current) setSidebarOpen(false);
                }}
                title={!sidebarOpen ? item.label : undefined}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                <span className={styles.navLabel}>{item.label.replace(/ \(\d+\)$/, "")}</span>
                {item.wip && <span className={styles.wipBadge}>Bientôt</span>}
                {!item.wip && item.badge > 0 && (
                  <span className={styles.navBadge}>{item.badge}</span>
                )}
              </button>
            ))}
          </div>
        ))}
      </aside>

      {/* ══ CONTENU PRINCIPAL ══ */}
      <div className={`${styles.content} ${!sidebarOpen ? styles.contentExpanded : ""}`}>

        {/* ── Topbar ── */}
        <header className={styles.topbar}>
          <button className={styles.menuBtn}
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? "Réduire le menu" : "Ouvrir le menu"}>
            {sidebarOpen && !isMobile.current ? "◀" : "☰"}
          </button>
          <span className={styles.topbarTitle}>
            {NAV_GROUPS.flatMap((g) => g.items).find((i) => i.key === activeTab)?.icon || "⚙️"}{" "}
            {activeLabel}
          </span>

          {/* Recherche globale — cherche véhicules/chauffeurs/annonces Import-Export
              en une fois, classés par entité, quel que soit l'onglet actif. */}
          <div style={{ position: "relative", flex: "1 1 260px", maxWidth: 360, margin: "0 12px" }}>
            <input
              type="text"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="🔎 Rechercher une annonce (tous types)…"
              style={{ width: "100%", padding: "7px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".82rem" }}
            />
            {globalSearchResults && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 200,
                background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 10,
                boxShadow: "0 8px 24px rgba(0,0,0,.12)", maxHeight: 420, overflowY: "auto", padding: 10,
              }}>
                {globalSearchTotal === 0 ? (
                  <p style={{ margin: 0, padding: 8, fontSize: ".82rem", color: "#94a3b8" }}>Aucune annonce ne correspond, quelle que soit l'entité.</p>
                ) : (
                  <>
                    {globalSearchResults.vehicles.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <p style={{ margin: "0 0 4px", fontSize: ".72rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>🚗 Véhicules ({globalSearchResults.vehicles.length})</p>
                        {globalSearchResults.vehicles.map((v) => (
                          <div key={v._id || v.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 8px", borderRadius: 8, cursor: "pointer" }}
                            onClick={() => { setActiveTab("catalogue"); setGlobalSearch(""); }}>
                            <span style={{ fontSize: ".82rem" }}>{v.title || v.name} <span style={{ color: "#94a3b8" }}>— {v.owner?.firstName || ""}</span></span>
                            <Badge label={v.status === "approved" ? "Publiée" : v.status === "pending" ? "En attente" : v.status} color={v.status === "approved" ? "#10b981" : v.status === "pending" ? "#f59e0b" : "#94a3b8"} bg="#f8fafc" />
                          </div>
                        ))}
                      </div>
                    )}
                    {globalSearchResults.drivers.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <p style={{ margin: "0 0 4px", fontSize: ".72rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>👨‍✈️ Chauffeurs ({globalSearchResults.drivers.length})</p>
                        {globalSearchResults.drivers.map((d) => (
                          <div key={d._id || d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 8px", borderRadius: 8 }}>
                            <span style={{ fontSize: ".82rem" }}>{d.firstName} {d.lastName} <span style={{ color: "#94a3b8" }}>— {d.title || ""}</span></span>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <Badge label={d._searchStatus === "approved" ? "Publié" : d._searchStatus === "pending" ? "En attente" : d._searchStatus} color={d._searchStatus === "approved" ? "#10b981" : d._searchStatus === "pending" ? "#f59e0b" : "#94a3b8"} bg="#f8fafc" />
                              {d._searchStatus === "pending" && (
                                <button onClick={() => handleGlobalApproveDriver(d._id)}
                                  style={{ fontSize: ".72rem", fontWeight: 700, padding: "3px 8px", borderRadius: 6, border: "1.5px solid #10b981", background: "#ecfdf5", color: "#10b981", cursor: "pointer" }}>
                                  ✅ Approuver
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {globalSearchResults.listings.length > 0 && (
                      <div>
                        <p style={{ margin: "0 0 4px", fontSize: ".72rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>🌍 Import/Export ({globalSearchResults.listings.length})</p>
                        {globalSearchResults.listings.map((l) => (
                          <div key={l._id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 8px", borderRadius: 8, cursor: "pointer" }}
                            onClick={() => { setActiveTab("exportateurs"); setGlobalSearch(""); }}>
                            <span style={{ fontSize: ".82rem" }}>{l.title} <span style={{ color: "#94a3b8" }}>— {l.partner?.firstName || ""}</span></span>
                            <Badge label={l.status === "approved" ? "Publiée" : l.status === "pending" ? "En attente" : l.status} color={l.status === "approved" ? "#10b981" : l.status === "pending" ? "#f59e0b" : "#94a3b8"} bg="#f8fafc" />
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <div className={styles.topbarRight}>
            <button
              className={styles.adminBadge}
              onClick={() => navigate("/profile")}
              title="Modifier mon profil / mot de passe"
              style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}
            >
              🔐 {user.firstName} · Admin
            </button>

            {/* Bouton "Voir le site" — retour au site public */}
            <button
              onClick={() => navigate("/")}
              title="Retour au site public"
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "#ecfdf5", color: "#059669",
                border: "1.5px solid #a7f3d0", borderRadius: 8,
                padding: "6px 12px", fontWeight: 700, fontSize: "0.78rem",
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              🌐 Voir le site
            </button>

            <button
              style={{ background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "7px 12px", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}
              onClick={() => setBroadcastModal(true)} title="Envoyer une notification groupée"
            >
              📢 Broadcast
            </button>
            <button
              style={{ background: "#f1f5f9", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 10px", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", color: "#0f1b3f" }}
              onClick={loadAll} title="Actualiser les données"
            >
              ↻
            </button>
            <button
              onClick={async () => { await logout(); navigate("/"); }}
              title="Déconnexion"
              style={{ background: "#fef2f2", color: "#dc2626", border: "1.5px solid #fca5a5", borderRadius: 8, padding: "6px 10px", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}
            >
              ⏻
            </button>
          </div>
        </header>

        {/* ── Zone de scroll ── */}
        <div className={styles.scrollZone}>

      {loading ? (
        <div className={styles.loadingBox}>
          <div className={styles.spinner} />
          <p>Chargement des données...</p>
        </div>
      ) : (

        <>
          {/* ══════════════════════ TAB MARKETING & CMS ══════════════ */}
          {activeTab === "marketing" && (
            <MarketingSection vehicles={vehicles} token={token} onRefresh={loadAll}
              adsList={adsList} adsLoading={adsLoading} adForm={adForm} setAdForm={setAdForm} adSaving={adSaving}
              saveAd={saveAd} toggleAdActive={toggleAdActive} deleteAd={deleteAd} />
          )}

          {/* ══════════════════════ TAB CATALOGUE ════════════════════ */}
          {activeTab === "catalogue" && (
            <CatalogueSection
              vehicles={vehicles} drivers={drivers} bookings={bookings}
              vehiclesTotal={vehiclesTotal} loadMoreVehicles={loadMoreVehicles}
              headers={headers} token={token}
              onRefresh={loadAll}
              showToast={showToast}
              setConfirm={setConfirm}
              rejectModal={rejectModal} setRejectModal={setRejectModal}
              rejectReason={rejectReason} setRejectReason={setRejectReason}
              driverRejectModal={driverRejectModal} setDriverRejectModal={setDriverRejectModal}
              driverRejectReason={driverRejectReason} setDriverRejectReason={setDriverRejectReason}
              updateVehicleStatus={updateVehicleStatus}
              deleteVehicle={deleteVehicle}
              updateDriverStatusInPlace={updateDriverStatusInPlace}
            />
          )}


          {/* ══════════════════════ TAB DASHBOARD ══════════════════════ */}
          {activeTab === "dashboard" && (
            <div className={styles.tabContent}>

              {/* Statistiques globales */}
              <div className={styles.statsGrid}>
                <StatCard icon="👥" label="Utilisateurs" value={stats?.users?.total || 0}
                  sub={`+${stats?.users?.newThisMonth || 0} ce mois`} color="#3b82f6" />
                <StatCard icon="🤝" label="Partenaires" value={stats?.users?.partenaires || 0}
                  sub={`${stats?.users?.admins || 0} admin(s)`} color="#10b981" />
                <StatCard icon="🚗" label="Annonces publiées" value={stats?.vehicles?.approved || 0}
                  sub={`${stats?.vehicles?.pending || 0} en attente`} color="#8b5cf6" />
                <StatCard icon="📋" label="Commandes totales" value={stats?.bookings?.total || 0}
                  sub={`+${stats?.bookings?.newThisMonth || 0} ce mois`} color="#f59e0b" />
                <StatCard icon="✅" label="Commandes terminées" value={stats?.bookings?.completed || 0}
                  sub={`${stats?.bookings?.cancelled || 0} annulées`} color="#64748b" />
                <StatCard icon="💰" label="Revenus totaux"
                  value={fmtUSD(stats?.revenue?.total || 0)}
                  sub={`Ce mois : ${fmtUSD(stats?.revenue?.thisMonth || 0)}`}
                  color="#ef4444" />
                <StatCard icon="🌍" label="Import/Export"
                  value={ieRequestsTotal || ieRequests.length || "—"}
                  sub="Demandes reçues"
                  color="#ff4d2d" />
              </div>

              {/* Alertes */}
              {(stats?.vehicles?.pending || 0) > 0 && (
                <div className={styles.alertBanner}>
                  <span>⚠️</span>
                  <span>{stats.vehicles.pending} annonce{stats.vehicles.pending > 1 ? "s" : ""} en attente de validation</span>
                  <button className={styles.alertBtn} onClick={() => setActiveTab("catalogue")}>Voir →</button>
                </div>
              )}
              {(stats?.bookings?.pending || 0) > 0 && (
                <div className={styles.alertBanner} style={{ borderColor: "#6366f1", background: "#f0f4ff" }}>
                  <span>📋</span>
                  <span>{stats.bookings.pending} commande{stats.bookings.pending > 1 ? "s" : ""} en attente de confirmation</span>
                  <button className={styles.alertBtn} onClick={() => setActiveTab("bookings")}>Voir →</button>
                </div>
              )}

              {/* Graphique revenus 6 mois */}
              {revByMonth.length > 0 && (
                <div className={styles.chartCard}>
                  <h3 className={styles.chartTitle}>📈 Revenus — 6 derniers mois</h3>
                  <div className={styles.chart}>
                    {revByMonth.map((m) => (
                      <div key={`${m._id.year}-${m._id.month}`} className={styles.chartCol}>
                        <span className={styles.chartVal}>{Math.round(m.total / 1000)}k</span>
                        <div className={styles.chartBarWrap}>
                          <div className={styles.chartBar} style={{ height: `${Math.round((m.total / maxRev) * 100)}%` }} />
                        </div>
                        <span className={styles.chartLabel}>{MOIS[(m._id.month - 1)]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Répartition commandes par type */}
              {(stats?.bookings?.byType || []).length > 0 && (
                <div className={styles.chartCard}>
                  <h3 className={styles.chartTitle}>📊 Commandes par type</h3>
                  <div className={styles.pieGrid}>
                    {stats.bookings.byType.map(({ _id, count }) => {
                      const colors = { location: "#3b82f6", essai: "#10b981", chauffeur: "#f59e0b", leasing: "#8b5cf6", import_export: "#ff4d2d" };
                      const labels = { location: "📅 Location", essai: "🔑 Essai", chauffeur: "🚘 Chauffeur", leasing: "🏦 Leasing", import_export: "🌍 Import/Export" };
                      return (
                        <div key={_id} className={styles.pieItem}>
                          <div className={styles.pieDot} style={{ background: colors[_id] || "#94a3b8" }} />
                          <span className={styles.pieLabel}>{labels[_id] || _id}</span>
                          <strong className={styles.pieCount}>{count}</strong>
                          <MiniBar value={count} max={stats.bookings.total} color={colors[_id] || "#94a3b8"} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Répartition utilisateurs */}
              <div className={styles.chartCard}>
                <h3 className={styles.chartTitle}>👥 Répartition des comptes</h3>
                <div className={styles.pieGrid}>
                  {[
                    { key: "clients",     label: "Clients",     count: stats?.users?.clients || 0,     color: "#3b82f6" },
                    { key: "partenaires", label: "Partenaires", count: stats?.users?.partenaires || 0, color: "#10b981" },
                    { key: "admins",      label: "Admins",      count: stats?.users?.admins || 0,      color: "#f59e0b" },
                    { key: "blocked",     label: "Bloqués",     count: stats?.users?.blocked || 0,     color: "#ef4444" },
                  ].map(({ key, label, count, color }) => (
                    <div key={key} className={styles.pieItem}>
                      <div className={styles.pieDot} style={{ background: color }} />
                      <span className={styles.pieLabel}>{label}</span>
                      <strong className={styles.pieCount}>{count}</strong>
                      <MiniBar value={count} max={stats?.users?.total || 1} color={color} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════ TAB UTILISATEURS ══════════════════════ */}
          {activeTab === "users" && (
            <div className={styles.tabContent}>
              <div className={styles.filterBar}>
                <input className={styles.searchInput} placeholder="🔍 Rechercher un utilisateur..."
                  value={userSearch} onChange={(e) => { setUserSearch(e.target.value); setUserPage(1); }} />
                <select className={styles.filterSelect} value={userRole}
                  onChange={(e) => { setUserRole(e.target.value); setUserPage(1); }}>
                  <option value="all">Tous les rôles</option>
                  <option value="client">Clients</option>
                  <option value="partenaire">Partenaires</option>
                  <option value="admin">Admins</option>
                  <option value="chauffeur">Chauffeurs</option>
                </select>
                <select className={styles.filterSelect} value={userCountry}
                  onChange={(e) => { setUserCountry(e.target.value); setUserPage(1); }}>
                  <option value="all">Tous les pays</option>
                  {userCountryOptions.map((code) => {
                    const cfg = COUNTRIES_CONFIG.find((c) => c.code === code);
                    return <option key={code} value={code}>{cfg ? `${cfg.flag} ${cfg.name}` : code}</option>;
                  })}
                </select>
                <span className={styles.filterCount}>{filteredUsers.length} résultat{filteredUsers.length !== 1 ? "s" : ""}</span>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr><th>Utilisateur</th><th>Email</th><th>Rôle</th><th>Compte</th><th>KYC</th><th>Certif.</th><th>Inscrit le</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {paginate(filteredUsers, userPage).map((u) => {
                      const rc = ROLE_CONFIG[u.role] || ROLE_CONFIG.client;
                      const isSelf = String(u._id) === String(user?.id ?? user?._id);
                      const kyc    = KYC_CFG[u.kycStatus] || { label: "—", color: "#94a3b8", bg: "#f8fafc" };
                      const certif = CERTIF_CFG[u.certificationBadge];
                      return (
                        <tr key={u._id} className={`${styles.tr} ${!u.isActive ? styles.trBlocked : ""}`}>
                          <td>
                            <div className={styles.userCell}>
                              <div className={styles.avatar}>
                                {u.profilePhoto ? <img src={u.profilePhoto} alt="" loading="lazy" decoding="async" /> : <span>{(u.firstName?.[0] || "?").toUpperCase()}</span>}
                              </div>
                              <div>
                                <strong>{u.firstName} {u.lastName}<CountryFlag code={u.country} countriesConfig={COUNTRIES_CONFIG} /></strong>
                                {isSelf && <span className={styles.selfTag}>Vous</span>}
                                <div style={{ fontSize:".72rem", color: u.phone ? "#94a3b8" : "#cbd5e1", display: "flex", alignItems: "center", gap: 4 }}>
                                  {u.phone || "— aucun numéro —"}
                                  <button type="button" onClick={() => updatePhone(u._id, u.phone)} title="Modifier le téléphone"
                                    style={{ border: "none", background: "none", cursor: "pointer", padding: 0, fontSize: ".78rem", lineHeight: 1 }}>
                                    ✏️
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className={styles.tdEmail}>{u.email}</td>
                          <td>
                            <select className={styles.roleSelect} value={u.role} disabled={isSelf}
                              onChange={(e) => setConfirm({ message: `Changer le rôle de ${u.firstName} en "${e.target.value}" ?`, action: () => changeRole(u._id, e.target.value) })}
                              style={{ color: rc.color, background: rc.bg, borderColor: rc.color + "60" }}>
                              <option value="client">Client</option>
                              <option value="partenaire">Partenaire</option>
                              <option value="admin">Admin</option>
                              <option value="chauffeur">Chauffeur</option>
                            </select>
                          </td>
                          <td>{u.isActive ? <Badge label="Actif" color="#10b981" bg="#ecfdf5" /> : <Badge label="Bloqué" color="#ef4444" bg="#fef2f2" />}</td>
                          <td><Badge label={kyc.label} color={kyc.color} bg={kyc.bg} /></td>
                          <td>{certif ? <Badge label={certif.label} color={certif.color} bg={certif.bg} /> : <span style={{ color:"#cbd5e1", fontSize:".75rem" }}>—</span>}</td>
                          <td className={styles.tdDate}>{fmtDate(u.createdAt)}</td>
                          <td>
                            <div className={styles.actionBtns}>
                              {!isSelf && (
                                <button className={u.isActive ? styles.btnBlock : styles.btnUnblock}
                                  onClick={() => setConfirm({ message: `${u.isActive ? "Bloquer" : "Débloquer"} le compte de ${u.firstName} ${u.lastName} ?`, action: () => toggleBlock(u._id) })}
                                  title={u.isActive ? "Bloquer" : "Débloquer"}>
                                  {u.isActive ? "🚫 Bloquer" : "✅ Débloquer"}
                                </button>
                              )}
                              {!isSelf && (
                                <button className={styles.btnDeleteSm}
                                  onClick={() => setConfirm({ message: `Supprimer définitivement ${u.firstName} ${u.lastName} ? Cette action est irréversible.`, danger: true, action: () => deleteUser(u._id) })}
                                  title="Supprimer">🗑️</button>
                              )}
                              {u.role === "partenaire" && (
                                <button className={styles.btnGhost} style={{ fontSize: ".72rem" }}
                                  onClick={() => openTrustOverview(u)}
                                  title="Vue de confiance unifiée">🛡️ Confiance</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination page={userPage} total={totalPages(filteredUsers)} onChange={setUserPage} />
              {/* Bug réel corrigé (audit) : plafond de 200 comptes chargés,
                  invisible pour l'admin — voir loadMoreUsers. */}
              {users.length < usersTotal && (
                <div style={{ textAlign: "center", marginTop: 10 }}>
                  <p style={{ fontSize: ".8rem", color: "#94a3b8", marginBottom: 6 }}>{users.length} chargés sur {usersTotal} au total</p>
                  <button onClick={loadMoreUsers}
                    style={{ padding: "6px 16px", borderRadius: 10, border: "1.5px solid #6366f1", background: "#fff", color: "#6366f1", fontWeight: 700, fontSize: ".8rem", cursor: "pointer" }}>
                    Charger plus
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Modal vue de confiance unifiée ── */}
          {trustModal && (
            <div className={styles.overlay} onClick={() => setTrustModal(null)}>
              <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
                <h3 style={{ margin: "0 0 4px", color: "#0f1b3f", fontSize: "1rem" }}>🛡️ Confiance — {trustModal.firstName} {trustModal.lastName}</h3>
                <p style={{ margin: "0 0 16px", fontSize: ".78rem", color: "#94a3b8" }}>
                  Vue agrégée en lecture seule des 6 systèmes existants — aucune fusion de données.
                </p>
                {trustLoading ? (
                  <div style={{ textAlign: "center", padding: "2rem 0", color: "#94a3b8" }}>Chargement…</div>
                ) : trustOverview ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: ".85rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                      <span>Type de vendeur (sellerType)</span><strong>{trustOverview.sellerType || "—"}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                      <span>KYC identité</span><strong>{trustOverview.kyc.status || "—"} {trustOverview.kyc.badge ? `(${trustOverview.kyc.badge})` : ""}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                      <span>Badge de certification (User)</span><strong>{trustOverview.certificationBadge || "—"}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                      <span>Certification partenaire (7 niveaux)</span><strong>{trustOverview.partnerCertification ? `${trustOverview.partnerCertification.status} — ${trustOverview.partnerCertification.badge}` : "aucun dossier"}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                      <span>Vérification Partenaire (trust score)</span><strong>{trustOverview.partnerVerification ? `${trustOverview.partnerVerification.status} — ${trustOverview.partnerVerification.trustScore}/100 (${trustOverview.partnerVerification.trustLevel})` : "aucun dossier"}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                      <span>Founding Partner</span><strong>{trustOverview.foundingPartner ? `${trustOverview.foundingPartner.isFoundingPartner ? "Oui" : "Non"} — ${trustOverview.foundingPartner.legalEntityType || "—"} — ${trustOverview.foundingPartner.status}` : "aucun dossier"}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                      <span>Profil Importateur</span><strong>{trustOverview.importerProfile ? `${trustOverview.importerProfile.status} — ${trustOverview.importerProfile.badgeLevel}` : "aucun dossier"}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                      <span>Showroom PMS (trust score)</span><strong>{trustOverview.showroom ? `${trustOverview.showroom.trustScore ?? "—"}/100 — ${trustOverview.showroom.isPublished ? "publié" : "non publié"}` : "aucun showroom"}</strong>
                    </div>

                    {/* Détail par entité — le Founding Partner Program est désormais
                        PAR ENTITÉ (voir PartnerOnboarding.businessId) : un même
                        partenaire peut avoir plusieurs entités, chacune avec son
                        propre dossier. */}
                    {trustOverview.entities?.length > 0 && (
                      <div style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>🏢 Entités ({trustOverview.entities.length})</div>
                        {trustOverview.entities.map((e, i) => (
                          <div key={e.business?.id || i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", fontSize: ".8rem", borderTop: i > 0 ? "1px solid #e2e8f0" : "none" }}>
                            <span>{e.business?.companyName || "Entité inconnue"}</span>
                            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <strong>{e.onboarding ? `${e.onboarding.status}${e.onboarding.isFoundingPartner ? " 🌟" : ""}` : "aucun dossier"}</strong>
                              {/* Renvoi du Founding Partner Program dédié à cette entité, sans
                                  quitter la vue de confiance (accessible depuis Comptes ET
                                  KYC/Vérification Partenaire) — évite d'aller chercher le
                                  dossier dans l'onglet Founding Partner pour cette action. */}
                              {["loi_envoyee", "accord_envoye"].includes(e.onboarding?.status) && (
                                <button
                                  onClick={() => foundingResendDocuments(e.onboarding._id)}
                                  disabled={foundingRowActionId === e.onboarding._id}
                                  title="Renvoyer le lien de signature en attente"
                                  style={{ padding: "2px 8px", borderRadius: 6, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: ".7rem", cursor: foundingRowActionId === e.onboarding._id ? "not-allowed" : "pointer", opacity: foundingRowActionId === e.onboarding._id ? 0.6 : 1 }}>
                                  🔄 Renvoyer
                                </button>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Drill-through documents — booléens de présence uniquement,
                        jamais les images/fichiers bruts (voir usersController.js) ;
                        l'ouverture des documents eux-mêmes reste dans les onglets
                        KYC/Founding Partner existants. */}
                    {trustOverview.documents && (
                      <div style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>📄 Documents</div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".8rem", padding: "2px 0" }}>
                          <span>Pièce d'identité (recto)</span><strong>{trustOverview.documents.identityFront ? "✓ fourni" : "—"}</strong>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".8rem", padding: "2px 0" }}>
                          <span>Selfie KYC</span><strong>{trustOverview.documents.kycSelfie ? "✓ fourni" : "—"}</strong>
                        </div>
                        {trustOverview.documents.driverProfiles?.map((d) => (
                          <div key={d.id} style={{ display: "flex", justifyContent: "space-between", fontSize: ".8rem", padding: "2px 0" }}>
                            <span>Profil chauffeur — {d.name}</span><strong>{d.status} — CV {d.hasCv ? "✓" : "—"}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : <p style={{ color: "#dc2626" }}>Erreur de chargement.</p>}
                <div className={styles.confirmActions} style={{ marginTop: 16 }}>
                  <button className={styles.btnGhost} onClick={() => setTrustModal(null)}>Fermer</button>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════ TAB COMMANDES ══════════════════════ */}
          {activeTab === "bookings" && (
            <div className={styles.tabContent}>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(130px,1fr))", gap:10, marginBottom:16 }}>
                {[
                  { l:"Toutes",    v: bookings.length,                                                                              c:"#6366f1", s:"all" },
                  { l:"Nouvelles", v: bookings.filter(b=>b.status==="pending").length,                                              c:"#f59e0b", s:"pending" },
                  { l:"En cours",  v: bookings.filter(b=>["confirmed","preparing","ready","in_progress","client_arrived"].includes(b.status)).length, c:"#2563eb", s:"confirmed,preparing,ready,in_progress,client_arrived" },
                  { l:"À valider", v: bookings.filter(b=>b.status==="waiting_client_validation").length,                            c:"#d97706", s:"waiting_client_validation" },
                  { l:"Terminées", v: bookings.filter(b=>b.status==="completed").length,                                            c:"#059669", s:"completed" },
                  { l:"Litiges",   v: bookings.filter(b=>b.status==="disputed").length,                                             c:"#dc2626", s:"disputed" },
                  { l:"Annulées",  v: bookings.filter(b=>b.status==="cancelled").length,                                            c:"#94a3b8", s:"cancelled" },
                ].map(k => (
                  <button key={k.s} onClick={() => { setBkStatus(k.s); setBkPage(1); }}
                    style={{ background: bkStatus===k.s?k.c:"#f8fafc", color: bkStatus===k.s?"#fff":k.c, border:`2px solid ${k.c}`, borderRadius:10, padding:"8px 6px", cursor:"pointer", fontWeight:700, fontSize:"0.8rem" }}>
                    <div style={{ fontSize:"1.3rem", lineHeight:1.2 }}>{k.v}</div>
                    <div style={{ fontSize:"0.7rem", opacity:.85 }}>{k.l}</div>
                  </button>
                ))}
              </div>

              <div className={styles.filterBar} style={{ flexWrap:"wrap", gap:8 }}>
                <input type="search" placeholder="Ref., client, email, tel…" value={bkSearch}
                  onChange={e => { setBkSearch(e.target.value); setBkPage(1); }}
                  style={{ flex:1, minWidth:160, padding:"0.4rem 0.75rem", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:"0.85rem" }} />
                <select className={styles.filterSelect} value={bkType} onChange={e => { setBkType(e.target.value); setBkPage(1); }}>
                  <option value="all">Tous types</option>
                  <option value="location">📅 Location</option>
                  <option value="essai">🔑 Essai/Vente</option>
                  <option value="chauffeur">🚘 Chauffeur</option>
                  <option value="leasing">🏦 Leasing</option>
                </select>
                <select className={styles.filterSelect} value={bkStatus} onChange={e => { setBkStatus(e.target.value); setBkPage(1); }}>
                  <option value="all">Tous statuts</option>
                  <option value="pending">Nouvelles</option>
                  <option value="confirmed">Acceptées</option>
                  <option value="in_progress">En cours</option>
                  <option value="waiting_client_validation">À valider</option>
                  <option value="completed">Terminées</option>
                  <option value="disputed">⚠️ Litiges</option>
                  <option value="cancelled">Annulées</option>
                </select>
                <span className={styles.filterCount}>{filteredBookings.length} résultat{filteredBookings.length!==1?"s":""}</span>
                <button onClick={() => exportBookings("csv")} style={{ padding:"0.4rem 0.9rem", background:"#0f1b3f", color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontSize:"0.8rem", fontWeight:700 }}>⬇️ CSV</button>
                <button onClick={loadAll} className={styles.btnRefresh}>↻</button>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr><th>Référence</th><th>Client / KYC</th><th>Véhicule / Type</th><th>Montant</th><th>Statut</th><th>Date</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {paginate(filteredBookings, bkPage).map((b) => {
                      const bs = STATUS_BK[b.status] || STATUS_BK.pending;
                      const typeIcons = { location:"📅", essai:"🔑", chauffeur:"🚘", leasing:"🏦" };
                      const vName = b.vehicle ? [b.vehicle.title, b.vehicle.marque, b.vehicle.modele].filter(Boolean).join(" ") : (b.driver ? `Chauffeur: ${b.driver.firstName||""}` : "—");
                      const clientName = `${b.clientInfo?.firstName||""} ${b.clientInfo?.lastName||""}`.trim();
                      const kycColors = { VERIFIE:"#059669", EN_ATTENTE:"#d97706", REFUSE:"#dc2626", A_REVOIR_MANUELLEMENT:"#2563eb" };
                      const kycStatus = b.clientInfo?.kycStatus || b.client?.kycStatus;
                      const isDisputed = b.status === "disputed";
                      const isActive = !["completed","cancelled","disputed"].includes(b.status);
                      return (
                        <tr key={b._id} className={styles.tr} style={isDisputed ? { background:"#fff5f5" } : {}}>
                          <td>
                            <div>
                              <strong style={{ fontSize:"0.8rem", fontFamily:"monospace", color:"#6366f1" }}>{b.reference || b._id?.slice(-6)}</strong>
                              {isDisputed && <span style={{ display:"block", fontSize:"0.7rem", color:"#dc2626", fontWeight:700 }}>⚠️ LITIGE</span>}
                            </div>
                          </td>
                          <td>
                            <div>
                              <strong style={{ fontSize:"0.82rem" }}>{clientName || "—"}</strong>
                              <span className={styles.vehMeta}>{b.clientInfo?.email}</span>
                              <span className={styles.vehMeta} title="Numéro de passeport" style={{ fontFamily:"monospace" }}>📔 {b.clientInfo?.passportNumber || "—"}</span>
                              {kycStatus && (
                                <span style={{ display:"inline-block", fontSize:"0.65rem", fontWeight:700, padding:"1px 6px", borderRadius:99, background: kycStatus==="VERIFIE"?"#d1fae5":"#fef3c7", color: kycColors[kycStatus]||"#d97706", marginTop:2 }}>
                                  {kycStatus==="VERIFIE"?"✅ KYC":kycStatus==="REFUSE"?"❌ KYC":"⏳ KYC"}
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div>
                              <span className={styles.vehName}>{vName}</span>
                              <Badge label={`${typeIcons[b.type]||""} ${b.type||"—"}`} color="#64748b" bg="#f1f5f9" />
                            </div>
                          </td>
                          <td className={styles.tdPrice}>
                            {b.montantTotal > 0 ? fmtUSD(b.montantTotal) : "—"}
                            {b.commissionAmount > 0 && <span style={{ display:"block", fontSize:"0.68rem", color:"#dc2626" }}>Com: {fmtUSD(b.commissionAmount)}</span>}
                          </td>
                          <td><Badge label={bs.label} color={bs.color} bg={bs.bg} /></td>
                          <td className={styles.tdDate}>{fmtDate(b.createdAt)}</td>
                          <td>
                            <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                              <a href={`/api/bookings/${b._id}/receipt`} target="_blank" rel="noopener noreferrer"
                                style={{ fontSize:"0.7rem", padding:"2px 6px", background:"#f1f5f9", color:"#0f1b3f", borderRadius:6, textDecoration:"none" }} title="Reçu PDF">🧾</a>
                              {b.status === "pending" && (
                                <button className={styles.btnApprove} style={{ padding:"0.2rem 0.5rem", fontSize:"0.72rem" }}
                                  onClick={() => setBkActionModal({ id:b._id, name:clientName, action:"confirmed" })} title="Confirmer">✅</button>
                              )}
                              {isActive && b.status !== "pending" && (
                                <button style={{ padding:"0.2rem 0.5rem", fontSize:"0.72rem", background:"#e0f2fe", color:"#0369a1", border:"none", borderRadius:6, cursor:"pointer", fontWeight:700 }}
                                  onClick={() => { setForceModal({ booking:b }); setForceAmount(b.montantTotal||""); setForceNote(""); }}
                                  title="Forcer complétion">⚡</button>
                              )}
                              {isDisputed && (
                                <button style={{ padding:"0.2rem 0.5rem", fontSize:"0.72rem", background:"#fee2e2", color:"#dc2626", border:"1px solid #fca5a5", borderRadius:6, cursor:"pointer", fontWeight:700 }}
                                  onClick={() => { setDisputeModal({ booking:b }); setDisputeNote(""); setDisputeResol("completed"); }}
                                  title="Résoudre litige">⚖️</button>
                              )}
                              {!["cancelled","completed"].includes(b.status) && (
                                <button className={styles.btnReject} style={{ padding:"0.2rem 0.5rem", fontSize:"0.72rem" }}
                                  onClick={() => { setBkActionModal({ id:b._id, name:clientName, action:"cancelled" }); setBkCancelReason(""); }}
                                  title="Annuler">✕</button>
                              )}
                              {b.status === "cancelled" && (
                                <button className={styles.btnReject} style={{ padding:"0.2rem 0.5rem", fontSize:"0.72rem", opacity:.7 }}
                                  onClick={() => setConfirm({ message:`Supprimer définitivement la commande ${b.reference||""}?`, danger:true, action:()=>adminDeleteBooking(b._id) })}
                                  title="Supprimer">🗑️</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination page={bkPage} total={totalPages(filteredBookings)} onChange={setBkPage} />
              {/* Bug réel corrigé (audit) : plafond de 200 réservations
                  chargées, invisible pour l'admin — voir loadMoreBookings. */}
              {bookings.length < bookingsTotal && (
                <div style={{ textAlign: "center", marginTop: 10 }}>
                  <p style={{ fontSize: ".8rem", color: "#94a3b8", marginBottom: 6 }}>{bookings.length} chargées sur {bookingsTotal} au total</p>
                  <button onClick={loadMoreBookings}
                    style={{ padding: "6px 16px", borderRadius: 10, border: "1.5px solid #6366f1", background: "#fff", color: "#6366f1", fontWeight: 700, fontSize: ".8rem", cursor: "pointer" }}>
                    Charger plus
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════ TAB EXPORTATEURS ══════════════════════ */}
          {activeTab === "exportateurs" && (
            <div className={styles.tabContent}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f1b3f", margin: 0 }}>
                  📦 Partenaires Exportateurs — Dossiers & Annonces d'Export
                </h2>
                <button className={styles.btnRefresh} onClick={loadImporters}>↻ Actualiser</button>
              </div>

              {/* KPIs */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 14, marginBottom: "1.5rem" }}>
                {[
                  { icon: "📦", label: "Total exportateurs",  value: importerProfiles.length, color: "#6366f1" },
                  { icon: "⏳", label: "En attente",          value: importerProfiles.filter(p => p.status === "pending").length,  color: "#f59e0b" },
                  { icon: "✅", label: "Vérifiés",            value: importerProfiles.filter(p => p.status === "verified").length, color: "#10b981" },
                  { icon: "❌", label: "Refusés",             value: importerProfiles.filter(p => p.status === "rejected").length, color: "#ef4444" },
                  { icon: "🌍", label: "Annonces export att.", value: importerListings.filter(l => l.status === "pending").length, color: "#f59e0b" },
                ].map((k) => (
                  <StatCard key={k.label} icon={k.icon} label={k.label} value={k.value} color={k.color} />
                ))}
              </div>

              {/* ── SECTION 1 : Candidatures ── */}
              <div className={styles.chartCard} style={{ marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
                  <h3 className={styles.chartTitle} style={{ margin: 0 }}>📦 Dossiers partenaires exportateurs</h3>
                  <select
                    className={styles.filterSelect}
                    value={importerFilter}
                    onChange={(e) => setImporterFilter(e.target.value)}
                    style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".82rem" }}
                  >
                    <option value="">Tous</option>
                    <option value="pending">En attente</option>
                    <option value="verified">Vérifiés</option>
                    <option value="rejected">Refusés</option>
                    <option value="suspended">Suspendus</option>
                  </select>
                </div>

                {importerLoading ? (
                  <div className={styles.loadingBox} style={{ minHeight: 100 }}>
                    <div className={styles.spinner} /><p>Chargement...</p>
                  </div>
                ) : filteredImporterProfiles.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "24px 0", color: "#94a3b8" }}>
                    <div style={{ fontSize: "2rem", marginBottom: 8 }}>🏅</div>
                    <p style={{ margin: 0 }}>Aucune candidature pour ce filtre.</p>
                  </div>
                ) : (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Partenaire</th>
                          <th>Entreprise</th>
                          <th>RCCM / NIF</th>
                          <th>Activités</th>
                          <th>Statut</th>
                          <th>Soumis le</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredImporterProfiles.map((p) => {
                          const stCfg = {
                            pending:   { label: "En attente", color: "#f59e0b", bg: "#fffbeb" },
                            verified:  { label: "Vérifié",    color: "#10b981", bg: "#ecfdf5" },
                            rejected:  { label: "Refusé",     color: "#ef4444", bg: "#fef2f2" },
                            suspended: { label: "Suspendu",   color: "#ef4444", bg: "#fef2f2" },
                          }[p.status] || { label: p.status, color: "#94a3b8", bg: "#f8fafc" };
                          const u = p.userId;
                          return (
                            <tr key={p._id} className={styles.tr}>
                              <td>
                                <strong>{u?.firstName} {u?.lastName}</strong>
                                <span className={styles.vehMeta}>{u?.email}</span>
                              </td>
                              <td>
                                <strong style={{ fontSize: ".85rem" }}>{p.companyName}</strong>
                                <span className={styles.vehMeta}>{p.city}, {p.country}</span>
                              </td>
                              <td style={{ fontSize: ".82rem" }}>
                                <div>RCCM: {p.rccm || "—"}</div>
                                <div>NIF: {p.taxId || "—"}</div>
                              </td>
                              <td style={{ fontSize: ".8rem", color: "#475569" }}>
                                {(p.activityType || []).join(", ") || "—"}
                              </td>
                              <td>
                                <Badge label={stCfg.label} color={stCfg.color} bg={stCfg.bg} />
                                {p.badgeLevel && p.badgeLevel !== "none" && (
                                  <span style={{ marginLeft: 4, fontSize: ".75rem" }}>
                                    {p.badgeLevel === "silver" ? "🥈" : p.badgeLevel === "gold" ? "🥇" : "💎"}
                                  </span>
                                )}
                              </td>
                              <td className={styles.tdDate}>{fmtDate(p.submittedAt)}</td>
                              <td>
                                <div className={styles.actionBtns}>
                                  {/* Visualiser le dossier complet */}
                                  <button
                                    title="Voir le dossier complet"
                                    onClick={() => setExporterDetail(p)}
                                    style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", fontSize: ".75rem", fontWeight: 700, background: "#eff6ff", color: "#2563eb", border: "1.5px solid #bfdbfe", borderRadius: 6, cursor: "pointer" }}>
                                    👁 Visualiser
                                  </button>
                                  {/* Approuver / refuser */}
                                  {p.status !== "verified" && (
                                    <button className={styles.btnApprove}
                                      onClick={() => { setReviewModal(p); setReviewDecision({ status: "verified", rejectionReason: "", badgeLevel: "silver" }); }}>
                                      ✅ Valider
                                    </button>
                                  )}
                                  {p.status !== "rejected" && (
                                    <button className={styles.btnReject}
                                      onClick={() => { setReviewModal(p); setReviewDecision({ status: "rejected", rejectionReason: "", badgeLevel: "none" }); }}>
                                      ✕ Rejeter
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ── SECTION 2 : Annonces import/export ── */}
              <div className={styles.chartCard}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
                  <h3 className={styles.chartTitle} style={{ margin: 0 }}>📢 Annonces Import/Export</h3>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <select
                      value={listingFilter}
                      onChange={(e) => setListingFilter(e.target.value)}
                      style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".82rem" }}
                    >
                      <option value="">Toutes</option>
                      <option value="pending">En attente</option>
                      <option value="approved">Publiées</option>
                      <option value="rejected">Refusées</option>
                    </select>
                    <select
                      value={listingCountryFilter}
                      onChange={(e) => setListingCountryFilter(e.target.value)}
                      style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".82rem" }}
                    >
                      <option value="">🌍 Tous les pays</option>
                      {importerListingCountryOptions.map((country) => (
                        <option key={country} value={country}>{country}</option>
                      ))}
                    </select>
                    <select
                      value={listingVilleFilter}
                      onChange={(e) => setListingVilleFilter(e.target.value)}
                      style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".82rem" }}
                    >
                      <option value="">📍 Toutes les villes</option>
                      {importerListingVilleOptions.map((ville) => (
                        <option key={ville} value={ville}>{ville}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {importerLoading ? (
                  <div className={styles.loadingBox} style={{ minHeight: 80 }}><div className={styles.spinner} /></div>
                ) : filteredImporterListings.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "20px 0", color: "#94a3b8" }}>
                    <p style={{ margin: 0 }}>Aucune annonce pour ce filtre.</p>
                  </div>
                ) : (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Annonce</th>
                          <th>Partenaire</th>
                          <th>Source</th>
                          <th>Incoterm</th>
                          <th>Prix</th>
                          <th>Statut</th>
                          <th>Date</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredImporterListings.map((l) => {
                          const stCfg = {
                            pending:  { label: "En attente", color: "#f59e0b", bg: "#fffbeb" },
                            approved: { label: "Publiée",    color: "#10b981", bg: "#ecfdf5" },
                            rejected: { label: "Refusée",    color: "#ef4444", bg: "#fef2f2" },
                          }[l.status] || { label: l.status, color: "#94a3b8", bg: "#f8fafc" };
                          return (
                            <tr key={l._id} className={styles.tr}>
                              <td>
                                <strong style={{ fontSize: ".85rem" }}>{l.title}</strong>
                                <span className={styles.vehMeta}>{l.make} {l.model} {l.year} · {l.condition}</span>
                              </td>
                              <td style={{ fontSize: ".82rem" }}>
                                {l.partner?.firstName} {l.partner?.lastName}
                                <span className={styles.vehMeta}>{l.importerProfile?.companyName}</span>
                              </td>
                              <td style={{ fontSize: ".82rem" }}>{l.sourceCountry}</td>
                              <td style={{ fontSize: ".82rem" }}>
                                {l.incoterm
                                  ? <span title={ieListingIncotermLabel(l.incoterm)} style={{ fontSize: ".72rem", fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: "#f5f3ff", color: "#7c3aed", border: "1px solid #ddd6fe" }}>📦 {l.incoterm}</span>
                                  : <span style={{ color: "#94a3b8" }}>—</span>}
                              </td>
                              <td className={styles.tdPrice}>
                                {l.price ? `${Number(l.price).toLocaleString("fr-FR")} ${l.currency}` : "—"}
                              </td>
                              <td><Badge label={stCfg.label} color={stCfg.color} bg={stCfg.bg} /></td>
                              <td className={styles.tdDate}>{fmtDate(l.createdAt)}</td>
                              <td>
                                <div className={styles.actionBtns}>
                                  <button className={styles.btnGhost} style={{ fontSize: ".78rem" }}
                                    onClick={() => openEditIeListing(l._id)}>✏️ Modifier</button>
                                  {l.status === "pending" && (
                                    <>
                                      <button className={styles.btnApprove}
                                        onClick={async () => {
                                          const r = await fetch(`/api/import-export/listings/${l._id}/status`, {
                                            method: "PATCH", headers,
                                            body: JSON.stringify({ status: "approved" }),
                                          });
                                          if (r.ok) { showToast("Annonce publiée !"); loadImporters(); }
                                          else showToast("Erreur lors de la publication.", "error");
                                        }}>✅ Publier</button>
                                      <button className={styles.btnReject}
                                        onClick={() => { setListingRejectModal(l); setListingRejectNote(""); }}>
                                        ✕ Refuser</button>
                                    </>
                                  )}
                                  {l.status === "approved" && (
                                    <button className={styles.btnReject}
                                      onClick={async () => {
                                        const r = await fetch(`/api/import-export/listings/${l._id}/status`, {
                                          method: "PATCH", headers,
                                          body: JSON.stringify({ status: "archived" }),
                                        });
                                        if (r.ok) { showToast("Annonce archivée."); loadImporters(); }
                                        else showToast("Erreur lors de l'archivage.", "error");
                                      }}>Archiver</button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {/* Bug réel corrigé (audit) : plafond de 100 annonces IE
                    chargées, invisible pour l'admin — voir loadMoreImporterListings. */}
                {importerListings.length < importerListingsTotal && (
                  <div style={{ textAlign: "center", marginTop: 10 }}>
                    <p style={{ fontSize: ".8rem", color: "#94a3b8", marginBottom: 6 }}>{importerListings.length} chargées sur {importerListingsTotal} au total</p>
                    <button onClick={loadMoreImporterListings}
                      style={{ padding: "6px 16px", borderRadius: 10, border: "1.5px solid #6366f1", background: "#fff", color: "#6366f1", fontWeight: 700, fontSize: ".8rem", cursor: "pointer" }}>
                      Charger plus
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Modal review candidature importateur ── */}
          {reviewModal && (
            <div className={styles.overlay} onClick={() => setReviewModal(null)}>
              <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
                <h3 style={{ margin: "0 0 16px", color: "#0f1b3f", fontSize: "1rem" }}>
                  {reviewDecision.status === "verified" ? "✅ Valider le profil importateur" : "❌ Refuser la candidature"}
                </h3>
                <p style={{ fontSize: ".85rem", color: "#475569", margin: "0 0 14px" }}>
                  <strong>{reviewModal.companyName}</strong> — {reviewModal.userId?.firstName} {reviewModal.userId?.lastName}
                </p>
                {reviewDecision.status === "verified" && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: ".82rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 6 }}>Niveau de badge</label>
                    <select
                      value={reviewDecision.badgeLevel}
                      onChange={(e) => setReviewDecision((d) => ({ ...d, badgeLevel: e.target.value }))}
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: ".88rem" }}
                    >
                      <option value="silver">🥈 Silver</option>
                      <option value="gold">🥇 Gold</option>
                      <option value="platinum">💎 Platinum</option>
                    </select>
                  </div>
                )}
                {reviewDecision.status === "rejected" && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: ".82rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 6 }}>Motif du refus *</label>
                    <textarea
                      rows={3}
                      value={reviewDecision.rejectionReason}
                      onChange={(e) => setReviewDecision((d) => ({ ...d, rejectionReason: e.target.value }))}
                      placeholder="Documents manquants, informations incorrectes..."
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: ".88rem", fontFamily: "inherit", resize: "vertical" }}
                    />
                  </div>
                )}
                <div className={styles.confirmActions}>
                  <button
                    className={reviewDecision.status === "verified" ? styles.btnApprove : styles.btnDanger}
                    onClick={async () => {
                      const r = await fetch(`/api/import-export/importer-profiles/${reviewModal._id}/review`, {
                        method: "PATCH", headers,
                        body: JSON.stringify(reviewDecision),
                      });
                      if (r.ok) {
                        showToast(reviewDecision.status === "verified" ? "Profil validé !" : "Profil refusé.", reviewDecision.status === "rejected" ? "error" : "success");
                        setReviewModal(null);
                        loadImporters();
                      } else {
                        const d = await r.json().catch(() => ({}));
                        showToast(d.message || "Erreur lors de la mise à jour.", "error");
                      }
                    }}
                  >
                    Confirmer
                  </button>
                  <button className={styles.btnGhost} onClick={() => setReviewModal(null)}>Annuler</button>
                </div>
              </div>
            </div>
          )}

          {/* ── Modal refus annonce listing ── */}
          {listingRejectModal && (
            <div className={styles.overlay} onClick={() => setListingRejectModal(null)}>
              <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
                <h3 style={{ margin: "0 0 12px", color: "#0f1b3f", fontSize: "1rem" }}>✕ Refuser l'annonce</h3>
                <p style={{ fontSize: ".85rem", color: "#475569", margin: "0 0 12px" }}>
                  <strong>{listingRejectModal.title}</strong>
                </p>
                <label style={{ fontSize: ".82rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 6 }}>Motif (optionnel)</label>
                <textarea
                  rows={3}
                  value={listingRejectNote}
                  onChange={(e) => setListingRejectNote(e.target.value)}
                  placeholder="Photos insuffisantes, prix incorrect..."
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: ".88rem", fontFamily: "inherit", resize: "vertical", marginBottom: 14 }}
                />
                <div className={styles.confirmActions}>
                  <button className={styles.btnDanger}
                    onClick={async () => {
                      const r = await fetch(`/api/import-export/listings/${listingRejectModal._id}/status`, {
                        method: "PATCH", headers,
                        body: JSON.stringify({ status: "rejected", adminNote: listingRejectNote }),
                      });
                      if (r.ok) {
                        showToast("Annonce refusée.", "error");
                        setListingRejectModal(null);
                        loadImporters();
                      } else {
                        const d = await r.json().catch(() => ({}));
                        showToast(d.message || "Erreur lors du refus.", "error");
                      }
                    }}>Confirmer le refus</button>
                  <button className={styles.btnGhost} onClick={() => setListingRejectModal(null)}>Annuler</button>
                </div>
              </div>
            </div>
          )}

          {/* ══ MODAL ÉDITION ANNONCE IMPORT/EXPORT (admin) ══ */}
          {editingIeListing && (
            <IEListingEditForm
              token={token}
              listing={editingIeListing}
              onClose={() => setEditingIeListing(null)}
              onSaved={() => { setEditingIeListing(null); showToast("Annonce mise à jour."); loadImporters(); }}
            />
          )}

          {/* ══ MODAL DOSSIER EXPORTATEUR ══ */}
          {exporterDetail && (() => {
            const p = exporterDetail;
            const u = p.userId || {};
            const BADGE_CFG = {
              none:     null,
              silver:   { icon: "🥈", label: "Silver",   color: "#64748b", bg: "#f1f5f9" },
              gold:     { icon: "🥇", label: "Gold",     color: "#d97706", bg: "#fffbeb" },
              platinum: { icon: "💎", label: "Platinum", color: "#6d28d9", bg: "#ede9fe" },
            };
            const STATUS_CFG = {
              pending:       { label: "En attente",    color: "#d97706", bg: "#fef3c7" },
              verified:      { label: "Vérifié",       color: "#059669", bg: "#dcfce7" },
              rejected:      { label: "Refusé",        color: "#dc2626", bg: "#fee2e2" },
              suspended:     { label: "Suspendu",      color: "#dc2626", bg: "#fee2e2" },
              not_submitted: { label: "Non soumis",    color: "#94a3b8", bg: "#f8fafc" },
            };
            const stCfg   = STATUS_CFG[p.status]      || STATUS_CFG.not_submitted;
            const badgeCfg = BADGE_CFG[p.badgeLevel]  || null;
            const ACTIVITY_LABELS = { import: "Import", export: "Export", transit: "Transit", courtage: "Courtage", pieces_detachees: "Pièces détachées" };
            const DOC_KEYS = [
              { key: "rccmImage",    label: "Registre du Commerce (RCCM)" },
              { key: "taxIdImage",   label: "Identifiant Fiscal (NIF)" },
              { key: "licenseImage", label: "Agrément importateur/exportateur" },
              { key: "companyLogo",  label: "Logo de l'entreprise" },
              { key: "bankStatement",label: "Relevé bancaire" },
              { key: "otherDoc",     label: "Autre document" },
            ];
            const hasDoc = DOC_KEYS.some(({ key }) => !!p.documents?.[key]);

            const Row = ({ label, value }) => (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: ".71rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</span>
                <span style={{ fontSize: ".88rem", color: "#0f1b3f", fontWeight: 600 }}>{value || "—"}</span>
              </div>
            );

            return (
              <div className={styles.overlay} onClick={() => setExporterDetail(null)}
                style={{ alignItems: "flex-start", paddingTop: "2vh", overflowY: "auto" }}>
                <div onClick={(e) => e.stopPropagation()}
                  style={{ background: "#fff", borderRadius: 16, width: "min(960px, 96vw)", maxHeight: "95dvh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,.22)" }}>

                  {/* ── Header ── */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px 14px", borderBottom: "1.5px solid #e2e8f0", flexShrink: 0, background: "#f8fafc" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      {p.documents?.companyLogo ? (
                        <img src={p.documents.companyLogo} alt="logo"
                          style={{ width: 52, height: 52, borderRadius: 10, objectFit: "contain", border: "1.5px solid #e2e8f0", background: "#fff", padding: 4 }}
                          onError={(e) => { e.target.style.display = "none"; }} />
                      ) : (
                        <div style={{ width: 52, height: 52, borderRadius: 10, background: "#e0e7ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.6rem" }}>📦</div>
                      )}
                      <div>
                        <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 900, color: "#0f1b3f" }}>{p.companyName}</h2>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                          <span style={{ background: stCfg.bg, color: stCfg.color, padding: "2px 12px", borderRadius: 99, fontWeight: 800, fontSize: ".76rem" }}>{stCfg.label}</span>
                          {badgeCfg && <span style={{ background: badgeCfg.bg, color: badgeCfg.color, padding: "2px 12px", borderRadius: 99, fontWeight: 700, fontSize: ".76rem" }}>{badgeCfg.icon} {badgeCfg.label}</span>}
                          <span style={{ fontSize: ".75rem", color: "#94a3b8" }}>ID : {p._id}</span>
                        </div>
                      </div>
                    </div>
                    <button onClick={() => setExporterDetail(null)}
                      style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 34, height: 34, fontSize: "1.1rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✕</button>
                  </div>

                  {/* ── Body scrollable ── */}
                  <div style={{ overflowY: "auto", padding: "20px 24px 28px", flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>

                    {/* Actions rapides */}
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {p.status !== "verified" && (
                        <button className={styles.btnApprove}
                          onClick={() => { setExporterDetail(null); setReviewModal(p); setReviewDecision({ status: "verified", rejectionReason: "", badgeLevel: "silver" }); }}>
                          ✅ Valider le dossier
                        </button>
                      )}
                      {p.status !== "rejected" && (
                        <button className={styles.btnReject}
                          onClick={() => { setExporterDetail(null); setReviewModal(p); setReviewDecision({ status: "rejected", rejectionReason: "", badgeLevel: "none" }); }}>
                          ✕ Refuser le dossier
                        </button>
                      )}
                      {p.status === "verified" && p.status !== "suspended" && (
                        <button
                          onClick={async () => {
                            const r = await fetch(`/api/import-export/importer-profiles/${p._id}/review`, { method: "PATCH", headers, body: JSON.stringify({ status: "suspended" }) });
                            if (r.ok) { showToast("Dossier suspendu.", "error"); setExporterDetail(null); loadImporters(); }
                            else showToast("Erreur lors de la suspension.", "error");
                          }}
                          style={{ padding: "7px 16px", borderRadius: 8, border: "1.5px solid #fca5a5", background: "#fef2f2", color: "#dc2626", fontWeight: 700, fontSize: ".82rem", cursor: "pointer" }}>
                          ⏸ Suspendre
                        </button>
                      )}
                    </div>

                    {/* Grille principale : partenaire + entreprise */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

                      {/* Infos partenaire (utilisateur) */}
                      <div style={{ background: "#f8fafc", borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
                        <h3 style={{ margin: 0, fontSize: ".88rem", fontWeight: 800, color: "#0f1b3f", borderBottom: "1.5px solid #e2e8f0", paddingBottom: 8 }}>👤 Informations partenaire</h3>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          {u.profilePhoto ? (
                            <img src={u.profilePhoto} alt="" style={{ width: 54, height: 54, borderRadius: "50%", objectFit: "cover", border: "2px solid #e2e8f0" }} onError={(e) => { e.target.style.display = "none"; }} />
                          ) : (
                            <div style={{ width: 54, height: 54, borderRadius: "50%", background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", flexShrink: 0 }}>
                              {(u.firstName?.[0] || "?").toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight: 800, color: "#0f1b3f" }}>{u.firstName} {u.lastName}</div>
                            <div style={{ fontSize: ".78rem", color: "#64748b", marginTop: 2 }}>{u.role || "partenaire"}</div>
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <Row label="Email" value={u.email} />
                          <Row label="Téléphone" value={u.phone} />
                          <Row label="Statut compte" value={u.isActive === false ? "🚫 Bloqué" : "✅ Actif"} />
                          <Row label="Dossier soumis le" value={fmtDate(p.submittedAt)} />
                        </div>
                      </div>

                      {/* Infos entreprise */}
                      <div style={{ background: "#f8fafc", borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                        <h3 style={{ margin: 0, fontSize: ".88rem", fontWeight: 800, color: "#0f1b3f", borderBottom: "1.5px solid #e2e8f0", paddingBottom: 8 }}>🏢 Informations entreprise</h3>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <Row label="Raison sociale" value={p.companyName} />
                          <Row label="RCCM" value={p.rccm} />
                          <Row label="NIF / Identifiant fiscal" value={p.taxId} />
                          <Row label="Agrément" value={p.operatingLicense} />
                          <Row label="Adresse" value={p.address} />
                          <Row label="Ville" value={p.city} />
                          <Row label="Pays" value={p.country} />
                          <Row label="Site web" value={p.website ? <a href={safeHref(p.website)} target="_blank" rel="noreferrer noopener" style={{ color: "#2563eb" }}>{p.website}</a> : "—"} />
                        </div>
                      </div>
                    </div>

                    {/* Activités & portée */}
                    <div style={{ background: "#f8fafc", borderRadius: 12, padding: "16px 18px" }}>
                      <h3 style={{ margin: "0 0 14px", fontSize: ".88rem", fontWeight: 800, color: "#0f1b3f", borderBottom: "1.5px solid #e2e8f0", paddingBottom: 8 }}>🌍 Activités & portée</h3>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))", gap: 14 }}>
                        <div>
                          <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Types d'activité</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {(p.activityType || []).length > 0
                              ? (p.activityType).map((a) => (
                                <span key={a} style={{ background: "#e0e7ff", color: "#3730a3", padding: "3px 10px", borderRadius: 99, fontSize: ".78rem", fontWeight: 700 }}>
                                  {ACTIVITY_LABELS[a] || a}
                                </span>
                              ))
                              : <span style={{ color: "#94a3b8", fontSize: ".82rem" }}>—</span>
                            }
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Pays d'opération</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {(p.operatingCountries || []).length > 0
                              ? p.operatingCountries.map((c) => (
                                <span key={c} style={{ background: "#dcfce7", color: "#166534", padding: "3px 10px", borderRadius: 99, fontSize: ".78rem", fontWeight: 700 }}>{c}</span>
                              ))
                              : <span style={{ color: "#94a3b8", fontSize: ".82rem" }}>—</span>
                            }
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Catégories de véhicules</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {(p.vehicleCategories || []).length > 0
                              ? p.vehicleCategories.map((c) => (
                                <span key={c} style={{ background: "#fef3c7", color: "#92400e", padding: "3px 10px", borderRadius: 99, fontSize: ".78rem", fontWeight: 700 }}>{c}</span>
                              ))
                              : <span style={{ color: "#94a3b8", fontSize: ".82rem" }}>—</span>
                            }
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <Row label="Volume annuel" value={p.annualVolume} />
                          <Row label="Années d'expérience" value={p.yearsExperience != null ? `${p.yearsExperience} an${p.yearsExperience > 1 ? "s" : ""}` : "—"} />
                        </div>
                      </div>
                    </div>

                    {/* Références & description */}
                    {(p.references || p.description) && (
                      <div style={{ background: "#f8fafc", borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
                        <h3 style={{ margin: 0, fontSize: ".88rem", fontWeight: 800, color: "#0f1b3f", borderBottom: "1.5px solid #e2e8f0", paddingBottom: 8 }}>📝 Présentation & références</h3>
                        {p.description && (
                          <div>
                            <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 }}>Description</div>
                            <p style={{ margin: 0, fontSize: ".88rem", color: "#334155", lineHeight: 1.6 }}>{p.description}</p>
                          </div>
                        )}
                        {p.references && (
                          <div>
                            <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 }}>Références / Clients notables</div>
                            <p style={{ margin: 0, fontSize: ".88rem", color: "#334155", lineHeight: 1.6 }}>{p.references}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Documents */}
                    {hasDoc && (
                      <div style={{ background: "#f8fafc", borderRadius: 12, padding: "16px 18px" }}>
                        <h3 style={{ margin: "0 0 14px", fontSize: ".88rem", fontWeight: 800, color: "#0f1b3f", borderBottom: "1.5px solid #e2e8f0", paddingBottom: 8 }}>📁 Documents fournis</h3>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))", gap: 12 }}>
                          {DOC_KEYS.map(({ key, label }) => p.documents?.[key] ? (
                            <div key={key} style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
                              <div style={{ fontSize: ".7rem", fontWeight: 700, color: "#64748b", padding: "5px 10px", background: "#f1f5f9", textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
                              <a href={safeImgHref(p.documents[key])} target="_blank" rel="noreferrer noopener">
                                <img src={p.documents[key]} alt={label} loading="lazy" decoding="async"
                                  style={{ width: "100%", height: 110, objectFit: "cover", display: "block" }}
                                  onError={(e) => { e.target.parentElement.innerHTML = `<div style="height:110px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:.8rem;padding:8px;text-align:center">Aperçu indisponible</div>`; }} />
                              </a>
                              <div style={{ padding: "6px 10px" }}>
                                <a href={safeImgHref(p.documents[key])} target="_blank" rel="noreferrer noopener" style={{ fontSize: ".75rem", color: "#2563eb", textDecoration: "underline" }}>
                                  Voir en plein écran ↗
                                </a>
                              </div>
                            </div>
                          ) : null)}
                        </div>
                      </div>
                    )}

                    {/* Statut de vérification */}
                    <div style={{ background: "#f8fafc", borderRadius: 12, padding: "16px 18px" }}>
                      <h3 style={{ margin: "0 0 14px", fontSize: ".88rem", fontWeight: 800, color: "#0f1b3f", borderBottom: "1.5px solid #e2e8f0", paddingBottom: 8 }}>🔍 Statut de vérification</h3>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 12 }}>
                        <Row label="Statut actuel" value={<span style={{ color: stCfg.color, fontWeight: 800 }}>{stCfg.label}</span>} />
                        <Row label="Badge attribué" value={badgeCfg ? `${badgeCfg.icon} ${badgeCfg.label}` : "Aucun"} />
                        <Row label="Soumis le" value={fmtDate(p.submittedAt)} />
                        <Row label="Examiné le" value={fmtDate(p.reviewedAt)} />
                        {p.reviewedBy && <Row label="Examiné par" value={`${p.reviewedBy.firstName || ""} ${p.reviewedBy.lastName || ""}`} />}
                      </div>
                      {p.rejectionReason && (
                        <div style={{ marginTop: 14, background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: 8, padding: "10px 14px" }}>
                          <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#dc2626", textTransform: "uppercase", marginBottom: 4 }}>Motif du refus</div>
                          <p style={{ margin: 0, fontSize: ".88rem", color: "#991b1b" }}>{p.rejectionReason}</p>
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* ══════════════════════════════════════════════════
          TAB COMMISSIONS
      ══════════════════════════════════════════════════ */}
      {activeTab === "commissions" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f1b3f", margin: 0 }}>
              💰 Commissions VIT-AUTO
            </h2>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="number"
                value={invoiceYear}
                onChange={(e) => setInvoiceYear(Number(e.target.value))}
                style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "6px 12px", width: 90, fontSize: "0.85rem" }}
                placeholder="Année"
              />
              <select
                value={invoiceMonth}
                onChange={(e) => setInvoiceMonth(e.target.value)}
                style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "6px 12px", fontSize: "0.85rem" }}
              >
                <option value="">Tous les mois</option>
                {MOIS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
              <button className={styles.btnRefresh} onClick={loadCommissions}>Filtrer</button>
            </div>
          </div>

          {/* KPIs */}
          {commissionsStats && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 14, marginBottom: "1.5rem" }}>
              <StatCard icon="📊" label="Transactions terminées" value={commissionsStats.count} color="#6366f1" />
              <StatCard icon="💵" label="Montant total transactions" value={fmtUSD(commissionsStats.transactions || 0)} color="#0ea5e9" />
              <StatCard icon="💰" label="Commissions générées" value={fmtUSD(commissionsStats.total || 0)} color="#10b981" />
            </div>
          )}

          {commissions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>
              <div style={{ fontSize: "3rem", marginBottom: 12 }}>💳</div>
              <p>Aucune commission pour cette période.</p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Référence</th>
                    <th>Type</th>
                    <th>Client</th>
                    <th>Montant transaction</th>
                    <th>Taux commission</th>
                    <th>Commission VIT-AUTO</th>
                    <th>Date</th>
                    <th>Facturé</th>
                  </tr>
                </thead>
                <tbody>
                  {commissions.map((b) => (
                    <tr key={b._id}>
                      <td style={{ fontWeight: 700, fontFamily: "monospace", fontSize: "0.83rem" }}>{b.reference || "—"}</td>
                      <td><Badge label={b.type} color="#6366f1" bg="#f5f3ff" /></td>
                      <td style={{ fontSize: "0.83rem" }}>{b.clientInfo?.firstName} {b.clientInfo?.lastName}</td>
                      <td style={{ fontWeight: 700 }}>
                        {fmtUSD(b.transaction?.finalAmount || b.montantTotal || 0)}
                      </td>
                      <td style={{ color: "#6366f1", fontWeight: 700 }}>
                        {Math.round((b.commissionRate || 0) * 100)} %
                      </td>
                      <td style={{ fontWeight: 800, color: "#10b981" }}>
                        {fmtUSD(b.commissionAmount || 0)}
                      </td>
                      <td style={{ fontSize: "0.83rem" }}>
                        {b.paidAt ? new Date(b.paidAt).toLocaleDateString("fr-FR") : "—"}
                      </td>
                      <td>
                        {b.invoiced
                          ? <Badge label="Facturé" color="#10b981" bg="#dcfce7" />
                          : <Badge label="Non facturé" color="#f59e0b" bg="#fef3c7" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          TAB FACTURES
      ══════════════════════════════════════════════════ */}
      {activeTab === "factures" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f1b3f", margin: 0 }}>
              📄 Gestion des factures partenaires
            </h2>
            <button className={styles.btnRefresh} onClick={loadInvoices}>↻ Actualiser</button>
          </div>

          {/* Génération facture */}
          <div className={styles.chartCard} style={{ marginBottom: "1.5rem" }}>
            <h3 className={styles.chartTitle}>🔧 Générer les factures du mois</h3>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Mois</label>
                <select
                  value={generateForm.month}
                  onChange={(e) => setGenerateForm((p) => ({ ...p, month: Number(e.target.value) }))}
                  style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 12px", fontSize: "0.85rem" }}
                >
                  {MOIS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Année</label>
                <input
                  type="number"
                  value={generateForm.year}
                  onChange={(e) => setGenerateForm((p) => ({ ...p, year: Number(e.target.value) }))}
                  style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 12px", width: 100, fontSize: "0.85rem" }}
                />
              </div>
              <button
                className={styles.btnPrimary}
                disabled={generating}
                onClick={async () => {
                  setGenerating(true);
                  try {
                    const r = await fetch("/api/invoices/generate-all", {
                      method: "POST", headers,
                      body: JSON.stringify(generateForm),
                    });
                    const d = await r.json();
                    if (r.ok) {
                      showToast(`${d.generated} facture(s) générée(s)`);
                      loadInvoices();
                    } else {
                      showToast(d.message || "Erreur", "error");
                    }
                  } catch { showToast("Erreur réseau", "error"); }
                  setGenerating(false);
                }}
              >
                {generating ? "Génération…" : "📄 Générer toutes les factures"}
              </button>
            </div>
          </div>

          {/* KPIs factures */}
          {invoicesStats && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 14, marginBottom: "1.5rem" }}>
              <StatCard icon="📄" label="Total factures" value={invoices.length} color="#6366f1" />
              <StatCard icon="🕐" label="En attente de paiement" value={invoices.filter(i => i.status === "pending").length} color="#f59e0b" />
              <StatCard icon="✅" label="Payées" value={invoices.filter(i => i.status === "paid").length} color="#10b981" />
              <StatCard icon="💰" label="Total encaissé" value={fmtUSD(invoicesStats.totalPaid || 0)} color="#10b981" />
              <StatCard icon="⏳" label="En attente" value={fmtUSD(invoicesStats.totalPending || 0)} color="#f59e0b" />
            </div>
          )}

          {invoiceLoading ? (
            <div className={styles.loadingBox}><div className={styles.spinner} /><p>Chargement…</p></div>
          ) : invoices.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>
              <div style={{ fontSize: "3rem", marginBottom: 12 }}>📄</div>
              <p>Aucune facture générée pour le moment.</p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Référence</th>
                    <th>Partenaire</th>
                    <th>Période</th>
                    <th>Transactions</th>
                    <th>Total commission</th>
                    <th>Statut</th>
                    <th>Échéance</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const isPaid    = inv.status === "paid";
                    const isOverdue = inv.status === "overdue";
                    const statusColor = isPaid ? "#10b981" : isOverdue ? "#dc2626" : "#d97706";
                    const statusBg    = isPaid ? "#dcfce7" : isOverdue ? "#fef2f2" : "#fef3c7";
                    const statusLabel = isPaid ? "Payée" : isOverdue ? "En retard" : "À payer";
                    return (
                      <tr key={inv._id}>
                        <td style={{ fontWeight: 800, fontFamily: "monospace", fontSize: "0.83rem" }}>{inv.reference}</td>
                        <td style={{ fontSize: "0.85rem" }}>
                          <div style={{ fontWeight: 700 }}>{inv.partner?.firstName} {inv.partner?.lastName}</div>
                          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{inv.partner?.email}</div>
                          {/* Un partenaire multi-entités reçoit une facture par entité (voir
                              Invoice.businessId) — sans ce libellé, deux factures du même mois
                              pour le même partenaire seraient indiscernables dans ce tableau. */}
                          {inv.businessId?.companyName && (
                            <div style={{ fontSize: "0.72rem", color: "#8b5cf6", fontWeight: 600 }}>🏢 {inv.businessId.companyName}</div>
                          )}
                        </td>
                        <td style={{ fontSize: "0.85rem" }}>
                          {MOIS[(inv.month || 1) - 1]} {inv.year}
                        </td>
                        <td style={{ textAlign: "center" }}>{(inv.lines || []).length}</td>
                        <td style={{ fontWeight: 800, color: "#0f1b3f" }}>
                          {fmtUSD(inv.totalCommission || 0)}
                        </td>
                        <td>
                          <Badge label={statusLabel} color={statusColor} bg={statusBg} />
                        </td>
                        <td style={{ fontSize: "0.83rem", color: isOverdue ? "#dc2626" : "#64748b" }}>
                          {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("fr-FR") : "—"}
                        </td>
                        <td>
                          {!isPaid && (
                            <button
                              className={styles.btnApprove}
                              style={{ fontSize: "0.78rem", padding: "5px 12px" }}
                              onClick={async () => {
                                const r = await fetch(`/api/invoices/${inv._id}/paid`, {
                                  method: "PATCH", headers,
                                  body: JSON.stringify({ paymentMethod: "virement" }),
                                });
                                if (r.ok) { showToast("Facture marquée payée ✅"); loadInvoices(); }
                                else showToast("Erreur", "error");
                              }}
                            >
                              ✅ Marquer payée
                            </button>
                          )}
                          {isPaid && <span style={{ color: "#10b981", fontSize: "0.82rem", fontWeight: 600 }}>
                            Payée le {inv.paidAt ? new Date(inv.paidAt).toLocaleDateString("fr-FR") : "—"}
                          </span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Factures de PRESTATION — une par commande terminée, envoyée au
              partenaire (voir issueServiceInvoice, distinct des factures de
              commission ci-dessus) */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "2rem 0 1rem", flexWrap: "wrap", gap: 12 }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f1b3f", margin: 0 }}>
              🧾 Factures de prestation ({serviceInvoicesAdmin.length})
            </h2>
            <button className={styles.btnRefresh} onClick={loadServiceInvoicesAdmin}>↻ Actualiser</button>
          </div>
          {serviceInvoicesAdminLoading ? <p style={{ color: "#94a3b8" }}>Chargement…</p> : serviceInvoicesAdmin.length === 0 ? (
            <p style={{ color: "#64748b", fontSize: "0.9rem" }}>Aucune facture de prestation émise.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Référence</th><th>Partenaire</th><th>Commande</th><th>Paiement</th><th>Net partenaire</th><th>Émise le</th><th>PDF</th></tr>
                </thead>
                <tbody>
                  {serviceInvoicesAdmin.map((inv) => (
                    <tr key={inv._id}>
                      <td style={{ fontWeight: 800, fontFamily: "monospace", fontSize: "0.8rem" }}>{inv.reference}</td>
                      <td style={{ fontSize: "0.85rem" }}>
                        <div style={{ fontWeight: 700 }}>{inv.partner?.firstName} {inv.partner?.lastName}</div>
                        <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{inv.partner?.email}</div>
                      </td>
                      <td style={{ fontSize: "0.83rem" }}>{inv.bookingReference}</td>
                      <td style={{ fontSize: "0.83rem" }}>{inv.paymentMethod || "—"}</td>
                      <td style={{ fontWeight: 800, color: "#0f1b3f" }}>{fmtUSD(inv.netPayout || 0)}</td>
                      <td style={{ fontSize: "0.8rem", color: "#64748b" }}>{inv.createdAt ? new Date(inv.createdAt).toLocaleDateString("fr-FR") : "—"}</td>
                      <td>
                        <a href={`/api/service-invoices/${inv._id}/pdf`} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", fontSize: "0.82rem" }}>⬇️ Voir</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          TAB KYC — Gestion des dossiers d'identité
      ══════════════════════════════════════════════════ */}
      {activeTab === "kyc" && (
        <div className={styles.tabContent}>
          {/* En-tête KYC */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>🛡️ Gestion des dossiers KYC</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Examinez et validez les dossiers d'identité soumis par les utilisateurs.</p>
            </div>
            <button
              style={{ padding: "8px 16px", borderRadius: 10, background: "#6366f1", color: "#fff", border: "none", fontWeight: 700, fontSize: ".85rem", cursor: "pointer" }}
              onClick={() => loadKycList(kycFilter)}
            >
              🔄 Actualiser
            </button>
          </div>

          {/* Filtres par statut */}
          <div style={{ display: "flex", gap: 8, marginBottom: "1rem", flexWrap: "wrap" }}>
            {[
              { v: "ALL",                   l: "Tous",       ic: "📋" },
              { v: "EN_ATTENTE",            l: "En attente", ic: "⏳" },
              { v: "A_REVOIR_MANUELLEMENT", l: "En révision", ic: "🔍" },
              { v: "VERIFIE",               l: "Vérifiés",   ic: "✅" },
              { v: "REFUSE",                l: "Refusés",    ic: "❌" },
            ].map(({ v, l, ic }) => (
              <button key={v}
                style={{
                  padding: "6px 14px", borderRadius: 20, border: "1.5px solid",
                  fontSize: ".82rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  borderColor: kycFilter === v ? "#6366f1" : "#e2e8f0",
                  background:  kycFilter === v ? "#6366f1" : "#f8fafc",
                  color:       kycFilter === v ? "#fff"    : "#64748b",
                }}
                onClick={() => setKycFilter(v)}
              >
                {ic} {l}
              </button>
            ))}
          </div>

          {/* Recherche — pratique pour retrouver un compte précis (ex: déjà
              approuvé) sans devoir deviner sous quel filtre de statut il se trouve */}
          <input
            className={styles.searchInput}
            placeholder="Rechercher par nom ou email…"
            value={kycSearch}
            onChange={(e) => setKycSearch(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", marginBottom: "1.25rem" }}
          />

          {(() => {
            const q = kycSearch.trim().toLowerCase();
            const filteredKycList = q
              ? kycList.filter((u) =>
                  `${u.firstName} ${u.lastName} ${u.email || ""}`.toLowerCase().includes(q))
              : kycList;

            if (kycLoading) return (
              <div className={styles.loadingBox}><div className={styles.spinner} /><p>Chargement des dossiers KYC…</p></div>
            );
            if (filteredKycList.length === 0) return (
              <div className={styles.emptyBox} style={{ textAlign: "center", padding: "40px 20px" }}>
                <div style={{ fontSize: "2.5rem", marginBottom: 8 }}>✅</div>
                <p style={{ margin: 0, fontWeight: 600, color: "#475569" }}>
                  {q
                    ? "Aucun résultat pour cette recherche."
                    : kycFilter === "ALL"     ? "Aucun dossier KYC."
                    : kycFilter === "VERIFIE" ? "Aucun dossier vérifié."
                    : kycFilter === "REFUSE"  ? "Aucun dossier refusé."
                    : "Aucun dossier en attente de traitement."}
                </p>
              </div>
            );
            return (
            <div style={{ display: "grid", gap: 10 }}>
              {filteredKycList.map((u) => {
                const KC = {
                  VERIFIE:               { c: "#059669", bg: "#d1fae5", border: "#6ee7b7", emoji: "✅" },
                  EN_ATTENTE:            { c: "#d97706", bg: "#fef3c7", border: "#fde68a", emoji: "⏳" },
                  A_REVOIR_MANUELLEMENT: { c: "#2563eb", bg: "#dbeafe", border: "#93c5fd", emoji: "🔍" },
                  REFUSE:                { c: "#dc2626", bg: "#fee2e2", border: "#fca5a5", emoji: "❌" },
                };
                const kc = KC[u.kycStatus] || KC["EN_ATTENTE"];
                return (
                  <div key={u._id} style={{
                    background: "#fff", borderRadius: 14,
                    border: `1.5px solid ${kc.border}`,
                    padding: "16px 20px",
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto auto",
                    alignItems: "center", gap: 16,
                  }}>
                    {/* Infos utilisateur */}
                    <div>
                      <div style={{ fontWeight: 800, fontSize: ".95rem", color: "#0f1b3f", marginBottom: 2 }}>
                        {u.firstName} {u.lastName}<CountryFlag code={u.country} countriesConfig={COUNTRIES_CONFIG} />
                      </div>
                      <div style={{ fontSize: ".81rem", color: "#64748b" }}>{u.email}</div>
                      <div style={{ fontSize: ".76rem", color: "#94a3b8", marginTop: 3 }}>
                        Soumis {u.kycSubmittedAt ? new Date(u.kycSubmittedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                      </div>
                    </div>
                    {/* OCR mini */}
                    {u.kycOcrData ? (
                      <div style={{ fontSize: ".78rem", color: "#475569", background: "#f8fafc", borderRadius: 8, padding: "8px 12px", textAlign: "right", minWidth: 140 }}>
                        <div style={{ fontWeight: 700 }}>{u.kycOcrData.documentType || "—"} · {u.kycOcrData.issuingCountry || "—"}</div>
                        <div>OCR <strong>{u.kycOcrData.ocrConfidence ?? 0}%</strong> · Face <strong>{u.kycFaceMatchScore ?? "—"}%</strong></div>
                        <div>Score <strong>{u.kycScore ?? 0}/100</strong></div>
                      </div>
                    ) : <div />}
                    {/* Badge statut */}
                    <span style={{ padding: "4px 14px", borderRadius: 20, background: kc.bg, color: kc.c, fontSize: ".8rem", fontWeight: 800, whiteSpace: "nowrap" }}>
                      {kc.emoji} {(u.kycStatus || "EN_ATTENTE").replace(/_/g, " ")}
                    </span>
                    {/* Boutons — examen KYC + vue de confiance unifiée (croise
                        KYC/Founding Partner/Certification/PMS sans changer d'onglet) */}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        title="Vue de confiance unifiée"
                        style={{ padding: "8px 12px", borderRadius: 10, background: "#f1f5f9", color: "#0f1b3f", border: "none", fontWeight: 700, fontSize: ".85rem", cursor: "pointer", whiteSpace: "nowrap" }}
                        onClick={() => openTrustOverview(u)}
                      >
                        🛡️
                      </button>
                      <button
                        style={{ padding: "8px 18px", borderRadius: 10, background: "#6366f1", color: "#fff", border: "none", fontWeight: 700, fontSize: ".85rem", cursor: "pointer", whiteSpace: "nowrap" }}
                        onClick={() => openKycDetail(u)}
                      >
                        Examiner →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            );
          })()}

          {/* "Charger plus" — voir loadMoreKyc : le plafond était auparavant
              invisible (bug réel corrigé), les dossiers au-delà disparaissaient
              silencieusement sans aucun indice qu'il en restait. Volontairement
              PAS masqué pendant une recherche (bug réel corrigé, audit) — la
              recherche filtre côté client sur les kycLimit dossiers déjà
              chargés (comme les onglets Users/Bookings) ; masquer ce bouton
              en tapant rendait impossible de charger un dossier situé au-delà
              de kycLimit tant que le champ de recherche n'était pas vidé. */}
          {!kycLoading && kycList.length < kycTotal && (
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <p style={{ fontSize: ".8rem", color: "#94a3b8", marginBottom: 8 }}>
                {kycList.length} affichés sur {kycTotal} au total
              </p>
              <button onClick={loadMoreKyc}
                style={{ padding: "8px 20px", borderRadius: 10, border: "1.5px solid #6366f1", background: "#fff", color: "#6366f1", fontWeight: 700, fontSize: ".85rem", cursor: "pointer" }}>
                Charger plus
              </button>
            </div>
          )}

          {/* Modal détail + décision KYC */}
          {kycDetailUser && (
            <div className={styles.overlay} onClick={() => setKycDetailUser(null)}>
              <div style={{ background: "#fff", borderRadius: 20, padding: "0", maxWidth: 740, width: "98%", maxHeight: "94dvh", overflowY: "auto", boxShadow: "0 24px 70px rgba(0,0,0,.22)" }}
                onClick={(e) => e.stopPropagation()}>

                {/* Header modal KYC */}
                <div style={{ background: "linear-gradient(135deg,#1e3a8a,#4f46e5)", borderRadius: "20px 20px 0 0", padding: "20px 24px", color: "#fff" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      {kycDetailUser.profilePhoto
                        ? <img src={kycDetailUser.profilePhoto} alt="" style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", border: "3px solid rgba(255,255,255,.4)" }} />
                        : <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(255,255,255,.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem" }}>👤</div>
                      }
                      <div>
                        <div style={{ fontSize: "1.1rem", fontWeight: 900 }}>{kycDetailUser.firstName} {kycDetailUser.lastName}</div>
                        <div style={{ fontSize: ".82rem", opacity: .8, marginTop: 2 }}>{kycDetailUser.email || "—"} · {kycDetailUser.phone || "—"}</div>
                        <div style={{ fontSize: ".75rem", opacity: .65, marginTop: 2 }}>
                          Rôle : <strong>{kycDetailUser.role}</strong> · Inscrit le {kycDetailUser.createdAt ? new Date(kycDetailUser.createdAt).toLocaleDateString("fr-FR") : "—"}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => setKycDetailUser(null)} style={{ background: "rgba(255,255,255,.2)", border: "none", borderRadius: "50%", width: 34, height: 34, color: "#fff", fontSize: "1.1rem", cursor: "pointer", flexShrink: 0 }}>✕</button>
                  </div>
                </div>

                <div style={{ padding: "20px 24px" }}>
                  {/* Indicateurs rapides */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
                    {[
                      { l: "Score KYC",      v: `${kycDetailUser.kycScore ?? 0}/100`,      color: (kycDetailUser.kycScore ?? 0) >= 70 ? "#16a34a" : "#ef4444" },
                      { l: "OCR Confiance",  v: `${kycDetailUser.kycOcrData?.ocrConfidence ?? 0}%`, color: "#6366f1" },
                      { l: "Face match",     v: kycDetailUser.kycFaceMatchScore !== null ? `${kycDetailUser.kycFaceMatchScore}%` : "—", color: "#f59e0b" },
                      { l: "Badge KYC",      v: kycDetailUser.kycBadge || "—",              color: "#0f1b3f" },
                    ].map(({ l, v, color }) => (
                      <div key={l} style={{ background: "#f8fafc", borderRadius: 10, padding: "10px 12px", textAlign: "center", border: "1.5px solid #e2e8f0" }}>
                        <div style={{ fontSize: ".68rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{l}</div>
                        <div style={{ fontSize: "1rem", fontWeight: 900, color, marginTop: 3 }}>{v}</div>
                      </div>
                    ))}
                  </div>

                  {/* Infos contact */}
                  <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 16px", marginBottom: 14, fontSize: ".86rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px", color: "#334155" }}>
                    <div><span style={{ color: "#94a3b8" }}>Email </span>{kycDetailUser.email ? <>{kycDetailUser.email} {kycDetailUser.emailVerified ? "✅" : "❌"}</> : "—"}</div>
                    <div><span style={{ color: "#94a3b8" }}>Tél. </span>{kycDetailUser.phone ? <>{kycDetailUser.phone} {kycDetailUser.phoneVerified ? "✅" : "❌"}</> : "—"}</div>
                    <div><span style={{ color: "#94a3b8" }}>Rôle </span>{kycDetailUser.role}</div>
                    <div><span style={{ color: "#94a3b8" }}>Soumis </span>{kycDetailUser.kycSubmittedAt ? new Date(kycDetailUser.kycSubmittedAt).toLocaleDateString("fr-FR") : "—"}</div>
                  </div>

                  {/* Chargement des documents complets (photos recto/verso/selfie/permis) */}
                  {kycDetailLoading && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "14px 16px", marginBottom: 14, color: "#64748b", fontSize: ".85rem" }}>
                      <div className={styles.spinner} style={{ width: 18, height: 18 }} />
                      Chargement des documents soumis…
                    </div>
                  )}

                  {/* Données OCR */}
                  {kycDetailUser.kycOcrData && (
                    <div style={{ background: "#f5f3ff", border: "1.5px solid #c4b5fd", borderRadius: 10, padding: "12px 16px", marginBottom: 14, fontSize: ".86rem", color: "#3730a3" }}>
                      <strong style={{ display: "block", marginBottom: 8 }}>📄 Données OCR du document</strong>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
                        {kycDetailUser.kycOcrData.firstName      && <div><span style={{ opacity: .7 }}>Prénom </span><strong>{kycDetailUser.kycOcrData.firstName}</strong></div>}
                        {kycDetailUser.kycOcrData.lastName       && <div><span style={{ opacity: .7 }}>Nom </span><strong>{kycDetailUser.kycOcrData.lastName}</strong></div>}
                        {kycDetailUser.kycOcrData.documentNumber && <div><span style={{ opacity: .7 }}>N° </span><strong style={{ fontFamily: "monospace" }}>{kycDetailUser.kycOcrData.documentNumber}</strong></div>}
                        {kycDetailUser.kycOcrData.issuingCountry && <div><span style={{ opacity: .7 }}>Pays </span><strong>{kycDetailUser.kycOcrData.issuingCountry}</strong></div>}
                        {kycDetailUser.kycOcrData.expiryDate     && <div><span style={{ opacity: .7 }}>Expire </span><strong>{new Date(kycDetailUser.kycOcrData.expiryDate).toLocaleDateString("fr-FR")}</strong></div>}
                        {kycDetailUser.kycOcrData.gender         && <div><span style={{ opacity: .7 }}>Sexe </span><strong>{kycDetailUser.kycOcrData.gender === "M" ? "Masculin" : "Féminin"}</strong></div>}
                      </div>
                    </div>
                  )}

                  {/* ── Documents réels (recto, verso, selfie) ── */}
                  {(kycDetailUser.identity?.frontImage || kycDetailUser.identity?.backImage || kycDetailUser.identity?.selfie) && (
                    <div style={{ marginBottom: 16 }}>
                      <strong style={{ fontSize: ".82rem", color: "#0f1b3f", display: "block", marginBottom: 10 }}>
                        📄 Documents soumis — {kycDetailUser.identity?.type?.toUpperCase() || "PIÈCE D'IDENTITÉ"}
                      </strong>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                        {[
                          { label: "Recto", img: kycDetailUser.identity?.frontImage },
                          { label: "Verso", img: kycDetailUser.identity?.backImage },
                          { label: "Selfie", img: kycDetailUser.identity?.selfie },
                        ].map(({ label, img }) => (
                          <div key={label} style={{ border: "1.5px solid #e2e8f0", borderRadius: 10, overflow: "hidden", background: "#f8fafc" }}>
                            <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#64748b", padding: "6px 10px", background: "#f1f5f9", textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
                            {img ? (
                              <a href={safeImgHref(img)} target="_blank" rel="noreferrer noopener">
                                <img src={img} alt={label} loading="lazy" decoding="async" style={{ width: "100%", maxHeight: 120, objectFit: "cover", display: "block" }}
                                  onError={(e) => { e.target.style.display = "none"; }} />
                              </a>
                            ) : (
                              <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", color: "#cbd5e1", fontSize: ".8rem" }}>Non fourni</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {!kycDetailLoading && !(kycDetailUser.identity?.frontImage || kycDetailUser.identity?.backImage || kycDetailUser.identity?.selfie) && (
                    <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: ".82rem", color: "#dc2626" }}>
                      ⚠️ Aucune pièce d'identité soumise par cet utilisateur.
                    </div>
                  )}

                  {/* ── Permis de conduire (si disponible) ── */}
                  {(kycDetailUser.driverLicenseOcr?.frontImage || kycDetailUser.driverLicenseOcr?.backImage) && (
                    <div style={{ marginBottom: 16 }}>
                      <strong style={{ fontSize: ".82rem", color: "#0f1b3f", display: "block", marginBottom: 10 }}>🚗 Permis de conduire</strong>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        {[
                          { label: "Recto permis", img: kycDetailUser.driverLicenseOcr?.frontImage },
                          { label: "Verso permis",  img: kycDetailUser.driverLicenseOcr?.backImage },
                        ].map(({ label, img }) => img && (
                          <div key={label} style={{ border: "1.5px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                            <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#64748b", padding: "6px 10px", background: "#f1f5f9" }}>{label}</div>
                            <a href={img} target="_blank" rel="noreferrer">
                              <img src={img} alt={label} loading="lazy" decoding="async" style={{ width: "100%", maxHeight: 100, objectFit: "cover", display: "block" }} />
                            </a>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: ".78rem", color: "#475569", background: "#f8fafc", borderRadius: 8, padding: "8px 12px", marginTop: 8 }}>
                        N° : {kycDetailUser.driverLicenseOcr?.licenseNumber || "—"} · Catégories : {kycDetailUser.driverLicenseOcr?.categories || "—"} · Expire : {kycDetailUser.driverLicenseOcr?.expiryDate ? new Date(kycDetailUser.driverLicenseOcr.expiryDate).toLocaleDateString("fr-FR") : "—"}
                        {kycDetailUser.driverLicenseOcr?.isExpired && <span style={{ color: "#ef4444", fontWeight: 700 }}> ⚠️ EXPIRÉ</span>}
                      </div>
                    </div>
                  )}

                  {/* ── Infos entreprise (si partenaire) ── */}
                  {kycDetailUser.business?.companyName && (
                    <div style={{ background: "#eff6ff", border: "1.5px solid #bfdbfe", borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
                      <strong style={{ fontSize: ".82rem", color: "#1e40af", display: "block", marginBottom: 6 }}>🏢 Entreprise partenaire</strong>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px 16px", fontSize: ".82rem", color: "#1e3a8a" }}>
                        <div><span style={{ opacity: .7 }}>Société </span><strong>{kycDetailUser.business.companyName}</strong></div>
                        <div><span style={{ opacity: .7 }}>RCCM </span>{kycDetailUser.business.rccm || "—"}</div>
                        <div><span style={{ opacity: .7 }}>NIF </span>{kycDetailUser.business.taxId || "—"}</div>
                        <div><span style={{ opacity: .7 }}>Adresse </span>{kycDetailUser.business.address || "—"}</div>
                      </div>
                    </div>
                  )}

                  {/* Raison du rejet précédent */}
                  {kycDetailUser.kycRejectionReason && (
                    <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: ".82rem", color: "#dc2626" }}>
                      <strong>⚠️ Dernier motif de refus :</strong> {kycDetailUser.kycRejectionReason}
                    </div>
                  )}
                  {kycDetailUser.kycReviewNote && (
                    <div style={{ background: "#fffbeb", border: "1.5px solid #fde68a", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: ".82rem", color: "#92400e" }}>
                      <strong>📝 Note de révision :</strong> {kycDetailUser.kycReviewNote}
                    </div>
                  )}

                  {/* Journal d'audit */}
                  {kycDetailUser.kycAuditLog?.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <strong style={{ fontSize: ".82rem", color: "#475569", display: "block", marginBottom: 8 }}>📋 Historique des actions</strong>
                      <div style={{ maxHeight: 110, overflowY: "auto", border: "1.5px solid #e2e8f0", borderRadius: 8 }}>
                        {kycDetailUser.kycAuditLog.slice().reverse().map((log, i) => (
                          <div key={i} style={{ fontSize: ".77rem", color: "#64748b", padding: "7px 12px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", gap: 8 }}>
                            <span><span style={{ fontWeight: 700, color: "#334155" }}>{log.action}</span>{log.note && ` — ${log.note}`}</span>
                            <span style={{ flexShrink: 0, color: "#94a3b8" }}>{new Date(log.timestamp).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Décision */}
                  <div style={{ borderTop: "1.5px solid #e2e8f0", paddingTop: 16 }}>
                    <strong style={{ fontSize: ".88rem", color: "#0f1b3f", display: "block", marginBottom: 12 }}>Décision administrative</strong>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                      {[
                        { v: "VERIFIE",               l: "✅ Approuver",    col: "#059669", bg: kycReviewForm.decision === "VERIFIE" ? "#d1fae5" : "#f8fafc" },
                        { v: "REFUSE",                l: "❌ Refuser",      col: "#dc2626", bg: kycReviewForm.decision === "REFUSE" ? "#fee2e2" : "#f8fafc" },
                        { v: "A_REVOIR_MANUELLEMENT", l: "🔍 En révision",  col: "#2563eb", bg: kycReviewForm.decision === "A_REVOIR_MANUELLEMENT" ? "#dbeafe" : "#f8fafc" },
                        { v: "EN_ATTENTE",            l: "⏳ Remettre en attente", col: "#d97706", bg: kycReviewForm.decision === "EN_ATTENTE" ? "#fef3c7" : "#f8fafc" },
                      ].map(({ v, l, col, bg }) => (
                        <button key={v}
                          style={{ padding: "10px 8px", borderRadius: 9, border: `2px solid ${kycReviewForm.decision === v ? col : "#e2e8f0"}`, fontSize: ".82rem", fontWeight: 700, cursor: "pointer", background: bg, color: kycReviewForm.decision === v ? col : "#64748b", fontFamily: "inherit" }}
                          onClick={() => setKycReviewForm((f) => ({ ...f, decision: v }))}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                    <textarea
                      placeholder="Note interne ou raison du refus (visible dans le journal)"
                      value={kycReviewForm.note}
                      onChange={(e) => setKycReviewForm((f) => ({ ...f, note: e.target.value }))}
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem", fontFamily: "inherit", resize: "vertical", minHeight: 68, marginBottom: 12, boxSizing: "border-box" }}
                    />
                    {kycReviewMsg && (
                      <p style={{ fontSize: ".85rem", color: kycReviewMsg.startsWith("✅") ? "#059669" : "#dc2626", fontWeight: 600, marginBottom: 10 }}>{kycReviewMsg}</p>
                    )}
                    <button
                      style={{ width: "100%", padding: "12px", borderRadius: 10, background: kycReviewLoading ? "#94a3b8" : "#6366f1", color: "#fff", border: "none", fontWeight: 800, fontSize: ".95rem", cursor: kycReviewLoading ? "not-allowed" : "pointer", fontFamily: "inherit" }}
                      onClick={() => handleKycReview(kycDetailUser._id)} disabled={kycReviewLoading}
                    >
                      {kycReviewLoading ? "Enregistrement…" : "Valider la décision"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB CERTIFICATION — Gestion des certifications partenaires
      ══════════════════════════════════════════════════════════ */}
      {activeTab === "certification" && (
        <div className={styles.tabContent}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1.5rem", flexWrap:"wrap", gap:12 }}>
            <div>
              <h2 style={{ fontSize:"1.1rem", fontWeight:800, color:"#0f1b3f", margin:"0 0 3px" }}>🏆 Certifications Partenaire VIT AUTO</h2>
              <p style={{ margin:0, fontSize:".83rem", color:"#64748b" }}>Examinez chaque niveau de certification et attribuez les badges officiels.</p>
            </div>
            <button style={{ padding:"8px 16px", borderRadius:10, background:"#f59e0b", color:"#fff", border:"none", fontWeight:700, fontSize:".85rem", cursor:"pointer" }}
              onClick={loadCertList}>🔄 Actualiser</button>
          </div>

          {/* KPIs */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:12, marginBottom:"1.5rem" }}>
            {[
              { icon:"📋", label:"Dossiers total",    value: certList.length,                                                    color:"#6366f1" },
              { icon:"⏳", label:"En attente review", value: pendingCert,                                                         color:"#d97706" },
              { icon:"🟢", label:"Badge Vérifié",     value: certList.filter(c=>c.certificationBadge==="verifie").length,          color:"#059669" },
              { icon:"🏆", label:"Badge Fondateur",   value: certList.filter(c=>c.certificationBadge==="fondateur").length,        color:"#d97706" },
              { icon:"⭐", label:"Badge Premium",     value: certList.filter(c=>c.certificationBadge==="premium").length,          color:"#7c3aed" },
            ].map(k => <StatCard key={k.label} icon={k.icon} label={k.label} value={k.value} color={k.color} />)}
          </div>

          {/* Filtres */}
          <div style={{ display:"flex", gap:8, marginBottom:"1.25rem", flexWrap:"wrap" }}>
            {[
              { v:"all",      l:"Tous" },
              { v:"pending",  l:"⏳ Niveaux soumis" },
              { v:"verifie",  l:"🟢 Vérifié" },
              { v:"fondateur",l:"🏆 Fondateur" },
              { v:"premium",  l:"⭐ Premium" },
            ].map(f => (
              <button key={f.v} onClick={() => setCertFilter(f.v)}
                style={{ padding:"6px 14px", borderRadius:20, border:"2px solid", fontSize:"0.8rem", fontWeight:700, cursor:"pointer",
                  borderColor: certFilter===f.v ? "#f59e0b" : "#e2e8f0",
                  background:  certFilter===f.v ? "#f59e0b" : "#f8fafc",
                  color:       certFilter===f.v ? "#fff"    : "#64748b" }}>
                {f.l}
              </button>
            ))}
          </div>

          {certReviewMsg && (
            <div style={{ padding:"10px 16px", borderRadius:10, marginBottom:12, background: certReviewMsg.startsWith("✅") ? "#d1fae5" : "#fee2e2", color: certReviewMsg.startsWith("✅") ? "#059669" : "#dc2626", fontWeight:700, fontSize:".85rem" }}>
              {certReviewMsg}
            </div>
          )}

          {certLoading ? (
            <div style={{ textAlign:"center", padding:"60px 0", color:"#94a3b8" }}>⏳ Chargement…</div>
          ) : certList.length === 0 ? (
            <div style={{ textAlign:"center", padding:"60px 0", color:"#94a3b8" }}>
              <div style={{ fontSize:"3rem", marginBottom:12 }}>🏆</div>
              <p style={{ fontWeight:700, color:"#64748b" }}>Aucune demande de certification pour le moment.</p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Partenaire</th><th>Niveaux</th><th>Badge actuel</th><th>Score</th><th>Actions</th></tr></thead>
                <tbody>
                  {certList
                    .filter(c => {
                      if (certFilter === "all") return true;
                      if (certFilter === "pending") return ["level1","level2","level3","level4","level5","level6","level7"].some(l => c[l]?.status === "submitted");
                      return c.certificationBadge === certFilter;
                    })
                    .map((c) => {
                      const u = c.userId;
                      const badgeColors = { verifie:"#059669", fondateur:"#d97706", premium:"#7c3aed", none:"#94a3b8" };
                      const pendingLevels = [1,2,3,4,5,6,7].filter(n => c[`level${n}`]?.status === "submitted");
                      return (
                        <tr key={c._id}>
                          <td>
                            <div style={{ fontWeight:700 }}>{u?.firstName} {u?.lastName}</div>
                            <div style={{ fontSize:".78rem", color:"#64748b" }}>{u?.email}</div>
                            <div style={{ fontSize:".72rem", color:"#94a3b8" }}>
                              <span style={{ background:"#f0f4ff", color:"#2563eb", padding:"1px 8px", borderRadius:99, fontWeight:700 }}>{u?.role}</span>
                            </div>
                          </td>
                          <td>
                            <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                              {[1,2,3,4,5,6,7].map(n => {
                                const st = c[`level${n}`]?.status || "not_started";
                                const icons = { not_started:"○", in_progress:"◎", submitted:"⏳", approved:"✅", rejected:"❌" };
                                const cols  = { not_started:"#94a3b8", in_progress:"#3b82f6", submitted:"#d97706", approved:"#059669", rejected:"#dc2626" };
                                return (
                                  <span key={n} title={`Niveau ${n} : ${st}`}
                                    style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:22, height:22, borderRadius:6, background:"#f1f5f9", fontSize:".65rem", color:cols[st], fontWeight:800 }}>
                                    {n}{icons[st]}
                                  </span>
                                );
                              })}
                            </div>
                            {pendingLevels.length > 0 && (
                              <div style={{ fontSize:".72rem", color:"#d97706", fontWeight:700, marginTop:3 }}>
                                ⏳ Niveaux à examiner : {pendingLevels.join(", ")}
                              </div>
                            )}
                          </td>
                          <td>
                            <span style={{ fontWeight:800, color: badgeColors[c.certificationBadge] || "#94a3b8", fontSize:".85rem" }}>
                              {c.certificationBadge === "premium" ? "⭐ Premium" : c.certificationBadge === "fondateur" ? "🏆 Fondateur" : c.certificationBadge === "verifie" ? "🟢 Vérifié" : "○ Aucun"}
                            </span>
                          </td>
                          <td style={{ fontWeight:800, color:"#6366f1" }}>{c.certificationScore ?? 0}/100</td>
                          <td>
                            <button
                              style={{ padding:"5px 12px", background:"#ede9fe", color:"#7c3aed", border:"1px solid #c4b5fd", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:"0.78rem" }}
                              onClick={async () => {
                                setCertReviewMsg("");
                                const r = await fetch(`/api/certification/admin/${u?._id}`, { headers });
                                if (r.ok) { const d = await r.json(); setCertDetail(d.certification); }
                              }}>
                              🔍 Examiner
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Panneau de détail dossier ── */}
          {certDetail && (
            <div className={styles.overlay} onClick={() => { setCertDetail(null); setCertReviewLevel(null); setCertReviewMsg(""); }}>
              <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth:680, width:"95%", maxHeight:"85vh", overflow:"auto" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                  <div>
                    <h3 style={{ margin:0, fontWeight:900, fontSize:"1.05rem", color:"#0f1b3f" }}>
                      🏆 Dossier de certification
                    </h3>
                    <p style={{ margin:"4px 0 0", color:"#64748b", fontSize:".85rem" }}>
                      {certDetail.userId?.firstName} {certDetail.userId?.lastName} — {certDetail.userId?.email}
                    </p>
                  </div>
                  <button onClick={() => { setCertDetail(null); setCertReviewLevel(null); setCertReviewMsg(""); }}
                    style={{ background:"#f1f5f9", border:"none", borderRadius:8, padding:"6px 12px", cursor:"pointer", fontWeight:700 }}>✕</button>
                </div>

                {certReviewMsg && (
                  <div style={{ padding:"8px 14px", borderRadius:8, marginBottom:12, background: certReviewMsg.startsWith("✅") ? "#d1fae5" : "#fee2e2", color: certReviewMsg.startsWith("✅") ? "#059669" : "#dc2626", fontWeight:700, fontSize:".83rem" }}>
                    {certReviewMsg}
                  </div>
                )}

                {(() => {
                  const missingCount = [
                    certDetail.level1?.registrationDoc?.data, certDetail.level1?.taxDoc?.data,
                    certDetail.level2?.idFrontDoc?.data, certDetail.level2?.idBackDoc?.data, certDetail.level2?.selfieDoc?.data,
                  ].filter((v) => !v).length;
                  if (!missingCount || certDetail.overallStatus === "approved") return null;
                  return (
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, background:"#fff7ed", border:"1px solid #fed7aa", borderRadius:10, padding:"10px 14px", marginBottom:14 }}>
                      <span style={{ fontSize:"0.82rem", color:"#92400e" }}>⚠️ {missingCount} document(s) manquant(s) pour ce dossier.</span>
                      <button className={styles.btnPrimary} style={{ whiteSpace:"nowrap", flexShrink:0 }} onClick={handleCertRelance} disabled={certReviewLoading}>
                        {certReviewLoading ? "…" : "🔔 Relancer"}
                      </button>
                    </div>
                  );
                })()}

                {/* Niveaux 1-7 */}
                {[1,2,3,4,5,6,7].map(n => {
                  const lv = certDetail[`level${n}`];
                  const lvTitles = ["","Entreprise","Représentant","Activité","Banque","Véhicules","Export","Contrat"];
                  const st = lv?.status || "not_started";
                  const stColors  = { not_started:"#94a3b8", submitted:"#d97706", approved:"#059669", rejected:"#dc2626", in_progress:"#3b82f6" };
                  const stLabels  = { not_started:"Non commencé", submitted:"Soumis ⏳", approved:"Approuvé ✅", rejected:"Refusé ❌", in_progress:"En cours" };
                  return (
                    <div key={n} style={{ border:"1.5px solid #e2e8f0", borderRadius:12, padding:14, marginBottom:10,
                      borderColor: st === "approved" ? "#6ee7b7" : st === "submitted" ? "#fcd34d" : st === "rejected" ? "#fca5a5" : "#e2e8f0",
                      background:  st === "approved" ? "#f0fdf4" : st === "submitted" ? "#fffbeb" : "#fff" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: st === "submitted" ? 10 : 0 }}>
                        <div style={{ fontWeight:800, fontSize:".9rem", color:"#0f1b3f" }}>
                          Niveau {n} — {lvTitles[n]}
                        </div>
                        <span style={{ fontWeight:800, fontSize:".78rem", color: stColors[st] }}>{stLabels[st]}</span>
                      </div>
                      {lv?.adminNote && <p style={{ fontSize:".78rem", color:"#64748b", margin:"4px 0 0" }}>Note : {lv.adminNote}</p>}
                      {lv?.rejectionReason && <p style={{ fontSize:".78rem", color:"#dc2626", margin:"4px 0 0" }}>Motif refus : {lv.rejectionReason}</p>}
                      {st !== "not_started" && <CertLevelDocs level={n} lv={lv} />}

                      {st === "submitted" && (
                        certReviewLevel === n ? (
                          <div style={{ marginTop:10, background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:10, padding:12 }}>
                            <div style={{ display:"flex", gap:8, marginBottom:8 }}>
                              {["approved","rejected"].map(dec => (
                                <button key={dec} onClick={() => setCertReviewForm(p => ({ ...p, decision:dec }))}
                                  style={{ flex:1, padding:"7px 0", borderRadius:8, border:"2px solid", cursor:"pointer", fontWeight:700, fontSize:".8rem",
                                    borderColor: certReviewForm.decision===dec ? (dec==="approved"?"#059669":"#dc2626") : "#e2e8f0",
                                    background:  certReviewForm.decision===dec ? (dec==="approved"?"#d1fae5":"#fee2e2") : "#fff",
                                    color:       certReviewForm.decision===dec ? (dec==="approved"?"#059669":"#dc2626") : "#64748b" }}>
                                  {dec==="approved"?"✅ Approuver":"❌ Refuser"}
                                </button>
                              ))}
                            </div>
                            <textarea
                              rows={2}
                              placeholder="Note ou motif de refus…"
                              value={certReviewForm.note}
                              onChange={e => setCertReviewForm(p=>({...p, note:e.target.value}))}
                              style={{ width:"100%", boxSizing:"border-box", padding:8, borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:".83rem", fontFamily:"inherit", resize:"vertical" }}
                            />
                            <div style={{ display:"flex", gap:8, marginTop:8 }}>
                              <button onClick={() => handleCertLevelReview(certDetail.userId?._id, n)} disabled={certReviewLoading}
                                style={{ flex:1, padding:"8px 0", background:"#0f1b3f", color:"#fff", border:"none", borderRadius:8, fontWeight:800, cursor:"pointer", fontSize:".83rem" }}>
                                {certReviewLoading ? "…" : "Confirmer"}
                              </button>
                              <button onClick={() => setCertReviewLevel(null)}
                                style={{ padding:"8px 16px", background:"#f1f5f9", color:"#64748b", border:"none", borderRadius:8, fontWeight:700, cursor:"pointer", fontSize:".83rem" }}>
                                Annuler
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => { setCertReviewLevel(n); setCertReviewForm({ decision:"approved", note:"" }); }}
                            style={{ marginTop:8, padding:"6px 14px", background:"#f59e0b", color:"#fff", border:"none", borderRadius:8, fontWeight:700, fontSize:".8rem", cursor:"pointer" }}>
                            Examiner ce niveau
                          </button>
                        )
                      )}
                    </div>
                  );
                })}

                {/* Attribution du badge final */}
                <div style={{ border:"2px solid #fcd34d", borderRadius:12, padding:16, background:"#fffbeb", marginTop:4 }}>
                  <h4 style={{ margin:"0 0 12px", fontWeight:900, color:"#92400e" }}>🏅 Attribution du Badge Final</h4>
                  <div style={{ display:"flex", gap:8, marginBottom:10, flexWrap:"wrap" }}>
                    {[{v:"verifie",l:"🟢 Vérifié"},{v:"fondateur",l:"🏆 Fondateur"},{v:"premium",l:"⭐ Premium"},{v:"none",l:"○ Aucun"}].map(b => (
                      <button key={b.v} onClick={() => setCertBadgeForm(p=>({...p,badge:b.v}))}
                        style={{ flex:1, minWidth:100, padding:"8px 4px", borderRadius:8, border:"2px solid", cursor:"pointer", fontWeight:800, fontSize:".78rem",
                          borderColor: certBadgeForm.badge===b.v ? "#f59e0b" : "#e2e8f0",
                          background:  certBadgeForm.badge===b.v ? "#f59e0b" : "#fff",
                          color:       certBadgeForm.badge===b.v ? "#fff"    : "#64748b" }}>
                        {b.l}
                      </button>
                    ))}
                  </div>
                  <input type="text" placeholder="Message public affiché sur le profil (optionnel)" value={certBadgeForm.publicStatement}
                    onChange={e => setCertBadgeForm(p=>({...p,publicStatement:e.target.value}))}
                    style={{ width:"100%", boxSizing:"border-box", padding:"9px 12px", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:".83rem", fontFamily:"inherit", marginBottom:8 }}
                  />
                  <button onClick={() => handleCertBadge(certDetail.userId?._id)} disabled={certReviewLoading}
                    style={{ width:"100%", padding:"10px 0", background:"linear-gradient(135deg,#0f1b3f,#1e3a6e)", color:"#fff", border:"none", borderRadius:8, fontWeight:800, cursor:"pointer", fontSize:".9rem" }}>
                    {certReviewLoading ? "Enregistrement…" : "Attribuer le badge"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════ TAB IMPORT/EXPORT ══════════════════════ */}
      {activeTab === "import_export" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>🌍 Transactions Import / Export</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Suivi de toutes les demandes et transactions internationales.</p>
            </div>
            <button className={styles.btnRefresh} onClick={loadImportExport}>↻ Actualiser</button>
          </div>

          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: "1.5rem" }}>
            {[
              { icon: "🌍", label: "Total demandes",       value: ieRequests.length,                                             color: "#6366f1" },
              { icon: "⏳", label: "En attente",           value: ieRequests.filter(r => r.status === "pending").length,          color: "#f59e0b" },
              { icon: "✅", label: "Approuvées",           value: ieRequests.filter(r => r.status === "approved").length,         color: "#10b981" },
              { icon: "❌", label: "Rejetées",             value: ieRequests.filter(r => r.status === "rejected").length,         color: "#ef4444" },
            ].map(k => <StatCard key={k.label} icon={k.icon} label={k.label} value={k.value} color={k.color} />)}
          </div>

          {ieLoading ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Chargement…</div>
          ) : ieRequests.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
              <div style={{ fontSize: "3rem", marginBottom: 12 }}>🌍</div>
              <p style={{ fontWeight: 600 }}>Aucune transaction import/export pour le moment.</p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Référence</th><th>Type</th><th>Client</th><th>Montant</th><th>Statut</th><th>Date</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {ieRequests.map((r) => {
                    const ST = { pending: { l: "En attente", c: "#d97706", bg: "#fef3c7" }, approved: { l: "Approuvée", c: "#16a34a", bg: "#dcfce7" }, rejected: { l: "Rejetée", c: "#dc2626", bg: "#fee2e2" }, in_progress: { l: "En cours", c: "#3b82f6", bg: "#eff6ff" }, completed: { l: "Terminée", c: "#6366f1", bg: "#eef2ff" }, processing: { l: "En traitement", c: "#3b82f6", bg: "#eff6ff" }, contacted: { l: "Contacté", c: "#6366f1", bg: "#eef2ff" } };
                    const st = ST[r.status] || ST.pending;
                    return (
                      <tr key={r._id} className={styles.tr}>
                        <td style={{ fontWeight: 700, fontSize: ".85rem", fontFamily: "monospace" }}>{r.reference || r._id?.slice(-8)}</td>
                        <td><Badge label={r.type === "import" ? "📥 Import" : r.type === "export" ? "📤 Export" : r.type || "—"} color="#6366f1" bg="#eef2ff" /></td>
                        <td>
                          <div>
                            <strong style={{ fontSize: ".87rem" }}>{r.clientInfo?.firstName || r.buyer?.firstName || ""} {r.clientInfo?.lastName || r.buyer?.lastName || ""}</strong>
                            <div style={{ fontSize: ".74rem", color: "#94a3b8" }}>{r.clientInfo?.email || r.buyer?.email || "—"}</div>
                          </div>
                        </td>
                        <td className={styles.tdPrice}>{r.totalAmount ? `${Number(r.totalAmount).toLocaleString("fr-FR")} ${r.currency || "EUR"}` : "—"}</td>
                        <td><Badge label={st.l} color={st.c} bg={st.bg} /></td>
                        <td className={styles.tdDate}>{fmtDate(r.createdAt)}</td>
                        <td>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {["pending", "processing"].includes(r.status) && (
                              <>
                                <button disabled={ieActionSaving} onClick={() => updateIeRequestStatus(r._id, "approved")}
                                  title="Approuver" style={{ padding: "4px 8px", borderRadius: 6, border: "none", background: "#16a34a", color: "#fff", fontWeight: 700, fontSize: ".72rem", cursor: ieActionSaving ? "not-allowed" : "pointer" }}>✅</button>
                                <button disabled={ieActionSaving} onClick={() => updateIeRequestStatus(r._id, "rejected")}
                                  title="Rejeter" style={{ padding: "4px 8px", borderRadius: 6, border: "none", background: "#dc2626", color: "#fff", fontWeight: 700, fontSize: ".72rem", cursor: ieActionSaving ? "not-allowed" : "pointer" }}>❌</button>
                                <button disabled={ieActionSaving} onClick={() => updateIeRequestStatus(r._id, "contacted")}
                                  title="Marquer contacté" style={{ padding: "4px 8px", borderRadius: 6, border: "none", background: "#6366f1", color: "#fff", fontWeight: 700, fontSize: ".72rem", cursor: ieActionSaving ? "not-allowed" : "pointer" }}>📞</button>
                              </>
                            )}
                            <button disabled={ieActionSaving}
                              onClick={() => setConfirm({ message: `Supprimer définitivement la demande ${r.reference || ""} ?`, danger: true, action: () => deleteIeRequest(r._id) })}
                              title="Supprimer" style={{ padding: "4px 8px", borderRadius: 6, border: "none", background: "#f1f5f9", color: "#64748b", fontWeight: 700, fontSize: ".72rem", cursor: ieActionSaving ? "not-allowed" : "pointer" }}>🗑️</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {/* Bug réel corrigé (audit) : plafond de 100 demandes chargées,
              invisible pour l'admin — voir loadMoreIeRequests. */}
          {ieRequests.length < ieRequestsTotal && (
            <div style={{ textAlign: "center", margin: "10px 0" }}>
              <p style={{ fontSize: ".8rem", color: "#94a3b8", marginBottom: 6 }}>{ieRequests.length} chargées sur {ieRequestsTotal} au total</p>
              <button onClick={loadMoreIeRequests}
                style={{ padding: "6px 16px", borderRadius: 10, border: "1.5px solid #6366f1", background: "#fff", color: "#6366f1", fontWeight: 700, fontSize: ".8rem", cursor: "pointer" }}>
                Charger plus
              </button>
            </div>
          )}

          {/* ── Transactions IE réelles (pipeline escrow) — litiges & inspections ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "2rem 0 1rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h3 style={{ fontSize: "1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>🔒 Transactions en cours (escrow)</h3>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Pipeline réel étapes 4-14 — argent bloqué en entiercement, litiges et inspections à traiter ici.</p>
            </div>
            <button className={styles.btnRefresh} onClick={loadIeTransactions}>↻ Actualiser</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: "1.5rem" }}>
            {[
              { icon: "🔒", label: "Total",         value: ieTransactions.length, color: "#6366f1" },
              { icon: "⚖️", label: "En litige",      value: ieTransactions.filter(t => t.status === "disputed").length, color: "#dc2626" },
              { icon: "🔍", label: "Inspection en attente", value: ieTransactions.filter(t => t.status === "inspection_requested").length, color: "#d97706" },
              { icon: "⏳", label: "Paiement à vérifier", value: ieTransactions.filter(t => t.status === "payment_submitted").length, color: "#d97706" },
              { icon: "✅", label: "Terminées",      value: ieTransactions.filter(t => ["completed","funds_released"].includes(t.status)).length, color: "#10b981" },
            ].map(k => <StatCard key={k.label} icon={k.icon} label={k.label} value={k.value} color={k.color} />)}
          </div>

          {ieTxLoading ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Chargement…</div>
          ) : ieTransactions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
              <div style={{ fontSize: "3rem", marginBottom: 12 }}>🔒</div>
              <p style={{ fontWeight: 600 }}>Aucune transaction escrow pour le moment.</p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Client</th><th>Partenaire</th><th>Montant</th><th>Statut</th><th>Litige</th><th>Date</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {ieTransactions.map((t) => {
                    const ST = {
                      reserved: { l: "Réservée", c: "#6366f1", bg: "#eef2ff" },
                      disputed: { l: "⚖️ Litige", c: "#dc2626", bg: "#fee2e2" },
                      inspection_requested: { l: "Inspection demandée", c: "#d97706", bg: "#fef3c7" },
                      payment_submitted: { l: "⏳ Paiement à vérifier", c: "#d97706", bg: "#fef3c7" },
                      in_escrow: { l: "En entiercement", c: "#0891b2", bg: "#ecfeff" },
                      funds_released: { l: "Fonds libérés", c: "#10b981", bg: "#d1fae5" },
                      completed: { l: "Terminée", c: "#10b981", bg: "#d1fae5" },
                      cancelled: { l: "Annulée", c: "#94a3b8", bg: "#f1f5f9" },
                    };
                    const st = ST[t.status] || { l: t.status, c: "#64748b", bg: "#f1f5f9" };
                    return (
                      <tr key={t._id} className={styles.tr}>
                        <td><strong style={{ fontSize: ".85rem" }}>{t.client?.firstName} {t.client?.lastName}</strong><div style={{ fontSize: ".74rem", color: "#94a3b8" }}>{t.client?.email}</div></td>
                        <td><strong style={{ fontSize: ".85rem" }}>{t.partner?.firstName} {t.partner?.lastName}</strong><div style={{ fontSize: ".74rem", color: "#94a3b8" }}>{t.partner?.business?.name || t.partner?.email}</div></td>
                        <td className={styles.tdPrice}>
                          {t.finalOffer?.totalAmount ? `${Number(t.finalOffer.totalAmount).toLocaleString("fr-FR")} ${t.finalOffer.currency}` : "—"}
                          {t.payment?.commission?.amount != null && (
                            <div style={{ fontSize: ".72rem", color: "#059669", fontWeight: 700 }}>
                              Commission {(t.payment.commission.rate * 100).toFixed(0)}% : {Number(t.payment.commission.amount).toLocaleString("fr-FR")} {t.payment.currency}
                            </div>
                          )}
                        </td>
                        <td><Badge label={st.l} color={st.c} bg={st.bg} /></td>
                        <td style={{ fontSize: ".78rem", color: "#64748b", maxWidth: 200 }}>{t.dispute?.opened ? (t.dispute.reason || "Litige ouvert") : "—"}</td>
                        <td className={styles.tdDate}>{fmtDate(t.createdAt)}</td>
                        <td>
                          {t.status === "disputed" && (
                            <button className={styles.btnRefresh} style={{ background: "#dc2626", color: "#fff", border: "none" }}
                              onClick={() => { setIeTxModal({ tx: t, mode: "dispute" }); setIeTxNote(""); setIeTxRelease(true); }}>
                              ⚖️ Trancher
                            </button>
                          )}
                          {t.status === "inspection_requested" && (
                            <button className={styles.btnRefresh} style={{ background: "#d97706", color: "#fff", border: "none" }}
                              onClick={() => { setIeTxModal({ tx: t, mode: "inspection" }); setIeTxNote(""); }}>
                              🔍 Compléter
                            </button>
                          )}
                          {t.status === "payment_submitted" && (
                            <button className={styles.btnRefresh} style={{ background: "#d97706", color: "#fff", border: "none" }}
                              onClick={() => { setIeTxModal({ tx: t, mode: "payment" }); setIeTxNote(""); }}>
                              ⏳ Vérifier
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {ieTxModal && (
        <div className={styles.modalBackdrop} onClick={() => setIeTxModal(null)}>
          <div className={styles.rejectModal} onClick={(e) => e.stopPropagation()}>
            {ieTxModal.mode === "dispute" ? (
              <>
                <h3>⚖️ Trancher le litige</h3>
                <p style={{ margin: "0 0 14px", fontSize: "0.85rem", color: "#64748b" }}>
                  Raison invoquée : {ieTxModal.tx.dispute?.reason || "—"}
                </p>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, marginBottom: 14, cursor: "pointer" }}>
                  <input type="checkbox" checked={ieTxRelease} onChange={(e) => setIeTxRelease(e.target.checked)} />
                  Libérer les fonds au fournisseur (sinon : annuler et rembourser le client)
                </label>
                <textarea className={styles.rejectTextarea} placeholder="Résolution / justification..." value={ieTxNote} onChange={(e) => setIeTxNote(e.target.value)} />
                <div className={styles.rejectActions}>
                  <button className={styles.btnAccept} onClick={handleResolveIeDispute} disabled={ieTxSaving}>{ieTxSaving ? "Envoi…" : "✅ Confirmer la décision"}</button>
                  <button className={styles.btnSecondary} onClick={() => setIeTxModal(null)}>Annuler</button>
                </div>
              </>
            ) : ieTxModal.mode === "inspection" ? (
              <>
                <h3>🔍 Compléter l'inspection indépendante</h3>
                <textarea className={styles.rejectTextarea} placeholder="Notes du rapport d'inspection..." value={ieTxNote} onChange={(e) => setIeTxNote(e.target.value)} />
                <div className={styles.rejectActions}>
                  <button className={styles.btnAccept} onClick={handleCompleteIeInspection} disabled={ieTxSaving}>{ieTxSaving ? "Envoi…" : "✅ Marquer complétée"}</button>
                  <button className={styles.btnSecondary} onClick={() => setIeTxModal(null)}>Annuler</button>
                </div>
              </>
            ) : (
              <>
                <h3>⏳ Vérifier le paiement déclaré</h3>
                <p style={{ margin: "0 0 14px", fontSize: "0.85rem", color: "#64748b" }}>
                  Méthode : <strong>{ieTxModal.tx.payment?.method || "—"}</strong> · Montant : <strong>{Number(ieTxModal.tx.payment?.amount || 0).toLocaleString("fr-FR")} {ieTxModal.tx.payment?.currency}</strong><br />
                  Référence déclarée : {ieTxModal.tx.payment?.transactionRef || "—"}
                </p>
                <p style={{ margin: "0 0 14px", fontSize: "0.82rem", color: "#94a3b8" }}>
                  Vérifiez la réception réelle des fonds (relevé bancaire, mobile money, etc.) avant de confirmer.
                </p>
                <textarea className={styles.rejectTextarea} placeholder="Motif (si rejet)..." value={ieTxNote} onChange={(e) => setIeTxNote(e.target.value)} />
                <div className={styles.rejectActions}>
                  <button className={styles.btnAccept} onClick={() => handleVerifyIePayment(true)} disabled={ieTxSaving}>{ieTxSaving ? "Envoi…" : "✅ Fonds reçus — sécuriser"}</button>
                  <button className={styles.btnRefuseModal} onClick={() => handleVerifyIePayment(false)} disabled={ieTxSaving}>❌ Rejeter</button>
                  <button className={styles.btnSecondary} onClick={() => setIeTxModal(null)}>Annuler</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════ TAB LITIGES ══════════════════════ */}
      {activeTab === "litiges" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>⚖️ Gestion des litiges</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Toutes les commandes en dispute requérant une décision administrative.</p>
            </div>
            <button className={styles.btnRefresh} style={{ background: "#f1f5f9", color: "#0f1b3f", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 14px" }} onClick={loadAll}>↻ Actualiser</button>
          </div>

          {/* KPIs litiges */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 12, marginBottom: "1.5rem" }}>
            {[
              { icon: "⚖️", label: "Litiges ouverts",  value: bookings.filter(b => b.status === "disputed").length, color: "#dc2626" },
              { icon: "✅", label: "Résolus ce mois",   value: bookings.filter(b => {
                const d = b.disputeResolution?.resolvedAt;
                if (!d) return false;
                const now = new Date(); const rd = new Date(d);
                return rd.getMonth() === now.getMonth() && rd.getFullYear() === now.getFullYear();
              }).length, color: "#10b981" },
              { icon: "💰", label: "Montant en jeu",    value: fmtUSD(bookings.filter(b=>b.status==="disputed").reduce((s,b)=>s+(b.montantTotal||0),0)), color: "#f59e0b" },
            ].map(k => <StatCard key={k.label} icon={k.icon} label={k.label} value={k.value} color={k.color} />)}
          </div>

          {bookings.filter(b => b.status === "disputed").length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8" }}>
              <div style={{ fontSize: "3rem", marginBottom: 12 }}>⚖️</div>
              <p style={{ fontWeight: 700, color: "#64748b" }}>Aucun litige en cours.</p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Référence</th><th>Client</th><th>Véhicule / Service</th><th>Raison du litige</th><th>Montant</th><th>Date</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {bookings.filter(b => b.status === "disputed").map((b) => {
                    const clientName = `${b.clientInfo?.firstName||""} ${b.clientInfo?.lastName||""}`.trim();
                    const vName = b.vehicle ? [b.vehicle.marque, b.vehicle.modele].filter(Boolean).join(" ") : (b.driver ? `Chauffeur` : "—");
                    return (
                      <tr key={b._id} className={styles.tr} style={{ background: "#fff5f5" }}>
                        <td><strong style={{ fontSize:"0.8rem", fontFamily:"monospace", color:"#6366f1" }}>{b.reference||b._id?.slice(-6)}</strong></td>
                        <td><div><strong style={{ fontSize:"0.82rem" }}>{clientName||"—"}</strong><span className={styles.vehMeta}>{b.clientInfo?.email}</span></div></td>
                        <td style={{ fontSize:"0.82rem" }}>{vName}</td>
                        <td style={{ fontSize:"0.8rem", color:"#dc2626", maxWidth:200 }}>{b.clientValidation?.disputeReason||"Non précisée"}</td>
                        <td className={styles.tdPrice}>{b.montantTotal>0?fmtUSD(b.montantTotal):"—"}</td>
                        <td className={styles.tdDate}>{fmtDate(b.createdAt)}</td>
                        <td>
                          <button style={{ padding:"5px 12px", background:"#fee2e2", color:"#dc2626", border:"1px solid #fca5a5", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:"0.78rem" }}
                            onClick={() => { setDisputeModal({ booking:b }); setDisputeNote(""); setDisputeResol("completed"); }}>
                            ⚖️ Résoudre
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════ TAB CHAUFFEURS ══════════════════════ */}
      {activeTab === "chauffeurs" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>👨‍✈️ Gestion des chauffeurs</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Validez les dossiers, gérez les chauffeurs actifs et leurs missions.</p>
            </div>
            <button className={styles.btnRefresh} style={{ background: "#f1f5f9", color: "#0f1b3f", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 14px" }} onClick={loadAll}>↻ Actualiser</button>
          </div>

          {/* KPIs chauffeurs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: "1.5rem" }}>
            {[
              { icon:"👨‍✈️", label:"En attente validation", value: pendingDrivers,                                                  color:"#f59e0b" },
              { icon:"✅",   label:"Chauffeurs actifs",      value: activeDrivers.length,       color:"#10b981" },
              { icon:"🚗",   label:"Missions terminées",     value: bookings.filter(b=>b.type==="chauffeur"&&b.status==="completed").length, color:"#3b82f6" },
              { icon:"💰",   label:"Revenue chauffeurs",     value: fmtUSD(bookings.filter(b=>b.type==="chauffeur"&&b.status==="completed").reduce((s,b)=>s+(b.montantTotal||0),0)), color:"#6366f1" },
            ].map(k => <StatCard key={k.label} icon={k.icon} label={k.label} value={k.value} color={k.color} />)}
          </div>

          {/* Dossiers en attente */}
          <div className={styles.chartCard} style={{ marginBottom: "1.5rem" }}>
            <h3 className={styles.chartTitle}>⏳ Dossiers en attente de validation ({pendingDrivers})</h3>
            {pendingDrivers === 0 ? (
              <p style={{ color: "#64748b", fontSize: "0.9rem" }}>Aucun profil chauffeur en attente.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr><th>Chauffeur</th><th>Disponibilité</th><th>Tarif</th><th>Zone</th><th>Soumis le</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {pendingDriversList.map((d) => (
                      <tr key={d._id} className={styles.tr}>
                        <td>
                          <div className={styles.vehicleCell}>
                            {d.profilePhoto || d.images?.[0] ? <img src={d.profilePhoto || d.images[0]} alt="" className={styles.vehThumb} loading="lazy" decoding="async" style={{ borderRadius:"50%" }} /> : <div className={styles.vehThumbPlaceholder}>👤</div>}
                            <div>
                              <strong>{d.firstName} {d.lastName}</strong>
                              <span className={styles.vehMeta}>{d.title}</span>
                            </div>
                          </div>
                        </td>
                        <td><Badge label={d.disponibilite||"—"} color="#8b5cf6" bg="#f5f3ff" /></td>
                        <td className={styles.tdPrice}>{d.tarif?`${fmtUSD(d.tarif)}/j`:"—"}</td>
                        <td style={{ fontSize:"0.85rem", color:"#64748b" }}>{d.zone||d.ville||"—"}</td>
                        <td className={styles.tdDate}>{fmtDate(d.createdAt)}</td>
                        <td>
                          <div className={styles.actionBtns}>
                            <button className={styles.btnApprove} onClick={() => setConfirm({ message:`Approuver ${d.firstName} ${d.lastName} ?`, action:()=>updateDriverStatus(d._id,"approved") })}>✅ Valider</button>
                            <button className={styles.btnReject} onClick={() => { setDriverRejectModal({ did:d._id, name:`${d.firstName} ${d.lastName}` }); setDriverRejectReason(""); }}>✕ Rejeter</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Chauffeurs actifs — profils Driver approuvés (catalogue public "Chauffeur"),
              pas des comptes User : un chauffeur est une fiche de service publiée par
              un partenaire (owner), jamais un rôle de compte autonome (voir Register.jsx,
              qui ne propose que client/partenaire à l'inscription). */}
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>✅ Chauffeurs actifs ({activeDrivers.length})</h3>
            {activeDrivers.length === 0 ? (
              <p style={{ color:"#64748b", fontSize:"0.9rem" }}>Aucun chauffeur actif dans le catalogue.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Chauffeur</th><th>Partenaire</th><th>Zone</th><th>Tarif</th><th>Note</th><th>Actions</th></tr></thead>
                  <tbody>
                    {activeDrivers.map(d => (
                      <tr key={d._id} className={styles.tr}>
                        <td>
                          <div className={styles.userCell}>
                            <div className={styles.avatar}>{d.firstName?.[0]?.toUpperCase()||"?"}</div>
                            <strong>{d.firstName} {d.lastName}</strong>
                          </div>
                        </td>
                        <td style={{ fontSize:"0.85rem", color:"#64748b" }}>{d.owner?.firstName||"—"} {d.owner?.phone ? `· ${d.owner.phone}` : ""}</td>
                        <td style={{ fontSize:"0.85rem", color:"#64748b" }}>{d.zone||"—"}</td>
                        <td className={styles.tdPrice}>{d.tarif?`${fmtUSD(d.tarif)}/j`:"—"}</td>
                        <td>{d.noteMoyenne > 0 ? `⭐ ${d.noteMoyenne.toFixed(1)}` : "—"}</td>
                        <td>
                          <button className={styles.btnReject}
                            onClick={() => setConfirm({ message:`Retirer ${d.firstName} ${d.lastName} du catalogue ?`, action:()=>deactivateActiveDriver(d._id) })}>
                            🚫 Retirer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════ TAB NOTIFICATIONS ══════════════════════ */}
      {activeTab === "notifications" && (
        <div className={styles.tabContent}>
          <h2 style={{ fontSize:"1.1rem", fontWeight:800, color:"#0f1b3f", margin:"0 0 1.5rem" }}>🔔 Centre de notifications</h2>

          {/* Broadcast */}
          <div className={styles.chartCard} style={{ marginBottom:"1.5rem" }}>
            <h3 className={styles.chartTitle}>📢 Envoyer une notification groupée</h3>
            <div style={{ display:"flex", flexDirection:"column", gap:10, maxWidth:520 }}>
              <input style={{ borderRadius:8, border:"1.5px solid #e2e8f0", padding:"10px 14px", fontSize:"0.9rem", fontFamily:"inherit" }}
                placeholder="Titre *" value={broadcastForm.titre}
                onChange={e => setBroadcastForm({ ...broadcastForm, titre: e.target.value })} />
              <textarea style={{ borderRadius:8, border:"1.5px solid #e2e8f0", padding:"10px 14px", fontSize:"0.9rem", resize:"vertical", fontFamily:"inherit" }}
                rows={3} placeholder="Message *" value={broadcastForm.message}
                onChange={e => setBroadcastForm({ ...broadcastForm, message: e.target.value })} />
              <select style={{ borderRadius:8, border:"1.5px solid #e2e8f0", padding:"10px 14px", fontSize:"0.9rem" }}
                value={broadcastForm.targetRole} onChange={e => setBroadcastForm({ ...broadcastForm, targetRole: e.target.value })}>
                <option value="all">Tous les utilisateurs</option>
                <option value="client">Clients uniquement</option>
                <option value="partenaire">Partenaires uniquement</option>
                <option value="chauffeur">Chauffeurs uniquement</option>
                <option value="importateur">Importateurs</option>
              </select>
              <input style={{ borderRadius:8, border:"1.5px solid #e2e8f0", padding:"10px 14px", fontSize:"0.9rem", fontFamily:"inherit" }}
                placeholder="Lien interne (ex: /catalogue) — optionnel" value={broadcastForm.lien}
                onChange={e => setBroadcastForm({ ...broadcastForm, lien: e.target.value })} />
              <button className={styles.btnPrimary} style={{ width:"fit-content" }}
                disabled={broadcastSending} onClick={sendBroadcast}>
                {broadcastSending ? "Envoi en cours…" : "📤 Envoyer la notification"}
              </button>
            </div>
          </div>

          {/* Canaux disponibles */}
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>📡 Canaux de communication</h3>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:12 }}>
              {[
                { icon:"🔔", label:"Notifications in-app",  status:"Actif",       color:"#10b981" },
                { icon:"📧", label:"Email (Nodemailer)",    status:"À configurer", color:"#f59e0b" },
                { icon:"📱", label:"SMS",                   status:"Bientôt",     color:"#94a3b8" },
                { icon:"💬", label:"WhatsApp Business",     status:"Bientôt",     color:"#94a3b8" },
                { icon:"🌐", label:"Push Web (PWA)",        status:"Bientôt",     color:"#94a3b8" },
              ].map(c => (
                <div key={c.label} style={{ background:"#f8fafc", borderRadius:12, padding:"16px", border:"1.5px solid #e2e8f0" }}>
                  <div style={{ fontSize:"1.5rem", marginBottom:8 }}>{c.icon}</div>
                  <div style={{ fontWeight:700, fontSize:"0.88rem", color:"#0f1b3f", marginBottom:4 }}>{c.label}</div>
                  <Badge label={c.status} color={c.color} bg={c.color+"18"} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════ WIP STUBS ══════════════════════ */}
      {activeTab === "analytics" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>📈 Analytics Avancé</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Chiffre d'affaires, croissance et répartition — 12 derniers mois.</p>
            </div>
            <button className={styles.btnRefresh} onClick={loadAnalytics}>↻ Actualiser</button>
          </div>
          <AnalyticsSection analytics={analytics} loading={analyticsLoading} />
        </div>
      )}
      {activeTab === "transport" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>🚢 Transport International</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Suivi logistique des transactions Import/Export en cours d'acheminement.</p>
            </div>
            <button className={styles.btnRefresh} onClick={loadIeTransactions}>↻ Actualiser</button>
          </div>
          <TransportSection ieTransactions={ieTransactions} loading={ieTxLoading} />
        </div>
      )}
      {activeTab === "import_cost" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>🧮 Coûts Import — Barèmes</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Configure le moteur de calcul du coût total d'importation (devis instantané côté acheteur). Montants en USD.</p>
            </div>
            <button className={styles.btnRefresh} onClick={loadImportCostData}>↻ Actualiser</button>
          </div>

          {/* ── Barèmes pays de destination ── */}
          <div className={styles.chartCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 className={styles.chartTitle} style={{ margin: 0 }}>🌍 Barèmes par pays de destination</h3>
              <button className={styles.btnApprove} style={{ fontSize: ".8rem" }}
                onClick={() => setCostConfigForm({
                  country: "", customsDutyPercent: 20, vatPercent: 18, transitFixedFeeUSD: 150,
                  redevancesFixedFeeUSD: 100, portFeesFixedUSD: 300, deliveryFixedFeeUSD: 200,
                  insurancePercent: 1, defaultSeaFreightUSD: 1200,
                  ageSurchargeThresholdYears: 8, ageSurchargePercent: 0, active: true,
                })}>+ Nouveau barème</button>
            </div>
            {importCostLoading ? (
              <div className={styles.loadingBox} style={{ minHeight: 80 }}><div className={styles.spinner} /></div>
            ) : costConfigs.length === 0 ? (
              <p style={{ textAlign: "center", color: "#94a3b8", padding: "20px 0" }}>Aucun barème configuré — le calculateur acheteur reste indisponible tant qu'aucun pays n'est configuré.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr><th>Pays</th><th>Douane</th><th>TVA</th><th>Transit</th><th>Redevances</th><th>Port</th><th>Livraison</th><th>Assurance</th><th>Fret défaut</th><th>Statut</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {costConfigs.map((c) => (
                      <tr key={c._id} className={styles.tr}>
                        <td style={{ fontWeight: 700 }}>{c.country}</td>
                        <td>{c.customsDutyPercent}%</td>
                        <td>{c.vatPercent}%</td>
                        <td>${c.transitFixedFeeUSD}</td>
                        <td>${c.redevancesFixedFeeUSD}</td>
                        <td>${c.portFeesFixedUSD}</td>
                        <td>${c.deliveryFixedFeeUSD}</td>
                        <td>{c.insurancePercent}%</td>
                        <td>${c.defaultSeaFreightUSD}</td>
                        <td><Badge label={c.active ? "Actif" : "Inactif"} color={c.active ? "#10b981" : "#94a3b8"} bg={c.active ? "#ecfdf5" : "#f1f5f9"} /></td>
                        <td>
                          <div className={styles.actionBtns}>
                            <button className={styles.btnGhost} style={{ fontSize: ".75rem" }} onClick={() => setCostConfigForm(c)}>✏️</button>
                            <button className={styles.btnDeleteSm} style={{ fontSize: ".75rem" }} onClick={() => deleteCostConfig(c._id)}>🗑️</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Liaisons de fret ── */}
          <div className={styles.chartCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 className={styles.chartTitle} style={{ margin: 0 }}>🚢 Liaisons de fret (origine → destination)</h3>
              <button className={styles.btnApprove} style={{ fontSize: ".8rem" }}
                onClick={() => setLaneForm({ sourceCountry: "", destCountry: "", seaFreightUSD: "", inlandTransportUSD: 150, carrier: "", estimatedDelayDays: "" })}>
                + Nouvelle liaison</button>
            </div>
            {laneRates.length === 0 ? (
              <p style={{ textAlign: "center", color: "#94a3b8", padding: "20px 0" }}>Aucune liaison configurée — le fret retombe sur l'estimation générique du pays de destination.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr><th>Origine</th><th>Destination</th><th>Fret maritime</th><th>Transport intérieur</th><th>Compagnie</th><th>Délai</th><th>Statut</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {laneRates.map((l) => (
                      <tr key={l._id} className={styles.tr}>
                        <td>{l.sourceCountry}</td>
                        <td>{l.destCountry}</td>
                        <td>${l.seaFreightUSD}</td>
                        <td>${l.inlandTransportUSD}</td>
                        <td>{l.carrier || "—"}</td>
                        <td>{l.estimatedDelayDays ? `${l.estimatedDelayDays} j` : "—"}</td>
                        <td><Badge label={l.active ? "Actif" : "Inactif"} color={l.active ? "#10b981" : "#94a3b8"} bg={l.active ? "#ecfdf5" : "#f1f5f9"} /></td>
                        <td>
                          <div className={styles.actionBtns}>
                            <button className={styles.btnGhost} style={{ fontSize: ".75rem" }} onClick={() => setLaneForm(l)}>✏️</button>
                            <button className={styles.btnDeleteSm} style={{ fontSize: ".75rem" }} onClick={() => deleteLaneRate(l._id)}>🗑️</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "business_config" && (
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
                      {bizSaving === "commissions" ? "…" : "💾 Enregistrer les commissions"}
                    </button>
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
                      {bizSaving === "foundingPartner" ? "…" : "💾 Enregistrer l'offre fondateur"}
                    </button>
                  </div>

                  <div className={styles.chartCard}>
                    <h3 className={styles.chartTitle}>🧾 Frais de service client</h3>
                    <p style={{ margin: "0 0 10px", fontSize: ".8rem", color: "#64748b" }}>max(minimum, montant × %), plafonné au maximum.</p>
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
                      <h3 className={styles.chartTitle}>🌍 Frais de l'estimateur d'import</h3>
                      <p style={{ margin: "0 0 10px", fontSize: ".8rem", color: "#64748b" }}>Distinct de la commission Import/Export ci-dessus — facturé à l'acheteur pour l'estimation de coût d'import (server/services/importCostEngine.js).</p>
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
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, maxWidth: 700, marginTop: 10 }}>
                        {[["gps", "GPS"], ["babySeat", "Siège bébé"], ["insurance", "Assurance"], ["driver", "Chauffeur"]].map(([key, label]) => (
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
      )}

      {/* ── Modal devise (ExchangeRate) ── */}
      {rateForm && (
        <div className={styles.overlay} onClick={() => setRateForm(null)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3 style={{ margin: "0 0 14px", color: "#0f1b3f", fontSize: "1rem" }}>
              {rateForm._id ? "✏️ Modifier la devise" : "+ Nouvelle devise"}
            </h3>
            {[
              ["code", "Code ISO 4217 (ex. MAD)"], ["name", "Nom"], ["symbol", "Symbole"],
            ].map(([key, label]) => (
              <div key={key} style={{ marginBottom: 10 }}>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>{label}</label>
                <input value={rateForm[key] || ""} disabled={key === "code" && !!rateForm._id}
                  onChange={(e) => setRateForm((p) => ({ ...p, [key]: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
            ))}
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>Taux depuis 1 USD</label>
              <input type="number" min="0" step="0.0001" value={rateForm.rateFromUSD}
                onChange={(e) => setRateForm((p) => ({ ...p, rateFromUSD: e.target.value }))}
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: ".85rem", marginBottom: 16 }}>
              <input type="checkbox" checked={!!rateForm.active} onChange={(e) => setRateForm((p) => ({ ...p, active: e.target.checked }))} />
              Devise active
            </label>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className={styles.btnGhost} onClick={() => setRateForm(null)}>Annuler</button>
              <button className={styles.btnApprove} onClick={saveExchangeRate}>💾 Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal pays (CountryConfig) ── */}
      {countryForm && (
        <div className={styles.overlay} onClick={() => setCountryForm(null)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h3 style={{ margin: "0 0 14px", color: "#0f1b3f", fontSize: "1rem" }}>
              {countryForm._id ? "✏️ Modifier le pays" : "+ Nouveau pays"}
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>Code ISO-2 (ex. MA)</label>
                <input value={countryForm.code} disabled={!!countryForm._id}
                  onChange={(e) => setCountryForm((p) => ({ ...p, code: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
              <div>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>Nom du pays</label>
                <input value={countryForm.name}
                  onChange={(e) => setCountryForm((p) => ({ ...p, name: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
              <div>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>Drapeau (emoji)</label>
                <input value={countryForm.flag}
                  onChange={(e) => setCountryForm((p) => ({ ...p, flag: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
              <div>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>Devise par défaut</label>
                <select value={countryForm.defaultCurrency}
                  onChange={(e) => setCountryForm((p) => ({ ...p, defaultCurrency: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }}>
                  <option value="">— Choisir —</option>
                  {exchangeRates.map((r) => <option key={r.code} value={r.code}>{r.code}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>Locale (ex. fr-FR)</label>
                <input value={countryForm.locale || ""}
                  onChange={(e) => setCountryForm((p) => ({ ...p, locale: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
              <div>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>Indicatif tél. (ex. +225)</label>
                <input value={countryForm.phone || ""}
                  onChange={(e) => setCountryForm((p) => ({ ...p, phone: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
              <div>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>Langues (séparées par virgule)</label>
                <input value={(countryForm.languages || []).join(", ")}
                  onChange={(e) => setCountryForm((p) => ({ ...p, languages: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }))}
                  placeholder="fr, en" style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
              <div>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>Moyens de paiement (séparés par virgule)</label>
                <input value={(countryForm.paymentMethods || []).join(", ")}
                  onChange={(e) => setCountryForm((p) => ({ ...p, paymentMethods: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }))}
                  placeholder="card, cash, orange_money, wave, mtn, moov, paypal" style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
                <p style={{ margin: "4px 0 0", fontSize: ".72rem", color: "#94a3b8" }}>
                  Codes exacts attendus (pas de traduction) : card, cash, orange_money, wave, mtn, moov, paypal.
                  Laisser vide = tous proposés au client, sans restriction. Espèces ("cash") n'a pas de sens pour un
                  paiement d'import/export international, distinct de ce réglage.
                </p>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
              {[
                ["deliveryBaseRate", "Livraison base"], ["deliveryRatePerKm", "Livraison /km"], ["deliveryMaxKm", "Livraison max (km)"],
              ].map(([key, label]) => (
                <div key={key}>
                  <label style={{ fontSize: ".78rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>{label}</label>
                  <input type="number" min="0" value={countryForm[key]}
                    onChange={(e) => setCountryForm((p) => ({ ...p, [key]: Number(e.target.value) }))}
                    style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 10, maxWidth: 160 }}>
              <label style={{ fontSize: ".78rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Taxe locale (%)</label>
              <input type="number" min="0" max="100" step="0.1" value={countryForm.taxPercent}
                onChange={(e) => setCountryForm((p) => ({ ...p, taxPercent: Number(e.target.value) }))}
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: ".85rem", marginBottom: 16 }}>
              <input type="checkbox" checked={!!countryForm.active} onChange={(e) => setCountryForm((p) => ({ ...p, active: e.target.checked }))} />
              Pays actif
            </label>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className={styles.btnGhost} onClick={() => setCountryForm(null)}>Annuler</button>
              <button className={styles.btnApprove} onClick={saveCountryConfig}>💾 Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal campagne de réduction ── */}
      {discountForm && (
        <div className={styles.overlay} onClick={() => setDiscountForm(null)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <h3 style={{ margin: "0 0 14px", color: "#0f1b3f", fontSize: "1rem" }}>
              {discountForm._id ? "✏️ Modifier la campagne" : "+ Nouvelle campagne"}
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>Code promo</label>
                <input value={discountForm.code} disabled={!!discountForm._id}
                  onChange={(e) => setDiscountForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                  placeholder="LAUNCH50" style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
              <div>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>Réduction (%)</label>
                <input type="number" min="1" max="100" value={discountForm.discountPercent}
                  onChange={(e) => setDiscountForm((p) => ({ ...p, discountPercent: Number(e.target.value) }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>Libellé (optionnel)</label>
              <input value={discountForm.label || ""}
                onChange={(e) => setDiscountForm((p) => ({ ...p, label: e.target.value }))}
                placeholder="Lancement France" style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 6 }}>Applicable à</label>
              <div style={{ display: "flex", gap: 16 }}>
                {[["subscriptions", "Abonnements"], ["boosts", "Boosts"]].map(([key, label]) => (
                  <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: ".85rem", cursor: "pointer" }}>
                    <input type="checkbox" checked={(discountForm.appliesTo || []).includes(key)}
                      onChange={(e) => setDiscountForm((p) => {
                        const set = new Set(p.appliesTo || []);
                        e.target.checked ? set.add(key) : set.delete(key);
                        return { ...p, appliesTo: [...set] };
                      })} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: ".78rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Début (optionnel)</label>
                <input type="date" value={discountForm.startDate || ""}
                  onChange={(e) => setDiscountForm((p) => ({ ...p, startDate: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
              <div>
                <label style={{ fontSize: ".78rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Fin (optionnel)</label>
                <input type="date" value={discountForm.endDate || ""}
                  onChange={(e) => setDiscountForm((p) => ({ ...p, endDate: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
            </div>
            <div style={{ marginBottom: 10, maxWidth: 220 }}>
              <label style={{ fontSize: ".78rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Limite d'utilisations (vide = illimité)</label>
              <input type="number" min="1" value={discountForm.maxRedemptions ?? ""}
                onChange={(e) => setDiscountForm((p) => ({ ...p, maxRedemptions: e.target.value === "" ? "" : Number(e.target.value) }))}
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: ".85rem", marginBottom: 16 }}>
              <input type="checkbox" checked={!!discountForm.active} onChange={(e) => setDiscountForm((p) => ({ ...p, active: e.target.checked }))} />
              Campagne active
            </label>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className={styles.btnGhost} onClick={() => setDiscountForm(null)}>Annuler</button>
              <button className={styles.btnApprove} onClick={saveDiscountCampaign}>💾 Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal barème pays ── */}
      {costConfigForm && (
        <div className={styles.overlay} onClick={() => setCostConfigForm(null)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <h3 style={{ margin: "0 0 14px", color: "#0f1b3f", fontSize: "1rem" }}>
              {costConfigForm._id ? "✏️ Modifier le barème" : "+ Nouveau barème pays"}
            </h3>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>Pays de destination *</label>
              <input value={costConfigForm.country} disabled={!!costConfigForm._id}
                onChange={(e) => setCostConfigForm((p) => ({ ...p, country: e.target.value }))}
                placeholder="Côte d'Ivoire" style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              {[
                ["customsDutyPercent", "Droits de douane (%)"], ["vatPercent", "TVA (%)"],
                ["transitFixedFeeUSD", "Transit fixe ($)"], ["redevancesFixedFeeUSD", "Redevances fixes ($)"],
                ["portFeesFixedUSD", "Frais portuaires ($)"], ["deliveryFixedFeeUSD", "Livraison finale ($)"],
                ["insurancePercent", "Assurance (%)"], ["defaultSeaFreightUSD", "Fret maritime défaut ($)"],
                ["ageSurchargeThresholdYears", "Seuil d'âge surtaxe (ans)"], ["ageSurchargePercent", "Surtaxe véhicule ancien (%)"],
              ].map(([key, label]) => (
                <div key={key}>
                  <label style={{ fontSize: ".78rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>{label}</label>
                  <input type="number" value={costConfigForm[key]}
                    onChange={(e) => setCostConfigForm((p) => ({ ...p, [key]: e.target.value }))}
                    style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
                </div>
              ))}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".85rem", marginBottom: 14 }}>
              <input type="checkbox" checked={costConfigForm.active} onChange={(e) => setCostConfigForm((p) => ({ ...p, active: e.target.checked }))} />
              Barème actif
            </label>
            <div className={styles.confirmActions}>
              <button className={styles.btnApprove} onClick={saveCostConfig}>Enregistrer</button>
              <button className={styles.btnGhost} onClick={() => setCostConfigForm(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal liaison de fret ── */}
      {laneForm && (
        <div className={styles.overlay} onClick={() => setLaneForm(null)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h3 style={{ margin: "0 0 14px", color: "#0f1b3f", fontSize: "1rem" }}>
              {laneForm._id ? "✏️ Modifier la liaison" : "+ Nouvelle liaison de fret"}
            </h3>
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>Pays d'origine *</label>
                <input value={laneForm.sourceCountry} disabled={!!laneForm._id}
                  onChange={(e) => setLaneForm((p) => ({ ...p, sourceCountry: e.target.value }))}
                  placeholder="Chine" style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 4 }}>Pays de destination *</label>
                <input value={laneForm.destCountry} disabled={!!laneForm._id}
                  onChange={(e) => setLaneForm((p) => ({ ...p, destCountry: e.target.value }))}
                  placeholder="Côte d'Ivoire" style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: ".78rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Fret maritime ($) *</label>
                <input type="number" value={laneForm.seaFreightUSD}
                  onChange={(e) => setLaneForm((p) => ({ ...p, seaFreightUSD: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: ".78rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Transport intérieur ($)</label>
                <input type="number" value={laneForm.inlandTransportUSD}
                  onChange={(e) => setLaneForm((p) => ({ ...p, inlandTransportUSD: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: ".78rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Compagnie (optionnel)</label>
                <input value={laneForm.carrier || ""} onChange={(e) => setLaneForm((p) => ({ ...p, carrier: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: ".78rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Délai estimé (jours)</label>
                <input type="number" value={laneForm.estimatedDelayDays || ""} onChange={(e) => setLaneForm((p) => ({ ...p, estimatedDelayDays: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }} />
              </div>
            </div>
            <div className={styles.confirmActions}>
              <button className={styles.btnApprove} onClick={saveLaneRate}>Enregistrer</button>
              <button className={styles.btnGhost} onClick={() => setLaneForm(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "financement" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>🏦 Financement Automobile</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Demandes de leasing (LOA) et crédit classique — décision manuelle en attendant une intégration bancaire.</p>
            </div>
            <button className={styles.btnRefresh} onClick={loadFinancing}>↻ Actualiser</button>
          </div>
          <FinancingSection requests={financingRequests} loading={financingLoading}
            onDecide={(m) => { setFinancingModal(m); setFinancingNote(""); }} />
        </div>
      )}

      {financingModal && (
        <div className={styles.modalBackdrop} onClick={() => setFinancingModal(null)}>
          <div className={styles.rejectModal} onClick={(e) => e.stopPropagation()}>
            <h3>{financingModal.decision === "accepte" ? "✅ Accepter le financement" : "❌ Refuser le financement"}</h3>
            <textarea className={styles.rejectTextarea} placeholder="Note pour le client (optionnel)…" value={financingNote} onChange={(e) => setFinancingNote(e.target.value)} />
            <div className={styles.rejectActions}>
              <button className={styles.btnAccept} onClick={submitFinancingDecision} disabled={financingSaving}>{financingSaving ? "Envoi…" : "Confirmer"}</button>
              <button className={styles.btnSecondary} onClick={() => setFinancingModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
      {activeTab === "assurance" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>🔒 Assurance Automobile</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Demandes auto/location/import — décision manuelle en attendant une intégration assureur.</p>
            </div>
            <button className={styles.btnRefresh} onClick={loadInsurance}>↻ Actualiser</button>
          </div>
          <InsuranceSection requests={insuranceList} loading={insuranceLoading}
            onDecide={(m) => { setInsuranceModal(m); setInsurancePremium(""); setInsuranceNote(""); }} />
        </div>
      )}

      {insuranceModal && (
        <div className={styles.modalBackdrop} onClick={() => setInsuranceModal(null)}>
          <div className={styles.rejectModal} onClick={(e) => e.stopPropagation()}>
            <h3>{insuranceModal.status === "approved" ? "✅ Approuver la demande" : "❌ Refuser la demande"}</h3>
            {insuranceModal.status === "approved" && (
              <input type="number" placeholder="Prime proposée (USD)" value={insurancePremium}
                onChange={(e) => setInsurancePremium(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem", marginBottom: 10 }} />
            )}
            <textarea className={styles.rejectTextarea} placeholder="Note pour le client (optionnel)…" value={insuranceNote} onChange={(e) => setInsuranceNote(e.target.value)} />
            <div className={styles.rejectActions}>
              <button className={styles.btnAccept} onClick={submitInsuranceDecision} disabled={insuranceSaving}>{insuranceSaving ? "Envoi…" : "Confirmer"}</button>
              <button className={styles.btnSecondary} onClick={() => setInsuranceModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "reversements" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>💸 Reversements partenaire ({payoutsTotal})</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>
                Ce que VIT AUTO doit à chaque partenaire (généré automatiquement à la complétion d'une commande) — aucun virement n'est exécuté automatiquement, "Marquer payé" trace seulement qu'il a été fait manuellement (banque/mobile money).
              </p>
            </div>
            <button className={styles.btnRefresh} onClick={loadPayouts}>↻ Actualiser</button>
          </div>

          <div className={styles.filterRow} style={{ marginBottom: 16 }}>
            {["pending", "paid", ""].map((s) => (
              <button key={s || "all"}
                className={`${styles.filterBtn} ${payoutsFilter === s ? styles.filterActive : ""}`}
                onClick={() => setPayoutsFilter(s)}>
                {s === "pending" ? "En attente" : s === "paid" ? "Payés" : "Tous"}
              </button>
            ))}
          </div>

          {payoutsLoading ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Chargement…</div>
          ) : payoutsList.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Aucun reversement pour ce filtre.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Partenaire</th><th>Référence</th><th>Montant</th><th>Statut</th><th>Date</th><th>Actions</th></tr></thead>
                <tbody>
                  {payoutsList.map((p) => (
                    <tr key={p._id}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{p.partnerId?.firstName} {p.partnerId?.lastName}</div>
                        <div style={{ fontSize: ".78rem", color: "#64748b" }}>{p.partnerId?.email}</div>
                      </td>
                      <td style={{ fontSize: ".82rem" }}>{p.notes || p.transactionId}</td>
                      <td className={styles.tdPrice}>{fmtUSD(p.commissionAmount)}</td>
                      <td>
                        {p.status === "paid"
                          ? <Badge label="✅ Payé" color="#16a34a" bg="#dcfce7" />
                          : <Badge label="🕐 En attente" color="#d97706" bg="#fef3c7" />}
                        {p.status === "paid" && p.paidViaTxId && (
                          <div style={{ fontSize: ".72rem", color: "#94a3b8", marginTop: 2 }}>Réf : {p.paidViaTxId}</div>
                        )}
                      </td>
                      <td className={styles.tdDate}>{fmtDate(p.createdAt)}</td>
                      <td>
                        {p.status !== "paid" && (
                          <button disabled={payoutMarkingId === p._id} onClick={() => markPayoutPaid(p._id)}
                            style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: "#16a34a", color: "#fff", fontWeight: 700, fontSize: ".78rem", cursor: payoutMarkingId === p._id ? "not-allowed" : "pointer", opacity: payoutMarkingId === p._id ? 0.6 : 1 }}>
                            {payoutMarkingId === p._id ? "…" : "✅ Marquer payé"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "service_requests" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>🧰 Autres services</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Transport, transit, douanes, immatriculation, garantie, financement, change de devises — décision manuelle en attendant une intégration prestataire.</p>
            </div>
            <button className={styles.btnRefresh} onClick={loadServiceRequests}>↻ Actualiser</button>
          </div>
          <ServiceRequestsSection requests={svcReqList} loading={svcReqLoading} category={svcReqCategory} onCategoryChange={setSvcReqCategory}
            onDecide={(m) => { setSvcReqModal(m); setSvcReqAmount(""); setSvcReqNote(""); }} />
        </div>
      )}

      {svcReqModal && (
        <div className={styles.modalBackdrop} onClick={() => setSvcReqModal(null)}>
          <div className={styles.rejectModal} onClick={(e) => e.stopPropagation()}>
            <h3>{svcReqModal.status === "approved" ? "✅ Approuver la demande" : "❌ Refuser la demande"}</h3>
            {svcReqModal.status === "approved" && (
              <input type="number" placeholder="Devis proposé (USD)" value={svcReqAmount}
                onChange={(e) => setSvcReqAmount(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem", marginBottom: 10 }} />
            )}
            <textarea className={styles.rejectTextarea} placeholder="Note pour le client (optionnel)…" value={svcReqNote} onChange={(e) => setSvcReqNote(e.target.value)} />
            <div className={styles.rejectActions}>
              <button className={styles.btnAccept} onClick={submitServiceRequestDecision} disabled={svcReqSaving}>{svcReqSaving ? "Envoi…" : "Confirmer"}</button>
              <button className={styles.btnSecondary} onClick={() => setSvcReqModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          TAB PAIEMENTS — Abonnements Pro / Boosts en attente
          Aucune passerelle de paiement réelle n'étant branchée (Stripe/Orange
          Money/Wave), chaque activation Pro/Boost reste "pending" jusqu'à
          confirmation manuelle ici, une fois le paiement réellement reçu
          hors-plateforme (virement, dépôt, etc.).
      ══════════════════════════════════════════════════ */}
      {activeTab === "paiements" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f1b3f", margin: 0 }}>
              💳 Abonnements Pro & Mises en avant — confirmation de paiement
            </h2>
            <button className={styles.btnRefresh} onClick={loadSubRequests}>↻ Actualiser</button>
          </div>

          {subLoading ? (
            <p style={{ color: "#64748b" }}>Chargement…</p>
          ) : subRequests.length === 0 ? (
            <p style={{ color: "#64748b" }}>Aucune demande en attente de confirmation.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {subRequests.map((sub) => {
                const pendingPayments = (sub.paymentHistory || []).filter((p) => p.status === "pending");
                const pendingBoosts   = (sub.boosts || []).filter((b) => !b.isActive);
                if (!pendingPayments.length && !pendingBoosts.length) return null;
                return (
                  <div key={sub._id} className={styles.chartCard}>
                    <h3 className={styles.chartTitle}>
                      {sub.vendor?.firstName} {sub.vendor?.lastName} — {sub.vendor?.email}
                    </h3>
                    {pendingPayments.map((p) => (
                      <div key={p._id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: "1px solid #f1f5f9", flexWrap: "wrap" }}>
                        <div style={{ fontSize: ".88rem" }}>
                          <strong>{PLAN_TIER_LABELS[p.planTier] || p.planTier}</strong> — {fmtUSD(p.amount)} · {p.method} · période {p.period}
                          {p.promoCode && <span style={{ marginLeft: 8, fontSize: ".72rem", fontWeight: 700, color: "#7c3aed", background: "#ede9fe", padding: "2px 8px", borderRadius: 6 }}>🎟️ {p.promoCode}</span>}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            className={styles.btnPrimary}
                            disabled={subActioning === `${sub._id}:${p._id}`}
                            onClick={() => subAction(`plan/${p._id}/approve`, sub._id, p._id)}
                          >✅ Confirmer le paiement</button>
                          <button
                            className={styles.btnDanger}
                            disabled={subActioning === `${sub._id}:${p._id}`}
                            onClick={() => subAction(`plan/${p._id}/reject`, sub._id, p._id)}
                          >❌ Rejeter</button>
                        </div>
                      </div>
                    ))}
                    {pendingBoosts.map((b) => (
                      <div key={b._id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: "1px solid #f1f5f9", flexWrap: "wrap" }}>
                        <div style={{ fontSize: ".88rem" }}>
                          <strong>Mise en avant ({b.tier})</strong> — véhicule #{String(b.vehicle).slice(-6)} · {fmtUSD(b.priceUSD)}
                          {b.promoCode && <span style={{ marginLeft: 8, fontSize: ".72rem", fontWeight: 700, color: "#7c3aed", background: "#ede9fe", padding: "2px 8px", borderRadius: 6 }}>🎟️ {b.promoCode}</span>}
                        </div>
                        <button
                          className={styles.btnPrimary}
                          disabled={subActioning === `${sub._id}:${b._id}`}
                          onClick={() => subAction(`boost/${b._id}/approve`, sub._id, b._id)}
                        >✅ Confirmer le paiement</button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          TAB AVIS CLIENTS — modération
      ══════════════════════════════════════════════════ */}
      {activeTab === "reviews" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f1b3f", margin: 0 }}>⭐ Avis clients — modération</h2>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select value={reviewsFilter} onChange={(e) => setReviewsFilter(e.target.value)} style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 12px", fontSize: ".85rem" }}>
                <option value="">Tous les avis</option>
                <option value="true">Visibles</option>
                <option value="false">Masqués</option>
              </select>
              <button className={styles.btnRefresh} onClick={loadReviews}>↻ Actualiser</button>
            </div>
          </div>

          {reviewsLoading ? (
            <p style={{ color: "#64748b" }}>Chargement…</p>
          ) : reviewsList.length === 0 ? (
            <p style={{ color: "#64748b" }}>Aucun avis.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {reviewsList.map((r) => (
                <div key={r._id} className={styles.chartCard} style={{ opacity: r.visible ? 1 : 0.6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <strong>{"⭐".repeat(r.note)}</strong>{" "}
                      <span style={{ color: "#64748b", fontSize: ".85rem" }}>
                        — {r.targetLabel || (r.targetType === "vehicle" ? "Véhicule" : "Chauffeur")} · par {r.reviewer?.firstName} {r.reviewer?.lastName}
                      </span>
                      {!r.visible && <span style={{ marginLeft: 8, fontSize: ".72rem", color: "#ef4444", fontWeight: 700 }}>MASQUÉ</span>}
                      {r.commentaire && <p style={{ margin: "6px 0 0", fontSize: ".88rem", color: "#374151" }}>{r.commentaire}</p>}
                    </div>
                    <button
                      className={r.visible ? styles.btnDanger : styles.btnPrimary}
                      disabled={reviewActioning === r._id}
                      onClick={() => toggleReviewVisibility(r)}
                    >
                      {r.visible ? "🚫 Masquer" : "↺ Réafficher"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "escrow" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>🔐 Compte Séquestre (Escrow)</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Fonds Import/Export actuellement bloqués ou déjà libérés.</p>
            </div>
            <button className={styles.btnRefresh} onClick={loadIeTransactions}>↻ Actualiser</button>
          </div>
          <EscrowSection ieTransactions={ieTransactions} loading={ieTxLoading} />
        </div>
      )}
      {activeTab === "partner_verif" && (
        <PartnerVerifSection
          token={token}
          headers={headers}
          pvList={pvList}
          pvStats={pvStats}
          pvLoading={pvLoading}
          pvFilter={pvFilter}
          setPvFilter={setPvFilter}
          pvDetail={pvDetail}
          setPvDetail={setPvDetail}
          pvCreateModal={pvCreateModal}
          setPvCreateModal={setPvCreateModal}
          pvCreateForm={pvCreateForm}
          setPvCreateForm={setPvCreateForm}
          pvSaving={pvSaving}
          setPvSaving={setPvSaving}
          pvCriterionLoading={pvCriterionLoading}
          setPvCriterionLoading={setPvCriterionLoading}
          users={users}
          onOpenTrustOverview={openTrustOverview}
          onRefresh={loadPartnerVerif}
          showToast={showToast}
        />
      )}
      {/* ══════════════════════ TAB PMS PARTNERS ══════════════════════ */}
      {activeTab === "pms_partners" && (
        <div className={styles.tabContent}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1.2rem", flexWrap:"wrap", gap:12 }}>
            <div>
              <h2 style={{ fontSize:"1.1rem", fontWeight:800, color:"#0f1b3f", margin:"0 0 3px" }}>🏪 Partner Hub PMS</h2>
              <p style={{ margin:0, fontSize:".83rem", color:"#64748b" }}>Showrooms, leads et devis de tous les partenaires.</p>
            </div>
            <button className={styles.btnRefresh} onClick={loadPMSAdmin}>↻ Actualiser</button>
          </div>

          {/* KPIs */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:12, marginBottom:"1.5rem" }}>
            {[
              { icon:"🏪", label:"Showrooms total",  value: pmsStats?.totalShowrooms  || 0, color:"#6366f1" },
              { icon:"🌐", label:"Publiés",           value: pmsStats?.publishedShowrooms || 0, color:"#10b981" },
              { icon:"🎯", label:"Leads total",       value: pmsStats?.totalLeads      || 0, color:"#3b82f6" },
              { icon:"🏆", label:"Leads gagnés",      value: pmsStats?.wonLeads        || 0, color:"#059669" },
              { icon:"📄", label:"Devis total",       value: pmsStats?.totalQuotes     || 0, color:"#8b5cf6" },
              { icon:"✅", label:"Devis acceptés",    value: pmsStats?.acceptedQuotes  || 0, color:"#d97706" },
            ].map(k => <StatCard key={k.label} icon={k.icon} label={k.label} value={k.value} color={k.color} />)}
          </div>

          {/* Filtres */}
          <div className={styles.filterBar}>
            {[
              { v:"all",       l:"Tous les showrooms" },
              { v:"published", l:"✅ Publiés" },
              { v:"hidden",    l:"👁 Non publiés" },
            ].map(f => (
              <button key={f.v} onClick={() => { setPmsFilter(f.v); }}
                style={{ padding:"6px 14px", borderRadius:8, border:`2px solid ${pmsFilter===f.v?"#6366f1":"#e2e8f0"}`,
                  background: pmsFilter===f.v?"#6366f1":"#fff", color: pmsFilter===f.v?"#fff":"#374151",
                  fontWeight:700, fontSize:".8rem", cursor:"pointer" }}>
                {f.l}
              </button>
            ))}
          </div>

          {/* Table showrooms */}
          {pmsLoading ? (
            <div style={{ textAlign:"center", padding:"3rem", color:"#94a3b8" }}>Chargement…</div>
          ) : pmsShowrooms.length === 0 ? (
            <div style={{ textAlign:"center", padding:"3rem", color:"#94a3b8" }}>
              <div style={{ fontSize:"3rem", marginBottom:12 }}>🏪</div>
              <p style={{ fontWeight:600 }}>Aucun showroom partenaire pour le moment.</p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Partenaire</th>
                    <th>Showroom</th>
                    <th>Pays</th>
                    <th>Trust Score</th>
                    <th>Vues</th>
                    <th>KYC</th>
                    <th>Statut</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pmsShowrooms.map((s) => {
                    const p = s.partnerId || {};
                    const KYC_COLOR = { VERIFIE:"#16a34a", EN_ATTENTE:"#d97706", REFUSE:"#dc2626" };
                    const kycColor = KYC_COLOR[p.kycStatus] || "#94a3b8";
                    const score = s.trustScore?.overall || 0;
                    const scoreColor = score >= 75 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626";
                    return (
                      <tr key={s._id} className={styles.tr}>
                        <td>
                          <div style={{ fontWeight:700, fontSize:".85rem" }}>
                            {p.firstName} {p.lastName}
                          </div>
                          <div style={{ fontSize:".73rem", color:"#64748b" }}>{p.email}</div>
                          <div style={{ fontSize:".72rem", marginTop:2 }}>
                            <span style={{ color: kycColor, fontWeight:700 }}>
                              {p.kycStatus === "VERIFIE" ? "✅ KYC" : p.kycStatus === "REFUSE" ? "❌ KYC" : "⏳ KYC"}
                            </span>
                            {!p.isActive && <span style={{ marginLeft:6, color:"#ef4444", fontWeight:700 }}>● Bloqué</span>}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight:700, fontSize:".85rem" }}>{s.companyName || "—"}</div>
                          {s.tagline && <div style={{ fontSize:".73rem", color:"#64748b" }}>{s.tagline}</div>}
                          {s.slug && <div style={{ fontSize:".72rem", color:"#94a3b8" }}>/{s.slug}</div>}
                        </td>
                        <td style={{ fontSize:".82rem" }}>{s.country || "—"}</td>
                        <td>
                          <span style={{ fontWeight:800, color: scoreColor, fontSize:".9rem" }}>{score}/100</span>
                        </td>
                        <td style={{ fontSize:".82rem", color:"#64748b" }}>{s.viewCount || 0}</td>
                        <td>
                          {p.certificationBadge === "premium"   && <Badge label="⭐ Premium"   color="#7c3aed" bg="#ede9fe" />}
                          {p.certificationBadge === "fondateur" && <Badge label="🏆 Fondateur" color="#d97706" bg="#fef3c7" />}
                          {p.certificationBadge === "verifie"   && <Badge label="🟢 Vérifié"  color="#16a34a" bg="#dcfce7" />}
                          {!p.certificationBadge && <span style={{ color:"#cbd5e1", fontSize:".75rem" }}>—</span>}
                        </td>
                        <td>
                          {s.isPublished
                            ? <Badge label="🌐 En ligne"   color="#16a34a" bg="#dcfce7" />
                            : <Badge label="👁 Brouillon"  color="#d97706" bg="#fef3c7" />}
                        </td>
                        <td>
                          <div className={styles.actionBtns}>
                            <button
                              onClick={() => adminToggleShowroom(s._id)}
                              style={{ padding:"4px 10px", borderRadius:6, border:"1.5px solid",
                                borderColor: s.isPublished ? "#fca5a5" : "#86efac",
                                background:  s.isPublished ? "#fef2f2" : "#f0fdf4",
                                color:       s.isPublished ? "#dc2626" : "#16a34a",
                                fontWeight:700, fontSize:".75rem", cursor:"pointer" }}>
                              {s.isPublished ? "Dépublier" : "Publier"}
                            </button>
                            {s.slug && (
                              <a href={`/showroom/${s.slug}`} target="_blank" rel="noopener noreferrer"
                                style={{ padding:"4px 10px", borderRadius:6, border:"1.5px solid #bfdbfe",
                                  background:"#eff6ff", color:"#2563eb", fontWeight:700,
                                  fontSize:".75rem", textDecoration:"none" }}>
                                Voir →
                              </a>
                            )}
                            {/* Vue de confiance unifiée — croise ce partenaire avec
                                KYC/Founding Partner/Certification sans changer d'onglet. */}
                            {p._id && (
                              <button
                                title="Vue de confiance unifiée"
                                onClick={() => openTrustOverview(p)}
                                style={{ padding:"4px 10px", borderRadius:6, border:"1.5px solid #e2e8f0",
                                  background:"#f8fafc", color:"#0f1b3f", fontWeight:700, fontSize:".75rem", cursor:"pointer" }}>
                                🛡️
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "founding_partners" && (() => {
        const ST = {
          brouillon:    { l: "Brouillon",      c: "#94a3b8", bg: "#f8fafc" },
          soumis:       { l: "Soumis ⏳",      c: "#d97706", bg: "#fef3c7" },
          en_review:    { l: "En Review",      c: "#3b82f6", bg: "#eff6ff" },
          loi_envoyee:  { l: "LOI Envoyée",    c: "#7c3aed", bg: "#f5f3ff" },
          loi_signee:   { l: "LOI Signée ✓",  c: "#059669", bg: "#d1fae5" },
          accord_envoye:{ l: "Accord Envoyé",  c: "#f59e0b", bg: "#fff7ed" },
          accord_signe: { l: "Accord Signé ✓", c: "#059669", bg: "#d1fae5" },
          actif:        { l: "Actif 🌟",       c: "#16a34a", bg: "#dcfce7" },
          rejete:       { l: "Rejeté",         c: "#dc2626", bg: "#fee2e2" },
          info_demandee:{ l: "Info Requise",   c: "#d97706", bg: "#fef3c7" },
          aucun_dossier:{ l: "Sans dossier ⚠️", c: "#dc2626", bg: "#fee2e2" },
        };
        return (
          <div className={styles.tabContent}>
            {/* Header + vue toggle */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1rem", flexWrap:"wrap", gap:12 }}>
              <div>
                <h2 style={{ fontSize:"1.1rem", fontWeight:800, color:"#0f1b3f", margin:"0 0 3px" }}>🌟 Founding Partners</h2>
                <p style={{ margin:0, fontSize:".83rem", color:"#64748b" }}>Étape obligatoire de tout partenaire — aucune limite de places.</p>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <div style={{ display:"flex", background:"#f1f5f9", borderRadius:10, padding:3, gap:2 }}>
                  {[{v:"onboarding",l:"📋 Onboarding"},{v:"crm",l:"🗂️ CRM Directory"}].map(({v,l})=>(
                    <button key={v} onClick={()=>setFoundingView(v)}
                      style={{ padding:"6px 14px", borderRadius:8, border:"none", fontWeight:700, fontSize:".8rem", cursor:"pointer",
                        background: foundingView===v ? "#0f1b3f" : "transparent",
                        color: foundingView===v ? "#fff" : "#64748b" }}>
                      {l}
                    </button>
                  ))}
                </div>
                <button className={styles.btnRefresh} onClick={loadFoundingPartners}>↻</button>
              </div>
            </div>

            {/* KPIs */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:12, marginBottom:"1.2rem" }}>
              {[
                { icon:"📋", label:"Total dossiers",    value: foundingStats?.total        || 0, color:"#0f1b3f" },
                { icon:"⏳", label:"En attente",         value: foundingPending              || 0, color:"#d97706" },
                { icon:"✍️", label:"LOI envoyées",       value: foundingStats?.byStatus?.loi_envoyee || 0, color:"#7c3aed" },
                { icon:"📜", label:"Accords envoyés",    value: foundingStats?.byStatus?.accord_envoye || 0, color:"#f59e0b" },
                { icon:"🌟", label:"Fondateurs actifs",  value: foundingStats?.activeFounders || 0, color:"#16a34a" },
                { icon:"❌", label:"Rejetés",             value: foundingStats?.byStatus?.rejete || 0, color:"#dc2626" },
                { icon:"⚠️", label:"Sans dossier",        value: foundingList.filter(o => o.noDossier).length, color:"#dc2626" },
              ].map(k => <StatCard key={k.label} icon={k.icon} label={k.label} value={k.value} color={k.color} />)}
            </div>

            {/* ── VUE CRM DIRECTORY ──────────────────────────────────────────── */}
            {foundingView === "crm" && (() => {
              const CRM_STATUS = {
                interested: { l:"Intéressé",  c:"#d97706", bg:"#fef3c7" },
                reserved:   { l:"Réservé",    c:"#7c3aed", bg:"#f5f3ff" },
                verified:   { l:"Vérifié ✓",  c:"#0284c7", bg:"#e0f2fe" },
                active:     { l:"Actif 🌟",   c:"#16a34a", bg:"#dcfce7" },
                inactive:   { l:"Inactif",    c:"#94a3b8", bg:"#f8fafc" },
              };
              const PRIORITY_ST = {
                high:   { l:"🔴 Haute",   c:"#dc2626" },
                medium: { l:"🟡 Moyenne", c:"#d97706" },
                low:    { l:"🟢 Basse",   c:"#16a34a" },
              };
              const CHANNELS = { whatsapp:"WhatsApp", wechat:"WeChat", email:"Email", phone:"Téléphone", meeting:"RDV", other:"Autre", "":"—" };
              const today = new Date();
              const overdue = (d) => d && new Date(d) < today;

              const filtered = foundingCRMFilter
                ? foundingList.filter(o => (o.adminCRM?.crmStatus || "interested") === foundingCRMFilter)
                : foundingList;

              return (
                <div>
                  {/* Barre de filtres CRM */}
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:14, alignItems:"center" }}>
                    <span style={{ fontSize:".8rem", fontWeight:700, color:"#64748b" }}>Filtrer :</span>
                    {[{v:"",l:"Tous"},
                      {v:"interested",l:"Intéressé"},
                      {v:"reserved",l:"Réservé"},
                      {v:"verified",l:"Vérifié"},
                      {v:"active",l:"Actif"},
                      {v:"inactive",l:"Inactif"},
                    ].map(({v,l})=>(
                      <button key={v} onClick={()=>setFoundingCRMFilter(v)}
                        style={{ padding:"5px 12px", borderRadius:20, border:"1.5px solid", fontWeight:700, fontSize:".76rem", cursor:"pointer",
                          borderColor: foundingCRMFilter===v ? "#0f1b3f" : "#e2e8f0",
                          background: foundingCRMFilter===v ? "#0f1b3f" : "#fff",
                          color: foundingCRMFilter===v ? "#fff" : "#64748b" }}>
                        {l}
                      </button>
                    ))}
                    <span style={{ marginLeft:"auto", fontSize:".76rem", color:"#94a3b8" }}>{filtered.length} entrée(s)</span>
                  </div>

                  {/* Table CRM */}
                  {foundingLoading ? (
                    <div style={{ textAlign:"center", padding:"2rem", color:"#94a3b8" }}>Chargement…</div>
                  ) : filtered.length === 0 ? (
                    <div style={{ textAlign:"center", padding:"2rem", color:"#94a3b8" }}>
                      <div style={{ fontSize:"2rem", marginBottom:8 }}>🗂️</div>
                      <p style={{ fontWeight:600 }}>Aucun partenaire dans ce filtre.</p>
                    </div>
                  ) : (
                    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                      {filtered.map((o) => {
                        const crm   = o.adminCRM || {};
                        const ci    = o.companyInfo || {};
                        const bv    = o.businessVerification || {};
                        const crmSt = CRM_STATUS[crm.crmStatus || "interested"] || CRM_STATUS.interested;
                        const pri   = PRIORITY_ST[crm.priority || "medium"] || PRIORITY_ST.medium;
                        const isEdit = foundingCRMEdit?.id === o._id;
                        const editData = foundingCRMEdit?.data || {};

                        return (
                          <div key={o._id} style={{ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:12, overflow:"hidden", boxShadow:"0 1px 3px rgba(0,0,0,.04)" }}>
                            {/* Ligne principale CRM */}
                            <div style={{ display:"grid", gridTemplateColumns:"2fr 1.5fr 1.5fr 1fr 1fr auto", gap:12, padding:"12px 16px", alignItems:"center" }}>
                              {/* Entreprise */}
                              <div>
                                <div style={{ fontWeight:800, fontSize:".88rem", color:"#0f1b3f" }}>{ci.legalName || "—"}</div>
                                <div style={{ fontSize:".74rem", color:"#64748b", marginTop:2 }}>
                                  {ci.registrationCountry || "—"} · {bv.entityTypes?.join(", ") || "—"}
                                </div>
                                <div style={{ fontSize:".73rem", color:"#94a3b8", marginTop:1 }}>
                                  {bv.brands?.slice(0,3).join(", ") || "—"}
                                  {bv.brands?.length > 3 ? ` +${bv.brands.length - 3}` : ""}
                                </div>
                              </div>
                              {/* Contact */}
                              <div style={{ fontSize:".8rem" }}>
                                <div style={{ fontWeight:600, color:"#0f1b3f" }}>
                                  {ci.mainContact || `${(o.userId?.firstName||"")} ${(o.userId?.lastName||"")}`}
                                  <CountryFlag code={o.userId?.country} countriesConfig={COUNTRIES_CONFIG} />
                                </div>
                                {ci.whatsapp && <div style={{ color:"#16a34a", marginTop:1 }}>📱 {ci.whatsapp}</div>}
                                {ci.wechat   && <div style={{ color:"#07c160", marginTop:1 }}>💬 {ci.wechat}</div>}
                                {ci.email    && <div style={{ color:"#3b82f6", marginTop:1 }}>✉️ {ci.email}</div>}
                              </div>
                              {/* Dernière contact / Next follow-up */}
                              <div style={{ fontSize:".78rem" }}>
                                <div style={{ color:"#64748b" }}>
                                  Dernier contact : <strong style={{ color:"#0f1b3f" }}>
                                    {crm.lastContactDate ? new Date(crm.lastContactDate).toLocaleDateString("fr-FR") : "—"}
                                  </strong>
                                  {crm.lastContactChannel && <span style={{ color:"#94a3b8" }}> via {CHANNELS[crm.lastContactChannel]}</span>}
                                </div>
                                <div style={{ marginTop:4, color: overdue(crm.nextFollowUpDate) ? "#dc2626" : "#64748b" }}>
                                  Prochain suivi : <strong style={{ color: overdue(crm.nextFollowUpDate) ? "#dc2626" : "#0f1b3f" }}>
                                    {crm.nextFollowUpDate ? new Date(crm.nextFollowUpDate).toLocaleDateString("fr-FR") : "—"}
                                  </strong>
                                  {overdue(crm.nextFollowUpDate) && <span style={{ color:"#dc2626", fontWeight:700 }}> ⚠️ En retard</span>}
                                </div>
                                {crm.internalNotes && (
                                  <div style={{ marginTop:4, color:"#64748b", fontSize:".72rem", fontStyle:"italic",
                                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:200 }}
                                    title={crm.internalNotes}>
                                    📝 {crm.internalNotes}
                                  </div>
                                )}
                              </div>
                              {/* CRM Status */}
                              <div style={{ textAlign:"center" }}>
                                <span style={{ display:"inline-block", fontSize:".72rem", fontWeight:700, padding:"4px 10px", borderRadius:20,
                                  background:crmSt.bg, color:crmSt.c }}>
                                  {crmSt.l}
                                </span>
                              </div>
                              {/* Priorité */}
                              <div style={{ textAlign:"center", fontSize:".76rem", fontWeight:700, color:pri.c }}>{pri.l}</div>
                              {/* Actions */}
                              <div style={{ display:"flex", gap:6 }}>
                                <button onClick={() => setFoundingCRMEdit(isEdit ? null : { id: o._id, data: {
                                  crmStatus:          crm.crmStatus || "interested",
                                  lastContactDate:    crm.lastContactDate ? new Date(crm.lastContactDate).toISOString().slice(0,10) : "",
                                  lastContactChannel: crm.lastContactChannel || "",
                                  nextFollowUpDate:   crm.nextFollowUpDate  ? new Date(crm.nextFollowUpDate).toISOString().slice(0,10) : "",
                                  internalNotes:      crm.internalNotes || "",
                                  priority:           crm.priority || "medium",
                                }})}
                                  style={{ padding:"5px 10px", border:"1.5px solid #e2e8f0", borderRadius:8, background: isEdit ? "#0f1b3f" : "#fff",
                                    color: isEdit ? "#fff" : "#64748b", fontWeight:700, fontSize:".75rem", cursor:"pointer" }}>
                                  {isEdit ? "✕" : "✏️"}
                                </button>
                                {ci.whatsapp && (
                                  <a href={`https://wa.me/${ci.whatsapp.replace(/\D/g,"")}`} target="_blank" rel="noopener noreferrer"
                                    style={{ display:"flex", alignItems:"center", padding:"5px 10px", border:"1.5px solid #dcfce7",
                                      borderRadius:8, background:"#f0fdf4", color:"#16a34a", fontWeight:700, fontSize:".75rem", textDecoration:"none" }}>
                                    WA
                                  </a>
                                )}
                              </div>
                            </div>

                            {/* Formulaire d'édition CRM inline */}
                            {isEdit && (
                              <div style={{ borderTop:"1px solid #f1f5f9", padding:"14px 16px", background:"#f8fafc" }}>
                                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:12, marginBottom:12 }}>
                                  {/* CRM Status */}
                                  <div>
                                    <label style={{ fontSize:".73rem", fontWeight:700, color:"#64748b", display:"block", marginBottom:4 }}>Statut CRM</label>
                                    <select value={editData.crmStatus}
                                      onChange={e => setFoundingCRMEdit(prev => ({ ...prev, data: { ...prev.data, crmStatus: e.target.value } }))}
                                      style={{ width:"100%", padding:"6px 8px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem" }}>
                                      <option value="interested">Intéressé</option>
                                      <option value="reserved">Réservé</option>
                                      <option value="verified">Vérifié</option>
                                      <option value="active">Actif</option>
                                      <option value="inactive">Inactif</option>
                                    </select>
                                  </div>
                                  {/* Priorité */}
                                  <div>
                                    <label style={{ fontSize:".73rem", fontWeight:700, color:"#64748b", display:"block", marginBottom:4 }}>Priorité</label>
                                    <select value={editData.priority}
                                      onChange={e => setFoundingCRMEdit(prev => ({ ...prev, data: { ...prev.data, priority: e.target.value } }))}
                                      style={{ width:"100%", padding:"6px 8px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem" }}>
                                      <option value="high">🔴 Haute</option>
                                      <option value="medium">🟡 Moyenne</option>
                                      <option value="low">🟢 Basse</option>
                                    </select>
                                  </div>
                                  {/* Dernier contact */}
                                  <div>
                                    <label style={{ fontSize:".73rem", fontWeight:700, color:"#64748b", display:"block", marginBottom:4 }}>Dernier contact</label>
                                    <input type="date" value={editData.lastContactDate}
                                      onChange={e => setFoundingCRMEdit(prev => ({ ...prev, data: { ...prev.data, lastContactDate: e.target.value } }))}
                                      style={{ width:"100%", padding:"6px 8px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem", boxSizing:"border-box" }} />
                                  </div>
                                  {/* Canal */}
                                  <div>
                                    <label style={{ fontSize:".73rem", fontWeight:700, color:"#64748b", display:"block", marginBottom:4 }}>Canal</label>
                                    <select value={editData.lastContactChannel}
                                      onChange={e => setFoundingCRMEdit(prev => ({ ...prev, data: { ...prev.data, lastContactChannel: e.target.value } }))}
                                      style={{ width:"100%", padding:"6px 8px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem" }}>
                                      <option value="">— Sélectionner</option>
                                      <option value="whatsapp">WhatsApp</option>
                                      <option value="wechat">WeChat</option>
                                      <option value="email">Email</option>
                                      <option value="phone">Téléphone</option>
                                      <option value="meeting">RDV physique</option>
                                      <option value="other">Autre</option>
                                    </select>
                                  </div>
                                  {/* Prochain suivi */}
                                  <div>
                                    <label style={{ fontSize:".73rem", fontWeight:700, color:"#64748b", display:"block", marginBottom:4 }}>Prochain suivi</label>
                                    <input type="date" value={editData.nextFollowUpDate}
                                      onChange={e => setFoundingCRMEdit(prev => ({ ...prev, data: { ...prev.data, nextFollowUpDate: e.target.value } }))}
                                      style={{ width:"100%", padding:"6px 8px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem", boxSizing:"border-box" }} />
                                  </div>
                                </div>
                                {/* Notes internes */}
                                <div style={{ marginBottom:12 }}>
                                  <label style={{ fontSize:".73rem", fontWeight:700, color:"#64748b", display:"block", marginBottom:4 }}>Notes internes</label>
                                  <textarea value={editData.internalNotes}
                                    onChange={e => setFoundingCRMEdit(prev => ({ ...prev, data: { ...prev.data, internalNotes: e.target.value } }))}
                                    rows={2}
                                    placeholder="Observations, historique, points clés de la négociation…"
                                    style={{ width:"100%", padding:"8px 10px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem", resize:"vertical", fontFamily:"inherit", boxSizing:"border-box" }} />
                                </div>
                                <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                                  <button onClick={() => setFoundingCRMEdit(null)}
                                    style={{ padding:"7px 16px", border:"1.5px solid #e2e8f0", borderRadius:8, background:"#fff", color:"#64748b", fontWeight:700, fontSize:".82rem", cursor:"pointer" }}>
                                    Annuler
                                  </button>
                                  <button onClick={() => foundingUpdateCRM(o._id, editData)}
                                    style={{ padding:"7px 18px", border:"none", borderRadius:8, background:"#0f1b3f", color:"#fff", fontWeight:800, fontSize:".82rem", cursor:"pointer" }}>
                                    💾 Sauvegarder
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── VUE ONBOARDING ─────────────────────────────────────────────── */}
            {/* ── Lien d'invitation universel ─────────────────────────────────── */}
            {(() => {
              if (foundingView !== "onboarding") return null;
              const inviteLink = `${window.location.origin}/partner-onboarding`;
              // Taux lus depuis bizConfig (PricingConfig live) — jamais figés dans le
              // texte d'invitation, sinon ce message continuerait d'annoncer d'anciens
              // taux après une modification depuis Configuration métier.
              const fpRate      = bizConfig?.foundingPartner?.entreprise;
              const fpDuration  = bizConfig?.foundingPartner?.durationMonths ?? 12;
              const stdLocation = Math.round((bizConfig?.commissions?.standard?.location ?? 0.15) * 100);
              const stdVente    = Math.round((bizConfig?.commissions?.standard?.vente ?? 0.03) * 100);
              const fpLocation  = Math.round((fpRate?.location ?? 0.10) * 100);
              const fpVente     = Math.round((fpRate?.vente ?? 0.015) * 100);
              const businessSub = bizConfig?.subscriptions?.business?.priceUSD ?? 19.99;
              const subValue    = `$${Math.round(businessSub * fpDuration)}+`;
              const waMsg = encodeURIComponent(
                `Bonjour ! 👋\n\nVIT-AUTO vous invite à rejoindre notre *Programme Partenaire Fondateur* — l'étape d'intégration de tout nouveau partenaire.\n\n✅ *Vos avantages Founding Partner :*\n• Commission Location : *${fpLocation}%* (standard ${stdLocation}%)\n• Commission Vente : *${fpVente}%* (standard ${stdVente}%)\n• Abonnement Premium *OFFERT ${fpDuration} mois* (valeur ${subValue})\n• Badge *"Founding Partner"* sur toutes vos annonces\n• Placement prioritaire dans le catalogue international\n• Accès anticipé à toutes les nouvelles fonctionnalités\n\n🔗 *Inscrivez-vous et déposez votre dossier directement ici :*\n${inviteLink}\n\nDes questions ? Contactez-nous : contact@vit-auto.com\n\n_VIT-AUTO — Plateforme Automobile Internationale_`
              );
              const mailSubject = encodeURIComponent("Rejoignez le Programme Founding Partner VIT-AUTO");
              const mailBody = encodeURIComponent(
                `Bonjour,\n\nVIT-AUTO vous invite à rejoindre son Programme Partenaire Fondateur — l'étape d'intégration de tout nouveau partenaire.\n\nVos avantages Founding Partner :\n• Commission Location : ${fpLocation}% (standard ${stdLocation}%)\n• Commission Vente : ${fpVente}% (standard ${stdVente}%)\n• Abonnement Premium OFFERT ${fpDuration} mois (valeur ${subValue})\n• Badge "Founding Partner" sur toutes vos annonces\n• Placement prioritaire dans le catalogue international\n\nInscrivez-vous et déposez votre dossier directement ici :\n${inviteLink}\n\nCordialement,\nManassé N'DRI N'GUESSAN — Founder & CEO\nVIT-AUTO | contact@vit-auto.com`
              );
              return (
                <div style={{ background:"#fff", border:"2px solid #e2e8f0", borderRadius:14, padding:"18px 20px", marginBottom:"1.5rem" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
                    <span style={{ fontSize:"1.3rem" }}>🔗</span>
                    <div>
                      <div style={{ fontWeight:800, fontSize:".9rem", color:"#0f1b3f" }}>Lien d'invitation universel</div>
                      <div style={{ fontSize:".76rem", color:"#64748b" }}>À envoyer à n'importe quel partenaire potentiel — fonctionne pour tout le monde, tant qu'il reste des places</div>
                    </div>
                  </div>
                  {/* Lien */}
                  <div style={{ display:"flex", alignItems:"center", gap:10, background:"#f8fafc", border:"1.5px solid #e2e8f0", borderRadius:10, padding:"10px 14px", marginBottom:12, flexWrap:"wrap" }}>
                    <code style={{ flex:1, fontSize:".82rem", color:"#0f1b3f", fontFamily:"monospace", wordBreak:"break-all" }}>{inviteLink}</code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(inviteLink); showToast("Lien copié !", "success"); }}
                      style={{ padding:"6px 14px", borderRadius:8, border:"none", background:"#0f1b3f", color:"#fff", fontWeight:700, fontSize:".78rem", cursor:"pointer", whiteSpace:"nowrap" }}>
                      📋 Copier
                    </button>
                  </div>
                  {/* Boutons de partage */}
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                    <a href={`https://wa.me/?text=${waMsg}`} target="_blank" rel="noopener noreferrer"
                      style={{ display:"inline-flex", alignItems:"center", gap:7, background:"#25D366", color:"#fff", textDecoration:"none", padding:"9px 16px", borderRadius:10, fontWeight:800, fontSize:".82rem" }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      WhatsApp
                    </a>
                    <a href={`mailto:?subject=${mailSubject}&body=${mailBody}`}
                      style={{ display:"inline-flex", alignItems:"center", gap:7, background:"#3b82f6", color:"#fff", textDecoration:"none", padding:"9px 16px", borderRadius:10, fontWeight:800, fontSize:".82rem" }}>
                      ✉️ Email
                    </a>
                    <a href={inviteLink} target="_blank" rel="noopener noreferrer"
                      style={{ display:"inline-flex", alignItems:"center", gap:7, background:"#f8fafc", color:"#0f1b3f", textDecoration:"none", padding:"9px 16px", borderRadius:10, fontWeight:700, fontSize:".82rem", border:"1.5px solid #e2e8f0" }}>
                      👁 Aperçu
                    </a>
                  </div>
                  <p style={{ margin:"10px 0 0", fontSize:".73rem", color:"#94a3b8" }}>
                    Ce lien fonctionne pour tout partenaire : s'il n'a pas de compte → il s'inscrit puis accède au portail. S'il a déjà un compte partenaire → il arrive directement sur son dossier. Le programme n'a plus de plafond de places.
                  </p>
                </div>
              );
            })()}

            {/* Lien sécurisé généré (à envoyer par WhatsApp) */}
            {foundingView === "onboarding" && foundingSignLink && (
              <div style={{ background:"linear-gradient(135deg,#0f1b3f,#1a3a6e)", borderRadius:14, padding:"20px 24px", marginBottom:"1.5rem", color:"#fff" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                  <span style={{ fontSize:"1.5rem" }}>🔐</span>
                  <div>
                    <div style={{ fontWeight:800, fontSize:"1rem" }}>
                      Lien sécurisé généré — {foundingSignLink.type === "loi" ? "LOI" : "Accord de Partenariat"}
                    </div>
                    <div style={{ fontSize:".8rem", opacity:.75 }}>{foundingSignLink.companyName} · Valable 7 jours · Usage unique</div>
                  </div>
                  <button onClick={() => setFoundingSignLink(null)}
                    style={{ marginLeft:"auto", background:"rgba(255,255,255,.15)", border:"none", color:"#fff", borderRadius:8, padding:"4px 10px", cursor:"pointer", fontSize:".8rem" }}>
                    ✕ Fermer
                  </button>
                </div>
                {/* Lien affiché */}
                <div style={{ background:"rgba(0,0,0,.3)", borderRadius:10, padding:"12px 16px", marginBottom:14, display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                  <code style={{ flex:1, fontSize:".78rem", color:"#93c5fd", wordBreak:"break-all", fontFamily:"monospace" }}>
                    {foundingSignLink.link}
                  </code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(foundingSignLink.link); showToast("Lien copié !", "success"); }}
                    style={{ background:"#ff4d2d", border:"none", color:"#fff", borderRadius:8, padding:"8px 16px", fontWeight:700, cursor:"pointer", fontSize:".82rem", whiteSpace:"nowrap" }}>
                    📋 Copier
                  </button>
                </div>
                {/* Boutons de partage */}
                <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(
                      foundingSignLink.type === "loi"
                        ? `Bonjour ! Votre Lettre d'Intention VIT-AUTO (${foundingSignLink.companyName}) est prête pour signature. Cliquez ici pour lire et signer votre LOI : ${foundingSignLink.link}\n\nCe lien est sécurisé, valable 7 jours et à usage unique.\n\nVIT-AUTO — contact@vit-auto.com`
                        : `Bonjour ! Votre Accord de Partenariat Fondateur VIT-AUTO (${foundingSignLink.companyName}) est prêt. Cliquez ici pour signer et activer votre statut Founding Partner : ${foundingSignLink.link}\n\nCe lien expire dans 7 jours.\n\nVIT-AUTO — contact@vit-auto.com`
                    )}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ display:"inline-flex", alignItems:"center", gap:8, background:"#25D366", color:"#fff", textDecoration:"none", padding:"10px 18px", borderRadius:10, fontWeight:800, fontSize:".88rem" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    Envoyer via WhatsApp
                  </a>
                  <a
                    href={`mailto:?subject=VIT-AUTO%20—%20${encodeURIComponent(foundingSignLink.type === "loi" ? "Votre LOI est prête" : "Votre Accord est prêt")}&body=${encodeURIComponent(
                      foundingSignLink.type === "loi"
                        ? `Bonjour,\n\nVotre Lettre d'Intention VIT-AUTO est prête pour signature.\n\nCliquez ici pour signer : ${foundingSignLink.link}\n\nCe lien expire dans 7 jours.\n\nCordialement,\nVIT-AUTO — contact@vit-auto.com`
                        : `Bonjour,\n\nVotre Accord de Partenariat Fondateur VIT-AUTO est prêt.\n\nCliquez ici pour signer et activer votre statut : ${foundingSignLink.link}\n\nCe lien expire dans 7 jours.\n\nCordialement,\nVIT-AUTO — contact@vit-auto.com`
                    )}`}
                    style={{ display:"inline-flex", alignItems:"center", gap:8, background:"#3b82f6", color:"#fff", textDecoration:"none", padding:"10px 18px", borderRadius:10, fontWeight:800, fontSize:".88rem" }}>
                    ✉️ Email manuel
                  </a>
                  <a href={foundingSignLink.link} target="_blank" rel="noopener noreferrer"
                    style={{ display:"inline-flex", alignItems:"center", gap:8, background:"rgba(255,255,255,.15)", color:"#fff", textDecoration:"none", padding:"10px 18px", borderRadius:10, fontWeight:700, fontSize:".88rem", border:"1.5px solid rgba(255,255,255,.25)" }}>
                    🔗 Ouvrir le lien
                  </a>
                </div>
              </div>
            )}

            {/* Modal Approbation / Rejet */}
            {foundingView === "onboarding" && foundingAction && (
              <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.5)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
                <div style={{ background:"#fff", borderRadius:16, padding:24, maxWidth:440, width:"100%", boxShadow:"0 20px 60px rgba(0,0,0,.25)" }}>
                  <h3 style={{ margin:"0 0 12px", color:"#0f1b3f", fontSize:"1rem", fontWeight:800 }}>
                    {foundingAction.type === "approve" ? "✅ Approuver la candidature"
                      : foundingAction.type === "request-info" ? "🔔 Relancer le partenaire"
                      : "❌ Rejeter le dossier"}
                  </h3>
                  <p style={{ fontSize:".85rem", color:"#64748b", marginBottom:16 }}>
                    {foundingAction.type === "approve"
                      ? "La LOI sera générée et envoyée par email. Un lien sécurisé sera affiché ici pour partage WhatsApp."
                      : foundingAction.type === "request-info"
                      ? "Le partenaire reçoit une notification et un email l'invitant à compléter son dossier (le message ci-dessous lui sera affiché tel quel)."
                      : "Cette action est définitive. Le partenaire recevra une notification."}
                  </p>
                  <textarea
                    value={foundingNote}
                    onChange={e => setFoundingNote(e.target.value)}
                    placeholder={foundingAction.type === "approve" ? "Note interne (optionnelle)…"
                      : foundingAction.type === "request-info" ? "Ex : Merci de compléter les informations entreprise et vos documents légaux pour poursuivre votre candidature Founding Partner."
                      : "Motif du rejet (obligatoire)…"}
                    style={{ width:"100%", minHeight:90, padding:12, border:"1.5px solid #e2e8f0", borderRadius:10, fontSize:".85rem", resize:"vertical", boxSizing:"border-box", fontFamily:"inherit" }}
                  />
                  <div style={{ display:"flex", gap:10, marginTop:14 }}>
                    <button onClick={() => { setFoundingAction(null); setFoundingNote(""); }}
                      style={{ flex:1, padding:"10px", border:"1.5px solid #e2e8f0", borderRadius:10, background:"#f8fafc", cursor:"pointer", fontWeight:700, fontSize:".85rem" }}>
                      Annuler
                    </button>
                    <button
                      onClick={() => foundingAction.type === "approve"
                        ? foundingApprove(foundingAction.id, foundingNote)
                        : foundingAction.type === "request-info"
                        ? foundingRequestInfo(foundingAction.id, foundingNote)
                        : foundingReject(foundingAction.id, foundingNote)}
                      disabled={foundingSubmitting || (foundingAction.type !== "approve" && !foundingNote.trim())}
                      style={{ flex:2, padding:"10px", border:"none", borderRadius:10, cursor: foundingSubmitting ? "not-allowed" : "pointer", fontWeight:800, fontSize:".85rem", opacity: (foundingSubmitting || (foundingAction.type !== "approve" && !foundingNote.trim())) ? 0.6 : 1,
                        background: foundingAction.type === "approve" ? "#16a34a" : foundingAction.type === "request-info" ? "#f59e0b" : "#dc2626", color:"#fff" }}>
                      {foundingSubmitting ? "Envoi…" : foundingAction.type === "approve" ? "Approuver & Envoyer LOI" : foundingAction.type === "request-info" ? "Envoyer la relance" : "Confirmer le rejet"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Liste des dossiers */}
            {foundingView === "onboarding" && foundingLoading && (
              <div style={{ textAlign:"center", padding:"3rem", color:"#94a3b8" }}>Chargement…</div>
            )}
            {foundingView === "onboarding" && !foundingLoading && foundingList.length === 0 && (
              <div style={{ textAlign:"center", padding:"3rem", color:"#94a3b8" }}>
                <div style={{ fontSize:"3rem", marginBottom:12 }}>🌟</div>
                <p style={{ fontWeight:600 }}>Aucune candidature Founding Partner pour le moment.</p>
              </div>
            )}
            {foundingView === "onboarding" && !foundingLoading && foundingList.length !== 0 && (
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                {foundingList.map((o) => {
                  const st = ST[o.status] || { l: o.status, c: "#64748b", bg: "#f8fafc" };
                  const user = o.userId || {};
                  const isDetail = foundingDetail === o._id;
                  return (
                    <div key={o._id} style={{ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:14, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,.05)" }}>
                      {/* Ligne principale */}
                      <div style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 18px", cursor:"pointer" }}
                        onClick={() => setFoundingDetail(isDetail ? null : o._id)}>
                        <div style={{ width:40, height:40, borderRadius:"50%", background:"linear-gradient(135deg,#0f1b3f,#1a3a6e)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:800, fontSize:".9rem", flexShrink:0 }}>
                          {(o.companyInfo?.legalName || "?")[0].toUpperCase()}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:800, fontSize:".9rem", color:"#0f1b3f", display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                            {o.companyInfo?.legalName || "Société non renseignée"}
                            <span style={{ fontSize:".7rem", background:st.bg, color:st.c, padding:"2px 8px", borderRadius:20, fontWeight:700 }}>{st.l}</span>
                            {o.legalEntityType === "particulier" && <span style={{ fontSize:".7rem", background:"#e0e7ff", color:"#4338ca", padding:"2px 8px", borderRadius:20, fontWeight:700 }}>🧑 Particulier</span>}
                            {o.isFoundingPartner && <span style={{ fontSize:".7rem", background:"#fef3c7", color:"#b45309", padding:"2px 8px", borderRadius:20, fontWeight:700 }}>🌟 FP</span>}
                          </div>
                          <div style={{ fontSize:".76rem", color:"#64748b", marginTop:2 }}>
                            {user.firstName} {user.lastName}<CountryFlag code={user.country} countriesConfig={COUNTRIES_CONFIG} /> · {user.email}
                            <span style={{ marginLeft:8, color:"#94a3b8" }}>Réf: {o.referenceNumber || "—"}</span>
                            {/* Le Founding Partner Program est par entité (PartnerBusiness) — un même
                                partenaire peut avoir plusieurs dossiers, un par entité. */}
                            {o.businessId?.companyName && (
                              <span style={{ marginLeft:8, color:"#6366f1", fontWeight:700 }}>🏢 {o.businessId.companyName}</span>
                            )}
                          </div>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
                          {/* Actions rapides selon le statut */}
                          {["soumis","en_review"].includes(o.status) && (
                            <>
                              <button onClick={e => { e.stopPropagation(); setFoundingAction({ id: o._id, type:"approve" }); setFoundingNote(""); }}
                                style={{ padding:"6px 12px", borderRadius:8, border:"none", background:"#16a34a", color:"#fff", fontWeight:700, fontSize:".76rem", cursor:"pointer" }}>
                                ✅ Approuver
                              </button>
                              <button onClick={e => { e.stopPropagation(); setFoundingAction({ id: o._id, type:"reject" }); setFoundingNote(""); }}
                                style={{ padding:"6px 12px", borderRadius:8, border:"none", background:"#dc2626", color:"#fff", fontWeight:700, fontSize:".76rem", cursor:"pointer" }}>
                                ❌ Rejeter
                              </button>
                            </>
                          )}
                          {["brouillon","info_demandee"].includes(o.status) && (
                            <button onClick={e => { e.stopPropagation(); setFoundingAction({ id: o._id, type:"request-info" }); setFoundingNote(""); }}
                              style={{ padding:"6px 12px", borderRadius:8, border:"none", background:"#f59e0b", color:"#fff", fontWeight:700, fontSize:".76rem", cursor:"pointer" }}
                              title="Dossier incomplet — notifier le partenaire pour qu'il le complète">
                              🔔 Relancer
                            </button>
                          )}
                          {/* Entité SANS AUCUN dossier — le partenaire n'a jamais cliqué
                              "Commencer ma candidature" (voir adminList, orphanRows) : rien à
                              approuver/renvoyer, seulement à inviter à démarrer. */}
                          {o.noDossier && (
                            <button onClick={e => { e.stopPropagation(); foundingRelaunchBusiness(o._id); }}
                              disabled={foundingRowActionId === o._id}
                              style={{ padding:"6px 12px", borderRadius:8, border:"none", background:"#dc2626", color:"#fff", fontWeight:700, fontSize:".76rem", cursor: foundingRowActionId === o._id ? "not-allowed" : "pointer", opacity: foundingRowActionId === o._id ? 0.6 : 1 }}
                              title="Aucune candidature démarrée pour cette entité — envoyer une invitation à démarrer">
                              🔔 Relancer
                            </button>
                          )}
                          {o.status === "loi_signee" && (
                            <button onClick={e => { e.stopPropagation(); foundingSendAgreement(o._id); }}
                              disabled={foundingRowActionId === o._id}
                              style={{ padding:"6px 14px", borderRadius:8, border:"none", background:"#7c3aed", color:"#fff", fontWeight:700, fontSize:".76rem", cursor: foundingRowActionId === o._id ? "not-allowed" : "pointer", opacity: foundingRowActionId === o._id ? 0.6 : 1 }}>
                              📜 Envoyer Accord
                            </button>
                          )}
                          {["loi_envoyee","accord_envoye"].includes(o.status) && (
                            <span style={{ fontSize:".75rem", color:"#7c3aed", fontWeight:600 }}>⏳ En attente signature</span>
                          )}
                          {["accord_signe","actif"].includes(o.status) && (
                            <span style={{ fontSize:".75rem", color:"#16a34a", fontWeight:700 }}>🌟 Actif</span>
                          )}
                          {/* Vue de confiance unifiée — croise ce dossier avec KYC/
                              Certification/PMS sans changer d'onglet. */}
                          {user._id && (
                            <button
                              title="Vue de confiance unifiée"
                              onClick={e => { e.stopPropagation(); openTrustOverview(user); }}
                              style={{ padding:"6px 10px", borderRadius:8, border:"none", background:"#f1f5f9", color:"#0f1b3f", fontWeight:700, fontSize:".8rem", cursor:"pointer" }}>
                              🛡️
                            </button>
                          )}
                          <span style={{ color:"#94a3b8", fontSize:".9rem" }}>{isDetail ? "▲" : "▼"}</span>
                        </div>
                      </div>

                      {/* Détail expandable */}
                      {isDetail && (
                        <div style={{ borderTop:"1px solid #f1f5f9", padding:"16px 18px", background:"#fafbfd" }}>
                          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:12, marginBottom:14 }}>
                            <div>
                              <div style={{ fontSize:".72rem", color:"#94a3b8", fontWeight:700, textTransform:"uppercase", marginBottom:4 }}>Entreprise</div>
                              <div style={{ fontSize:".84rem", color:"#0f1b3f", fontWeight:700 }}>{o.companyInfo?.legalName || "—"}</div>
                              <div style={{ fontSize:".77rem", color:"#64748b" }}>{o.companyInfo?.registrationCountry || "—"} · {o.companyInfo?.email || "—"}</div>
                              <div style={{ fontSize:".77rem", color:"#64748b" }}>{o.companyInfo?.phone || "—"} · {o.companyInfo?.whatsapp || "—"}</div>
                            </div>
                            <div>
                              <div style={{ fontSize:".72rem", color:"#94a3b8", fontWeight:700, textTransform:"uppercase", marginBottom:4 }}>Contact</div>
                              <div style={{ fontSize:".84rem", color:"#0f1b3f", fontWeight:700 }}>{o.companyInfo?.mainContact || `${user.firstName} ${user.lastName}`}</div>
                              <div style={{ fontSize:".77rem", color:"#64748b" }}>{o.companyInfo?.mainContactPosition || "—"}</div>
                            </div>
                            <div>
                              <div style={{ fontSize:".72rem", color:"#94a3b8", fontWeight:700, textTransform:"uppercase", marginBottom:4 }}>Commissions</div>
                              <div style={{ fontSize:".82rem", color:"#0f1b3f" }}>Location: <strong>{o.commissions?.location || 10}%</strong></div>
                              <div style={{ fontSize:".82rem", color:"#0f1b3f" }}>Vente: <strong>{o.commissions?.vente || 2}%</strong></div>
                              <div style={{ fontSize:".82rem", color:"#0f1b3f" }}>Chauffeur: <strong>{o.commissions?.chauffeur || 10}%</strong></div>
                            </div>
                            <div>
                              <div style={{ fontSize:".72rem", color:"#94a3b8", fontWeight:700, textTransform:"uppercase", marginBottom:4 }}>Documents LOI/Accord</div>
                              <div style={{ fontSize:".8rem" }}>
                                LOI: {o.loi?.signedAt ? <span style={{ color:"#16a34a", fontWeight:700 }}>✓ Signée {new Date(o.loi.signedAt).toLocaleDateString("fr-FR")}</span> : o.loi?.sentAt ? <span style={{ color:"#7c3aed" }}>Envoyée</span> : <span style={{ color:"#94a3b8" }}>—</span>}
                              </div>
                              <div style={{ fontSize:".8rem" }}>
                                Accord: {o.agreement?.signedAt ? <span style={{ color:"#16a34a", fontWeight:700 }}>✓ Signé {new Date(o.agreement.signedAt).toLocaleDateString("fr-FR")}</span> : o.agreement?.sentAt ? <span style={{ color:"#f59e0b" }}>Envoyé</span> : <span style={{ color:"#94a3b8" }}>—</span>}
                              </div>
                              {o.loi?.signerName && <div style={{ fontSize:".76rem", color:"#64748b", marginTop:4 }}>Signataire: {o.loi.signerName}</div>}
                            </div>
                          </div>
                          <FoundingDocs o={o} />
                          <FoundingBusinessInfo o={o} />
                          {/* Regénérer le lien sécurisé */}
                          {o.status === "loi_envoyee" && (
                            <div style={{ background:"#f5f3ff", border:"1px solid #ddd6fe", borderRadius:10, padding:"10px 14px", marginTop:8 }}>
                              <p style={{ margin:"0 0 8px", fontSize:".8rem", color:"#4c1d95", fontWeight:700 }}>🔐 Partenaire n'a pas encore signé la LOI</p>
                              <p style={{ margin:"0 0 10px", fontSize:".77rem", color:"#6d28d9" }}>Le lien envoyé peut avoir expiré ou ne pas s'être ouvert correctement.</p>
                              <button
                                onClick={() => { foundingResendDocuments(o._id); }}
                                disabled={foundingRowActionId === o._id}
                                style={{ padding:"6px 14px", borderRadius:8, border:"none", background:"#7c3aed", color:"#fff", fontWeight:700, fontSize:".78rem", cursor: foundingRowActionId === o._id ? "not-allowed" : "pointer", opacity: foundingRowActionId === o._id ? 0.6 : 1 }}>
                                🔄 Renvoyer la LOI
                              </button>
                            </div>
                          )}
                          {o.status === "accord_envoye" && (
                            <div style={{ background:"#fff7ed", border:"1px solid #fed7aa", borderRadius:10, padding:"10px 14px", marginTop:8 }}>
                              <p style={{ margin:"0 0 8px", fontSize:".8rem", color:"#92400e", fontWeight:700 }}>⏳ En attente de signature de l'accord</p>
                              <button
                                onClick={() => { foundingResendDocuments(o._id); }}
                                disabled={foundingRowActionId === o._id}
                                style={{ padding:"6px 14px", borderRadius:8, border:"none", background:"#f59e0b", color:"#fff", fontWeight:700, fontSize:".78rem", cursor: foundingRowActionId === o._id ? "not-allowed" : "pointer", opacity: foundingRowActionId === o._id ? 0.6 : 1 }}>
                                🔄 Renvoyer l'accord
                              </button>
                            </div>
                          )}
                          {o.auditLog?.length > 0 && (
                            <div style={{ marginTop:12 }}>
                              <div style={{ fontSize:".72rem", color:"#94a3b8", fontWeight:700, textTransform:"uppercase", marginBottom:6 }}>Historique</div>
                              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                                {o.auditLog.slice(-5).reverse().map((a, i) => (
                                  <div key={i} style={{ fontSize:".74rem", color:"#64748b", display:"flex", gap:8 }}>
                                    <span style={{ color:"#94a3b8" }}>{new Date(a.timestamp).toLocaleDateString("fr-FR")}</span>
                                    <span style={{ fontWeight:700, color:"#0f1b3f" }}>{a.action}</span>
                                    {a.note && <span>— {a.note}</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {activeTab === "partenaires" && <WipSection icon="🤝" title="Gestion des Partenariats" subtitle="Contrats partenaires, commissions, et tableau de bord dédié par partenaire stratégique." features={["Concessionnaires, loueurs, assureurs, banques","Contrats : date, commission, statut","Tableau de bord commissions par partenaire","Catégories : BYD, Hyundai, Total, NSIA..."]} />}
      {activeTab === "ads" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>📢 Publicités & Sponsoring</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Bannières affichées sur le site public — accueil, catalogue, barre latérale.</p>
            </div>
            <button className={styles.btnRefresh} onClick={loadAds}>↻ Actualiser</button>
          </div>
          <AdsSection ads={adsList} loading={adsLoading} form={adForm} setForm={setAdForm} saving={adSaving} onSave={saveAd} onToggle={toggleAdActive} onDelete={deleteAd} />
        </div>
      )}
      {activeTab === "support" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>🎧 Support Client</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Conversations client_support / partner_support — file partagée entre tous les admins actifs.</p>
            </div>
            <button style={{ background: "#f1f5f9", color: "#0f1b3f", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontWeight: 700, fontSize: ".8rem" }}
              onClick={loadSupportChats}>↻ Actualiser</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 340px) 1fr", gap: 16, minHeight: 480, alignItems: "stretch" }}>
            {/* ── Liste des conversations ── */}
            <div style={{ border: "1.5px solid #e2e8f0", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", background: "#fff" }}>
              <div style={{ padding: "10px 14px", borderBottom: "1.5px solid #e2e8f0", fontSize: ".78rem", fontWeight: 700, color: "#64748b", display: "flex", justifyContent: "space-between" }}>
                <span>{supportChats.length} conversation{supportChats.length > 1 ? "s" : ""}</span>
                {supportChats.some((c) => c.needsReply) && (
                  <span style={{ color: "#dc2626" }}>{supportChats.filter((c) => c.needsReply).length} en attente</span>
                )}
              </div>
              <div style={{ overflowY: "auto", flex: 1, maxHeight: 520 }}>
                {supportLoading && supportChats.length === 0 ? (
                  <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: ".85rem" }}>Chargement…</div>
                ) : supportChats.length === 0 ? (
                  <div style={{ padding: 24, textAlign: "center", color: "#94a3b8" }}>
                    <div style={{ fontSize: "2rem", marginBottom: 8 }}>💬</div>
                    <p style={{ fontSize: ".85rem", fontWeight: 600 }}>Aucune conversation support.</p>
                  </div>
                ) : supportChats.map((c) => {
                  const isActive = supportActive?._id === c._id;
                  const name = c.requester ? `${c.requester.firstName} ${c.requester.lastName}` : "Utilisateur";
                  return (
                    <div key={c._id} onClick={() => openSupportChat(c)}
                      style={{
                        padding: "11px 14px", cursor: "pointer", display: "flex", gap: 10, alignItems: "center",
                        background: isActive ? "#eff6ff" : c.needsReply ? "#fffbeb" : "#fff",
                        borderBottom: "1px solid #f1f5f9",
                      }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                        background: c.type === "partner_support" ? "#fff7ed" : "#f0f6ff",
                        display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: ".85rem",
                        color: c.type === "partner_support" ? "#d97706" : "#3b82f6",
                      }}>
                        {(c.requester?.firstName?.[0] || "?").toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                          <strong style={{ fontSize: ".85rem", color: "#0f1b3f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</strong>
                          <span style={{ fontSize: ".7rem", color: "#94a3b8", flexShrink: 0 }}>{timeAgo(c.lastMessageAt)}</span>
                        </div>
                        <div style={{ fontSize: ".76rem", color: c.needsReply ? "#92400e" : "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: c.needsReply ? 700 : 400 }}>
                          {c.type === "partner_support" ? "🤝 " : ""}{c.lastMessage || "Conversation ouverte"}
                        </div>
                      </div>
                      {c.unread > 0 && (
                        <span style={{ background: "#dc2626", color: "#fff", borderRadius: 99, fontSize: ".68rem", fontWeight: 800, padding: "2px 6px", flexShrink: 0 }}>{c.unread}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Fil de conversation ── */}
            <div style={{ border: "1.5px solid #e2e8f0", borderRadius: 12, display: "flex", flexDirection: "column", background: "#fff", overflow: "hidden" }}>
              {!supportActive ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: "2.4rem" }}>🎧</div>
                  <p style={{ fontSize: ".85rem", fontWeight: 600 }}>Sélectionnez une conversation pour répondre.</p>
                </div>
              ) : (
                <>
                  <div style={{ padding: "12px 16px", borderBottom: "1.5px solid #e2e8f0", fontWeight: 700, color: "#0f1b3f", fontSize: ".9rem" }}>
                    {supportActive.requester ? `${supportActive.requester.firstName} ${supportActive.requester.lastName}` : "Utilisateur"}
                    <span style={{ marginLeft: 8, fontSize: ".72rem", fontWeight: 600, color: "#94a3b8" }}>
                      {supportActive.type === "partner_support" ? "Support Partenaires" : "Service Client"} · {supportActive.requester?.email}
                    </span>
                  </div>
                  <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10, maxHeight: 420 }}>
                    {supportMsgLoading ? (
                      <div style={{ textAlign: "center", color: "#94a3b8", fontSize: ".85rem" }}>Chargement…</div>
                    ) : supportMessages.length === 0 ? (
                      <div style={{ textAlign: "center", color: "#94a3b8", fontSize: ".85rem" }}>Aucun message pour l'instant.</div>
                    ) : supportMessages.map((m) => {
                      const isAdminMsg = m.senderRole === "admin";
                      return (
                        <div key={m._id} style={{ alignSelf: isAdminMsg ? "flex-end" : "flex-start", maxWidth: "72%" }}>
                          <div style={{
                            padding: "8px 12px", borderRadius: 12,
                            background: isAdminMsg ? "#0f1b3f" : "#f1f5f9",
                            color: isAdminMsg ? "#fff" : "#0f1b3f",
                            fontSize: ".85rem", whiteSpace: "pre-wrap", wordBreak: "break-word",
                          }}>
                            {m.content}
                          </div>
                          <div style={{ fontSize: ".68rem", color: "#94a3b8", marginTop: 3, textAlign: isAdminMsg ? "right" : "left" }}>
                            {timeAgo(m.createdAt)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ padding: 12, borderTop: "1.5px solid #e2e8f0", display: "flex", gap: 8 }}>
                    <textarea
                      value={supportReply}
                      onChange={(e) => setSupportReply(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendSupportReply(); } }}
                      placeholder="Votre réponse…"
                      rows={1}
                      style={{ flex: 1, resize: "none", border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "9px 12px", fontSize: ".85rem", fontFamily: "inherit" }}
                    />
                    <button onClick={sendSupportReply} disabled={supportSending || !supportReply.trim()}
                      style={{ background: "#0f1b3f", color: "#fff", border: "none", borderRadius: 10, padding: "0 18px", fontWeight: 700, cursor: "pointer", fontSize: ".85rem" }}>
                      {supportSending ? "…" : "Envoyer"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {activeTab === "reports" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>🚩 Signalements</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Signalements envoyés par les utilisateurs sur des annonces, avis ou profils.</p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <select value={reportFilter} onChange={(e) => setReportFilter(e.target.value)}
                style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".82rem" }}>
                <option value="">Tous</option>
                <option value="en_attente">En attente</option>
                <option value="examine">Examiné</option>
                <option value="classe_sans_suite">Classé sans suite</option>
                <option value="action_prise">Action prise</option>
              </select>
              <button className={styles.btnRefresh} onClick={loadReports}>↻ Actualiser</button>
            </div>
          </div>
          {reportsLoading ? (
            <div className={styles.loadingBox}><div className={styles.spinner} /></div>
          ) : (() => {
            const filtered = reportFilter ? reports.filter((r) => r.status === reportFilter) : reports;
            const STATUS_CFG = {
              en_attente:         { label: "En attente",         color: "#d97706", bg: "#fffbeb" },
              examine:            { label: "Examiné",            color: "#2563eb", bg: "#eff6ff" },
              classe_sans_suite:  { label: "Classé sans suite",  color: "#94a3b8", bg: "#f1f5f9" },
              action_prise:       { label: "Action prise",       color: "#059669", bg: "#ecfdf5" },
            };
            const REASON_LABELS = {
              fraude: "Fraude / arnaque", contenu_inapproprie: "Contenu inapproprié",
              annonce_fausse: "Annonce fausse", contenu_illicite: "Contenu illicite",
              harcelement: "Harcèlement", autre: "Autre",
            };
            return filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
                <div style={{ fontSize: "3rem", marginBottom: 12 }}>🚩</div>
                <p style={{ fontWeight: 600 }}>Aucun signalement pour ce filtre.</p>
              </div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr><th>Cible</th><th>Motif</th><th>Description</th><th>Par</th><th>Statut</th><th>Date</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => {
                      const sc = STATUS_CFG[r.status] || STATUS_CFG.en_attente;
                      return (
                        <tr key={r._id} className={styles.tr}>
                          <td style={{ fontSize: ".82rem" }}>{r.targetType} <span style={{ color: "#94a3b8", fontFamily: "monospace", fontSize: ".72rem" }}>{r.targetId}</span></td>
                          <td style={{ fontSize: ".82rem" }}>{REASON_LABELS[r.reason] || r.reason}</td>
                          <td style={{ fontSize: ".8rem", maxWidth: 240 }}>{r.description || "—"}</td>
                          <td style={{ fontSize: ".82rem" }}>{r.reporter?.firstName} {r.reporter?.lastName}</td>
                          <td><Badge label={sc.label} color={sc.color} bg={sc.bg} /></td>
                          <td className={styles.tdDate}>{fmtDate(r.createdAt)}</td>
                          <td>
                            <div className={styles.actionBtns}>
                              {r.status === "en_attente" && (
                                <>
                                  <button className={styles.btnApprove} style={{ fontSize: ".72rem" }} onClick={() => decideReport(r._id, "action_prise")}>Action prise</button>
                                  <button className={styles.btnGhost} style={{ fontSize: ".72rem" }} onClick={() => decideReport(r._id, "classe_sans_suite")}>Classer sans suite</button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      )}
      {activeTab === "whatsapp" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>💬 Bot WhatsApp partenaires</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Claude répond automatiquement aux prospects/partenaires sur WhatsApp. Conversations transférées à un humain ci-dessous.</p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <select value={waFilter} onChange={(e) => setWaFilter(e.target.value)}
                style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".82rem" }}>
                <option value="escalated">À reprendre</option>
                <option value="bot">Gérées par le bot</option>
                <option value="closed">Clôturées</option>
                <option value="">Toutes</option>
              </select>
              <button className={styles.btnRefresh} onClick={loadWaConversations}>↻ Actualiser</button>
            </div>
          </div>

          {waLoading ? (
            <div className={styles.loadingBox}><div className={styles.spinner} /></div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: waActive ? "320px 1fr" : "1fr", gap: 20, alignItems: "start" }}>
              {/* Liste des conversations */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {waConversations.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
                    <div style={{ fontSize: "3rem", marginBottom: 12 }}>💬</div>
                    <p style={{ fontWeight: 600 }}>Aucune conversation pour ce filtre.</p>
                  </div>
                ) : waConversations.map((c) => (
                  <div key={c._id} onClick={() => openWaConversation(c)}
                    style={{
                      cursor: "pointer", padding: "12px 14px", borderRadius: 10,
                      border: `1.5px solid ${waActive?._id === c._id ? "#0f1b3f" : "#e2e8f0"}`,
                      background: waActive?._id === c._id ? "#f8fafc" : "#fff",
                    }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong style={{ fontSize: ".88rem", color: "#0f1b3f" }}>{c.contactName || c.phone}</strong>
                      <Badge
                        label={{ bot: "🤖 Bot", escalated: "🚩 À reprendre", closed: "Clôturée" }[c.status]}
                        color={c.status === "escalated" ? "#dc2626" : c.status === "bot" ? "#059669" : "#94a3b8"}
                        bg={c.status === "escalated" ? "#fee2e2" : c.status === "bot" ? "#ecfdf5" : "#f1f5f9"}
                      />
                    </div>
                    <p style={{ margin: "4px 0 0", fontSize: ".78rem", color: "#64748b" }}>{c.phone}</p>
                    {c.escalationReason && <p style={{ margin: "2px 0 0", fontSize: ".75rem", color: "#dc2626" }}>{c.escalationReason}</p>}
                    <p style={{ margin: "4px 0 0", fontSize: ".72rem", color: "#94a3b8" }}>{fmtDate(c.lastMessageAt)}</p>
                  </div>
                ))}
              </div>

              {/* Thread + réponse */}
              {waActive && (
                <div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <strong style={{ color: "#0f1b3f" }}>{waActive.contactName || waActive.phone}</strong>
                      <span style={{ marginLeft: 8, fontSize: ".78rem", color: "#64748b" }}>{waActive.phone}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {waActive.status !== "bot" && (
                        <button className={styles.btnGhost} style={{ fontSize: ".76rem" }} onClick={() => waSetStatus(waActive._id, "bot")}>Rendre au bot</button>
                      )}
                      {waActive.status !== "closed" && (
                        <button className={styles.btnGhost} style={{ fontSize: ".76rem" }} onClick={() => waSetStatus(waActive._id, "closed")}>Clôturer</button>
                      )}
                    </div>
                  </div>

                  <div style={{ maxHeight: 420, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: "8px 0" }}>
                    {waActive.messages.map((m, i) => (
                      <div key={i} style={{
                        alignSelf: m.role === "user" ? "flex-start" : "flex-end",
                        maxWidth: "75%", padding: "8px 12px", borderRadius: 10, fontSize: ".85rem",
                        background: m.role === "user" ? "#f1f5f9" : m.role === "admin" ? "#0f1b3f" : "#eff6ff",
                        color: m.role === "admin" ? "#fff" : "#0f172a",
                      }}>
                        {m.role !== "user" && (
                          <div style={{ fontSize: ".68rem", fontWeight: 700, opacity: 0.7, marginBottom: 2 }}>
                            {m.role === "admin" ? "Vous (admin)" : "🤖 Bot"}
                          </div>
                        )}
                        {m.content}
                      </div>
                    ))}
                  </div>

                  {waActive.status !== "closed" && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <input value={waReply} onChange={(e) => setWaReply(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && sendWaReply()}
                        placeholder="Répondre au partenaire..."
                        style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }} />
                      <button className={styles.btnApprove} onClick={sendWaReply} disabled={!waReply.trim()}>Envoyer</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {activeTab === "email_delivery" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>📧 Emails & Livraison</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>
                Suivi réel des envois (Resend) — LOI, Accords, factures, confirmations... Un email "envoyé" n'est confirmé "livré" que via le webhook Resend
                (ou l'ouverture du message) ; "Rejeté/Signalé spam" signifie que le serveur destinataire a explicitement refusé l'email.
              </p>
            </div>
            <button className={styles.btnRefresh} onClick={loadEmailDelivery}>↻ Actualiser</button>
          </div>

          {emailDeliveryLoading ? (
            <div className={styles.loadingBox}><div className={styles.spinner} /></div>
          ) : (
            <>
              <div style={{ background: "#fffbeb", border: "1.5px solid #fcd34d", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: ".82rem", color: "#92400e" }}>
                ⚠️ Si "Rejetés/Signalés spam" reste élevé : vérifiez dans le dashboard Resend (Domains) que <code>vit-auto.com</code> est bien "Verified"
                (SPF/DKIM/DMARC) — un domaine non vérifié fait rejeter une grande partie des emails par Gmail/Outlook. Le webhook Resend doit aussi être
                configuré (Webhooks → email.delivered/bounced/complained/delivery_delayed → <code>RESEND_WEBHOOK_SECRET</code> côté serveur) pour que ce
                tableau reflète la réalité plutôt que de rester bloqué sur "Envoyé".
              </div>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
                <StatCard icon="📤" label="Envoyés (email)" value={emailStats?.email?.totalSent || 0} color="#6366f1" />
                <StatCard icon="✅" label="Livrés/Ouverts" value={emailStats?.email?.totalOpened || 0} sub={`${emailStats?.email?.openRate || 0}% de taux d'ouverture`} color="#10b981" />
                <StatCard icon="🚫" label="Rejetés / Signalés spam" value={(emailStats?.byStatus?.bounced || 0) + (emailStats?.byStatus?.complained || 0)} color="#ef4444" />
                <StatCard icon="⚠️" label="Échecs immédiats" value={emailStats?.byStatus?.failed || 0} color="#f59e0b" />
              </div>

              <h3 style={{ fontSize: ".95rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 10px" }}>Envois en échec récents</h3>
              {emailFailures.length === 0 ? (
                <div style={{ textAlign: "center", padding: "20px 0", color: "#94a3b8" }}>
                  <p style={{ margin: 0 }}>Aucun échec/bounce enregistré récemment.</p>
                </div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Destinataire</th>
                        <th>Type de document</th>
                        <th>Statut</th>
                        <th>Raison</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {emailFailures.map((f) => {
                        const stCfg = {
                          bounced:    { label: "Rejeté",        color: "#ef4444", bg: "#fef2f2" },
                          complained: { label: "Signalé spam",  color: "#dc2626", bg: "#fef2f2" },
                          failed:     { label: "Échec immédiat", color: "#f59e0b", bg: "#fffbeb" },
                        }[f.status] || { label: f.status, color: "#94a3b8", bg: "#f8fafc" };
                        return (
                          <tr key={f._id} className={styles.tr}>
                            <td style={{ fontSize: ".82rem" }}>
                              {f.to}
                              {f.userId && <span className={styles.vehMeta}>{f.userId.firstName} {f.userId.lastName}</span>}
                            </td>
                            <td style={{ fontSize: ".82rem" }}>{f.template || f.subject || "—"}</td>
                            <td><Badge label={stCfg.label} color={stCfg.color} bg={stCfg.bg} /></td>
                            <td style={{ fontSize: ".78rem", color: "#64748b", maxWidth: 320 }}>{f.errorMessage || "—"}</td>
                            <td className={styles.tdDate}>{fmtDate(f.createdAt)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {activeTab === "roles" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>🔑 Rôles & Permissions</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Cliquez une permission pour l'activer/désactiver pour ce compte admin. Aucune permission cochée = accès complet.</p>
            </div>
            <button className={styles.btnRefresh} onClick={loadAdminAccounts}>↻ Actualiser</button>
          </div>
          <RolesSection admins={adminAccounts} loading={rolesLoading} savingId={rolesSavingId} onToggle={toggleAdminScope} currentUserId={user?.id} />
        </div>
      )}
      {/* ══════════════════════════════════════════════════
          TAB AUDIT LOGS
      ══════════════════════════════════════════════════ */}
      {activeTab === "audit" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f1b3f", margin: 0 }}>📜 Journal d'audit</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select value={auditFilter.action} onChange={(e) => setAuditFilter((f) => ({ ...f, action: e.target.value }))} style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 12px", fontSize: ".85rem" }}>
                <option value="">Toutes les actions</option>
                {auditFacets.actions.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <select value={auditFilter.resource} onChange={(e) => setAuditFilter((f) => ({ ...f, resource: e.target.value }))} style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 12px", fontSize: ".85rem" }}>
                <option value="">Toutes les ressources</option>
                {auditFacets.resources.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <select value={auditFilter.success} onChange={(e) => setAuditFilter((f) => ({ ...f, success: e.target.value }))} style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 12px", fontSize: ".85rem" }}>
                <option value="">Tous résultats</option>
                <option value="true">Succès</option>
                <option value="false">Échec</option>
              </select>
              <button className={styles.btnRefresh} onClick={loadAuditLog}>↻ Actualiser</button>
            </div>
          </div>

          {auditLoading ? (
            <p style={{ color: "#64748b" }}>Chargement…</p>
          ) : auditEntries.length === 0 ? (
            <p style={{ color: "#64748b" }}>Aucune entrée trouvée.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Admin</th>
                    <th>Action</th>
                    <th>Ressource</th>
                    <th>Résultat</th>
                  </tr>
                </thead>
                <tbody>
                  {auditEntries.map((e) => (
                    <tr key={e._id} className={styles.tr}>
                      <td style={{ fontSize: ".8rem", whiteSpace: "nowrap" }}>{new Date(e.createdAt).toLocaleString("fr-FR")}</td>
                      <td style={{ fontSize: ".8rem" }}>{e.userEmail || "—"} <span style={{ color: "#94a3b8" }}>({e.userRole})</span></td>
                      <td style={{ fontSize: ".8rem", fontWeight: 600 }}>{e.action}</td>
                      <td style={{ fontSize: ".8rem" }}>{e.resource}{e.resourceId ? ` #${String(e.resourceId).slice(-6)}` : ""}</td>
                      <td>
                        {e.success
                          ? <span style={{ color: "#10b981", fontSize: ".8rem", fontWeight: 700 }}>✅</span>
                          : <span style={{ color: "#ef4444", fontSize: ".8rem", fontWeight: 700 }} title={e.errorMessage || ""}>❌</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

        </div>
      </div>
    </div>
  );
}



// ═══════════════════════════════════════════════════════════════════════════════
// PARTNER VERIFICATION SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

const CRITERIA_CONFIG = [
  { key: "businessLicense",   label: "Licence commerciale vérifiée", icon: "📋", weight: 20, desc: "RCCM, Kbis, Business License ou équivalent" },
  { key: "repIdentified",     label: "Représentant identifié",        icon: "👤", weight: 18, desc: "Identité du représentant légal confirmée" },
  { key: "exportCapacity",    label: "Capacité d'export confirmée",   icon: "🚢", weight: 18, desc: "Volume, pays, ports et modes de transport" },
  { key: "documentsReceived", label: "Documents reçus",               icon: "📁", weight: 15, desc: "Tous les documents demandés ont été fournis" },
  { key: "addressVerified",   label: "Adresse vérifiée",              icon: "📍", weight: 12, desc: "Adresse physique de l'entreprise confirmée" },
  { key: "websiteVerified",   label: "Site web vérifié",              icon: "🌐", weight: 10, desc: "Site web actif et cohérent avec le profil" },
  { key: "verificationDone",  label: "Vérification terminée",         icon: "✅", weight:  7, desc: "Dossier complet, revue finale effectuée" },
];

const TRUST_LEVEL_CONFIG = {
  non_verifie: { label: "Non vérifié", color: "#94a3b8", bg: "#f8fafc" },
  bronze:      { label: "Bronze",      color: "#92400e", bg: "#fef3c7" },
  argent:      { label: "Argent",      color: "#475569", bg: "#f1f5f9" },
  or:          { label: "Or",          color: "#b45309", bg: "#fffbeb" },
  platine:     { label: "Platine",     color: "#6d28d9", bg: "#f5f3ff" },
};

const STATUS_PV_CONFIG = {
  en_cours:    { label: "En cours",       color: "#0284c7", bg: "#e0f2fe" },
  en_attente:  { label: "En attente",     color: "#d97706", bg: "#fef3c7" },
  verifie:     { label: "Vérifié",        color: "#16a34a", bg: "#dcfce7" },
  suspendu:    { label: "Suspendu",       color: "#dc2626", bg: "#fef2f2" },
  rejete:      { label: "Rejeté",         color: "#64748b", bg: "#f8fafc" },
  // Compte partenaire sans aucun dossier de vérification (voir orphanRows,
  // partnerVerificationController.adminList) — distinct de "en_cours" pour ne
  // pas laisser croire qu'un examen est déjà en route.
  not_started: { label: "Sans dossier ⚠️", color: "#dc2626", bg: "#fee2e2" },
};

const COMPANY_TYPES = [
  { value: "importateur",    label: "Importateur" },
  { value: "exportateur",    label: "Exportateur" },
  { value: "import_export",  label: "Import / Export" },
  { value: "transitaire",    label: "Transitaire" },
  { value: "concessionnaire",label: "Concessionnaire" },
  { value: "loueur",         label: "Loueur" },
  { value: "assureur",       label: "Assureur" },
  { value: "banque",         label: "Banque / Finance" },
  { value: "autre",          label: "Autre" },
];

function TrustScoreRing({ score }) {
  const r = 28; const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const level = score >= 95 ? "platine" : score >= 75 ? "or" : score >= 50 ? "argent" : score >= 25 ? "bronze" : "non_verifie";
  const colors = { non_verifie: "#cbd5e1", bronze: "#d97706", argent: "#64748b", or: "#f59e0b", platine: "#8b5cf6" };
  return (
    <div style={{ position: "relative", width: 72, height: 72, flexShrink: 0 }}>
      <svg width={72} height={72} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={36} cy={36} r={r} fill="none" stroke="#e2e8f0" strokeWidth={6} />
        <circle cx={36} cy={36} r={r} fill="none" stroke={colors[level]} strokeWidth={6}
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: "0.95rem", fontWeight: 900, color: colors[level], lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: "0.55rem", color: "#94a3b8", fontWeight: 700 }}>/ 100</span>
      </div>
    </div>
  );
}

function PartnerVerifSection({ token, headers, pvList, pvStats, pvLoading, pvFilter, setPvFilter, pvDetail, setPvDetail, pvCreateModal, setPvCreateModal, pvCreateForm, setPvCreateForm, pvSaving, setPvSaving, pvCriterionLoading, setPvCriterionLoading, users, onOpenTrustOverview, onRefresh, showToast }) {
  const { COUNTRIES_CONFIG } = useCurrency();
  const [detailTab, setDetailTab] = useState("dossier");
  const [editInfoMode, setEditInfoMode] = useState(false);
  const [editInfoForm, setEditInfoForm] = useState({});
  const [statusModal, setStatusModal] = useState(null);
  const [newStatus, setNewStatus] = useState("");
  const [criterionNote, setCriterionNote] = useState({});
  const [criterionDocUrl, setCriterionDocUrl] = useState({});

  const openDetail = async (userId) => {
    try {
      const res = await fetch(`/api/partner-verif/admin/${userId}`, { headers });
      const d = await res.json();
      setPvDetail(d.verification || { userId: d.user, criteria: {} });
      setDetailTab("dossier");
      setEditInfoMode(false);
    } catch { showToast("Erreur chargement dossier", "error"); }
  };

  const handleCreate = async () => {
    if (!pvCreateForm.userId || !pvCreateForm.companyName) { showToast("userId et nom entreprise requis", "error"); return; }
    setPvSaving(true);
    try {
      const res = await fetch("/api/partner-verif/admin", {
        method: "POST", headers,
        body: JSON.stringify(pvCreateForm),
      });
      const d = await res.json();
      if (res.ok) {
        showToast("Dossier créé avec succès");
        setPvCreateModal(false);
        setPvCreateForm({ userId: "", companyName: "", companyType: "importateur", country: "", city: "", website: "", phone: "", email: "", description: "", exportCountries: [], importCountries: [], vehicleCategories: [], yearsExperience: 0, annualVolume: "", adminNote: "" });
        onRefresh();
        openDetail(pvCreateForm.userId);
      } else showToast(d.message || "Erreur création", "error");
    } catch { showToast("Connexion impossible", "error"); }
    setPvSaving(false);
  };

  const handleToggleCriterion = async (criterion, currentVal) => {
    if (!pvDetail) return;
    const userId = pvDetail.userId?._id || pvDetail.userId;
    setPvCriterionLoading(criterion);
    try {
      // note/docUrl ne sont envoyés que si l'admin les a effectivement modifiés dans
      // cette session — sinon, comme le backend applique `valeur ?? existant`,
      // envoyer systématiquement une chaîne vide écraserait silencieusement une
      // note ou un lien déjà enregistrés dès que l'admin clique "Valider" sans
      // avoir retouché ces champs.
      const res = await fetch(`/api/partner-verif/admin/${userId}/criterion`, {
        method: "PATCH", headers,
        body: JSON.stringify({
          criterion,
          verified: !currentVal,
          ...(criterion in criterionNote   ? { note: criterionNote[criterion] } : {}),
          ...(criterion in criterionDocUrl ? { docUrl: criterionDocUrl[criterion] } : {}),
        }),
      });
      const d = await res.json();
      if (res.ok) {
        setPvDetail((prev) => ({ ...prev, criteria: d.verification.criteria, trustScore: d.trustScore, trustLevel: d.trustLevel, status: d.verification.status }));
        onRefresh();
        showToast(!currentVal ? "Critère validé" : "Critère retiré");
      } else showToast(d.message || "Erreur", "error");
    } catch { showToast("Connexion impossible", "error"); }
    setPvCriterionLoading("");
  };

  const handleUpdateInfo = async () => {
    if (!pvDetail) return;
    const userId = pvDetail.userId?._id || pvDetail.userId;
    setPvSaving(true);
    try {
      const res = await fetch(`/api/partner-verif/admin/${userId}/info`, {
        method: "PATCH", headers,
        body: JSON.stringify(editInfoForm),
      });
      const d = await res.json();
      if (res.ok) {
        setPvDetail((prev) => ({ ...prev, ...d.verification }));
        setEditInfoMode(false);
        onRefresh();
        showToast("Informations mises à jour");
      } else showToast(d.message || "Erreur", "error");
    } catch { showToast("Connexion impossible", "error"); }
    setPvSaving(false);
  };

  const handleUpdateStatus = async () => {
    if (!pvDetail || !newStatus || pvSaving) return;
    const userId = pvDetail.userId?._id || pvDetail.userId;
    setPvSaving(true);
    try {
      const res = await fetch(`/api/partner-verif/admin/${userId}/status`, {
        method: "PATCH", headers,
        body: JSON.stringify({ status: newStatus }),
      });
      const d = await res.json();
      if (res.ok) {
        setPvDetail((prev) => ({ ...prev, status: newStatus }));
        setStatusModal(null);
        onRefresh();
        showToast("Statut mis à jour");
      } else showToast(d.message || "Erreur", "error");
    } catch { showToast("Connexion impossible", "error"); }
    setPvSaving(false);
  };

  const handlePvRelance = async () => {
    if (!pvDetail || pvSaving) return;
    const userId = pvDetail.userId?._id || pvDetail.userId;
    setPvSaving(true);
    try {
      const res = await fetch(`/api/partner-verif/admin/${userId}/relance`, { method: "POST", headers });
      const d = await res.json();
      if (res.ok) showToast(`Relance envoyée (${d.missingDocs.join(", ")})`);
      else showToast(d.message || "Erreur", "error");
    } catch { showToast("Connexion impossible", "error"); }
    setPvSaving(false);
  };

  const totalPv = pvStats?.total || 0;
  const verifPv = pvStats?.byStatus?.verifie || 0;
  const avgScore = pvStats?.avgScore || 0;

  return (
    <div className={styles.scrollZone}>
      {/* ── En-tête stats ── */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
        <div className={styles.pvStatCard} style={{ borderLeftColor: "#6d28d9" }}>
          <div className={styles.pvStatVal}>{totalPv}</div>
          <div className={styles.pvStatLbl}>Dossiers total</div>
        </div>
        <div className={styles.pvStatCard} style={{ borderLeftColor: "#16a34a" }}>
          <div className={styles.pvStatVal}>{verifPv}</div>
          <div className={styles.pvStatLbl}>Partenaires vérifiés</div>
        </div>
        <div className={styles.pvStatCard} style={{ borderLeftColor: "#f59e0b" }}>
          <div className={styles.pvStatVal}>{avgScore}</div>
          <div className={styles.pvStatLbl}>Score moyen / 100</div>
        </div>
        {Object.entries(pvStats?.byLevel || {}).map(([lv, cnt]) => (
          <div key={lv} className={styles.pvStatCard} style={{ borderLeftColor: TRUST_LEVEL_CONFIG[lv]?.color || "#94a3b8" }}>
            <div className={styles.pvStatVal}>{cnt}</div>
            <div className={styles.pvStatLbl}>{TRUST_LEVEL_CONFIG[lv]?.label || lv}</div>
          </div>
        ))}
      </div>

      {/* ── Filtres + bouton créer ── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
        <input className={styles.searchInput} placeholder="Rechercher entreprise, email, pays…"
          value={pvFilter.search} onChange={(e) => setPvFilter((f) => ({ ...f, search: e.target.value }))}
          onKeyDown={(e) => e.key === "Enter" && onRefresh()}
          style={{ minWidth: 220, flex: 1 }} />
        <select className={styles.filterSelect} value={pvFilter.status} onChange={(e) => setPvFilter((f) => ({ ...f, status: e.target.value }))}>
          <option value="">Tous statuts</option>
          {Object.entries(STATUS_PV_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className={styles.filterSelect} value={pvFilter.trustLevel} onChange={(e) => setPvFilter((f) => ({ ...f, trustLevel: e.target.value }))}>
          <option value="">Tous niveaux</option>
          {Object.entries(TRUST_LEVEL_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className={styles.filterSelect} value={pvFilter.companyType} onChange={(e) => setPvFilter((f) => ({ ...f, companyType: e.target.value }))}>
          <option value="">Tous types</option>
          {COMPANY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button className={styles.btnPrimary} onClick={onRefresh} disabled={pvLoading}>
          {pvLoading ? "…" : "🔍 Filtrer"}
        </button>
        <button className={styles.btnPrimary} style={{ background: "#6d28d9" }} onClick={() => setPvCreateModal(true)}>
          + Nouveau dossier
        </button>
      </div>

      {/* ── Table partenaires ── */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Entreprise</th>
              <th>Type</th>
              <th>Pays</th>
              <th>Trust Score</th>
              <th>Niveau</th>
              <th>Critères</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pvLoading && (
              <tr><td colSpan={8} style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>Chargement…</td></tr>
            )}
            {!pvLoading && pvList.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: "center", padding: "2.5rem", color: "#94a3b8" }}>
                Aucun dossier. Cliquez sur « + Nouveau dossier » pour commencer.
              </td></tr>
            )}
            {pvList.map((pv) => {
              const verified = CRITERIA_CONFIG.filter((c) => pv.criteria?.[c.key]?.verified).length;
              const sl = STATUS_PV_CONFIG[pv.status] || STATUS_PV_CONFIG.en_cours;
              const tl = TRUST_LEVEL_CONFIG[pv.trustLevel] || TRUST_LEVEL_CONFIG.non_verifie;
              return (
                <tr key={pv._id} style={{ cursor: "pointer" }} onClick={() => openDetail(pv.userId?._id || pv.userId)}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      {pv.logoUrl
                        ? <img src={pv.logoUrl} alt="" loading="lazy" decoding="async" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover" }} />
                        : <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 800, color: "#64748b" }}>{pv.companyName?.[0]?.toUpperCase()}</div>
                      }
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#0f1b3f" }}>{pv.companyName}</div>
                        <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>{pv.email || pv.userId?.email || "—"}</div>
                      </div>
                    </div>
                  </td>
                  <td><span style={{ fontSize: "0.78rem", color: "#475569" }}>{COMPANY_TYPES.find((t) => t.value === pv.companyType)?.label || pv.companyType}</span></td>
                  <td>
                    <span style={{ fontSize: "0.82rem" }}>
                      {pv.country || "—"}
                      {pv.country && (() => {
                        const match = COUNTRIES_CONFIG.find((c) => c.name.toLowerCase() === String(pv.country).toLowerCase());
                        return match ? <span title={match.name} style={{ marginLeft: 6 }}>{match.flag}</span> : null;
                      })()}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: "#e2e8f0", borderRadius: 4, overflow: "hidden", minWidth: 60 }}>
                        <div style={{ height: "100%", width: `${pv.trustScore}%`, background: pv.trustScore >= 75 ? "#16a34a" : pv.trustScore >= 50 ? "#f59e0b" : "#ef4444", borderRadius: 4, transition: "width 0.4s" }} />
                      </div>
                      <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#0f1b3f", minWidth: 28 }}>{pv.trustScore}</span>
                    </div>
                  </td>
                  <td><span className={styles.badge} style={{ color: tl.color, background: tl.bg }}>{tl.label}</span></td>
                  <td>
                    <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                      {CRITERIA_CONFIG.map((c) => (
                        <span key={c.key} title={c.label}
                          style={{ fontSize: "0.85rem", opacity: pv.criteria?.[c.key]?.verified ? 1 : 0.2 }}>
                          {c.icon}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td><span className={styles.badge} style={{ color: sl.color, background: sl.bg }}>{sl.label}</span></td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className={styles.btnSmall} onClick={(e) => { e.stopPropagation(); openDetail(pv.userId?._id || pv.userId); }}>
                        Ouvrir →
                      </button>
                      {/* Vue de confiance unifiée — croise ce partenaire avec KYC/
                          Founding Partner/Certification sans changer d'onglet. */}
                      {onOpenTrustOverview && pv.userId && (
                        <button
                          title="Vue de confiance unifiée"
                          onClick={(e) => { e.stopPropagation(); onOpenTrustOverview(typeof pv.userId === "object" ? pv.userId : { _id: pv.userId }); }}
                          style={{ padding: "4px 10px", borderRadius: 6, border: "1.5px solid #e2e8f0", background: "#f8fafc", color: "#0f1b3f", fontWeight: 700, fontSize: ".78rem", cursor: "pointer" }}>
                          🛡️
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ══ Modal : Nouveau dossier ══ */}
      {pvCreateModal && (
        <div className={styles.overlay} onClick={() => setPvCreateModal(false)}>
          <div className={styles.pvModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.pvModalHeader}>
              <h3 style={{ margin: 0, fontWeight: 900, fontSize: "1rem", color: "#0f1b3f" }}>Nouveau dossier partenaire</h3>
              <button className={styles.btnGhost} onClick={() => setPvCreateModal(false)}>✕</button>
            </div>
            <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 14, maxHeight: "65vh", overflowY: "auto" }}>
              <div className={styles.pvFormRow}>
                <label className={styles.pvLabel}>Compte utilisateur (ID ou email)</label>
                <input className={styles.pvInput} placeholder="ID MongoDB du partenaire"
                  value={pvCreateForm.userId} onChange={(e) => setPvCreateForm((f) => ({ ...f, userId: e.target.value }))} />
                <div style={{ marginTop: 4 }}>
                  <select className={styles.pvInput} onChange={(e) => setPvCreateForm((f) => ({ ...f, userId: e.target.value, companyName: f.companyName || "" }))}>
                    <option value="">— Sélectionner dans la liste —</option>
                    {users.filter((u) => u.role === "partenaire").map((u) => (
                      <option key={u._id} value={u._id}>{u.firstName} {u.lastName} — {u.email}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className={styles.pvFormRow}>
                <label className={styles.pvLabel}>Nom de l'entreprise *</label>
                <input className={styles.pvInput} placeholder="Ex : DAKAR AUTO EXPORT SARL"
                  value={pvCreateForm.companyName} onChange={(e) => setPvCreateForm((f) => ({ ...f, companyName: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className={styles.pvFormRow}>
                  <label className={styles.pvLabel}>Type d'entreprise</label>
                  <select className={styles.pvInput} value={pvCreateForm.companyType} onChange={(e) => setPvCreateForm((f) => ({ ...f, companyType: e.target.value }))}>
                    {COMPANY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className={styles.pvFormRow}>
                  <label className={styles.pvLabel}>Pays</label>
                  <input className={styles.pvInput} placeholder="Côte d'Ivoire"
                    value={pvCreateForm.country} onChange={(e) => setPvCreateForm((f) => ({ ...f, country: e.target.value }))} />
                </div>
                <div className={styles.pvFormRow}>
                  <label className={styles.pvLabel}>Ville</label>
                  <input className={styles.pvInput} placeholder="Abidjan"
                    value={pvCreateForm.city} onChange={(e) => setPvCreateForm((f) => ({ ...f, city: e.target.value }))} />
                </div>
                <div className={styles.pvFormRow}>
                  <label className={styles.pvLabel}>Site web</label>
                  <input className={styles.pvInput} placeholder="https://"
                    value={pvCreateForm.website} onChange={(e) => setPvCreateForm((f) => ({ ...f, website: e.target.value }))} />
                </div>
                <div className={styles.pvFormRow}>
                  <label className={styles.pvLabel}>Email pro</label>
                  <input className={styles.pvInput} placeholder="contact@..."
                    value={pvCreateForm.email} onChange={(e) => setPvCreateForm((f) => ({ ...f, email: e.target.value }))} />
                </div>
                <div className={styles.pvFormRow}>
                  <label className={styles.pvLabel}>Téléphone</label>
                  <input className={styles.pvInput} placeholder="+225..."
                    value={pvCreateForm.phone} onChange={(e) => setPvCreateForm((f) => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
              <div className={styles.pvFormRow}>
                <label className={styles.pvLabel}>Description</label>
                <textarea className={styles.pvInput} rows={2} placeholder="Présentation courte de l'entreprise…"
                  value={pvCreateForm.description} onChange={(e) => setPvCreateForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <div className={styles.pvFormRow}>
                <label className={styles.pvLabel}>Note admin interne</label>
                <textarea className={styles.pvInput} rows={2} placeholder="Notes internes (non visibles par le partenaire)…"
                  value={pvCreateForm.adminNote} onChange={(e) => setPvCreateForm((f) => ({ ...f, adminNote: e.target.value }))} />
              </div>
              <button className={styles.btnPrimary} style={{ marginTop: 4 }} onClick={handleCreate} disabled={pvSaving}>
                {pvSaving ? "Création…" : "Créer le dossier"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Drawer : Détail dossier ══ */}
      {pvDetail && (
        <div className={styles.overlay} onClick={() => setPvDetail(null)}>
          <div className={styles.pvDrawer} onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className={styles.pvDrawerHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <TrustScoreRing score={pvDetail.trustScore || 0} />
                <div>
                  <div style={{ fontWeight: 900, fontSize: "1.05rem", color: "#0f1b3f" }}>{pvDetail.companyName}</div>
                  <div style={{ fontSize: "0.78rem", color: "#64748b" }}>{COMPANY_TYPES.find((t) => t.value === pvDetail.companyType)?.label} · {pvDetail.country || "—"}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                    {(() => { const sl = STATUS_PV_CONFIG[pvDetail.status] || STATUS_PV_CONFIG.en_cours; const tl = TRUST_LEVEL_CONFIG[pvDetail.trustLevel] || TRUST_LEVEL_CONFIG.non_verifie; return (<><span className={styles.badge} style={{ color: sl.color, background: sl.bg }}>{sl.label}</span><span className={styles.badge} style={{ color: tl.color, background: tl.bg }}>⭐ {tl.label}</span></>); })()}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className={styles.btnSmall} onClick={() => { setNewStatus(pvDetail.status); setStatusModal(true); }}>Changer statut</button>
                <button className={styles.btnGhost} onClick={() => setPvDetail(null)}>✕</button>
              </div>
            </div>

            {/* Onglets internes */}
            <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #e2e8f0", padding: "0 20px" }}>
              {[["dossier","📋 Dossier"],["criteres","✅ Critères"],["docs","📁 Documents"],["audit","📜 Audit"]].map(([k, lbl]) => (
                <button key={k} onClick={() => setDetailTab(k)}
                  style={{ padding: "10px 16px", fontSize: "0.82rem", fontWeight: 700, border: "none", cursor: "pointer", background: "none", borderBottom: detailTab === k ? "3px solid #6d28d9" : "3px solid transparent", color: detailTab === k ? "#6d28d9" : "#64748b" }}>
                  {lbl}
                </button>
              ))}
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 24px" }}>

              {/* ── Onglet Dossier ── */}
              {detailTab === "dossier" && (
                <div>
                  {!editInfoMode ? (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px", marginBottom: 16 }}>
                        {[
                          ["Nom entreprise", pvDetail.companyName],
                          ["Type", COMPANY_TYPES.find((t) => t.value === pvDetail.companyType)?.label],
                          ["Pays", pvDetail.country],
                          ["Ville", pvDetail.city],
                          ["Site web", pvDetail.website ? <a href={safeHref(pvDetail.website)} target="_blank" rel="noreferrer noopener" style={{ color: "#6d28d9" }}>{pvDetail.website}</a> : "—"],
                          ["Email pro", pvDetail.email],
                          ["Téléphone", pvDetail.phone],
                          ["Exp. (années)", pvDetail.yearsExperience],
                          ["Volume annuel", pvDetail.annualVolume],
                          ["Partenaire (User)", `${pvDetail.userId?.firstName || ""} ${pvDetail.userId?.lastName || ""} — ${pvDetail.userId?.email || ""}`],
                        ].map(([k, v]) => (
                          <div key={k}>
                            <div style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{k}</div>
                            <div style={{ fontSize: "0.88rem", color: "#0f1b3f", fontWeight: 600, marginTop: 2 }}>{v || "—"}</div>
                          </div>
                        ))}
                      </div>
                      {pvDetail.description && <div style={{ fontSize: "0.85rem", color: "#475569", marginBottom: 12, padding: "10px 14px", background: "#f8fafc", borderRadius: 8 }}>{pvDetail.description}</div>}
                      {pvDetail.exportCountries?.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Pays d'export</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {pvDetail.exportCountries.map((c) => <span key={c} style={{ background: "#ede9fe", color: "#6d28d9", padding: "2px 10px", borderRadius: 12, fontSize: "0.78rem", fontWeight: 600 }}>{c}</span>)}
                          </div>
                        </div>
                      )}
                      {pvDetail.adminNote && (
                        <div style={{ padding: "10px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: "0.85rem", color: "#92400e", marginBottom: 10 }}>
                          <strong>Note admin :</strong> {pvDetail.adminNote}
                        </div>
                      )}
                      <button className={styles.btnSmall} onClick={() => { setEditInfoMode(true); setEditInfoForm({ companyName: pvDetail.companyName, companyType: pvDetail.companyType, country: pvDetail.country, city: pvDetail.city, website: pvDetail.website, phone: pvDetail.phone, email: pvDetail.email, description: pvDetail.description, yearsExperience: pvDetail.yearsExperience, annualVolume: pvDetail.annualVolume, adminNote: pvDetail.adminNote, internalRating: pvDetail.internalRating, exportCountries: pvDetail.exportCountries?.join(", ") || "" }); }}>
                        Modifier les infos
                      </button>
                    </>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div><label className={styles.pvLabel}>Nom entreprise</label><input className={styles.pvInput} value={editInfoForm.companyName || ""} onChange={(e) => setEditInfoForm((f) => ({ ...f, companyName: e.target.value }))} /></div>
                        <div><label className={styles.pvLabel}>Type</label>
                          <select className={styles.pvInput} value={editInfoForm.companyType || ""} onChange={(e) => setEditInfoForm((f) => ({ ...f, companyType: e.target.value }))}>
                            {COMPANY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                        </div>
                        <div><label className={styles.pvLabel}>Pays</label><input className={styles.pvInput} value={editInfoForm.country || ""} onChange={(e) => setEditInfoForm((f) => ({ ...f, country: e.target.value }))} /></div>
                        <div><label className={styles.pvLabel}>Ville</label><input className={styles.pvInput} value={editInfoForm.city || ""} onChange={(e) => setEditInfoForm((f) => ({ ...f, city: e.target.value }))} /></div>
                        <div><label className={styles.pvLabel}>Site web</label><input className={styles.pvInput} value={editInfoForm.website || ""} onChange={(e) => setEditInfoForm((f) => ({ ...f, website: e.target.value }))} /></div>
                        <div><label className={styles.pvLabel}>Email pro</label><input className={styles.pvInput} value={editInfoForm.email || ""} onChange={(e) => setEditInfoForm((f) => ({ ...f, email: e.target.value }))} /></div>
                        <div><label className={styles.pvLabel}>Téléphone</label><input className={styles.pvInput} value={editInfoForm.phone || ""} onChange={(e) => setEditInfoForm((f) => ({ ...f, phone: e.target.value }))} /></div>
                        <div><label className={styles.pvLabel}>Exp. (années)</label><input className={styles.pvInput} type="number" value={editInfoForm.yearsExperience || 0} onChange={(e) => setEditInfoForm((f) => ({ ...f, yearsExperience: Number(e.target.value) }))} /></div>
                      </div>
                      <div><label className={styles.pvLabel}>Volume annuel</label><input className={styles.pvInput} value={editInfoForm.annualVolume || ""} onChange={(e) => setEditInfoForm((f) => ({ ...f, annualVolume: e.target.value }))} /></div>
                      <div><label className={styles.pvLabel}>Pays d'export (séparés par virgule)</label><input className={styles.pvInput} value={editInfoForm.exportCountries || ""} onChange={(e) => setEditInfoForm((f) => ({ ...f, exportCountries: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) }))} /></div>
                      <div><label className={styles.pvLabel}>Description</label><textarea className={styles.pvInput} rows={2} value={editInfoForm.description || ""} onChange={(e) => setEditInfoForm((f) => ({ ...f, description: e.target.value }))} /></div>
                      <div><label className={styles.pvLabel}>Note admin</label><textarea className={styles.pvInput} rows={2} value={editInfoForm.adminNote || ""} onChange={(e) => setEditInfoForm((f) => ({ ...f, adminNote: e.target.value }))} /></div>
                      <div style={{ display: "flex", gap: 10 }}>
                        <button className={styles.btnPrimary} onClick={handleUpdateInfo} disabled={pvSaving}>{pvSaving ? "Sauvegarde…" : "Enregistrer"}</button>
                        <button className={styles.btnGhost} onClick={() => setEditInfoMode(false)}>Annuler</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Onglet Critères ── */}
              {detailTab === "criteres" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* Jauge globale */}
                  <div style={{ background: "linear-gradient(135deg, #0f1b3f, #1e3a8a)", borderRadius: 14, padding: "18px 20px", display: "flex", alignItems: "center", gap: 20, marginBottom: 8 }}>
                    <TrustScoreRing score={pvDetail.trustScore || 0} />
                    <div>
                      <div style={{ color: "#fff", fontWeight: 900, fontSize: "1rem" }}>Trust Score Global</div>
                      <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.8rem" }}>
                        {CRITERIA_CONFIG.filter((c) => pvDetail.criteria?.[c.key]?.verified).length} / {CRITERIA_CONFIG.length} critères validés
                      </div>
                      <div style={{ color: "rgba(255,255,255,0.9)", fontSize: "0.82rem", marginTop: 4 }}>
                        Niveau : <strong>{TRUST_LEVEL_CONFIG[pvDetail.trustLevel]?.label || "Non vérifié"}</strong>
                      </div>
                    </div>
                  </div>

                  {CRITERIA_CONFIG.map((c) => {
                    const isVerified = pvDetail.criteria?.[c.key]?.verified || false;
                    const verif = pvDetail.criteria?.[c.key];
                    const isLoading = pvCriterionLoading === c.key;
                    return (
                      <div key={c.key} className={styles.pvCriterionCard} style={{ borderLeft: `4px solid ${isVerified ? "#16a34a" : "#e2e8f0"}` }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                          <div style={{ fontSize: "1.5rem", lineHeight: 1, marginTop: 2 }}>{c.icon}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                              <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "#0f1b3f" }}>{c.label}</span>
                              <span style={{ fontSize: "0.72rem", color: "#6d28d9", fontWeight: 700, background: "#ede9fe", padding: "1px 8px", borderRadius: 12 }}>+{c.weight} pts</span>
                              {isVerified && verif?.verifiedAt && (
                                <span style={{ fontSize: "0.72rem", color: "#16a34a" }}>Validé le {new Date(verif.verifiedAt).toLocaleDateString("fr-FR")}</span>
                              )}
                            </div>
                            <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: 2 }}>{c.desc}</div>
                            {verif?.note && <div style={{ fontSize: "0.8rem", color: "#475569", marginTop: 4, fontStyle: "italic" }}>"{verif.note}"</div>}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                            <button
                              onClick={() => handleToggleCriterion(c.key, isVerified)}
                              disabled={isLoading}
                              className={isVerified ? styles.btnDanger : styles.btnPrimary}
                              style={{ fontSize: "0.78rem", padding: "5px 14px", minWidth: 100 }}>
                              {isLoading ? "…" : isVerified ? "✕ Retirer" : "✓ Valider"}
                            </button>
                          </div>
                        </div>
                        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                          <input className={styles.pvInput} placeholder="Note (optionnel)…"
                            style={{ flex: 1, fontSize: "0.78rem", padding: "4px 10px" }}
                            value={criterionNote[c.key] ?? verif?.note ?? ""}
                            onChange={(e) => setCriterionNote((n) => ({ ...n, [c.key]: e.target.value }))} />
                        </div>
                        {/* Lien vers la pièce justificative de ce critère (criteria.<clé>.docUrl côté
                            modèle) — géré par le backend depuis l'origine (adminToggleCriterion) mais
                            jamais exposé ici : l'admin ne pouvait ni le voir, ni le renseigner. */}
                        <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
                          <input className={styles.pvInput} placeholder="Lien du justificatif (optionnel)…"
                            style={{ flex: 1, fontSize: "0.78rem", padding: "4px 10px" }}
                            value={criterionDocUrl[c.key] ?? verif?.docUrl ?? ""}
                            onChange={(e) => setCriterionDocUrl((n) => ({ ...n, [c.key]: e.target.value }))} />
                          {verif?.docUrl && (
                            <a href={safeImgHref(verif.docUrl) !== "#" ? safeImgHref(verif.docUrl) : safeHref(verif.docUrl)}
                              target="_blank" rel="noreferrer noopener"
                              style={{ fontSize: "0.78rem", color: "#6d28d9", textDecoration: "underline", whiteSpace: "nowrap" }}>
                              Voir →
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Onglet Documents ── */}
              {detailTab === "docs" && (
                <div>
                  {(() => {
                    const requiredKeys = ["businessLicenseDoc", "rccmDoc", "taxIdDoc", "repIdDoc"];
                    const missingCount = requiredKeys.filter((k) => !pvDetail.documents?.[k]).length;
                    if (!missingCount || pvDetail.status === "verifie") return null;
                    return (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
                        <span style={{ fontSize: "0.82rem", color: "#92400e" }}>⚠️ {missingCount} document(s) manquant(s) — le partenaire n'a pas été relancé automatiquement depuis plus de 7 jours au maximum.</span>
                        <button className={styles.btnPrimary} style={{ whiteSpace: "nowrap", flexShrink: 0 }} onClick={handlePvRelance} disabled={pvSaving}>
                          {pvSaving ? "…" : "🔔 Relancer"}
                        </button>
                      </div>
                    );
                  })()}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {[
                      ["Licence commerciale", "businessLicenseDoc"],
                      ["RCCM",               "rccmDoc"],
                      ["NIF / Taxe",         "taxIdDoc"],
                      ["Relevé bancaire",    "bankStatementDoc"],
                      ["Pièce d'identité rep.", "repIdDoc"],
                      ["Autre document",     "otherDoc"],
                    ].map(([label, key]) => (
                      <div key={key} style={{ border: "1px dashed #e2e8f0", borderRadius: 10, padding: "14px", display: "flex", flexDirection: "column", gap: 8, background: "#fafbfc" }}>
                        <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700 }}>{label}</div>
                        {pvDetail.documents?.[key] ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <img src={pvDetail.documents[key]} alt={label} loading="lazy" decoding="async" style={{ width: "100%", maxHeight: 100, objectFit: "cover", borderRadius: 6, border: "1px solid #e2e8f0" }} onError={(e) => { e.target.style.display = "none"; }} />
                            {/* safeHref (pas safeImgHref) laissait ce lien toujours pointer vers "#" pour un
                                document stocké en base64 (data:image/...) — l'aperçu s'affichait mais le
                                clic "Voir le document" ne faisait jamais rien, contrairement à tous les
                                autres blocs documents du fichier (KYC, Certification, Founding Partner). */}
                            <a href={safeImgHref(pvDetail.documents[key])} target="_blank" rel="noreferrer noopener"
                              style={{ fontSize: "0.78rem", color: "#6d28d9", textDecoration: "underline" }}>Voir le document</a>
                          </div>
                        ) : (
                          <div style={{ color: "#cbd5e1", fontSize: "0.8rem", textAlign: "center", padding: "10px 0" }}>Aucun document</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Onglet Audit ── */}
              {detailTab === "audit" && (
                <div>
                  {(!pvDetail.auditLog || pvDetail.auditLog.length === 0) && (
                    <div style={{ textAlign: "center", color: "#94a3b8", padding: "2rem" }}>Aucune entrée d'audit</div>
                  )}
                  {pvDetail.auditLog?.slice().reverse().map((log, i) => (
                    <div key={i} style={{ display: "flex", gap: 12, paddingBottom: 12, borderBottom: "1px solid #f1f5f9", marginBottom: 12 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#6d28d9", marginTop: 6, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#0f1b3f" }}>{log.action}</span>
                          <span style={{ fontSize: "0.72rem", color: "#94a3b8" }}>{new Date(log.timestamp).toLocaleString("fr-FR")}</span>
                        </div>
                        {log.criterion && <div style={{ fontSize: "0.75rem", color: "#6d28d9", marginTop: 1 }}>Critère : {log.criterion}</div>}
                        {log.note && <div style={{ fontSize: "0.78rem", color: "#475569", marginTop: 2 }}>{log.note}</div>}
                        {log.performedBy && <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: 1 }}>Par : {log.performedBy?.firstName} {log.performedBy?.lastName}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal : Changer statut ══ */}
      {statusModal && pvDetail && (
        <div className={styles.overlay} onClick={() => setStatusModal(null)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            <p className={styles.confirmMsg} style={{ marginBottom: 14 }}>Changer le statut du dossier <strong>{pvDetail.companyName}</strong></p>
            <select className={styles.pvInput} style={{ marginBottom: 16 }} value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
              {Object.entries(STATUS_PV_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <div className={styles.confirmActions}>
              <button className={styles.btnPrimary} onClick={handleUpdateStatus} disabled={pvSaving}>{pvSaving ? "…" : "Confirmer"}</button>
              <button className={styles.btnGhost} onClick={() => setStatusModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CATALOGUE SECTION — Annonces & Validations (combiné)
// ═══════════════════════════════════════════════════════════════════════════════
function CatalogueSection({ vehicles, drivers, bookings, vehiclesTotal, loadMoreVehicles, headers, token, onRefresh, showToast, setConfirm, rejectModal, setRejectModal, rejectReason, setRejectReason, driverRejectModal, setDriverRejectModal, driverRejectReason, setDriverRejectReason, updateVehicleStatus, deleteVehicle, updateDriverStatusInPlace }) {
  const { COUNTRIES_CONFIG, fmtUSD, fmtPinned, CURRENCIES, rateFromUSD } = useCurrency();
  const [subTab,         setSubTab]         = useState("pending");
  const [vehSearch,      setVehSearch]      = useState("");
  const [vehPage,        setVehPage]        = useState(1);
  // Filtres pays/ville/type — purement côté client (comme vehSearch), le
  // backend GET /api/vehicles supporte déjà country/ville/type mais l'admin
  // charge tout le lot (vehiclesLimit) et filtrait jusqu'ici seulement par
  // statut/texte, rendant la gestion difficile sur un volume important.
  const [vehCountryFilter, setVehCountryFilter] = useState("");
  const [vehVilleFilter,   setVehVilleFilter]   = useState("");
  const [vehTypeFilter,    setVehTypeFilter]    = useState("");
  // Filtres onglet Chauffeurs — `drivers` contient désormais tous les statuts
  // (voir loadAll, /api/drivers/pending?status=all) et non plus seulement
  // "pending" comme avant ; ce sous-filtre de statut remplace la restriction
  // qui était jusqu'ici imposée côté serveur.
  const [driverStatusFilter,  setDriverStatusFilter]  = useState("pending");
  const [driverSearch,        setDriverSearch]        = useState("");
  const [driverCountryFilter, setDriverCountryFilter] = useState("");
  const [driverVilleFilter,   setDriverVilleFilter]   = useState("");
  const [previewVehicle, setPreviewVehicle] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewImgIdx,  setPreviewImgIdx]  = useState(0);
  const [editVehicle,  setEditVehicle]  = useState(null); // véhicule brut en édition admin
  const [editForm,     setEditForm]     = useState(null);
  const [editPhotos,   setEditPhotos]   = useState([]);
  // Devise de saisie du prix à l'édition — même principe que VendorSubmit.jsx/
  // VendorDashboard.jsx (partenaire) : l'admin pouvait jusqu'ici seulement
  // modifier un prix déjà supposé en USD, sans jamais pouvoir raisonner dans
  // la devise locale du partenaire (bug/lacune réelle trouvée en audit).
  const [editPriceCurrency,    setEditPriceCurrency]    = useState("USD");
  const [editPriceEntryPerDay, setEditPriceEntryPerDay] = useState("");
  const [editPriceEntryForSale, setEditPriceEntryForSale] = useState("");
  // Bug réel corrigé (audit) : la caution était étiquetée "USD" ici aussi mais
  // n'avait aucune conversion (même bug que VendorSubmit.jsx/VendorDashboard.jsx).
  const [editCautionEntry, setEditCautionEntry] = useState("");
  const [editLoading,  setEditLoading]  = useState(false);
  const [editSaving,   setEditSaving]   = useState(false);
  const [exportMode, setExportMode] = useState(false);
  const [exportForm, setExportForm] = useState({ price: "", currency: "XOF", availableIn: [], sourceCity: "" });
  const [exportAvailText, setExportAvailText] = useState("");
  const [exportSaving, setExportSaving] = useState(false);
  const [thumbBackfilling, setThumbBackfilling] = useState(false);
  const [descBackfilling, setDescBackfilling] = useState(false);
  const PAGE = 12;

  // Suppression par sélection (annonces véhicules ET profils chauffeur) —
  // vidé au changement de sous-onglet/page pour ne jamais supprimer une
  // annonce hors du filtre actuellement affiché à l'écran.
  const [selectedVehicleIds, setSelectedVehicleIds] = useState(new Set());
  const [selectedDriverIds,  setSelectedDriverIds]  = useState(new Set());
  const [bulkDeleting,       setBulkDeleting]        = useState(false);
  // Garde anti-double-clic sur Valider/Refuser chauffeur — ce bouton n'a pas de
  // modale de confirmation intermédiaire (contrairement à l'approbation véhicule,
  // gated par setConfirm) donc rien n'empêchait un double clic pendant le fetch
  // (~0,3-0,9s) avant ce correctif (constat d'audit fluidité).
  const [busyDriverIds, setBusyDriverIds] = useState(new Set());

  const toggleVehicleSelect = (id) => setSelectedVehicleIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleDriverSelect = (id) => setSelectedDriverIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleBulkDeleteVehicles = async () => {
    if (selectedVehicleIds.size === 0) return;
    if (!confirm(`Supprimer définitivement ${selectedVehicleIds.size} annonce(s) sélectionnée(s) ?`)) return;
    setBulkDeleting(true);
    try {
      const r = await fetch("/api/vehicles/bulk-delete", {
        method: "POST", headers, body: JSON.stringify({ ids: [...selectedVehicleIds] }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { showToast(d.message || "Annonces supprimées."); setSelectedVehicleIds(new Set()); onRefresh(); }
      else showToast(d.message || "Erreur lors de la suppression.", "error");
    } catch { showToast("Erreur réseau.", "error"); }
    setBulkDeleting(false);
  };

  const handleBulkDeleteDrivers = async () => {
    if (selectedDriverIds.size === 0) return;
    if (!confirm(`Supprimer définitivement ${selectedDriverIds.size} profil(s) sélectionné(s) ?`)) return;
    setBulkDeleting(true);
    try {
      const r = await fetch("/api/drivers/bulk-delete", {
        method: "POST", headers, body: JSON.stringify({ ids: [...selectedDriverIds] }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { showToast(d.message || "Profils supprimés."); setSelectedDriverIds(new Set()); onRefresh(); }
      else showToast(d.message || "Erreur lors de la suppression.", "error");
    } catch { showToast("Erreur réseau.", "error"); }
    setBulkDeleting(false);
  };

  // ── Transfert d'annonce (véhicule ou chauffeur) vers un autre compte/
  // entreprise/ville/pays — outil de support admin (owner immuable jusqu'ici
  // via l'édition normale, voir vehicleController.transferVehicle/driverController
  // .transferDriver). Un seul modal partagé, discriminé par transferModal.type.
  const [transferModal,  setTransferModal]  = useState(null); // { type: "vehicle"|"driver", id, label }
  const [transferForm,   setTransferForm]   = useState({ ownerQuery: "", ownerResults: [], selectedOwner: null, country: "", ville: "", businessId: "" });
  const [transferSaving, setTransferSaving] = useState(false);

  // Supervision des propositions d'embauche CDD/CDI — la décision accepter/
  // refuser reste au partenaire propriétaire du chauffeur (voir
  // driverEmploymentController.respondToEmploymentRequest), mais l'admin peut
  // ensuite "traiter" une demande acceptée : personnaliser les clauses du
  // contrat généré puis le transmettre automatiquement au partenaire.
  const [employmentAdminList, setEmploymentAdminList] = useState([]);
  const [employmentAdminLoading, setEmploymentAdminLoading] = useState(false);
  const [processModal, setProcessModal] = useState(null); // { id, driverName }
  const [processConditions, setProcessConditions] = useState("");
  const [processSaving, setProcessSaving] = useState(false);

  const loadEmploymentAdminList = useCallback(() => {
    if (!token) return;
    setEmploymentAdminLoading(true);
    fetch("/api/driver-employment/admin/list?limit=50", { headers })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setEmploymentAdminList(d.requests || []); })
      .catch(() => {})
      .finally(() => setEmploymentAdminLoading(false));
  }, [token, headers]);

  useEffect(() => {
    if (subTab !== "drivers" || !token) return;
    loadEmploymentAdminList();
  }, [subTab, token, headers]);

  const openTransfer = (type, id, label, currentCountry, currentVille) => {
    setTransferModal({ type, id, label });
    setTransferForm({ ownerQuery: "", ownerResults: [], selectedOwner: null, country: currentCountry || "", ville: currentVille || "", businessId: "" });
  };

  const searchTransferOwners = async (query) => {
    setTransferForm((p) => ({ ...p, ownerQuery: query }));
    if (query.trim().length < 2) { setTransferForm((p) => ({ ...p, ownerResults: [] })); return; }
    try {
      const r = await fetch(`/api/users?search=${encodeURIComponent(query.trim())}&role=partenaire&limit=6`, { headers });
      if (r.ok) { const d = await r.json(); setTransferForm((p) => ({ ...p, ownerResults: d.users || [] })); }
    } catch { /* ignore — recherche non bloquante */ }
  };

  const submitTransfer = async () => {
    if (!transferModal) return;
    const { selectedOwner, country, ville, businessId } = transferForm;
    const body = {};
    if (selectedOwner) body.ownerId = selectedOwner._id;
    if (country) body.country = country;
    if (ville.trim()) body.ville = ville.trim();
    if (businessId.trim()) body.businessId = businessId.trim();
    if (Object.keys(body).length === 0) { showToast("Choisissez au moins un changement à appliquer.", "error"); return; }

    setTransferSaving(true);
    try {
      const url = transferModal.type === "vehicle" ? `/api/vehicles/${transferModal.id}/transfer` : `/api/drivers/${transferModal.id}/transfer`;
      const r = await fetch(url, { method: "PATCH", headers, body: JSON.stringify(body) });
      const d = await r.json().catch(() => null);
      if (r.ok) {
        showToast("✅ Annonce transférée.");
        setTransferModal(null);
        onRefresh();
      } else showToast(d?.message || "Erreur lors du transfert.", "error");
    } catch { showToast("Erreur réseau.", "error"); }
    setTransferSaving(false);
  };

  const openProcessModal = (reqm) => {
    setProcessModal({ id: reqm._id, driverName: `${reqm.driver?.firstName || ""} ${reqm.driver?.lastName || ""}`.trim() });
    setProcessConditions(reqm.contractConditions || "");
  };

  const submitProcessRequest = async () => {
    if (!processModal) return;
    setProcessSaving(true);
    try {
      const r = await fetch(`/api/driver-employment/${processModal.id}/process`, {
        method: "PATCH", headers,
        body: JSON.stringify({ contractConditions: processConditions }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) {
        showToast("✅ Contrat généré et envoyé au partenaire.");
        setProcessModal(null);
        loadEmploymentAdminList();
      } else showToast(d?.message || "Erreur lors du traitement.", "error");
    } catch { showToast("Erreur réseau.", "error"); }
    setProcessSaving(false);
  };

  // ── Édition complète d'une annonce véhicule (admin) — même principe que
  // VendorDashboard.handleOpenEdit côté partenaire : getMyVehicles/getVehicles
  // (listes) ne renvoient qu'une image par véhicule (voir limitVehicleImages),
  // il faut recharger le véhicule en entier (getVehicleById, jamais tronqué).
  const compressImageAdmin = (dataUrl, maxDim, quality) =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  const readFileAdmin = (file) =>
    new Promise((resolve) => {
      if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) return resolve(null);
      const reader = new FileReader();
      reader.onload = async (e) => resolve(await compressImageAdmin(e.target.result, 1600, 0.78));
      reader.readAsDataURL(file);
    });
  const addEditPhotosAdmin = async (files) => {
    const remaining = 6 - editPhotos.length;
    if (remaining <= 0) return;
    const results = await Promise.all(Array.from(files).slice(0, remaining).map(readFileAdmin));
    const valid = results.filter(Boolean).map((preview) => ({ id: `${Date.now()}-${Math.random()}`, preview }));
    setEditPhotos((prev) => [...prev, ...valid]);
  };
  const removeEditPhotoAdmin = (id) => setEditPhotos((prev) => prev.filter((p) => p.id !== id));

  const openEditVehicle = async (vid) => {
    setEditLoading(true);
    setEditVehicle({ _id: vid });
    setExportMode(false);
    setExportForm({ price: "", currency: "XOF", availableIn: [], sourceCity: "" });
    try {
      const r = await fetch(`/api/vehicles/${vid}`, { headers });
      const d = await r.json();
      if (!r.ok) throw new Error();
      const v = d.vehicle;
      setEditVehicle(v);
      // Si un montant exact a déjà été saisi (voir Vehicle.js pricePerDayEntered/
      // cautionEntered), le réafficher tel quel avec sa devise d'origine plutôt
      // que de retomber sur le prix USD stocké (arrondi) affiché comme si
      // c'était de l'USD (même correctif que VendorDashboard.jsx).
      setEditPriceCurrency(v.priceEntryCurrency || "USD");
      setEditPriceEntryPerDay(
        v.pricePerDayEntered != null ? String(v.pricePerDayEntered) : (v.pricePerDay ? String(v.pricePerDay) : "")
      );
      setEditPriceEntryForSale(
        v.priceForSaleEntered != null ? String(v.priceForSaleEntered) : (v.priceForSale ? String(v.priceForSale) : "")
      );
      setEditCautionEntry(
        v.cautionEntered != null ? String(v.cautionEntered) : (v.caution ? String(v.caution) : "")
      );
      setEditForm({
        type: v.type || "location",
        title: v.title || "", marque: v.marque || "", modele: v.modele || "",
        annee: v.annee || new Date().getFullYear(), etat: v.etat || "Bon état",
        vehicleType: v.vehicleType || "SUV", couleur: v.couleur || "",
        carburant: v.carburant || "Essence", transmission: v.transmission || "Automatique",
        nombrePlaces: v.nombrePlaces || 5, nombrePortes: v.nombrePortes || 5,
        kilometrage: v.kilometrage || "", climatisation: !!v.climatisation,
        rentalDurationType: v.rentalDurationType || "les_deux",
        pricePerDay: v.pricePerDay || "", priceForSale: v.priceForSale || "",
        caution: v.caution || "", country: v.country || "",
        ville: v.ville || "", adresse: v.adresse || "", description: v.description || "",
        contactNom: v.contactNom || "", contactTel: v.contactTel || "",
        currency: v.currency || "", // "" = automatique (devise du visiteur)
        ageMin: v.ageMin || "", permisRequis: v.permisRequis !== false,
        assuranceOptionnelle: !!v.assuranceOptionnelle, withDriver: !!v.withDriver,
        available: v.available !== false,
      });
      setEditPhotos((v.images || []).map((preview, i) => ({ id: `existing-${i}`, preview })));
    } catch { showToast("Impossible de charger l'annonce", "error"); setEditVehicle(null); }
    setEditLoading(false);
  };

  // Même logique que VendorDashboard.jsx/VendorSubmit.jsx (partenaire) : le
  // champ affiché reste dans la devise choisie, editForm.pricePerDay/
  // priceForSale reçoit toujours la valeur CONVERTIE en USD (jamais la valeur
  // brute tapée) — c'est ce dernier qui part au serveur, le schéma Vehicle
  // n'ayant qu'un seul champ de prix, toujours en USD.
  const handleEditPriceEntryChange = (field, raw) => {
    if (field === "pricePerDay") setEditPriceEntryPerDay(raw);
    else if (field === "priceForSale") setEditPriceEntryForSale(raw);
    else setEditCautionEntry(raw);
    if (raw === "" || isNaN(Number(raw))) { setEditForm((p) => ({ ...p, [field]: "" })); return; }
    const num = Number(raw);
    const usd = editPriceCurrency === "USD" ? num : Math.round((num / rateFromUSD(editPriceCurrency)) * 100) / 100;
    setEditForm((p) => ({ ...p, [field]: usd }));
  };

  const handleEditPriceCurrencyChange = (code) => {
    setEditPriceCurrency(code);
    if (editPriceEntryPerDay !== "" && !isNaN(Number(editPriceEntryPerDay))) {
      const num = Number(editPriceEntryPerDay);
      setEditForm((p) => ({ ...p, pricePerDay: code === "USD" ? num : Math.round((num / rateFromUSD(code)) * 100) / 100 }));
    }
    if (editPriceEntryForSale !== "" && !isNaN(Number(editPriceEntryForSale))) {
      const num = Number(editPriceEntryForSale);
      setEditForm((p) => ({ ...p, priceForSale: code === "USD" ? num : Math.round((num / rateFromUSD(code)) * 100) / 100 }));
    }
    if (editCautionEntry !== "" && !isNaN(Number(editCautionEntry))) {
      const num = Number(editCautionEntry);
      setEditForm((p) => ({ ...p, caution: code === "USD" ? num : Math.round((num / rateFromUSD(code)) * 100) / 100 }));
    }
  };

  const handleSaveEditVehicle = async () => {
    if (!editVehicle || !editForm) return;
    if (editPhotos.length === 0) { showToast("Ajoutez au moins une photo", "error"); return; }
    setEditSaving(true);
    try {
      const images = editPhotos.map((p) => p.preview);
      const patch = {
        type: editForm.type, title: editForm.title, marque: editForm.marque, modele: editForm.modele,
        annee: Number(editForm.annee) || undefined, etat: editForm.etat, vehicleType: editForm.vehicleType,
        couleur: editForm.couleur, carburant: editForm.carburant, transmission: editForm.transmission,
        nombrePlaces: Number(editForm.nombrePlaces) || undefined, nombrePortes: Number(editForm.nombrePortes) || undefined,
        kilometrage: Number(editForm.kilometrage) || 0, climatisation: editForm.climatisation,
        rentalDurationType: editForm.rentalDurationType, caution: Number(editForm.caution) || 0,
        description: editForm.description, country: editForm.country || null,
        ville: editForm.ville, adresse: editForm.adresse, ageMin: Number(editForm.ageMin) || 0,
        contactNom: editForm.contactNom, contactTel: editForm.contactTel,
        currency: editForm.currency || null,
        permisRequis: editForm.permisRequis, assuranceOptionnelle: editForm.assuranceOptionnelle,
        withDriver: editForm.withDriver, available: editForm.available, images,
      };
      // Montant exact tel que tapé (évite la perte de précision de l'aller-
      // retour de conversion via l'USD stocké — voir Vehicle.js
      // pricePerDayEntered/cautionEntered ; même correctif que
      // VendorDashboard.jsx, manquant ici jusqu'ici — bug réel trouvé en audit).
      if (editForm.type === "vente") {
        patch.priceForSale = Number(editForm.priceForSale) || 0;
        patch.priceForSaleEntered = editPriceEntryForSale !== "" && !isNaN(Number(editPriceEntryForSale)) ? Number(editPriceEntryForSale) : null;
      } else {
        patch.pricePerDay = Number(editForm.pricePerDay) || 0;
        patch.pricePerDayEntered = editPriceEntryPerDay !== "" && !isNaN(Number(editPriceEntryPerDay)) ? Number(editPriceEntryPerDay) : null;
      }
      patch.cautionEntered = editCautionEntry !== "" && !isNaN(Number(editCautionEntry)) ? Number(editCautionEntry) : null;
      patch.priceEntryCurrency = editPriceCurrency;
      if (images[0]) patch.thumbnail = await compressImageAdmin(images[0], 480, 0.6);

      const r = await fetch(`/api/vehicles/${editVehicle._id}`, { method: "PATCH", headers, body: JSON.stringify(patch) });
      const d = await r.json().catch(() => null);
      if (r.ok) {
        showToast("✅ Annonce mise à jour");
        setEditVehicle(null); setEditForm(null); setEditPhotos([]);
        onRefresh();
      } else showToast(d?.message || "Erreur mise à jour", "error");
    } catch { showToast("Erreur réseau", "error"); }
    setEditSaving(false);
  };

  const addExportAvail = () => {
    const c = exportAvailText.trim();
    if (c && !exportForm.availableIn.includes(c)) setExportForm((p) => ({ ...p, availableIn: [...p.availableIn, c] }));
    setExportAvailText("");
  };

  const handleConvertToExport = async () => {
    if (!editVehicle) return;
    if (!exportForm.price || Number(exportForm.price) <= 0) { showToast("Indiquez un prix d'export", "error"); return; }
    if (exportForm.availableIn.length === 0) { showToast("Indiquez au moins un pays de destination", "error"); return; }
    setExportSaving(true);
    try {
      const r = await fetch(`/api/vehicles/${editVehicle._id}/convert-to-export`, {
        method: "POST", headers,
        body: JSON.stringify({
          price: Number(exportForm.price), currency: exportForm.currency,
          availableIn: exportForm.availableIn, sourceCity: exportForm.sourceCity,
        }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) {
        showToast("🌍 Annonce transformée en export.");
        setEditVehicle(null); setEditForm(null); setEditPhotos([]); setExportMode(false);
        onRefresh();
      } else showToast(d?.message || "Erreur lors de la conversion", "error");
    } catch { showToast("Erreur réseau", "error"); }
    setExportSaving(false);
  };

  const openPreview = async (vid) => {
    setPreviewLoading(true);
    setPreviewVehicle(null);
    setPreviewImgIdx(0);
    try {
      const r = await fetch(`/api/vehicles/${vid}`, { headers });
      const d = await r.json();
      if (r.ok) setPreviewVehicle(d.vehicle);
      else showToast("Impossible de charger l'annonce", "error");
    } catch { showToast("Erreur réseau", "error"); }
    setPreviewLoading(false);
  };

  const filtered = vehicles.filter((v) => {
    if (subTab === "pending")   return v.status === "pending";
    if (subTab === "approved")  return v.status === "approved";
    if (subTab === "rejected")  return v.status === "rejected";
    return true;
  }).filter((v) => {
    if (!vehSearch) return true;
    const q = vehSearch.toLowerCase();
    return [v.title, v.name, v.marque, v.modele].some((f) => f?.toLowerCase().includes(q));
  }).filter((v) => !vehCountryFilter || v.country === vehCountryFilter)
    .filter((v) => !vehVilleFilter || v.ville === vehVilleFilter)
    .filter((v) => !vehTypeFilter || v.type === vehTypeFilter);

  const filteredDrivers = drivers.filter((d) => driverStatusFilter === "all" || d.status === driverStatusFilter)
    .filter((d) => {
      if (!driverSearch) return true;
      const q = driverSearch.toLowerCase();
      return [d.firstName, d.lastName, d.title, d.zone].some((f) => f?.toLowerCase().includes(q));
    })
    .filter((d) => !driverCountryFilter || d.country === driverCountryFilter)
    .filter((d) => !driverVilleFilter || d.ville === driverVilleFilter);
  const driverVilleOptions = [...new Set(drivers.map((d) => d.ville).filter(Boolean))].sort();

  // Villes distinctes présentes dans le lot actuellement chargé — `ville` est
  // du texte libre côté modèle (pas d'enum), donc pas de liste fixe possible.
  const vehVilleOptions = [...new Set(vehicles.map((v) => v.ville).filter(Boolean))].sort();

  const paginated = filtered.slice((vehPage - 1) * PAGE, vehPage * PAGE);
  const totalPages = Math.ceil(filtered.length / PAGE);

  const SUB_TABS = [
    { k: "pending",  l: "En attente",  icon: "⏳", count: vehicles.filter(v => v.status === "pending").length, color: "#f59e0b" },
    { k: "approved", l: "Publiées",    icon: "✅", count: vehicles.filter(v => v.status === "approved").length, color: "#16a34a" },
    { k: "rejected", l: "Rejetées",    icon: "❌", count: vehicles.filter(v => v.status === "rejected").length, color: "#ef4444" },
    { k: "drivers",  l: "Chauffeurs",  icon: "👨‍✈️", count: drivers.filter(d => d.status === "pending").length, color: "#8b5cf6" },
    { k: "all",      l: "Toutes",      icon: "📋", count: vehicles.length, color: "#64748b" },
  ];

  // Mise à jour optimiste en place (updateDriverStatusInPlace/updateVehicleStatus,
  // voir leur définition au niveau du composant parent) au lieu d'un rechargement
  // complet (onRefresh=loadAll) — celui-ci remplaçait tout l'écran par un spinner
  // plein écran et réinitialisait les filtres/sélection le temps de refetch 6
  // endpoints, alors qu'approuver un véhicule était déjà instantané (incohérence
  // d'UX constatée en audit).
  const handleApproveDriver = async (id) => {
    setBusyDriverIds((prev) => new Set(prev).add(id));
    await updateDriverStatusInPlace(id, "approved");
    setBusyDriverIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  };
  const handleRejectDriver = async (id, reason) => {
    setBusyDriverIds((prev) => new Set(prev).add(id));
    await updateDriverStatusInPlace(id, "rejected", reason);
    setBusyDriverIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    setDriverRejectModal(null); setDriverRejectReason("");
  };
  const handleRejectVehicle = async () => {
    await updateVehicleStatus(rejectModal.vid, "rejected", rejectReason);
    setRejectModal(null); setRejectReason("");
  };

  return (
    <div className={styles.scrollZone}>
      {/* Stats rapides */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        {SUB_TABS.slice(0, 4).map((t) => (
          <div key={t.k} className={styles.pvStatCard} style={{ borderLeftColor: t.color, cursor: "pointer" }} onClick={() => setSubTab(t.k)}>
            <div className={styles.pvStatVal} style={{ color: t.color }}>{t.count}</div>
            <div className={styles.pvStatLbl}>{t.l}</div>
          </div>
        ))}
      </div>

      {/* Sous-onglets */}
      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #e2e8f0", marginBottom: 20 }}>
        {SUB_TABS.map((t) => (
          <button key={t.k} onClick={() => { setSubTab(t.k); setVehPage(1); }}
            style={{ padding: "10px 18px", border: "none", background: "none", cursor: "pointer", fontWeight: 700, fontSize: "0.82rem", borderBottom: subTab === t.k ? `3px solid ${t.color}` : "3px solid transparent", color: subTab === t.k ? t.color : "#64748b", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
            {t.icon} {t.l}
            <span style={{ fontSize: ".72rem", background: subTab === t.k ? t.color : "#e2e8f0", color: subTab === t.k ? "#fff" : "#64748b", borderRadius: 12, padding: "1px 7px", minWidth: 20, textAlign: "center" }}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* Contenu Annonces */}
      {subTab !== "drivers" && (
        <>
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <input className={styles.searchInput} placeholder="Rechercher une annonce…" value={vehSearch}
              onChange={(e) => { setVehSearch(e.target.value); setVehPage(1); }}
              style={{ flex: 1, minWidth: 200 }} />
            <select className={styles.searchInput} value={vehCountryFilter}
              onChange={(e) => { setVehCountryFilter(e.target.value); setVehPage(1); }}
              style={{ minWidth: 150 }}>
              <option value="">🌍 Tous les pays</option>
              {COUNTRIES_CONFIG.map((c) => (
                <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
              ))}
            </select>
            <select className={styles.searchInput} value={vehVilleFilter}
              onChange={(e) => { setVehVilleFilter(e.target.value); setVehPage(1); }}
              style={{ minWidth: 150 }}>
              <option value="">📍 Toutes les villes</option>
              {vehVilleOptions.map((ville) => (
                <option key={ville} value={ville}>{ville}</option>
              ))}
            </select>
            <select className={styles.searchInput} value={vehTypeFilter}
              onChange={(e) => { setVehTypeFilter(e.target.value); setVehPage(1); }}
              style={{ minWidth: 130 }}>
              <option value="">🏷️ Tous types</option>
              <option value="location">Location</option>
              <option value="vente">Vente</option>
            </select>
            {(vehCountryFilter || vehVilleFilter || vehTypeFilter) && (
              <button className={styles.btnSmall}
                onClick={() => { setVehCountryFilter(""); setVehVilleFilter(""); setVehTypeFilter(""); setVehPage(1); }}>
                ✕ Réinitialiser les filtres
              </button>
            )}
            <button className={styles.btnSmall} onClick={onRefresh}>↻ Actualiser</button>
            {selectedVehicleIds.size > 0 && (
              <button className={styles.btnDanger} disabled={bulkDeleting} onClick={handleBulkDeleteVehicles}>
                🗑️ Supprimer la sélection ({selectedVehicleIds.size})
              </button>
            )}
            <button className={styles.btnSmall} disabled={thumbBackfilling}
              onClick={async () => {
                setThumbBackfilling(true);
                try {
                  const r = await fetch("/api/vehicles/backfill-thumbnails", { method: "POST", headers });
                  const d = await r.json();
                  showToast(r.ok ? d.message : (d.message || "Erreur"), r.ok ? "success" : "error");
                  if (r.ok) onRefresh();
                } catch { showToast("Erreur réseau", "error"); }
                setThumbBackfilling(false);
              }}>
              {thumbBackfilling ? "Génération…" : "🖼️ Générer les vignettes manquantes"}
            </button>
            <button className={styles.btnSmall} disabled={descBackfilling}
              onClick={async () => {
                setDescBackfilling(true);
                try {
                  const r = await fetch("/api/vehicles/backfill-descriptions", { method: "POST", headers });
                  const d = await r.json();
                  showToast(r.ok ? d.message : (d.message || "Erreur"), r.ok ? "success" : "error");
                  if (r.ok) onRefresh();
                } catch { showToast("Erreur réseau", "error"); }
                setDescBackfilling(false);
              }}>
              {descBackfilling ? "Génération…" : "✨ Générer les descriptions manquantes"}
            </button>
          </div>

          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
              <div style={{ fontSize: "3rem", marginBottom: 12 }}>🚗</div>
              <p style={{ fontWeight: 600 }}>Aucune annonce dans cette catégorie</p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>
                      <input type="checkbox"
                        checked={paginated.length > 0 && paginated.every((v) => selectedVehicleIds.has(v._id || v.id))}
                        onChange={(e) => {
                          const pageIds = paginated.map((v) => v._id || v.id);
                          setSelectedVehicleIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) pageIds.forEach((id) => next.add(id));
                            else pageIds.forEach((id) => next.delete(id));
                            return next;
                          });
                        }} />
                    </th>
                    <th>Véhicule</th><th>Propriétaire</th><th>Type</th><th>Prix</th><th>Score</th><th>Statut</th><th>Date</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((v) => {
                    const vid = v._id || v.id;
                    const score = v.validationScore;
                    const SC = { approved: { l: "Publiée", c: "#16a34a", bg: "#dcfce7" }, pending: { l: "En attente", c: "#d97706", bg: "#fef3c7" }, rejected: { l: "Rejetée", c: "#dc2626", bg: "#fee2e2" } };
                    const sc = SC[v.status] || SC.pending;
                    const owner = v.owner || v.userId;
                    return (
                      <tr key={vid} className={styles.tr}>
                        <td>
                          <input type="checkbox" checked={selectedVehicleIds.has(vid)} onChange={() => toggleVehicleSelect(vid)} />
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            {(v.images?.[0] || v.image)
                              ? <img src={v.images?.[0] || v.image} alt="" loading="lazy" decoding="async" style={{ width: 46, height: 36, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                              : <div style={{ width: 46, height: 36, borderRadius: 6, background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem" }}>🚗</div>
                            }
                            <div>
                              <div style={{ fontWeight: 700, fontSize: ".87rem", color: "#0f1b3f" }}>{v.title || v.name}</div>
                              <div style={{ fontSize: ".74rem", color: "#94a3b8" }}>{v.marque} {v.modele} {v.annee}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ fontSize: ".82rem" }}>
                          {owner?.firstName || owner?.name || "—"}
                          <div style={{ fontSize: ".73rem", color: "#94a3b8" }}>{owner?.email || "—"}</div>
                        </td>
                        <td><span className={styles.badge} style={{ color: "#64748b", background: "#f1f5f9" }}>{v.type === "location" ? "📅 Location" : "💰 Vente"}</span></td>
                        <td style={{ fontSize: ".85rem", fontWeight: 700 }}>
                          {v.pricePerDay ? `${Number(v.pricePerDay).toLocaleString()} /j` : v.priceForSale ? `${Number(v.priceForSale).toLocaleString()}` : "—"}
                        </td>
                        <td>
                          {score != null && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <div style={{ width: 40, height: 4, background: "#e2e8f0", borderRadius: 4, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${score}%`, background: score >= 65 ? "#16a34a" : score >= 40 ? "#f59e0b" : "#ef4444", borderRadius: 4 }} />
                              </div>
                              <span style={{ fontSize: ".78rem", fontWeight: 700 }}>{score}</span>
                            </div>
                          )}
                        </td>
                        <td><span className={styles.badge} style={{ color: sc.c, background: sc.bg }}>{sc.l}</span></td>
                        <td style={{ fontSize: ".78rem", color: "#94a3b8" }}>{v.createdAt ? new Date(v.createdAt).toLocaleDateString("fr-FR") : "—"}</td>
                        <td>
                          <div style={{ display: "flex", gap: 5 }}>
                            <button title="Visualiser l'annonce complète"
                              onClick={() => openPreview(vid)}
                              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "4px 10px", fontSize: ".75rem", fontWeight: 700, background: "#eff6ff", color: "#2563eb", border: "1.5px solid #bfdbfe", borderRadius: 6, cursor: "pointer" }}>
                              👁
                            </button>
                            <button title="Modifier l'annonce"
                              onClick={() => openEditVehicle(vid)}
                              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "4px 10px", fontSize: ".75rem", fontWeight: 700, background: "#f5f3ff", color: "#7c3aed", border: "1.5px solid #ddd6fe", borderRadius: 6, cursor: "pointer" }}>
                              ✏️
                            </button>
                            <button title="Transférer vers un autre compte/entreprise/pays/ville"
                              onClick={() => openTransfer("vehicle", vid, v.title || v.name, v.country, v.ville)}
                              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "4px 10px", fontSize: ".75rem", fontWeight: 700, background: "#fff7ed", color: "#c2410c", border: "1.5px solid #fed7aa", borderRadius: 6, cursor: "pointer" }}>
                              🔀
                            </button>
                            {v.status !== "approved" && (
                              <button className={styles.btnApprove} style={{ fontSize: ".75rem", padding: "4px 10px" }}
                                onClick={() => setConfirm({ message: `Approuver "${v.title || v.name}" ?`, action: () => updateVehicleStatus(vid, "approved") })}>
                                ✅
                              </button>
                            )}
                            {v.status !== "rejected" && (
                              <button className={styles.btnReject} style={{ fontSize: ".75rem", padding: "4px 10px" }}
                                onClick={() => { setRejectModal({ vid, name: v.title || v.name }); setRejectReason(""); }}>
                                ✕
                              </button>
                            )}
                            <button className={styles.btnDeleteSm} style={{ fontSize: ".75rem" }}
                              onClick={() => setConfirm({ message: "Supprimer cette annonce ?", danger: true, action: () => deleteVehicle(vid) })}>
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button className={styles.pageBtn} onClick={() => setVehPage(p => Math.max(1, p-1))} disabled={vehPage === 1}>‹</button>
              {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i+1).map(p => (
                <button key={p} className={`${styles.pageBtn} ${p === vehPage ? styles.pageBtnActive : ""}`} onClick={() => setVehPage(p)}>{p}</button>
              ))}
              <button className={styles.pageBtn} onClick={() => setVehPage(p => Math.min(totalPages, p+1))} disabled={vehPage === totalPages}>›</button>
            </div>
          )}

          {/* Bug réel corrigé (audit) : plafond de 200 annonces chargées,
              invisible pour l'admin — voir loadMoreVehicles (AdminPanel). */}
          {vehicles.length < vehiclesTotal && (
            <div style={{ textAlign: "center", marginTop: 10 }}>
              <p style={{ fontSize: ".8rem", color: "#94a3b8", marginBottom: 6 }}>{vehicles.length} chargées sur {vehiclesTotal} au total</p>
              <button onClick={loadMoreVehicles}
                style={{ padding: "6px 16px", borderRadius: 10, border: "1.5px solid #6366f1", background: "#fff", color: "#6366f1", fontWeight: 700, fontSize: ".8rem", cursor: "pointer" }}>
                Charger plus
              </button>
            </div>
          )}
        </>
      )}

      {/* Contenu Chauffeurs */}
      {subTab === "drivers" && (
        <div>
          {/* Sous-filtres statut — `drivers` couvre désormais tous les statuts
              (voir loadAll), ce sous-filtre remplace la restriction "pending
              uniquement" qui était jusqu'ici imposée côté serveur. */}
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            {[
              { k: "pending",  l: "En attente", color: "#f59e0b" },
              { k: "approved", l: "Publiés",    color: "#16a34a" },
              { k: "rejected", l: "Rejetés",    color: "#ef4444" },
              { k: "all",      l: "Tous",       color: "#64748b" },
            ].map((t) => (
              <button key={t.k} onClick={() => setDriverStatusFilter(t.k)}
                style={{ padding: "5px 12px", borderRadius: 14, border: `1.5px solid ${driverStatusFilter === t.k ? t.color : "#e2e8f0"}`, background: driverStatusFilter === t.k ? t.color : "#fff", color: driverStatusFilter === t.k ? "#fff" : "#64748b", fontWeight: 700, fontSize: ".76rem", cursor: "pointer" }}>
                {t.l} ({drivers.filter((d) => t.k === "all" || d.status === t.k).length})
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <input className={styles.searchInput} placeholder="Rechercher un chauffeur…" value={driverSearch}
              onChange={(e) => setDriverSearch(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
            <select className={styles.searchInput} value={driverCountryFilter}
              onChange={(e) => setDriverCountryFilter(e.target.value)} style={{ minWidth: 150 }}>
              <option value="">🌍 Tous les pays</option>
              {COUNTRIES_CONFIG.map((c) => (
                <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
              ))}
            </select>
            <select className={styles.searchInput} value={driverVilleFilter}
              onChange={(e) => setDriverVilleFilter(e.target.value)} style={{ minWidth: 150 }}>
              <option value="">📍 Toutes les villes</option>
              {driverVilleOptions.map((ville) => (
                <option key={ville} value={ville}>{ville}</option>
              ))}
            </select>
            {(driverCountryFilter || driverVilleFilter || driverSearch) && (
              <button className={styles.btnSmall}
                onClick={() => { setDriverSearch(""); setDriverCountryFilter(""); setDriverVilleFilter(""); }}>
                ✕ Réinitialiser les filtres
              </button>
            )}
          </div>

          {filteredDrivers.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
              <div style={{ fontSize: "3rem", marginBottom: 12 }}>👨‍✈️</div>
              <p style={{ fontWeight: 600 }}>Aucun profil chauffeur dans cette catégorie</p>
            </div>
          ) : (
            <>
              {selectedDriverIds.size > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <button className={styles.btnDanger} disabled={bulkDeleting} onClick={handleBulkDeleteDrivers}>
                    🗑️ Supprimer la sélection ({selectedDriverIds.size})
                  </button>
                </div>
              )}
              <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>
                      <input type="checkbox"
                        checked={filteredDrivers.length > 0 && filteredDrivers.every((d) => selectedDriverIds.has(d._id))}
                        onChange={(e) => setSelectedDriverIds(e.target.checked ? new Set(filteredDrivers.map((d) => d._id)) : new Set())} />
                    </th>
                    <th>Chauffeur</th><th>Ville / Pays</th><th>Statut</th><th>Permis</th><th>Expérience</th><th>Langues</th><th>CV</th><th>Soumis le</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDrivers.map((d) => {
                    // Le profil chauffeur (Driver) porte sa propre identité/photo — distincte
                    // du compte partenaire qui publie (d.owner, peuplé par getPendingDrivers).
                    // Correction : ce tableau lisait jusqu'ici des champs d'un ancien modèle
                    // (userId/licenseNumber/yearsExperience/languages) qui n'existent plus sur
                    // Driver — toujours vides/undefined en pratique, bug réel constaté en lisant
                    // la réponse effective de /api/drivers/pending.
                    const owner = d.owner || {};
                    return (
                      <tr key={d._id} className={styles.tr}>
                        <td>
                          <input type="checkbox" checked={selectedDriverIds.has(d._id)} onChange={() => toggleDriverSelect(d._id)} />
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
                            {d.profilePhoto ? <img src={d.profilePhoto} alt="" loading="lazy" decoding="async" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover" }} /> : <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center" }}>👤</div>}
                            <div>
                              <strong style={{ fontSize: ".87rem" }}>{d.firstName} {d.lastName}</strong>
                              <div style={{ fontSize: ".74rem", color: "#94a3b8" }}>Publié par {owner.firstName} {owner.lastName} · {owner.email}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ fontSize: ".8rem" }}>{d.ville || "—"}{d.country ? ` · ${d.country}` : ""}</td>
                        <td>
                          {(() => {
                            const sc = { pending: { l: "En attente", c: "#d97706", bg: "#fef3c7" }, approved: { l: "Publié", c: "#16a34a", bg: "#d1fae5" }, rejected: { l: "Rejeté", c: "#dc2626", bg: "#fee2e2" } }[d.status] || { l: d.status, c: "#64748b", bg: "#f1f5f9" };
                            return <span className={styles.badge} style={{ color: sc.c, background: sc.bg }}>{sc.l}</span>;
                          })()}
                        </td>
                        <td style={{ fontSize: ".82rem" }}>{d.permisCategorie || "—"} {d.vehiculePersonnel && <span style={{ color: "#94a3b8" }}>· 🚗 avec véhicule</span>}</td>
                        <td style={{ fontSize: ".82rem" }}>{d.experience || "—"}</td>
                        <td style={{ fontSize: ".78rem" }}>{d.langues?.join(", ") || "—"}</td>
                        <td style={{ fontSize: ".78rem" }}>
                          {d.cv ? <a href={d.cv} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>📄 Voir</a> : <span style={{ color: "#dc2626" }}>Manquant</span>}
                        </td>
                        <td style={{ fontSize: ".78rem", color: "#94a3b8" }}>{d.createdAt ? new Date(d.createdAt).toLocaleDateString("fr-FR") : "—"}</td>
                        <td>
                          <div style={{ display: "flex", gap: 5 }}>
                            {d.status === "pending" ? (
                              <>
                                <button className={styles.btnApprove} disabled={busyDriverIds.has(d._id)} style={{ fontSize: ".75rem", padding: "4px 10px" }} onClick={() => handleApproveDriver(d._id)}>✅ Valider</button>
                                <button className={styles.btnReject} disabled={busyDriverIds.has(d._id)} style={{ fontSize: ".75rem", padding: "4px 10px" }} onClick={() => { setDriverRejectModal({ id: d._id, name: `${d.firstName} ${d.lastName}` }); setDriverRejectReason(""); }}>✕ Refuser</button>
                              </>
                            ) : d.status === "rejected" ? (
                              <button className={styles.btnApprove} disabled={busyDriverIds.has(d._id)} style={{ fontSize: ".75rem", padding: "4px 10px" }} onClick={() => handleApproveDriver(d._id)}>✅ Republier</button>
                            ) : (
                              <button className={styles.btnReject} disabled={busyDriverIds.has(d._id)} style={{ fontSize: ".75rem", padding: "4px 10px" }} onClick={() => { setDriverRejectModal({ id: d._id, name: `${d.firstName} ${d.lastName}` }); setDriverRejectReason(""); }}>✕ Dépublier</button>
                            )}
                            <button title="Transférer vers un autre compte/entreprise/pays/ville"
                              onClick={() => openTransfer("driver", d._id, `${d.firstName} ${d.lastName}`, d.country, d.ville)}
                              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "4px 10px", fontSize: ".75rem", fontWeight: 700, background: "#fff7ed", color: "#c2410c", border: "1.5px solid #fed7aa", borderRadius: 6, cursor: "pointer" }}>
                              🔀
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </>
          )}

          {/* Propositions d'embauche CDD/CDI — décision accepter/refuser au partenaire,
              traitement (contrat modifiable + envoi) à l'admin une fois acceptée */}
          <div className={styles.sectionToolbar} style={{ marginTop: 32 }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 800, color: "#0f1b3f" }}>💼 Propositions d'embauche CDD/CDI ({employmentAdminList.length})</h2>
          </div>
          {employmentAdminLoading ? <p style={{ color: "#94a3b8" }}>Chargement…</p> : employmentAdminList.length === 0 ? (
            <p style={{ color: "#64748b", fontSize: "0.9rem" }}>Aucune proposition d'embauche.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Chauffeur</th><th>Employeur</th><th>Contrat</th><th>Salaire</th><th>Statut</th><th>Soumise le</th><th>Traitement</th></tr>
                </thead>
                <tbody>
                  {employmentAdminList.map((reqm) => {
                    const sc = { pending: { l: "En attente", c: "#d97706", bg: "#fef3c7" }, accepted: { l: "Acceptée", c: "#059669", bg: "#d1fae5" }, declined: { l: "Refusée", c: "#dc2626", bg: "#fee2e2" }, cancelled: { l: "Annulée", c: "#64748b", bg: "#f1f5f9" } }[reqm.status];
                    return (
                      <tr key={reqm._id} className={styles.tr}>
                        <td style={{ fontSize: ".82rem" }}>{reqm.driver?.firstName} {reqm.driver?.lastName}</td>
                        <td style={{ fontSize: ".82rem" }}>{reqm.employer?.firstName} {reqm.employer?.lastName}<div style={{ fontSize: ".73rem", color: "#94a3b8" }}>{reqm.employer?.email}</div></td>
                        <td><span className={styles.badge} style={{ color: "#64748b", background: "#f1f5f9" }}>{reqm.contractType?.toUpperCase()}</span></td>
                        <td style={{ fontSize: ".85rem", fontWeight: 700 }}>{Number(reqm.proposedSalary).toLocaleString()} {reqm.currency}</td>
                        <td><span className={styles.badge} style={{ color: sc.c, background: sc.bg }}>{sc.l}</span></td>
                        <td style={{ fontSize: ".78rem", color: "#94a3b8" }}>{reqm.createdAt ? new Date(reqm.createdAt).toLocaleDateString("fr-FR") : "—"}</td>
                        <td>
                          {reqm.status === "accepted" && !reqm.contractSentAt && (
                            <button className={styles.btnApprove} style={{ fontSize: ".75rem", padding: "4px 10px" }} onClick={() => openProcessModal(reqm)}>📄 Traiter</button>
                          )}
                          {reqm.contractSentAt && (
                            <a href={`/api/driver-employment/${reqm._id}/contract-pdf`} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", fontSize: ".78rem" }}>✓ Envoyé — voir PDF</a>
                          )}
                          {reqm.status !== "accepted" && !reqm.contractSentAt && <span style={{ color: "#94a3b8", fontSize: ".78rem" }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal rejet annonce */}
      {rejectModal && (
        <div className={styles.overlay} onClick={() => setRejectModal(null)}>
          <div className={styles.confirmBox} onClick={e => e.stopPropagation()}>
            <p className={styles.confirmMsg}>Raison du rejet pour « {rejectModal.name} »</p>
            <textarea style={{ width: "100%", borderRadius: 8, border: "1px solid #e2e8f0", padding: ".6rem", fontSize: ".9rem", marginBottom: ".75rem", resize: "vertical" }}
              rows={3} placeholder="Ex: Photos insuffisantes, description incomplète…"
              value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
            <div className={styles.confirmActions}>
              <button className={styles.btnDanger} onClick={handleRejectVehicle}>Rejeter</button>
              <button className={styles.btnGhost} onClick={() => setRejectModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal rejet chauffeur */}
      {driverRejectModal && (
        <div className={styles.overlay} onClick={() => setDriverRejectModal(null)}>
          <div className={styles.confirmBox} onClick={e => e.stopPropagation()}>
            <p className={styles.confirmMsg}>Raison du refus pour « {driverRejectModal.name} »</p>
            <textarea style={{ width: "100%", borderRadius: 8, border: "1px solid #e2e8f0", padding: ".6rem", fontSize: ".9rem", marginBottom: ".75rem", resize: "vertical" }}
              rows={3} placeholder="Ex: Documents insuffisants…"
              value={driverRejectReason} onChange={e => setDriverRejectReason(e.target.value)} />
            <div className={styles.confirmActions}>
              <button className={styles.btnDanger} onClick={() => handleRejectDriver(driverRejectModal.id, driverRejectReason)}>Refuser</button>
              <button className={styles.btnGhost} onClick={() => setDriverRejectModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL TRANSFERT (véhicule ou chauffeur) ══ */}
      {transferModal && (
        <div className={styles.overlay} onClick={() => setTransferModal(null)}>
          <div className={styles.confirmBox} onClick={e => e.stopPropagation()} style={{ width: "min(480px, 92vw)" }}>
            <p className={styles.confirmMsg}>
              🔀 Transférer « {transferModal.label} » ({transferModal.type === "vehicle" ? "véhicule" : "chauffeur"})
            </p>

            <div style={{ marginBottom: 12, position: "relative" }}>
              <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>
                Nouveau propriétaire (nom ou email) — laisser vide pour ne pas changer
              </label>
              <input type="text" value={transferForm.selectedOwner ? `${transferForm.selectedOwner.firstName} ${transferForm.selectedOwner.lastName} (${transferForm.selectedOwner.email})` : transferForm.ownerQuery}
                onChange={(e) => { setTransferForm((p) => ({ ...p, selectedOwner: null })); searchTransferOwners(e.target.value); }}
                placeholder="Ex : Jean Kouassi ou jean@exemple.com"
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".88rem", boxSizing: "border-box" }} />
              {transferForm.ownerResults.length > 0 && !transferForm.selectedOwner && (
                <div style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, marginTop: 4, maxHeight: 160, overflowY: "auto", background: "#fff" }}>
                  {transferForm.ownerResults.map((o) => (
                    <div key={o._id} onClick={() => setTransferForm((p) => ({ ...p, selectedOwner: o, ownerResults: [] }))}
                      style={{ padding: "6px 10px", fontSize: ".82rem", cursor: "pointer", borderBottom: "1px solid #f1f5f9" }}>
                      {o.firstName} {o.lastName} — {o.email}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Pays</label>
                <select value={transferForm.country} onChange={(e) => setTransferForm((p) => ({ ...p, country: e.target.value }))}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".88rem" }}>
                  <option value="">— Ne pas changer —</option>
                  {COUNTRIES_CONFIG.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Ville</label>
                <input type="text" value={transferForm.ville} onChange={(e) => setTransferForm((p) => ({ ...p, ville: e.target.value }))}
                  placeholder="Ne pas changer"
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".88rem", boxSizing: "border-box" }} />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>
                ID entreprise (PartnerBusiness) — optionnel, avancé
              </label>
              <input type="text" value={transferForm.businessId} onChange={(e) => setTransferForm((p) => ({ ...p, businessId: e.target.value }))}
                placeholder="Laisser vide pour ne pas rattacher"
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".88rem", boxSizing: "border-box" }} />
              <p style={{ margin: "4px 0 0", fontSize: ".74rem", color: "#94a3b8" }}>
                Doit appartenir au propriétaire final (nouveau ou actuel) — sinon rejeté par le serveur. Sinon, le nouveau propriétaire peut rattacher lui-même depuis son tableau de bord (Mes entreprises).
              </p>
            </div>

            <div className={styles.confirmActions}>
              <button className={styles.btnPrimary} onClick={submitTransfer} disabled={transferSaving}>{transferSaving ? "…" : "Transférer"}</button>
              <button className={styles.btnGhost} onClick={() => setTransferModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL TRAITEMENT EMBAUCHE CDD/CDI (contrat modifiable) ══ */}
      {processModal && (
        <div className={styles.overlay} onClick={() => setProcessModal(null)}>
          <div className={styles.confirmBox} onClick={e => e.stopPropagation()} style={{ width: "min(560px, 92vw)" }}>
            <p className={styles.confirmMsg}>📄 Traiter le contrat de {processModal.driverName}</p>
            <p style={{ fontSize: ".82rem", color: "#64748b", marginBottom: 10 }}>
              Personnalisez les clauses du contrat si besoin — le texte par défaut s'applique si laissé vide. Le PDF sera
              généré et le partenaire propriétaire du chauffeur sera notifié automatiquement.
            </p>
            <textarea style={{ width: "100%", minHeight: 180, borderRadius: 8, border: "1px solid #e2e8f0", padding: ".7rem", fontSize: ".85rem", marginBottom: ".75rem", resize: "vertical", fontFamily: "inherit" }}
              placeholder="Laisser vide pour utiliser les clauses standard…"
              value={processConditions} onChange={(e) => setProcessConditions(e.target.value)} />
            <div className={styles.confirmActions}>
              <button className={styles.btnPrimary} onClick={submitProcessRequest} disabled={processSaving}>{processSaving ? "…" : "Générer et envoyer"}</button>
              <button className={styles.btnGhost} onClick={() => setProcessModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL PRÉVISUALISATION ANNONCE ══ */}
      {(previewLoading || previewVehicle) && (
        <div className={styles.overlay} onClick={() => { setPreviewVehicle(null); setPreviewLoading(false); }}
          style={{ alignItems: "flex-start", paddingTop: "2vh", overflowY: "auto" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 16, width: "min(900px, 96vw)", maxHeight: "95dvh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,.22)" }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px 14px", borderBottom: "1.5px solid #e2e8f0", flexShrink: 0 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 900, color: "#0f1b3f" }}>
                  👁 Prévisualisation de l'annonce
                </h2>
                {previewVehicle && <p style={{ margin: "2px 0 0", fontSize: ".78rem", color: "#94a3b8" }}>ID : {previewVehicle._id}</p>}
              </div>
              <button onClick={() => { setPreviewVehicle(null); setPreviewLoading(false); }}
                style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 34, height: 34, fontSize: "1.1rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>

            {/* Body */}
            <div style={{ overflowY: "auto", padding: "20px 24px 24px", flex: 1 }}>
              {previewLoading && !previewVehicle ? (
                <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
                  <div style={{ fontSize: "2rem", marginBottom: 10 }}>⏳</div>
                  <p>Chargement de l'annonce…</p>
                </div>
              ) : previewVehicle ? (() => {
                const v = previewVehicle;
                const imgs = v.images?.length ? v.images : v.image ? [v.image] : [];
                const o = v.owner || {};
                const KYC_COLORS = { VERIFIE: "#059669", EN_ATTENTE: "#d97706", REFUSE: "#dc2626", A_REVOIR_MANUELLEMENT: "#2563eb" };
                const kycC = KYC_COLORS[o.kycStatus] || "#94a3b8";
                const STATUS_CFG = { pending: { l: "En attente", c: "#d97706", bg: "#fef3c7" }, approved: { l: "Publiée", c: "#059669", bg: "#dcfce7" }, rejected: { l: "Rejetée", c: "#dc2626", bg: "#fee2e2" } };
                const sc = STATUS_CFG[v.status] || STATUS_CFG.pending;

                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                    {/* Statut + actions rapides */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ background: sc.bg, color: sc.c, padding: "4px 14px", borderRadius: 99, fontWeight: 800, fontSize: ".82rem" }}>{sc.l}</span>
                      {v.autoValidated && <span style={{ background: "#ede9fe", color: "#7c3aed", padding: "4px 12px", borderRadius: 99, fontWeight: 700, fontSize: ".78rem" }}>✨ Validé automatiquement</span>}
                      {v.validationScore != null && (
                        <span style={{ background: v.validationScore >= 65 ? "#dcfce7" : v.validationScore >= 40 ? "#fef3c7" : "#fee2e2", color: v.validationScore >= 65 ? "#059669" : v.validationScore >= 40 ? "#d97706" : "#dc2626", padding: "4px 12px", borderRadius: 99, fontWeight: 700, fontSize: ".78rem" }}>
                          Score {v.validationScore}/100
                        </span>
                      )}
                      <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                        {v.status !== "approved" && (
                          <button className={styles.btnApprove} style={{ fontSize: ".8rem" }}
                            onClick={() => { updateVehicleStatus(v._id, "approved"); setPreviewVehicle(null); }}>✅ Valider</button>
                        )}
                        {v.status !== "rejected" && (
                          <button className={styles.btnReject} style={{ fontSize: ".8rem" }}
                            onClick={() => { setRejectModal({ vid: v._id, name: v.title }); setRejectReason(""); setPreviewVehicle(null); }}>✕ Rejeter</button>
                        )}
                      </div>
                    </div>

                    {/* Galerie photos */}
                    {imgs.length > 0 ? (
                      <div>
                        <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#0f1b3f", height: 280 }}>
                          <img src={imgs[previewImgIdx]} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                          {imgs.length > 1 && (
                            <>
                              <button onClick={() => setPreviewImgIdx(i => (i - 1 + imgs.length) % imgs.length)}
                                style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,.5)", color: "#fff", border: "none", borderRadius: "50%", width: 36, height: 36, fontSize: "1.1rem", cursor: "pointer" }}>‹</button>
                              <button onClick={() => setPreviewImgIdx(i => (i + 1) % imgs.length)}
                                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,.5)", color: "#fff", border: "none", borderRadius: "50%", width: 36, height: 36, fontSize: "1.1rem", cursor: "pointer" }}>›</button>
                              <span style={{ position: "absolute", bottom: 10, right: 14, background: "rgba(0,0,0,.55)", color: "#fff", fontSize: ".75rem", padding: "2px 10px", borderRadius: 99 }}>{previewImgIdx + 1} / {imgs.length}</span>
                            </>
                          )}
                        </div>
                        {imgs.length > 1 && (
                          <div style={{ display: "flex", gap: 6, marginTop: 8, overflowX: "auto", paddingBottom: 4 }}>
                            {imgs.map((img, i) => (
                              <img key={i} src={img} alt="" loading="lazy" decoding="async" onClick={() => setPreviewImgIdx(i)}
                                style={{ width: 64, height: 48, objectFit: "cover", borderRadius: 6, cursor: "pointer", border: i === previewImgIdx ? "2.5px solid #2563eb" : "2px solid #e2e8f0", flexShrink: 0 }} />
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ height: 160, borderRadius: 12, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "3rem", color: "#cbd5e1" }}>🚗</div>
                    )}

                    {/* Deux colonnes : détails annonce + annonceur */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

                      {/* ── Détails de l'annonce ── */}
                      <div style={{ background: "#f8fafc", borderRadius: 12, padding: "16px 18px" }}>
                        <h3 style={{ margin: "0 0 14px", fontSize: ".9rem", fontWeight: 800, color: "#0f1b3f", borderBottom: "1.5px solid #e2e8f0", paddingBottom: 8 }}>🚗 Détails de l'annonce</h3>
                        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                          <h4 style={{ margin: "0 0 4px", fontSize: "1rem", fontWeight: 900, color: "#0f1b3f" }}>{v.title}</h4>
                          {[
                            ["Type", v.type === "location" ? "📅 Location" : "💰 Vente"],
                            ["Catégorie", v.vehicleType],
                            ["Marque / Modèle", [v.marque, v.modele].filter(Boolean).join(" ") || "—"],
                            ["Année", v.annee],
                            ["Couleur", v.couleur],
                            ["Kilométrage", v.kilometrage != null ? `${Number(v.kilometrage).toLocaleString("fr-FR")} km` : "—"],
                            ["État", v.etat],
                            ["Carburant", v.carburant],
                            ["Transmission", v.transmission],
                            ["Places", v.nombrePlaces],
                            ["Portes", v.nombrePortes],
                            ["Climatisation", v.climatisation ? "✅ Oui" : "❌ Non"],
                            ["Avec chauffeur", v.withDriver ? "✅ Oui" : "Non"],
                            v.type === "location"
                              ? ["Prix / jour", v.pricePerDay ? (v.currency ? fmtPinned(v.pricePerDay, v.currency) : fmtUSD(v.pricePerDay)) : "—"]
                              : ["Prix vente", v.priceForSale ? (v.currency ? fmtPinned(v.priceForSale, v.currency) : fmtUSD(v.priceForSale)) : "—"],
                            v.type === "location" && v.caution ? ["Caution", fmtUSD(v.caution)] : null,
                            ["Ville", v.ville || "—"],
                            ["Adresse", v.adresse || "—"],
                            ["Âge min", v.ageMin ? `${v.ageMin} ans` : "—"],
                            ["Vues", v.vues || 0],
                            ["Note moy.", v.noteMoyenne ? `${v.noteMoyenne}/5 (${v.nombreAvis} avis)` : "—"],
                            ["Publié le", v.createdAt ? new Date(v.createdAt).toLocaleDateString("fr-FR") : "—"],
                          ].filter(Boolean).map(([k, val]) => val != null && val !== "—" && (
                            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: ".82rem", gap: 8 }}>
                              <span style={{ color: "#64748b", flexShrink: 0 }}>{k}</span>
                              <span style={{ fontWeight: 600, color: "#0f1b3f", textAlign: "right" }}>{val}</span>
                            </div>
                          ))}
                        </div>
                        {v.leasing?.disponible && (
                          <div style={{ marginTop: 10, padding: "8px 12px", background: "#ede9fe", borderRadius: 8 }}>
                            <div style={{ fontSize: ".78rem", fontWeight: 800, color: "#6d28d9", marginBottom: 4 }}>🏦 Leasing disponible</div>
                            <div style={{ fontSize: ".78rem", color: "#4c1d95" }}>Apport : {fmtUSD(v.leasing.apportInitial)} • {v.leasing.mensualite && `${fmtUSD(v.leasing.mensualite)}/mois`} • {v.leasing.duree} mois • {v.leasing.tauxInteret}%</div>
                          </div>
                        )}
                      </div>

                      {/* ── Détails de l'annonceur ── */}
                      <div style={{ background: "#f8fafc", borderRadius: 12, padding: "16px 18px" }}>
                        <h3 style={{ margin: "0 0 14px", fontSize: ".9rem", fontWeight: 800, color: "#0f1b3f", borderBottom: "1.5px solid #e2e8f0", paddingBottom: 8 }}>👤 Annonceur</h3>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                          {o.profilePhoto
                            ? <img src={o.profilePhoto} alt="" loading="lazy" decoding="async" style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", border: "3px solid #e2e8f0" }} />
                            : <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem" }}>👤</div>}
                          <div>
                            <div style={{ fontWeight: 800, fontSize: ".95rem", color: "#0f1b3f" }}>{o.firstName} {o.lastName}</div>
                            <div style={{ fontSize: ".78rem", color: "#64748b" }}>{o.role || "partenaire"}</div>
                            {o.certificationBadge && <span style={{ fontSize: ".72rem", background: "#fef3c7", color: "#d97706", padding: "1px 8px", borderRadius: 99, fontWeight: 700 }}>🏆 {o.certificationBadge}</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                          {[
                            ["Email", o.email],
                            ["Téléphone", o.phone],
                            ["Ville", o.ville],
                            ["Statut compte", o.isActive === false ? "🚫 Bloqué" : "✅ Actif"],
                            ["Membre depuis", o.createdAt ? new Date(o.createdAt).toLocaleDateString("fr-FR") : "—"],
                          ].filter(([, val]) => val).map(([k, val]) => (
                            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: ".82rem", gap: 8 }}>
                              <span style={{ color: "#64748b", flexShrink: 0 }}>{k}</span>
                              <span style={{ fontWeight: 600, color: "#0f1b3f", textAlign: "right" }}>{val}</span>
                            </div>
                          ))}
                          {o.kycStatus && (
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".82rem" }}>
                              <span style={{ color: "#64748b" }}>KYC</span>
                              <span style={{ fontWeight: 700, color: kycC }}>{o.kycStatus === "VERIFIE" ? "✅ Vérifié" : o.kycStatus === "REFUSE" ? "❌ Refusé" : o.kycStatus === "EN_ATTENTE" ? "⏳ En attente" : "🔄 En révision"}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Description */}
                    {v.description && (
                      <div style={{ background: "#f8fafc", borderRadius: 12, padding: "14px 18px" }}>
                        <h3 style={{ margin: "0 0 8px", fontSize: ".85rem", fontWeight: 800, color: "#0f1b3f" }}>📝 Description</h3>
                        <p style={{ margin: 0, fontSize: ".85rem", color: "#475569", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{v.description}</p>
                      </div>
                    )}

                    {/* Erreurs / avertissements de validation */}
                    {(v.validationErrors?.length > 0 || v.validationWarnings?.length > 0) && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {v.validationErrors?.length > 0 && (
                          <div style={{ background: "#fff1f2", border: "1.5px solid #fca5a5", borderRadius: 10, padding: "12px 16px" }}>
                            <div style={{ fontWeight: 800, fontSize: ".82rem", color: "#dc2626", marginBottom: 6 }}>❌ Erreurs de validation</div>
                            {v.validationErrors.map((e, i) => <div key={i} style={{ fontSize: ".8rem", color: "#b91c1c" }}>• {e}</div>)}
                          </div>
                        )}
                        {v.validationWarnings?.length > 0 && (
                          <div style={{ background: "#fffbeb", border: "1.5px solid #fde68a", borderRadius: 10, padding: "12px 16px" }}>
                            <div style={{ fontWeight: 800, fontSize: ".82rem", color: "#d97706", marginBottom: 6 }}>⚠️ Avertissements</div>
                            {v.validationWarnings.map((w, i) => <div key={i} style={{ fontSize: ".8rem", color: "#92400e" }}>• {w}</div>)}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Raison de rejet */}
                    {v.rejectionReason && (
                      <div style={{ background: "#fff1f2", border: "1.5px solid #fca5a5", borderRadius: 10, padding: "12px 16px" }}>
                        <div style={{ fontWeight: 800, fontSize: ".82rem", color: "#dc2626", marginBottom: 4 }}>💬 Raison du rejet</div>
                        <p style={{ margin: 0, fontSize: ".85rem", color: "#b91c1c" }}>{v.rejectionReason}</p>
                      </div>
                    )}

                  </div>
                );
              })() : null}
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL ÉDITION COMPLÈTE (admin) ══ */}
      {editVehicle && (
        <div className={styles.overlay} onClick={() => { setEditVehicle(null); setEditForm(null); setEditPhotos([]); }}
          style={{ alignItems: "flex-start", paddingTop: "2vh", overflowY: "auto" }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 16, width: "min(680px, 96vw)", maxHeight: "95dvh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,.22)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px 14px", borderBottom: "1.5px solid #e2e8f0", flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 900, color: "#0f1b3f" }}>✏️ Modifier l'annonce (admin)</h2>
              <button onClick={() => { setEditVehicle(null); setEditForm(null); setEditPhotos([]); }}
                style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 34, height: 34, fontSize: "1.1rem", cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ overflowY: "auto", padding: "20px 24px 24px", flex: 1 }}>
              {editLoading || !editForm ? (
                <p style={{ textAlign: "center", color: "#94a3b8", padding: "2rem 0" }}>Chargement…</p>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                    {[{ v: "location", l: "🔑 Location" }, { v: "vente", l: "💰 Vente" }].map((o) => (
                      <button key={o.v} type="button" onClick={() => { setExportMode(false); setEditForm((p) => ({ ...p, type: o.v })); }}
                        style={{ flex: 1, padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: ".85rem",
                          border: !exportMode && editForm.type === o.v ? "2px solid #7c3aed" : "1.5px solid #e2e8f0",
                          background: !exportMode && editForm.type === o.v ? "rgba(124,58,237,.08)" : "#fff",
                          color: !exportMode && editForm.type === o.v ? "#7c3aed" : "#475569" }}>
                        {o.l}
                      </button>
                    ))}
                    <button type="button" onClick={() => setExportMode(true)}
                      style={{ flex: 1, padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: ".85rem",
                        border: exportMode ? "2px solid #6366f1" : "1.5px solid #e2e8f0",
                        background: exportMode ? "rgba(99,102,241,.08)" : "#fff",
                        color: exportMode ? "#6366f1" : "#475569" }}>
                      🌍 Exportation
                    </button>
                  </div>

                  {exportMode && (
                    <div style={{ marginBottom: 16, padding: 14, background: "#f8fafc", borderRadius: 10, border: "1.5px solid #e2e8f0" }}>
                      <p style={{ fontSize: ".8rem", color: "#475569", margin: "0 0 12px" }}>
                        Cette annonce sera transformée en <strong>annonce Import/Export</strong> (soumise à modération) et l'annonce {editForm.type === "vente" ? "vente" : "location"} actuelle sera archivée.
                      </p>
                      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Prix d'export *</label>
                          <input type="number" min="0" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                            value={exportForm.price} onChange={(e) => setExportForm((p) => ({ ...p, price: e.target.value }))} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Devise</label>
                          <select style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                            value={exportForm.currency} onChange={(e) => setExportForm((p) => ({ ...p, currency: e.target.value }))}>
                            {IE_CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                          </select>
                        </div>
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Pays de destination *</label>
                        <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                          <input list="dl-export-avail-admin" style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                            value={exportAvailText} onChange={(e) => setExportAvailText(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addExportAvail())}
                            placeholder="Côte d'Ivoire, Sénégal…" />
                          <datalist id="dl-export-avail-admin">{COUNTRIES_ALL.map((c) => <option key={c} value={c} />)}</datalist>
                          <button type="button" onClick={addExportAvail}
                            style={{ padding: "8px 14px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>+</button>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {exportForm.availableIn.map((c) => (
                            <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(99,102,241,.1)", color: "#6366f1", borderRadius: 99, padding: "3px 10px", fontSize: ".78rem", fontWeight: 600 }}>
                              {getCountryFlag(c)} {c}
                              <button onClick={() => setExportForm((p) => ({ ...p, availableIn: p.availableIn.filter((x) => x !== c) }))}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "#6366f1", padding: 0, lineHeight: 1 }}>×</button>
                            </span>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 10 }}>
                        <button onClick={handleConvertToExport} disabled={exportSaving} className={styles.btnApprove} style={{ fontSize: ".85rem", padding: "8px 18px" }}>
                          {exportSaving ? "Conversion…" : "🌍 Transformer en annonce Export"}
                        </button>
                        <button onClick={() => setExportMode(false)} className={styles.btnGhost} style={{ fontSize: ".85rem", padding: "8px 18px" }}>Annuler</button>
                      </div>
                    </div>
                  )}

                  {!exportMode && (<>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 6 }}>Photos ({editPhotos.length}/6)</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {editPhotos.map((p) => (
                        <div key={p.id} style={{ position: "relative", width: 68, height: 68 }}>
                          <img src={p.preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }} />
                          <button type="button" onClick={() => removeEditPhotoAdmin(p.id)}
                            style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", border: "none", background: "#dc2626", color: "#fff", cursor: "pointer", fontSize: ".7rem" }}>✕</button>
                        </div>
                      ))}
                      {editPhotos.length < 6 && (
                        <label style={{ width: 68, height: 68, border: "1.5px dashed #cbd5e1", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: "1.3rem", color: "#94a3b8" }}>
                          +<input type="file" accept="image/*" multiple hidden onChange={(e) => addEditPhotosAdmin(e.target.files)} />
                        </label>
                      )}
                    </div>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Titre</label>
                    <input type="text" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                      value={editForm.title} onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))} />
                  </div>

                  <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Marque</label>
                      <input type="text" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                        value={editForm.marque} onChange={(e) => setEditForm((p) => ({ ...p, marque: e.target.value }))} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Modèle</label>
                      <input type="text" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                        value={editForm.modele} onChange={(e) => setEditForm((p) => ({ ...p, modele: e.target.value }))} />
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Année</label>
                      <select style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                        value={editForm.annee} onChange={(e) => setEditForm((p) => ({ ...p, annee: e.target.value }))}>
                        {Array.from({ length: 30 }, (_, i) => new Date().getFullYear() - i).map((y) => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>État</label>
                      <select style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                        value={editForm.etat} onChange={(e) => setEditForm((p) => ({ ...p, etat: e.target.value }))}>
                        {["Neuf", "Comme neuf", "Bon état", "À réparer"].map((e_) => <option key={e_} value={e_}>{e_}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Couleur</label>
                      <input type="text" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                        value={editForm.couleur} onChange={(e) => setEditForm((p) => ({ ...p, couleur: e.target.value }))} />
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 140px" }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Type de véhicule</label>
                      <select style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                        value={editForm.vehicleType} onChange={(e) => setEditForm((p) => ({ ...p, vehicleType: e.target.value }))}>
                        {["SUV", "Berline", "Sportif", "Citadine", "Monospace", "Pick-up", "Cabriolet", "Utilitaire"].map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: "1 1 140px" }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Carburant</label>
                      <select style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                        value={editForm.carburant} onChange={(e) => setEditForm((p) => ({ ...p, carburant: e.target.value }))}>
                        {["Essence", "Diesel", "Hybride", "Électrique", "GPL"].map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: "1 1 140px" }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Transmission</label>
                      <select style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                        value={editForm.transmission} onChange={(e) => setEditForm((p) => ({ ...p, transmission: e.target.value }))}>
                        {["Automatique", "Manuelle"].map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Places</label>
                      <input type="number" min="1" max="20" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                        value={editForm.nombrePlaces} onChange={(e) => setEditForm((p) => ({ ...p, nombrePlaces: e.target.value }))} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Portes</label>
                      <input type="number" min="2" max="6" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                        value={editForm.nombrePortes} onChange={(e) => setEditForm((p) => ({ ...p, nombrePortes: e.target.value }))} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Kilométrage</label>
                      <input type="number" min="0" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                        value={editForm.kilometrage} onChange={(e) => setEditForm((p) => ({ ...p, kilometrage: e.target.value }))} />
                    </div>
                  </div>

                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: ".85rem", marginBottom: 12 }}>
                    <input type="checkbox" checked={editForm.climatisation} onChange={(e) => setEditForm((p) => ({ ...p, climatisation: e.target.checked }))} />
                    ❄️ Climatisation
                  </label>

                  <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>
                        {editForm.type === "vente" ? "Prix de vente" : "Prix / jour"}
                      </label>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input type="number" min="0" style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                          value={editForm.type === "vente" ? editPriceEntryForSale : editPriceEntryPerDay}
                          onChange={(e) => handleEditPriceEntryChange(editForm.type === "vente" ? "priceForSale" : "pricePerDay", e.target.value)} />
                        <select style={{ width: "auto", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                          value={editPriceCurrency} onChange={(e) => handleEditPriceCurrencyChange(e.target.value)}>
                          {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                        </select>
                      </div>
                      {editPriceCurrency !== "USD" && (
                        <span style={{ fontSize: ".75rem", color: "#94a3b8" }}>
                          ≈ {Number((editForm.type === "vente" ? editForm.priceForSale : editForm.pricePerDay) || 0).toLocaleString("fr-FR")} USD (converti automatiquement)
                        </span>
                      )}
                    </div>
                    {editForm.type !== "vente" && (
                      <div style={{ flex: 1 }}>
                        <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Caution</label>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input type="number" min="0" style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                            value={editCautionEntry} onChange={(e) => handleEditPriceEntryChange("caution", e.target.value)} />
                          <span style={{ display: "flex", alignItems: "center", padding: "0 8px", fontSize: ".82rem", color: "#64748b" }}>{editPriceCurrency}</span>
                        </div>
                        {editPriceCurrency !== "USD" && (
                          <span style={{ fontSize: ".75rem", color: "#94a3b8" }}>≈ {Number(editForm.caution || 0).toLocaleString("fr-FR")} USD (converti automatiquement)</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Devise d'affichage de l'annonce</label>
                    <select style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                      value={editForm.currency || ""} onChange={(e) => setEditForm((p) => ({ ...p, currency: e.target.value }))}>
                      <option value="">Automatique (devise du visiteur)</option>
                      {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                    </select>
                    <span style={{ fontSize: ".75rem", color: "#94a3b8" }}>
                      {editForm.currency
                        ? `Tous les visiteurs verront le prix en ${editForm.currency}, quel que soit leur pays.`
                        : "Par défaut : chaque visiteur voit le prix converti dans sa propre devise détectée."}
                    </span>
                  </div>

                  {editForm.type !== "vente" && (
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Durée de location proposée</label>
                      <select style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                        value={editForm.rentalDurationType} onChange={(e) => setEditForm((p) => ({ ...p, rentalDurationType: e.target.value }))}>
                        <option value="les_deux">Courte et longue durée</option>
                        <option value="courte">Courte durée uniquement</option>
                        <option value="longue">Longue durée uniquement</option>
                      </select>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Pays</label>
                      <select style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                        value={editForm.country} onChange={(e) => setEditForm((p) => ({ ...p, country: e.target.value }))}>
                        <option value="">— Non précisé —</option>
                        {COUNTRIES_CONFIG.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Ville</label>
                      <input type="text" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                        value={editForm.ville} onChange={(e) => setEditForm((p) => ({ ...p, ville: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Adresse</label>
                    <input type="text" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                      value={editForm.adresse} onChange={(e) => setEditForm((p) => ({ ...p, adresse: e.target.value }))} />
                  </div>

                  {/* Bug réel corrigé (audit) : contactNom/contactTel sont saisis
                      une seule fois à la publication (identity.telephone, voir
                      VendorSubmit.jsx) et n'apparaissaient ensuite NULLE PART en
                      édition, même côté admin — aucun moyen de corriger un
                      numéro faux ou obsolète, alors que le backend l'accepte
                      déjà (EDITABLE, vehicleController.updateVehicle). */}
                  <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Nom du contact</label>
                      <input type="text" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                        value={editForm.contactNom} onChange={(e) => setEditForm((p) => ({ ...p, contactNom: e.target.value }))} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Téléphone du contact</label>
                      <input type="tel" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                        value={editForm.contactTel} onChange={(e) => setEditForm((p) => ({ ...p, contactTel: e.target.value }))} />
                    </div>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Description</label>
                    <textarea rows={3} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem", resize: "vertical" }}
                      value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} />
                  </div>

                  {editForm.type !== "vente" && (
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: "block", fontSize: ".82rem", fontWeight: 600, marginBottom: 4 }}>Âge minimum requis</label>
                      <input type="number" min="0" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                        value={editForm.ageMin} onChange={(e) => setEditForm((p) => ({ ...p, ageMin: e.target.value }))} />
                    </div>
                  )}

                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                    {editForm.type !== "vente" && (
                      <>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: ".85rem" }}>
                          <input type="checkbox" checked={editForm.permisRequis} onChange={(e) => setEditForm((p) => ({ ...p, permisRequis: e.target.checked }))} />
                          Permis de conduire requis
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: ".85rem" }}>
                          <input type="checkbox" checked={editForm.assuranceOptionnelle} onChange={(e) => setEditForm((p) => ({ ...p, assuranceOptionnelle: e.target.checked }))} />
                          Assurance optionnelle proposée
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: ".85rem" }}>
                          <input type="checkbox" checked={editForm.withDriver} onChange={(e) => setEditForm((p) => ({ ...p, withDriver: e.target.checked }))} />
                          Disponible avec chauffeur
                        </label>
                      </>
                    )}
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: ".85rem", fontWeight: 700 }}>
                      <input type="checkbox" checked={editForm.available} onChange={(e) => setEditForm((p) => ({ ...p, available: e.target.checked }))} />
                      Annonce disponible (visible au catalogue)
                    </label>
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={handleSaveEditVehicle} disabled={editSaving} className={styles.btnApprove} style={{ fontSize: ".85rem", padding: "8px 18px" }}>
                      {editSaving ? "Envoi…" : "✅ Enregistrer"}
                    </button>
                    <button onClick={() => { setEditVehicle(null); setEditForm(null); setEditPhotos([]); }} className={styles.btnGhost} style={{ fontSize: ".85rem", padding: "8px 18px" }}>
                      Annuler
                    </button>
                  </div>
                  </>)}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MARKETING SECTION — CMS, Accueil, Vedette & Campagnes (combiné)
// ═══════════════════════════════════════════════════════════════════════════════
const MAX_SPOTLIGHTS_M = 5;

function MarketingSection({ vehicles, token, onRefresh, adsList, adsLoading, adForm, setAdForm, adSaving, saveAd, toggleAdActive, deleteAd }) {
  const approved = vehicles.filter((v) => v.status === "approved" || v.available);
  const [subTab, setSubTab] = useState("accueil");

  // ── Accueil / Hero ──────────────────────────────────────────────────────────
  // Bug réel corrigé (audit) : ce bloc n'écrivait qu'en localStorage du
  // navigateur admin — aucun visiteur réel du site ne voyait jamais ces
  // changements (le titre/sous-titre n'étaient même pas lus par
  // HeroSection.jsx). Persisté désormais côté serveur (SiteContent) via
  // GET/PATCH /api/site-content/hero.
  const [spotlightIds, setSpotlightIds] = useState([]);
  const [heroText, setHeroText] = useState("");
  const [heroSub,  setHeroSub]  = useState("");
  const [savedMsg, setSavedMsg] = useState("");
  const [heroLoading, setHeroLoading] = useState(true);

  useEffect(() => {
    fetch("/api/site-content/hero")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setHeroText(d.heroTitle || "");
        setHeroSub(d.heroSubtitle || "");
        setSpotlightIds((d.heroSpotlights || []).map((v) => String(v?._id || v)));
      })
      .catch(() => {})
      .finally(() => setHeroLoading(false));
  }, []);

  const flash = (msg) => { setSavedMsg(msg); setTimeout(() => setSavedMsg(""), 2800); };

  const patchHero = async (body) => {
    const r = await fetch("/api/site-content/hero", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return r.ok;
  };

  const saveSpotlights = async (ids) => {
    setSpotlightIds(ids);
    const ok = await patchHero({ heroSpotlights: ids });
    if (!ok) flash("Erreur — non sauvegardé côté serveur");
  };

  const toggleSpotlight = (vid) => {
    const str = String(vid);
    if (spotlightIds.includes(str)) {
      saveSpotlights(spotlightIds.filter((id) => id !== str));
      flash("Retiré du carrousel hero");
    } else if (spotlightIds.length >= MAX_SPOTLIGHTS_M) {
      flash(`Maximum ${MAX_SPOTLIGHTS_M} véhicules dans le carrousel`);
    } else {
      saveSpotlights([...spotlightIds, str]);
      flash("Ajouté au carrousel hero ✅");
    }
  };

  const saveHero = async () => {
    const ok = await patchHero({ heroTitle: heroText, heroSubtitle: heroSub });
    flash(ok ? "Texte héro sauvegardé ✅ (visible par tous les visiteurs)" : "Erreur lors de la sauvegarde");
  };

  // ── Vedette ─────────────────────────────────────────────────────────────────
  const [featuredLoading, setFeaturedLoading] = useState(null);

  const toggleFeatured = async (vid, isFeatured) => {
    setFeaturedLoading(vid);
    try {
      // "featured" est un champ de mise à jour partielle géré par la route
      // générique PATCH /:id (voir vehicleController.js, whitelist ADMIN_ONLY)
      // — /:id/feature n'a jamais existé côté serveur, ce qui faisait échouer
      // ce bouton en 404 silencieux (bug réel trouvé en audit).
      const r = await fetch(`/api/vehicles/${vid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ featured: !isFeatured }),
      });
      if (r.ok) { onRefresh(); flash(!isFeatured ? "Véhicule en vedette ⭐" : "Retiré de la vedette"); }
      else flash("Erreur lors de la mise à jour.");
    } catch { flash("Erreur"); }
    setFeaturedLoading(null);
  };

  const featuredCount = approved.filter((v) => v.featured).length;

  const SUB_TABS_M = [
    { k: "accueil",  l: "🏠 Page d'accueil",       desc: "Texte hero & carrousel" },
    { k: "vedette",  l: "⭐ Véhicules en vedette",  desc: "Mise en avant catalogue" },
    { k: "campagnes",l: "📢 Campagnes",             desc: "Bannières & promotions (bientôt)" },
  ];

  return (
    <div className={styles.scrollZone}>
      {/* Stats */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        {[
          { l: "Annonces publiées", v: approved.length, c: "#16a34a" },
          { l: "En vedette",        v: featuredCount,   c: "#f59e0b" },
          { l: "Dans le carrousel", v: spotlightIds.length, c: "#6366f1" },
        ].map(({ l, v, c }) => (
          <div key={l} className={styles.pvStatCard} style={{ borderLeftColor: c }}>
            <div className={styles.pvStatVal} style={{ color: c }}>{v}</div>
            <div className={styles.pvStatLbl}>{l}</div>
          </div>
        ))}
      </div>

      {/* Sous-onglets */}
      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #e2e8f0", marginBottom: 24 }}>
        {SUB_TABS_M.map((t) => (
          <button key={t.k} onClick={() => setSubTab(t.k)}
            style={{ padding: "10px 20px", border: "none", background: "none", cursor: "pointer", fontWeight: 700, fontSize: ".82rem", borderBottom: subTab === t.k ? "3px solid #6366f1" : "3px solid transparent", color: subTab === t.k ? "#6366f1" : "#64748b", fontFamily: "inherit" }}>
            {t.l}
          </button>
        ))}
      </div>

      {savedMsg && <div style={{ background: "#dcfce7", color: "#16a34a", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontWeight: 700 }}>{savedMsg}</div>}

      {/* ── Accueil ── */}
      {subTab === "accueil" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Texte hero */}
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>✏️ Texte de la bannière principale</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div><label className={styles.pvLabel}>Titre principal</label>
                <input className={styles.pvInput} value={heroText} onChange={e => setHeroText(e.target.value)} placeholder="Ex : Trouvez votre véhicule idéal en Afrique" />
              </div>
              <div><label className={styles.pvLabel}>Sous-titre</label>
                <input className={styles.pvInput} value={heroSub} onChange={e => setHeroSub(e.target.value)} placeholder="Ex : Location, vente et import/export dans 14 pays" />
              </div>
              <button className={styles.btnPrimary} style={{ alignSelf: "flex-start" }} onClick={saveHero} disabled={heroLoading}>
                {heroLoading ? "Chargement…" : "Sauvegarder"}
              </button>
            </div>
          </div>

          {/* Carrousel hero */}
          <div className={styles.chartCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 className={styles.chartTitle} style={{ margin: 0 }}>🎠 Carrousel Hero ({spotlightIds.length}/{MAX_SPOTLIGHTS_M})</h3>
              <button className={styles.btnSmall} onClick={() => saveSpotlights([])}>Vider</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
              {approved.map((v) => {
                const vid = String(v._id || v.id);
                const inSpotlight = spotlightIds.includes(vid);
                return (
                  <div key={vid} style={{ border: `2px solid ${inSpotlight ? "#6366f1" : "#e2e8f0"}`, borderRadius: 10, overflow: "hidden", transition: "border-color .2s" }}>
                    {(v.images?.[0] || v.image)
                      ? <img src={v.images?.[0] || v.image} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: 90, objectFit: "cover" }} />
                      : <div style={{ height: 90, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.8rem" }}>🚗</div>
                    }
                    <div style={{ padding: "8px 10px" }}>
                      <div style={{ fontSize: ".78rem", fontWeight: 700, color: "#0f1b3f", marginBottom: 6 }}>{v.title || `${v.marque} ${v.modele}`}</div>
                      <button onClick={() => toggleSpotlight(vid)}
                        style={{ width: "100%", padding: "4px 0", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 700, fontSize: ".74rem",
                          background: inSpotlight ? "#6366f1" : "#f1f5f9", color: inSpotlight ? "#fff" : "#475569" }}>
                        {inSpotlight ? "✓ Dans le carrousel" : "+ Ajouter"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Vedette ── */}
      {subTab === "vedette" && (
        <div className={styles.chartCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 className={styles.chartTitle} style={{ margin: 0 }}>⭐ Véhicules en vedette ({featuredCount} actifs)</h3>
            <span style={{ fontSize: ".78rem", color: "#94a3b8" }}>Véhicules mis en avant sur la page catalogue</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
            {approved.map((v) => {
              const vid = v._id || v.id;
              return (
                <div key={vid} style={{ border: `2px solid ${v.featured ? "#f59e0b" : "#e2e8f0"}`, borderRadius: 12, overflow: "hidden", transition: "border-color .2s" }}>
                  {(v.images?.[0] || v.image)
                    ? <img src={v.images?.[0] || v.image} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: 100, objectFit: "cover" }} />
                    : <div style={{ height: 100, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2rem" }}>🚗</div>
                  }
                  <div style={{ padding: "10px 12px" }}>
                    <div style={{ fontSize: ".82rem", fontWeight: 700, color: "#0f1b3f", marginBottom: 8 }}>{v.title || `${v.marque} ${v.modele} ${v.annee}`}</div>
                    <button onClick={() => toggleFeatured(vid, v.featured)} disabled={featuredLoading === vid}
                      style={{ width: "100%", padding: "5px 0", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: ".78rem",
                        background: v.featured ? "#fef3c7" : "#f1f5f9", color: v.featured ? "#b45309" : "#475569" }}>
                      {featuredLoading === vid ? "…" : v.featured ? "⭐ Retirer vedette" : "+ Mettre en vedette"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Campagnes ── */}
      {subTab === "campagnes" && (
        <AdsSection ads={adsList} loading={adsLoading} form={adForm} setForm={setAdForm} saving={adSaving}
          onSave={saveAd} onToggle={toggleAdActive} onDelete={deleteAd} />
      )}
    </div>
  );
}

// ─── WIP Section ───────────────────────────────────────────────────────────────
function WipSection({ icon, title, subtitle, features = [] }) {
  return (
    <div className={styles.wipSection}>
      <div className={styles.wipIcon}>{icon}</div>
      <h2 className={styles.wipTitle}>{title}</h2>
      <p className={styles.wipSubtitle}>{subtitle || "Ce module sera disponible prochainement."}</p>
      {features.length > 0 && (
        <>
          <p style={{ fontSize: "0.8rem", color: "#94a3b8", marginBottom: 10 }}>Fonctionnalités prévues :</p>
          <div className={styles.wipFeatures}>
            {features.map((f) => (
              <span key={f} className={styles.wipFeature}>⚡ {f}</span>
            ))}
          </div>
        </>
      )}
      <div className={styles.wipBanner}>🚀 En développement — Bientôt disponible</div>
    </div>
  );
}

// ─── Pagination ─────────────────────────────────────────────────────────────────
function Pagination({ page, total, onChange }) {
  if (total <= 1) return null;
  return (
    <div className={styles.pagination}>
      <button className={styles.pageBtn} onClick={() => onChange(page - 1)} disabled={page === 1}>‹</button>
      {Array.from({ length: total }, (_, i) => i + 1).map((p) => (
        <button key={p} className={`${styles.pageBtn} ${p === page ? styles.pageBtnActive : ""}`}
          onClick={() => onChange(p)}>{p}</button>
      ))}
      <button className={styles.pageBtn} onClick={() => onChange(page + 1)} disabled={page === total}>›</button>
    </div>
  );
}
