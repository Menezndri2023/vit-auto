import mongoose from "mongoose";

// ── Acceptation d'une version de conditions de libération (2026-10-31) ─────
//
// Une ligne par partie et par version, jamais modifiée. Elle vise un HASH : si
// le contenu ne lui correspond plus, l'acceptation est refusée. Les
// acceptations d'une version restent attachées à cette version ; une version
// N+1 doit être réacceptée par les deux parties.
//
// Adresse IP volontairement NON conservée : utilisateur authentifié, date,
// version et hash suffisent à prouver l'acceptation, et une IP est une donnée
// personnelle sans besoin démontré ici (à revoir seulement sur avis juridique,
// avec une durée de conservation définie).

const acceptationSchema = new mongoose.Schema({
  conditions:  { type: mongoose.Schema.Types.ObjectId, ref: "ConditionsLiberation", required: true },
  transaction: {
    type: { type: String, enum: ["ie"], required: true },
    id:   { type: mongoose.Schema.Types.ObjectId, required: true },
  },
  version:     { type: Number, required: true },
  hash:        { type: String, required: true },
  partie:      { type: String, enum: ["acheteur", "vendeur"], required: true },
  utilisateur: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  le:          { type: Date, default: Date.now },
}, { versionKey: false });

acceptationSchema.index({ conditions: 1, partie: 1 }, { unique: true });
acceptationSchema.index({ "transaction.type": 1, "transaction.id": 1, version: 1 });

const refuser = (next) => next(new Error("Acceptation immuable."));
acceptationSchema.pre("save", function (next) { return this.isNew ? next() : refuser(next); });
for (const op of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace"]) {
  acceptationSchema.pre(op, function (next) { refuser(next); });
}

const AcceptationConditions = mongoose.models.AcceptationConditions || mongoose.model("AcceptationConditions", acceptationSchema);
export default AcceptationConditions;
