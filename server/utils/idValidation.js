/* ══════════════════════════════════════════════════════════════
   VIT AUTO — MOTEUR DE VALIDATION IDENTITÉ (SERVER-SIDE)
   Même logique que le frontend — double-check indépendant
   ══════════════════════════════════════════════════════════════ */

const normalizeDoc = (s) =>
  String(s).replace(/\s+/g, "").replace(/-+/g, "-").toUpperCase().trim();

// ── Checksums ─────────────────────────────────────────────────────────────────

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
    if (v === undefined) return -1;
    sum += v * ICAO_WEIGHTS[i % 3];
  }
  return sum % 10;
}

function checkIcaoPassport(n) {
  if (n.length < 8) return null;
  const claimed = parseInt(n.slice(-1), 10);
  if (isNaN(claimed)) return null;
  return icaoCheckDigit(n.slice(0, -1)) === claimed;
}

function checkTunisiaCIN(n) {
  if (!/^\d{8}$/.test(n)) return null;
  const d = n.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += d[i] * [2,3,4,5,6,7,8][i];
  const rem = sum % 11;
  const exp = rem === 0 ? 0 : 11 - rem;
  if (exp >= 10) return null;
  return d[7] === exp;
}

// ── Fraude ────────────────────────────────────────────────────────────────────

const BLOCKED = new Set([
  "000000","111111","222222","333333","444444","555555",
  "666666","777777","888888","999999","123456","654321",
  "0000000","1111111","2222222","12345678","87654321",
  "000000000","111111111","123456789","987654321",
  "000000000000","123456789012",
  "AAAAAA","ABCDEF","FEDCBA","TEST01","FAKE01","ADMIN1",
  "AB000000","AA000000","ZZ999999","CI00000000","CI12345678",
]);

const SUSPICIOUS = [
  /^(.)\1{5,}$/,
  /^(0123|1234|2345|3456|4567|5678|6789)/,
  /^(9876|8765|7654|6543|5432|4321|3210)/,
  /^(ABCD|BCDE|CDEF|DEFG|EFGH)/,
  /^(TEST|FAKE|NULL|NONE|XXXX|DEMO)/i,
  /^[A-Z]{0,3}0{7,}$/,
];

function detectFraud(n) {
  const clean = n.replace(/-/g, "");
  if (BLOCKED.has(clean)) return "Numéro figurant dans la liste de documents invalides connus.";
  for (const re of SUSPICIOUS) {
    if (re.test(clean)) return "Numéro avec pattern suspect détecté.";
  }
  if (clean.length >= 4 && new Set(clean).size === 1) return "Numéro composé d'un seul caractère répété.";
  return null;
}

// ── Préfixes CIN Maroc ────────────────────────────────────────────────────────

const MAROC_PREFIXES = new Set([
  "A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y",
  "AA","AB","AC","AD","AE","AF","AG","AH","AI","AJ","AK","AL","AM","AN","AO","AP","AQ","AR","AS","AT","AU","AV","AW","AX","AY",
  "BA","BB","BC","BD","BE","BJ","BK","BL","BM","BN","BO","BP","BQ","BR","BS","BT","BU","BV",
  "CD","CE","CF","CG","CH","DA","DB","DC","DD","DE","DF",
  "EA","EB","EC","ED","EE","EF","FA","FB","FC","GA","GB","GC","GK",
  "HA","HB","HC","HD","IA","IB","IC",
  "JA","JB","JC","JD","JE","JH","JK","JM","JT","JY",
  "KA","KB","KC","LA","LB","LC","LD","MA","MB","MC","MD","NA","NB","NC",
  "OA","OB","OC","PA","PB","PC","QA","QB","QC","RA","RB","RC","RD",
  "SA","SB","SC","SD","SH","TA","TB","TC","TD","TK",
  "UA","UB","UC","VA","VB","VC","WA","WB","WC","XA","XB","XC","YA","YB","YC","ZA","ZB","ZC",
]);

// ── Validation par type ───────────────────────────────────────────────────────

function validateCNI(n) {
  // Maroc
  const mMa = n.match(/^([A-Z]{1,2})(\d{5,7})$/);
  if (mMa) {
    if (!MAROC_PREFIXES.has(mMa[1])) return { valid: false, message: `Série CIN "${mMa[1]}" inconnue pour le Maroc.` };
    if (parseInt(mMa[2], 10) === 0)   return { valid: false, message: "Partie numérique nulle." };
    return { valid: true, country: "Maroc" };
  }
  // France 9 ou 12 chiffres
  if (/^\d{9}$/.test(n)) return { valid: true, country: "France" };
  if (/^\d{12}$/.test(n)) {
    const mo = parseInt(n.substring(2, 4), 10);
    if (mo < 1 || mo > 12) return { valid: false, message: "Mois encodé invalide dans la CNI France." };
    return { valid: true, country: "France" };
  }
  // Côte d'Ivoire
  if (/^CI[-]?\d{8,10}$/.test(n)) {
    const d = n.replace(/^CI-?/, "");
    if (/^0+$/.test(d)) return { valid: false, message: "CNI ivoirienne avec partie numérique nulle." };
    return { valid: true, country: "Côte d'Ivoire" };
  }
  if (/^\d{9,12}$/.test(n)) return { valid: true, country: "Afrique de l'Ouest" };
  // Algérie 18 chiffres
  if (/^\d{18}$/.test(n)) {
    const y = parseInt(n.substring(0,4),10), mo = parseInt(n.substring(4,6),10), d = parseInt(n.substring(6,8),10);
    const now = new Date().getFullYear();
    if (y < 1920 || y > now - 10 || mo < 1 || mo > 12 || d < 1 || d > 31) {
      return { valid: false, message: "Date de naissance encodée invalide dans le numéro algérien." };
    }
    return { valid: true, country: "Algérie" };
  }
  // Tunisie 8 chiffres avec checksum
  if (/^\d{8}$/.test(n)) {
    const ok = checkTunisiaCIN(n);
    if (ok === false) {
      const d = n.split("").map(Number);
      let s = 0;
      for (let i = 0; i < 7; i++) s += d[i] * [2,3,4,5,6,7,8][i];
      const exp = (11 - (s % 11)) % 11;
      return { valid: false, message: `CIN Tunisie : chiffre de contrôle invalide (attendu ${exp}, trouvé ${d[7]}).` };
    }
    return { valid: true, country: "Tunisie" };
  }
  // Afrique de l'Ouest alphanumérique — DOIT commencer par des LETTRES
  // ⚠ "20AD3006" (chiffres+lettres mélangés) est refusé
  if (/^[A-Z]{1,4}\d{6,12}$/i.test(n)) return { valid: true, country: "Afrique de l'Ouest" };

  return { valid: false, message: "Format de CNI non reconnu." };
}

function validatePassport(n) {
  // Maroc / Afrique du Nord : 1 lettre + 6-8 chiffres
  if (/^[A-Z]\d{6,8}$/.test(n)) return { valid: true, country: "Maroc" };
  // ICAO avec chiffre de contrôle : 2 lettres + 8 chiffres
  if (/^[A-Z]{2}\d{8}$/.test(n)) {
    const ok = checkIcaoPassport(n);
    if (ok === false) return { valid: false, message: "Chiffre de contrôle ICAO invalide." };
    return { valid: true, country: "International" };
  }
  // ICAO standard : 2 lettres + 6-7 chiffres
  if (/^[A-Z]{2}\d{6,7}$/.test(n)) return { valid: true, country: "International" };
  // France : 9 chiffres exactement
  if (/^\d{9}$/.test(n)) return { valid: true, country: "France" };
  // ⚠ Pas de catchall [A-Z0-9]{7,9} — tout le reste est refusé
  return { valid: false, message: "Format de passeport non reconnu. Maroc: A1234567 | International: AB1234567 | France: 9 chiffres." };
}

function validatePermis(n) {
  // Maroc — séries CIN marocaines + chiffres
  const mMa = n.match(/^([A-Z]{1,2})(\d{5,7})$/);
  if (mMa && MAROC_PREFIXES.has(mMa[1])) return { valid: true, country: "Maroc" };
  // France — chiffres UNIQUEMENT, 10-12 chars, département 01-99
  // ⚠ "20AD3006" (alphanumérique mixte) est refusé
  if (/^\d{10,12}$/.test(n)) {
    const dept = parseInt(n.substring(0, 2), 10);
    if (dept < 1 || dept > 99) return { valid: false, message: `Code département "${n.substring(0,2)}" invalide pour le permis France.` };
    return { valid: true, country: "France" };
  }
  // CI / Afrique de l'Ouest — lettres en tête + chiffres (min 8 chars)
  if (/^[A-Z]{1,4}\d{6,14}$/i.test(n)) return { valid: true, country: "Afrique de l'Ouest" };
  return { valid: false, message: "Format de permis non reconnu. Maroc: AB123456 | France: 12 chiffres | CI/AOuest: lettres+chiffres." };
}

// ── Validation date expiration ─────────────────────────────────────────────────

function validateExpiry(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return { valid: false, message: "Date d'expiration invalide." };
  if (d < new Date()) {
    const days = Math.floor((new Date() - d) / 86400000);
    const ago  = days < 31 ? `il y a ${days} jour${days>1?"s":""}` : days < 365 ? `il y a ${Math.floor(days/30)} mois` : `il y a ${Math.floor(days/365)} an${days>365?"s":""}`;
    return { valid: false, message: `Document expiré ${ago}.` };
  }
  return { valid: true };
}

// ── Export principal ──────────────────────────────────────────────────────────

export function serverValidateIdentity(type, rawNumber, expiryDate) {
  const n = normalizeDoc(rawNumber);

  if (!n || n.length < 5) return { valid: false, message: "Numéro trop court." };
  if (n.length > 25)      return { valid: false, message: "Numéro trop long." };

  const fraudReason = detectFraud(n);
  if (fraudReason) return { valid: false, fraud: true, message: fraudReason };

  let result;
  if (type === "cni")      result = validateCNI(n);
  else if (type === "passport") result = validatePassport(n);
  else if (type === "permis")   result = validatePermis(n);
  else return { valid: false, message: "Type de document invalide." };

  if (!result.valid) return result;

  if (expiryDate) {
    const expResult = validateExpiry(expiryDate);
    if (expResult && !expResult.valid) return expResult;
  }

  return { valid: true, country: result.country };
}
