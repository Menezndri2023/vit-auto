import mongoose from "mongoose";

export const initDatabase = async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!uri) {
    console.warn("⚠️  MONGODB_URI non défini — backend sans base de données persistante.");
    return;
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log("✅ MongoDB connecté");
  } catch (err) {
    console.error("❌ Connexion MongoDB échouée :", err.message);
    console.warn("⚠️  Le serveur continue sans base de données persistante.");
  }
};
