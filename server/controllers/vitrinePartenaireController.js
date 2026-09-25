// ── Le lien de vitrine qu'un partenaire partage ────────────────────────────
//
// Demande de l'exploitant (2026-09-25) : « chaque partenaire VIT AUTO dispose
// d'un lien (vitrine) qu'il peut partager », ne contenant QUE ses annonces ;
// l'administrateur peut partager ces liens lui aussi ; et les liens sont
// octroyés en fonction du plan du partenaire.
//
// Ce que le plan ouvre, et ce qu'il n'ouvre pas — décision de l'exploitant du
// même jour : la PAGE reste publique à tous les paliers. Elle est déjà
// atteignable en cliquant le nom d'un partenaire sur une annonce ; la fermer
// obligerait à casser ce lien dans le catalogue et priverait de vitrine les
// partenaires au palier gratuit, c'est-à-dire presque tous aujourd'hui. Ce qui
// s'achète, c'est de rendre le lien PARTAGEABLE et MESURABLE : l'adresse
// courte et le QR code à imprimer.
//
// Le périmètre du lien est traité ailleurs et couvert par ses propres tests
// (tests/vitrinePartenaire.test.js) : `?owner=<id>&country=INTL` rend la flotte
// entière du partenaire et rien d'autre, un `owner` illisible ne rend RIEN
// plutôt que tout le catalogue.
import QRCode from "qrcode";
import User from "../models/User.js";
import Vehicle from "../models/Vehicle.js";
import { outilOuvert, messageRefus } from "../services/planAccess.js";
import { slugUnique } from "../utils/slugPartenaire.js";
import logger from "../utils/logger.js";

// Un lien de vitrine est imprimé sur une carte de visite et encodé dans un QR
// code : il ne peut pas sortir d'un APP_URL de développement. Le .env local
// vaut « http://localhost:5173 », et c'est exactement ainsi qu'un bouton de
// relance est déjà parti mort une fois (leçon du 2026-09-10, scripts sortants).
// Ici la conséquence serait pire : un QR imprimé ne se corrige pas.
export const SITE_PUBLIC = "https://vit-auto.com";
export function origineSite(env = process.env) {
  const brut = String(env.APP_URL || "").trim().replace(/\/+$/, "");
  if (!brut) return SITE_PUBLIC;
  if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i.test(brut)) return SITE_PUBLIC;
  return brut;
}

const nomDe = (u) => (u?.business?.companyName || `${u?.firstName || ""} ${u?.lastName || ""}`).trim();

// Le slug n'est attribué qu'à la première demande, et jamais réattribué : une
// adresse publique qui bouge casse les cartes de visite déjà imprimées.
async function slugDeLaVitrine(partenaire) {
  if (partenaire.vitrineSlug) return partenaire.vitrineSlug;
  const slug = await slugUnique(nomDe(partenaire), {
    collection: User,
    champ: "vitrineSlug",
    proprietaire: partenaire._id,
    exclure: { _id: { $ne: partenaire._id } },
  });
  // Écriture conditionnelle : deux onglets ouverts sur le tableau de bord
  // demandent le lien en même temps, et le second ne doit pas écraser le
  // premier avec un slug calculé sur la même base.
  const maj = await User.findOneAndUpdate(
    { _id: partenaire._id, $or: [{ vitrineSlug: null }, { vitrineSlug: { $exists: false } }] },
    { $set: { vitrineSlug: slug } },
    { new: true },
  ).select("vitrineSlug").lean();
  return maj?.vitrineSlug || (await User.findById(partenaire._id).select("vitrineSlug").lean())?.vitrineSlug || slug;
}

async function composerVitrine(partenaire, demandeur) {
  const origine = origineSite();
  const lien = `${origine}/partner/${partenaire._id}`;

  // Le palier lu est TOUJOURS celui du partenaire, jamais celui du demandeur :
  // un administrateur qui partage le lien d'un partenaire gratuit partage ce
  // que ce partenaire a droit de montrer, sinon « octroyé selon le plan » ne
  // voudrait plus rien dire dès qu'un admin s'en mêle.
  const acces = await outilOuvert({ _id: partenaire._id, role: "partenaire" }, "lienCourtVitrine");

  const [annonces, slug] = await Promise.all([
    Vehicle.countDocuments({ owner: partenaire._id, status: "approved", available: { $ne: false } }),
    acces.ouvert ? slugDeLaVitrine(partenaire) : Promise.resolve(partenaire.vitrineSlug || null),
  ]);

  const lienCourt = acces.ouvert && slug ? `${origine}/p/${slug}` : null;

  return {
    partenaire: { id: String(partenaire._id), nom: nomDe(partenaire) || "Partenaire" },
    // Toujours présent : c'est l'adresse qui marche pour tout le monde.
    lien,
    annonces,
    slug: lienCourt ? slug : null,
    lienCourt,
    // Un QR code n'a d'intérêt qu'imprimé, donc seulement sur l'adresse courte.
    qr: lienCourt ? await QRCode.toDataURL(lienCourt, { margin: 1, width: 512 }) : null,
    lienCourtOuvert: acces.ouvert,
    // Dire CE QUI MANQUE plutôt qu'« indisponible » : sans le palier requis,
    // le partenaire n'a aucune action à entreprendre.
    ...(acces.ouvert ? {} : { planRequis: acces.planRequis, message: messageRefus("lienCourtVitrine") }),
    partageParAdmin: demandeur?.role === "admin",
  };
}

// ── Le partenaire demande SA vitrine ───────────────────────────────────────
export const maVitrine = async (req, res) => {
  try {
    const id = req.user?.teamOf || req.user?._id;
    const partenaire = await User.findById(id).select("firstName lastName business.companyName vitrineSlug role isActive").lean();
    if (!partenaire) return res.status(404).json({ message: "Partenaire introuvable." });
    res.json(await composerVitrine(partenaire, req.user));
  } catch (err) {
    logger.error("maVitrine:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── L'administrateur partage la vitrine d'un partenaire ────────────────────
export const vitrineDunPartenaire = async (req, res) => {
  try {
    const partenaire = await User.findById(req.params.id)
      .select("firstName lastName business.companyName vitrineSlug role isActive").lean();
    // Un compte fermé ou qui n'est pas partenaire n'a pas de vitrine à
    // partager : le lien mènerait à un 404 que l'administrateur découvrirait
    // après l'avoir envoyé.
    if (!partenaire || !partenaire.isActive || !["partenaire", "admin"].includes(partenaire.role)) {
      return res.status(404).json({ message: "Partenaire introuvable." });
    }
    res.json(await composerVitrine(partenaire, req.user));
  } catch (err) {
    logger.error("vitrineDunPartenaire:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Résolution publique d'un slug (/p/:slug) ───────────────────────────────
// Rend l'identifiant, que la page utilise ensuite pour charger le profil et la
// flotte par les routes publiques existantes. Aucune donnée de plus : ce point
// d'entrée est ouvert et n'a pas à exposer un profil de son côté.
export const resoudreSlug = async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim().toLowerCase();
    const partenaire = await User.findOne({ vitrineSlug: slug }).select("_id role isActive").lean();
    if (!partenaire || !partenaire.isActive || !["partenaire", "admin"].includes(partenaire.role)) {
      return res.status(404).json({ message: "Vitrine introuvable." });
    }
    res.json({ id: String(partenaire._id) });
  } catch (err) {
    logger.error("resoudreSlug:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
