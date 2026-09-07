// ═══════════════════════════════════════════════════════════════════════════
// PERMISSIONS ADMIN — source unique de vérité
// ═══════════════════════════════════════════════════════════════════════════
// Deux niveaux, et deux seulement :
//
//   1. ADMIN GÉNÉRAL  (adminScope contient "super_admin")
//      Accès total à la plateforme. Seul habilité à promouvoir un compte en
//      admin, à modifier les permissions d'un autre admin, à l'activer/
//      désactiver ou à le supprimer. Au moins un admin général actif doit
//      exister en permanence (garde-fou dans usersController.updateAdminScope).
//
//   2. ADMIN À ACCÈS ASSIGNÉ  (un ou plusieurs des autres scopes)
//      Ne voit et n'agit que dans les domaines qui lui sont attribués. Les
//      onglets hors de son périmètre sont masqués côté interface (TAB_SCOPES
//      dans AdminPanel.jsx) ET refusés côté serveur (requireAdminScope) — les
//      deux, jamais l'un sans l'autre.
//
// Un tableau de permissions VIDE ne donne accès à rien. Historiquement il
// valait « accès complet » (compatibilité avec les comptes créés avant
// l'existence de ce champ) ; la migration "admin-scope-explicit-super-admin"
// a rendu cet accès explicite en écrivant ["super_admin"] sur ces comptes,
// pour qu'un nouvel admin ne devienne jamais administrateur général par
// simple oubli.

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
};

// Un admin général passe partout — utilisé côté serveur ET repris à
// l'identique côté interface (canSeeTab).
export const isGeneralAdmin = (user) =>
  user?.role === "admin" && (user.adminScope || []).includes("super_admin");

export const hasAdminScope = (user, scope) => {
  if (user?.role !== "admin") return false;
  const scopes = user.adminScope || [];
  return scopes.includes("super_admin") || scopes.includes(scope);
};
