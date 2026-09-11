import { describe, it, expect, beforeAll } from "vitest";
import {
  estUrlDocumentPrive, signerDocumentsDansPayload, retirerSignature,
  contientPeutEtreUnDocumentPrive, signerDocumentsPrives,
} from "../utils/signerDocuments.js";

// ═══════════════════════════════════════════════════════════════════════════
// SIGNATURE DES DOCUMENTS PRIVÉS — UN SEUL POINT DE PASSAGE
// ═══════════════════════════════════════════════════════════════════════════
// Un fichier privé sur ImageKit n'est lisible que par URL signée. Cinq
// contrôleurs renvoient des pièces d'identité sans les signer — sans effet
// tant qu'elles sont en base64 dans MongoDB, image vide le jour où elles sont
// migrées. La signature se fait donc à la frontière de la réponse, pour
// toutes les requêtes authentifiées, où que le document se trouve dans la
// charge utile.

const ENDPOINT = "https://ik.imagekit.io/vitauto";
const PRIVEE   = `${ENDPOINT}/vit-auto/kyc/cni_recto_abc.jpg`;
const PUBLIQUE = `${ENDPOINT}/vit-auto/vehicles/toyota_xyz.jpg`;

beforeAll(() => {
  process.env.IMAGEKIT_URL_ENDPOINT = ENDPOINT;
  // Clés factices : ImageKit signe localement (HMAC), aucun appel réseau.
  process.env.IMAGEKIT_PUBLIC_KEY  ||= "public_test";
  process.env.IMAGEKIT_PRIVATE_KEY ||= "private_test";
});

describe("Reconnaissance d'un document privé", () => {
  it("distingue un dossier privé d'un dossier public, sur notre point d'accès seulement", () => {
    expect(estUrlDocumentPrive(PRIVEE)).toBe(true);
    expect(estUrlDocumentPrive(`${ENDPOINT}/vit-auto/docs/rccm.pdf`)).toBe(true);
    expect(estUrlDocumentPrive(`${ENDPOINT}/vit-auto/drivers/identity/permis.jpg`)).toBe(true);
    expect(estUrlDocumentPrive(`${ENDPOINT}/vit-auto/booking-docs/passeport.jpg`)).toBe(true);
    // Public : photos de véhicules, avatars, CV d'un chauffeur (dossier drivers, pas drivers/identity)
    expect(estUrlDocumentPrive(PUBLIQUE)).toBe(false);
    expect(estUrlDocumentPrive(`${ENDPOINT}/vit-auto/drivers/cv_abc.pdf`)).toBe(false);
    expect(estUrlDocumentPrive(`${ENDPOINT}/vit-auto/avatars/a.jpg`)).toBe(false);
    // Ailleurs qu'ImageKit, ou pas une URL du tout
    expect(estUrlDocumentPrive("https://autre-cdn.example/vit-auto/kyc/x.jpg")).toBe(false);
    expect(estUrlDocumentPrive("data:image/jpeg;base64,AAAA")).toBe(false);
    expect(estUrlDocumentPrive(null)).toBe(false);
    expect(estUrlDocumentPrive(42)).toBe(false);
  });

  it("le filtre rapide écarte les réponses sans document privé", () => {
    expect(contientPeutEtreUnDocumentPrive(JSON.stringify({ a: PUBLIQUE }))).toBe(false);
    expect(contientPeutEtreUnDocumentPrive(JSON.stringify({ a: { b: [PRIVEE] } }))).toBe(true);
  });
});

describe("Signature dans une charge utile", () => {
  it("signe les documents privés où qu'ils soient, et laisse tout le reste intact", () => {
    const entree = {
      user: { identity: { frontImage: PRIVEE, number: "CI-123" }, avatar: PUBLIQUE },
      certification: { level2: { idFrontDoc: { data: PRIVEE } } },
      photos: [PUBLIQUE, PRIVEE],
      n: 3, ok: true, rien: null,
    };
    const sortie = signerDocumentsDansPayload(entree);

    // Signé : la même URL, plus les paramètres de signature ImageKit.
    for (const s of [sortie.user.identity.frontImage, sortie.certification.level2.idFrontDoc.data, sortie.photos[1]]) {
      expect(s.startsWith(PRIVEE + "?")).toBe(true);
      expect(s).toMatch(/ik-t=\d+/);
      expect(s).toMatch(/ik-s=[0-9a-f]+/);
    }
    // Intact : URL publique, texte, nombres, booléens, null.
    expect(sortie.user.avatar).toBe(PUBLIQUE);
    expect(sortie.photos[0]).toBe(PUBLIQUE);
    expect(sortie.user.identity.number).toBe("CI-123");
    expect(sortie.n).toBe(3); expect(sortie.ok).toBe(true); expect(sortie.rien).toBeNull();
    // L'entrée n'est pas modifiée.
    expect(entree.user.identity.frontImage).toBe(PRIVEE);
  });

  it("une URL déjà signée n'est pas signée deux fois", () => {
    const une = signerDocumentsDansPayload(PRIVEE);
    const deux = signerDocumentsDansPayload(une);
    expect((deux.match(/ik-s=/g) || []).length).toBe(1);
  });
});

describe("Retrait de la signature à l'entrée", () => {
  // Un formulaire d'édition renvoie ce qu'il a reçu : un document affiché puis
  // sauvegardé sans modification reviendrait SIGNÉ, et serait stocké avec une
  // date d'expiration — invisible passé 15 minutes.
  it("retire ik-t et ik-s, et rien d'autre", () => {
    const signee = signerDocumentsDansPayload(PRIVEE);
    expect(retirerSignature(signee)).toBe(PRIVEE);
    expect(retirerSignature(`${PRIVEE}?tr=w-200&ik-t=1&ik-s=abc`)).toBe(`${PRIVEE}?tr=w-200`);
    expect(retirerSignature(PUBLIQUE)).toBe(PUBLIQUE);
    expect(retirerSignature("texte quelconque ik-s= sans URL")).toBe("texte quelconque ik-s= sans URL");
  });
});

describe("Middleware sur une requête authentifiée", () => {
  const simuler = (payload, body = {}) => new Promise((resolve) => {
    const req = { body };
    const res = { json: (p) => resolve({ envoye: p, body: req.body }) };
    signerDocumentsPrives(req, res, () => res.json(payload));
  });

  it("signe la réponse et nettoie le corps de la requête", async () => {
    const { envoye, body } = await simuler(
      { user: { identity: { selfie: PRIVEE } }, photo: PUBLIQUE },
      { identity: { frontImage: `${PRIVEE}?ik-t=1&ik-s=deadbeef` }, titre: "x" },
    );
    expect(envoye.user.identity.selfie).toMatch(/ik-s=/);
    expect(envoye.photo).toBe(PUBLIQUE);
    expect(body.identity.frontImage).toBe(PRIVEE);
    expect(body.titre).toBe("x");
  });

  it("laisse passer telle quelle une réponse sans document privé", async () => {
    // Le chemin rapide : pas de nouvelle sérialisation, même objet renvoyé.
    const payload = { vehicles: [{ images: [PUBLIQUE] }], total: 1 };
    const { envoye } = await simuler(payload);
    expect(envoye).toBe(payload);
  });

  it("normalise les dates et identifiants comme res.json l'aurait fait", async () => {
    const d = new Date("2026-09-11T00:00:00.000Z");
    const { envoye } = await simuler({ quand: d, doc: PRIVEE });
    expect(envoye.quand).toBe("2026-09-11T00:00:00.000Z");
    expect(envoye.doc).toMatch(/ik-s=/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DE BOUT EN BOUT : authenticate → contrôleur → réponse signée
// ═══════════════════════════════════════════════════════════════════════════
// C'est ce chemin, et lui seul, qui prouve que les cinq contrôleurs concernés
// n'ont plus besoin de signer eux-mêmes. Validé à l'envers : si l'appel à
// signerDocumentsPrives est retiré d'`authenticate`, l'URL revient nue.
import jwt from "jsonwebtoken";
import { authenticate } from "../middleware/auth.js";
import { getKycDetail } from "../controllers/kycController.js";
import { getPendingIdentities } from "../controllers/usersController.js";
import { encryptField } from "../utils/fieldEncryption.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

const jeton = (u) => jwt.sign({ id: u._id, email: u.email, role: u.role, tokenVersion: u.tokenVersion || 0 },
  process.env.JWT_SECRET, { expiresIn: "1h" });

// Enchaîne authenticate puis le contrôleur, comme Express le ferait.
async function appelerEnAuthentifie(admin, controleur, { params = {}, query = {} } = {}) {
  const { req, res } = mockReqRes({ params, query });
  req.headers.authorization = `Bearer ${jeton(admin)}`;
  await new Promise((resolve) => authenticate(req, res, resolve));
  await controleur(req, res);
  return res;
}

describe("Un dossier KYC dont la pièce est sur ImageKit privé", () => {
  it("revient à l'admin avec une URL signée, sans que kycController ne signe rien", async () => {
    const admin = await createUser({ role: "admin", email: "adm@vitauto-fixtures.fr" });
    // La pièce est CHIFFRÉE en base (fieldEncryption) : getKycDetail déchiffre,
    // puis la frontière signe — les deux étapes doivent s'enchaîner.
    const client = await createUser({
      role: "client", email: "kyc@vitauto-fixtures.fr",
      identity: { type: "cni", status: "pending", frontImage: encryptField(PRIVEE), selfie: encryptField(PRIVEE) },
    });

    const res = await appelerEnAuthentifie(admin, getKycDetail, { params: { userId: String(client._id) } });

    expect(res.statusCode, JSON.stringify(res.body).slice(0, 150)).toBe(200);
    const id = res.body.user.identity;
    expect(id.frontImage.startsWith(PRIVEE + "?")).toBe(true);
    expect(id.frontImage).toMatch(/ik-s=[0-9a-f]+/);
    expect(id.selfie).toMatch(/ik-s=[0-9a-f]+/);
  });

  it("une pièce encore en base64 traverse sans être touchée", async () => {
    const admin = await createUser({ role: "admin", email: "adm2@vitauto-fixtures.fr" });
    const b64 = "data:image/jpeg;base64,QUJD";
    const client = await createUser({
      role: "client", email: "kyc2@vitauto-fixtures.fr",
      identity: { type: "cni", status: "pending", frontImage: encryptField(b64) },
    });
    const res = await appelerEnAuthentifie(admin, getKycDetail, { params: { userId: String(client._id) } });
    expect(res.body.user.identity.frontImage).toBe(b64);
  });

  it("la liste des pièces en attente ne porte toujours aucune image, signée ou non", async () => {
    const admin = await createUser({ role: "admin", email: "adm3@vitauto-fixtures.fr" });
    await createUser({ role: "client", email: "kyc3@vitauto-fixtures.fr",
      identity: { type: "cni", status: "pending", submittedAt: new Date(), frontImage: encryptField(PRIVEE) } });
    const res = await appelerEnAuthentifie(admin, getPendingIdentities);
    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("vit-auto/kyc");
  });
});
