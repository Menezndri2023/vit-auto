// ═══════════════════════════════════════════════════════════════════════════
// PERMISSIONS ADMIN — source unique de vérité
// ═══════════════════════════════════════════════════════════════════════════
// Deux niveaux, et deux seulement :
//
//   1. ADMIN GÉNÉRAL — accès à TOUTE l'administration VIT AUTO.
//      N'a besoin d'AUCUNE permission : ses identifiants de connexion
//      suffisent. C'est le niveau par défaut de tout compte administrateur,
//      représenté par un adminScope vide (le défaut) ou contenant
//      explicitement "super_admin" — les deux sont équivalents.
//      Seul habilité à promouvoir un compte en admin, à restreindre un autre
//      admin, à l'activer/désactiver ou à le supprimer. Au moins un admin
//      général actif doit exister en permanence (garde-fou dans
//      usersController.updateAdminScope).
//
//   2. ADMIN À ACCÈS ASSIGNÉ — restriction OPT-IN.
//      Dès qu'un ou plusieurs domaines lui sont attribués, le compte n'agit
//      QUE dans ces domaines. Les onglets hors de son périmètre sont masqués
//      côté interface (TAB_SCOPES dans AdminPanel.jsx) ET refusés côté serveur
//      (requireAdminScope) — les deux, jamais l'un sans l'autre.
//
// Restreindre est donc toujours une décision explicite ; un compte admin ne
// peut pas se retrouver sans aucun droit par simple oubli, ce qui donnait un
// panneau d'administration vide et incompréhensible.

export const ADMIN_SCOPES = [
  "super_admin",
  "finance",
  "kyc",
  "import_export",
  "support",
  "moderation",
  "users",
  "bookings",
  "catalogue",
  "partners",
  "transitaire",
];

// Libellés affichés dans l'écran « Rôles & Permissions ».
export const ADMIN_SCOPE_LABELS = {
  super_admin:   { label: "Admin général",      icon: "👑", desc: "Accès total — peut tout gérer, y compris les autres comptes admin" },
  finance:       { label: "Finance",            icon: "💰", desc: "Factures, commissions, reversements, paiements, séquestre, tarification" },
  kyc:           { label: "KYC & Identités",    icon: "🛡️", desc: "Dossiers KYC et pièces d'identité soumises" },
  import_export: { label: "Import / Export",    icon: "🌍", desc: "Transactions internationales, annonces export, logistique" },
  support:       { label: "Support client",     icon: "💬", desc: "Conversations, notifications, WhatsApp" },
  moderation:    { label: "Modération",         icon: "🚩", desc: "Avis clients et signalements" },
  users:         { label: "Comptes",            icon: "👥", desc: "Comptes clients et partenaires : rôles, activation, suppression" },
  bookings:      { label: "Réservations",       icon: "📋", desc: "Validation des demandes, litiges, statuts, export" },
  catalogue:     { label: "Catalogue",          icon: "🚗", desc: "Annonces véhicules, chauffeurs, activités et publicités" },
  partners:      { label: "Partenaires",        icon: "🤝", desc: "Onboarding, certification, vérification, CRM, showrooms" },
  transitaire:   { label: "Transit & Logistique", icon: "🚢", desc: "Assignation des dossiers export aux transitaires et agents, suivi d'expédition" },
};

// Un admin général passe partout — utilisé côté serveur ET repris à
// l'identique côté interface (canSeeTab). Aucune permission n'est requise :
// un compte admin sans restriction explicite EST un administrateur général.
export const isGeneralAdmin = (user) => {
  if (user?.role !== "admin") return false;
  const scopes = user.adminScope || [];
  return scopes.length === 0 || scopes.includes("super_admin");
};

export const hasAdminScope = (user, scope) =>
  isGeneralAdmin(user) || (user?.role === "admin" && (user.adminScope || []).includes(scope));
