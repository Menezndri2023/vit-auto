/* ══════════════════════════════════════════════════════════════
   VIT AUTO — MOTEUR DE VALIDATION IDENTITÉ v2.0
   • Checksums algorithmiques (ICAO passeport, CIN Tunisie, Algérie)
   • Validation préfixes opérateurs téléphone par pays
   • Détection pièces expirées + alerte bientôt expirées
   • Détection fraude : blacklist, patterns, répétitions
   • Analyse image document (variance pixels, dimensions)
   ══════════════════════════════════════════════════════════════ */

// ── Normalisation ─────────────────────────────────────────────────────────────
export const normalizeDoc = (s) =>
  String(s).replace(/\s+/g, "").replace(/-+/g, "-").toUpperCase().trim();

// ═════════════════════════════════════════════════════════════════════════════
// 1. ALGORITHMES CHECKSUMS
// ═════════════════════════════════════════════════════════════════════════════

// ICAO 9303 — Algorithme officiel pour documents de voyage (passeports, visas)
const ICAO_VALUES = {
  '0':0,'1':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,
  'A':10,'B':11,'C':12,'D':13,'E':14,'F':15,'G':16,'H':17,'I':18,
  'J':19,'K':20,'L':21,'M':22,'N':23,'O':24,'P':25,'Q':26,'R':27,
  'S':28,'T':29,'U':30,'V':31,'W':32,'X':33,'Y':34,'Z':35,'<':0,
};
const ICAO_WEIGHTS = [7, 3, 1];

function icaoCheckDigit(str) {
  let sum = 0;
  for (let i = 0; i < str.length; i++) {
    const v = ICAO_VALUES[str[i].toUpperCase()];
    if (v === undefined) return -1; // caractère invalide
    sum += v * ICAO_WEIGHTS[i % 3];
  }
  return sum % 10;
}

// Valide le chiffre de contrôle ICAO (dernier caractère = check digit)
function checkIcaoPassport(n) {
  if (n.length < 8) return null; // pas applicable
  const data      = n.slice(0, -1);
  const claimed   = parseInt(n.slice(-1), 10);
  if (isNaN(claimed)) return null;
  const computed  = icaoCheckDigit(data);
  return computed === claimed;
}

// CIN Tunisie — Algorithme chiffre de contrôle
// Pondération positions 1-7 : [2,3,4,5,6,7,8], somme mod 11
function checkTunisiaCIN(n) {
  if (!/^\d{8}$/.test(n)) return null;
  const digits  = n.split("").map(Number);
  const weights = [2, 3, 4, 5, 6, 7, 8];
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += digits[i] * weights[i];
  const remainder = sum % 11;
  const expected  = remainder === 0 ? 0 : 11 - remainder;
  if (expected >= 10) return null; // cas spécial, on accepte
  return digits[7] === expected;
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. DÉTECTION FRAUDE / NUMÉROS FICTIFS
// ═════════════════════════════════════════════════════════════════════════════

const BLOCKED_NUMBERS = new Set([
  // Répétitions
  "000000","111111","222222","333333","444444","555555",
  "666666","777777","888888","999999",
  "0000000","1111111","2222222","3333333","4444444",
  "00000000","11111111","22222222","33333333","44444444",
  "000000000","111111111","999999999",
  "0000000000","1111111111",
  "000000000000","111111111111","123456789012",
  // Séquentiels classiques
  "123456","654321","123123","112233",
  "1234567","7654321","12345678","87654321",
  "123456789","987654321",
  // Alpha faux
  "AAAAAA","BBBBBB","CCCCCC","ABCDEF","FEDCBA",
  "ABCABC","XYZXYZ","AAABBB","ABABAB",
  // Tests connus
  "TEST01","TEST12","TEST00","FAKE01","FAKE00",
  "ADMIN1","ADMIN0","NULL00","NONE00",
  // Passeports faux courants
  "AB000000","AA000000","ZZ999999","AB123456","AB000001",
  "A0000000","B0000000","X0000000",
  // CI faux
  "CI00000000","CI12345678","CI00000001",
  // Numéros de démo / exemples
  "000001","100000","999998","999999",
]);

const SUSPICIOUS_PATTERNS = [
  { re: /^(.)\1{5,}$/,           msg: "Numéro composé du même caractère répété — invalide." },
  { re: /^(0123|1234|2345|3456|4567|5678|6789)/,  msg: "Séquence numérique croissante détectée — invalide." },
  { re: /^(9876|8765|7654|6543|5432|4321|3210)/,  msg: "Séquence numérique décroissante détectée — invalide." },
  { re: /^(ABCD|BCDE|CDEF|DEFG|EFGH|FGHI|GHIJ)/i, msg: "Séquence alphabétique détectée — invalide." },
  { re: /^(TEST|FAKE|NULL|NONE|XXXX|YYYY|ZZZZ|DEMO|EXAM)/i, msg: "Numéro de test ou fictif détecté." },
  { re: /^[A-Z]{0,3}0{7,}$/,    msg: "Numéro composé uniquement de zéros — invalide." },
  { re: /^(.{2})\1{3,}$/,        msg: "Motif répété détecté — numéro suspect." },
];

function detectFraud(n) {
  if (BLOCKED_NUMBERS.has(n)) {
    return { fraud: true, reason: "Numéro figurant dans la liste de documents invalides/fictifs connus." };
  }
  for (const { re, msg } of SUSPICIOUS_PATTERNS) {
    if (re.test(n)) return { fraud: true, reason: msg };
  }
  // Tous les caractères identiques (Set de taille 1 sur chaîne 4+)
  if (n.length >= 4 && new Set(n.replace(/-/g, "")).size === 1) {
    return { fraud: true, reason: "Numéro composé d'un seul caractère — invalide." };
  }
  return { fraud: false };
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. RÈGLES PAR PAYS / TYPE DE DOCUMENT
// ═════════════════════════════════════════════════════════════════════════════

// Séries de préfixes CIN Maroc reconnues
const MAROC_CIN_PREFIXES = new Set([
  "A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y",
  "AA","AB","AC","AD","AE","AF","AG","AH","AI","AJ","AK","AL","AM","AN","AO","AP","AQ","AR","AS","AT","AU","AV","AW","AX","AY",
  "BA","BB","BC","BD","BE","BJ","BK","BL","BM","BN","BO","BP","BQ","BR","BS","BT","BU","BV",
  "CD","CE","CF","CG","CH",
  "DA","DB","DC","DD","DE","DF",
  "EA","EB","EC","ED","EE","EF",
  "FA","FB","FC",
  "GA","GB","GC","GK",
  "HA","HB","HC","HD",
  "IA","IB","IC",
  "JA","JB","JC","JD","JE","JH","JK","JM","JT","JY",
  "KA","KB","KC",
  "LA","LB","LC","LD",
  "MA","MB","MC","MD",
  "NA","NB","NC",
  "OA","OB","OC",
  "PA","PB","PC",
  "QA","QB","QC",
  "RA","RB","RC","RD",
  "SA","SB","SC","SD","SH",
  "TA","TB","TC","TD","TK",
  "UA","UB","UC",
  "VA","VB","VC",
  "WA","WB","WC",
  "XA","XB","XC",
  "YA","YB","YC",
  "ZA","ZB","ZC",
]);

function validateMarocCIN(n) {
  const m = n.match(/^([A-Z]{1,2})(\d{5,7})$/);
  if (!m) return null;
  const [, series, digits] = m;
  if (!MAROC_CIN_PREFIXES.has(series)) {
    return { status: "error", message: `Série "${series}" inconnue pour une CIN marocaine. Vérifiez le numéro ou le type de document.` };
  }
  if (parseInt(digits, 10) === 0) {
    return { status: "error", message: "Partie numérique nulle — numéro invalide." };
  }
  return { status: "valid", message: `✓ CIN Maroc — Série ${series} reconnue`, country: "🇲🇦 Maroc" };
}

function validateFranceCNI(n) {
  // Nouveau format depuis août 2021 : 9 chiffres
  if (/^\d{9}$/.test(n)) {
    return { status: "valid", message: "✓ CNI France (nouveau format 2021, 9 chiffres)", country: "🇫🇷 France" };
  }
  // Ancien format : 12 chiffres — AAMMDDNNNKKK
  if (/^\d{12}$/.test(n)) {
    const month = parseInt(n.substring(2, 4), 10);
    if (month < 1 || month > 12) {
      return { status: "error", message: `CNI France invalide — mois "${month}" impossible dans le numéro.` };
    }
    return { status: "valid", message: "✓ CNI France (ancien format 12 chiffres)", country: "🇫🇷 France" };
  }
  return null;
}

function validateCotedIvoireCNI(n) {
  if (/^CI[-]?\d{8,10}$/.test(n)) {
    const digits = n.replace(/^CI-?/, "");
    if (/^0+$/.test(digits)) {
      return { status: "error", message: "CNI ivoirienne invalide — partie numérique nulle." };
    }
    return { status: "valid", message: "✓ CNI Côte d'Ivoire (format CI-XXXXXXXX)", country: "🇨🇮 Côte d'Ivoire" };
  }
  if (/^\d{9,12}$/.test(n)) {
    if (/^0+$/.test(n)) return { status: "error", message: "Numéro invalide — uniquement des zéros." };
    return { status: "valid", message: "✓ CNI Côte d'Ivoire (format numérique)", country: "🇨🇮 Côte d'Ivoire" };
  }
  return null;
}

// Algérie — 18 chiffres : les 8 premiers encodent la date AAAAMMJJ
function validateAlgerieCNI(n) {
  if (!/^\d{18}$/.test(n)) return null;
  const year  = parseInt(n.substring(0, 4), 10);
  const month = parseInt(n.substring(4, 6), 10);
  const day   = parseInt(n.substring(6, 8), 10);
  const now   = new Date().getFullYear();
  if (year < 1920 || year > now - 10) {
    return { status: "error", message: `Année de naissance encodée invalide (${year}) — vérifiez votre numéro.` };
  }
  if (month < 1 || month > 12) {
    return { status: "error", message: `Mois de naissance encodé invalide (${month}) dans le numéro algérien.` };
  }
  if (day < 1 || day > 31) {
    return { status: "error", message: `Jour de naissance encodé invalide (${day}) dans le numéro algérien.` };
  }
  return { status: "valid", message: `✓ CNI Algérie — Né(e) le ${String(day).padStart(2,"0")}/${String(month).padStart(2,"0")}/${year}`, country: "🇩🇿 Algérie" };
}

// Tunisie — 8 chiffres avec chiffre de contrôle algorithmique
function validateTunisieCNI(n) {
  if (!/^\d{8}$/.test(n)) return null;
  const checkResult = checkTunisiaCIN(n);
  if (checkResult === false) {
    const digits  = n.split("").map(Number);
    const weights = [2, 3, 4, 5, 6, 7, 8];
    let sum = 0;
    for (let i = 0; i < 7; i++) sum += digits[i] * weights[i];
    const expected = (11 - (sum % 11)) % 11;
    return {
      status: "error",
      message: `CIN Tunisie invalide — chiffre de contrôle incorrect (attendu: ${expected}, trouvé: ${digits[7]}). Vérifiez le numéro.`,
    };
  }
  return { status: "valid", message: "✓ CIN Tunisie (algorithme de contrôle validé)", country: "🇹🇳 Tunisie" };
}

function validateAfriqueOuest(n) {
  // Sénégal — NINA : 13 chiffres
  if (/^\d{13}$/.test(n)) {
    return { status: "valid", message: "✓ NINA Sénégal (13 chiffres)", country: "🇸🇳 Sénégal" };
  }
  // Sénégal / Afrique de l'Ouest — numérique 10-12 chiffres
  if (/^\d{10,12}$/.test(n)) {
    return { status: "valid", message: "✓ CNI Sénégal / format Afrique de l'Ouest", country: "🇸🇳 Sénégal" };
  }
  // Mali, Burkina Faso, Guinée, Bénin, Togo, Niger — 1-2 LETTRES en tête + 6-12 chiffres
  // ⚠ Maximum 2 lettres de préfixe — 3 lettres+ = format non reconnu
  if (/^[A-Z]{1,2}\d{6,12}$/i.test(n)) {
    return { status: "valid", message: "✓ Document Afrique de l'Ouest — format reconnu", country: "🌍 Afrique de l'Ouest" };
  }
  return null;
}

// ── Passeport ─────────────────────────────────────────────
// Formats acceptés :
//   Maroc / Afrique Nord       : 1 lettre + 6–8 chiffres     (ex: A1234567)
//   ICAO avec contrôle         : 2 lettres + 8 chiffres       (ex: AB12345678)
//   ICAO standard              : 2 lettres + 6–7 chiffres     (ex: AB123456)
//   France                     : 9 chiffres purs              (ex: 123456789)
//   CI / Afrique subsaharienne : 1-3 chiffres + 1-3 lettres + 4-7 chiffres (ex: 25AD30067)
//   Format mixte africain      : 1-2 lettres + 1-3 chiffres + 1-2 lettres + 4-7 chiffres
function validatePassport(n) {
  // Maroc / Afrique du Nord : 1 lettre + 6–8 chiffres
  if (/^[A-Z]\d{6,8}$/.test(n)) {
    return { status: "valid", message: "✓ Passeport Maroc / Afrique du Nord", country: "🇲🇦 Maroc" };
  }
  // ICAO avec chiffre de contrôle : 2 lettres + 8 chiffres (dernier = check digit)
  if (/^[A-Z]{2}\d{8}$/.test(n)) {
    const checkOk = checkIcaoPassport(n);
    if (checkOk === false) {
      return {
        status: "error",
        message: "❌ Chiffre de contrôle OACI invalide. Retranscrivez le numéro exactement tel qu'il apparaît sur votre passeport.",
      };
    }
    return { status: "valid", message: "✓ Passeport ICAO (chiffre de contrôle validé)", country: "🌍 International" };
  }
  // ICAO standard : 2 lettres + 6 ou 7 chiffres
  if (/^[A-Z]{2}\d{6,7}$/.test(n)) {
    return { status: "valid", message: "✓ Passeport international ICAO", country: "🌍 International" };
  }
  // France : 9 chiffres exactement
  if (/^\d{9}$/.test(n)) {
    return { status: "valid", message: "✓ Passeport France (9 chiffres)", country: "🇫🇷 France" };
  }
  // Côte d'Ivoire biométrique & Afrique subsaharienne : chiffres + lettres + chiffres
  // Ex: 25AD30067 (CI), 1AB12345 (Cameroun), 23BC4567 (Gabon), 2A123456 (Bénin)
  if (/^\d{1,3}[A-Z]{1,3}\d{4,7}$/.test(n)) {
    return { status: "valid", message: "✓ Passeport Afrique subsaharienne (format alphanumérique)", country: "🌍 Afrique" };
  }
  // Format mixte : lettres + chiffres + lettres + chiffres (certains passeports africains)
  // Ex: A12B3456, AB1C12345
  if (/^[A-Z]{1,2}\d{1,3}[A-Z]{1,2}\d{4,7}$/.test(n)) {
    return { status: "valid", message: "✓ Passeport format alphanumérique mixte", country: "🌍 International" };
  }
  // Aucun autre format accepté
  return {
    status: "error",
    message: "Format de passeport non reconnu. Formats valides : Maroc A1234567 | ICAO AB1234567 | France 9 chiffres | CI/Afrique 25AD30067.",
  };
}

// ── Permis de conduire ────────────────────────────────────
// Formats acceptés :
//   Maroc                 : séries CIN marocaines + chiffres (ex: AB123456)
//   France                : 10–12 chiffres purs, dept 01–99 (ex: 010012345678)
//   Côte d'Ivoire / AOuest: lettres en tête + chiffres (ex: ABCD12345678)
// ⚠ "20AD3006" (chiffres+lettres+chiffres) = refusé dans tous les cas
function validatePermis(n) {
  // Maroc — même structure que CIN
  const marocResult = validateMarocCIN(n);
  if (marocResult) {
    return { ...marocResult, message: marocResult.message.replace("CIN Maroc", "Permis Maroc") };
  }
  // France — chiffres UNIQUEMENT, 10–12 caractères, département 01-99
  if (/^\d{10,12}$/.test(n)) {
    const dept = parseInt(n.substring(0, 2), 10);
    if (dept < 1 || dept > 99) {
      return { status: "error", message: `Permis France invalide — code département "${n.substring(0,2)}" incorrect (01–99 attendu).` };
    }
    return { status: "valid", message: `✓ Permis France (département ${String(dept).padStart(2,"0")})`, country: "🇫🇷 France" };
  }
  // Côte d'Ivoire / Afrique de l'Ouest — 1-2 LETTRES en tête puis chiffres, 8–16 chars
  if (/^[A-Z]{1,2}\d{6,14}$/i.test(n)) {
    return { status: "valid", message: "✓ Permis de conduire Côte d'Ivoire / Afrique de l'Ouest", country: "🌍 Afrique de l'Ouest" };
  }
  return {
    status: "error",
    message: "Format de permis non reconnu. Maroc : AB123456 | France : 12 chiffres | CI/AOuest : lettres puis chiffres.",
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. DATE D'EXPIRATION
// ═════════════════════════════════════════════════════════════════════════════

export function validateExpiryDate(dateStr) {
  if (!dateStr) return { ok: null, message: "" };

  const expiry = new Date(dateStr);
  if (isNaN(expiry.getTime())) return { ok: false, message: "Date d'expiration invalide." };

  const minDate = new Date("1990-01-01");
  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() + 20);

  if (expiry < minDate) return { ok: false, message: "Date d'expiration impossible — trop ancienne." };
  if (expiry > maxDate) return { ok: false, message: "Date d'expiration impossible — trop éloignée." };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (expiry < today) {
    const diffDays   = Math.floor((today - expiry) / 86400000);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears  = Math.floor(diffDays / 365);
    const ago =
      diffYears >= 2  ? `il y a ${diffYears} ans` :
      diffYears === 1 ? "il y a 1 an" :
      diffMonths >= 2 ? `il y a ${diffMonths} mois` :
      diffMonths === 1 ? "il y a 1 mois" :
      diffDays === 1  ? "hier" :
      `il y a ${diffDays} jour${diffDays > 1 ? "s" : ""}`;

    return {
      ok: false,
      expired: true,
      message: `🚫 DOCUMENT EXPIRÉ (${ago}) — Vous devez utiliser une pièce d'identité en cours de validité.`,
    };
  }

  // Alerte < 3 mois avant expiration
  const in3Months = new Date();
  in3Months.setMonth(in3Months.getMonth() + 3);
  if (expiry < in3Months) {
    const diffDays = Math.floor((expiry - today) / 86400000);
    return {
      ok: true,
      soonExpired: true,
      message: `⚠️ Document expire dans ${diffDays} jour${diffDays > 1 ? "s" : ""} — accepté mais à renouveler rapidement.`,
    };
  }

  return {
    ok: true,
    message: `✓ Valide jusqu'au ${expiry.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}`,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. FONCTION PRINCIPALE validateIdentityDocument
// ═════════════════════════════════════════════════════════════════════════════

export function validateIdentityDocument(type, rawNumber) {
  const n = normalizeDoc(rawNumber);
  if (!n) return { status: "empty", message: "", confidence: 0 };

  // Longueurs limites
  if (n.replace(/-/g, "").length < 5) {
    return { status: "error", message: "Numéro trop court — minimum 5 caractères.", confidence: 0 };
  }
  if (n.length > 25) {
    return { status: "error", message: "Numéro trop long — maximum 25 caractères.", confidence: 0 };
  }

  // Détection fraude
  const fraud = detectFraud(n.replace(/-/g, ""));
  if (fraud.fraud) {
    return { status: "error", message: `❌ ${fraud.reason}`, confidence: 0, fraud: true };
  }

  // Validation par type
  let result = null;

  if (type === "cni") {
    result =
      validateMarocCIN(n) ||
      validateFranceCNI(n) ||
      validateCotedIvoireCNI(n) ||
      validateAlgerieCNI(n) ||
      validateTunisieCNI(n) ||
      validateAfriqueOuest(n);

    if (!result) {
      return {
        status: "error",
        message: "Format de CNI non reconnu. Vérifiez le numéro ou sélectionnez le bon type de document.",
        confidence: 0,
      };
    }
  }

  if (type === "passport") {
    result = validatePassport(n);
    if (!result) {
      return {
        status: "error",
        message: "Format de passeport non reconnu. Format attendu : 1-2 lettres + 7-8 chiffres.",
        confidence: 0,
      };
    }
  }

  if (type === "permis") {
    result = validatePermis(n);
    if (!result) {
      return {
        status: "error",
        message: "Format de permis non reconnu. Vérifiez votre numéro de permis.",
        confidence: 0,
      };
    }
  }

  return { ...result, confidence: result?.status === "valid" ? 90 : 0 };
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. AUTO-DÉTECTION DU TYPE DE DOCUMENT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Tente de deviner le type de document (cni / passport / permis) et le pays
 * depuis le numéro brut saisi par l'utilisateur.
 * Retourne null si le numéro est trop court ou ambigu.
 *
 * Règles strictes — aucun catchall alphanumérique général :
 *   un numéro "20AD3006" (chiffres + lettres + chiffres) ne doit correspondre à rien.
 */
export function autoDetectDocumentType(raw) {
  const n = normalizeDoc(raw);
  if (!n || n.replace(/-/g, "").length < 4) return null;

  // ── 1. CNI Côte d'Ivoire : préfixe CI + 8-10 chiffres ── EN PRIORITÉ avant ICAO
  //    "CI" serait sinon détecté comme passeport ICAO (2 lettres + chiffres)
  if (/^CI[-]?\d{8,10}$/.test(n)) {
    return { type: "cni", country: "🇨🇮 Côte d'Ivoire", confidence: 98 };
  }

  // ── 2. CIN Maroc : préfixe série connu + 5-7 chiffres  (ex: B123456, AB78901) ─
  //    (testé avant passeport Maroc car série 1-lettre + ≤6 chiffres = CIN)
  const mMaroc = n.match(/^([A-Z]{1,2})(\d{5,6})$/);
  if (mMaroc && MAROC_CIN_PREFIXES.has(mMaroc[1])) {
    return { type: "cni", country: "🇲🇦 Maroc", confidence: 96 };
  }

  // ── 3. Passeport Maroc / Afrique du Nord : 1 lettre + 7-8 chiffres ───────────
  //    (7-8 chiffres distincte la série CIN qui a 5-6 chiffres)
  if (/^[A-Z]\d{7,8}$/.test(n)) {
    return { type: "passport", country: "🇲🇦 Maroc", confidence: 92 };
  }

  // ── 4. Passeport ICAO : 2 lettres + 6-8 chiffres ─────────────────────────────
  if (/^[A-Z]{2}\d{6,8}$/.test(n)) {
    return { type: "passport", country: "🌍 International", confidence: 92 };
  }

  // ── 5. Algérie : 18 chiffres ─────────────────────────────────────────────────
  if (/^\d{18}$/.test(n)) {
    return { type: "cni", country: "🇩🇿 Algérie", confidence: 95 };
  }

  // ── 6. Permis France : chiffres UNIQUEMENT, 10-12 chars, dept 01-99 ──────────
  //    ⚠ "20AD3006" (8 chars + lettres mélangées) ne correspond PAS à cette règle
  if (/^\d{10,12}$/.test(n)) {
    const dept = parseInt(n.substring(0, 2), 10);
    if (dept >= 1 && dept <= 99) {
      return { type: "permis", country: "🇫🇷 France", confidence: 80 };
    }
  }

  // ── 7. France CNI 9 chiffres (ambigu avec passeport France) ─────────────────
  if (/^\d{9}$/.test(n)) {
    return { type: "cni", country: "🇫🇷 France", confidence: 60 };
  }

  // ── 8. Tunisie CNI : 8 chiffres ─────────────────────────────────────────────
  if (/^\d{8}$/.test(n)) {
    return { type: "cni", country: "🇹🇳 Tunisie", confidence: 70 };
  }

  // ── 9. Sénégal / Afrique de l'Ouest numérique : 13 chiffres (NINA) ──────────
  if (/^\d{13}$/.test(n)) {
    return { type: "cni", country: "🇸🇳 Sénégal", confidence: 85 };
  }

  // ── 10. Passeport Afrique à préfixe numérique (CI 25AD30067, Cameroun, Gabon…) ─
  //      Format : 1-3 chiffres + 1-3 lettres + 4-7 chiffres
  //      ⚠ Testé AVANT le catchall CNI Afrique de l'Ouest
  if (/^\d{1,3}[A-Z]{1,3}\d{4,7}$/.test(n)) {
    return { type: "passport", country: "🌍 Afrique", confidence: 80 };
  }

  // ── 11. Format passeport mixte (lettres+chiffres+lettres+chiffres) ────────────
  if (/^[A-Z]{1,2}\d{1,3}[A-Z]{1,2}\d{4,7}$/.test(n)) {
    return { type: "passport", country: "🌍 International", confidence: 70 };
  }

  // ── 12. Afrique de l'Ouest alphanum — DOIT commencer par 1-2 LETTRES ─────────
  //      "S1234567890" → valide | "COO33493119" → REFUSÉ (3 lettres = non reconnu)
  if (/^[A-Z]{1,2}\d{6,12}$/i.test(n)) {
    return { type: "cni", country: "🌍 Afrique de l'Ouest", confidence: 60 };
  }

  return null;
}

// ═════════════════════════════════════════════════════════════════════════════
// 7. VALIDATION TÉLÉPHONE — Préfixes opérateurs par pays
// ═════════════════════════════════════════════════════════════════════════════

const OPERATORS = {
  "+225": {  // Côte d'Ivoire
    flag: "🇨🇮", name: "Côte d'Ivoire", length: [8, 10],
    prefixes: {
      "05":"MTN","07":"MTN","25":"Orange","47":"Orange","67":"Orange",
      "01":"Moov","27":"Moov","77":"Wave","57":"Wave","87":"Wave",
    },
  },
  "+212": {  // Maroc
    flag: "🇲🇦", name: "Maroc", length: [9, 9],
    prefixes: { "06":"IAM/Maroc Telecom","07":"Orange Maroc","05":"IAM" },
  },
  "+221": {  // Sénégal
    flag: "🇸🇳", name: "Sénégal", length: [9, 9],
    prefixes: { "70":"Orange","75":"Free SN","76":"Expresso","77":"Orange","78":"Orange" },
  },
  "+33": {   // France
    flag: "🇫🇷", name: "France", length: [9, 9],
    prefixes: { "06":"Mobile FR","07":"Mobile FR" },
  },
  "+32": {   // Belgique
    flag: "🇧🇪", name: "Belgique", length: [9, 9],
    prefixes: { "04":"Mobile BE" },
  },
  "+41": {   // Suisse
    flag: "🇨🇭", name: "Suisse", length: [9, 9],
    prefixes: { "07":"Mobile CH","06":"Mobile CH" },
  },
  "+34": {   // Espagne
    flag: "🇪🇸", name: "Espagne", length: [9, 9],
    prefixes: { "06":"Mobile ES","07":"Mobile ES" },
  },
  "+213": {  // Algérie
    flag: "🇩🇿", name: "Algérie", length: [9, 9],
    prefixes: { "05":"Mobilis","06":"Djezzy","07":"Ooredoo" },
  },
  "+216": {  // Tunisie
    flag: "🇹🇳", name: "Tunisie", length: [8, 8],
    prefixes: { "20":"TT","21":"TT","22":"TT","23":"TT","24":"TT","25":"TT","26":"TT","27":"TT","28":"TT","29":"TT","50":"Ooredoo","55":"Orange","99":"Orange","90":"Ooredoo" },
  },
  "+223": {  // Mali
    flag: "🇲🇱", name: "Mali", length: [8, 8],
    prefixes: { "65":"Orange","66":"Orange","70":"Moov","71":"Moov","72":"Orange","79":"MTN" },
  },
  "+226": {  // Burkina Faso
    flag: "🇧🇫", name: "Burkina Faso", length: [8, 8],
    prefixes: { "60":"Orange","61":"Orange","70":"Telecel","71":"Telecel","75":"Orange" },
  },
  "+224": {  // Guinée
    flag: "🇬🇳", name: "Guinée", length: [9, 9],
    prefixes: { "62":"Orange","64":"MTN","65":"MTN","66":"MTN" },
  },
  "+44": {   // UK
    flag: "🇬🇧", name: "Royaume-Uni", length: [10, 10],
    prefixes: { "07":"Mobile UK" },
  },
  "+1": {    // USA / Canada
    flag: "🇺🇸", name: "USA/Canada", length: [10, 10],
    prefixes: null, // trop variable
  },
};

// Numéros de téléphone évidemment faux
const FAKE_PHONE_BODIES = new Set([
  "0000000","1111111","2222222","3333333","4444444",
  "00000000","11111111","22222222","12345678","87654321",
  "000000000","111111111","123456789","987654321",
]);

export function validatePhoneNumber(raw) {
  const p = raw.replace(/[\s\-().]/g, "");
  if (!p) return { ok: false, message: "Numéro de téléphone requis." };

  // Détecter patterns évidemment faux
  const body = p.replace(/^\+\d{1,3}/, "").replace(/^0/, "");
  if (FAKE_PHONE_BODIES.has(body)) {
    return { ok: false, fraud: true, message: "❌ Numéro fictif détecté — veuillez saisir votre vrai numéro de téléphone." };
  }
  if (/^(.)\1{6,}$/.test(body)) {
    return { ok: false, fraud: true, message: "❌ Numéro composé du même chiffre répété — invalide." };
  }
  if (/^(0123456|1234567|2345678|3456789|9876543|8765432)/.test(body)) {
    return { ok: false, fraud: true, message: "❌ Séquence numérique consécutive détectée — numéro invalide." };
  }

  // Format international
  if (p.startsWith("+")) {
    const allDigits = p.slice(1).replace(/\D/g, "");
    if (allDigits.length < 7 || allDigits.length > 15) {
      return { ok: false, message: "Longueur invalide pour un numéro international (7–15 chiffres attendus)." };
    }

    for (const [prefix, info] of Object.entries(OPERATORS)) {
      if (!p.startsWith(prefix)) continue;

      const localPart = p.slice(prefix.length).replace(/^0/, "");
      const localLen  = localPart.length;
      const [minL, maxL] = info.length;

      if (localLen < minL || localLen > maxL) {
        return {
          ok: false,
          message: `Numéro ${info.flag} ${info.name} invalide — ${localLen} chiffres locaux trouvés, ${minL === maxL ? minL : `${minL}–${maxL}`} attendus.`,
        };
      }

      if (info.prefixes) {
        const twoDigit = localPart.substring(0, 2);
        const oneDigit = localPart.substring(0, 1);
        const matched  = info.prefixes[twoDigit] || info.prefixes[oneDigit];
        if (!matched) {
          const validList = [...new Set(Object.keys(info.prefixes).map((k) => k))].slice(0, 6).join(", ");
          return {
            ok: false,
            message: `Préfixe opérateur "${twoDigit}" invalide pour ${info.flag} ${info.name}. Préfixes valides : ${validList}…`,
          };
        }
        return { ok: true, message: `✓ ${info.flag} ${info.name} — ${matched}`, country: info.name };
      }

      return { ok: true, message: `✓ ${info.flag} ${info.name}`, country: info.name };
    }

    return { ok: true, message: "✓ Numéro international reconnu" };
  }

  // Format local (0 + numéro)
  if (p.startsWith("0")) {
    const digits = p.slice(1).replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 10) {
      return { ok: false, message: "Numéro local invalide — entre 8 et 11 chiffres (avec le 0) attendus." };
    }
    return {
      ok: true,
      warning: true,
      message: "⚠ Numéro local — ajoutez l'indicatif pays (+225, +212, +33…) pour une validation précise.",
    };
  }

  return { ok: false, message: "Format invalide. Commencez par + (ex: +225 07 00 00 00) ou 0." };
}

// ═════════════════════════════════════════════════════════════════════════════
// 6b. EXTRACTION DES DONNÉES ENCODÉES DANS LE NUMÉRO
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Extrait les métadonnées lisibles depuis un numéro de document.
 * Détecte automatiquement le pays, le type, et toute donnée encodée
 * (date de naissance pour le NIN algérien, etc.).
 */
export function extractDocumentData(type, rawNumber) {
  const n = normalizeDoc(rawNumber);
  const clean = n.replace(/-/g, "");
  if (!clean || clean.length < 5) return null;

  const fraud = detectFraud(clean);
  const detected = autoDetectDocumentType(n);

  let country = detected?.country || null;
  let detectedType = detected?.type || type;
  let confidence = detected?.confidence || 0;
  let birthDate = null;
  let details = [];
  let isAmbiguous = false;

  // ── NIN Algérie : 18 chiffres = YYYYMMDD + wilaya + commune + seq + check ─
  if (/^\d{18}$/.test(clean)) {
    const y = parseInt(clean.substring(0, 4), 10);
    const m = parseInt(clean.substring(4, 6), 10);
    const d = parseInt(clean.substring(6, 8), 10);
    const now = new Date().getFullYear();
    if (y >= 1900 && y <= now - 10 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      birthDate = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      details.push(`Né(e) le ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`);
      country = "🇩🇿 Algérie";
      confidence = 96;
    }
  }

  // ── CNI France ancien format : 12 chiffres = AAMMDD + dept + seq + clé ───
  if (/^\d{12}$/.test(clean) && !birthDate) {
    const mo = parseInt(clean.substring(2, 4), 10);
    const da = parseInt(clean.substring(4, 6), 10);
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      details.push(`Mois/jour encodés : ${String(da).padStart(2,"0")}/${String(mo).padStart(2,"0")}`);
    }
    country = "🇫🇷 France";
    confidence = Math.max(confidence, 85);
  }

  // ── Tunisie 8 chiffres — pas de date encodée ──────────────────────────────

  // ── Maroc CIN — pas de date encodée ──────────────────────────────────────

  // ── Côte d'Ivoire CNI — pas de date encodée ──────────────────────────────

  // Ambiguïté : 9 chiffres = CNI France OU Passeport France
  if (/^\d{9}$/.test(clean)) {
    isAmbiguous = true;
    details.push("9 chiffres — pourrait être CNI ou Passeport France");
    country = "🇫🇷 France";
  }

  return {
    country,
    detectedType,
    confidence,
    birthDate,
    details,
    isAmbiguous,
    isFraud: fraud.fraud,
    fraudReason: fraud.reason,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 7. ANALYSE IMAGE DOCUMENT (Canvas — détection image vide / monochromatique)
// ═════════════════════════════════════════════════════════════════════════════

export function analyzeDocumentImage(dataUrl) {
  return new Promise((resolve) => {
    if (!dataUrl || !dataUrl.startsWith("data:image")) {
      resolve({ ok: true, skipped: true, message: "PDF — analyse visuelle non disponible." });
      return;
    }

    const img = new window.Image();

    img.onload = () => {
      if (img.width < 200 || img.height < 100) {
        resolve({ ok: false, message: `Image trop petite (${img.width}×${img.height}px) — minimum 200×100 px requis.` });
        return;
      }

      const ratio = img.width / img.height;
      if (ratio < 0.3 || ratio > 6) {
        resolve({ ok: false, message: "Dimensions suspectes — vérifiez que l'image est bien une pièce d'identité." });
        return;
      }

      const canvas = document.createElement("canvas");
      const W = Math.min(img.width, 120);
      const H = Math.min(img.height, 120);
      canvas.width  = W;
      canvas.height = H;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, W, H);
      const data = ctx.getImageData(0, 0, W, H).data;

      let sum = 0, sumSq = 0;
      const nPx = W * H;
      for (let i = 0; i < data.length; i += 4) {
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        sum   += lum;
        sumSq += lum * lum;
      }
      const mean     = sum / nPx;
      const variance = sumSq / nPx - mean * mean;

      if (variance < 60) {
        resolve({ ok: false, message: "Image trop uniforme (vide, unie ou mono-couleur) — photographiez votre document réel sous bonne lumière." });
        return;
      }
      if (mean < 12) {
        resolve({ ok: false, message: "Image trop sombre — assurez-vous d'avoir un bon éclairage." });
        return;
      }
      if (mean > 245) {
        resolve({ ok: false, message: "Image surexposée / trop blanche — réajustez l'éclairage ou la mise au point." });
        return;
      }

      resolve({
        ok: true,
        message: `✓ Image de document valide (${img.width}×${img.height}px)`,
        dimensions: { w: img.width, h: img.height },
        variance: Math.round(variance),
      });
    };

    img.onerror = () => resolve({ ok: false, message: "Image illisible ou corrompue." });
    img.src = dataUrl;
  });
}
