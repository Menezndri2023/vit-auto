// ── Veille de maintenance — ce qui se dégrade SANS bruit ───────────────────
//
// Né d'un incident du 2026-10-05 : un partenaire « pièces » de Côte d'Ivoire
// publie une annonce, le serveur la refuse (vérification d'identité en cours),
// l'écran le renvoie en silence vers /kyc — et l'administrateur ne la trouve
// nulle part. Rien n'était cassé au sens d'une erreur 500 : aucune alerte,
// aucune trace. Le même jour, on découvre que la lecture automatique des
// pièces d'identité renvoie 0 % depuis la mi-septembre ; chaque dossier
// partait en révision manuelle sans que personne ne le sache.
//
// Ces pannes-là ne lèvent aucune exception. Elles se voient seulement en
// comptant : des dossiers qui attendent, des annonces qui ne sortent pas de
// la file, des tentatives refusées, un taux qui tombe à zéro. Ce module fait
// ces comptes, chaque jour, et les remonte à l'administrateur général :
//   - dans le digest quotidien (dailyOpsDigest.js) — les seules lignes
//     « attention » ou « critique » ;
//   - dans l'onglet Maintenance du panneau d'administration
//     (GET /api/admin/maintenance, onglet « Santé système ») — toutes les vérifications, vertes comprises,
//     pour qu'un « rien à signaler » soit une information et non un silence.
//
// Calcul pur (calculerEtatMaintenance) : testable avec une horloge injectée,
// sans planificateur — l'envoi passe par le digest, déjà verrouillé.
import AuditLog from "../models/AuditLog.js";
import User from "../models/User.js";
import Vehicle from "../models/Vehicle.js";
import Driver from "../models/Driver.js";
import Activity from "../models/Activity.js";
import ImportExportListing from "../models/ImportExportListing.js";
import SparePart from "../models/SparePart.js";
import logger from "./logger.js";

const h = (n) => n * 3600000;
const j = (n) => h(24 * n);

// Action d'audit écrite à chaque publication refusée par une garde serveur.
export const ACTION_REFUS_PUBLICATION = "publication.refusee";

// ── Journal des publications refusées ────────────────────────────────────────
// Appelé par chaque contrôleur de création d'annonce quand une garde refuse
// (vérification d'identité, certification, secteur, quota, palier, dossier
// suspendu). Sans ce journal, une tentative refusée n'existait nulle part :
// l'administrateur ne pouvait ni la voir ni relancer le partenaire.
// Ne bloque jamais la réponse (même contrat que logAction).
export async function journaliserRefusPublication(req, ressource, refus, titre = null) {
  try {
    await AuditLog.create({
      userId:    req.user?._id ?? null,
      userRole:  req.user?.role ?? "anonymous",
      userEmail: req.user?.email ?? null,
      action:    ACTION_REFUS_PUBLICATION,
      resource:  ressource,
      changes:   { before: null, after: { titre: titre ? String(titre).slice(0, 160) : null, code: refus?.code || null } },
      ip:        req.ip || null,
      userAgent: req.headers?.["user-agent"] || null,
      method:    req.method,
      path:      req.originalUrl,
      success:   false,
      errorMessage: [refus?.code, refus?.message].filter(Boolean).join(" — ").slice(0, 300) || null,
    });
  } catch (err) {
    logger.error("journaliserRefusPublication:", err?.message || String(err), err?.stack?.split("\n")[1] || "");
  }
}

const FILES_MODERATION = [
  { id: "vehicules",  libelle: "véhicule(s)",            modele: Vehicle,             lien: "/admin?tab=catalogue" },
  { id: "chauffeurs", libelle: "profil(s) chauffeur",    modele: Driver,              lien: "/admin?tab=chauffeurs" },
  { id: "activites",  libelle: "activité(s) de loisirs", modele: Activity,            lien: "/admin?tab=activites" },
  { id: "export",     libelle: "annonce(s) import/export", modele: ImportExportListing, lien: "/admin?tab=catalogue" },
  { id: "pieces",     libelle: "pièce(s) détachée(s)",   modele: SparePart,           lien: "/admin?tab=pieces" },
];

function niveauSeuil(n, attention, critique) {
  if (n >= critique) return "critique";
  if (n >= attention) return "attention";
  return "ok";
}

// Retourne une liste de vérifications { id, titre, niveau, valeur, detail, lien }.
// niveau : "ok" | "attention" | "critique".
export async function calculerEtatMaintenance(maintenant = new Date()) {
  const t = maintenant.getTime();
  const reels = { isTestAccount: { $ne: true } };

  const [kycEnAttente, kycRecents, refus, partenairesBloques, ...enAttente] = await Promise.all([
    // Dossiers d'identité soumis, toujours sans décision.
    User.find({ ...reels, kycStatus: { $in: ["EN_ATTENTE", "A_REVOIR_MANUELLEMENT"] }, kycSubmittedAt: { $ne: null, $lte: new Date(t - h(24)) } })
      .select("firstName lastName role kycSubmittedAt").sort({ kycSubmittedAt: 1 }).limit(50).lean(),
    // Lecture automatique des pièces d'identité : 14 derniers jours.
    // Seuls les dossiers passés par l'écran KYC (type de document renseigné par
    // la lecture) : les comptes de démonstration semés par script (revue Apple)
    // n'ont jamais été lus et faisaient croire à une panne générale.
    User.find({ ...reels, kycSubmittedAt: { $gte: new Date(t - j(14)) }, "kycOcrData.documentType": { $nin: [null, ""] } })
      .select("kycOcrData.ocrConfidence").limit(200).lean(),
    // Publications refusées par une garde serveur, dernières 24 h.
    AuditLog.find({ action: ACTION_REFUS_PUBLICATION, createdAt: { $gte: new Date(t - h(24)) } })
      .select("userEmail resource errorMessage createdAt").sort({ createdAt: -1 }).limit(50).lean(),
    // Partenaires inscrits depuis plus de 72 h et toujours pas validés : il leur
    // manque une pièce exigée pour LEUR métier et LEUR entité
    // (services/validationPartenaire.js) — un chauffeur n'est plus compté
    // comme bloqué faute d'une vérification d'identité qu'on ne lui demande pas.
    User.find({ ...reels, role: "partenaire", isActive: { $ne: false }, isFounder: { $ne: true },
      "validationPartenaire.statut": "a_completer", createdAt: { $lte: new Date(t - h(72)), $gte: new Date(t - j(60)) } })
      .select("firstName lastName kycSubmittedAt validationPartenaire.manquants").limit(50).lean(),
    ...FILES_MODERATION.map((f) => f.modele.countDocuments({ status: "pending", createdAt: { $lte: new Date(t - h(24)) } })),
  ]);

  const checks = [];

  checks.push({
    id: "kyc_en_attente",
    titre: "Vérifications d'identité en attente depuis plus de 24 h",
    niveau: niveauSeuil(kycEnAttente.length, 1, 5),
    valeur: kycEnAttente.length,
    detail: kycEnAttente.slice(0, 5).map((u) => `${u.firstName || ""} ${u.lastName || ""}`.trim()).join(", "),
    lien: "/admin?tab=kyc",
  });

  const ocr = kycRecents.map((u) => Number(u.kycOcrData?.ocrConfidence || 0));
  const ocrReussis = ocr.filter((c) => c > 0).length;
  checks.push({
    id: "ocr_identite",
    titre: "Lecture automatique des pièces d'identité (14 jours)",
    // Trois dossiers ou plus sans aucune lecture réussie : la chaîne est en
    // panne, pas le document d'un utilisateur. Un ou deux : à surveiller.
    niveau: ocr.length >= 3 && ocrReussis === 0 ? "critique" : (ocr.length >= 1 && ocrReussis === 0 ? "attention" : "ok"),
    valeur: ocr.length ? `${ocrReussis}/${ocr.length}` : "—",
    detail: ocr.length >= 3 && ocrReussis === 0
      ? "Aucune lecture réussie sur plusieurs dossiers : la chaîne de lecture est probablement en panne."
      : ocr.length && ocrReussis === 0
      ? "Aucune lecture réussie pour l'instant (photo floue ou appareil) : dossier(s) à examiner manuellement."
      : (ocr.length ? `${ocrReussis} lecture(s) réussie(s) sur ${ocr.length} dossier(s).` : "Aucun dossier sur la période."),
    lien: "/admin?tab=kyc",
  });

  checks.push({
    id: "publications_refusees",
    titre: "Publications refusées en 24 h",
    niveau: niveauSeuil(refus.length, 1, 10),
    valeur: refus.length,
    detail: refus.slice(0, 5).map((r) => `${r.userEmail || "?"} — ${r.resource} (${(r.errorMessage || "").split(" — ")[0]})`).join(" · "),
    lien: "/admin?tab=system_health",
  });

  checks.push({
    id: "partenaires_bloques",
    titre: "Partenaires inscrits depuis 72 h, pas encore validés (pièces manquantes)",
    niveau: niveauSeuil(partenairesBloques.length, 1, 10),
    valeur: partenairesBloques.length,
    detail: partenairesBloques.slice(0, 5).map((u) => `${u.firstName || ""} ${u.lastName || ""} (manque : ${(u.validationPartenaire?.manquants || []).join(", ") || "?"})`.trim()).join(", "),
    lien: "/admin?tab=kyc",
  });

  FILES_MODERATION.forEach((f, i) => {
    const n = enAttente[i];
    checks.push({
      id: `moderation_${f.id}`,
      titre: `Annonces en attente de modération depuis 24 h — ${f.libelle}`,
      niveau: niveauSeuil(n, 1, 10),
      valeur: n,
      detail: n ? `${n} ${f.libelle} à valider ou refuser.` : "",
      lien: f.lien,
    });
  });

  return checks;
}

// Lignes du digest quotidien : uniquement ce qui demande une action.
export function lignesDigestMaintenance(checks) {
  return checks
    .filter((c) => c.niveau !== "ok")
    .map((c) => `${c.niveau === "critique" ? "🔴" : "🟠"} ${c.titre} : ${c.valeur}${c.detail ? ` (${c.detail})` : ""}`);
}

// Répond 403 avec le refus de la garde ET l'inscrit au journal. À utiliser
// dans les contrôleurs de création à la place de `res.status(403).json(refus)`.
// Le journal n'est pas attendu : il ne retarde ni ne fait échouer la réponse.
export function refuserPublication(req, res, ressource, refus, titre = null) {
  journaliserRefusPublication(req, ressource, refus, titre ?? req.body?.title ?? req.body?.titre ?? null);
  return res.status(403).json(refus);
}
