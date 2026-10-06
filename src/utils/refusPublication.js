// Message et lien à montrer quand le serveur refuse une publication (403).
//
// Avant le 2026-10-05, les pages de dépôt (pièces, activités, véhicules)
// quittaient le formulaire vers /kyc ou /partner-onboarding au moment du
// refus : le travail saisi était perdu, et un partenaire dont le dossier
// d'identité était DÉJÀ en examen ne comprenait pas pourquoi on le renvoyait
// là — un partenaire « pièces » de Côte d'Ivoire a cru son annonce publiée.
// On reste désormais sur le formulaire, on explique, et on propose le lien.
export function refusPublication(err, user) {
  const code = err?.code;
  if (code === "KYC_REQUIRED") {
    const dossierEnvoye = !!user?.kycSubmittedAt && user?.kycStatus !== "REFUSE";
    if (dossierEnvoye) {
      return {
        message: "Votre annonce n'a pas encore été publiée : votre vérification d'identité est en cours d'examen par notre équipe. Vous pourrez publier dès qu'elle sera validée — gardez cette page ouverte ou revenez après la validation.",
        lien: "/kyc", libelle: "Voir l'état de ma vérification",
      };
    }
    return {
      message: user?.kycStatus === "REFUSE"
        ? "Votre annonce n'a pas été publiée : votre vérification d'identité a été refusée. Renvoyez vos documents pour pouvoir publier."
        : "Votre annonce n'a pas été publiée : vérifiez d'abord votre identité (pièce d'identité + selfie). Cela prend 2 minutes.",
      lien: "/kyc", libelle: "Vérifier mon identité",
    };
  }
  if (code === "CERTIFICATION_REQUIRED") {
    return {
      message: "Votre annonce n'a pas été publiée : terminez d'abord votre vérification partenaire.",
      lien: "/partner-certification", libelle: "Terminer ma vérification",
    };
  }
  if (code === "SECTEUR_REQUIS") {
    return { message: err.message || "Votre compte ne couvre pas ce secteur d'activité.", lien: "/vendor/dashboard", libelle: "Demander ce secteur" };
  }
  if (code === "QUOTA_ANNONCES" || code === "PLAN_REQUIS") {
    return { message: err.message || "Votre palier ne permet pas cette publication.", lien: "/plans", libelle: "Voir les paliers" };
  }
  return null;
}
