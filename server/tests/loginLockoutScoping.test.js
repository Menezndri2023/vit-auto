import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import { login } from "../controllers/authController.js";
import User from "../models/User.js";
import { createUser } from "./helpers/fixtures.js";

// Déni de service ciblé corrigé (audit sécurité 2026-09).
//
// Le verrouillage après 5 échecs était GLOBAL et répétable indéfiniment :
// quiconque connaissait l'e-mail d'un partenaire ou d'un admin — visible sur
// les fiches publiques — le tenait hors de son propre compte en permanence, en
// envoyant 5 mauvais mots de passe toutes les 15 minutes depuis n'importe où.
// La victime n'avait aucun recours, et n'était même pas informée.
//
// Le verrou ne s'applique désormais qu'à l'ADRESSE fautive. Une attaque menée
// depuis de nombreuses adresses reste couverte : au-delà de 30 échecs
// consécutifs, le verrou redevient global ET le titulaire est prévenu.

const MOT_DE_PASSE = "unMotDePasseSolide123";

async function creerCompte(email) {
  return createUser({
    email,
    password: await bcrypt.hash(MOT_DE_PASSE, 10),
    emailVerified: true,
  });
}

// `login` lit req.ip : on simule des origines distinctes.
function requete({ email, password, ip }) {
  const req = { body: { identifier: email, password }, ip, headers: {}, get: () => undefined };
  const res = {
    statusCode: 200,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
  return { req, res };
}

const echouer = async (email, ip, fois) => {
  for (let i = 0; i < fois; i++) {
    const { req, res } = requete({ email, password: "mauvais-mot-de-passe", ip });
    await login(req, res);
  }
};

describe("Verrouillage de connexion — ciblé sur l'adresse fautive", () => {
  it("verrouille l'attaquant après 5 échecs", async () => {
    const email = "cible1@example.test";
    await creerCompte(email);
    await echouer(email, "203.0.113.10", 5);

    const { req, res } = requete({ email, password: "encore-faux", ip: "203.0.113.10" });
    await login(req, res);
    expect(res.statusCode).toBe(429);
  });

  it("NE bloque PAS le titulaire légitime, qui se connecte depuis une autre adresse", async () => {
    const email = "cible2@example.test";
    await creerCompte(email);
    await echouer(email, "203.0.113.10", 5); // attaquant

    // La victime, depuis chez elle, avec son vrai mot de passe.
    const { req, res } = requete({ email, password: MOT_DE_PASSE, ip: "198.51.100.7" });
    await login(req, res);

    expect(res.statusCode, "le déni de service ciblé doit être impossible").toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it("une connexion réussie efface le verrou et remet le compteur à zéro", async () => {
    const email = "cible3@example.test";
    const user = await creerCompte(email);
    await echouer(email, "203.0.113.10", 5);

    const { req, res } = requete({ email, password: MOT_DE_PASSE, ip: "198.51.100.7" });
    await login(req, res);

    const fresh = await User.findById(user._id).select("failedLoginAttempts lockUntil lockIp");
    expect(fresh.failedLoginAttempts).toBe(0);
    expect(fresh.lockUntil).toBeNull();
    expect(fresh.lockIp).toBeNull();
  });

  it("escalade en verrou GLOBAL au-delà de 30 échecs (attaque distribuée)", async () => {
    const email = "cible4@example.test";
    const user = await creerCompte(email);

    // 30 échecs répartis sur 30 adresses différentes : aucun verrou ciblé ne
    // gênerait l'attaquant, d'où l'escalade.
    for (let i = 0; i < 30; i++) {
      const { req, res } = requete({ email, password: "faux", ip: `203.0.113.${i + 1}` });
      await login(req, res);
    }

    const fresh = await User.findById(user._id).select("lockUntil lockIp");
    expect(fresh.lockUntil).toBeTruthy();
    expect(fresh.lockIp, "un verrou global n'est associé à aucune adresse").toBeNull();

    // Même le titulaire est bloqué à ce stade — c'est assumé : le compte est
    // sous attaque active, et il a été notifié.
    const { req, res } = requete({ email, password: MOT_DE_PASSE, ip: "198.51.100.7" });
    await login(req, res);
    expect(res.statusCode).toBe(429);
  });
});
