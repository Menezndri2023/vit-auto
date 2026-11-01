import IETransaction from "../models/IETransaction.js";
import Booking from "../models/Booking.js";
import DemandeLogistique from "../models/DemandeLogistique.js";
import Prestataire from "../models/Prestataire.js";

// ═══════════════════════════════════════════════════════════════════════════
// Ce sur quoi porte une réclamation (2026-11-01)
// ═══════════════════════════════════════════════════════════════════════════
// Import/Export, réservation (location, vente, chauffeur, loisirs, pièces) et
// demande logistique partagent le même modèle Litige. Chaque cible dit qui est
// l'acheteur (le client), qui est le vendeur (le partenaire ou le prestataire)
// et où chacun suit sa réclamation.

const idStr = (v) => (v?._id || v)?.toString() || null;

const CIBLES = {
  ie: {
    libelle: "Import/Export",
    scopes: ["import_export"],
    charger: (id) => IETransaction.findById(id),
    parties: async (tx) => ({ acheteur: tx.client, vendeur: tx.partner }),
    reference: (tx) => String(tx._id).slice(-8).toUpperCase(),
    statut: (tx) => tx.status,
    lien: (tx) => ({ acheteur: `/import-export/transaction/${tx._id}`, vendeur: `/import-export/transaction/${tx._id}`, admin: `/import-export/transaction/${tx._id}` }),
  },
  reservation: {
    libelle: "Réservation",
    scopes: ["bookings"],
    charger: (id) => Booking.findById(id)
      .populate("vehicle", "owner").populate("driver", "owner").populate("activity", "owner").populate("part", "owner"),
    parties: async (b) => ({ acheteur: b.client, vendeur: b.vehicle?.owner || b.driver?.owner || b.activity?.owner || b.part?.owner || null }),
    reference: (b) => b.reference || String(b._id).slice(-8).toUpperCase(),
    statut: (b) => b.status,
    lien: () => ({ acheteur: "/dashboard", vendeur: "/vendor/dashboard", admin: "/admin?tab=litiges" }),
  },
  logistique: {
    libelle: "Logistique",
    scopes: ["import_export", "transitaire"],
    charger: (id) => DemandeLogistique.findById(id),
    parties: async (d) => {
      const prest = d.devisAccepte?.prestataire ? await Prestataire.findById(d.devisAccepte.prestataire).select("user").lean() : null;
      return { acheteur: d.client, vendeur: prest?.user || null };
    },
    reference: (d) => d.reference || String(d._id).slice(-8).toUpperCase(),
    statut: (d) => d.statut,
    lien: (d) => ({ acheteur: `/logistique/demandes/${d._id}`, vendeur: `/transit/logistique/${d._id}`, admin: "/admin?tab=litiges" }),
  },
};

export const TYPES_CIBLE = Object.keys(CIBLES);
export const cible = (type) => CIBLES[type] || null;

/** "acheteur" | "vendeur" | "admin" | null */
export async function partieSur(type, objet, user) {
  if (!objet || !user) return null;
  const { acheteur, vendeur } = await CIBLES[type].parties(objet);
  const uid = idStr(user._id);
  if (idStr(acheteur) === uid) return "acheteur";
  if (idStr(vendeur) === uid) return "vendeur";
  return user.role === "admin" ? "admin" : null;
}

/** Un admin peut-il instruire ce type ? Admin général, ou l'un des secteurs de la cible. */
export function adminPeutInstruire(user, type) {
  if (user?.role !== "admin") return false;
  const mine = user.adminScope || [];
  return mine.length === 0 || mine.includes("super_admin") || CIBLES[type].scopes.some((s) => mine.includes(s));
}
