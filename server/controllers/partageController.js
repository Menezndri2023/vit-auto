import mongoose from "mongoose";
import Vehicle from "../models/Vehicle.js";
import ImportExportListing from "../models/ImportExportListing.js";
import User from "../models/User.js";
import logger from "../utils/logger.js";

// ══════════════════════════════════════════════════════════════════════════════
// APERÇUS DE PARTAGE (WhatsApp, Facebook, LinkedIn, Telegram…) — 2026-11-02
// ══════════════════════════════════════════════════════════════════════════════
// Les robots d'aperçu n'exécutent pas le JavaScript : sur une annonce partagée
// ils lisaient les balises génériques d'index.html (visuel du site, titre de
// l'accueil), jamais la photo ni le prix du véhicule. vercel.json leur envoie
// ici — et à eux seuls, d'après leur user-agent — /vehicle/:id, /p/:slug et
// /import-export/listings/:id ; un visiteur humain reçoit l'application.
// Rien d'introuvable ne renvoie d'erreur : l'aperçu retombe sur celui du site.

const SITE = "https://vit-auto.com";
const IMAGE_DEFAUT = `${SITE}/og-vit-auto.jpg`;
const DEFAUT = {
  titre: "VIT AUTO — Louez, achetez ou importez votre véhicule au Maroc",
  description: "Location, vente et import de véhicules au Maroc — et import depuis la Chine, Dubaï ou l'Europe.",
};

const echapper = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const resumer = (s, n = 160) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t; };

// Une URL d'image utilisable par un robot : absolue, https, jamais du base64.
// ImageKit recadre au format des aperçus (1200×630) sans agrandir une petite photo.
function imagePartage(url) {
  if (!url || typeof url !== "string" || !/^https:\/\//.test(url)) return IMAGE_DEFAUT;
  if (/ik\.imagekit\.io/.test(url) && !/[?&]tr=/.test(url)) return `${url}${url.includes("?") ? "&" : "?"}tr=w-1200,h-630,c-at_max`;
  return url;
}

function prix(montant, devise) {
  if (montant == null || !Number.isFinite(Number(montant))) return null;
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: devise || "USD", maximumFractionDigits: 0 }).format(montant);
  } catch { return `${Math.round(montant)} ${devise || "USD"}`; }
}

function page(res, { titre, description, image, chemin }) {
  const url = SITE + chemin;
  const t = echapper(titre), d = echapper(description), i = echapper(image || IMAGE_DEFAUT), u = echapper(url);
  res.set({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=600" });
  res.status(200).send(`<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<title>${t}</title>
<meta name="description" content="${d}">
<link rel="canonical" href="${u}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="VIT AUTO">
<meta property="og:locale" content="fr_FR">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:image" content="${i}">
<meta property="og:url" content="${u}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${i}">
</head><body><a href="${u}">${t}</a></body></html>`);
}

const idValide = (id) => mongoose.Types.ObjectId.isValid(String(id || ""));

export const apercuVehicule = async (req, res) => {
  const chemin = `/vehicle/${encodeURIComponent(req.params.id || "")}`;
  try {
    const v = idValide(req.params.id) && await Vehicle.findOne({ _id: req.params.id, status: "approved" })
      .select("title marque modele annee type pricePerDay priceForSale pricePerDayEntered priceForSaleEntered priceEntryCurrency ville description images").lean();
    if (!v) return page(res, { ...DEFAUT, chemin });
    const vente = v.type === "vente";
    const montant = vente ? (v.priceForSaleEntered ?? v.priceForSale) : (v.pricePerDayEntered ?? v.pricePerDay);
    const devise = (vente ? v.priceForSaleEntered : v.pricePerDayEntered) != null ? v.priceEntryCurrency : "USD";
    const p = prix(montant, devise);
    const accroche = [p && (vente ? p : `${p} / jour`), v.ville].filter(Boolean).join(" · ");
    page(res, {
      titre: `${v.title || [v.marque, v.modele, v.annee].filter(Boolean).join(" ")} — ${vente ? "à vendre" : "à louer"} sur VIT AUTO`,
      description: resumer([accroche, v.description].filter(Boolean).join(" — ")) || DEFAUT.description,
      image: imagePartage(v.images?.[0]),
      chemin,
    });
  } catch (err) {
    logger.error("apercuVehicule:", err);
    page(res, { ...DEFAUT, chemin });
  }
};

export const apercuAnnonceIE = async (req, res) => {
  const chemin = `/import-export/listings/${encodeURIComponent(req.params.id || "")}`;
  try {
    const l = idValide(req.params.id) && await ImportExportListing.findOne({ _id: req.params.id, status: "approved" })
      .select("title price currency sourceCountry description photos").lean();
    if (!l) return page(res, { ...DEFAUT, chemin });
    const accroche = [prix(l.price, l.currency), l.sourceCountry && `depuis ${l.sourceCountry}`].filter(Boolean).join(" · ");
    page(res, {
      titre: `${l.title} — à importer sur VIT AUTO`,
      description: resumer([accroche, l.description].filter(Boolean).join(" — ")) || DEFAUT.description,
      image: imagePartage(l.photos?.[0]),
      chemin,
    });
  } catch (err) {
    logger.error("apercuAnnonceIE:", err);
    page(res, { ...DEFAUT, chemin });
  }
};

export const apercuVitrine = async (req, res) => {
  const slug = String(req.params.slug || "").trim().toLowerCase();
  const chemin = `/p/${encodeURIComponent(slug)}`;
  try {
    const partenaire = slug && await User.findOne({ vitrineSlug: slug, isActive: true, role: { $in: ["partenaire", "admin"] } })
      .select("firstName lastName business.companyName business.logo").lean();
    if (!partenaire) return page(res, { ...DEFAUT, chemin });
    const nom = partenaire.business?.companyName || [partenaire.firstName, partenaire.lastName].filter(Boolean).join(" ");
    const [nombre, premiere] = await Promise.all([
      Vehicle.countDocuments({ owner: partenaire._id, status: "approved" }),
      Vehicle.findOne({ owner: partenaire._id, status: "approved", "images.0": { $exists: true } }).select("images").lean(),
    ]);
    page(res, {
      titre: `${nom} — sur VIT AUTO`,
      description: nombre > 0 ? `${nombre} annonce${nombre > 1 ? "s" : ""} à louer ou à vendre. Réservez ou contactez ${nom} directement sur VIT AUTO.` : `Les annonces de ${nom} sur VIT AUTO.`,
      image: imagePartage(premiere?.images?.[0] || partenaire.business?.logo),
      chemin,
    });
  } catch (err) {
    logger.error("apercuVitrine:", err);
    page(res, { ...DEFAUT, chemin });
  }
};
