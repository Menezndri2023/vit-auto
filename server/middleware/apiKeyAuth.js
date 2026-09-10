// ── Authentification par clé d'API partenaire ──────────────────────────────
//
// Volontairement SÉPARÉE de l'authentification JWT : une clé d'API n'ouvre pas
// une session. Elle ne donne accès qu'aux routes /api/v1/* et seulement dans
// les portées accordées — jamais au compte, jamais aux paiements, jamais aux
// documents. Réutiliser `authenticate` aurait donné à une clé volée exactement
// les mêmes pouvoirs qu'un mot de passe.
import crypto from "crypto";
import logger from "../utils/logger.js";
import PartnerApiKey from "../models/PartnerApiKey.js";
import User from "../models/User.js";
import { planEffectif } from "../services/planAccess.js";
import { planOuvre, API_RATE_LIMIT_PER_HOUR } from "../constants/planFeatures.js";

export const hashCle = (cle) => crypto.createHash("sha256").update(cle).digest("hex");

// Compteur horaire en mémoire du processus. Assumé comme tel : le quota sert à
// contenir une intégration mal réglée qui boucle, pas à repousser un attaquant
// — l'authentification, elle, ne dépend pas de ce compteur.
const appels = new Map();
const FENETRE_MS = 60 * 60 * 1000;

function quotaDepasse(idCle) {
  const maintenant = Date.now();
  const e = appels.get(idCle);
  if (!e || maintenant - e.debut >= FENETRE_MS) {
    appels.set(idCle, { debut: maintenant, n: 1 });
    return false;
  }
  e.n += 1;
  return e.n > API_RATE_LIMIT_PER_HOUR;
}

// Purge périodique : sans elle, la Map grossit indéfiniment avec les clés
// devenues inactives — une fuite de mémoire lente mais certaine.
const purge = setInterval(() => {
  const maintenant = Date.now();
  for (const [k, e] of appels) if (maintenant - e.debut >= FENETRE_MS) appels.delete(k);
}, FENETRE_MS);
purge.unref?.();

export const authenticateApiKey = async (req, res, next) => {
  try {
    // Deux formes acceptées : en-tête dédié, ou « Authorization: Bearer ». La
    // seconde est ce que tentera spontanément un développeur.
    const brute = req.headers["x-api-key"]
      || (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
    if (!brute) {
      return res.status(401).json({ error: "cle_manquante", message: "Fournissez votre clé dans l'en-tête X-API-Key." });
    }

    const cle = await PartnerApiKey.findOne({ keyHash: hashCle(brute.trim()) });
    if (!cle || cle.revokedAt) {
      return res.status(401).json({ error: "cle_invalide", message: "Clé inconnue ou révoquée." });
    }

    const titulaire = await User.findById(cle.owner).select("firstName lastName email country isActive role");
    if (!titulaire || !titulaire.isActive) {
      return res.status(403).json({ error: "compte_inactif", message: "Le compte associé à cette clé n'est plus actif." });
    }

    // L'abonnement est revérifié à CHAQUE appel : une clé créée sous un plan
    // Exportateur ne doit pas survivre à son échéance.
    const plan = await planEffectif(cle.owner);
    if (!planOuvre(plan, "accesApi")) {
      return res.status(403).json({ error: "plan_requis", message: "L'accès API nécessite un abonnement Exportateur actif." });
    }

    if (quotaDepasse(String(cle._id))) {
      return res.status(429).json({
        error: "quota_depasse",
        message: `Limite de ${API_RATE_LIMIT_PER_HOUR} appels par heure atteinte.`,
      });
    }

    // Trace d'usage en tâche de fond : un `await` ici ajouterait une écriture
    // synchrone au chemin critique de chaque appel, pour une donnée dont la
    // fraîcheur à la seconde n'a aucun intérêt.
    PartnerApiKey.updateOne({ _id: cle._id }, { $set: { lastUsedAt: new Date() }, $inc: { usageCount: 1 } })
      .catch((e) => logger.error("trace usage clé API (non bloquant) :", e.message));

    req.apiKey = cle;
    req.apiOwner = titulaire;
    next();
  } catch (err) {
    logger.error("authenticateApiKey:", err);
    res.status(500).json({ error: "erreur_interne", message: "Erreur d'authentification." });
  }
};

// Exige une portée précise. Séparé de l'authentification : une clé valide n'est
// pas une clé autorisée à écrire.
export const exigePortee = (scope) => (req, res, next) => {
  if (!req.apiKey?.scopes?.includes(scope)) {
    return res.status(403).json({ error: "portee_manquante", message: `Cette clé n'a pas la portée « ${scope} ».` });
  }
  next();
};
