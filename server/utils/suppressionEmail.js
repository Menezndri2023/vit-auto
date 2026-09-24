// ── Adresses qui ne reçoivent plus rien ────────────────────────────────────
//
// Une adresse qui rebondit continue d'être sollicitée à chaque campagne, et
// chaque rebond dégrade la réputation du domaine expéditeur pour TOUS les
// autres destinataires. Resend suspend un compte dont le taux de rebond monte.
//
// Constaté en production le 2026-09-24, sur les 30 derniers jours : 20 échecs
// subsistaient après le garde-fou « comptes de test » du 13/09, et 19 d'entre
// eux visaient trois adresses de VIT AUTO elle-même — la boîte admin
// `@vitauto.ci` (14 rebonds du rapport hebdomadaire) et les deux comptes de
// démonstration Apple, qui sont des comptes fonctionnels SANS boîte réelle.
// Aucun n'est un « compte de test » au sens de comptesDeTest.js : le drapeau
// et les domaines réservés ne pouvaient pas les attraper.
//
// La liste se déduit donc des FAITS — ce que le fournisseur a réellement
// rejeté — plutôt que d'une énumération à tenir à jour.
import CommunicationLog from "../models/CommunicationLog.js";
import { cacheGet, cacheSet } from "./catalogCache.js";
import logger from "./logger.js";

const CLE_CACHE = "emails-supprimes";
const TTL_MS = 10 * 60 * 1000;

// Deux rebonds suffisent : une adresse qui a refusé deux fois ne se remettra
// pas à accepter d'elle-même, et attendre le troisième ne fait qu'ajouter un
// rebond de plus au compteur qui nous fait suspendre.
export const SEUIL_REBONDS = 2;

// Fenêtre d'observation. Au-delà, on redonne sa chance à l'adresse : une boîte
// pleine se vide, un domaine mal configuré se répare, et un client qui revient
// ne doit pas rester muet pour toujours à cause d'un incident de l'été.
export const FENETRE_JOURS = 90;

// Ces messages partent MALGRÉ la suppression : ils sont demandés à l'instant
// par la personne elle-même, et la bloquer l'enfermerait dehors — un compte
// dont on ne peut plus réinitialiser le mot de passe est un compte perdu.
export const MODELES_TOUJOURS_ENVOYES = new Set([
  "email_verification",
  "password_reset",
]);

/** Adresses (minuscules) à ne plus solliciter. */
export async function adressesSupprimees() {
  const enCache = cacheGet(CLE_CACHE);
  if (enCache) return enCache;

  let ensemble = new Set();
  try {
    const depuis = new Date(Date.now() - FENETRE_JOURS * 86400000);
    const lignes = await CommunicationLog.aggregate([
      { $match: { channel: "email", status: "bounced", createdAt: { $gte: depuis } } },
      { $group: { _id: { $toLower: "$to" }, n: { $sum: 1 } } },
      { $match: { n: { $gte: SEUIL_REBONDS } } },
    ]);
    ensemble = new Set(lignes.map((l) => l._id).filter(Boolean));
  } catch (err) {
    // Une panne de lecture ne doit jamais empêcher d'envoyer : on préfère un
    // rebond de plus à un e-mail de confirmation qui n'arrive pas.
    logger.warn("[suppressionEmail] lecture impossible, aucune suppression appliquée", { error: err.message });
  }

  cacheSet(CLE_CACHE, ensemble, TTL_MS);
  return ensemble;
}

/**
 * Cette adresse doit-elle être épargnée ?
 * @param {string|string[]} to
 * @param {string|null} template
 */
export async function estAdresseSupprimee(to, template = null) {
  if (template && MODELES_TOUJOURS_ENVOYES.has(template)) return false;
  const liste = await adressesSupprimees();
  if (!liste.size) return false;
  const destinataires = (Array.isArray(to) ? to : [to]).filter(Boolean).map((d) => String(d).trim().toLowerCase());
  // Un envoi groupé n'est écarté que si TOUS ses destinataires sont supprimés :
  // sinon une seule adresse morte priverait les autres de leur message.
  return destinataires.length > 0 && destinataires.every((d) => liste.has(d));
}
