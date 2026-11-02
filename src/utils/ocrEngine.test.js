import { describe, it, expect } from "vitest";
import { languesOcrPour } from "./ocrEngine";

describe("OCR du KYC : modèles de langue selon le pays du compte", () => {
  it("une seule langue (≈ 0,7 Mo) pour la majorité des comptes, jamais les quatre modèles d'un coup", () => {
    expect(languesOcrPour("CI")).toBe("fra");
    expect(languesOcrPour("FR")).toBe("fra");
    expect(languesOcrPour("SN")).toBe("fra");
    expect(languesOcrPour(null)).toBe("fra");      // pays non renseigné
    expect(languesOcrPour("ma")).toBe("fra+ara");  // casse indifférente
    expect(languesOcrPour("AE")).toBe("eng+ara");
    expect(languesOcrPour("NG")).toBe("eng");
    expect(languesOcrPour("CN")).toBe("chi_sim+eng");
    for (const p of ["CI", "MA", "AE", "NG", "CN", "FR", ""]) {
      expect(languesOcrPour(p).split("+").length).toBeLessThanOrEqual(2);
    }
  });
});
