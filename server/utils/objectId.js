import mongoose from "mongoose";

// Un identifiant Mongo malformé passé à findById/findOne({_id}) lève un
// CastError, systématiquement rattrapé par le `catch` du contrôleur et renvoyé
// en 500 "Erreur serveur." — alors qu'il s'agit d'une entrée invalide (400/404),
// pas d'une panne. Symptôme réel constaté côté partenaire : "erreur serveur" en
// ouvrant une conversation depuis une ligne de commande locale (id numérique).
//
// Le middleware validateObjectId couvre déjà les paramètres d'URL ; ce helper
// couvre les identifiants reçus dans le CORPS de la requête, que le middleware
// ne voit pas.
export const isValidObjectId = (v) =>
  (typeof v === "string" || v instanceof mongoose.Types.ObjectId) &&
  mongoose.Types.ObjectId.isValid(String(v));

// Vrai seulement si la valeur est fournie ET malformée (une valeur absente est
// gérée par les contrôles d'obligation propres à chaque contrôleur).
export const isMalformedObjectId = (v) =>
  v !== undefined && v !== null && v !== "" && !isValidObjectId(v);
