// Slug d'une ville pour les URL de pages locales (/location-voiture/abidjan).
//
// Partagé entre l'application et le générateur de sitemap
// (scripts/generateSitemap.mjs) : les deux DOIVENT produire exactement la même
// chaîne, sinon le sitemap annonce des adresses que l'application ne sait pas
// résoudre — Google les explore et reçoit une page vide.
//
// Volontairement sans dépendance : décomposition Unicode pour retirer les
// accents (Abidjan/Bouaké/Casablanca/Marrakech...), puis tout ce qui n'est pas
// alphanumérique devient un tiret.
export function slugifyCity(nom) {
  return String(nom || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
