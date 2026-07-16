import { beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

// Positionné avant toute connexion/appel — FIELD_ENCRYPTION_KEY est lue de
// façon paresseuse par server/utils/fieldEncryption.js (KYC), pas besoin
// qu'elle soit valide en prod, juste présente et au bon format ici.
process.env.FIELD_ENCRYPTION_KEY ||= "d31b4c3c30b59f3cc420e6d16a5429f3ecf6fdfbbb09e5b1fb95809d5a92e0c6";
process.env.JWT_SECRET ||= "test-jwt-secret";
process.env.REFRESH_TOKEN_SECRET ||= "test-refresh-token-secret";
process.env.NODE_ENV ||= "test";

// Un test qui importe server.js (voir tests/http.*.test.js) déclenche
// dotenv.config(), qui charge server/.env — dotenv ne réécrit jamais une
// variable déjà définie, donc les variables ci-dessus restent protégées, mais
// tout le reste (clés Stripe/Resend/Redis/Sentry réelles) serait chargé tel
// quel si présent dans le .env local du développeur. On bloque explicitement
// ces variables à vide pour qu'aucun test n'appelle jamais un vrai service
// externe, même par accident.
for (const key of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "RESEND_API_KEY", "STRIPE_SECRET_KEY", "REDIS_URL", "SENTRY_DSN", "TWILIO_ACCOUNT_SID", "WHATSAPP_TOKEN", "IMAGEKIT_PUBLIC_KEY"]) {
  process.env[key] = "";
}

let mongod;

// Replica set à un seul membre (pas un simple MongoMemoryServer standalone) :
// bookingController.createBooking utilise mongoose.startSession()/withTransaction()
// pour empêcher un double-booking en cas de requêtes concurrentes — les
// transactions MongoDB exigent un replica set, une instance standalone les
// rejette ("Transaction numbers are only allowed on a replica set member").
beforeAll(async () => {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGO_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGO_URI);
}, 60000);

// Isolation entre tests — base vidée après chaque test plutôt qu'après chaque
// fichier, pour qu'un test ne dépende jamais de l'état laissé par un autre.
afterEach(async () => {
  await mongoose.connection.dropDatabase();
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});
