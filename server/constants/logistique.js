// VIT-AUTO Logistique (exploitant, 2026-10-27) — modèle économique A :
// mise en relation GRATUITE entre clients et prestataires logistiques.
// Aucune commission, aucun taux, aucun frais de mise en relation, aucun
// paiement intégré. Le prix du transport se règle directement entre les
// parties, selon leur contrat.
//
// Ce fichier est la référence des statuts et des transitions ; le contrôleur
// (controllers/logistiqueController.js) refuse toute transition absente
// d'ici, quel que soit l'appelant.

export const MODELE_ECONOMIQUE = "FREE_REFERRAL";

export const TYPES_BESOIN = ["vehicule", "pieces", "autre"];
export const LIBELLES_BESOIN = {
  vehicule: "Transport de véhicule",
  pieces:   "Transport de pièces détachées",
  autre:    "Autre demande logistique",
};

export const MODES_TRANSPORT = ["routier", "maritime", "aerien", "indifferent"];

// Prestataires (models/Prestataire.js) habilités à répondre à une demande
// logistique : transport et transit. Les inspecteurs et commissionnaires en
// douane ne sont pas sollicités pour un transport.
export const TYPES_PRESTATAIRE_LOGISTIQUE = ["transporteur", "transitaire"];

export const STATUTS = [
  "brouillon",
  "recue",
  "infos_requises",
  "validee",
  "recherche_prestataires",
  "devis_recus",
  "devis_accepte",
  "commande_confirmee",
  "en_preparation",
  "en_transport",
  "livraison_declaree",
  "cloturee",
  "annulee",
  "litige",
];

export const LIBELLES_STATUT = {
  brouillon:              "Brouillon",
  recue:                  "Demande reçue",
  infos_requises:         "Informations complémentaires requises",
  validee:                "Validée",
  recherche_prestataires: "Recherche de prestataires",
  devis_recus:            "Devis reçus",
  devis_accepte:          "Devis accepté",
  commande_confirmee:     "Commande confirmée",
  en_preparation:         "En préparation",
  en_transport:           "En cours de transport",
  livraison_declaree:     "Livraison déclarée",
  cloturee:               "Clôturée",
  annulee:                "Annulée",
  litige:                 "Litige à traiter",
};

// Statuts terminaux : plus aucune transition, sauf litige depuis « clôturée »
// (un problème découvert après réception reste signalable).
export const STATUTS_TERMINAUX = ["cloturee", "annulee"];

// Le client peut annuler tant que le transport n'a pas commencé.
export const ANNULABLE_PAR_CLIENT = ["brouillon", "recue", "infos_requises", "validee", "recherche_prestataires", "devis_recus", "devis_accepte", "commande_confirmee", "en_preparation"];

// Un litige peut être ouvert une fois la prestation engagée.
export const LITIGE_OUVRABLE = ["commande_confirmee", "en_preparation", "en_transport", "livraison_declaree", "cloturee"];

// Étapes d'exécution que SEUL le prestataire retenu fait avancer, dans cet
// ordre. Le système n'invente jamais un événement : chaque passage est une
// déclaration horodatée du prestataire.
export const ETAPES_PRESTATAIRE = {
  devis_accepte:      "commande_confirmee",
  commande_confirmee: "en_preparation",
  en_preparation:     "en_transport",
  en_transport:       "livraison_declaree",
};

// Statuts où un prestataire sollicité peut encore proposer un devis.
export const DEVIS_OUVERTS = ["validee", "recherche_prestataires", "devis_recus"];

export const REPONSES_SOLLICITATION = ["en_attente", "interesse", "decline", "precisions_demandees"];
export const STATUTS_DEVIS = ["propose", "remplace", "retire", "accepte", "refuse", "non_retenu", "expire"];

// Horodatage posé la PREMIÈRE fois qu'un statut est atteint — base des
// indicateurs (délais, conversions). Jamais réécrit ensuite.
export const JALONS = {
  recue:              "recueLe",
  validee:            "valideeLe",
  devis_recus:        "premierDevisLe",
  devis_accepte:      "devisAccepteLe",
  commande_confirmee: "commandeConfirmeeLe",
  en_transport:       "transportDebuteLe",
  livraison_declaree: "livraisonDeclareeLe",
  cloturee:           "clotureeLe",
  annulee:            "annuleeLe",
  litige:             "litigeOuvertLe",
};
