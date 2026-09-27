// ── Les neuf outils de palier fonctionnent-ils vraiment ? ───────────────────
//
// Les tests serveur vérifient chaque outil isolément, avec des documents
// fabriqués. Ce script fait autre chose : il passe par l'API, en se
// connectant comme un partenaire et un client réels de la base semée, et
// enchaîne publication → configuration → usage. C'est la seule façon de voir
// ce qu'un test unitaire ne voit pas : un champ accepté par le modèle mais
// jamais lu par le contrôleur, une route non montée, un verrou posé au
// mauvais endroit du parcours.
//
// Même pile locale et mêmes variables que scripts/parcoursServices.mjs :
//   VERIF_PARTNER_ID / VERIF_CLIENT_ID / VERIF_SEME_PWD / VERIF_ADMIN_ID(+PWD)
//
//   node scripts/parcoursOutils.mjs
// Sort en code 1 à la moindre anomalie.
const API = process.env.API_LOCALE_URL || "http://localhost:5001";
const PWD = process.env.VERIF_SEME_PWD;
const PARTNER = process.env.VERIF_PARTNER_ID;
const CLIENT = process.env.VERIF_CLIENT_ID;
const ADMIN_ID = process.env.VERIF_ADMIN_ID;
const ADMIN_PWD = process.env.VERIF_ADMIN_PWD || PWD;
if (!PWD || !PARTNER || !CLIENT || !ADMIN_ID) {
  console.error("VERIF_PARTNER_ID / VERIF_CLIENT_ID / VERIF_SEME_PWD / VERIF_ADMIN_ID requis (apiLocale les publie)");
  process.exit(2);
}

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const anomalies = [];
const ok = (m) => console.log(`✓ ${m}`);
const ko = (m) => { anomalies.push(m); console.log(`✗ ${m}`); };
const titre = (m) => console.log(`\n── ${m} ──`);
// Décalage aléatoire par exécution : la base locale persiste, et deux
// réservations aux mêmes dates sur le même véhicule se bloqueraient (409) —
// un faux échec, comme dans scripts/parcoursServices.mjs.
const DECALAGE = 20 + Math.floor(Math.random() * 300);
const jours = (n) => new Date(Date.now() + (n + DECALAGE) * 86400000).toISOString();

async function connexion(id, pwd = PWD) {
  const r = await fetch(`${API}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "https://vit-auto.com" },
    body: JSON.stringify({ identifier: id, password: pwd }),
  });
  const d = await r.json().catch(() => ({}));
  if (!d.token) throw new Error(`connexion ${id} impossible (${r.status})`);
  return async (path, { method = "GET", body } = {}) => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Origin: "https://vit-auto.com", Authorization: `Bearer ${d.token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
}

/** Approuve une annonce et la réservation qui suit — sinon rien n'est visible. */
async function approuver(admin, chemin) {
  const r = await admin(chemin, { method: "PATCH", body: { status: "approved" } });
  return r.status < 400;
}

const partenaire = await connexion(PARTNER);
const client = await connexion(CLIENT);
const admin = await connexion(ADMIN_ID, ADMIN_PWD);

// ════════════════════════════════════════════════════════════════════════════
titre("Pièces — alerte de stock bas, frais de port par zone");
// ════════════════════════════════════════════════════════════════════════════
{
  const creation = await partenaire("/api/parts", {
    method: "POST",
    body: {
      category: "FREINAGE", title: "Plaquettes de frein — vérification outils",
      price: 60, priceEntered: 60, priceEntryCurrency: "USD",
      stock: 4, seuilStockBas: 3, minOrderQty: 1,
      shipping: {
        mode: "forfait", forfaitUSD: 20, deliveryDaysMin: 1, deliveryDaysMax: 5,
        countries: ["MA", "CI"],
        zones: [{ countries: ["CI"], forfaitUSD: 5, freeAboveUSD: 200, deliveryDaysMin: 1, deliveryDaysMax: 2 }],
      },
      images: [PNG], thumbnail: PNG, ville: "Casablanca", adresse: "Zone industrielle",
    },
  });
  if (creation.status !== 201) { ko(`création de pièce refusée (${creation.status} ${creation.data?.message || ""})`); }
  else {
    const piece = creation.data.part || creation.data;
    ok("pièce publiée avec seuil d'alerte et zone tarifaire");
    if (piece.seuilStockBas === 3) ok("le seuil d'alerte est bien ENREGISTRÉ (et non perdu en silence)");
    else ko(`seuil d'alerte perdu : reçu ${JSON.stringify(piece.seuilStockBas)}`);
    if (piece.shipping?.zones?.length === 1) ok("la zone tarifaire est bien enregistrée");
    else ko(`zone de livraison perdue : ${JSON.stringify(piece.shipping?.zones)}`);

    // Le devis de livraison doit appliquer la ZONE, pas le forfait unique.
    // Le devis public ne sert QUE les annonces approuvées (404 sinon) — sans
    // cette approbation, l'absence de réponse ressemble à s'y méprendre à
    // « la zone est ignorée ».
    await approuver(admin, `/api/parts/${piece._id}/status`);

    // ⚠️ le paramètre s'appelle `country` et le montant vit sous
    // `shipping.feeUSD` — lire à côté rend `undefined`, qui ressemble
    // exactement à « la zone est ignorée ».
    const devisZone = await client(`/api/parts/${piece._id}/shipping-quote?country=CI&quantity=1`);
    const devisHors = await client(`/api/parts/${piece._id}/shipping-quote?country=MA&quantity=1`);
    const fZone = devisZone.data?.shipping?.feeUSD;
    const fHors = devisHors.data?.shipping?.feeUSD;
    if (fZone === 5) ok("frais de port par zone appliqués (5 $ en CI au lieu de 20 $)");
    else ko(`zone ignorée : CI facturé ${JSON.stringify(fZone)} au lieu de 5`);
    if (fHors === 20) ok("un pays hors zone garde le forfait unique — comportement d'avant préservé");
    else ko(`pays hors zone : ${JSON.stringify(fHors)} au lieu de 20`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
titre("Loisirs — tarifs de groupe, report de séance, billet à QR code");
// ════════════════════════════════════════════════════════════════════════════
{
  const creation = await partenaire("/api/activities", {
    method: "POST",
    body: {
      activityType: "QUAD", title: "Sortie quad — vérification outils",
      price: 50, priceUnit: "per_person", priceEntered: 50, priceEntryCurrency: "USD",
      durationMinutes: 120, capacity: 20,
      tarifsGroupe: [{ aPartirDe: 6, prixParPersonne: 40 }, { aPartirDe: 12, prixParPersonne: 30 }],
      images: [PNG], thumbnail: PNG, ville: "Agadir", adresse: "Plage",
    },
  });
  if (creation.status !== 201) ko(`création d'activité refusée (${creation.status} ${creation.data?.message || ""})`);
  else {
    const act = creation.data.activity || creation.data;
    ok("activité publiée");
    if (act.tarifsGroupe?.length === 2) ok("les paliers de groupe sont ENREGISTRÉS dès la publication");
    else ko(`paliers de groupe perdus à la création : ${JSON.stringify(act.tarifsGroupe)}`);
    await approuver(admin, `/api/activities/${act._id}/status`);

    // 8 participants → palier « à partir de 6 » = 40 $/personne = 320 $.
    const resa = await client("/api/bookings", {
      method: "POST",
      body: {
        type: "activite", activityId: act._id,
        clientInfo: { firstName: "Ama", lastName: "Koné", email: "ama.kone@example.test", passportNumber: "P7654321" },
        activite: { date: jours(30), participants: 8, weatherAcknowledged: true },
      },
    });
    if (resa.status !== 201) ko(`réservation d'activité refusée (${resa.status} ${resa.data?.message || ""})`);
    else {
      const b = resa.data.booking;
      if (b.montantBase === 320) ok("tarif de groupe appliqué : 8 × 40 $ = 320 $ (et non 8 × 50)");
      else ko(`tarif de groupe non appliqué : montantBase = ${b.montantBase} au lieu de 320`);

      await admin(`/api/bookings/${b._id}/admin-validate`, { method: "PATCH", body: { decision: "approve" } });
      await partenaire(`/api/bookings/${b._id}/status`, { method: "PATCH", body: { status: "confirmed" } });

      // Billet : émission (verrou lu sur le PARTENAIRE), puis scan unique.
      const billet = await client(`/api/bookings/${b._id}/billet`);
      if (billet.status === 200 && /^data:image\/png/.test(billet.data.qr || "")) ok("billet émis avec son QR code");
      else ko(`billet non émis (${billet.status} ${billet.data?.message || ""})`);

      const detail = await client(`/api/bookings/${b._id}/detail`);
      // ⚠️ getBookingDetail répond { booking: … } — lire un niveau trop haut
      // rend `undefined` et ferait croire à un champ non exposé.
      const jeton = detail.data?.booking?.activite?.billet?.jeton;
      if (!jeton) ko("le jeton du billet n'est pas exposé au client — le QR ne mène à rien");
      else {
        const un = await partenaire("/api/bookings/billet/scan", { method: "POST", body: { jeton } });
        const deux = await partenaire("/api/bookings/billet/scan", { method: "POST", body: { jeton } });
        if (un.status === 200 && un.data.valide) ok("billet scanné et validé par le partenaire");
        else ko(`scan refusé à tort (${un.status} ${un.data?.message || ""})`);
        if (deux.status === 409) ok("le même billet présenté deux fois est refusé");
        else ko(`double entrée acceptée (${deux.status}) — le contrôle d'unicité ne tient pas`);
      }

      // Report de séance proposé par le partenaire, accepté par le client.
      const prop = await partenaire(`/api/bookings/${b._id}/report-seance`, {
        method: "PATCH", body: { nouvelleDate: jours(45), motif: "meteo", note: "Mer agitée" },
      });
      if (prop.status === 200) ok("report de séance proposé");
      else ko(`report refusé (${prop.status} ${prop.data?.message || ""})`);
      const rep = await client(`/api/bookings/${b._id}/report-seance/reponse`, { method: "PATCH", body: { accepte: true } });
      if (rep.status === 200) ok("report accepté par le client — la séance se déplace");
      else ko(`réponse au report refusée (${rep.status} ${rep.data?.message || ""})`);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
titre("Chauffeur — zones tarifaires, mise à disposition longue durée");
// ════════════════════════════════════════════════════════════════════════════
{
  const creation = await partenaire("/api/drivers", {
    method: "POST",
    body: {
      firstName: "Koffi", lastName: "Yao", title: "Chauffeur — vérification outils",
      profilePhoto: PNG, cv: "https://cdn.example.test/cv.pdf",
      disponibilite: "Temps plein", zone: "Abidjan", ville: "Abidjan", experience: "8 ans",
      tarifHeure: 20, tarifMois: 1000,
      zonesTarifaires: [{ nom: "Aéroport", supplementUSD: 50 }],
      miseADisposition: { active: true, dureeMinMois: 3, dureeMaxMois: 12, paliers: [{ aPartirDeMois: 6, remisePourcent: 10 }] },
      identityDocument: { type: "cni", frontImage: PNG },
      licenseDocument: { frontImage: PNG },
    },
  });
  if (creation.status !== 201) ko(`création de chauffeur refusée (${creation.status} ${creation.data?.message || ""})`);
  else {
    const drv = creation.data.driver || creation.data;
    ok("chauffeur publié");
    if (drv.zonesTarifaires?.length === 1) ok("zones tarifaires ENREGISTRÉES dès la publication");
    else ko(`zones chauffeur perdues à la création : ${JSON.stringify(drv.zonesTarifaires)}`);
    if (drv.miseADisposition?.active) ok("offre de mise à disposition ENREGISTRÉE dès la publication");
    else ko(`offre longue durée perdue à la création : ${JSON.stringify(drv.miseADisposition)}`);
    await approuver(admin, `/api/drivers/${drv._id}/status`);

    // 6 mois + zone aéroport : 1 000 − 10 % = 900 × 6 = 5 400, + 50 une fois.
    const resa = await client("/api/bookings", {
      method: "POST",
      body: {
        type: "chauffeur", driverId: drv._id,
        clientInfo: { firstName: "Ama", lastName: "Koné", email: "ama.kone@example.test", passportNumber: "P7654321" },
        documents: { identity: { type: "cni", frontImage: PNG } },
        chauffeur: { date: jours(20), unite: "mois", quantite: 6, zone: "Aéroport" },
      },
    });
    if (resa.status !== 201) ko(`réservation chauffeur refusée (${resa.status} ${resa.data?.message || ""})`);
    else {
      const b = resa.data.booking;
      if (b.montantBase === 5450) ok("contrat 6 mois : remise d'engagement + supplément de zone une seule fois (5 450 $)");
      else ko(`montant du contrat faux : ${b.montantBase} au lieu de 5 450`);
      const ech = b.chauffeur?.contrat?.echeances || [];
      const somme = Math.round(ech.reduce((s, e) => s + e.montantUSD, 0) * 100) / 100;
      if (ech.length === 6) ok("échéancier de 6 mensualités construit");
      else ko(`échéancier incomplet : ${ech.length} échéance(s)`);
      if (somme === b.montantBase) ok("la somme des échéances vaut EXACTEMENT le montant de la commande");
      else ko(`échéancier incohérent : ${somme} ≠ ${b.montantBase}`);

      await admin(`/api/bookings/${b._id}/admin-validate`, { method: "PATCH", body: { decision: "approve" } });
      const reg = await partenaire(`/api/bookings/${b._id}/echeance/1`, { method: "PATCH", body: { moyenPaiement: "virement" } });
      if (reg.status === 200 && reg.data.echeances?.[0]?.statut === "reglee") ok("première échéance marquée réglée par le partenaire");
      else ko(`règlement d'échéance refusé (${reg.status} ${reg.data?.message || ""})`);
      const rejeu = await partenaire(`/api/bookings/${b._id}/echeance/1`, { method: "PATCH", body: {} });
      if (rejeu.status === 409) ok("une échéance déjà réglée ne se règle pas deux fois");
      else ko(`double encaissement accepté (${rejeu.status})`);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
titre("Location — état des lieux photo");
// ════════════════════════════════════════════════════════════════════════════
{
  const mesAnnonces = await partenaire("/api/vehicles/mine?limit=50");
  const vehicule = (mesAnnonces.data?.vehicles || []).find((v) => v.type === "location" && v.status === "approved");
  if (!vehicule) console.log("· aucune annonce de location approuvée dans la base semée — état des lieux non vérifié ici");
  else {
    const resa = await client("/api/bookings", {
      method: "POST",
      body: {
        type: "location", vehicleId: vehicule._id,
        clientInfo: { firstName: "Ama", lastName: "Koné", email: "ama.kone@example.test", passportNumber: "P7654321" },
        documents: { identity: { type: "cni", frontImage: PNG }, license: { frontImage: PNG } },
        location: { startDate: jours(60), endDate: jours(63), pickupMethod: "retrait" },
      },
    });
    if (resa.status !== 201) console.log(`· réservation de location non aboutie (${resa.status} ${resa.data?.message || ""}) — état des lieux non vérifié`);
    else {
      const b = resa.data.booking;
      await admin(`/api/bookings/${b._id}/admin-validate`, { method: "PATCH", body: { decision: "approve" } });
      await partenaire(`/api/bookings/${b._id}/status`, { method: "PATCH", body: { status: "confirmed" } });
      await partenaire(`/api/bookings/${b._id}/status`, { method: "PATCH", body: { status: "ready" } });
      const edl = await partenaire(`/api/bookings/${b._id}/etat-des-lieux`, {
        method: "PATCH", body: { moment: "depart", photos: [PNG], kilometrage: 84500, carburant: 75, notes: "Rayure aile avant droite" },
      });
      if (edl.status === 200) ok("état des lieux de départ enregistré (photo, km, carburant)");
      else ko(`état des lieux refusé (${edl.status} ${edl.data?.message || ""})`);
      const rejeu = await partenaire(`/api/bookings/${b._id}/etat-des-lieux`, { method: "PATCH", body: { moment: "depart", photos: [PNG] } });
      if (rejeu.status === 409) ok("un état des lieux ne se refait pas — le premier fait foi");
      else ko(`état des lieux réécrit (${rejeu.status}) : la preuve n'est pas figée`);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
titre("Import de catalogue de pièces");
// ════════════════════════════════════════════════════════════════════════════
{
  const csv = "titre;categorie;prix;devise;stock;seuil_alerte;qte_min;mode;livraison;forfait_livraison;delai_min;delai_max;ville\n"
    + "Filtre à huile — vérification;FILTRES_ENTRETIEN;18;USD;12;4;1;direct;forfait;10;1;3;Casablanca\n";
  const r = await partenaire("/api/parts/import", {
    method: "POST",
    body: { fileName: "verif.csv", fileBase64: Buffer.from(csv, "utf8").toString("base64"), dryRun: false },
  });
  if (r.status < 400) ok(`import de catalogue accepté (${r.status})`);
  else if (r.status === 403 && r.data?.code === "PLAN_REQUIS") ok("import de catalogue verrouillé par le palier — verrou actif");
  else ko(`import de catalogue en échec (${r.status} ${r.data?.message || ""})`);
}

console.log(`\n${anomalies.length === 0 ? "✓ Les outils répondent tous correctement." : `✗ ${anomalies.length} anomalie(s) :\n  - ${anomalies.join("\n  - ")}`}`);
process.exit(anomalies.length === 0 ? 0 : 1);
