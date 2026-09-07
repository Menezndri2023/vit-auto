// Téléchargement d'un fichier servi par une route authentifiée (reçu, contrat,
// facture PDF).
//
// Bug réel, présent côté client ET côté admin : ces documents étaient exposés
// par de simples <a href="/api/...">. Or l'authentification de cette
// architecture repose uniquement sur l'en-tête `Authorization` (aucun cookie de
// session — voir middleware/auth.js), et la navigation déclenchée par un <a>
// n'envoie jamais d'en-tête personnalisé : le clic ouvrait donc un onglet
// affichant {"message":"Non autorisé"} au lieu du PDF. Le tableau de bord
// partenaire avait déjà sa propre correction locale ; celle-ci est partagée par
// toutes les interfaces.
//
// Retourne { ok, message } — l'appelant affiche l'erreur avec son propre toast.
export async function downloadAuthFile(url, filename, token) {
  if (!token) return { ok: false, message: "Session expirée — reconnectez-vous." };
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      return { ok: false, message: data?.message || "Impossible de télécharger le document." };
    }
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Laisse au navigateur le temps de démarrer le téléchargement avant de
    // libérer l'URL (une révocation immédiate annule le téléchargement sur
    // Safari/iOS).
    setTimeout(() => URL.revokeObjectURL(objUrl), 10_000);
    return { ok: true };
  } catch {
    return { ok: false, message: "Erreur réseau — document non téléchargé." };
  }
}
