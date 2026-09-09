import mongoose from "mongoose";

// Barème douanier/logistique configuré par l'admin, un document par PAYS DE
// DESTINATION (nom de pays, même convention que ImportExportListing.sourceCountry/
// availableIn — chaîne libre suggérée par datalist, pas un enum ISO strict).
// Tous les montants fixes sont saisis en USD (devise de référence du moteur de
// calcul, voir server/utils/exchangeRates.js) puis convertis à l'affichage
// dans la devise de l'annonce/transaction concernée.
//
// Simplification volontaire du barème réel (douane variable selon l'âge du
// véhicule, la cylindrée, la valeur CIF précise...) : v1 applique un taux fixe
// par pays. Un raffinement par tranche d'âge/cylindrée est un chantier futur,
// pas un objectif de cette première version.
const importCostConfigSchema = new mongoose.Schema({
  country: { type: String, required: true, unique: true, trim: true },

  // ── Douane / fiscalité import ──────────────────────────────────────────
  customsDutyPercent: { type: Number, default: 20 },   // % appliqué sur la base CIF (prix + fret + assurance)
  vatPercent:         { type: Number, default: 18 },   // % appliqué sur (CIF + droits + parafiscale)

  // ── Mode de calcul des taux ───────────────────────────────────────────────
  // Deux pays, deux façons de publier leur fiscalité — et confondre les deux
  // donne un devis faux de plusieurs points.
  //
  // "nested" (défaut, cas marocain) : la TVA porte sur CIF + droits +
  //   parafiscale. Les taux s'empilent.
  //
  // "effective_cif" (cas sénégalais) : la douane publie des taux CUMULÉS déjà
  //   rapportés au CIF. Pour un véhicule de tourisme usagé par voie maritime,
  //   elle annonce 22,900 % de droits, 21,780 % de TVA et 4,283 % de droit
  //   d'enregistrement — soit 48,963 % du CIF. Ces 21,780 % NE SONT PAS 18 %
  //   appliqués à une base élargie : c'est le résultat final, publié tel quel.
  //   Les recalculer en les empilant donnerait un autre chiffre que celui de
  //   l'administration.
  rateBasis: { type: String, enum: ["nested", "effective_cif"], default: "nested" },

  // Droit d'enregistrement — existe au Sénégal (4,283 % du CIF), absent au
  // Maroc. 0 par défaut : sans effet sur les barèmes qui ne le déclarent pas.
  registrationPercent: { type: Number, default: 0 },

  // ── Taxe parafiscale à l'importation ──────────────────────────────────────
  // POURCENTAGE de la valeur CIF, distinct des redevances fixes plus bas. Le
  // barème ne savait exprimer que des montants fixes : impossible d'y traduire
  // la TPI marocaine (0,25 % du CIF), qui entre en plus dans l'assiette de la
  // TVA. Un calcul « exact » qui l'omet ne l'est pas.
  // 0 par défaut : les barèmes déjà configurés ne changent pas de résultat.
  parafiscalPercent: { type: Number, default: 0 },

  // ── Taux préférentiels par origine ────────────────────────────────────────
  // Un droit d'importation ne dépend pas que du pays de DESTINATION : il dépend
  // aussi de l'ORIGINE, via les accords commerciaux. Au Maroc, un véhicule
  // d'origine UE relève de l'accord d'association (2,5 %) quand un véhicule
  // chinois paie le taux plein (17,5 %) — plusieurs milliers de dirhams d'écart
  // sur la même voiture. Annoncer un taux unique, c'était se tromper pour la
  // moitié du catalogue.
  //
  // `origins` : codes ISO-2 du pays d'origine. La première règle qui contient
  // l'origine l'emporte ; à défaut, `customsDutyPercent` s'applique.
  preferentialDuty: [
    {
      _id:     false,
      label:   { type: String, trim: true, default: null },  // ex. « Accord d'association UE »
      origins: { type: [String], default: [] },
      percent: { type: Number, required: true },
    },
  ],

  // ── Limite d'âge à l'importation ──────────────────────────────────────────
  // Plusieurs pays INTERDISENT l'importation au-delà d'un certain âge — 5 ans
  // au Maroc pour un véhicule particulier. Ce n'est pas une surtaxe : le
  // véhicule ne peut pas entrer. Afficher un prix rendu pour une voiture qui
  // sera refusée au port est pire que de n'afficher aucun prix.
  // null = aucune limite déclarée.
  maxVehicleAgeYears: { type: Number, default: null },
  transitFixedFeeUSD: { type: Number, default: 150 },  // frais de transit/dédouanement fixes
  redevancesFixedFeeUSD: { type: Number, default: 100 }, // redevances diverses (statistique, informatique...)

  // Surtaxe sur les véhicules d'occasion au-delà d'un certain âge — pratique
  // courante dans plusieurs pays d'Afrique de l'Ouest. 0 = désactivé (comportement
  // par défaut, n'affecte pas les barèmes déjà configurés avant cet ajout).
  ageSurchargeThresholdYears: { type: Number, default: 8 },
  ageSurchargePercent:        { type: Number, default: 0 }, // ajouté à customsDutyPercent si véhicule plus vieux que le seuil

  // ── Frais portuaires & livraison (côté destination) ────────────────────
  portFeesFixedUSD:      { type: Number, default: 300 },
  deliveryFixedFeeUSD:   { type: Number, default: 200 }, // port → ville principale

  // ── Assurance maritime ──────────────────────────────────────────────────
  insurancePercent: { type: Number, default: 1 }, // % de la valeur du véhicule

  // ── Fret maritime par défaut (utilisé si aucune ShippingLaneRate exacte
  // n'est configurée pour la paire origine/destination) ──────────────────
  defaultSeaFreightUSD: { type: Number, default: 1200 },

  // ── Traçabilité et péremption ─────────────────────────────────────────────
  // Un barème douanier n'est pas une constante : un pays peut relever ses
  // droits ou changer sa limite d'âge d'une loi de finances à l'autre. AUCUNE
  // administration ne publie ces taux via une interface machine — la mise à
  // jour ne peut donc pas être automatique, et prétendre le contraire ferait
  // pire que mieux : un barème périmé qu'on croit à jour est plus dangereux
  // qu'un barème qu'on sait à vérifier.
  //
  // On date et on source donc chaque barème, et on alerte quand il vieillit :
  // l'administration voit lesquels sont à revoir, et le devis présenté à
  // l'acheteur peut le signaler plutôt que d'affirmer un montant périmé.
  source:            { type: String, trim: true, default: null },  // ex. « douane.gov.ma — loi de finances 2026 »
  lastVerifiedAt:    { type: Date, default: null },
  reviewEveryMonths: { type: Number, default: 12 },

  active: { type: Boolean, default: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

const ImportCostConfig = mongoose.models.ImportCostConfig || mongoose.model("ImportCostConfig", importCostConfigSchema);
export default ImportCostConfig;
