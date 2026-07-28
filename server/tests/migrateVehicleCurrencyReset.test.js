import { describe, it, expect } from "vitest";
import { resetVehicleCurrency } from "../scripts/migrate-vehicle-currency-reset.mjs";
import Vehicle from "../models/Vehicle.js";
import { createVehicleDoc } from "./helpers/fixtures.js";

describe("resetVehicleCurrency (migration Vehicle.currency)", () => {
  it("dry-run ne modifie rien mais rapporte le compte correct", async () => {
    await createVehicleDoc({ currency: "USD" });
    await createVehicleDoc({ currency: "EUR" }); // choix explicite réel — jamais compté ni touché
    await createVehicleDoc({ currency: null });

    const report = await resetVehicleCurrency({ dryRun: true });
    expect(report.total).toBe(1); // seul le "USD" (ancien défaut de schéma) compte

    const stillUsd = await Vehicle.countDocuments({ currency: "USD" });
    expect(stillUsd).toBe(1); // rien touché en dry-run
  });

  it("en exécution, réinitialise uniquement currency==='USD' à null (jamais un vrai choix comme EUR)", async () => {
    await createVehicleDoc({ currency: "USD" });
    await createVehicleDoc({ currency: "USD" });
    const withRealChoice = await createVehicleDoc({ currency: "EUR" });
    await createVehicleDoc({ currency: null });

    const report = await resetVehicleCurrency({ dryRun: false });
    expect(report.updated).toBe(2);

    const remainingUsd = await Vehicle.countDocuments({ currency: "USD" });
    expect(remainingUsd).toBe(0);
    const reloaded = await Vehicle.findById(withRealChoice._id);
    expect(reloaded.currency).toBe("EUR"); // choix réel préservé, jamais écrasé
  });
});
