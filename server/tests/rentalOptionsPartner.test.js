import { describe, it, expect } from "vitest";
import { resolveRentalOptions, priceRentalOptions } from "../services/rentalOptions.js";
import { DEFAULT_PRICING_CONFIG } from "../config/defaultPricingConfig.js";

// Options supplémentaires accordées aux conditions du partenaire (2026-09-08).
//
// Avant : liste figée, identique pour tous, au tarif global. Un client pouvait
// cocher « chauffeur privé » chez un partenaire qui n'en propose pas — la
// réservation partait, et le désaccord se découvrait à la remise des clés. À
// l'inverse, un partenaire dont le chauffeur coûte réellement plus cher n'avait
// aucun moyen de le dire.
//
// Règle du tri-état, reprise du reste de rentalPolicy : `offered: null` = aucune
// règle partenaire, on retombe sur le catalogue global. Un partenaire qui ne
// configure rien ne voit donc STRICTEMENT rien changer — c'est ce que vérifie
// le premier test, et c'est la condition pour que ce changement soit sans
// risque sur les annonces existantes.

// Aucune PricingConfig n'est enregistrée en test : getConfig() retombe sur
// DEFAULT_PRICING_CONFIG. On lit donc les tarifs à la source plutôt que de
// recopier des nombres qui divergeraient au premier changement de barème.
const TARIFS_GLOBAUX = DEFAULT_PRICING_CONFIG.rentalOptions;

const politique = (rentalOptions) => ({ rentalOptions });

describe("Options de location — conditions du partenaire", () => {

  it("sans aucune règle partenaire, le catalogue global s'applique inchangé", async () => {
    const options = await resolveRentalOptions(null);
    expect(options).toHaveLength(4);
    for (const o of options) {
      expect(o.offered, `${o.id} doit rester proposée`).toBe(true);
      expect(o.pricePerDay).toBe(TARIFS_GLOBAUX[o.id]);
      expect(o.source).toBe("global");
    }
  });

  it("le partenaire peut RETIRER une option qu'il ne propose pas", async () => {
    const options = await resolveRentalOptions(politique({ driver: { offered: false } }));
    const chauffeur = options.find((o) => o.id === "driver");
    expect(chauffeur.offered).toBe(false);
    // Les autres ne bougent pas.
    expect(options.find((o) => o.id === "gps").offered).toBe(true);
  });

  it("le partenaire peut fixer son propre tarif", async () => {
    const options = await resolveRentalOptions(politique({ driver: { offered: true, pricePerDay: 120 } }));
    const chauffeur = options.find((o) => o.id === "driver");
    expect(chauffeur.pricePerDay).toBe(120);
    expect(chauffeur.source).toBe("partenaire");
  });

  it("un tarif partenaire nul ou négatif retombe sur le tarif global", async () => {
    // Une saisie erronée ne doit jamais offrir un service gratuitement.
    for (const mauvais of [0, -50, null, "abc"]) {
      const options = await resolveRentalOptions(politique({ driver: { offered: true, pricePerDay: mauvais } }));
      expect(options.find((o) => o.id === "driver").pricePerDay,
        `pricePerDay=${mauvais} doit retomber sur le tarif global`).toBe(TARIFS_GLOBAUX.driver);
    }
  });

  describe("tarification d'une réservation", () => {
    it("facture le tarif partenaire, multiplié par la durée", async () => {
      const { montant, refusees } = await priceRentalOptions(
        { driver: true, gps: true }, politique({ driver: { offered: true, pricePerDay: 120 } }), 3
      );
      expect(montant).toBe(120 * 3 + TARIFS_GLOBAUX.gps * 3);
      expect(refusees).toEqual([]);
    });

    it("REFUSE une option non proposée, au lieu de l'ignorer en silence", async () => {
      // Point central : alléger la réservation sans rien dire ferait découvrir
      // l'absence de chauffeur à la remise des clés.
      const { refusees } = await priceRentalOptions(
        { driver: true }, politique({ driver: { offered: false } }), 2
      );
      expect(refusees).toEqual(["Chauffeur privé"]);
    });

    it("ignore les options décochées et les identifiants inconnus", async () => {
      const { montant, refusees } = await priceRentalOptions(
        { driver: false, licorne: true }, politique({ driver: { offered: false } }), 2
      );
      expect(montant).toBe(0);
      expect(refusees, "une option décochée ne doit pas être refusée").toEqual([]);
    });

    it("une durée absente ou aberrante compte pour un jour, jamais zéro", async () => {
      for (const duree of [undefined, 0, -3, "deux"]) {
        const { montant } = await priceRentalOptions({ gps: true }, null, duree);
        expect(montant, `durée=${duree}`).toBe(TARIFS_GLOBAUX.gps);
      }
    });
  });
});
