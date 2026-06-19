// Réponses de l'assistant virtuel VIT AUTO
const FAQS = [
  {
    keywords: ["réserver", "réservation", "réserv", "book"],
    answer: "Pour réserver un véhicule, rendez-vous sur le **Catalogue**, choisissez votre véhicule, puis cliquez sur « Réserver ». Vous pouvez choisir la livraison à domicile ou le retrait en agence.",
  },
  {
    keywords: ["prix", "tarif", "coût", "combien", "fcfa"],
    answer: "Les tarifs varient selon le véhicule et la durée. Consultez le catalogue pour voir le prix par jour. Des frais de service de 15 DH s'appliquent à chaque réservation.",
  },
  {
    keywords: ["livraison", "domicile", "livr", "déposer"],
    answer: "La livraison à domicile est disponible pour toutes les locations. Le GPS de livraison est inclus automatiquement — il suffit de sélectionner « Livraison à domicile » lors de la réservation et de renseigner votre adresse.",
  },
  {
    keywords: ["annuler", "annulation", "cancel"],
    answer: "Pour annuler une réservation, contactez directement le partenaire via le bouton 💬 de votre tableau de bord, ou contactez notre service client. Les annulations sont soumises aux conditions générales.",
  },
  {
    keywords: ["paiement", "payer", "orange", "wave", "mtn", "moov", "carte"],
    answer: "VIT AUTO accepte les paiements par **Orange Money**, **Wave**, **MTN Mobile Money**, **Moov Money**, carte bancaire et PayPal. Le paiement se fait à l'étape 3 de la réservation.",
  },
  {
    keywords: ["partenaire", "vendeur", "publier", "annonce", "vendre"],
    answer: "Pour devenir partenaire VIT AUTO et publier vos véhicules, rendez-vous sur la page **Devenir Partenaire** depuis le menu. Votre annonce sera validée par notre équipe sous 24h.",
  },
  {
    keywords: ["location", "louer", "durée"],
    answer: "La location est disponible à la journée. Sélectionnez vos dates de début et fin lors de la réservation. La durée minimale est de 1 jour.",
  },
  {
    keywords: ["essai", "tester", "test", "essayer"],
    answer: "Pour demander un essai d'un véhicule à vendre, cliquez sur « Essai » dans la fiche véhicule. Vous choisissez une date et heure de rendez-vous. Des frais de service de 15 DH s'appliquent.",
  },
  {
    keywords: ["leasing", "crédit", "mensualité", "financement"],
    answer: "Le leasing est disponible pour certains véhicules à vendre. Consultez la fiche du véhicule et cliquez sur « Leasing » pour voir les mensualités et l'apport initial requis.",
  },
  {
    keywords: ["chauffeur", "driver", "conducteur"],
    answer: "VIT AUTO propose des chauffeurs privés professionnels. Ajoutez l'option « Chauffeur privé » lors de votre réservation, ou consultez la section Chauffeurs dans le catalogue.",
  },
  {
    keywords: ["gps", "navigation", "position", "localisation"],
    answer: "Le GPS est inclus automatiquement pour toute livraison à domicile. Il permet au partenaire de vous localiser précisément. Pour les autres types de location, vous pouvez ajouter l'option GPS.",
  },
  {
    keywords: ["assurance", "accident", "garantie"],
    answer: "VIT AUTO propose une prime d'assurance optionnelle (250 DH/jour) qui couvre les dommages accidentels. Vous pouvez l'ajouter lors de la réservation.",
  },
  {
    keywords: ["contrat", "document", "accord"],
    answer: "Un contrat digital est automatiquement généré lors de la confirmation de votre réservation. Vous pouvez le consulter depuis votre tableau de bord.",
  },
  {
    keywords: ["compte", "profil", "inscription", "créer"],
    answer: "Créez votre compte VIT AUTO depuis la page **Inscription**. Vous aurez accès à votre tableau de bord, vos réservations et pourrez contacter directement les partenaires.",
  },
  {
    keywords: ["contact", "aide", "support", "problème", "question"],
    answer: "Notre service client VIT AUTO est disponible via ce chat. Cliquez sur **Service Client** pour démarrer une conversation avec un de nos agents.",
  },
  {
    keywords: ["statut", "commande", "suivi", "état", "tracking"],
    answer: "Suivez l'état de vos réservations en temps réel depuis votre **Tableau de bord**. Les étapes sont : Reçue → Acceptée → En cours → Prête → En route → Terminée.",
  },
  {
    keywords: ["notification", "alerte", "mail"],
    answer: "VIT AUTO vous notifie à chaque changement de statut de votre réservation (acceptation, préparation, départ, livraison). Activez le son 🔔 dans la cloche de notifications.",
  },
];

const GREETINGS = ["bonjour", "bonsoir", "salut", "hello", "coucou", "hi", "hey"];
const THANKS = ["merci", "thanks", "parfait", "super", "excellent", "top", "d'accord", "ok"];

export function getAssistantResponse(userMessage) {
  const msg = userMessage.toLowerCase().trim();

  if (GREETINGS.some((g) => msg.includes(g))) {
    return "Bonjour ! 👋 Je suis l'assistant virtuel VIT AUTO. Je peux vous aider avec les réservations, paiements, livraisons, et plus encore. Que puis-je faire pour vous ?";
  }

  if (THANKS.some((t) => msg.includes(t))) {
    return "Avec plaisir ! 😊 N'hésitez pas si vous avez d'autres questions. Pour une aide personnalisée, cliquez sur **Service Client**.";
  }

  for (const faq of FAQS) {
    if (faq.keywords.some((kw) => msg.includes(kw))) {
      return faq.answer;
    }
  }

  return "Je n'ai pas bien compris votre question. 🤔 Essayez des mots-clés comme *réservation*, *paiement*, *livraison*, *annulation*, *partenaire* — ou contactez notre **Service Client** pour une aide personnalisée.";
}
