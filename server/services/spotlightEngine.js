// ═══════════════════════════════════════════════════════════════════════════
// MOTEUR DE MISE EN AVANT — une seule règle pour toutes les vitrines
// ═══════════════════════════════════════════════════════════════════════════
// Avant : la vitrine d'accueil ne montrait QUE ce qu'un administrateur avait
// coché à la main (`Vehicle.featured`). Deux conséquences — un administrateur
// qui ne coche rien laisse la page d'accueil vide, et un partenaire ne peut
// rien faire pour y figurer, quels que soient son abonnement et son travail.
//
// Ce moteur remplace la coche par une COMPOSITION en trois sources, dans cet
// ordre de priorité :
//
//   1. ÉPINGLÉ — ce qu'un administrateur a explicitement mis en avant. Devenu
//      FACULTATIF : un droit de veto positif, plus une condition d'entrée.
//   2. BOOST ACHETÉ — une mise en avant payée à l'unité (`sponsoredUntil` /
//      `boostLevel`, voir subscriptionController). C'est le produit le plus
//      cher du catalogue : il passe devant l'abonnement, exactement comme dans
//      le tri du catalogue, sinon la plateforme vendrait deux fois la même
//      place avec deux ordres différents. Les mises en avant INCLUSES dans un
//      abonnement s'écrivent dans les mêmes champs : elles entrent donc ici
//      aussi, sans traitement séparé.
//   3. ABONNEMENT — un quota de places par palier (PLACES_PAR_PLAN), en
//      rotation quotidienne pour que tous les abonnés d'un même palier passent,
//      et pas seulement les premiers inscrits.
//   4. MÉRITE — le reste des places, attribué au score : complétude de la
//      fiche, engagement réel des visiteurs, confiance, fraîcheur. Ouvert à
//      TOUS, comptes gratuits compris — sans quoi un nouveau partenaire
//      n'aurait aucune chance d'être vu, et la page d'accueil ne serait plus
//      qu'une grille tarifaire.
//
// Le moteur est GÉNÉRIQUE : véhicules, activités et loisirs, profils
// partenaires passent par les mêmes règles, via un adaptateur par collection.
// Écrire trois moteurs aurait garanti qu'ils divergent.
//
// PÉRIMÈTRE : la source « véhicules » est la collection `Vehicle` — location,
// vente, essai, leasing. Les annonces Import/Export vivent dans
// `ImportExportListing` et n'entrent pas ici. « Exportateur » désigne un palier
// d'abonnement, pas un type d'annonce.
import Vehicle from "../models/Vehicle.js";
import Activity from "../models/Activity.js";
import User from "../models/User.js";
import Booking from "../models/Booking.js";
import Favorite from "../models/Favorite.js";
import Subscription from "../models/Subscription.js";
import { PLAN_RANK } from "../constants/subscriptionPlans.js";
import { planActifDe } from "./planAccess.js";
import { cacheGet, cacheSet, buildCacheKey } from "../utils/catalogCache.js";

// ── Places réservées par palier d'abonnement ───────────────────────────────
// Le nombre progresse avec la formule : c'est la contrepartie visible de
// l'écart de prix, et la première chose qu'un partenaire vérifie après avoir
// payé.
export const PLACES_PAR_PLAN = {
  exportateur:     3,
  business:        2,
  individuel_plus: 1,
};

const PALIERS = Object.keys(PLACES_PAR_PLAN).sort((a, b) => PLAN_RANK[b] - PLAN_RANK[a]);
export const PLACES_RESERVEES = Object.values(PLACES_PAR_PLAN).reduce((s, n) => s + n, 0);

// Deux entrées au maximum par partenaire dans une même vitrine. Sans ce
// plafond, un partenaire à trois cents annonces occuperait toute la page
// d'accueil au mérite, et la vitrine cesserait de représenter la plateforme.
export const MAX_PAR_PARTENAIRE = 2;

// Part maximale d'une vitrine occupée par des boosts achetés. Un boost payé
// doit apparaître — c'est ce qui a été vendu — mais si vingt partenaires
// achètent le même jour, les laisser tout prendre annulerait les places
// promises aux abonnés, qui ont payé elles aussi. Au-delà du plafond, les
// boosts tournent entre eux : chacun passe, aucun ne confisque.
export const PART_MAX_BOOSTS = 0.5;

// Taille du vivier au mérite avant rotation : trois fois les places à pourvoir.
// Trop étroit, ce sont toujours les mêmes ; trop large, la vitrine descend vers
// des annonces médiocres.
const FACTEUR_VIVIER = 3;

const TTL_CACHE_MS = 5 * 60 * 1000;

// ── Rotation ───────────────────────────────────────────────────────────────
// Dérivée de la DATE, jamais tirée au hasard : deux visites du même jour
// renvoient la même vitrine, ce qui la rend cachable et testable. Le numéro de
// jour depuis l'époque change à minuit UTC et n'a pas de discontinuité au
// changement d'année, contrairement à un quantième qui repasserait de 365 à 1.
export const jourDeRotation = (maintenant = new Date()) =>
  Math.floor(maintenant.getTime() / 86400000);

// Fenêtre glissante avec bouclage : au bout de la liste on reprend au début,
// sinon les derniers inscrits ne passeraient jamais.
export function fenetreDuJour(liste, places, maintenant) {
  if (!liste.length || places <= 0) return [];
  if (liste.length <= places) return [...liste];
  const depart = jourDeRotation(maintenant) % liste.length;
  const choisis = [];
  for (let i = 0; i < places; i++) choisis.push(liste[(depart + i) % liste.length]);
  return choisis;
}

// ── Score de mérite ────────────────────────────────────────────────────────
// Borné à 100 et découpé en quatre familles lisibles : un partenaire qui
// demande « pourquoi je n'apparais pas » doit recevoir une réponse actionnable,
// pas un nombre opaque.
//
// Le score ne travaille PAS sur le document brut mais sur un « profil de
// signaux » normalisé que chaque source remplit à sa façon. Une annonce a des
// photos ; un compte partenaire a des annonces publiées. Leur imposer les mêmes
// champs aurait donné un score toujours nul aux partenaires — donc une section
// figée sur l'ordre de création.
export const POIDS = {
  qualite:    35, // ce que le partenaire contrôle entièrement
  engagement: 35, // ce que les visiteurs en font
  confiance:  20, // avis réels et vérification d'identité
  fraicheur:  10, // tenu à jour = encore disponible
};

// Paliers de saturation : au-delà, un chiffre supplémentaire n'apporte plus de
// points. Sans eux, une annonce à dix mille vues écraserait tout le reste et la
// vitrine se figerait sur les mêmes gagnants.
const SATURATION = { vues: 200, favoris: 20, reservations: 10, avis: 10 };

const borne = (v, max) => Math.max(0, Math.min(1, (v || 0) / max));

const POIDS_BADGE = { premium: 0.4, fondateur: 0.35, verifie: 0.3, none: 0 };

/**
 * @param {object} profil
 * @param {number} profil.qualite       0→1, complétude de la fiche
 * @param {number} profil.vues
 * @param {number} profil.favoris
 * @param {number} profil.reservations
 * @param {number} profil.note          0→5
 * @param {number} profil.avis          nombre d'avis
 * @param {string} profil.badge         certificationBadge du propriétaire
 * @param {Date}   profil.majLe         dernière activité utile
 */
export function scoreDeMerite(profil = {}) {
  const qualite = Math.max(0, Math.min(1, profil.qualite || 0));

  const engagement =
      borne(profil.vues, SATURATION.vues) * 0.45
    + borne(profil.favoris, SATURATION.favoris) * 0.25
    + borne(profil.reservations, SATURATION.reservations) * 0.30;

  // La note ne compte QUE si elle repose sur des avis réels : 5/5 adossé à un
  // seul avis ne dit rien, et serait trivial à fabriquer.
  const confiance = Math.min(1,
      ((profil.note || 0) / 5) * borne(profil.avis, SATURATION.avis) * 0.6
    + (POIDS_BADGE[profil.badge] ?? 0));

  const jours = profil.majLe ? (Date.now() - new Date(profil.majLe).getTime()) / 86400000 : 9999;
  const fraicheur = jours <= 7 ? 1 : jours <= 30 ? 0.7 : jours <= 90 ? 0.4 : 0;

  return Math.round(
    qualite * POIDS.qualite +
    engagement * POIDS.engagement +
    confiance * POIDS.confiance +
    fraicheur * POIDS.fraicheur
  );
}

// Complétude d'une fiche d'annonce : cinq photos suffisent, une description
// réelle compte, une annonce localisée aussi.
const qualiteAnnonce = (d) =>
    borne(d.images?.length, 5) * 0.55
  + ((d.description || "").trim().length >= 80 ? 0.25 : 0)
  + (d.ville ? 0.2 : 0);

// ── Adaptateurs de collection ──────────────────────────────────────────────
// Chaque source dit seulement : quel modèle, quel filtre de base, quel champ
// porte le propriétaire, quels signaux la nourrissent, et comment se présente
// un élément. Tout le reste — composition, rotation, plafond par partenaire —
// est commun.
const ADAPTATEURS = {
  vehicules: {
    modele: Vehicle,
    champProprietaire: "owner",
    supporteEpinglage: true,
    // Seules les annonces véhicule peuvent être boostées aujourd'hui : un boost
    // s'achète pour un `vehicleId` (voir purchaseBoost). Le jour où les
    // activités le pourront, il suffira de passer ce drapeau à `true`.
    supporteBoost: true,
    champs: "title type marque modele annee ville country pricePerDay priceForSale currency images vues noteMoyenne nombreAvis description updatedAt owner featured sponsoredUntil boostLevel",
    filtreBase: (type) => ({ status: "approved", available: true, ...(type ? { type } : {}) }),
    profil: (d, sig) => ({
      qualite: qualiteAnnonce(d),
      vues: d.vues, favoris: sig.favoris, reservations: sig.reservations,
      note: d.noteMoyenne, avis: d.nombreAvis, badge: sig.badge, majLe: d.updatedAt,
    }),
    presenter: (d) => ({
      id: String(d._id), source: "vehicule",
      titre: d.title,
      sousTitre: [d.marque, d.modele, d.annee].filter(Boolean).join(" ") || null,
      type: d.type, ville: d.ville || null, pays: d.country || null,
      prix: d.type === "vente" ? (d.priceForSale ?? null) : (d.pricePerDay ?? null),
      unite: d.type === "vente" ? null : "jour",
      devise: d.currency || "USD",
      image: d.images?.[0] || null,
      note: d.noteMoyenne || 0, avis: d.nombreAvis || 0,
      lien: `/vehicle/${d._id}`,
    }),
  },

  activites: {
    modele: Activity,
    champProprietaire: "owner",
    supporteEpinglage: true,
    champs: "title activityType ville country price priceUnit currency durationMinutes capacity images thumbnail vues noteMoyenne nombreAvis description updatedAt owner featured",
    filtreBase: () => ({ status: "approved", available: true }),
    profil: (d, sig) => ({
      // Une activité peut n'avoir qu'une vignette : la compter comme photo
      // évite de pénaliser une fiche pourtant illustrée.
      qualite: qualiteAnnonce({ ...d, images: d.images?.length ? d.images : (d.thumbnail ? [d.thumbnail] : []) }),
      vues: d.vues, favoris: 0, reservations: sig.reservations,
      note: d.noteMoyenne, avis: d.nombreAvis, badge: sig.badge, majLe: d.updatedAt,
    }),
    presenter: (d) => ({
      id: String(d._id), source: "activite",
      titre: d.title,
      sousTitre: d.activityType || null,
      type: d.activityType, ville: d.ville || null, pays: d.country || null,
      prix: d.price ?? null,
      unite: d.priceUnit === "per_person" ? "personne" : "session",
      devise: d.currency || "USD",
      image: d.thumbnail || d.images?.[0] || null,
      note: d.noteMoyenne || 0, avis: d.nombreAvis || 0,
      dureeMinutes: d.durationMinutes || null,
      capacite: d.capacity || null,
      lien: `/activity-booking/${d._id}`,
    }),
  },

  partenaires: {
    modele: User,
    champProprietaire: "_id",
    supporteEpinglage: false,
    // `User` ne porte ni ville ni `updatedAt` : les signaux d'un partenaire
    // viennent de SES ANNONCES — nombre publié, vues cumulées, note, date de la
    // plus récente — agrégées en une requête pour tout le vivier.
    champs: "firstName lastName country certificationBadge isFounder profilePhoto createdAt role isActive",
    // `teamOf: null` exclut les comptes d'équipe : ils ne sont pas des
    // partenaires distincts, et les afficher montrerait deux fois la même
    // entreprise. Le filtre couvre aussi les comptes créés avant ce champ, où
    // la clé est absente — `null` les apparie.
    filtreBase: () => ({ role: "partenaire", isActive: true, teamOf: null }),
    profil: (d, sig) => ({
      // Un partenaire « complet » est un partenaire qui a réellement publié.
      // Cinq annonces saturent le critère : au-delà, la quantité ne dit plus
      // rien de la qualité.
      qualite: borne(sig.annonces, 5) * 0.7 + (d.profilePhoto ? 0.3 : 0),
      vues: sig.vues, favoris: 0, reservations: sig.reservations,
      note: sig.note, avis: sig.avis, badge: d.certificationBadge || "none",
      majLe: sig.derniereActivite,
    }),
    presenter: (d) => ({
      id: String(d._id), source: "partenaire",
      titre: [d.firstName, d.lastName].filter(Boolean).join(" ") || "Partenaire VIT AUTO",
      sousTitre: d.certificationBadge && d.certificationBadge !== "none" ? d.certificationBadge : null,
      ville: null, pays: d.country || null,
      image: d.profilePhoto || null,
      lien: `/showroom/${d._id}`,
    }),
  },
};

// ── Emplacements ───────────────────────────────────────────────────────────
export const EMPLACEMENTS = {
  hero:        { source: "vehicules",   capacite: 6, type: null },
  vedette:     { source: "vehicules",   capacite: 8, type: null },
  loisirs:     { source: "activites",   capacite: 6, type: null },
  partenaires: { source: "partenaires", capacite: 6, type: null },
};

// Rangs d'abonnement en vigueur, résolus À LA VOLÉE plutôt que recopiés sur
// chaque document. Les abonnés se comptent en dizaines : une requête suffit, et
// aucune valeur ne peut se désynchroniser — le défaut classique d'un champ
// dénormalisé qu'un abonnement expiré laisse derrière lui.
async function rangsParProprietaire() {
  const abonnements = await Subscription.find({
    plan: { $ne: "free" }, "planDetails.isActive": true,
    "planDetails.endDate": { $gt: new Date() },
  }).select("vendor plan planDetails").lean();

  const rangs = new Map();
  for (const s of abonnements) {
    if (planActifDe(s)) rangs.set(String(s.vendor), PLAN_RANK[s.plan] ?? 0);
  }
  return rangs;
}

// Le filtre pays applique la même règle que le catalogue : une annonce sans
// pays renseigné — créée avant l'internationalisation — reste visible partout.
// Jamais de régression de visibilité pour une annonce existante.
const clausePays = (country) =>
  country ? { $or: [{ country: String(country).toUpperCase() }, { country: null }] } : {};

async function candidats(adaptateur, { country, type, limite }) {
  return adaptateur.modele
    .find({ ...adaptateur.filtreBase(type), ...clausePays(country) })
    .select(adaptateur.champs)
    .sort({ createdAt: -1 })
    .limit(limite)
    .lean();
}

// ── Signaux d'engagement ───────────────────────────────────────────────────
// Regroupés en quelques requêtes agrégées pour TOUT le vivier plutôt qu'une par
// élément : la vitrine est sur la page la plus consultée du site, un
// aller-retour par candidat s'y verrait immédiatement.
async function signaux(source, docs, adaptateur) {
  const vide = { favoris: 0, reservations: 0, badge: "none", annonces: 0, vues: 0, note: 0, avis: 0, derniereActivite: null };
  const par = new Map(docs.map((d) => [String(d._id), { ...vide }]));
  if (!docs.length) return par;

  if (source === "partenaires") {
    const ids = docs.map((d) => d._id);
    const agg = await Vehicle.aggregate([
      { $match: { owner: { $in: ids }, status: "approved" } },
      { $group: {
        _id: "$owner",
        annonces: { $sum: 1 },
        vues: { $sum: { $ifNull: ["$vues", 0] } },
        note: { $avg: "$noteMoyenne" },
        avis: { $sum: { $ifNull: ["$nombreAvis", 0] } },
        derniereActivite: { $max: "$updatedAt" },
      } },
    ]);
    for (const r of agg) {
      const e = par.get(String(r._id));
      if (e) Object.assign(e, { annonces: r.annonces, vues: r.vues, note: r.note || 0, avis: r.avis, derniereActivite: r.derniereActivite });
    }
    for (const d of docs) par.get(String(d._id)).badge = d.certificationBadge || "none";
    return par;
  }

  // Badge du propriétaire, en une requête pour tout le vivier.
  const proprios = [...new Set(docs.map((d) => d[adaptateur.champProprietaire]).filter(Boolean).map(String))];
  const [users, fav, resa] = await Promise.all([
    proprios.length ? User.find({ _id: { $in: proprios } }).select("certificationBadge").lean() : [],
    source === "vehicules"
      ? Favorite.aggregate([
          { $match: { itemType: "vehicle", itemId: { $in: docs.map((d) => d._id) } } },
          { $group: { _id: "$itemId", n: { $sum: 1 } } },
        ])
      : [],
    Booking.aggregate([
      { $match: source === "vehicules"
          ? { vehicle: { $in: docs.map((d) => d._id) } }
          : { activity: { $in: docs.map((d) => d._id) } } },
      { $group: { _id: source === "vehicules" ? "$vehicle" : "$activity", n: { $sum: 1 } } },
    ]),
  ]);

  const badges = new Map(users.map((u) => [String(u._id), u.certificationBadge || "none"]));
  const favParId = new Map(fav.map((r) => [String(r._id), r.n]));
  const resaParId = new Map(resa.map((r) => [String(r._id), r.n]));

  for (const d of docs) {
    const e = par.get(String(d._id));
    e.badge = badges.get(String(d[adaptateur.champProprietaire])) || "none";
    e.favoris = favParId.get(String(d._id)) || 0;
    e.reservations = resaParId.get(String(d._id)) || 0;
  }
  return par;
}

// Ajoute au fur et à mesure en refusant tout doublon et tout partenaire déjà
// représenté MAX_PAR_PARTENAIRE fois.
function accumulateur(capacite) {
  const retenus = [];
  const vus = new Set();
  const parPartenaire = new Map();
  return {
    retenus,
    contient: (id) => vus.has(String(id)),
    reste: () => capacite - retenus.length,
    ajouter(doc, origine, proprietaire, score) {
      if (retenus.length >= capacite) return false;
      const id = String(doc._id);
      if (vus.has(id)) return false;
      const p = String(proprietaire || "");
      if (p && (parPartenaire.get(p) || 0) >= MAX_PAR_PARTENAIRE) return false;
      vus.add(id);
      if (p) parPartenaire.set(p, (parPartenaire.get(p) || 0) + 1);
      retenus.push({ doc, origine, score });
      return true;
    },
  };
}

/**
 * Compose une vitrine.
 *
 * @param {string} nomEmplacement  clé de EMPLACEMENTS
 * @param {object} opts
 * @param {string} opts.country    pays du visiteur, déduit de son adresse IP
 * @param {string} opts.type       restriction de type ("location", "vente"…)
 * @param {Date}   opts.maintenant instant de référence (rotation, expirations)
 */
export async function composerVitrine(nomEmplacement, { country = null, type = null, maintenant = new Date() } = {}) {
  const emplacement = EMPLACEMENTS[nomEmplacement];
  if (!emplacement) throw new Error(`Emplacement inconnu : ${nomEmplacement}`);
  const adaptateur = ADAPTATEURS[emplacement.source];
  const capacite = emplacement.capacite;
  const typeVoulu = type || emplacement.type;

  const [rangs, vivier] = await Promise.all([
    rangsParProprietaire(),
    candidats(adaptateur, { country, type: typeVoulu, limite: capacite * FACTEUR_VIVIER * 6 }),
  ]);

  const proprioDe = (d) =>
    String(adaptateur.champProprietaire === "_id" ? d._id : d[adaptateur.champProprietaire] || "");
  const acc = accumulateur(capacite);

  // ── 1. Épinglés par un administrateur ───────────────────────────────────
  // Facultatif, et volontairement servi en premier : un administrateur doit
  // pouvoir imposer une annonce sans que le moteur la déclasse.
  if (adaptateur.supporteEpinglage) {
    for (const d of vivier.filter((v) => v.featured)) acc.ajouter(d, "epingle", proprioDe(d), null);
  }

  // ── 2. Boosts achetés ───────────────────────────────────────────────────
  // Même critère que le tri du catalogue : la validité est comparée à l'instant
  // de la requête, aucune tâche planifiée n'a à éteindre un boost échu.
  if (adaptateur.supporteBoost) {
    const boostes = vivier
      .filter((d) => !acc.contient(d._id) && d.sponsoredUntil && new Date(d.sponsoredUntil) > maintenant)
      // Palier décroissant : un boost international passe devant un 24 h. À
      // palier égal, l'identifiant départage — sans quoi l'ordre varierait au
      // gré de Mongo entre deux appels du même jour.
      .sort((a, b) => (b.boostLevel || 0) - (a.boostLevel || 0) || String(a._id).localeCompare(String(b._id)));

    const plafond = Math.min(Math.floor(capacite * PART_MAX_BOOSTS), acc.reste());
    for (const d of fenetreDuJour(boostes, plafond, maintenant)) acc.ajouter(d, "boost", proprioDe(d), null);
  }

  // ── 3. Places d'abonnement ──────────────────────────────────────────────
  for (const plan of PALIERS) {
    if (acc.reste() <= 0) break;
    const rang = PLAN_RANK[plan];
    // Borne HAUTE : sans elle, un abonné Exportateur occuperait aussi les
    // places du Business, et l'avantage vendu au palier inférieur n'existerait
    // pas.
    const rangSuperieur = PALIERS.map((p) => PLAN_RANK[p]).filter((r) => r > rang).sort((a, b) => a - b)[0];
    const eligibles = vivier
      .filter((d) => {
        if (acc.contient(d._id)) return false;
        const r = rangs.get(proprioDe(d));
        return r != null && r >= rang && (rangSuperieur == null || r < rangSuperieur);
      })
      // Tri stable sur l'identifiant : condition pour qu'un décalage produise
      // une rotation, et non un désordre d'un jour sur l'autre.
      .sort((a, b) => String(a._id).localeCompare(String(b._id)));

    const quota = Math.min(PLACES_PAR_PLAN[plan], acc.reste());
    for (const d of fenetreDuJour(eligibles, quota, maintenant)) acc.ajouter(d, "abonnement", proprioDe(d), null);
  }

  // ── 4. Places au mérite ─────────────────────────────────────────────────
  // Ouvert à tous, abonnés compris : un partenaire gratuit dont les annonces
  // sont excellentes doit pouvoir figurer en vitrine.
  if (acc.reste() > 0) {
    const restants = vivier.filter((d) => !acc.contient(d._id));
    const sig = await signaux(emplacement.source, restants, adaptateur);

    const notes = restants
      .map((d) => ({ d, score: scoreDeMerite(adaptateur.profil(d, sig.get(String(d._id)))) }))
      // Départage par identifiant : sans lui, deux scores égaux s'ordonneraient
      // au gré de Mongo et la vitrine changerait sans raison entre deux appels.
      .sort((a, b) => b.score - a.score || String(a.d._id).localeCompare(String(b.d._id)));

    // Rotation DANS le vivier des meilleurs : les bonnes annonces dominent,
    // mais pas éternellement les mêmes.
    const vivierMerite = notes.slice(0, Math.max(acc.reste() * FACTEUR_VIVIER, acc.reste()));
    for (const n of fenetreDuJour(vivierMerite, vivierMerite.length, maintenant)) {
      if (acc.reste() <= 0) break;
      acc.ajouter(n.d, "merite", proprioDe(n.d), n.score);
    }
  }

  return {
    emplacement: nomEmplacement,
    source: emplacement.source,
    pays: country || null,
    // Identifiants BRUTS (ObjectId), en plus des items présentés. Le catalogue
    // les injecte dans un `$match` d'agrégation, où Mongoose ne convertit RIEN :
    // une chaîne hexadécimale n'y apparie aucun ObjectId, et la vitrine
    // revenait vide sans la moindre erreur. Attrapé par un test préexistant.
    ids: acc.retenus.map(({ doc }) => doc._id),
    items: acc.retenus.map(({ doc, origine, score }) => ({
      ...adaptateur.presenter(doc),
      // `origine` est renvoyée pour que l'interface et l'administration
      // puissent expliquer POURQUOI un élément est là. Un classement qu'on ne
      // peut pas expliquer devient impossible à défendre auprès d'un partenaire.
      origine,
      ...(score != null ? { score } : {}),
    })),
    composition: acc.retenus.reduce((c, r) => ({ ...c, [r.origine]: (c[r.origine] || 0) + 1 }), {}),
  };
}

// Version mise en cache — la vitrine est sur la page la plus consultée du site.
// La clé porte le JOUR de rotation : sans lui, une entrée mise en cache la
// veille survivrait au changement de jour et figerait la vitrine.
export async function vitrineEnCache(nomEmplacement, { country = null, type = null } = {}) {
  const cle = buildCacheKey("spotlight", { nomEmplacement, country, type, jour: jourDeRotation() });
  const enCache = cacheGet(cle);
  if (enCache) return enCache;

  const vitrine = await composerVitrine(nomEmplacement, { country, type });

  // Repli MONDIAL, et seulement si le pays du visiteur ne donne RIEN — replier
  // par morceaux mélangerait annonces locales et lointaines dans la même
  // vitrine, ce qu'un visiteur lirait comme une erreur.
  const resultat = (!vitrine.items.length && country)
    ? { ...(await composerVitrine(nomEmplacement, { country: null, type })), repliMondial: true }
    : vitrine;

  cacheSet(cle, resultat, TTL_CACHE_MS);
  return resultat;
}

// Identifiants composant une vitrine — utilisé par le catalogue pour son filtre
// `featured=true`, afin que l'ANCIENNE route et les nouvelles sections servent
// exactement le même ensemble. Deux compositions concurrentes finiraient par se
// contredire sur la même page.
export async function idsVitrine(nomEmplacement, opts = {}) {
  const { ids } = await vitrineEnCache(nomEmplacement, opts);
  return ids || [];
}
