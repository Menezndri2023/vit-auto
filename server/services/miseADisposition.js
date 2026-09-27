// ── Mise à disposition longue durée d'un chauffeur ─────────────────────────
//
// Ce qui existait déjà, et qu'on ne refait pas : le tarif au mois
// (`Driver.tarifMois`, 2026-09-16), l'unité « mois » à la réservation
// (bookingController, UNITES.mois) et la détection de conflit sur toute la
// période. Un client pouvait donc déjà réserver un chauffeur six mois.
//
// Ce qui manquait, et qui est le seul vrai frein à vendre du long terme :
//
//  1. le contrat se payait d'un bloc — six mois de chauffeur exigés d'avance,
//     ce qu'aucune entreprise ne fait ;
//  2. s'engager longtemps ne valait rien au client : douze mois coûtaient
//     exactement douze fois un mois, le partenaire n'avait aucun levier pour
//     transformer une mission ponctuelle en revenu récurrent.
//
// D'où deux mécanismes, et deux seulement : une remise par palier
// d'engagement, et un échéancier mensuel. Le rail de paiement n'est pas
// touché — l'échéance est un dû daté que le partenaire marque réglé, comme
// il le fait déjà de la main à la main. Inventer ici un prélèvement récurrent
// aurait demandé Stripe, les relances et les impayés : un autre chantier.

const ANNULES = new Set(["cancelled", "transaction_not_concluded", "client_absent"]);

const arrondi = (n) => Math.round(n * 100) / 100;

/**
 * Ajoute `n` mois à une date en rabattant le jour sur le dernier du mois.
 *
 * Sans ce rabattement, `new Date(2026, 0, 31)` + 1 mois donne le 3 mars : le
 * débordement natif de JavaScript ferait sauter l'échéance de février.
 */
export function ajouterMois(date, n) {
  const d = new Date(date);
  const jour = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const dernier = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(jour, dernier));
  return d;
}

/**
 * La remise (en %) obtenue pour cette durée d'engagement.
 *
 * Même règle que les paliers de groupe (services/tarifGroupe.js) : le palier
 * retenu est le PLUS LONG qui reste atteint, les paliers ne sont pas supposés
 * triés, et un palier qui n'apporte rien (remise nulle ou négative) est
 * ignoré plutôt que refusé.
 */
export function remiseApplicable(offre, dureeMois = 1) {
  const n = Math.max(1, Math.floor(Number(dureeMois) || 1));
  let retenu = null;
  for (const p of offre?.paliers || []) {
    const seuil  = Number(p?.aPartirDeMois);
    const remise = Number(p?.remisePourcent);
    if (!Number.isFinite(seuil) || !Number.isFinite(remise)) continue;
    if (n < seuil || remise <= 0) continue;
    if (!retenu || seuil > retenu.aPartirDeMois) retenu = { aPartirDeMois: seuil, remisePourcent: Math.min(remise, 100) };
  }
  return retenu;
}

/**
 * Le prix d'un contrat de `dureeMois` mois, remise comprise.
 *
 * La mensualité est arrondie AVANT d'être multipliée, et le total en est le
 * produit exact. L'inverse — arrondir le total puis le diviser — laisse un
 * reliquat de centimes sur la dernière échéance, que personne ne sait
 * expliquer au client.
 */
export function montantContrat(driver, dureeMois = 1) {
  const base = Number(driver?.tarifMois) || 0;
  const duree = Math.max(1, Math.floor(Number(dureeMois) || 1));
  const palier = remiseApplicable(driver?.miseADisposition, duree);
  const mensualiteUSD = arrondi(base * (1 - (palier ? palier.remisePourcent : 0) / 100));
  return {
    dureeMois: duree,
    mensualiteUSD,
    totalUSD: arrondi(mensualiteUSD * duree),
    remisePourcent: palier ? palier.remisePourcent : 0,
    economieUSD: arrondi((base - mensualiteUSD) * duree),
  };
}

/**
 * L'échéancier : une ligne par mois, la première à la prise d'effet.
 *
 * `supplementInitialUSD` (le supplément de zone, facturé une fois par mission)
 * est porté par la PREMIÈRE échéance, jamais réparti : il est dû au départ.
 * L'invariant qui compte — et que les tests vérifient — est que la somme des
 * échéances vaut exactement le montant de la commande.
 */
export function construireEcheancier({ debut, dureeMois, mensualiteUSD, supplementInitialUSD = 0 }) {
  const duree = Math.max(1, Math.floor(Number(dureeMois) || 1));
  const mensualite = arrondi(Number(mensualiteUSD) || 0);
  const supplement = arrondi(Number(supplementInitialUSD) || 0);
  const depart = new Date(debut);
  return Array.from({ length: duree }, (_, i) => ({
    numero: i + 1,
    dateEcheance: ajouterMois(depart, i),
    montantUSD: i === 0 ? arrondi(mensualite + supplement) : mensualite,
    regleeLe: null,
    regleePar: null,
    moyenPaiement: null,
  }));
}

/**
 * L'état d'une échéance, CALCULÉ et jamais stocké.
 *
 * Un statut stocké demanderait un planificateur pour le faire basculer chaque
 * nuit, et surtout il faudrait penser à annuler les échéances à venir quand
 * une commande est annulée — l'oubli classique. Ici, annuler la commande
 * suffit : ce qui restait dû cesse de l'être, ce qui était réglé le reste.
 */
export function statutEcheance(echeance, booking, maintenant = new Date()) {
  if (echeance?.regleeLe) return "reglee";
  if (ANNULES.has(booking?.status)) return "annulee";
  return new Date(echeance?.dateEcheance) <= maintenant ? "due" : "a_venir";
}

/** L'échéancier d'une commande avec les statuts, pour l'affichage. */
export function echeancierAvecStatuts(booking, maintenant = new Date()) {
  const echeances = booking?.chauffeur?.contrat?.echeances || [];
  return echeances.map((e) => ({
    numero: e.numero,
    dateEcheance: e.dateEcheance,
    montantUSD: e.montantUSD,
    regleeLe: e.regleeLe || null,
    statut: statutEcheance(e, booking, maintenant),
  }));
}

/** Ce qu'il reste à encaisser sur un contrat — hors échéances annulées. */
export function resteAEncaisser(booking, maintenant = new Date()) {
  return arrondi(
    echeancierAvecStatuts(booking, maintenant)
      .filter((e) => e.statut === "due" || e.statut === "a_venir")
      .reduce((s, e) => s + (Number(e.montantUSD) || 0), 0)
  );
}
