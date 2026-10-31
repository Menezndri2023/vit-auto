import { describe, it, expect } from "vitest";
import translations from "./translations";
import accueil from "./accueil";
import pagesPubliques from "./pagesPubliques";
import services from "./services";
import pourquoi from "./pourquoi";
import chrome from "./chrome";
import faq from "./faq";
import aide from "./aide";
import catalogue from "./catalogue";
import partenaires from "./partenaires";
import importExport from "./importExport";
import logistique from "./logistique";
import { CODES } from "./langueUrl";

// ── Aucune promesse de séquestre, dans aucune langue (exploitant, 2026-10-31) ──
//
// VIT AUTO ne détient ni ne bloque aucun fonds tant qu'un prestataire habilité
// n'est pas validé (docs/import-export-paiement-securise.md). « Paiement
// sécurisé » reste autorisé (décision du 2026-10-31) ; « séquestré », « escrow »,
// « fonds bloqués » et leurs traductions, non. L'accueil a affiché « paiement
// séquestré jusqu'à la remise du véhicule » en cinq langues jusqu'au 31/10.

const MODULES = { translations, accueil, pagesPubliques, services, pourquoi, chrome, faq, aide, catalogue, partenaires, importExport, logistique };

const PROMESSE = /séquestr|sequestr|escrow|entiercement|fonds (bloqués|retenus|conservés)|funds held|held in escrow|حساب ضمان|دفع بضمان|حساب الضمان|حجز المبلغ|pago en depósito|cuenta de depósito|depósito en garantía|款项托管|资金托管|托管账户|托管资金/i;
// « 托管 » seul veut aussi dire « hébergement » (trust.certHosting) : seules ses
// formes financières sont visées.

// Clés qu'aucun écran public n'affiche : libellé d'onglet admin, et fiches du
// service « séquestre » retiré (la page /services/sequestre dit « indisponible »).
const NON_AFFICHEES = /^(admin\.escrow|svc\.escrow\.|wip\.escrow\.)/;

describe("aucune promesse de séquestre dans les textes publics", () => {
  it("aucune clé affichée ne promet un séquestre, dans les cinq langues", () => {
    const trouvees = [];
    for (const [module, cles] of Object.entries(MODULES)) {
      for (const [cle, valeurs] of Object.entries(cles)) {
        if (NON_AFFICHEES.test(cle) || !valeurs || typeof valeurs !== "object") continue;
        for (const langue of CODES) {
          if (PROMESSE.test(String(valeurs[langue] || ""))) trouvees.push(`${module}:${cle} [${langue}]`);
        }
      }
    }
    expect(trouvees).toEqual([]);
  });

  it("l'accueil annonce des modalités précisées avant confirmation, dans les cinq langues", () => {
    for (const langue of CODES) expect(accueil["routecta.desc"][langue]).toBeTruthy();
    expect(accueil["routecta.desc"].fr).toMatch(/précisées avant sa confirmation/);
  });
});
