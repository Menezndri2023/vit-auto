// ═══════════════════════════════════════════════════════════════════════════
// GESTION DES CLÉS D'API PARTENAIRE — palier Exportateur
// ═══════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import logger from "../utils/logger.js";
import PartnerApiKey from "../models/PartnerApiKey.js";
import { hashCle } from "../middleware/apiKeyAuth.js";
import { API_RATE_LIMIT_PER_HOUR } from "../constants/planFeatures.js";

const PORTEES = ["vehicles:read", "bookings:read", "vehicles:write"];
const MAX_CLES_ACTIVES = 5;

const vueCle = (k) => ({
  _id: k._id,
  label: k.label,
  prefixe: k.keyPrefix,
  scopes: k.scopes,
  lastUsedAt: k.lastUsedAt,
  usageCount: k.usageCount,
  revokedAt: k.revokedAt,
  createdAt: k.createdAt,
});

export const listKeys = async (req, res) => {
  try {
    const cles = await PartnerApiKey.find({ owner: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json({
      cles: cles.map(vueCle),
      quotaHoraire: API_RATE_LIMIT_PER_HOUR,
      portees: PORTEES,
      baseUrl: "/api/v1",
    });
  } catch (err) {
    logger.error("listKeys:", err);
    res.status(500).json({ message: "Erreur récupération des clés.", error: err.message });
  }
};

export const createKey = async (req, res) => {
  try {
    const { label, scopes } = req.body || {};
    if (!label?.trim()) return res.status(400).json({ message: "Donnez un nom à cette clé (ex. « ERP interne »)." });

    if (scopes !== undefined) {
      if (!Array.isArray(scopes) || !scopes.length || scopes.some((s) => !PORTEES.includes(s))) {
        return res.status(400).json({ message: "Portées invalides." });
      }
    }

    const actives = await PartnerApiKey.countDocuments({ owner: req.user._id, revokedAt: null });
    if (actives >= MAX_CLES_ACTIVES) {
      return res.status(409).json({ message: `Vous avez déjà ${MAX_CLES_ACTIVES} clés actives. Révoquez-en une avant d'en créer une nouvelle.` });
    }

    // 32 octets d'entropie. Le préfixe « vit_ » rend la clé reconnaissable dans
    // un dépôt de code — c'est ce qui permet aux outils de détection de secrets
    // de la repérer avant qu'elle ne parte en public.
    const secret = `vit_${crypto.randomBytes(32).toString("base64url")}`;

    const cle = await PartnerApiKey.create({
      owner: req.user._id,
      label: label.trim().slice(0, 60),
      keyHash: hashCle(secret),
      keyPrefix: `${secret.slice(0, 12)}…`,
      scopes: scopes || undefined,
    });

    res.status(201).json({
      cle: vueCle(cle),
      // Seule et unique apparition du secret. Il n'est stocké que haché : ni le
      // support ni l'administrateur ne pourront le retrouver.
      secret,
      avis: "Copiez cette clé maintenant : elle ne sera plus jamais affichée. En cas de perte, révoquez-la et créez-en une nouvelle.",
    });
  } catch (err) {
    logger.error("createKey:", err);
    res.status(500).json({ message: "Erreur création de la clé.", error: err.message });
  }
};

export const revokeKey = async (req, res) => {
  try {
    const cle = await PartnerApiKey.findOne({ _id: req.params.id, owner: req.user._id });
    if (!cle) return res.status(404).json({ message: "Clé introuvable." });
    if (cle.revokedAt) return res.json({ cle: vueCle(cle) }); // idempotent : révoquer deux fois n'est pas une erreur
    cle.revokedAt = new Date();
    await cle.save();
    res.json({ cle: vueCle(cle) });
  } catch (err) {
    logger.error("revokeKey:", err);
    res.status(500).json({ message: "Erreur révocation de la clé.", error: err.message });
  }
};
