import mongoose from "mongoose";

const MAX_RETRIES = 5;
const RETRY_DELAY = 5000; // ms

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const connectDB = async (attempt = 1) => {
  if (!process.env.MONGO_URI) {
    console.error("❌ MONGO_URI manquant dans .env");
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000, // 10s pour trouver un serveur
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      family: 4,                       // forcer IPv4 (évite problèmes DNS SRV sur certains réseaux)
      retryWrites: true,
    });

    console.log("✅ MongoDB connecté");

    // Événements de reconnexion automatique
    mongoose.connection.on("disconnected", () => {
      console.warn("⚠️  MongoDB déconnecté — tentative de reconnexion...");
    });
    mongoose.connection.on("reconnected", () => {
      console.log("🔄 MongoDB reconnecté");
    });
    mongoose.connection.on("error", (err) => {
      console.error("❌ Erreur MongoDB :", err.message);
    });

  } catch (error) {
    console.error(`❌ Erreur MongoDB (tentative ${attempt}/${MAX_RETRIES}) :`, error.message);

    if (attempt < MAX_RETRIES) {
      console.log(`⏳ Nouvelle tentative dans ${RETRY_DELAY / 1000}s...`);
      await sleep(RETRY_DELAY);
      return connectDB(attempt + 1);
    }

    console.error("💀 Impossible de se connecter à MongoDB après plusieurs tentatives.");
    console.error("\n👉 Vérifiez sur cloud.mongodb.com :");
    console.error("   1. Cluster non mis en pause (onglet 'Clusters')");
    console.error("   2. Votre IP dans la whitelist : Network Access → Add IP → 0.0.0.0/0");
    console.error("   3. Mot de passe correct dans .env\n");
    process.exit(1);
  }
};

export default connectDB;
