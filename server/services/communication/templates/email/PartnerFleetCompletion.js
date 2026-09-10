import { baseEmail, BRAND } from "../shared/base.js";
import { btn, heroSection, greeting, signature, infoBox, divider, escapeHtml } from "../shared/components.js";

// Relance adressée à un partenaire de LOCATION dont la flotte vient d'être mise
// en ligne, mais dont une partie reste en brouillon faute d'informations.
//
// Pendant de ExporterProfileReminder.js, pour l'autre métier. Même principe
// directeur : ne pas demander de « compléter son profil », mais dire ce que
// chaque manque coûte concrètement, sur SES véhicules à lui, nommés un par un.
// Un gérant reconnaît sa propre flotte et agit ; il ignore une circulaire.
//
// Le point délicat est celui des photos. Quand la plateforme a illustré les
// annonces avec des photos de référence du modèle (faute de photos réelles),
// il faut le dire franchement et en tête : une annonce illustrée par une autre
// voiture que celle qui attend le client à l'agence produit une contestation au
// comptoir, pas une réservation. D'où `photosProvisoires`.

export function partnerFleetCompletionTemplate(
  {
    firstName,
    companyName,
    publiees = [],          // [{ titre, prix, devise, dureeMin }]
    brouillons = [],        // [{ titre, manques: ["année", "tarif"] }]
    manquesCommuns = [],    // ["carburant", "description"] — sur toute la flotte
    photosProvisoires = false,
    dashboardUrl,
  },
  trackingPixel = ""
) {
  const total = publiees.length + brouillons.length;

  const ligneVehicule = (titre, detail, ton) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid ${BRAND.border};font-size:14px;color:${BRAND.text};font-weight:600">
        ${escapeHtml(titre)}
      </td>
      <td style="padding:10px 0;border-bottom:1px solid ${BRAND.border};font-size:13px;color:${ton};text-align:right">
        ${escapeHtml(detail)}
      </td>
    </tr>`;

  const tablePubliees = publiees.length
    ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 24px"><tbody>
         ${publiees.map((v) => ligneVehicule(
           v.titre,
           `${v.prix} ${v.devise} / jour · ${v.dureeMin} jour${v.dureeMin > 1 ? "s" : ""} minimum`,
           BRAND.success
         )).join("")}
       </tbody></table>`
    : "";

  const tableBrouillons = brouillons.length
    ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 24px"><tbody>
         ${brouillons.map((v) => ligneVehicule(v.titre, `manque : ${v.manques.join(", ")}`, BRAND.danger)).join("")}
       </tbody></table>`
    : "";

  const body = `
    ${heroSection(
      "Votre flotte est en ligne",
      `${publiees.length} véhicule${publiees.length > 1 ? "s" : ""} de ${escapeHtml(companyName)} ${publiees.length > 1 ? "sont visibles" : "est visible"} sur VIT AUTO`,
      "🔑"
    )}
    ${greeting(firstName)}

    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      Nous avons repris votre grille tarifaire et l'avons appliquée à votre flotte :
      millésime, tarif journalier et durée minimale de location. Vos coordonnées
      d'agence sont rattachées à chaque annonce — elles ne sont jamais affichées
      publiquement, elles servent à la réservation et au contrat.
    </p>

    ${photosProvisoires ? infoBox(
      `<strong>⚠️ Les photos sont provisoires — remplacez-les en priorité.</strong><br>`
      + `Nous n'avions aucune photo de vos véhicules : chaque annonce est illustrée `
      + `par une photo de référence du modèle et du millésime, à titre d'attente. `
      + `Ce ne sont pas vos voitures. Un client qui réserve sur une photo et découvre `
      + `une autre teinte ou une autre finition au comptoir conteste — et cette `
      + `contestation vous revient. Quelques photos prises au téléphone, en extérieur `
      + `et de jour, valent mieux que n'importe quelle image de catalogue.`,
      "warning"
    ) : ""}

    ${publiees.length ? `
      <p style="font-size:15px;color:${BRAND.text};font-weight:700;margin:26px 0 4px">
        En ligne et réservables
      </p>
      ${tablePubliees}` : ""}

    ${brouillons.length ? `
      <p style="font-size:15px;color:${BRAND.text};font-weight:700;margin:26px 0 4px">
        ${brouillons.length} véhicule${brouillons.length > 1 ? "s" : ""} en attente de votre part
      </p>
      <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 4px">
        ${brouillons.length > 1 ? "Ils ne figuraient pas" : "Il ne figurait pas"} sur la grille tarifaire
        que vous nous avez transmise. ${brouillons.length > 1 ? "Ils restent" : "Il reste"} en
        brouillon : invisible${brouillons.length > 1 ? "s" : ""} des clients, donc
        ${brouillons.length > 1 ? "ils ne génèrent" : "il ne génère"} aucune réservation.
      </p>
      ${tableBrouillons}` : ""}

    ${manquesCommuns.length ? `
      ${divider()}
      <p style="font-size:15px;color:${BRAND.text};font-weight:700;margin:20px 0 8px">
        Sur l'ensemble de la flotte
      </p>
      <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
        Il manque encore ${escapeHtml(manquesCommuns.join(", "))}. Rien de bloquant,
        mais ce sont précisément les filtres que les clients utilisent pour choisir :
        une annonce sans ces informations est écartée des résultats filtrés, même
        quand elle correspond au besoin.
      </p>` : ""}

    ${btn("Compléter ma flotte", dashboardUrl)}

    ${divider()}
    <p style="font-size:13px;color:${BRAND.muted};line-height:1.6;margin:0">
      Vous pouvez tout modifier vous-même depuis votre tableau de bord : tarifs,
      photos, caractéristiques et conditions de location. Une question, ou besoin
      que nous le fassions pour vous ? Répondez simplement à cet e-mail.
    </p>

    ${signature()}
    ${trackingPixel}
  `;

  const subject = brouillons.length
    ? `${companyName} — ${publiees.length} véhicule${publiees.length > 1 ? "s" : ""} en ligne, ${brouillons.length} en attente de vos informations`
    : `${companyName} — vos ${total} véhicules sont en ligne`;

  return {
    subject,
    html: baseEmail({
      // `subject` sert d'en-tête d'e-mail (texte brut) et peut donc porter le
      // nom d'agence tel quel. Passé à baseEmail il atterrit en revanche dans
      // <title>, interpolé sans échappement : le nom d'agence est saisi par le
      // partenaire, il doit être neutralisé ici.
      title: subject.replace(companyName, escapeHtml(companyName)),
      preheader: photosProvisoires
        ? "Vos annonces sont en ligne. Les photos sont provisoires : remplacez-les par les vôtres."
        : "Vos annonces sont en ligne. Quelques informations les rendraient plus efficaces.",
      body,
    }),
    text:
      `Bonjour ${firstName},\n\n`
      + `${publiees.length} véhicule(s) de ${companyName} sont désormais en ligne sur VIT AUTO. `
      + `Nous avons appliqué votre grille tarifaire : millésime, tarif journalier et durée minimale.\n\n`
      + (photosProvisoires
        ? `ATTENTION — LES PHOTOS SONT PROVISOIRES.\n`
          + `Nous n'avions aucune photo de vos véhicules : chaque annonce est illustrée par une photo de référence du modèle, à titre d'attente. Ce ne sont pas vos voitures. Remplacez-les en priorité : un client qui réserve sur une photo et découvre une autre voiture au comptoir conteste.\n\n`
        : "")
      + (publiees.length
        ? `EN LIGNE ET RÉSERVABLES\n`
          + publiees.map((v) => `- ${v.titre} : ${v.prix} ${v.devise}/jour, ${v.dureeMin} jour(s) minimum`).join("\n")
          + `\n\n`
        : "")
      + (brouillons.length
        ? `EN ATTENTE DE VOTRE PART (${brouillons.length})\n`
          + `Ces véhicules ne figuraient pas sur votre grille tarifaire. Ils restent en brouillon, invisibles des clients.\n`
          + brouillons.map((v) => `- ${v.titre} : manque ${v.manques.join(", ")}`).join("\n")
          + `\n\n`
        : "")
      + (manquesCommuns.length
        ? `SUR L'ENSEMBLE DE LA FLOTTE\nIl manque encore ${manquesCommuns.join(", ")}. Ce sont les filtres que les clients utilisent pour choisir.\n\n`
        : "")
      + `Compléter ma flotte : ${dashboardUrl}\n\n`
      + `Une question ? Répondez simplement à cet e-mail.\n\nL'équipe VIT AUTO`,
  };
}
