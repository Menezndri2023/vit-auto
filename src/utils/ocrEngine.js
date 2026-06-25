/* ══════════════════════════════════════════════════════════════
   VIT AUTO — MOTEUR OCR v2.0
   Utilise Tesseract.js pour extraire le texte des documents
   d'identité et pré-remplir automatiquement les champs.
   ══════════════════════════════════════════════════════════════ */

import { createWorker } from "tesseract.js";

// ── Instance worker partagée (initialisée une seule fois) ─────────────────────
let _worker = null;
let _workerReady = false;

export async function initOcrWorker(onProgress) {
  if (_worker && _workerReady) return _worker;

  _worker = await createWorker("fra+eng", 1, {
    logger: (m) => {
      if (onProgress && m.status === "recognizing text") {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });

  _workerReady = true;
  return _worker;
}

export async function terminateOcrWorker() {
  if (_worker) {
    await _worker.terminate();
    _worker = null;
    _workerReady = false;
  }
}

// ── Pré-traitement image pour améliorer la lisibilité OCR ─────────────────────
function preprocessImageForOcr(dataUrl) {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      // Redimensionner à 1600px de large max pour performance
      const scale  = Math.min(1600 / img.width, 1);
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Amélioration contraste
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        // Conversion en niveaux de gris + augmentation du contraste
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const enhanced = Math.min(255, Math.max(0, (lum - 128) * 1.4 + 128));
        data[i] = data[i + 1] = data[i + 2] = enhanced;
      }
      ctx.putImageData(imageData, 0, 0);

      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// ── Extraction OCR complète d'un document ─────────────────────────────────────
export async function extractDocumentOcr(dataUrl, documentType, onProgress) {
  try {
    const worker = await initOcrWorker(onProgress);

    // Pré-traitement
    const processedUrl = await preprocessImageForOcr(dataUrl);

    const { data } = await worker.recognize(processedUrl);
    const rawText = data.text || "";
    const confidence = Math.round(data.confidence || 0);

    // Extraction des champs depuis le texte brut
    const extracted = parseDocumentText(rawText, documentType, confidence);

    return {
      success:   true,
      rawOcrText:    rawText,
      ocrConfidence: confidence,
      ...extracted,
    };
  } catch (err) {
    console.error("OCR error:", err);
    return {
      success:       false,
      rawOcrText:    "",
      ocrConfidence: 0,
      error:         err.message,
    };
  }
}

// ── Parseur de texte OCR par type de document ─────────────────────────────────
function parseDocumentText(text, documentType, confidence) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const upper = text.toUpperCase();

  let firstName       = null;
  let lastName        = null;
  let birthDate       = null;
  let gender          = null;
  let documentNumber  = null;
  let expiryDate      = null;
  let issuingCountry  = null;

  // ── Extraction MRZ (Machine Readable Zone) ─────────────────────────────────
  // La MRZ est présente sur les passeports et CNI modernes
  const mrzLines = lines.filter((l) => /^[A-Z0-9<]{30,}$/.test(l.replace(/\s/g, "")));

  if (mrzLines.length >= 2) {
    const mrz = mrzLines.map((l) => l.replace(/\s/g, ""));
    const parsed = parseMRZ(mrz);
    if (parsed) {
      return { ...parsed, issuingCountry: parsed.issuingCountry || detectCountryFromText(upper) };
    }
  }

  // ── Extraction par patterns textuels ─────────────────────────────────────
  // Nom / Prénom — patterns francophones
  const namePatterns = [
    /NOM\s*[:\/]?\s*([A-ZÀ-Ÿ\s\-']+)/i,
    /NOM\s+DE\s+FAMILLE\s*[:\/]?\s*([A-ZÀ-Ÿ\s\-']+)/i,
    /SURNAME\s*[:\/]?\s*([A-Z\s\-']+)/i,
    /LAST\s+NAME\s*[:\/]?\s*([A-Z\s\-']+)/i,
  ];
  const firstNamePatterns = [
    /PR[EÉ]NOM\s*[:\/]?\s*([A-ZÀ-Ÿ\s\-']+)/i,
    /GIVEN\s+NAME\s*[:\/]?\s*([A-Z\s\-']+)/i,
    /FIRST\s+NAME\s*[:\/]?\s*([A-Z\s\-']+)/i,
    /PRENOM\s*[:\/]?\s*([A-ZÀ-Ÿ\s\-']+)/i,
  ];
  const birthPatterns = [
    /N[ÉE]\s*(?:LE)?\s*[:\/]?\s*(\d{1,2}[\s\.\/\-]\d{1,2}[\s\.\/\-]\d{2,4})/i,
    /DATE\s+(?:DE\s+)?NAISSANCE\s*[:\/]?\s*(\d{1,2}[\s\.\/\-]\d{1,2}[\s\.\/\-]\d{2,4})/i,
    /DOB\s*[:\/]?\s*(\d{1,2}[\s\.\/\-]\d{1,2}[\s\.\/\-]\d{2,4})/i,
    /BIRTH\s*(?:DATE)?\s*[:\/]?\s*(\d{1,2}[\s\.\/\-]\d{1,2}[\s\.\/\-]\d{2,4})/i,
  ];
  const expiryPatterns = [
    /DATE\s+D['\s]?EXPIR\w*\s*[:\/]?\s*(\d{1,2}[\s\.\/\-]\d{1,2}[\s\.\/\-]\d{2,4})/i,
    /EXPIR\w*\s*(?:DATE)?\s*[:\/]?\s*(\d{1,2}[\s\.\/\-]\d{1,2}[\s\.\/\-]\d{2,4})/i,
    /VALID\w*\s+(?:UNTIL|JUSQU)?\s*[:\/]?\s*(\d{1,2}[\s\.\/\-]\d{1,2}[\s\.\/\-]\d{2,4})/i,
    /FIN\s+VALIDIT[EÉ]\s*[:\/]?\s*(\d{1,2}[\s\.\/\-]\d{1,2}[\s\.\/\-]\d{2,4})/i,
  ];
  // Mots-clés à rejeter absolument comme numéro de document
  const DOC_TYPE_KEYWORDS = new Set([
    "PASSPORT","PASSEPORT","CNI","NATIONAL","IDENTITY","IDENTITE","IDENTITÉ",
    "CARTE","PERMIS","RESIDENCE","SÉJOUR","SEJOUR","REPUBLIC","REPUBLIQUE",
    "REPUBLIQUE","FRANCAISE","FRANÇAISE","IVOIRIENNE","MAROCAINE","LICENCE",
    "DRIVING","DRIVER","LICENSE","BIRTH","DATE","NAISSANCE","SEXE","GENRE",
    "NOM","PRENOM","PRÉNOM","PHOTO","SIGNATURE","PLACE","LIEU","NAME",
    "SURNAME","GIVEN","VALID","UNTIL","EXPIRY","EXPIRES","ISSUED","ISSUING",
  ]);

  const isValidDocNum = (s) => {
    if (!s) return false;
    const clean = s.toUpperCase().trim();
    if (clean.length < 5 || clean.length > 20) return false;
    // Rejeter si c'est un mot-clé de document
    if (DOC_TYPE_KEYWORDS.has(clean)) return false;
    // Rejeter si uniquement des lettres sans chiffres (ex: "PASSPORT", "CNI")
    if (/^[A-Z]+$/.test(clean) && clean.length <= 10) return false;
    // Doit contenir au moins 1 chiffre OU être un format alphanum connu
    return /\d/.test(clean) || /^[A-Z]{1,3}\d{4,}$/.test(clean);
  };

  const docNumPatterns = [
    /N[°º]\s*[:\/]?\s*([A-Z0-9\-]{5,18})/i,
    /NUM[EÉ]RO\s*[:\/]?\s*([A-Z0-9\-]{5,18})/i,
    /DOCUMENT\s+N[°º]\s*[:\/]?\s*([A-Z0-9\-]{5,18})/i,
    /CARTE\s+N[°º]\s*[:\/]?\s*([A-Z0-9\-]{5,18})/i,
    /PASSEPORT\s+N[°º]\s*[:\/]?\s*([A-Z0-9]{6,12})/i,
    /PERMIS\s+N[°º]\s*[:\/]?\s*([A-Z0-9\-]{5,18})/i,
    /\bID\b\s*[:\/]?\s*([A-Z0-9]{6,15})/i,
  ];
  const genderPatterns = [
    /SEXE\s*[:\/]?\s*(M|F|MASCULIN|FÉMININ|FEMININ|MALE|FEMALE)/i,
    /SEX\s*[:\/]?\s*(M|F|MALE|FEMALE)/i,
    /GENRE\s*[:\/]?\s*(M|F)/i,
  ];

  const isValidName = (s) => s && s.trim().length >= 2 && !/^\s*[A-Z]\s*$/.test(s.trim());
  for (const p of namePatterns) {
    const m = text.match(p);
    if (m && isValidName(m[1])) { lastName = capitalizeWords(m[1].trim()); break; }
  }
  for (const p of firstNamePatterns) {
    const m = text.match(p);
    if (m && isValidName(m[1])) { firstName = capitalizeWords(m[1].trim()); break; }
  }
  for (const p of birthPatterns) {
    const m = text.match(p);
    if (m) { birthDate = normalizeDate(m[1]); break; }
  }
  for (const p of expiryPatterns) {
    const m = text.match(p);
    if (m) { expiryDate = normalizeDate(m[1]); break; }
  }
  for (const p of docNumPatterns) {
    const m = text.match(p);
    if (m && isValidDocNum(m[1])) { documentNumber = m[1].toUpperCase().trim(); break; }
  }
  for (const p of genderPatterns) {
    const m = text.match(p);
    if (m) {
      const g = m[1].toUpperCase();
      gender = (g === "M" || g === "MASCULIN" || g === "MALE") ? "M" : "F";
      break;
    }
  }

  issuingCountry = detectCountryFromText(upper);

  // Confidence ajustée selon le nombre de champs extraits
  const fieldsFound = [firstName, lastName, birthDate, documentNumber].filter(Boolean).length;
  const adjustedConf = Math.min(confidence, confidence * (0.5 + fieldsFound * 0.125));

  return {
    firstName,
    lastName,
    birthDate,
    gender,
    documentNumber,
    expiryDate,
    issuingCountry,
    ocrConfidence: Math.round(adjustedConf),
  };
}

// ── Parseur MRZ (Machine Readable Zone) ──────────────────────────────────────
function parseMRZ(lines) {
  if (!lines || lines.length < 2) return null;

  const line1 = lines[0].replace(/\s/g, "").padEnd(44, "<");
  const line2 = lines[1].replace(/\s/g, "").padEnd(44, "<");

  const docTypeChar = line1[0];
  const isPassport  = docTypeChar === "P";
  const isTd2       = line1.length === 36;
  const isTd1       = !isPassport && !isTd2;

  let firstName = null, lastName = null, documentNumber = null;
  let birthDate = null, expiryDate = null, gender = null, issuingCountry = null;

  try {
    if (isPassport) {
      // TD3 Passeport : 2 lignes × 44 chars
      const countryCode = line1.substring(2, 5).replace(/</, "").trim();
      issuingCountry = countryCodeToName(countryCode);

      const namePart = line1.substring(5, 44);
      const nameSplit = namePart.split("<<");
      if (nameSplit.length >= 2) {
        lastName  = nameSplit[0].replace(/</g, " ").trim();
        firstName = nameSplit.slice(1).join(" ").replace(/</g, " ").trim();
      }

      documentNumber = line2.substring(0, 9).replace(/</g, "").trim();
      birthDate      = mrzDateToISO(line2.substring(13, 19));
      gender         = line2[20] === "M" ? "M" : line2[20] === "F" ? "F" : null;
      expiryDate     = mrzDateToISO(line2.substring(21, 27));
    } else if (isTd1) {
      // TD1 CNI : 3 lignes × 30 chars
      const line3 = (lines[2] || "").replace(/\s/g, "").padEnd(30, "<");
      documentNumber = line1.substring(5, 14).replace(/</g, "").trim();
      issuingCountry = countryCodeToName(line1.substring(2, 5).replace(/</, "").trim());
      birthDate      = mrzDateToISO(line2.substring(0, 6));
      gender         = line2[7] === "M" ? "M" : line2[7] === "F" ? "F" : null;
      expiryDate     = mrzDateToISO(line2.substring(8, 14));

      const namePart = line3.substring(0, 30);
      const nameSplit = namePart.split("<<");
      if (nameSplit.length >= 2) {
        lastName  = nameSplit[0].replace(/</g, " ").trim();
        firstName = nameSplit.slice(1).join(" ").replace(/</g, " ").trim();
      }
    }
  } catch { return null; }

  if (!documentNumber && !lastName) return null;

  return {
    firstName:      capitalizeWords(firstName),
    lastName:       capitalizeWords(lastName),
    birthDate,
    gender,
    documentNumber,
    expiryDate,
    issuingCountry,
    ocrConfidence:  92,
    parsedFromMrz:  true,
  };
}

// ── Convertir date MRZ YYMMDD → ISO YYYY-MM-DD ───────────────────────────────
function mrzDateToISO(yymmdd) {
  if (!yymmdd || yymmdd.length < 6) return null;
  const yy = parseInt(yymmdd.substring(0, 2), 10);
  const mm = yymmdd.substring(2, 4);
  const dd = yymmdd.substring(4, 6);
  const currentYear = new Date().getFullYear() % 100;
  const century = yy > currentYear + 10 ? 1900 : 2000;
  const yyyy = century + yy;
  if (isNaN(yy) || parseInt(mm) < 1 || parseInt(mm) > 12) return null;
  return `${yyyy}-${mm}-${dd}`;
}

// ── Code pays ICAO → nom ──────────────────────────────────────────────────────
function countryCodeToName(code) {
  const map = {
    FRA: "🇫🇷 France", MAR: "🇲🇦 Maroc", CIV: "🇨🇮 Côte d'Ivoire",
    DZA: "🇩🇿 Algérie", TUN: "🇹🇳 Tunisie", SEN: "🇸🇳 Sénégal",
    MLI: "🇲🇱 Mali", BFA: "🇧🇫 Burkina Faso", GIN: "🇬🇳 Guinée",
    BEL: "🇧🇪 Belgique", CHE: "🇨🇭 Suisse", ESP: "🇪🇸 Espagne",
    CAN: "🇨🇦 Canada", USA: "🇺🇸 États-Unis", GBR: "🇬🇧 Royaume-Uni",
    DEU: "🇩🇪 Allemagne", ITA: "🇮🇹 Italie", PRT: "🇵🇹 Portugal",
    NLD: "🇳🇱 Pays-Bas", CMR: "🇨🇲 Cameroun", GHA: "🇬🇭 Ghana",
    NGA: "🇳🇬 Nigéria", BEN: "🇧🇯 Bénin", TGO: "🇹🇬 Togo",
    NER: "🇳🇪 Niger", COD: "🇨🇩 RD Congo", GAB: "🇬🇦 Gabon",
    EGY: "🇪🇬 Égypte", LBY: "🇱🇾 Libye", MRT: "🇲🇷 Mauritanie",
  };
  return map[code] || code || null;
}

// ── Détection pays depuis le texte ────────────────────────────────────────────
function detectCountryFromText(upper) {
  if (upper.includes("CÔTE D'IVOIRE") || upper.includes("COTE D'IVOIRE") || upper.includes("CIV") || upper.includes("IVOIRIEN")) return "🇨🇮 Côte d'Ivoire";
  if (upper.includes("MAROC") || upper.includes("MAROCAIN") || upper.includes("ROYAUME DU MAROC") || upper.includes("MAR")) return "🇲🇦 Maroc";
  if (upper.includes("FRANCE") || upper.includes("FRANÇAIS") || upper.includes("REPUBLIQUE FRANCAISE") || upper.includes("FRA")) return "🇫🇷 France";
  if (upper.includes("ALGÉRIE") || upper.includes("ALGERIE") || upper.includes("DZA") || upper.includes("ALGÉRIEN")) return "🇩🇿 Algérie";
  if (upper.includes("TUNISIE") || upper.includes("TUN") || upper.includes("TUNISIEN")) return "🇹🇳 Tunisie";
  if (upper.includes("SÉNÉGAL") || upper.includes("SENEGAL") || upper.includes("SEN")) return "🇸🇳 Sénégal";
  if (upper.includes("BELGIQUE") || upper.includes("BELGE") || upper.includes("BEL")) return "🇧🇪 Belgique";
  if (upper.includes("CANADA") || upper.includes("CAN")) return "🇨🇦 Canada";
  if (upper.includes("ESPAGNE") || upper.includes("SPAIN") || upper.includes("ESP")) return "🇪🇸 Espagne";
  if (upper.includes("MALI") || upper.includes("MLI")) return "🇲🇱 Mali";
  if (upper.includes("BURKINA") || upper.includes("BFA")) return "🇧🇫 Burkina Faso";
  if (upper.includes("GUINÉE") || upper.includes("GUINEE") || upper.includes("GIN")) return "🇬🇳 Guinée";
  if (upper.includes("CAMEROUN") || upper.includes("CMR")) return "🇨🇲 Cameroun";
  if (upper.includes("NIGER") || upper.includes("NER")) return "🇳🇪 Niger";
  if (upper.includes("BÉNIN") || upper.includes("BENIN") || upper.includes("BEN")) return "🇧🇯 Bénin";
  if (upper.includes("TOGO") || upper.includes("TGO")) return "🇹🇬 Togo";
  return null;
}

// ── Normaliser une date extraite ──────────────────────────────────────────────
function normalizeDate(raw) {
  if (!raw) return null;
  const clean = raw.trim().replace(/[\s\.]/g, "/");
  const parts  = clean.split(/[\/\-]/);
  if (parts.length < 3) return null;

  let [d, m, y] = parts;
  // Si l'année vient en premier (format YYYY-MM-DD)
  if (y && y.length === 4 && parseInt(y) > 1900) { [y, m, d] = [d, m, y]; }
  // Complétion année sur 2 chiffres
  if (y && y.length === 2) {
    const yy = parseInt(y, 10);
    y = (yy + 2000 > new Date().getFullYear() + 20) ? `19${y}` : `20${y}`;
  }
  const day   = parseInt(d, 10);
  const month = parseInt(m, 10);
  const year  = parseInt(y, 10);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (year < 1900 || year > 2100) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ── Mettre les mots en majuscule initiale ─────────────────────────────────────
function capitalizeWords(str) {
  if (!str) return null;
  return str
    .toLowerCase()
    .split(/[\s\-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
    .trim() || null;
}

// ── Qualité document : vérifications avant OCR ────────────────────────────────
export async function checkDocumentQuality(dataUrl) {
  return new Promise((resolve) => {
    if (!dataUrl || !dataUrl.startsWith("data:image")) {
      resolve({ ok: false, message: "Format non supporté pour l'analyse. Utilisez JPG ou PNG.", score: 0 });
      return;
    }

    const img = new window.Image();
    img.onload = () => {
      const w = img.width, h = img.height;

      if (w < 300 || h < 150) {
        resolve({ ok: false, message: `Résolution trop faible (${w}×${h}px). Minimum 300×150px requis.`, score: 5 });
        return;
      }

      const canvas = document.createElement("canvas");
      const W = Math.min(w, 200);
      const H = Math.min(h, 200);
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, W, H);
      const data = ctx.getImageData(0, 0, W, H).data;

      let sum = 0, sumSq = 0;
      const n = W * H;
      for (let i = 0; i < data.length; i += 4) {
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        sum   += lum;
        sumSq += lum * lum;
      }
      const mean     = sum / n;
      const variance = sumSq / n - mean * mean;
      const stdDev   = Math.sqrt(variance);

      if (mean < 15)   { resolve({ ok: false, message: "Image trop sombre. Améliorez l'éclairage.", score: 10 }); return; }
      if (mean > 245)  { resolve({ ok: false, message: "Image surexposée / trop blanche. Réduisez la lumière directe.", score: 10 }); return; }
      if (stdDev < 20) { resolve({ ok: false, message: "Image floue ou document non visible. Nettoyez l'objectif et reprenez la photo.", score: 15 }); return; }
      if (variance < 50) { resolve({ ok: false, message: "Document non lisible — image uniforme ou vide détectée.", score: 10 }); return; }

      const ratio = w / h;
      if (ratio < 0.5 || ratio > 4) {
        resolve({ ok: false, message: "Format de l'image suspect. Photographiez uniquement le document.", score: 20 });
        return;
      }

      // Score de qualité
      const qualityScore = Math.min(100, Math.round(
        20 +
        Math.min(40, stdDev * 0.5) +
        Math.min(20, (w / 300) * 5) +
        Math.min(20, (1 - Math.abs(mean - 130) / 130) * 20)
      ));

      resolve({
        ok: qualityScore >= 40,
        message: qualityScore >= 70
          ? `✓ Document de bonne qualité (${w}×${h}px)`
          : qualityScore >= 40
          ? `⚠ Qualité acceptable mais faible — essayez d'améliorer l'éclairage.`
          : `✗ Qualité insuffisante pour l'OCR — reprenez la photo en conditions optimales.`,
        score: qualityScore,
        dimensions: { w, h },
        mean: Math.round(mean),
        stdDev: Math.round(stdDev),
      });
    };
    img.onerror = () => resolve({ ok: false, message: "Image corrompue ou illisible.", score: 0 });
    img.src = dataUrl;
  });
}
