import mongoose from "mongoose";

// ── Clé d'API partenaire (palier Exportateur) ──────────────────────────────
//
// La clé n'est stockée que HACHÉE (SHA-256). Un vol de la base ne donne donc
// aucune clé utilisable — et personne, support ou administrateur compris, ne
// peut la relire : elle n'est affichée qu'une fois, à sa création.
//
// SHA-256 sans bcrypt, contrairement aux mots de passe : une clé est un secret
// de 32 octets tirés au hasard, pas une phrase choisie par un humain. Il n'y a
// rien à deviner par force brute, et l'API doit la vérifier à chaque appel —
// bcrypt y ajouterait des dizaines de millisecondes pour aucune sécurité réelle.
const partnerApiKeySchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

  // Nom donné par le partenaire (« ERP interne », « site vitrine »), pour qu'il
  // sache laquelle révoquer sans avoir à deviner.
  label: { type: String, required: true, maxlength: 60, trim: true },

  keyHash:   { type: String, required: true, unique: true },
  // Début lisible de la clé (ex. « vit_a1b2c3… ») : identifie la clé dans une
  // liste sans jamais révéler le secret.
  keyPrefix: { type: String, required: true },

  // Portées accordées. La lecture seule est le défaut : une intégration qui
  // n'a besoin que de lire ne doit pas pouvoir modifier une disponibilité.
  scopes: {
    type: [String],
    enum: ["vehicles:read", "bookings:read", "vehicles:write"],
    default: ["vehicles:read", "bookings:read"],
  },

  lastUsedAt: { type: Date, default: null },
  usageCount: { type: Number, default: 0 },
  revokedAt:  { type: Date, default: null },
  createdAt:  { type: Date, default: Date.now },
});

// Recherche par hash à chaque appel d'API : sans index unique, c'est un
// balayage complet de la collection sur le chemin le plus chaud.
partnerApiKeySchema.index({ owner: 1, revokedAt: 1 });

const PartnerApiKey = mongoose.models.PartnerApiKey || mongoose.model("PartnerApiKey", partnerApiKeySchema);
export default PartnerApiKey;
