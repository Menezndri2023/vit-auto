import GrilleTarifaire from "../models/GrilleTarifaire.js";
import PricingConfig from "../models/PricingConfig.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import PartnerOnboarding from "../models/PartnerOnboarding.js";
import { DEFAULT_PRICING_CONFIG } from "../config/defaultPricingConfig.js";
import { CLAUSE_COMPTE_DE_TEST } from "../utils/comptesDeTest.js";
import { sendEmail } from "../config/email.js";
import { baseEmail } from "./communication/templates/shared/base.js";
import { escapeHtml } from "./communication/templates/shared/components.js";
import logger from "../utils/logger.js";

// ═══════════════════════════════════════════════════════════════════════════
// GRILLE VERSIONNÉE ET PRÉAVIS (décision de l'exploitant, 2026-10-30)
// ═══════════════════════════════════════════════════════════════════════════
// - Une HAUSSE de commission s'applique au plus tôt PREAVIS_JOURS après la
//   notification des partenaires ; une baisse peut être immédiate.
// - Les partenaires sont notifiés à la programmation (dans leur espace et par
//   e-mail) : version, date d'envoi, date d'effet, lignes modifiées.
// - Une réservation garde le taux fixé à sa création (Booking.commissionFigee) :
//   une nouvelle version ne touche que les transactions créées après son effet.
// Le délai de 30 jours est une règle interne : sa validité juridique au regard
// des contrats et du droit applicable reste à confirmer.

export const PREAVIS_JOURS = 30;
export const SECTIONS_VERSIONNEES = ["commissions", "foundingPartner"];
const JOUR = 86400000;

export class GrilleError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Feuilles numériques modifiées entre deux sections (taux, durée).
export function differences(avant, apres, prefixe) {
  const out = [];
  const cles = new Set([...Object.keys(avant || {}), ...Object.keys(apres || {})]);
  for (const k of cles) {
    const a = avant?.[k]; const b = apres?.[k]; const chemin = `${prefixe}.${k}`;
    if ((a && typeof a === "object") || (b && typeof b === "object")) out.push(...differences(a, b, chemin));
    else if (typeof (b ?? a) === "number" && a !== b) out.push({ chemin, avant: a ?? null, apres: b ?? null });
  }
  return out;
}

const libelle = (c) => {
  const pct = (v) => (v == null ? "—" : c.chemin.endsWith("durationMonths") ? `${v} mois` : `${Math.round(v * 10000) / 100} %`);
  return `${c.chemin.replace(/^commissions\./, "").replace(/^foundingPartner\./, "fondateur ")} : ${pct(c.avant)} → ${pct(c.apres)}`;
};

async function configCourante() {
  return (await PricingConfig.findOne({ key: "global" }).lean()) || { ...DEFAULT_PRICING_CONFIG, versionGrille: 1 };
}

async function prochaineVersion() {
  const [derniere, cfg] = await Promise.all([
    GrilleTarifaire.findOne().sort({ version: -1 }).select("version").lean(),
    PricingConfig.findOne({ key: "global" }).select("versionGrille").lean(),
  ]);
  return Math.max(derniere?.version || 0, cfg?.versionGrille || 1) + 1;
}

/**
 * Programme une modification de la grille. Renvoie la version créée.
 * `immediat` n'est accepté que si aucune ligne n'augmente.
 */
export async function programmerModification({ section, valeur, dateEffet = null, motif = "", immediat = false, par = null, notifier = true }) {
  if (!SECTIONS_VERSIONNEES.includes(section)) throw new GrilleError(400, "Section non versionnée.");
  if (!valeur || typeof valeur !== "object") throw new GrilleError(400, "Valeur de section manquante.");
  if (await GrilleTarifaire.exists({ section, statut: "programmee" })) {
    throw new GrilleError(409, "Une modification de cette section est déjà programmée : annulez-la ou attendez son effet.");
  }
  const cfg = await configCourante();
  const changements = differences(cfg[section], valeur, section);
  if (!changements.length) throw new GrilleError(400, "Aucun taux ne change.");
  const hausse = changements.some((c) => (c.apres ?? 0) > (c.avant ?? 0));

  const maintenant = new Date();
  const auPlusTot = new Date(maintenant.getTime() + PREAVIS_JOURS * JOUR);
  let effet;
  if (immediat) {
    if (hausse) throw new GrilleError(400, `Une hausse ne peut pas être immédiate : préavis de ${PREAVIS_JOURS} jours.`);
    effet = maintenant;
  } else {
    const demande = dateEffet ? new Date(dateEffet) : auPlusTot;
    if (Number.isNaN(demande.getTime())) throw new GrilleError(400, "Date d'effet invalide.");
    if (hausse && demande < auPlusTot) throw new GrilleError(400, `Une hausse prend effet au plus tôt le ${auPlusTot.toLocaleDateString("fr-FR")} (préavis de ${PREAVIS_JOURS} jours).`);
    effet = demande < maintenant ? maintenant : demande;
  }

  const doc = await GrilleTarifaire.create({
    version: await prochaineVersion(), section, valeur, changements, hausse,
    dateEffet: effet, motif: String(motif || "").slice(0, 1000), creePar: par,
  });
  if (notifier) await notifierPartenaires(doc).catch((err) => logger.error("[Grille] notification :", err.message));
  if (effet <= maintenant) await appliquerModificationsEchues({ force: true });
  return GrilleTarifaire.findById(doc._id).lean();
}

// Partenaires réels (comptes de test exclus), fondateurs signalés.
async function notifierPartenaires(doc) {
  const partenaires = await User.find({ role: "partenaire", isActive: { $ne: false }, $nor: [CLAUSE_COMPTE_DE_TEST] })
    .select("_id email firstName country").lean();
  const fondateurs = new Set((await PartnerOnboarding.find({ isFoundingPartner: true }).select("userId").lean()).map((f) => String(f.userId)));
  const effet = new Date(doc.dateEffet).toLocaleDateString("fr-FR");
  const lignes = doc.changements.map(libelle);
  const titre = `Grille de commissions — version ${doc.version}`;
  const message = `Modification de la grille VIT AUTO, en vigueur le ${effet} pour les transactions créées à partir de cette date : ${lignes.join(" ; ")}. Les transactions déjà créées gardent leur taux.`;
  if (partenaires.length) {
    await Notification.insertMany(partenaires.map((p) => ({ user: p._id, type: "conditions_tarifaires", titre, message, lien: "/conditions-partenaires" })), { ordered: false });
  }
  let emails = 0;
  for (const p of partenaires) {
    if (!p.email) continue;
    const body = `<p>Bonjour ${escapeHtml(p.firstName || "")},</p>
<p>VIT AUTO modifie sa grille de commissions (version ${doc.version}). Ces conditions s'appliquent aux transactions créées à partir du <strong>${escapeHtml(effet)}</strong> ; les transactions déjà créées gardent leur taux.</p>
<ul>${lignes.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>
${doc.motif ? `<p>Motif : ${escapeHtml(doc.motif)}</p>` : ""}
<p>Pour toute question, répondez à ce message ou contactez votre interlocuteur VIT AUTO.</p>`;
    const r = await sendEmail({ to: p.email, subject: titre, html: baseEmail({ title: escapeHtml(titre), preheader: escapeHtml(`En vigueur le ${effet}`), body, country: p.country }), template: "conditions_tarifaires", userId: p._id })
      .catch((err) => { logger.error("[Grille] e-mail :", err.message); return null; });
    if (r !== null) emails += 1;
  }
  await GrilleTarifaire.updateOne({ _id: doc._id }, { $set: {
    "notification.envoyeeLe": new Date(), "notification.destinataires": partenaires.length,
    "notification.fondateurs": partenaires.filter((p) => fondateurs.has(String(p._id))).length, "notification.emails": emails,
  } });
}

let derniereVerification = 0;
/**
 * Applique, dans l'ordre, les versions dont la date d'effet est passée.
 * Appelée par getConfig (au plus une fois par minute) : aucune tâche planifiée
 * n'est nécessaire pour qu'une version entre en vigueur.
 */
export async function appliquerModificationsEchues({ force = false } = {}) {
  if (!force && Date.now() - derniereVerification < 60000) return 0;
  derniereVerification = Date.now();
  let n = 0;
  const echues = await GrilleTarifaire.find({ statut: "programmee", dateEffet: { $lte: new Date() } }).sort({ version: 1 }).lean();
  for (const v of echues) {
    const pris = await GrilleTarifaire.findOneAndUpdate({ _id: v._id, statut: "programmee" }, { $set: { statut: "appliquee", appliqueeLe: new Date() } });
    if (!pris) continue;   // une autre instance l'a appliquée
    await PricingConfig.updateOne({ key: "global" }, { $set: { [v.section]: v.valeur, versionGrille: v.version } }, { upsert: true });
    logger.info(`[Grille] version ${v.version} appliquée (${v.changements.length} ligne(s)).`);
    n += 1;
  }
  return n;
}

export async function annulerModification(id, { par = null, motif = "" } = {}) {
  const doc = await GrilleTarifaire.findOneAndUpdate({ _id: id, statut: "programmee" },
    { $set: { statut: "annulee", annuleeLe: new Date(), annuleePar: par, motifAnnulation: String(motif || "").slice(0, 500) || null } }, { new: true }).lean();
  if (!doc) throw new GrilleError(404, "Aucune modification programmée à annuler.");
  return doc;
}

// Pour les tests : relance la vérification sans attendre la minute.
export const _reinitialiserVerification = () => { derniereVerification = 0; };
