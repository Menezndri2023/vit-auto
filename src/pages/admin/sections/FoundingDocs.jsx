// Extrait d'AdminPanel.jsx (découpe par onglet, 2026-09-12) — logique inchangée.
import { CERT_LEVEL_FIELDS, ENTITY_TYPE_LABELS, INCOTERM_LABELS, InfoField, PAYMENT_MODE_LABELS, TagList, VEHICLE_INV_LABELS, fmtCertField, safeHref, safeImgHref } from "../shared.jsx";

// ── Documents soumis pour un niveau de certification (image + lien plein écran,
// même pattern que les documents Partner Verification / Import-Export) ──────────
export function CertLevelDocs({ level, lv }) {
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

export function FoundingDocs({ o }) {
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

export function FoundingBusinessInfo({ o }) {
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
