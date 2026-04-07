import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  firstName:  { type: String, required: true, trim: true },
  lastName:   { type: String, required: true, trim: true },
  email:      { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:   { type: String, required: true },
  phone:      { type: String, trim: true },

  role: {
    type: String,
    enum: ["client", "partenaire", "admin"],
    default: "client",
  },

  // Photo de profil (URL Cloudinary ou chemin local)
  profilePhoto: { type: String, default: null },

  // Partenaires : statut de vérification des documents
  documentsVerified: { type: Boolean, default: false },

  // Suivi de connexion
  lastLogin: { type: Date, default: null },

  // Désactivation compte
  isActive: { type: Boolean, default: true },

  createdAt: { type: Date, default: Date.now },
});

// Index pour les recherches fréquentes
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });

const User = mongoose.models.User || mongoose.model("User", userSchema);
export default User;
