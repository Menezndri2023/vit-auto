/* ══════════════════════════════════════════════════════════════
   VIT AUTO — MOTEUR KYC v1.0
   Calcul du score de confiance, badge et règles de validation
   ══════════════════════════════════════════════════════════════ */

// ── Score par critère ─────────────────────────────────────────────
export const KYC_WEIGHTS = {
  emailVerified:      15,  // email confirmé par OTP
  phoneVerified:      15,  // téléphone confirmé par OTP
  documentUploaded:   20,  // document uploadé et lisible
  documentValid:      15,  // numéro format valide + pays reconnu
  documentNotExpired: 10,  // document non expiré
  selfieUploaded:     15,  // selfie pris
  fieldsComplete:     10,  // tous les champs remplis (nom, prénom, ddn)
};

export const KYC_MAX_SCORE = Object.values(KYC_WEIGHTS).reduce((a, b) => a + b, 0); // 100

// ── Calcul du score ───────────────────────────────────────────────
export function calculateKycScore(state = {}) {
  let score = 0;
  const breakdown = {};

  for (const [key, weight] of Object.entries(KYC_WEIGHTS)) {
    if (state[key]) {
      score += weight;
      breakdown[key] = weight;
    } else {
      breakdown[key] = 0;
    }
  }

  return { score: Math.min(score, KYC_MAX_SCORE), breakdown };
}

// ── Badge par score ───────────────────────────────────────────────
export function getKycBadge(score) {
  if (score >= 80) {
    return {
      badge:   "CERTIFIÉ",
      label:   "Utilisateur Certifié VIT AUTO",
      emoji:   "🛡️",
      color:   "#10b981",
      bg:      "#d1fae5",
      border:  "#6ee7b7",
      canBook: true,
    };
  }
  if (score >= 60) {
    return {
      badge:   "VÉRIFIÉ",
      label:   "Utilisateur Vérifié",
      emoji:   "✅",
      color:   "#3b82f6",
      bg:      "#dbeafe",
      border:  "#93c5fd",
      canBook: true,
    };
  }
  return {
    badge:   "INSUFFISANT",
    label:   "Vérification insuffisante",
    emoji:   "⚠️",
    color:   "#f59e0b",
    bg:      "#fef3c7",
    border:  "#fcd34d",
    canBook: false,
  };
}

// ── Labels lisibles des critères ─────────────────────────────────
export const KYC_LABELS = {
  emailVerified:      { label: "Email vérifié",           icon: "📧" },
  phoneVerified:      { label: "Téléphone vérifié",       icon: "📱" },
  documentUploaded:   { label: "Document uploadé",         icon: "📄" },
  documentValid:      { label: "Format numéro valide",    icon: "🔍" },
  documentNotExpired: { label: "Document non expiré",     icon: "📅" },
  selfieUploaded:     { label: "Selfie enregistré",       icon: "🤳" },
  fieldsComplete:     { label: "Informations complètes",  icon: "✏️" },
};

// ── Analyse qualité image (canvas) ───────────────────────────────
export function analyzeImage(dataUrl) {
  return new Promise((resolve) => {
    if (!dataUrl || !dataUrl.startsWith("data:image")) {
      resolve({ ok: false, message: "Fichier non-image (PDF accepté mais non analysable).", skipped: true });
      return;
    }

    const img = new window.Image();

    img.onload = () => {
      if (img.width < 200 || img.height < 100) {
        resolve({ ok: false, message: `Image trop petite (${img.width}×${img.height}px) — minimum 200×100 px.` });
        return;
      }
      const ratio = img.width / img.height;
      if (ratio < 0.3 || ratio > 6) {
        resolve({ ok: false, message: "Dimensions suspectes — assurez-vous de photographier uniquement le document." });
        return;
      }

      const canvas = document.createElement("canvas");
      const W = Math.min(img.width, 160);
      const H = Math.min(img.height, 160);
      canvas.width  = W;
      canvas.height = H;
      canvas.getContext("2d").drawImage(img, 0, 0, W, H);
      const data = canvas.getContext("2d").getImageData(0, 0, W, H).data;

      let sum = 0, sumSq = 0;
      const nPx = W * H;
      for (let i = 0; i < data.length; i += 4) {
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        sum   += lum;
        sumSq += lum * lum;
      }
      const mean     = sum / nPx;
      const variance = sumSq / nPx - mean * mean;

      if (variance < 60)  { resolve({ ok: false, message: "Image trop uniforme — document vide, photocopie ou photo floue détectée." }); return; }
      if (mean < 12)      { resolve({ ok: false, message: "Image trop sombre — améliorez l'éclairage." }); return; }
      if (mean > 245)     { resolve({ ok: false, message: "Image surexposée — réduisez la lumière directe." }); return; }

      resolve({ ok: true, message: `✓ Image valide (${img.width}×${img.height}px)`, dimensions: { w: img.width, h: img.height }, variance: Math.round(variance) });
    };

    img.onerror = () => resolve({ ok: false, message: "Image illisible ou corrompue." });
    img.src = dataUrl;
  });
}

// ── Hash SHA-256 d'une image (empreinte document) ────────────────
export async function hashDocument(dataUrl) {
  try {
    const encoder = new TextEncoder();
    const data    = encoder.encode(dataUrl.slice(0, 50000)); // premiers 50 Ko suffisent
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray  = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

// ── Référence de réservation automatique ─────────────────────────
export function generateBookingRef(type = "LOC") {
  const year   = new Date().getFullYear();
  const seq    = String(Math.floor(Math.random() * 999999) + 1).padStart(6, "0");
  const prefix = type === "essai" ? "ESS" : type === "leasing" ? "LEA" : type === "chauffeur" ? "CHF" : "LOC";
  return `VIT-${prefix}-${year}-${seq}`;
}
