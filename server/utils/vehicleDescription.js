// Génère une description marketing courte à partir des champs structurés du
// véhicule — utilisé (1) pour combler en masse les annonces HO RENT livrées
// sans description, et (2) comme action admin "Générer une description" pour
// n'importe quelle annonce qui en manque (voir vehicleController.generateDescription).
// Volontairement basé sur un dictionnaire de blurbs par modèle plutôt qu'un
// appel LLM : déterministe, gratuit, sans dépendance externe ni latence.

const MODEL_BLURBS = [
  { test: (m) => m.includes("JOGGER"), text: "un break familial 7 places, parfait pour les longs trajets et les bagages" },
  { test: (m) => m.includes("SANDERO"), text: "une citadine polyvalente, économique et agréable à conduire au quotidien" },
  { test: (m) => m.includes("LOGAN"), text: "une berline spacieuse et fiable, idéale pour la ville comme la route" },
  { test: (m) => m.includes("MICRA"), text: "une citadine compacte et maniable, parfaite pour circuler en ville" },
  { test: (m) => m.includes("MAGNIT"), text: "un SUV compact moderne, confortable pour la ville et les escapades" },
  { test: (m) => m.includes("QASHQAI"), text: "un SUV compact réputé pour son confort et sa polyvalence" },
  { test: (m) => m.includes("JUKE"), text: "un crossover compact au style affirmé, agréable à conduire" },
  { test: (m) => m.includes("2008"), text: "un SUV urbain élégant, compact et bien équipé" },
  { test: (m) => m.includes("208"), text: "une citadine dynamique et économique, idéale pour la ville" },
  { test: (m) => m.includes("CLIO"), text: "une citadine moderne, confortable et économique en carburant" },
  { test: (m) => m.includes("ARKANA"), text: "un SUV coupé élégant, alliant style et confort de conduite" },
  { test: (m) => m.includes("MEGANE"), text: "une compacte confortable, idéale pour la ville et les longs trajets" },
  { test: (m) => m.includes("EXPRESS"), text: "un utilitaire compact pratique, idéal pour le transport de charges" },
  { test: (m) => m.includes("AIRCROSS"), text: "un SUV compact spacieux et confortable, parfait pour toute la famille" },
  { test: (m) => m.includes("ELYS"), text: "une berline confortable et bien équipée, idéale pour la route" },
  { test: (m) => m.includes("C3"), text: "une citadine élégante et confortable, parfaite pour la ville" },
  { test: (m) => m.includes("CITYRAY"), text: "un SUV/crossover moderne, spacieux et bien équipé" },
  { test: (m) => m.includes("GX3"), text: "un SUV compact moderne, spacieux et idéal pour la ville comme les longs trajets" },
  { test: (m) => m.includes("CABRIOLET"), text: "une citadine décapotable emblématique, pour rouler avec style" },
  { test: (m) => m.includes("SCUDO"), text: "un utilitaire spacieux, idéal pour le transport de charges volumineuses" },
  { test: (m) => m.includes("I10"), text: "une citadine compacte et économique, parfaite pour la ville" },
  { test: (m) => m.includes("ACCENT"), text: "une berline compacte fiable et confortable" },
  { test: (m) => m.includes("CRETA"), text: "un SUV compact confortable et bien équipé pour toute la famille" },
  { test: (m) => m.includes("ELANTRA"), text: "une berline familiale confortable et spacieuse" },
  { test: (m) => m.includes("BAYON"), text: "un SUV urbain compact, agile et bien équipé" },
  { test: (m) => m.includes("COMPAS") || m.includes("COMPASS"), text: "un SUV robuste et confortable, adapté à tous les terrains" },
  { test: (m) => m.includes("AVENGER"), text: "un SUV compact moderne, économique et agréable à conduire" },
  { test: (m) => m.includes("PICANTO"), text: "une citadine compacte et économique, idéale pour la ville" },
  { test: (m) => m.includes("CARNIVAL"), text: "un grand monospace familial, spacieux et tout confort" },
  { test: (m) => m.includes("CARENS"), text: "un monospace confortable et modulable, idéal pour la famille" },
  { test: (m) => m.includes("MG3"), text: "une citadine moderne, bien équipée et économique" },
  { test: (m) => m.includes("YARIS"), text: "un SUV hybride compact, économique et confortable" },
  { test: (m) => m.includes("TOUAREG"), text: "un SUV premium spacieux et puissant, tout confort" },
  { test: (m) => m.includes("GOLF"), text: "une compacte emblématique, confortable et agréable à conduire" },
  { test: (m) => m.includes("T-ROC") || m.includes("T ROC"), text: "un SUV compact élégant et bien équipé" },
  { test: (m) => m.includes("Q5"), text: "un SUV premium raffiné, puissant et tout confort" },
  { test: (m) => m.includes("JUNIOR"), text: "un SUV compact au design italien, élégant et dynamique" },
  { test: (m) => m.includes("DS4"), text: "une compacte premium au raffinement remarquable" },
  { test: (m) => m.includes("DS7"), text: "un SUV premium élégant, spacieux et tout confort" },
  { test: (m) => m.includes("MACAN"), text: "un SUV sportif premium, puissant et raffiné" },
];

function pickBlurb(marque, modele) {
  const m = `${marque || ""} ${modele || ""}`.toUpperCase();
  const match = MODEL_BLURBS.find((b) => b.test(m));
  return match?.text || "un véhicule fiable et confortable, entretenu avec soin";
}

// `vehicle` = document Mongoose (ou objet .lean()) — champs lus tels quels,
// tous optionnels sauf marque/modele/title (toujours présents à la création).
export function generateVehicleDescription(vehicle) {
  const marque = vehicle.marque || "";
  const modele = vehicle.modele || vehicle.title || "";
  const blurb = pickBlurb(marque, modele);
  const isSale = vehicle.type === "vente";

  const parts = [];
  parts.push(`${marque} ${modele}`.trim() + (isSale ? " à vendre" : " disponible à la location") + (vehicle.ville ? ` à ${vehicle.ville}` : "") + ` : ${blurb}.`);

  const equip = [];
  if (vehicle.climatisation) equip.push("climatisation");
  if (vehicle.nombrePlaces) equip.push(`${vehicle.nombrePlaces} places`);
  if (vehicle.carburant) equip.push(vehicle.carburant.toLowerCase());
  if (vehicle.transmission) equip.push(vehicle.transmission === "automatique" ? "boîte automatique" : vehicle.transmission);
  if (equip.length) parts.push(equip.join(", ").replace(/^./, (c) => c.toUpperCase()) + ".");

  if (!isSale) {
    const policies = [];
    if (vehicle.fuelPolicy) policies.push(`carburant : ${vehicle.fuelPolicy.toLowerCase()}`);
    if (vehicle.cancellationPolicy) policies.push(vehicle.cancellationPolicy.toLowerCase());
    if (vehicle.insuranceIncluded) policies.push("assurance complète incluse");
    if (policies.length) parts.push(policies.join(" · ").replace(/^./, (c) => c.toUpperCase()) + ".");
  }

  parts.push("Réservez dès maintenant sur VIT AUTO.");
  return parts.join(" ");
}
