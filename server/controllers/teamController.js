// ═══════════════════════════════════════════════════════════════════════════
// COMPTES D'ÉQUIPE — palier Business et au-delà
// ═══════════════════════════════════════════════════════════════════════════
// Une agence de location n'est jamais une personne seule : un gérant, deux
// agents de comptoir. Tant qu'un seul identifiant existe, il circule de main en
// main — et la plateforme perd toute trace de qui a fait quoi. Des comptes
// rattachés règlent les deux problèmes à la fois, et donnent au palier Business
// un avantage que le partenaire ressent tous les jours.
import crypto from "crypto";
import bcrypt from "bcryptjs";
import logger from "../utils/logger.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { PASSWORD_ROUNDS } from "../config/security.js";
import { seatsDuPlan } from "../services/planAccess.js";

const ROLES = ["gestionnaire", "lecture"];

const vueMembre = (u) => ({
  _id: u._id,
  firstName: u.firstName,
  lastName: u.lastName,
  email: u.email,
  phone: u.phone,
  teamRole: u.teamRole,
  isActive: u.isActive,
  createdAt: u.createdAt,
});

// ── GET /api/team/members ──────────────────────────────────────────────────
export const listMembers = async (req, res) => {
  try {
    const membres = await User.find({ teamOf: req.user._id }).sort({ createdAt: 1 }).lean();
    const sieges = seatsDuPlan(req.planEffectif);
    res.json({
      membres: membres.map(vueMembre),
      sieges: {
        total: sieges,
        // Le titulaire occupe un siège : annoncer « 3 sièges » puis n'en laisser
        // ajouter que deux passerait pour une erreur si le décompte ne le disait
        // pas explicitement.
        utilises: 1 + membres.filter((m) => m.isActive).length,
        restants: Math.max(0, sieges - 1 - membres.filter((m) => m.isActive).length),
        titulaireInclus: true,
      },
    });
  } catch (err) {
    logger.error("listMembers:", err);
    res.status(500).json({ message: "Erreur récupération de l'équipe.", error: err.message });
  }
};

// ── POST /api/team/members — créer un accès ────────────────────────────────
export const createMember = async (req, res) => {
  try {
    const { firstName, lastName, email, phone, teamRole } = req.body || {};
    if (!firstName?.trim() || !lastName?.trim()) {
      return res.status(400).json({ message: "Nom et prénom sont requis." });
    }
    if (!email?.trim() && !phone?.trim()) {
      return res.status(400).json({ message: "Un e-mail ou un téléphone est requis pour créer l'accès." });
    }
    if (teamRole && !ROLES.includes(teamRole)) {
      return res.status(400).json({ message: "Rôle inconnu." });
    }

    const sieges = seatsDuPlan(req.planEffectif);
    const occupes = 1 + await User.countDocuments({ teamOf: req.user._id, isActive: true });
    if (occupes >= sieges) {
      return res.status(409).json({
        message: `Votre formule ouvre ${sieges} accès, titulaire compris. Passez au palier supérieur pour en ajouter.`,
        code: "SIEGES_EPUISES",
      });
    }

    const mail = email?.trim().toLowerCase() || null;
    const tel  = phone?.trim() || null;
    // Un compte existant n'est JAMAIS rattaché d'office : ce serait s'approprier
    // le compte d'un tiers — avec ses réservations et ses données — sur la seule
    // foi d'une adresse saisie. Le refus est explicite pour que le titulaire
    // comprenne quoi faire.
    const existant = await User.findOne({ $or: [
      ...(mail ? [{ email: mail }] : []),
      ...(tel  ? [{ phone: tel }]  : []),
    ] }).lean();
    if (existant) {
      return res.status(409).json({
        message: "Un compte VIT AUTO utilise déjà cet e-mail ou ce téléphone. Utilisez une autre adresse, ou contactez le support pour rattacher ce compte existant à votre équipe.",
        code: "COMPTE_EXISTANT",
      });
    }

    // Mot de passe provisoire renvoyé UNE SEULE FOIS au titulaire, qui le
    // transmet à son agent. Il n'est stocké que haché : ni le support ni
    // l'administrateur ne pourront le relire.
    const motDePasseProvisoire = crypto.randomBytes(9).toString("base64url");

    const membre = await User.create({
      firstName: firstName.trim(),
      lastName:  lastName.trim(),
      email: mail,
      phone: tel,
      password: await bcrypt.hash(motDePasseProvisoire, PASSWORD_ROUNDS),
      role: "partenaire",
      teamOf: req.user._id,
      teamRole: teamRole || "gestionnaire",
      // Hérite du pays du titulaire : l'agent travaille sur la même flotte, et
      // un pays vide fausserait les filtres du catalogue côté back-office.
      country: req.user.country || null,
      // Vérifié d'office : c'est le titulaire, déjà vérifié, qui se porte garant
      // de son agent. Lui imposer un parcours de vérification e-mail ferait
      // dépendre l'ouverture d'un accès interne de la délivrabilité d'un mail.
      emailVerified: true,
    });

    await Notification.create({
      user: membre._id,
      type: "system",
      titre: "Accès VIT AUTO créé",
      message: `${req.user.firstName || ""} ${req.user.lastName || ""} vous a ouvert un accès à son espace partenaire.`.trim(),
      lien: "/vendor/dashboard",
    }).catch((e) => logger.error("notif création membre (non bloquant) :", e.message));

    res.status(201).json({
      membre: vueMembre(membre),
      motDePasseProvisoire,
      avis: "Ce mot de passe ne sera plus affiché. Transmettez-le à la personne concernée et demandez-lui de le changer à sa première connexion.",
    });
  } catch (err) {
    logger.error("createMember:", err);
    res.status(500).json({ message: "Erreur création de l'accès.", error: err.message });
  }
};

// ── PATCH /api/team/members/:id — rôle et activation ───────────────────────
export const updateMember = async (req, res) => {
  try {
    const { teamRole, isActive } = req.body || {};
    // Le filtre porte sur teamOf : un identifiant volé dans une autre équipe ne
    // renvoie rien, plutôt qu'un 403 qui confirmerait son existence.
    const membre = await User.findOne({ _id: req.params.id, teamOf: req.user._id });
    if (!membre) return res.status(404).json({ message: "Membre introuvable dans votre équipe." });

    if (teamRole !== undefined) {
      if (!ROLES.includes(teamRole)) return res.status(400).json({ message: "Rôle inconnu." });
      membre.teamRole = teamRole;
    }
    if (isActive !== undefined) {
      if (isActive === true) {
        const sieges = seatsDuPlan(req.planEffectif);
        const occupes = 1 + await User.countDocuments({ teamOf: req.user._id, isActive: true, _id: { $ne: membre._id } });
        if (occupes >= sieges) {
          return res.status(409).json({ message: `Votre formule ouvre ${sieges} accès, titulaire compris.`, code: "SIEGES_EPUISES" });
        }
      }
      membre.isActive = !!isActive;
      // Désactiver un accès doit couper les sessions EN COURS : sans
      // incrémenter tokenVersion, le jeton déjà émis resterait valide jusqu'à
      // sept jours — un agent parti le matin garderait la main jusqu'au weekend.
      if (!isActive) membre.tokenVersion = (membre.tokenVersion || 0) + 1;
    }
    await membre.save();
    res.json({ membre: vueMembre(membre) });
  } catch (err) {
    logger.error("updateMember:", err);
    res.status(500).json({ message: "Erreur mise à jour du membre.", error: err.message });
  }
};

// ── DELETE /api/team/members/:id ───────────────────────────────────────────
export const removeMember = async (req, res) => {
  try {
    const membre = await User.findOne({ _id: req.params.id, teamOf: req.user._id });
    if (!membre) return res.status(404).json({ message: "Membre introuvable dans votre équipe." });

    // Détachement, pas suppression : le compte a pu écrire des messages et
    // figurer dans des historiques. Le supprimer laisserait des références
    // pendantes ; le détacher et le désactiver retire l'accès aussi sûrement.
    membre.teamOf = null;
    membre.teamRole = null;
    membre.isActive = false;
    membre.tokenVersion = (membre.tokenVersion || 0) + 1;
    await membre.save();

    res.json({ message: "Accès retiré." });
  } catch (err) {
    logger.error("removeMember:", err);
    res.status(500).json({ message: "Erreur retrait du membre.", error: err.message });
  }
};
