import { useEffect, useState } from "react";

// Validation du partenaire, telle que le serveur la calcule
// (/api/users/me/validation → services/validationPartenaire.js) : la SEULE
// source qui dit si un partenaire a encore quelque chose à fournir.
//
// Les anciennes pages (certification 8 niveaux, dossier Founding Partner,
// critères de Vérification Partenaire) ont chacune leur propre statut, resté
// « non commencé » ou « en attente » chez des partenaires validés : un loueur
// en règle y lisait encore des démarches à faire (plainte du 2026-10-10).
// Ces pages lisent désormais ce hook avant d'afficher quoi que ce soit comme
// « à compléter ».
export default function useValidationPartenaire(token) {
  const [validation, setValidation] = useState(null);
  useEffect(() => {
    if (!token) return undefined;
    let actif = true;
    fetch("/api/users/me/validation", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (actif) setValidation(d?.validation || null); })
      .catch(() => {});
    return () => { actif = false; };
  }, [token]);
  return validation;
}

export const estValide = (validation) => validation?.statut === "valide";
