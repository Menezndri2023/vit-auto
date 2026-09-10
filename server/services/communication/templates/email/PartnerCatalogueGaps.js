import { baseEmail, BRAND } from "../shared/base.js";
import { btn, heroSection, greeting, signature, infoBox, divider, escapeHtml } from "../shared/components.js";

// Ce que nous ne pouvons PAS deviner sur le catalogue d'un partenaire.
//
// À la différence des autres relances, ce message part d'un travail déjà fait :
// nous avons repris son site, aligné ses tarifs et ses conditions. Il ne demande
// donc pas « complétez votre profil », il dit exactement où notre reprise
// s'arrête et pourquoi. Un partenaire qui voit qu'on a fait 90 % du chemin fait
// volontiers les 10 % restants ; le même partenaire devant un formulaire vide
// ne fait rien.
//
// Chaque bloc est facultatif : le message ne mentionne que les manques réels,
// calculés depuis la base au moment de l'envoi.

export function partnerCatalogueGapsTemplate(
  {
    firstName, companyName,
    annoncesTotal, tarifsCorriges,
    villesSansAdresse = [],   // [{ ville, annonces }]
    annoncesSansAnnee = 0,
    modelesADecider = [],     // titres absents de leur site aujourd'hui
    nouveauxModeles = [],     // [{ titre, prix, devise }] créés depuis leur site
    identifiantsLegauxManquants = false,
    dashboardUrl,
  },
  trackingPixel = ""
) {
  const bloc = (titre, corps) => `
    <p style="font-size:15px;color:${BRAND.text};font-weight:700;margin:24px 0 6px">${titre}</p>
    <div style="font-size:14px;color:${BRAND.muted};line-height:1.7">${corps}</div>`;

  const morceaux = [];

  if (villesSansAdresse.length) {
    morceaux.push(bloc(
      "L'adresse exacte de vos agences",
      villesSansAdresse.map((v) => `<strong>${escapeHtml(v.ville)}</strong> — ${v.annonces} annonces`).join("<br>")
      + `<br><br>Votre site ne publie l'adresse que de Casablanca. Pour ces villes,
         nos annonces indiquent seulement « Agence ${escapeHtml(villesSansAdresse[0].ville)} ».
         Un client qui ne sait pas où récupérer la voiture réserve ailleurs, et
         l'adresse conditionne aussi le calcul des frais de livraison.`
    ));
  }

  if (annoncesSansAnnee) {
    morceaux.push(bloc(
      "Le millésime des véhicules",
      `<strong>${annoncesSansAnnee} annonces sur ${annoncesTotal}</strong> n'indiquent aucune année.<br><br>
       Nous préférons ne rien afficher plutôt qu'une année approximative — mais
       le millésime est l'un des premiers filtres qu'un client applique, et une
       annonce sans année disparaît de ses résultats. Une liste simple
       « modèle → année » suffit, nous nous chargeons de la saisie.`
    ));
  }

  if (nouveauxModeles.length) {
    morceaux.push(bloc(
      `${nouveauxModeles.length} véhicules ajoutés depuis votre site — à confirmer`,
      `Ils figurent sur votre catalogue en ligne mais n'existaient pas chez nous :<br><br>`
      + nouveauxModeles.map((m) => `<strong>${escapeHtml(m.titre)}</strong> — ${m.prix} ${escapeHtml(m.devise)}/jour`).join("<br>")
      + `<br><br>Un mot de votre part et ils passent en ligne.`
    ));
  }

  if (modelesADecider.length) {
    morceaux.push(bloc(
      "Des véhicules que votre site ne présente plus",
      modelesADecider.map((t) => escapeHtml(t)).join(", ")
      + `<br><br>Faut-il les retirer, ou sont-ils toujours disponibles ? Nous les
         avons laissés en l'état plutôt que de décider à votre place.`
    ));
  }

  if (identifiantsLegauxManquants) {
    morceaux.push(bloc(
      "Vos identifiants légaux",
      `RC, ICE et IF. Ils n'apparaissent pas sur votre site et ne figurent pas
       dans votre dossier. Ils sont nécessaires pour établir vos factures et vos
       contrats de location au nom de l'agence.`
    ));
  }

  const body = `
    ${heroSection(
      "Votre catalogue est à jour",
      `${annoncesTotal} annonces de ${escapeHtml(companyName)} alignées sur votre site`,
      "🔑"
    )}
    ${greeting(firstName)}

    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      Nous avons repris votre site pour mettre vos annonces à jour : tarifs,
      boîte de vitesses, carburant, catégorie, et vos propres visuels de
      catalogue. Vos conditions y figurent désormais aussi — 23 ans minimum,
      permis de plus de deux ans, trois jours de location minimum, assurance
      tous risques, carburant identique et annulation gratuite.
    </p>

    ${tarifsCorriges ? infoBox(
      `<strong>${tarifsCorriges} tarifs ont été corrigés.</strong><br>`
      + `Ils ne correspondaient plus à ceux de votre site — la plupart étaient `
      + `AU-DESSUS de vos prix réels. Vérifiez-les d'un coup d'œil depuis votre `
      + `tableau de bord : c'est votre grille qui fait foi, pas la nôtre.`,
      "warning"
    ) : ""}

    <p style="font-size:15px;color:${BRAND.text};font-weight:700;margin:28px 0 4px">
      Ce que nous ne pouvons pas deviner
    </p>
    ${morceaux.join("")}

    ${btn("Voir mon catalogue", dashboardUrl)}

    ${divider()}
    <p style="font-size:13px;color:${BRAND.muted};line-height:1.6;margin:0">
      Le plus simple reste de répondre à cet e-mail : envoyez-nous ces
      informations comme elles vous viennent, même en vrac, nous faisons la
      saisie.
    </p>

    ${signature()}
    ${trackingPixel}
  `;

  const subject = `${companyName} — catalogue mis à jour, 4 informations nous manquent`;

  return {
    subject,
    html: baseEmail({
      title: subject.replace(companyName, escapeHtml(companyName)),
      preheader: "Vos tarifs et conditions sont alignés sur votre site. Il nous manque quelques informations.",
      body,
    }),
    text:
      `Bonjour ${firstName},\n\n`
      + `Nous avons repris votre site pour mettre à jour vos ${annoncesTotal} annonces : tarifs, boîte, carburant, catégorie et vos propres visuels. Vos conditions y figurent aussi (23 ans, permis > 2 ans, 3 jours minimum, tous risques, carburant identique, annulation gratuite).\n\n`
      + (tarifsCorriges ? `${tarifsCorriges} TARIFS ONT ÉTÉ CORRIGÉS — ils ne correspondaient plus à ceux de votre site, la plupart étaient au-dessus de vos prix réels. C'est votre grille qui fait foi.\n\n` : "")
      + `CE QUE NOUS NE POUVONS PAS DEVINER\n\n`
      + (villesSansAdresse.length
        ? `1. L'adresse exacte de vos agences\n`
          + villesSansAdresse.map((v) => `   - ${v.ville} : ${v.annonces} annonces`).join("\n")
          + `\n   Votre site ne publie que celle de Casablanca. Nos annonces y indiquent seulement « Agence <ville> ».\n\n`
        : "")
      + (annoncesSansAnnee
        ? `2. Le millésime des véhicules — ${annoncesSansAnnee} annonces sur ${annoncesTotal} n'en ont aucun.\n   Nous préférons ne rien afficher qu'une année approximative, mais c'est un des premiers filtres des clients. Une liste « modèle → année » suffit.\n\n`
        : "")
      + (nouveauxModeles.length
        ? `3. ${nouveauxModeles.length} véhicules ajoutés depuis votre site, à confirmer :\n`
          + nouveauxModeles.map((m) => `   - ${m.titre} : ${m.prix} ${m.devise}/jour`).join("\n") + `\n\n`
        : "")
      + (modelesADecider.length
        ? `4. Véhicules que votre site ne présente plus : ${modelesADecider.join(", ")}.\n   Faut-il les retirer, ou sont-ils toujours disponibles ?\n\n`
        : "")
      + (identifiantsLegauxManquants
        ? `5. Vos identifiants légaux (RC, ICE, IF) — nécessaires pour vos factures et contrats.\n\n`
        : "")
      + `Voir mon catalogue : ${dashboardUrl}\n\n`
      + `Le plus simple : répondez à cet e-mail avec ces informations, même en vrac. Nous faisons la saisie.\n\nL'équipe VIT AUTO`,
  };
}
