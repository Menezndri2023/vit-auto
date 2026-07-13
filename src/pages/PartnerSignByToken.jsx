import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

const API = "/api/partner-onboarding";

// ════════════════════════════════════════════════════════════════════════════════
// Page de signature par lien sécurisé (accessible sans connexion)
// URL : /sign/:token
// ════════════════════════════════════════════════════════════════════════════════
export default function PartnerSignByToken() {
  const { token } = useParams();
  const navigate  = useNavigate();

  const [state,       setState]       = useState("loading"); // loading | valid | invalid | signing | done | error
  const [docInfo,     setDocInfo]     = useState(null);
  const [showDoc,     setShowDoc]     = useState(false);
  const [signerName,  setSignerName]  = useState("");
  const [signerPos,   setSignerPos]   = useState("");
  const [accepted,    setAccepted]    = useState(false);
  const [result,      setResult]      = useState(null);
  const [errMsg,      setErrMsg]      = useState("");
  const [justChained, setJustChained] = useState(false); // LOI→Accord enchaînés sur le même lien

  // ── Vérification du token au chargement ──────────────────────────────────
  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    fetch(`${API}/sign-token/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.valid) {
          setDocInfo(data);
          setState(data.alreadySigned ? "done" : "valid");
        } else {
          setErrMsg(data.message || "Lien invalide ou expiré.");
          setState("invalid");
        }
      })
      .catch(() => {
        setErrMsg("Impossible de vérifier le lien. Vérifiez votre connexion.");
        setState("invalid");
      });
  }, [token]);

  // ── Soumission de la signature ────────────────────────────────────────────
  const handleSign = async () => {
    if (!signerName.trim() || !accepted) return;
    setState("signing");
    try {
      const r = await fetch(`${API}/sign-by-token/${token}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ signerName: signerName.trim(), signerPosition: signerPos.trim() }),
      });
      const data = await r.json();
      if (r.ok && data.success) {
        // Un seul lien couvre LOI + Accord : si la LOI vient d'être signée et que
        // l'Accord a été généré automatiquement sur ce même token, on l'enchaîne
        // tout de suite plutôt que d'obliger le partenaire à attendre un 2e lien.
        if (data.type === "loi" && data.chained) {
          const next = await fetch(`${API}/sign-token/${token}`).then((rr) => rr.json()).catch(() => null);
          if (next?.valid && next.type === "agreement" && !next.alreadySigned) {
            setDocInfo(next);
            setShowDoc(false);
            setSignerPos("");
            setAccepted(false);
            setJustChained(true);
            setState("valid");
            return;
          }
        }
        setResult(data);
        setState("done");
      } else {
        setErrMsg(data.message || "Erreur lors de la signature.");
        setState("error");
      }
    } catch {
      setErrMsg("Erreur réseau. Réessayez dans quelques instants.");
      setState("error");
    }
  };

  // ── Affichage ─────────────────────────────────────────────────────────────
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Header VIT-AUTO */}
        <div style={styles.header}>
          <div style={styles.logo}>VIT<span style={styles.logoAccent}>AUTO</span></div>
          <div style={styles.headerSub}>Portail de Signature Sécurisé</div>
        </div>

        <div style={styles.body}>
          {/* Chargement */}
          {state === "loading" && (
            <div style={styles.center}>
              <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>⏳</div>
              <p style={styles.muted}>Vérification du lien sécurisé…</p>
            </div>
          )}

          {/* Lien invalide */}
          {state === "invalid" && (
            <div style={styles.center}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>❌</div>
              <h2 style={styles.h2}>Lien invalide ou expiré</h2>
              <p style={styles.muted}>{errMsg || "Ce lien de signature n'est plus valide."}</p>
              <p style={{ ...styles.muted, marginTop: "1rem" }}>
                Contactez votre responsable VIT-AUTO ou connectez-vous à votre espace partenaire.
              </p>
              <button style={styles.btnPrimary} onClick={() => navigate("/partner-onboarding")}>
                Mon espace partenaire
              </button>
            </div>
          )}

          {/* Document valide */}
          {state === "valid" && docInfo && (
            <>
              {justChained && (
                <div style={styles.chainedBanner}>
                  ✅ LOI signée avec succès — plus qu'une étape : signez votre Accord ci-dessous (même lien, aucun autre email nécessaire).
                </div>
              )}

              {/* Info document */}
              <div style={styles.docMeta}>
                <div style={styles.docTypeTag}>
                  {docInfo.type === "loi" ? "📄 Étape 1/2 — Lettre d'Intention" : "📜 Étape 2/2 — Accord de Partenariat Fondateur"}
                </div>
                <div style={styles.metaGrid}>
                  <MetaRow label="Référence" value={docInfo.referenceNumber} />
                  <MetaRow label="Entreprise" value={docInfo.companyName} />
                  <MetaRow label="Signataire" value={docInfo.partnerName} />
                  {docInfo.type === "agreement" && docInfo.commissions && (
                    <>
                      <MetaRow label="Commission Location" value={`${docInfo.commissions.location}%`} highlight />
                      <MetaRow label="Commission Vente" value={`${docInfo.commissions.vente}%`} highlight />
                      <MetaRow label="Abonnement" value="12 mois OFFERT" highlight />
                    </>
                  )}
                </div>
              </div>

              {/* Aperçu document */}
              <div style={styles.docPreviewToggle}>
                <button style={styles.btnOutline} onClick={() => setShowDoc((v) => !v)}>
                  {showDoc ? "▲ Masquer le document" : "▼ Lire le document complet"}
                </button>
              </div>
              {showDoc && (
                <div style={styles.docViewer}>
                  <pre style={styles.docText}>{docInfo.content}</pre>
                </div>
              )}

              {/* Formulaire signature */}
              <div style={styles.signForm}>
                <h3 style={styles.h3}>Votre signature électronique</h3>
                <p style={styles.muted}>
                  En signant, vous confirmez avoir lu et accepté l'intégralité du document ci-dessus.
                  Votre signature est enregistrée avec la date, l'heure et votre adresse IP pour valeur légale.
                </p>

                <div style={styles.field}>
                  <label style={styles.label}>Nom complet du signataire *</label>
                  <input
                    style={styles.input}
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    placeholder="Prénom Nom"
                    maxLength={100}
                  />
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>Poste / Titre</label>
                  <input
                    style={styles.input}
                    value={signerPos}
                    onChange={(e) => setSignerPos(e.target.value)}
                    placeholder="Directeur Général, PDG…"
                    maxLength={100}
                  />
                </div>
                <label style={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={() => setAccepted((v) => !v)}
                    style={{ accentColor: "#1a7a8a", width: 18, height: 18, flexShrink: 0 }}
                  />
                  <span>
                    Je certifie être habilité(e) à signer ce document au nom de{" "}
                    <strong>{docInfo.companyName}</strong> et j'accepte l'intégralité des termes et conditions.
                  </span>
                </label>

                <div style={styles.ipNote}>
                  📍 Votre signature sera horodatée et enregistrée avec votre adresse IP pour valeur légale.
                </div>

                <button
                  style={{
                    ...styles.btnSign,
                    opacity: (!signerName.trim() || !accepted) ? 0.5 : 1,
                    cursor:  (!signerName.trim() || !accepted) ? "not-allowed" : "pointer",
                  }}
                  onClick={handleSign}
                  disabled={!signerName.trim() || !accepted}
                >
                  ✍️ {docInfo.type === "loi" ? "Signer la LOI" : "Signer l'Accord de Partenariat"}
                </button>
              </div>
            </>
          )}

          {/* Signature en cours */}
          {state === "signing" && (
            <div style={styles.center}>
              <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>⏳</div>
              <p style={styles.muted}>Enregistrement de votre signature…</p>
            </div>
          )}

          {/* Succès */}
          {state === "done" && (
            <div style={styles.center}>
              <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>
                {result?.type === "agreement" || docInfo?.type === "agreement" ? "🎉" : "✅"}
              </div>
              <h2 style={{ ...styles.h2, color: "#059669" }}>
                {result?.type === "agreement" || (!result && docInfo?.type === "agreement")
                  ? "Accord signé — Vous êtes Partenaire Fondateur !"
                  : "LOI signée avec succès !"}
              </h2>

              {result?.type === "agreement" && result.commissions && (
                <div style={styles.commBox}>
                  <div style={styles.commTitle}>Vos conditions Founding Partner activées</div>
                  <div style={styles.commGrid}>
                    <CommItem label="Location" value={`${result.commissions.location}%`} />
                    <CommItem label="Vente" value={`${result.commissions.vente}%`} />
                    <CommItem label="Abonnement" value="12 mois offerts" />
                    <CommItem label="Badge" value="👑 Founding Partner" />
                  </div>
                </div>
              )}

              {result?.documentHash && (
                <div style={styles.hashBox}>
                  <span style={styles.hashLabel}>Hash SHA-256 (preuve d'intégrité)</span>
                  <code style={styles.hash}>{result.documentHash}</code>
                </div>
              )}

              {result?.type === "loi" && !result.chained && (
                <p style={styles.muted}>Votre Accord de Partenariat Fondateur est en préparation — vous recevrez un email dès qu'il sera prêt à signer.</p>
              )}

              {!result && (
                <p style={styles.muted}>Ce document a déjà été signé. Retrouvez-le dans votre espace partenaire.</p>
              )}

              <button style={styles.btnPrimary} onClick={() => navigate("/partner-onboarding")}>
                → Mon espace partenaire
              </button>
            </div>
          )}

          {/* Erreur */}
          {state === "error" && (
            <div style={styles.center}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>⚠️</div>
              <h2 style={{ ...styles.h2, color: "#dc2626" }}>Erreur lors de la signature</h2>
              <p style={styles.muted}>{errMsg}</p>
              <div style={{ display: "flex", gap: "1rem", justifyContent: "center", marginTop: "1.5rem" }}>
                <button style={styles.btnOutline} onClick={() => { setState("valid"); setErrMsg(""); }}>
                  Réessayer
                </button>
                <button style={styles.btnPrimary} onClick={() => navigate("/partner-onboarding")}>
                  Mon espace
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <span>VIT-AUTO © 2026</span>
          <span>·</span>
          <a href="mailto:contact@vit-auto.com" style={{ color: "#1a7a8a" }}>contact@vit-auto.com</a>
          <span>·</span>
          <span style={{ color: "#94a3b8" }}>Signature électronique sécurisée</span>
        </div>
      </div>
    </div>
  );
}

// ── Composants utilitaires ────────────────────────────────────────────────────
function MetaRow({ label, value, highlight }) {
  return (
    <div style={{ ...styles.metaRow, background: highlight ? "#f0fdf4" : "transparent" }}>
      <span style={styles.metaLabel}>{label}</span>
      <span style={{ ...styles.metaValue, color: highlight ? "#059669" : "#0f172a", fontWeight: highlight ? 700 : 600 }}>
        {value || "—"}
      </span>
    </div>
  );
}

function CommItem({ label, value }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: ".75rem", color: "rgba(255,255,255,.6)", marginBottom: ".2rem" }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: "1rem" }}>{value}</div>
    </div>
  );
}

// ── Styles inline ─────────────────────────────────────────────────────────────
const styles = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0d2137 0%, #0f3460 60%, #1a7a8a 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "1rem",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  card: {
    background: "#fff",
    borderRadius: 20,
    maxWidth: 760,
    width: "100%",
    boxShadow: "0 25px 60px rgba(0,0,0,.35)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    background: "linear-gradient(135deg, #0d2137, #1a7a8a)",
    padding: "1.5rem 2rem",
    color: "#fff",
  },
  logo: { fontSize: "1.6rem", fontWeight: 900, letterSpacing: "-0.5px" },
  logoAccent: { color: "#f5a623" },
  headerSub: { fontSize: ".78rem", color: "rgba(255,255,255,.6)", marginTop: ".2rem", letterSpacing: ".05em" },
  body: { padding: "2rem", flex: 1 },
  footer: {
    display: "flex",
    gap: ".75rem",
    padding: "1rem 2rem",
    background: "#f8fafc",
    borderTop: "1px solid #e2e8f0",
    fontSize: ".75rem",
    color: "#94a3b8",
    alignItems: "center",
    flexWrap: "wrap",
  },
  center: { textAlign: "center", padding: "1rem 0" },
  chainedBanner: {
    background: "#ecfdf5",
    border: "1.5px solid #6ee7b7",
    color: "#065f46",
    borderRadius: 10,
    padding: ".85rem 1rem",
    fontSize: ".85rem",
    fontWeight: 600,
    marginBottom: "1.25rem",
    lineHeight: 1.5,
  },
  h2: { fontSize: "1.4rem", fontWeight: 700, color: "#0d2137", marginBottom: ".5rem" },
  h3: { fontSize: "1rem", fontWeight: 700, color: "#0d2137", marginBottom: ".5rem" },
  muted: { color: "#64748b", fontSize: ".88rem", lineHeight: 1.6, marginBottom: ".5rem" },
  docMeta: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "1.25rem", marginBottom: "1.25rem" },
  docTypeTag: {
    display: "inline-block",
    background: "linear-gradient(135deg, #0d2137, #1a7a8a)",
    color: "#fff",
    padding: ".35rem .9rem",
    borderRadius: 999,
    fontSize: ".8rem",
    fontWeight: 700,
    marginBottom: "1rem",
  },
  metaGrid: { display: "flex", flexDirection: "column", gap: ".2rem" },
  metaRow: { display: "flex", justifyContent: "space-between", padding: ".4rem .5rem", borderRadius: 6, fontSize: ".85rem" },
  metaLabel: { color: "#64748b" },
  metaValue: { color: "#0f172a", fontWeight: 600 },
  docPreviewToggle: { marginBottom: "1rem" },
  docViewer: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "1rem", marginBottom: "1.25rem", maxHeight: 320, overflowY: "auto" },
  docText: { fontSize: ".65rem", lineHeight: 1.65, color: "#374151", whiteSpace: "pre-wrap", fontFamily: "'Courier New', monospace", margin: 0 },
  signForm: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" },
  field: { display: "flex", flexDirection: "column", gap: ".3rem" },
  label: { fontSize: ".78rem", fontWeight: 600, color: "#1e293b" },
  input: { padding: ".65rem .9rem", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".9rem", color: "#1e293b", outline: "none" },
  checkLabel: { display: "flex", gap: ".75rem", alignItems: "flex-start", fontSize: ".85rem", color: "#1e293b", lineHeight: 1.5, cursor: "pointer" },
  ipNote: { background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: ".6rem .85rem", fontSize: ".75rem", color: "#1d4ed8" },
  btnSign: {
    padding: ".85rem",
    background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontSize: "1rem",
    fontWeight: 700,
    cursor: "pointer",
  },
  btnPrimary: {
    display: "inline-block",
    marginTop: "1.5rem",
    padding: ".7rem 1.5rem",
    background: "linear-gradient(135deg, #0d2137, #1a7a8a)",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontSize: ".9rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  btnOutline: {
    display: "inline-block",
    marginTop: "1rem",
    padding: ".6rem 1.2rem",
    background: "transparent",
    color: "#1a7a8a",
    border: "1.5px solid #1a7a8a",
    borderRadius: 10,
    fontSize: ".88rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  commBox: {
    background: "linear-gradient(135deg, #0d2137, #0f3460)",
    color: "#fff",
    borderRadius: 12,
    padding: "1.25rem",
    margin: "1.25rem 0",
    textAlign: "center",
  },
  commTitle: { fontSize: ".78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "#f5a623", marginBottom: "1rem" },
  commGrid: { display: "flex", justifyContent: "center", gap: "2rem", flexWrap: "wrap" },
  hashBox: {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: ".75rem 1rem",
    margin: "1rem 0",
    textAlign: "left",
  },
  hashLabel: { display: "block", fontSize: ".7rem", color: "#64748b", marginBottom: ".3rem", textTransform: "uppercase", letterSpacing: ".05em" },
  hash: { fontSize: ".68rem", color: "#059669", wordBreak: "break-all", fontFamily: "monospace" },
};
