import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const res = await mongoose.connection.db.collection("users").updateOne(
    { email: "admin@vitauto.ci" },
    { $set: { emailVerified: true, isActive: true, role: "admin" } }
  );
  console.log("✅ Admin mis à jour:", res.modifiedCount, "document(s)");
  const admin = await mongoose.connection.db.collection("users").findOne({ email: "admin@vitauto.ci" });
  console.log("   emailVerified:", admin.emailVerified);
  console.log("   isActive     :", admin.isActive);
  console.log("   role         :", admin.role);
  await mongoose.disconnect();
}

main().catch(console.error);
