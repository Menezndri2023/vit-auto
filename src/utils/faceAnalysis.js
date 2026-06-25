/* ══════════════════════════════════════════════════════════════
   VIT AUTO — ANALYSE FACIALE v2.0
   Détection de visage et comparaison document / selfie
   via analyse canvas (histogrammes, détection zone faciale)
   ══════════════════════════════════════════════════════════════ */

// ── Vérifie la présence d'un visage dans une image (heuristique canvas) ───────
export function detectFaceInImage(dataUrl) {
  return new Promise((resolve) => {
    if (!dataUrl || !dataUrl.startsWith("data:image")) {
      resolve({ faceDetected: false, confidence: 0, message: "Image invalide." });
      return;
    }

    const img = new window.Image();
    img.onload = () => {
      if (img.width < 100 || img.height < 100) {
        resolve({ faceDetected: false, confidence: 0, message: "Image trop petite pour détecter un visage." });
        return;
      }

      const canvas = document.createElement("canvas");
      const W = 128, H = 128;
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, W, H);
      const data = ctx.getImageData(0, 0, W, H).data;

      // ── Analyse zone centrale (là où le visage devrait se trouver) ──────────
      const centerX = Math.floor(W * 0.25), centerY = Math.floor(H * 0.15);
      const faceW   = Math.floor(W * 0.5),  faceH   = Math.floor(H * 0.7);

      let skinPixels = 0, totalPixels = faceW * faceH;
      let lumSum = 0;

      for (let y = centerY; y < centerY + faceH; y++) {
        for (let x = centerX; x < centerX + faceW; x++) {
          const idx = (y * W + x) * 4;
          const r = data[idx], g = data[idx + 1], b = data[idx + 2];
          lumSum += 0.299 * r + 0.587 * g + 0.114 * b;

          // Détection couleur peau (large gamme : toutes ethnies)
          if (isSkinColor(r, g, b)) skinPixels++;
        }
      }

      const skinRatio  = skinPixels / totalPixels;
      const avgLum     = lumSum / totalPixels;

      // ── Analyse variance globale ────────────────────────────────────────────
      let variance = 0;
      const pixCount = W * H;
      let totalLum = 0;
      for (let i = 0; i < data.length; i += 4) {
        totalLum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }
      const meanLum = totalLum / pixCount;
      for (let i = 0; i < data.length; i += 4) {
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        variance += (lum - meanLum) ** 2;
      }
      variance /= pixCount;

      // ── Score de confiance ─────────────────────────────────────────────────
      let confidence = 0;
      if (skinRatio > 0.15) confidence += 40;
      if (skinRatio > 0.30) confidence += 20;
      if (skinRatio > 0.45) confidence += 10;
      if (avgLum > 50 && avgLum < 220) confidence += 15;
      if (variance > 200) confidence += 15;

      const faceDetected = confidence >= 55;

      resolve({
        faceDetected,
        confidence: Math.min(100, confidence),
        skinRatio:  Math.round(skinRatio * 100),
        message:    faceDetected
          ? `✓ Visage détecté (confiance ${Math.min(100, confidence)}%)`
          : `✗ Aucun visage détecté clairement. Assurez-vous que votre visage est bien centré et éclairé.`,
      });
    };

    img.onerror = () => resolve({ faceDetected: false, confidence: 0, message: "Image illisible." });
    img.src = dataUrl;
  });
}

// ── Détection couleur peau (multi-ethnique) ───────────────────────────────────
function isSkinColor(r, g, b) {
  // Espace RGB — gamme large pour couvrir toutes les carnations
  const rgbTest = (
    r > 60 && g > 30 && b > 15 &&
    r > g && r > b &&
    Math.abs(r - g) > 8 &&
    r - Math.min(g, b) > 15 &&
    r < 250
  );

  // Espace YCbCr — plus robuste aux variations d'éclairage
  const Y  =  0.299 * r + 0.587 * g + 0.114 * b;
  const Cb = -0.169 * r - 0.331 * g + 0.500 * b + 128;
  const Cr =  0.500 * r - 0.419 * g - 0.081 * b + 128;
  const ycbcrTest = Y > 20 && Cb >= 77 && Cb <= 135 && Cr >= 130 && Cr <= 180;

  return rgbTest || ycbcrTest;
}

// ── Extraction histogramme d'une image (256 niveaux de gris) ─────────────────
function extractHistogram(dataUrl) {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const W = 64, H = 64; // petit pour performance
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, W, H);
      const data = ctx.getImageData(0, 0, W, H).data;

      const hist = new Uint32Array(64); // 64 bins de 4 niveaux chacun
      for (let i = 0; i < data.length; i += 4) {
        const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        hist[Math.floor(lum / 4)]++;
      }

      // Normaliser l'histogramme
      const total = W * H;
      const normalized = Array.from(hist).map((v) => v / total);
      resolve(normalized);
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

// ── Comparaison de deux histogrammes (corrélation) ───────────────────────────
function compareHistograms(h1, h2) {
  if (!h1 || !h2 || h1.length !== h2.length) return 0;
  let corr = 0, sum1 = 0, sum2 = 0, sq1 = 0, sq2 = 0;
  const n = h1.length;
  for (let i = 0; i < n; i++) {
    corr += h1[i] * h2[i];
    sum1 += h1[i]; sum2 += h2[i];
    sq1  += h1[i] ** 2; sq2 += h2[i] ** 2;
  }
  const num = n * corr - sum1 * sum2;
  const den = Math.sqrt((n * sq1 - sum1 ** 2) * (n * sq2 - sum2 ** 2));
  return den === 0 ? 0 : Math.max(0, num / den);
}

// ── Comparaison visage document vs selfie ─────────────────────────────────────
// Retourne un score 0-100.
// NOTE: Sans ML (face-api.js ou service cloud), la comparaison est heuristique.
// En production, remplacer par un appel à un service de reconnaissance faciale.
export async function compareFaces(documentImageUrl, selfieUrl) {
  try {
    const [h1, h2] = await Promise.all([
      extractHistogram(documentImageUrl),
      extractHistogram(selfieUrl),
    ]);

    if (!h1 || !h2) return { score: 0, match: false, message: "Impossible d'analyser les images." };

    // Corrélation histogramme (approximation grossière sans ML)
    const histCorr = compareHistograms(h1, h2);

    // Analyse des zones de peau dans les deux images
    const [faceDet1, faceDet2] = await Promise.all([
      detectFaceInImage(documentImageUrl),
      detectFaceInImage(selfieUrl),
    ]);

    // Score composite
    let score = Math.round(histCorr * 60); // 60% basé sur histogramme
    if (faceDet1.faceDetected && faceDet2.faceDetected) {
      score += 20; // bonus si visage détecté dans les deux
      // Proximité des ratios de peau
      const skinDiff = Math.abs(faceDet1.skinRatio - faceDet2.skinRatio);
      if (skinDiff < 15) score += 20;
      else if (skinDiff < 30) score += 10;
    }

    score = Math.min(100, score);
    const match = score >= 65; // seuil minimal

    return {
      score,
      match,
      histCorr: Math.round(histCorr * 100),
      message: match
        ? `✓ Correspondance faciale acceptable (${score}%). Vérification en cours.`
        : `✗ Correspondance faciale insuffisante (${score}%). Vérification manuelle requise.`,
      requiresManualReview: score < 85,
    };
  } catch (err) {
    console.error("compareFaces error:", err);
    return { score: 0, match: false, message: "Erreur lors de la comparaison des visages.", requiresManualReview: true };
  }
}

// ── Qualité selfie ────────────────────────────────────────────────────────────
export async function checkSelfieQuality(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith("data:image")) {
    return { ok: false, message: "Format d'image invalide.", score: 0 };
  }

  const faceResult = await detectFaceInImage(dataUrl);

  // Vérification luminosité et taille
  const sizeCheck = await checkSelfieSize(dataUrl);
  if (!sizeCheck.ok) return sizeCheck;

  if (!faceResult.faceDetected) {
    return {
      ok: false,
      score: faceResult.confidence,
      message: "Aucun visage clairement détecté. Centrez votre visage, améliorez l'éclairage et réessayez.",
    };
  }

  return {
    ok: true,
    score: faceResult.confidence,
    faceDetected: true,
    message: `✓ Selfie valide — Visage détecté (${faceResult.confidence}%)`,
  };
}

function checkSelfieSize(dataUrl) {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      if (img.width < 200 || img.height < 200) {
        resolve({ ok: false, score: 5, message: `Image trop petite (${img.width}×${img.height}px). Minimum 200×200px.` });
      } else {
        resolve({ ok: true, score: 80 });
      }
    };
    img.onerror = () => resolve({ ok: false, score: 0, message: "Image illisible." });
    img.src = dataUrl;
  });
}
