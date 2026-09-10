import { baseEmail, BRAND } from "../shared/base.js";
import { btn, heroSection, greeting, signature, infoBox, divider, escapeHtml } from "../shared/components.js";

// Relance adressée à un partenaire EXPORTATEUR dont les annonces sont en ligne
// mais incomplètes.
//
// Le message ne dit pas « complétez votre profil » — personne ne se lève pour
// remplir un formulaire. Il dit ce que CHAQUE information manquante coûte
// concrètement à l'exportateur :
//
//  • sans Incoterm, l'acheteur ne sait pas ce que le prix comprend, et le coût
//    rendu qu'on lui affiche est majoré par prudence — l'annonce paraît donc
//    plus chère qu'elle ne l'est ;
//  • sans destinations précises, l'annonce n'apparaît pas dans les recherches
//    de ces pays ;
//  • sans flotte complète, la moitié du stock reste invisible.
//
// Chaque chiffre du message est calculé sur SES annonces à lui, pas générique :
// un exportateur reconnaît son propre catalogue et agit ; il ignore une
// circulaire.

export function exporterProfileReminderTemplate(
  {
    firstName, companyName, totalListings, sansIncoterm, paysSansBareme,
    dashboardUrl, currency = "USD",
    // Renvoi après un premier message dont le bouton pointait vers une adresse
    // inaccessible. Le dire franchement vaut mieux qu'un doublon silencieux :
    // le destinataire reconnaît le message, et comprend pourquoi il le reçoit
    // deux fois au lieu de conclure qu'on le relance sans le lire.
    lienPrecedentCasse = false,
  },
  trackingPixel = ""
) {
  const lignes = [];

  if (sansIncoterm > 0) {
    lignes.push(`
      <li style="margin:0 0 12px">
        <strong>${sansIncoterm} annonce${sansIncoterm > 1 ? "s" : ""} sans règle de vente (Incoterm).</strong><br>
        <span style="color:${BRAND.muted}">
          Sans elle, l'acheteur ignore si votre prix comprend le fret et l'assurance.
          Le coût rendu que nous lui affichons est alors majoré par prudence :
          votre annonce paraît plus chère qu'elle ne l'est réellement.
        </span>
      </li>`);
  }

  if (paysSansBareme?.length) {
    lignes.push(`
      <li style="margin:0 0 12px">
        <strong>Destinations sans barème douanier : ${escapeHtml(paysSansBareme.join(", "))}.</strong><br>
        <span style="color:${BRAND.muted}">
          L'acheteur y voit votre prix, mais pas le coût rendu dédouané —
          l'information qui décide de l'achat. Nous complétons ces barèmes ;
          d'ici là, privilégiez les destinations déjà couvertes.
        </span>
      </li>`);
  }

  lignes.push(`
    <li style="margin:0 0 12px">
      <strong>Ajoutez le reste de votre flotte.</strong><br>
      <span style="color:${BRAND.muted}">
        Chaque véhicule publié est une entrée de plus dans les recherches des
        acheteurs. Vous pouvez importer un fichier plutôt que de saisir une à
        une vos annonces.
      </span>
    </li>`);

  const body = `
    ${heroSection(
      "Vos annonces sont en ligne",
      `${totalListings} annonce${totalListings > 1 ? "s" : ""} de ${escapeHtml(companyName)} sont désormais visibles sur VIT AUTO`,
      "🚢"
    )}
    ${greeting(firstName)}

    ${lienPrecedentCasse ? infoBox(
      `<strong>Nous vous renvoyons ce message : le bouton du précédent ne fonctionnait pas.</strong><br>`
      + `Une erreur de configuration de notre côté l'avait rendu inutilisable. `
      + `Celui-ci vous mène bien à votre tableau de bord. Toutes nos excuses pour le détour.`,
      "warning"
    ) : ""}

    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      Vos annonces d'export viennent d'être publiées et sont consultables par les
      acheteurs du Maroc, de Côte d'Ivoire, du Sénégal et de nos autres marchés.
      Nous affichons désormais à chaque acheteur le <strong>coût rendu dédouané
      dans SON pays</strong> — droits de douane, TVA, transit et livraison compris.
    </p>

    ${infoBox(
      `<strong>💱 Vos prix sont en dollars, convertis automatiquement.</strong><br>`
      + `Un acheteur à Abidjan voit votre prix en francs CFA, un acheteur à Casablanca en dirhams. `
      + `Vous cotez en ${escapeHtml(currency)}, nous nous chargeons du reste — vous n'avez aucune conversion à faire.`
    )}

    <p style="font-size:15px;color:${BRAND.text};font-weight:700;margin:26px 0 12px">
      Trois choses rendraient vos annonces nettement plus efficaces
    </p>
    <ul style="font-size:14px;color:${BRAND.text};line-height:1.7;margin:0 0 24px;padding-left:20px">
      ${lignes.join("")}
    </ul>

    ${btn("Compléter mes annonces", dashboardUrl)}

    ${divider()}
    <p style="font-size:13px;color:${BRAND.muted};line-height:1.6;margin:0">
      Une question sur les Incoterms, les barèmes douaniers ou l'import de votre
      flotte ? Répondez simplement à cet e-mail : nous vous accompagnons.
    </p>

    ${signature()}
    ${trackingPixel}
  `;

  const subject = `${companyName} — vos ${totalListings} annonces sont en ligne, 3 réglages pour mieux vendre`;

  return {
    subject,
    html: baseEmail({
      // Voir la note identique dans PartnerFleetCompletion.js : `subject` est du
      // texte brut côté en-tête, mais baseEmail l'interpole dans <title> sans
      // échappement — et `companyName` vient du partenaire.
      title: subject.replace(companyName, escapeHtml(companyName)),
      preheader: `Vos annonces d'export sont publiées. Trois réglages les rendraient nettement plus efficaces.`,
      body,
    }),
    text:
      `Bonjour ${firstName},\n\n`
      + (lienPrecedentCasse
        ? `NOUS VOUS RENVOYONS CE MESSAGE : LE BOUTON DU PRÉCÉDENT NE FONCTIONNAIT PAS.\nUne erreur de configuration de notre côté l'avait rendu inutilisable. Celui-ci vous mène bien à votre tableau de bord. Toutes nos excuses pour le détour.\n\n`
        : "")
      + `Vos ${totalListings} annonces d'export sont désormais publiées sur VIT AUTO et visibles par les acheteurs du Maroc, de Côte d'Ivoire et du Sénégal.\n\n`
      + `Nous affichons à chaque acheteur le coût rendu dédouané dans son pays. Vos prix sont en ${currency} et convertis automatiquement dans la devise de celui qui consulte.\n\n`
      + `Trois réglages rendraient vos annonces plus efficaces :\n`
      + (sansIncoterm > 0
        ? `- ${sansIncoterm} annonce(s) n'ont pas de règle de vente (Incoterm). Sans elle, le coût rendu affiché à l'acheteur est majoré par prudence : votre annonce paraît plus chère qu'elle ne l'est.\n`
        : "")
      + (paysSansBareme?.length
        ? `- Destinations sans barème douanier : ${paysSansBareme.join(", ")}. L'acheteur y voit votre prix mais pas le coût rendu.\n`
        : "")
      + `- Ajoutez le reste de votre flotte : chaque véhicule publié est une entrée de plus dans les recherches.\n\n`
      + `Compléter mes annonces : ${dashboardUrl}\n\n`
      + `Une question ? Répondez simplement à cet e-mail.\n\nL'équipe VIT AUTO`,
  };
}
