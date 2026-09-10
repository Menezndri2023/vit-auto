// ═══════════════════════════════════════════════════════════════════════════
// API PARTENAIRE v1 — surface publique, authentifiée par clé
// ═══════════════════════════════════════════════════════════════════════════
// Contrat volontairement ÉTROIT et stable. Chaque champ exposé ici devient une
// promesse : un partenaire qui bâtit son ERP dessus ne pardonnera pas un
// renommage. Renvoyer un document Mongoose brut aurait publié tout le schéma,
// y compris les champs internes — et rendu toute évolution du modèle
// rétro-incompatible.
import logger from "../utils/logger.js";
import Vehicle from "../models/Vehicle.js";
import Booking from "../models/Booking.js";

const MAX_LIMITE = 100;
const lirePagination = (q) => {
  // `parseInt("-5") || 50` ne retombe PAS sur 50 : -5 est truthy. Le Math.max
  // qui suivait ramenait alors la limite à 1, et une intégration qui envoie une
  // valeur négative par erreur recevait un véhicule par page sans rien
  // comprendre. Toute valeur non strictement positive est donc traitée comme
  // absente, et le défaut s'applique.
  const limit = parseInt(q.limit, 10);
  const offset = parseInt(q.offset, 10);
  return {
    limite: Number.isFinite(limit) && limit > 0 ? Math.min(limit, MAX_LIMITE) : 50,
    saut:   Number.isFinite(offset) && offset > 0 ? offset : 0,
  };
};

const vueVehicule = (v) => ({
  id: String(v._id),
  titre: v.title,
  marque: v.marque,
  modele: v.modele,
  annee: v.annee,
  type: v.type,
  ville: v.ville,
  pays: v.country,
  prix_jour: v.pricePerDay ?? null,
  prix_vente: v.priceForSale ?? null,
  devise: v.currency || "USD",
  disponible: !!v.available,
  statut: v.status,
  vues: v.vues || 0,
  photo: v.images?.[0] || null,
  cree_le: v.createdAt,
  maj_le: v.updatedAt,
});

const vueReservation = (b) => ({
  id: String(b._id),
  vehicule_id: b.vehicle ? String(b.vehicle) : null,
  statut: b.status,
  type: b.type || null,
  debut: b.location?.startDate || b.essai?.preferredDate || null,
  fin:   b.location?.endDate   || b.essai?.dateFin || null,
  jours: b.location?.days ?? null,
  montant_total: b.montantTotal ?? 0,
  // Booking ne porte AUCUN champ de devise : les montants y sont stockés en USD
  // (voir le commentaire de serviceFeeFCFA dans le modèle). Écrire
  // `b.currency || "USD"` aurait laissé croire à un champ lu, alors qu'il
  // n'existe pas — et masqué le jour où une devise serait réellement ajoutée.
  devise: "USD",
  // Le nom du client est nécessaire pour rapprocher la réservation d'un dossier
  // interne. Son e-mail, son téléphone et ses pièces d'identité ne le sont pas :
  // une clé volée ne doit pas exfiltrer un fichier client.
  client: [b.clientInfo?.firstName, b.clientInfo?.lastName].filter(Boolean).join(" ") || null,
  cree_le: b.createdAt,
});

// GET /api/v1/vehicles
export const apiListVehicles = async (req, res) => {
  try {
    const { limite, saut } = lirePagination(req.query);
    const filtre = { owner: req.apiOwner._id };
    if (req.query.status)    filtre.status = String(req.query.status);
    if (req.query.available) filtre.available = req.query.available === "true";

    const [total, vehicules] = await Promise.all([
      Vehicle.countDocuments(filtre),
      Vehicle.find(filtre).sort({ createdAt: -1 }).skip(saut).limit(limite)
        .select("title marque modele annee type ville country pricePerDay priceForSale currency available status vues images createdAt updatedAt")
        .lean(),
    ]);
    res.json({ total, limit: limite, offset: saut, data: vehicules.map(vueVehicule) });
  } catch (err) {
    logger.error("apiListVehicles:", err);
    res.status(500).json({ error: "erreur_interne", message: err.message });
  }
};

// GET /api/v1/vehicles/:id
export const apiGetVehicle = async (req, res) => {
  try {
    // Le propriétaire fait partie du FILTRE, pas d'un test après lecture : un
    // identifiant appartenant à un autre partenaire renvoie 404, sans révéler
    // qu'il existe.
    const v = await Vehicle.findOne({ _id: req.params.id, owner: req.apiOwner._id }).lean();
    if (!v) return res.status(404).json({ error: "introuvable", message: "Véhicule introuvable." });
    res.json({ data: vueVehicule(v) });
  } catch (err) {
    logger.error("apiGetVehicle:", err);
    res.status(500).json({ error: "erreur_interne", message: err.message });
  }
};

// PATCH /api/v1/vehicles/:id/availability
//
// La seule écriture ouverte, et c'est délibéré : synchroniser une disponibilité
// depuis un logiciel de gestion est le besoin réel d'un loueur, et cette
// opération ne peut ni créer une annonce non modérée ni changer un prix.
export const apiSetAvailability = async (req, res) => {
  try {
    const { available } = req.body || {};
    if (typeof available !== "boolean") {
      return res.status(400).json({ error: "parametre_invalide", message: "Le champ « available » doit valoir true ou false." });
    }
    const v = await Vehicle.findOneAndUpdate(
      { _id: req.params.id, owner: req.apiOwner._id },
      { $set: { available } },
      { new: true }
    ).lean();
    if (!v) return res.status(404).json({ error: "introuvable", message: "Véhicule introuvable." });
    res.json({ data: vueVehicule(v) });
  } catch (err) {
    logger.error("apiSetAvailability:", err);
    res.status(500).json({ error: "erreur_interne", message: err.message });
  }
};

// GET /api/v1/bookings
export const apiListBookings = async (req, res) => {
  try {
    const { limite, saut } = lirePagination(req.query);
    // Les réservations n'ont pas de champ « propriétaire » : elles se rattachent
    // au partenaire par le véhicule. Sans cette résolution préalable, filtrer
    // directement exposerait les réservations de toute la plateforme.
    const ids = (await Vehicle.find({ owner: req.apiOwner._id }).select("_id").lean()).map((v) => v._id);
    if (!ids.length) return res.json({ total: 0, limit: limite, offset: saut, data: [] });

    const filtre = { vehicle: { $in: ids } };
    if (req.query.status) filtre.status = String(req.query.status);

    const [total, reservations] = await Promise.all([
      Booking.countDocuments(filtre),
      Booking.find(filtre).sort({ createdAt: -1 }).skip(saut).limit(limite).lean(),
    ]);
    res.json({ total, limit: limite, offset: saut, data: reservations.map(vueReservation) });
  } catch (err) {
    logger.error("apiListBookings:", err);
    res.status(500).json({ error: "erreur_interne", message: err.message });
  }
};

// GET /api/v1/me — permet à un développeur de vérifier sa clé en un appel.
export const apiWhoAmI = (req, res) => {
  res.json({
    data: {
      compte: [req.apiOwner.firstName, req.apiOwner.lastName].filter(Boolean).join(" "),
      pays: req.apiOwner.country || null,
      cle: req.apiKey.label,
      portees: req.apiKey.scopes,
    },
  });
};
