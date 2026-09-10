// ── Délégation d'accès aux comptes d'équipe ────────────────────────────────
//
// Un agent rattaché à un partenaire doit travailler SUR LES DONNÉES DU
// TITULAIRE : ses annonces, ses réservations. Les contrôleurs concernés filtrent
// tous sur `req.user._id`. Plutôt que de réécrire une trentaine de filtres —
// chacun une occasion d'en oublier un, c'est-à-dire une fuite —, ce middleware
// substitue l'identité de PROPRIÉTÉ en amont, une seule fois.
//
// Ce choix impose une contrainte stricte : il ne doit être monté QUE sur les
// routeurs où « agir en tant que le titulaire » est le comportement voulu
// (annonces, réservations). Monté globalement, il donnerait à un agent le droit
// de changer le mot de passe de son employeur via /api/auth.
//
// En production, aucun compte ne porte `teamOf` : ce middleware sort
// immédiatement et ne change rien au comportement existant.
import User from "../models/User.js";
import { authenticate } from "./auth.js";
import logger from "../utils/logger.js";
import { planEffectif } from "../services/planAccess.js";
import { planOuvre } from "../constants/planFeatures.js";

export const equipeCommeProprietaire = async (req, res, next) => {
  try {
    if (!req.user?.teamOf) return next();

    // Consultation seule : tout ce qui n'est pas une lecture est refusé ici,
    // avant d'atteindre le contrôleur. Filtrer sur la méthode HTTP plutôt que
    // sur une liste d'actions couvre d'office les routes ajoutées plus tard.
    if (req.user.teamRole === "lecture" && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      return res.status(403).json({
        message: "Votre accès est en consultation seule. Demandez au titulaire du compte de vous passer en gestionnaire.",
        code: "EQUIPE_LECTURE_SEULE",
      });
    }

    const titulaire = await User.findById(req.user.teamOf)
      .select("-password -phoneOtp -passwordResetToken -emailVerificationToken -twoFactor.secret -refreshTokens");
    if (!titulaire || !titulaire.isActive) {
      return res.status(403).json({
        message: "Le compte auquel vous êtes rattaché n'est plus actif.",
        code: "TITULAIRE_INACTIF",
      });
    }

    // L'abonnement du titulaire doit TOUJOURS couvrir le multi-utilisateurs :
    // sans ce contrôle, une équipe constituée pendant un abonnement continuerait
    // d'y accéder indéfiniment après son échéance.
    const plan = await planEffectif(titulaire._id);
    if (!planOuvre(plan, "multiUtilisateurs")) {
      return res.status(403).json({
        message: "L'abonnement du compte auquel vous êtes rattaché ne couvre plus les accès multi-utilisateurs.",
        code: "PLAN_REQUIS",
      });
    }

    // Le membre réel reste disponible pour la journalisation : savoir QUI a
    // publié une annonce est le premier besoin d'un gérant qui délègue.
    req.membre = req.user;
    req.user = titulaire;
    next();
  } catch (err) {
    logger.error("equipeCommeProprietaire:", err);
    next(err);
  }
};

// Authentification + délégation, en un seul middleware composable.
//
// Exporté sous cette forme pour que les routeurs concernés (annonces,
// réservations) l'importent SOUS LE NOM `authenticate` : la substitution se
// fait alors en une ligne d'import, sans toucher aux dizaines de déclarations
// de routes — donc sans risque d'en oublier une, ce qui laisserait un membre
// d'équipe sans accès sur une route au hasard.
export const authenticateEtDeleguer = [authenticate, equipeCommeProprietaire];
